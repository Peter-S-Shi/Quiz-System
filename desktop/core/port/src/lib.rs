//! The Store Port: a small, runtime-neutral command surface over the Rust durability boundary
//! (ADR 0001 sections 4 and 5.2). The WebView - or, in the Electron contingency, a Node host - holds no
//! SQL and no file-system capability; it sends named commands with JSON arguments and gets a JSON envelope
//! `{"ok":true,"result":...}` / `{"ok":false,"error":{"code","message"}}` back.
//!
//! Commands: `schema.info`, `store.read`, `store.count`, `store.commit`, `store.check_consistency`,
//! `media.ingest_file`, `media.locate`, `media.gc`, `backup.create`, `backup.verify`, `backup.restore`,
//! `snapshots.list`, `snapshots.restore`.

pub mod offline;
pub mod selftest;

use qs_activation as activation;
use qs_archive as archive;
use qs_media::MediaStore;
use qs_platform::identity::{APP_IDENTIFIER, APP_VERSION, PRODUCT_NAME};
use qs_platform::{bail, Code, DataRoot, Error, Result};
use qs_store::foundation::MEDIA_COLLECTION;
use qs_store::{Catalog, OpenOptions, Store};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::Path;
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

pub struct Core {
    store: Mutex<Store>,
    root: DataRoot,
    catalog: Arc<Catalog>,
    media: MediaStore,
    startup: StartupReport,
}

impl Core {
    pub fn open(root: &DataRoot, catalog: Arc<Catalog>, opts: &OpenOptions) -> Result<Core> {
        let store = Store::open(root, catalog.clone(), opts)?;
        let recovered = activation::recover(&store)?
            .into_iter()
            .map(|r| (r.op_id, format!("{:?}", r.resolution).to_lowercase()))
            .collect();
        let quick_check_ok = store.quick_check()?;
        let consistency_problems = if quick_check_ok { store.check_consistency()?.iter().map(|p| p.to_json()).collect() } else { vec![] };
        let upgrade = store.upgrade_notice().map(|u| (u.from, u.to));
        let snapshots_pruned = activation::prune_snapshots(root, SNAPSHOTS_KEPT)?;
        let media = MediaStore::new(root.media_dir());
        let media_gc = if quick_check_ok {
            let r = media.gc(&referenced_hashes(&store)?, MEDIA_GC_SAFETY_DELAY)?;
            (r.removed_temp, r.removed_orphans)
        } else {
            (0, 0)
        };
        Ok(Core {
            store: Mutex::new(store),
            root: root.clone(),
            catalog,
            media,
            startup: StartupReport { recovered, quick_check_ok, consistency_problems, upgrade, snapshots_pruned, media_gc },
        })
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
            bail!(Code::IntegrityFailed, "the store failed its startup integrity check; writes are disabled until it is restored from a snapshot or backup");
        }
        Ok(())
    }

    pub fn call(&self, command: &str, args: &Value) -> Result<Value> {
        let str_arg = |k: &str| -> Result<&str> {
            args.get(k).and_then(Value::as_str).filter(|s| !s.is_empty()).ok_or_else(|| Error::new(Code::RejectShape, format!("'{k}' must be a non-empty string")))
        };
        match command {
            "schema.info" => {
                let s = self.store();
                let i = s.info()?;
                Ok(json!({
                    "product": PRODUCT_NAME,
                    "identifier": APP_IDENTIFIER,
                    "appVersion": APP_VERSION,
                    "dataRoot": self.root.path().display().to_string(),
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
                self.require_healthy()?;
                let st = self.media.put_file(Path::new(str_arg("path")?))?;
                Ok(json!({"hash": st.hash, "size": st.size, "deduplicated": st.deduplicated}))
            }
            "media.locate" => {
                let recs = self.store().read(MEDIA_COLLECTION, &json!({"id": str_arg("id")?}))?;
                let rec = recs.first().ok_or_else(|| Error::new(Code::NotFound, "unknown media id"))?;
                let hash = rec.payload["contentHash"].as_str().unwrap_or_default();
                let size = self.media.size_of(hash)?;
                Ok(json!({"hash": hash, "size": size, "mimeType": rec.payload["mimeType"], "relativePath": format!("data/media/{}/{hash}", &hash[..2])}))
            }
            "media.gc" => {
                let age = args.get("minAgeSeconds").and_then(Value::as_u64).unwrap_or(MEDIA_GC_SAFETY_DELAY.as_secs());
                let s = self.store();
                let r = self.media.gc(&referenced_hashes(&s)?, Duration::from_secs(age))?;
                Ok(json!({"removedTemp": r.removed_temp, "removedOrphans": r.removed_orphans, "keptYoung": r.kept_young}))
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
                Ok(json!({"storeSchemaVersion": m.store_schema_version, "appVersion": m.app_version, "mediaCount": m.media_count, "entries": m.entries.len()}))
            }
            "backup.restore" => {
                let mut s = self.store();
                Ok(archive::restore_archive(&mut s, Path::new(str_arg("path")?))?.to_json())
            }
            "snapshots.list" => Ok(json!({"snapshots": offline::list_snapshots(&self.root)?})),
            "snapshots.restore" => {
                let name = str_arg("name")?;
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

fn referenced_hashes(store: &Store) -> Result<HashSet<String>> {
    let mut st = store.conn().prepare(&format!("SELECT DISTINCT content_hash FROM {MEDIA_COLLECTION}")).map_err(|e| Error::new(Code::Db, e.to_string()))?;
    let v: HashSet<String> = st
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| Error::new(Code::Db, e.to_string()))?
        .collect::<std::result::Result<_, _>>()
        .map_err(|e| Error::new(Code::Db, e.to_string()))?;
    Ok(v)
}
