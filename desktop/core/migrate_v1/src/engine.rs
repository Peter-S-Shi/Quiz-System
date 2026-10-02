//! The migration lifecycle (ADR 0002 section 4): intake with copy-in, detection, validation, staging, semantic
//! audit, preview/report, confirmation, additive activation through the foundation primitive, post-verify,
//! undo. The user's file is read once (P1); after that the staged copy (identified by `sourceId`) is the only
//! authority for the attempt.

use crate::catalog::*;
use crate::diag::{Diags, STAGE_ORDER};
use crate::model::{self, Model};
use crate::reader::{read_source, ReaderOptions, DEFAULT_NONMEDIA_LIMIT};
use crate::stage::{self, Disposition, LedgerEntry, OriginCtx, PlanRow};
use crate::verify::{verify, VerifyInput};
use qs_activation::{self as activation, Guard, MergePolicy, Mode, Options};
use qs_media::MediaStore;
use qs_platform::{bail, fault, fsx, Code, DataRoot, Error, Result};
use qs_store::foundation::MEDIA_COLLECTION;
use qs_store::{canon, Catalog, Store};
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// What the engine needs from the process that owns the store (implemented by `qs_port::Core` and by the
/// standalone host used in tests and scenarios). The write gate must refuse Store Port writes and media GC
/// while the returned guard lives (ADR 0002 section 15.2).
pub trait Host {
    type Gate<'a>
    where
        Self: 'a;
    fn root(&self) -> &DataRoot;
    fn catalog(&self) -> Arc<Catalog>;
    fn with_store<T>(&self, f: impl FnOnce(&mut Store) -> T) -> T;
    fn write_gate(&self) -> Result<Self::Gate<'_>>;
}

#[derive(Debug, Clone)]
pub struct PrepareOptions {
    pub nonmedia_limit: u64,
    pub app_version: String,
    /// Test hook for the pre-flight free-space check (production leaves it `None`).
    pub free_space_override: Option<u64>,
}
impl Default for PrepareOptions {
    fn default() -> Self {
        PrepareOptions {
            nonmedia_limit: DEFAULT_NONMEDIA_LIMIT,
            app_version: qs_platform::identity::APP_VERSION.to_string(),
            free_space_override: None,
        }
    }
}

const ARTIFACT_LIMIT: u64 = 64 * 1024 * 1024;
const NOT_MIGRATED: &[&str] = &["preferences-and-language", "active-sessions", "active-paper-selection", "caches", "legacy-keys-s2-s13"];

struct StagedBlob {
    hash: String,
    tmp: PathBuf,
    size: u64,
}

struct ArtifactIn {
    hash: String,
    size: u64,
    file: PathBuf,
    row: Value,
}

pub struct Prepared {
    pub op_id: String,
    pub source_id: String,
    pub recovery_id: Option<String>,
    pub report: Value,
    pub report_hash: String,
    pub blocked: bool,
    pub already_migrated: bool,
    stage_dir: PathBuf,
    stage_root: DataRoot,
    catalog: Arc<Catalog>,
    blobs: Vec<StagedBlob>,
    artifact: Option<ArtifactIn>,
    ledger: Vec<LedgerEntry>,
    envelope: Value,
    counts: Value,
    source_copy: PathBuf,
    source_bytes: u64,
    app_version: String,
}

impl Prepared {
    /// Throw the attempt away (the user cancelled, or the process is shutting down). Nothing live was touched.
    pub fn discard(self) {
        fsx::remove_dir_all_quiet(&self.stage_dir);
    }
    pub fn staging_dir(&self) -> &Path {
        &self.stage_dir
    }
    /// Path of the isolated staging store (tests corrupt it to prove the verifier would notice a defect).
    pub fn staging_db(&self) -> PathBuf {
        self.stage_root.db_path()
    }
    /// The Disposition Ledger as JSON.
    pub fn ledger_json(&self) -> Value {
        Value::Array(self.ledger.iter().map(LedgerEntry::to_json).collect())
    }
    /// Re-run the conservation verifier against the staging store and the staged source copy.
    pub fn reverify(&self) -> Result<Vec<String>> {
        let reread = read_source(
            &self.source_copy,
            &ReaderOptions { nonmedia_limit: u64::MAX, media_dir: self.stage_dir.join("media"), discard_media: true },
        )?;
        let Some(root) = reread.root.as_ref() else { return Ok(vec!["C-10: the staged source copy could not be re-read".into()]) };
        let by_hash: BTreeMap<String, PathBuf> = self.blobs.iter().map(|b| (b.hash.clone(), b.tmp.clone())).collect();
        let conn = Connection::open_with_flags(fsx::sqlite_path(&self.stage_root.db_path())?, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| Error::new(Code::Db, e.to_string()))?;
        Ok(verify(&VerifyInput {
            conn: &conn,
            catalog: &self.catalog,
            root,
            blobs: &reread.media,
            ledger: &self.ledger,
            source_id: &self.source_id,
            run_op_id: None,
            blob_file: &|h| by_hash.get(h).cloned(),
            envelope: &self.envelope,
            staging: true,
        }))
    }
}

#[derive(Debug, Clone)]
pub struct Activated {
    pub run_op_id: String,
    pub report_hash: String,
    pub counts: Value,
}

#[derive(Debug, Clone)]
pub enum Activation {
    Done(Activated),
    /// The same source is already imported (and not undone): nothing was written.
    AlreadyMigrated {
        run_op_id: String,
    },
}

#[derive(Debug, Clone)]
pub enum UndoOutcome {
    Done { undo_op_id: String, records_deleted: usize },
    Refused { reasons: Vec<Value> },
}

// ------------------------------------------------------------------------------------------------ helpers

/// `YYYY-MM-DDTHH:MM:SSZ` for operational metadata (never substituted into a record timestamp, D-10).
pub fn now_rfc3339() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, (rem % 3600) / 60, rem % 60)
}

fn stage_index(stage: &str) -> usize {
    STAGE_ORDER.iter().position(|s| *s == stage).unwrap_or(STAGE_ORDER.len())
}

/// "A failing stage stops later stages": keep the diagnostics of every stage up to and including the first
/// stage that has a blocking problem.
fn trim_to_first_failing_stage(d: &mut Diags) {
    let first = d.list.iter().filter(|x| x.is_blocking()).map(|x| stage_index(x.stage)).min();
    if let Some(f) = first {
        d.list.retain(|x| stage_index(x.stage) <= f);
    }
}

fn copy_in(src: &Path, dest: &Path) -> std::io::Result<(String, u64)> {
    let mut r = std::io::BufReader::with_capacity(1 << 20, File::open(src)?);
    let mut w = File::create(dest)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    let mut n = 0u64;
    loop {
        let k = r.read(&mut buf)?;
        if k == 0 {
            break;
        }
        h.update(&buf[..k]);
        w.write_all(&buf[..k])?;
        n += k as u64;
    }
    w.sync_all()?;
    Ok((hex::encode(h.finalize()), n))
}

fn is_disk_full(e: &std::io::Error) -> bool {
    e.raw_os_error() == Some(112) || e.raw_os_error() == Some(28) || e.kind() == std::io::ErrorKind::StorageFull
}

fn recognize_artifact(bytes: &[u8]) -> Option<Value> {
    let parse_from = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) { &bytes[3..] } else { bytes }; // a BOM added by an editor is tolerated for recognition only
    let v: Value = serde_json::from_slice(parse_from).ok()?;
    let o = v.as_object()?;
    if o.get("schemaVersion") != Some(&json!(1)) || o.get("sourceKey") != Some(&json!("quiz-studio-library-v1")) {
        return None;
    }
    let raw = o.get("rawValue")?.as_str()?;
    let (reason, preserved) = (o.get("reason")?.as_str()?, o.get("preservedAt")?.as_str()?);
    Some(json!({
        "size": bytes.len(),
        "reason": reason,
        "preservedAt": preserved,
        "sourceKey": "quiz-studio-library-v1",
        "rawValueBytes": raw.len(),
        "rawValueParses": serde_json::from_str::<Value>(raw).is_ok(),
    }))
}

fn active_run_for<H: Host>(host: &H, source_id: &str) -> Result<Option<String>> {
    host.with_store(|s| {
        let r: rusqlite::Result<String> = s.conn().query_row(
            "SELECT r.id FROM migration_run r WHERE r.source_id=?1 AND NOT EXISTS (SELECT 1 FROM migration_undo u WHERE u.undoes=r.id) ORDER BY r.id LIMIT 1",
            [source_id],
            |x| x.get(0),
        );
        match r {
            Ok(id) => Ok(Some(id)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(Error::new(Code::Db, e.to_string())),
        }
    })
}

fn report_hash(report: &Value) -> String {
    hex::encode(Sha256::digest(canon::canonical(report).as_bytes()))
}

#[allow(clippy::too_many_arguments)]
fn build_report(
    source_id: &str,
    source_name: &str,
    source_bytes: u64,
    recovery: Option<&ArtifactIn>,
    d: &Diags,
    m: Option<&Model>,
    rows: &[PlanRow],
    ledger: &[LedgerEntry],
    live: (usize, usize),
) -> Value {
    let counts = stage::counts(ledger);
    let mut gaps: BTreeMap<String, u64> = BTreeMap::new();
    for r in rows {
        for g in &r.gaps {
            let key = if g.starts_with("timestamp.absent:") { "timestamp.absent".to_string() } else { g.clone() };
            *gaps.entry(key).or_default() += 1;
        }
    }
    let media = m.map(|m| {
        json!({
            "assets": m.assets.len() + m.unreferenced.len(),
            "referenced": m.assets.len(),
            "unreferencedNotMigrated": m.unreferenced.len(),
            "decodedBytes": m.assets.iter().map(|a| a.size).sum::<u64>(),
        })
    });
    json!({
        "report": 1,
        "sourceId": source_id,
        "sourceName": source_name,
        "sourceBytes": source_bytes,
        "classification": m.map(|m| m.classification.clone()).unwrap_or(Value::Null),
        "counts": counts,
        "media": media,
        "diagnostics": d.to_json(),
        "blocking": d.blocking_count(),
        "reportable": d.list.len() - d.blocking_count(),
        "blocked": d.blocking_count() > 0,
        "loss": {
            "gaps": gaps,
            "unknownFields": m.map(|m| json!(m.unknown_fields)).unwrap_or(Value::Null),
            "timestampsAbsent": m.map(|m| json!(m.timestamps_absent)).unwrap_or(Value::Null),
            "historyCapPossible": m.map(|m| m.history_cap_possible).unwrap_or(false),
            "notMigrated": NOT_MIGRATED,
        },
        "recoveryArtifact": recovery.map(|a| json!({"sha256": a.hash, "size": a.size, "reason": a.row["reason"], "preservedAt": a.row["preservedAt"],
            "rawValueParses": a.row["rawValueParses"], "statement": "preserved byte-for-byte; never activated as canonical data"})),
        "plan": {"mode": "merge-keep-existing", "snapshotBeforeActivation": true, "undo": "targeted-inverse", "liveIdentical": live.0, "liveConflicts": live.1},
    })
}

#[allow(clippy::too_many_arguments)]
fn finish_blocked(
    stage_dir: &Path,
    op_id: String,
    source_id: String,
    recovery_id: Option<String>,
    source_name: &str,
    source_bytes: u64,
    mut d: Diags,
    m: Option<&Model>,
    catalog: Arc<Catalog>,
    app_version: String,
) -> Prepared {
    trim_to_first_failing_stage(&mut d);
    let report = build_report(&source_id, source_name, source_bytes, None, &d, m, &[], &[], (0, 0));
    let h = report_hash(&report);
    fsx::remove_dir_all_quiet(stage_dir);
    Prepared {
        op_id,
        source_id,
        recovery_id,
        report,
        report_hash: h,
        blocked: true,
        already_migrated: false,
        stage_dir: stage_dir.to_path_buf(),
        stage_root: DataRoot::at(stage_dir.join("s")),
        catalog,
        blobs: vec![],
        artifact: None,
        ledger: vec![],
        envelope: Value::Null,
        counts: Value::Null,
        source_copy: PathBuf::new(),
        source_bytes,
        app_version,
    }
}

// ----------------------------------------------------------------------------------------------- prepare

/// P0-P7: everything up to the preview. Never touches the live store or the live media store (it only reads
/// the live store to reconcile). A blocked result carries the report and no staging.
pub fn prepare<H: Host>(host: &H, source: &Path, artifact: Option<&Path>, opts: &PrepareOptions) -> Result<Prepared> {
    let root = host.root().clone();
    let catalog = host.catalog();
    let op_id = activation::new_operation_id();
    let stage_dir = root.staging_dir().join(&op_id);
    fs::create_dir_all(&stage_dir)?;
    let source_name = source.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mut d = Diags::default();
    let blocked = |d: Diags, sid: String, rid: Option<String>, bytes: u64, m: Option<&Model>| {
        finish_blocked(&stage_dir, op_id.clone(), sid, rid, &source_name, bytes, d, m, catalog.clone(), opts.app_version.clone())
    };

    // ---- P1 intake: pre-flight, then copy-in while hashing
    let src_len = match fs::metadata(source) {
        Ok(md) if md.is_file() => md.len(),
        _ => {
            d.add("MIG_SOURCE_UNREADABLE", None, json!({"reason": "the selected file cannot be read"}));
            return Ok(blocked(d, String::new(), None, 0, None));
        }
    };
    let need = src_len.saturating_mul(2).saturating_add(64 << 20);
    if opts.free_space_override.unwrap_or_else(|| fsx::free_space(&stage_dir)) < need {
        d.add("MIG_INSUFFICIENT_SPACE", None, json!({"requiredBytes": need}));
        return Ok(blocked(d, String::new(), None, src_len, None));
    }
    let source_copy = stage_dir.join("source.bin");
    let (sha, source_bytes) = match copy_in(source, &source_copy) {
        Ok(x) => x,
        Err(e) if is_disk_full(&e) => {
            d.add("MIG_INSUFFICIENT_SPACE", None, json!({"requiredBytes": need}));
            return Ok(blocked(d, String::new(), None, src_len, None));
        }
        Err(_) => {
            d.add("MIG_SOURCE_UNREADABLE", None, json!({"reason": "reading the selected file failed"}));
            return Ok(blocked(d, String::new(), None, src_len, None));
        }
    };
    let source_id = format!("v1-src-{sha}");
    fault::point("mig-after-intake");

    // ---- container sniff (section 5, stage 1): a ZIP is a V2 archive - route the user to Restore
    let mut head = [0u8; 4];
    if let Ok(mut f) = File::open(&source_copy) {
        let n = f.read(&mut head).unwrap_or(0);
        if n == 4 && (head == [0x50, 0x4B, 0x03, 0x04] || head == [0x50, 0x4B, 0x05, 0x06]) {
            d.add("MIG_SOURCE_WRONG_KIND", None, json!({"kind": "v2-archive", "hint": "use Restore from backup for a V2 archive"}));
            return Ok(blocked(d, source_id, None, source_bytes, None));
        }
    }

    // ---- optional recovery artifact input (D-4): byte-for-byte, recognized or the run is blocked
    let mut artifact_in: Option<ArtifactIn> = None;
    let mut recovery_id = None;
    if let Some(ap) = artifact {
        let len = fs::metadata(ap).map(|m| m.len()).unwrap_or(u64::MAX);
        let bytes = if len > ARTIFACT_LIMIT { None } else { fs::read(ap).ok() };
        match bytes.as_deref().and_then(|b| recognize_artifact(b).map(|row| (b, row))) {
            Some((b, mut row)) => {
                let h = hex::encode(Sha256::digest(b));
                row["id"] = json!(h);
                let file = stage_dir.join("artifact.bin");
                fs::write(&file, b)?;
                recovery_id = Some(h.clone());
                artifact_in = Some(ArtifactIn { hash: h, size: b.len() as u64, file, row });
            }
            None => {
                d.add("MIG_RECOVERY_ARTIFACT_UNRECOGNIZED", None, json!({"reason": "not a V1 library recovery artifact (or unreadable)"}));
                return Ok(blocked(d, source_id, None, source_bytes, None));
            }
        }
    }

    // ---- idempotence: the same bytes already imported is a no-op
    if let Some(run) = active_run_for(host, &source_id)? {
        d.add("MIG_ALREADY_MIGRATED", None, json!({"runOpId": run}));
        let mut p = blocked(d, source_id, recovery_id, source_bytes, None);
        p.blocked = false;
        p.already_migrated = true;
        p.report["blocked"] = json!(false);
        p.report_hash = report_hash(&p.report);
        return Ok(p);
    }

    // ---- P2/P3: lossless read, detection, validation
    let media_dir = stage_dir.join("media");
    let ropts = ReaderOptions { nonmedia_limit: opts.nonmedia_limit, media_dir: media_dir.clone(), discard_media: false };
    let read = read_source(&source_copy, &ropts)?;
    d.extend(read.diags);
    if d.blocking_count() > 0 || read.root.is_none() {
        return Ok(blocked(d, source_id, recovery_id, source_bytes, None));
    }
    let root = read.root.unwrap();
    let Some(mut m) = model::detect(&root, &read.media, &mut d) else {
        return Ok(blocked(d, source_id, recovery_id, source_bytes, None));
    };
    model::validate_references(&mut m, &mut d);
    if d.blocking_count() > 0 {
        return Ok(blocked(d, source_id, recovery_id, source_bytes, Some(&m)));
    }
    model::validate_media(&mut m, &root, &mut d);
    if d.blocking_count() > 0 {
        return Ok(blocked(d, source_id, recovery_id, source_bytes, Some(&m)));
    }
    model::validate_anchors(&m, &mut d);
    model::classify_history(&mut m, &root, &mut d);
    if d.blocking_count() > 0 {
        return Ok(blocked(d, source_id, recovery_id, source_bytes, Some(&m)));
    }

    // ---- P5/P6: plan, reconcile with the live store, stage
    let mut rows = stage::plan(&m, &source_id);
    host.with_store(|s| stage::reconcile_live(s.conn(), &mut rows, &mut d))?;
    let live = (
        rows.iter().filter(|r| r.disposition == Disposition::DeduplicatedIdentical).count(),
        d.list.iter().filter(|x| x.code == "MIG_LIVE_CONFLICT").count(),
    );
    if d.blocking_count() > 0 {
        return Ok(blocked(d, source_id, recovery_id, source_bytes, Some(&m)));
    }
    let ledger = stage::ledger(&m, &rows);
    let stage_root = DataRoot::at(stage_dir.join("s"));
    let ctx = OriginCtx { source_id: &source_id, op_id: &op_id };
    let extra: Vec<(&'static str, String, Value)> = artifact_in.iter().map(|a| (ARTIFACT, a.hash.clone(), a.row.clone())).collect();
    if let Err(e) = stage::write_staging(&stage_root, &catalog, &rows, &ctx, &extra) {
        d.add("MIG_STAGING_INVALID", None, json!({"code": e.code.as_str(), "reason": e.message}));
        return Ok(blocked(d, source_id, recovery_id, source_bytes, Some(&m)));
    }
    fault::point("mig-after-staging");

    // ---- semantic audit: conservation proof against the staged store, independent of the mapper
    let blobs: Vec<StagedBlob> =
        m.assets.iter().filter_map(|a| a.blob_tmp.clone().map(|t| StagedBlob { hash: a.sha256.clone(), tmp: t, size: a.size })).collect();
    let by_hash: BTreeMap<String, PathBuf> = blobs.iter().map(|b| (b.hash.clone(), b.tmp.clone())).collect();
    let reread = read_source(
        &source_copy,
        &ReaderOptions { nonmedia_limit: opts.nonmedia_limit, media_dir: media_dir.clone(), discard_media: true },
    )?;
    let mut problems: Vec<String> = vec![];
    match (&reread.root, fsx::sha256_file(&source_copy)) {
        (Some(r2), Ok(h)) => {
            if h != sha {
                problems.push("C-10: the staged source copy no longer hashes to the source id".into());
            }
            let conn = Connection::open_with_flags(fsx::sqlite_path(&stage_root.db_path())?, OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(|e| Error::new(Code::Db, e.to_string()))?;
            problems.extend(verify(&VerifyInput {
                conn: &conn,
                catalog: &catalog,
                root: r2,
                blobs: &reread.media,
                ledger: &ledger,
                source_id: &source_id,
                run_op_id: None,
                blob_file: &|h| by_hash.get(h).cloned(),
                envelope: &m.envelope,
                staging: true,
            }));
        }
        _ => problems.push("C-10: the staged source copy could not be re-read".into()),
    }
    for p in problems.iter().take(50) {
        d.add("MIG_LEDGER_INCOMPLETE", None, json!({"reason": p}));
    }
    if !problems.is_empty() {
        return Ok(blocked(d, source_id, recovery_id, source_bytes, Some(&m)));
    }

    // ---- P7: preview report (deterministic: no operation id, no time)
    if artifact_in.is_some() {
        d.add("MIG_RECOVERY_ARTIFACT_PRESERVED", None, json!({"sha256": recovery_id}));
    }
    let report_gaps = {
        let mut n = 0u64;
        for r in &rows {
            n += r.gaps.len() as u64;
        }
        n
    };
    if report_gaps > 0 {
        d.add("MIG_GAPS_DECLARED", None, json!({"count": report_gaps}));
    }
    if !m.unknown_fields.is_empty() {
        d.add("MIG_UNKNOWN_FIELD_PRESERVED", None, json!({"byPathClass": m.unknown_fields}));
    }
    if !m.residue.is_empty() {
        d.add(
            "MIG_RESIDUE_PRESERVED",
            None,
            json!({"count": m.residue.len(), "pointers": m.residue.iter().map(|(p, _)| p).collect::<Vec<_>>()}),
        );
    }
    if !m.timestamps_absent.is_empty() {
        d.add("MIG_TIMESTAMP_ABSENT", None, json!({"byField": m.timestamps_absent}));
    }
    let report = build_report(&source_id, &source_name, source_bytes, artifact_in.as_ref(), &d, Some(&m), &rows, &ledger, live);
    let h = report_hash(&report);
    fs::write(stage_dir.join("report.json"), serde_json::to_vec_pretty(&report).map_err(|e| Error::new(Code::Internal, e.to_string()))?)?;
    fs::write(
        stage_dir.join("ledger.json"),
        serde_json::to_vec(&Value::Array(ledger.iter().map(LedgerEntry::to_json).collect()))
            .map_err(|e| Error::new(Code::Internal, e.to_string()))?,
    )?;
    fault::point("mig-after-report");
    let counts = report["counts"].clone();
    Ok(Prepared {
        op_id,
        source_id,
        recovery_id,
        report,
        report_hash: h,
        blocked: false,
        already_migrated: false,
        stage_dir,
        stage_root,
        catalog,
        blobs,
        artifact: artifact_in,
        ledger,
        envelope: m.envelope.clone(),
        counts,
        source_copy,
        source_bytes,
        app_version: opts.app_version.clone(),
    })
}

// ---------------------------------------------------------------------------------------------- activate

fn publish_artifact(root: &DataRoot, a: &ArtifactIn) -> Result<()> {
    let dir = root.recovery_artifacts_dir();
    fs::create_dir_all(&dir)?;
    let dest = dir.join(format!("{}.artifact", a.hash));
    if dest.is_file() {
        if fsx::sha256_file(&dest)? == a.hash {
            return Ok(());
        }
        bail!(Code::MediaHashMismatch, "a different file already exists at the recovery artifact's content address");
    }
    let tmp = fsx::temp_sibling(&dest);
    fs::copy(&a.file, &tmp)?;
    File::options().write(true).open(&tmp)?.sync_all()?;
    if fsx::sha256_file(&tmp)? != a.hash {
        let _ = fs::remove_file(&tmp);
        bail!(Code::MediaHashMismatch, "the staged recovery artifact changed");
    }
    fsx::rename_retry(&tmp, &dest)
}

/// P8-P10: confirm the exact preview, publish media and the artifact, run the additive activation with the
/// commit guard, then post-verify (automatic undo on failure).
pub fn activate<H: Host>(host: &H, p: &Prepared, confirmed_report_hash: &str) -> Result<Activation> {
    if p.blocked {
        bail!(Code::ValidationFailed, "a blocked preview cannot be activated");
    }
    if p.already_migrated {
        bail!(Code::ValidationFailed, "this source is already migrated; nothing to activate");
    }
    if confirmed_report_hash != p.report_hash {
        bail!(Code::RejectPrecondition, "the confirmation does not match this preview");
    }
    let root = host.root().clone();
    let _gate = host.write_gate()?;
    if let Some(run) = active_run_for(host, &p.source_id)? {
        return Ok(Activation::AlreadyMigrated { run_op_id: run });
    }

    // the run record (operational metadata, written into the staging store so it commits atomically)
    let mut run = Map::new();
    run.insert("opId".into(), json!(p.op_id));
    run.insert("sourceId".into(), json!(p.source_id));
    if let Some(r) = &p.recovery_id {
        run.insert("recoveryId".into(), json!(r));
    }
    run.insert("mappingVersion".into(), json!(stage::MAPPING_VERSION));
    run.insert("reportHash".into(), json!(p.report_hash));
    run.insert("counts".into(), p.counts.clone());
    run.insert("source".into(), json!({"envelope": p.envelope, "bytes": p.source_bytes}));
    run.insert("activatedAt".into(), json!(now_rfc3339()));
    run.insert("appVersion".into(), json!(p.app_version));
    stage::add_run_row(&p.stage_root, &p.catalog, &stage::normalized(&Value::Object(run)))?;

    // media and the artifact go into their content-addressed homes before the commit point (idempotent)
    let media = MediaStore::new(root.media_dir());
    for (i, b) in p.blobs.iter().enumerate() {
        let stored = media.put_file(&b.tmp)?;
        if stored.hash != b.hash || stored.size != b.size {
            bail!(Code::MediaHashMismatch, "staged media {} changed before publication", b.hash);
        }
        if i == p.blobs.len() / 2 {
            fault::point("mig-mid-media-publish");
        }
    }
    fault::point("mig-after-media-publish");
    if let Some(a) = &p.artifact {
        publish_artifact(&root, a)?;
    }
    fault::point("mig-after-artifact-publish");

    let mode = Mode::Merge(MergePolicy::KeepExisting);
    let guards = Guard::no_conflicting_ids(&p.catalog, mode);
    let opts = Options { kind: "migration".into(), deep_media_check: true, guards, ..Options::default() };
    let db = p.stage_root.db_path();
    host.with_store(|s| activation::activate(s, &db, mode, &p.op_id, &opts))?;

    // ---- P10 post-verify against the live store
    let bad = post_verify(host, p);
    if !bad.is_empty() {
        let _ = host.with_store(|s| undo_run(s, &p.op_id, true));
        let first = bad.first().cloned().unwrap_or_default();
        bail!(Code::ValidationFailed, "ACTIVATION_POST_VERIFY_FAILED: {} problem(s); the import was undone; first: {first}", bad.len());
    }
    fsx::remove_dir_all_quiet(&p.stage_dir);
    Ok(Activation::Done(Activated { run_op_id: p.op_id.clone(), report_hash: p.report_hash.clone(), counts: p.counts.clone() }))
}

fn post_verify<H: Host>(host: &H, p: &Prepared) -> Vec<String> {
    let reread = match read_source(
        &p.source_copy,
        &ReaderOptions { nonmedia_limit: u64::MAX, media_dir: p.stage_dir.join("media"), discard_media: true },
    ) {
        Ok(r) => r,
        Err(e) => return vec![format!("C-10: {}", e.message)],
    };
    let Some(root) = reread.root.as_ref() else { return vec!["C-10: the staged source copy could not be re-read".into()] };
    let media_dir = host.root().media_dir();
    host.with_store(|s| {
        let store = MediaStore::new(media_dir);
        let mut v = verify(&VerifyInput {
            conn: s.conn(),
            catalog: &p.catalog,
            root,
            blobs: &reread.media,
            ledger: &p.ledger,
            source_id: &p.source_id,
            run_op_id: Some(&p.op_id),
            blob_file: &|h| store.path_for(h).ok().filter(|x| x.is_file()),
            envelope: &p.envelope,
            staging: false,
        });
        if let Some(a) = &p.artifact {
            let f = s.root().recovery_artifacts_dir().join(format!("{}.artifact", a.hash));
            if fsx::sha256_file(&f).ok().as_deref() != Some(a.hash.as_str()) {
                v.push("C-11: the preserved recovery artifact does not hash to the supplied bytes".into());
            }
        }
        v
    })
}

// ------------------------------------------------------------------------------------------------- undo

fn json_get(conn: &Connection, table: &str, id: &str) -> Option<Value> {
    let t: String = conn.query_row(&format!("SELECT payload FROM {table} WHERE id=?1"), [id], |r| r.get(0)).ok()?;
    serde_json::from_str(&t).ok()
}

fn active_runs(conn: &Connection) -> Result<BTreeSet<String>> {
    let mut st = conn
        .prepare("SELECT r.id FROM migration_run r WHERE NOT EXISTS (SELECT 1 FROM migration_undo u WHERE u.undoes=r.id)")
        .map_err(|e| Error::new(Code::Db, e.to_string()))?;
    let v = st
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| Error::new(Code::Db, e.to_string()))?
        .collect::<std::result::Result<BTreeSet<_>, _>>()
        .map_err(|e| Error::new(Code::Db, e.to_string()))?;
    Ok(v)
}

/// The inverse unit of work (ADR 0002 section 13.3): delete exactly the records the run created, their origins
/// and artifact row (if unshared), record the undo. `force` skips the refusal checks (post-verify rollback of a
/// run that was just created and cannot have dependents).
fn undo_run(store: &mut Store, run_op_id: &str, force: bool) -> Result<UndoOutcome> {
    let catalog = store.catalog().clone();
    let conn = store.conn();
    let mut reasons: Vec<Value> = vec![];
    let Some(run) = json_get(conn, RUN, run_op_id) else {
        return Ok(UndoOutcome::Refused { reasons: vec![json!({"reason": "unknown run", "run": run_op_id})] });
    };
    let active = active_runs(conn)?;
    if !active.contains(run_op_id) {
        return Ok(UndoOutcome::Refused { reasons: vec![json!({"reason": "this run is not active (already undone)", "run": run_op_id})] });
    }
    let mut origins: Vec<(String, Value)> = vec![];
    {
        let mut st =
            conn.prepare("SELECT id, payload FROM migration_origin WHERE run_op_id=?1").map_err(|e| Error::new(Code::Db, e.to_string()))?;
        let rows = st
            .query_map([run_op_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| Error::new(Code::Db, e.to_string()))?;
        for r in rows {
            let (id, t) = r.map_err(|e| Error::new(Code::Db, e.to_string()))?;
            origins.push((id, serde_json::from_str(&t).map_err(|e| Error::new(Code::Db, e.to_string()))?));
        }
    }
    // candidates: created by this run, shared with no other active run
    let mut candidates: BTreeMap<(String, String), Value> = BTreeMap::new();
    // origins of other active runs that must inherit "carried" because the creating run is being undone
    let mut inherit: Vec<(String, Value)> = vec![];
    for (_, o) in &origins {
        if o["disposition"] != json!("carried") {
            continue;
        }
        let (c, id) = (o["collection"].as_str().unwrap_or_default().to_string(), o["recordId"].as_str().unwrap_or_default().to_string());
        let mut st = conn
            .prepare("SELECT id, payload FROM migration_origin WHERE collection_name=?1 AND record_id=?2 AND run_op_id<>?3")
            .map_err(|e| Error::new(Code::Db, e.to_string()))?;
        let others: Vec<(String, String)> = st
            .query_map([&c, &id, &run_op_id.to_string()], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| Error::new(Code::Db, e.to_string()))?
            .collect::<std::result::Result<_, _>>()
            .map_err(|e| Error::new(Code::Db, e.to_string()))?;
        let holders: Vec<(String, Value)> = others
            .into_iter()
            .filter_map(|(oid, t)| serde_json::from_str::<Value>(&t).ok().map(|v| (oid, v)))
            .filter(|(_, v)| v["runOpId"].as_str().is_some_and(|r| active.contains(r)))
            .collect();
        if !holders.is_empty() {
            // another active import still contains this record: it stays, and those imports now own it
            for (oid, mut v) in holders {
                if v["disposition"] != json!("carried") {
                    v["disposition"] = json!("carried");
                    inherit.push((oid, v));
                }
            }
            continue;
        }
        match json_get(conn, &c, &id) {
            None => reasons.push(json!({"reason": "record is missing", "collection": c, "id": id})),
            Some(stored) => {
                if !force && canon::hash_hex(&stored) != o["canonHash"].as_str().unwrap_or_default() {
                    reasons.push(json!({"reason": "record was modified after migration", "collection": c, "id": id}));
                }
                candidates.insert((c, id), o.clone());
            }
        }
    }
    // dependents created later: any row outside the undo set that references a candidate
    if !force {
        let ids = |coll: &str| -> BTreeSet<&str> { candidates.keys().filter(|(c, _)| c == coll).map(|(_, i)| i.as_str()).collect() };
        let probes: [(&str, &str, &str, &str, &str); 6] = [
            ("teacher_review", "response_id", "id", LEARNER_RESPONSE, TEACHER_REVIEW),
            ("legacy_history_entry", "twin_response_id", "id", LEARNER_RESPONSE, HISTORY),
            ("paper_media", "image_id", "paper_id", MEDIA_COLLECTION, PAPER),
            ("paper_media", "audio_id", "paper_id", MEDIA_COLLECTION, PAPER),
            ("learner_response_media", "image_id", "response_id", MEDIA_COLLECTION, LEARNER_RESPONSE),
            ("learner_response_media", "audio_id", "response_id", MEDIA_COLLECTION, LEARNER_RESPONSE),
        ];
        for (table, col, owner_col, target, owner_coll) in probes {
            let targets = ids(target);
            if targets.is_empty() {
                continue;
            }
            let owners = ids(owner_coll);
            let mut st = conn
                .prepare(&format!("SELECT {owner_col}, {col} FROM {table} WHERE {col} IS NOT NULL"))
                .map_err(|e| Error::new(Code::Db, e.to_string()))?;
            let rows = st
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map_err(|e| Error::new(Code::Db, e.to_string()))?;
            for r in rows {
                let (owner, tgt) = r.map_err(|e| Error::new(Code::Db, e.to_string()))?;
                if targets.contains(tgt.as_str()) && !owners.contains(owner.as_str()) {
                    reasons.push(json!({"reason": "a later record depends on a migrated record", "dependent": {"table": table, "id": owner}, "target": {"collection": target, "id": tgt}}));
                }
            }
        }
    }
    if !reasons.is_empty() {
        return Ok(UndoOutcome::Refused { reasons });
    }

    let undo_op = activation::new_operation_id();
    let mut ops: Vec<Value> = vec![];
    for (c, id) in candidates.keys() {
        ops.push(json!({"op": "delete", "collection": c, "id": id}));
    }
    for (oid, _) in &origins {
        ops.push(json!({"op": "delete", "collection": ORIGIN, "id": oid}));
    }
    for (oid, v) in &inherit {
        ops.push(stage::put_op(&catalog, ORIGIN, oid, &stage::normalized(v))?);
    }
    if let Some(rid) = run["recoveryId"].as_str() {
        let shared = active
            .iter()
            .filter(|r| r.as_str() != run_op_id)
            .any(|r| json_get(conn, RUN, r).is_some_and(|x| x["recoveryId"] == json!(rid)));
        if !shared {
            ops.push(json!({"op": "delete", "collection": ARTIFACT, "id": rid}));
        }
    }
    let n = candidates.len();
    let undo = json!({"opId": undo_op, "undoes": run_op_id, "recordsDeleted": n, "undoneAt": now_rfc3339()});
    ops.push(stage::put_op(&catalog, UNDO, &undo_op, &stage::normalized(&undo))?);
    fault::point("mig-before-undo-commit");
    store.commit(&json!({"ops": ops}))?;
    Ok(UndoOutcome::Done { undo_op_id: undo_op, records_deleted: n })
}

/// Undo an import (one transaction; refuses rather than touching anything modified or depended upon).
pub fn undo<H: Host>(host: &H, run_op_id: &str) -> Result<UndoOutcome> {
    let _gate = host.write_gate()?;
    host.with_store(|s| undo_run(s, run_op_id, false))
}

/// Imports so far: `[{opId, sourceId, undone, reportHash, activatedAt, counts}]`, newest first.
pub fn status<H: Host>(host: &H) -> Result<Value> {
    host.with_store(|s| {
        let conn = s.conn();
        let mut st = conn.prepare("SELECT id, payload FROM migration_run ORDER BY id DESC").map_err(|e| Error::new(Code::Db, e.to_string()))?;
        let rows: Vec<(String, String)> = st
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| Error::new(Code::Db, e.to_string()))?
            .collect::<std::result::Result<_, _>>()
            .map_err(|e| Error::new(Code::Db, e.to_string()))?;
        let active = active_runs(conn)?;
        let runs: Vec<Value> = rows
            .into_iter()
            .map(|(id, t)| {
                let v: Value = serde_json::from_str(&t).unwrap_or(Value::Null);
                json!({"opId": id, "sourceId": v["sourceId"], "undone": !active.contains(&id), "reportHash": v["reportHash"], "activatedAt": v["activatedAt"], "counts": v["counts"]})
            })
            .collect();
        Ok(json!({"runs": runs}))
    })
}

/// At startup (no operation can be in flight): remove staging directories no journal will ever resolve.
pub fn purge_orphan_staging(root: &DataRoot) {
    if let Ok(rd) = fs::read_dir(root.staging_dir()) {
        for e in rd.flatten() {
            if e.path().is_dir() {
                fsx::remove_dir_all_quiet(&e.path());
            }
        }
    }
}
