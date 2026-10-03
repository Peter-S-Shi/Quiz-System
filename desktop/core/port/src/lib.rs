//! The Store Port: a small, runtime-neutral command surface over the Rust durability boundary
//! (ADR 0001 sections 4 and 5.2). The WebView - or, in the Electron contingency, a Node host - holds no
//! SQL and no file-system capability; it sends named commands with JSON arguments and gets a JSON envelope
//! `{"ok":true,"result":...}` / `{"ok":false,"error":{"code","message"}}` back.
//!
//! Commands: `schema.info`, `store.read`, `store.count`, `store.commit`, `store.check_consistency`,
//! `media.ingest_file`, `media.locate`, `media.read`, `backup.create`, `backup.verify`, `backup.restore`,
//! `snapshots.list`, `snapshots.restore`.

pub mod offline;
pub mod selftest;
pub mod webview;

use qs_activation as activation;
use qs_archive as archive;
use qs_media::MediaStore;
use qs_migrate_v1 as migrate;
use qs_platform::identity::{APP_IDENTIFIER, APP_VERSION, PRODUCT_NAME};
use qs_platform::{bail, Code, DataRoot, Error, Result};
use qs_store::foundation::MEDIA_COLLECTION;
use qs_store::{Catalog, OpenOptions, Store};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

/// Orphan media younger than this is never collected (it may belong to an operation that has not committed).
pub const MEDIA_GC_SAFETY_DELAY: Duration = Duration::from_secs(24 * 3600);
const SNAPSHOTS_KEPT: usize = 5;

#[derive(Debug, Clone)]
pub struct StartupReport {
    pub recovered: Vec<(String, String)>,
    pub quick_check_ok: bool,
    pub consistency_problems: Vec<Value>,
    pub upgrade: Option<(i32, i32)>,
    pub snapshots_pruned: usize,
    pub media_gc: (usize, usize),
}
impl StartupReport {
    /// Writes are refused while the store is not healthy (a mismatch is reported, never silently repaired).
    pub fn healthy(&self) -> bool {
        self.quick_check_ok && self.consistency_problems.is_empty()
    }
    pub fn to_json(&self) -> Value {
        json!({
            "healthy": self.healthy(),
            "quickCheckOk": self.quick_check_ok,
            "consistencyProblems": self.consistency_problems.len(),
            "firstProblems": self.consistency_problems.iter().take(20).collect::<Vec<_>>(),
            "recovered": self.recovered.iter().map(|(o, r)| json!({"opId": o, "resolution": r})).collect::<Vec<_>>(),
            "upgrade": self.upgrade.map(|(f, t)| json!({"from": f, "to": t})),
            "snapshotsPruned": self.snapshots_pruned,
            "mediaGc": {"removedTemp": self.media_gc.0, "removedOrphans": self.media_gc.1},
        })
    }
}

/// RAII maintenance gate (ADR 0002 section 15.2): while it is held, every Store Port write and media GC is
/// refused with `STORE_BUSY`; it is released on every exit path (drop), including unwinding.
pub struct WriteGate<'a> {
    flag: &'a AtomicBool,
}
impl Drop for WriteGate<'_> {
    fn drop(&mut self) {
        self.flag.store(false, Ordering::SeqCst);
    }
}

pub struct Core {
    /// The previewed migration waiting for the user's confirmation (the path-free report is what the UI sees).
    pending: Mutex<Option<migrate::Prepared>>,
    gate: AtomicBool,
    store: Mutex<Store>,
    root: DataRoot,
    catalog: Arc<Catalog>,
    media: MediaStore,
    startup: StartupReport,
}

impl Core {
    pub fn open(root: &DataRoot, catalog: Arc<Catalog>, opts: &OpenOptions) -> Result<Core> {
        let store = Store::open(root, catalog.clone(), opts)?;
        let recovered = activation::recover(&store)?.into_iter().map(|r| (r.op_id, format!("{:?}", r.resolution).to_lowercase())).collect();
        let quick_check_ok = store.quick_check()?;
        let consistency_problems = if quick_check_ok {
            let root_s = root.path().display().to_string();
            store
                .check_consistency()?
                .iter()
                .map(|p| {
                    let mut j = p.to_json();
                    if let Some(d) = j["detail"].as_str() {
                        j["detail"] = Value::String(webview::sanitize_message(d, &root_s));
                        // system-generated diagnostic
                    }
                    j
                })
                .collect()
        } else {
            vec![]
        };
        let upgrade = store.upgrade_notice().map(|u| (u.from, u.to));
        let snapshots_pruned = activation::prune_snapshots(root, SNAPSHOTS_KEPT)?;
        let media = MediaStore::new(root.media_dir());
        let media_gc = if quick_check_ok {
            let r = gc_with_fixed_policy(&media, &store)?;
            (r.removed_temp, r.removed_orphans)
        } else {
            (0, 0)
        };
        // nothing can be in flight at startup: staging directories no journal will resolve are leftovers
        migrate::purge_orphan_staging(root);
        Ok(Core {
            pending: Mutex::new(None),
            gate: AtomicBool::new(false),
            store: Mutex::new(store),
            root: root.clone(),
            catalog,
            media,
            startup: StartupReport { recovered, quick_check_ok, consistency_problems, upgrade, snapshots_pruned, media_gc },
        })
    }

    /// Media GC: Rust-owned lifecycle/maintenance only (never a WebView command), always with the fixed
    /// safety delay - callers cannot tune it.
    pub fn maintenance_gc(&self) -> Result<qs_media::GcReport> {
        self.refuse_if_gated()?;
        gc_with_fixed_policy(&self.media, &self.store())
    }

    /// Open the maintenance gate. Fails with `STORE_BUSY` if another gate is already open. The holder performs its
    /// own work through [`Core::with_store`] (which the gate does not block); everything else is refused.
    pub fn write_gate(&self) -> Result<WriteGate<'_>> {
        if self.gate.swap(true, Ordering::SeqCst) {
            bail!(Code::StoreBusy, "another maintenance operation holds the write gate");
        }
        Ok(WriteGate { flag: &self.gate })
    }

    fn refuse_if_gated(&self) -> Result<()> {
        if self.gate.load(Ordering::SeqCst) {
            bail!(Code::StoreBusy, "the store is busy with a maintenance operation; try again shortly");
        }
        Ok(())
    }

    pub fn startup(&self) -> &StartupReport {
        &self.startup
    }
    pub fn root(&self) -> &DataRoot {
        &self.root
    }

    fn store(&self) -> MutexGuard<'_, Store> {
        // a panic while holding the lock rolled its transaction back; continuing is safe
        self.store.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Run a closure with exclusive access to the store (tests and the self-test use this).
    pub fn with_store<T>(&self, f: impl FnOnce(&mut Store) -> T) -> T {
        f(&mut self.store())
    }

    /// Dispatch one command and wrap the outcome in the wire envelope.
    pub fn dispatch(&self, command: &str, args: &Value) -> Value {
        match self.call(command, args) {
            Ok(v) => json!({"ok": true, "result": v}),
            Err(e) => envelope_err(&e),
        }
    }

    fn require_healthy(&self) -> Result<()> {
        if !self.startup.healthy() {
            bail!(
                Code::IntegrityFailed,
                "the store failed its startup integrity check; writes are disabled until it is restored from a snapshot or backup"
            );
        }
        Ok(())
    }

    pub fn call(&self, command: &str, args: &Value) -> Result<Value> {
        let str_arg = |k: &str| -> Result<&str> {
            args.get(k)
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| Error::new(Code::RejectShape, format!("'{k}' must be a non-empty string")))
        };
        match command {
            "schema.info" => {
                let s = self.store();
                let i = s.info()?;
                Ok(json!({
                    "product": PRODUCT_NAME,
                    "identifier": APP_IDENTIFIER,
                    "appVersion": APP_VERSION,
                    "store": {"applicationId": i.application_id, "userVersion": i.user_version, "catalogVersion": i.catalog_version,
                               "createdBy": i.created_by, "lastOpenedBy": i.last_opened_by},
                    "collections": self.catalog.collections().iter().map(|c| c.to_json()).collect::<Vec<_>>(),
                    "startup": self.startup.to_json(),
                }))
            }
            "store.read" => {
                let recs = self.store().read(str_arg("collection")?, args.get("query").unwrap_or(&json!({})))?;
                Ok(json!({"records": recs.iter().map(|r| r.to_json()).collect::<Vec<_>>()}))
            }
            "store.count" => Ok(json!({"count": self.store().count(str_arg("collection")?)?})),
            "store.commit" => {
                self.refuse_if_gated()?;
                self.require_healthy()?;
                let uow = args.get("uow").ok_or_else(|| Error::new(Code::RejectShape, "'uow' is required"))?;
                Ok(self.store().commit(uow)?.to_json())
            }
            "store.check_consistency" => {
                let s = self.store();
                let problems = s.check_consistency()?;
                Ok(json!({"quickCheckOk": s.quick_check()?, "problems": problems.iter().map(|p| p.to_json()).collect::<Vec<_>>()}))
            }
            "media.ingest_file" => {
                self.refuse_if_gated()?;
                self.require_healthy()?;
                let st = self.media.put_file(Path::new(str_arg("path")?))?;
                Ok(json!({"hash": st.hash, "size": st.size, "deduplicated": st.deduplicated}))
            }
            "media.locate" => {
                let recs = self.store().read(MEDIA_COLLECTION, &json!({"id": str_arg("id")?}))?;
                let rec = recs.first().ok_or_else(|| Error::new(Code::NotFound, "unknown media id"))?;
                let hash = rec.payload["contentHash"].as_str().unwrap_or_default();
                let size = self.media.size_of(hash)?;
                Ok(json!({"hash": hash, "size": size, "mimeType": rec.payload["mimeType"]}))
            }
            "media.put" => {
                // Bytes from the WebView (a portable-paper asset, a pasted image) into the content-addressed store,
                // registered in ONE Unit of Work. The mime type must be a supported image / audio type.
                self.refuse_if_gated()?;
                self.require_healthy()?;
                let (name, mime) = (str_arg("name")?, str_arg("mimeType")?);
                if !MEDIA_PUT_MIMES.contains(&mime) {
                    bail!(Code::RejectShape, "unsupported media type '{mime}'");
                }
                let bytes = base64_decode(str_arg("data")?)?;
                if bytes.len() as u64 > MEDIA_PUT_MAX {
                    bail!(Code::RejectShape, "the media object is too large");
                }
                let st = self.media.put_bytes(&bytes)?;
                let id = format!("media-{}", &st.hash[..16]);
                let exists = !self.store().read(MEDIA_COLLECTION, &json!({"id": id}))?.is_empty();
                if !exists {
                    let uow = json!({"ops": [{"op": "put", "collection": MEDIA_COLLECTION, "id": id,
                        "payload": {"id": id, "contentHash": st.hash, "size": st.size, "mimeType": mime, "name": name},
                        "proj": {"columns": {"content_hash": st.hash, "size": st.size, "mime": mime, "name": name}, "relations": {}}}]});
                    self.store().commit(&uow)?;
                }
                Ok(json!({"id": id, "hash": st.hash, "size": st.size, "mimeType": mime, "name": name, "deduplicated": exists}))
            }
            "media.read" => {
                // Bounded, path-free byte access to one media object for the WebView (images / audio are rendered from
                // blob URLs built out of these chunks). At most MEDIA_READ_MAX bytes per call.
                let uint = |k: &str| -> Result<u64> {
                    args.get(k).and_then(Value::as_u64).ok_or_else(|| Error::new(Code::RejectShape, format!("'{k}' must be a non-negative integer")))
                };
                let (offset, want) = (uint("offset")?, uint("length")?.min(MEDIA_READ_MAX));
                let recs = self.store().read(MEDIA_COLLECTION, &json!({"id": str_arg("id")?}))?;
                let rec = recs.first().ok_or_else(|| Error::new(Code::NotFound, "unknown media id"))?;
                let hash = rec.payload["contentHash"].as_str().unwrap_or_default();
                let size = self.media.size_of(hash)?;
                let mut buf = Vec::new();
                if offset < size {
                    use std::io::{Read, Seek, SeekFrom};
                    let mut f = self.media.open(hash)?;
                    f.seek(SeekFrom::Start(offset)).map_err(|e| Error::new(Code::Io, e.to_string()))?;
                    f.take(want.min(size - offset)).read_to_end(&mut buf).map_err(|e| Error::new(Code::Io, e.to_string()))?;
                }
                let end = offset + buf.len() as u64;
                Ok(json!({"offset": offset, "length": buf.len(), "size": size, "eof": end >= size, "data": base64_encode(&buf)}))
            }
            "backup.create" => {
                let dest = Path::new(str_arg("dest")?);
                let op = activation::new_operation_id();
                let handle = {
                    let s = self.store(); // held only for the consistent snapshot
                    archive::snapshot_for_archive(&s, &op)?
                };
                let r = archive::write_archive(&handle, &self.media, dest);
                handle.discard();
                Ok(r?.to_json())
            }
            "backup.verify" => {
                let m = archive::verify_archive(Path::new(str_arg("path")?), self.catalog.schema_version())?;
                Ok(
                    json!({"storeSchemaVersion": m.store_schema_version, "appVersion": m.app_version, "mediaCount": m.media_count, "entries": m.entries.len()}),
                )
            }
            "backup.restore" => {
                self.refuse_if_gated()?;
                let mut s = self.store();
                Ok(archive::restore_archive(&mut s, Path::new(str_arg("path")?))?.to_json())
            }
            "migration.prepare" => {
                self.refuse_if_gated()?;
                self.require_healthy()?;
                let source = str_arg("source")?;
                let artifact = args.get("artifact").and_then(Value::as_str).filter(|s| !s.is_empty());
                let p = migrate::prepare(self, Path::new(source), artifact.map(Path::new), &migrate::PrepareOptions::default())?;
                let out = json!({"report": p.report, "reportHash": p.report_hash, "blocked": p.blocked, "alreadyMigrated": p.already_migrated, "sourceId": p.source_id});
                let previous = self.pending.lock().unwrap_or_else(|e| e.into_inner()).take();
                if let Some(old) = previous {
                    old.discard();
                }
                if p.blocked || p.already_migrated {
                    p.discard();
                } else {
                    *self.pending.lock().unwrap_or_else(|e| e.into_inner()) = Some(p);
                }
                Ok(out)
            }
            "migration.status" => {
                let mut v = migrate::status(self)?;
                let pending = self.pending.lock().unwrap_or_else(|e| e.into_inner());
                v["pending"] = match pending.as_ref() {
                    Some(p) => json!({"report": p.report, "reportHash": p.report_hash, "sourceId": p.source_id}),
                    None => Value::Null,
                };
                Ok(v)
            }
            "migration.confirm" => {
                self.require_healthy()?;
                let hash = str_arg("reportHash")?;
                let p = self.pending.lock().unwrap_or_else(|e| e.into_inner()).take();
                let Some(p) = p else { bail!(Code::NotFound, "no migration preview is waiting for confirmation") };
                match migrate::activate(self, &p, hash) {
                    Ok(migrate::Activation::Done(d)) => Ok(json!({"result": "done", "runOpId": d.run_op_id, "counts": d.counts})),
                    Ok(migrate::Activation::AlreadyMigrated { run_op_id }) => {
                        p.discard();
                        Ok(json!({"result": "already-migrated", "runOpId": run_op_id}))
                    }
                    Err(e) => {
                        if e.code == Code::RejectPrecondition || e.code == Code::StoreBusy {
                            *self.pending.lock().unwrap_or_else(|x| x.into_inner()) = Some(p);
                        // the preview is still valid
                        } else {
                            p.discard();
                        }
                        Err(e)
                    }
                }
            }
            "migration.cancel" => {
                if let Some(p) = self.pending.lock().unwrap_or_else(|e| e.into_inner()).take() {
                    p.discard();
                }
                Ok(json!({"cancelled": true}))
            }
            "migration.undo" => match migrate::undo(self, str_arg("runOpId")?)? {
                migrate::UndoOutcome::Done { undo_op_id, records_deleted } => {
                    Ok(json!({"result": "done", "undoOpId": undo_op_id, "recordsDeleted": records_deleted}))
                }
                migrate::UndoOutcome::Refused { reasons } => Ok(json!({"result": "refused", "reasons": reasons})),
            },
            "snapshots.list" => Ok(json!({"snapshots": offline::list_snapshots(&self.root)?})),
            "snapshots.restore" => {
                let name = str_arg("name")?;
                self.refuse_if_gated()?;
                let path = offline::snapshot_path(&self.root, name)?;
                let mut s = self.store();
                Ok(activation::restore_snapshot(&mut s, &path, &activation::new_operation_id(), "snapshot-restore")?.to_json())
            }
            other => bail!(Code::RejectShape, "unknown command '{other}'"),
        }
    }
}

pub fn envelope_err(e: &Error) -> Value {
    json!({"ok": false, "error": {"code": e.code.as_str(), "message": e.message}})
}

fn gc_with_fixed_policy(media: &MediaStore, store: &Store) -> Result<qs_media::GcReport> {
    media.gc(&referenced_hashes(store)?, MEDIA_GC_SAFETY_DELAY)
}

fn referenced_hashes(store: &Store) -> Result<HashSet<String>> {
    let mut st = store
        .conn()
        .prepare(&format!("SELECT DISTINCT content_hash FROM {MEDIA_COLLECTION}"))
        .map_err(|e| Error::new(Code::Db, e.to_string()))?;
    let v: HashSet<String> = st
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| Error::new(Code::Db, e.to_string()))?
        .collect::<std::result::Result<_, _>>()
        .map_err(|e| Error::new(Code::Db, e.to_string()))?;
    Ok(v)
}

impl migrate::Host for Core {
    type Gate<'a> = WriteGate<'a>;
    fn root(&self) -> &DataRoot {
        &self.root
    }
    fn catalog(&self) -> Arc<Catalog> {
        self.catalog.clone()
    }
    fn with_store<T>(&self, f: impl FnOnce(&mut Store) -> T) -> T {
        Core::with_store(self, f)
    }
    fn write_gate(&self) -> Result<WriteGate<'_>> {
        Core::write_gate(self)
    }
}

/// Largest decoded object `media.put` accepts, and the media types it stores.
pub const MEDIA_PUT_MAX: u64 = 24 << 20;
pub const MEDIA_PUT_MIMES: &[&str] = &[
    "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm", "audio/aac", "audio/m4a", "audio/mp4", "audio/flac",
];

/// Largest chunk one `media.read` returns.
pub const MEDIA_READ_MAX: u64 = 1 << 20;

fn base64_encode(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = (u32::from(c[0]) << 16) | (u32::from(*c.get(1).unwrap_or(&0)) << 8) | u32::from(*c.get(2).unwrap_or(&0));
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

fn base64_decode(s: &str) -> Result<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let (mut acc, mut bits) = (0u32, 0u32);
    let body = s.trim_end_matches('=');
    if body.is_empty() || s.len() % 4 != 0 {
        bail!(Code::RejectShape, "'data' is not valid base64");
    }
    for ch in body.bytes() {
        let v = match ch {
            b'A'..=b'Z' => ch - b'A',
            b'a'..=b'z' => ch - b'a' + 26,
            b'0'..=b'9' => ch - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => bail!(Code::RejectShape, "'data' is not valid base64"),
        };
        acc = (acc << 6) | u32::from(v);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Ok(out)
}
