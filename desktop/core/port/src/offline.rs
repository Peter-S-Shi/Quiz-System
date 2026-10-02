//! Recovery that works when the store cannot even be opened (corrupt database file). Never silent:
//! the damaged file is moved aside into `recovery-artifacts/` (byte-for-byte, never deleted) and the
//! user-chosen snapshot becomes the database. The UI only calls this after an explicit confirmation.

use qs_platform::{bail, fsx, Code, DataRoot, Error, Result};
use qs_store::store::peek_identity;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

pub fn list_snapshots(root: &DataRoot) -> Result<Vec<Value>> {
    let dir = root.snapshots_dir();
    let mut out = vec![];
    if !dir.is_dir() {
        return Ok(out);
    }
    for e in fs::read_dir(dir)? {
        let e = e?;
        let name = e.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".db") {
            continue;
        }
        let meta = e.metadata()?;
        let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs());
        let ok = peek_identity(&e.path()).ok().flatten().map(|(app, _, _)| app == qs_store::APPLICATION_ID).unwrap_or(false);
        out.push(json!({"name": name, "bytes": meta.len(), "modifiedUnix": modified, "looksValid": ok}));
    }
    out.sort_by(|a, b| b["modifiedUnix"].as_u64().cmp(&a["modifiedUnix"].as_u64()));
    Ok(out)
}

/// Resolve a snapshot *name* (never a path) inside the snapshots directory.
pub fn snapshot_path(root: &DataRoot, name: &str) -> Result<PathBuf> {
    if name.contains(['/', '\\']) || name.contains("..") || !name.ends_with(".db") {
        bail!(Code::RejectShape, "'{name}' is not a snapshot name");
    }
    let p = root.snapshots_dir().join(name);
    if !p.is_file() {
        bail!(Code::NotFound, "snapshot '{name}' does not exist");
    }
    Ok(p)
}

/// Replace an unopenable database with a snapshot. The damaged database (and its WAL/SHM) is preserved.
/// Must be called with no `Store`/`Core` open on this root.
pub fn restore_snapshot_offline(root: &DataRoot, name: &str) -> Result<PathBuf> {
    let snap = snapshot_path(root, name)?;
    match peek_identity(&snap) {
        Ok(Some((app, _, _))) if app == qs_store::APPLICATION_ID => {}
        _ => return Err(Error::new(Code::NotAStore, "the chosen snapshot is not a valid Quiz Studio store")),
    }
    let _lock = fsx::ProcessLock::acquire(&root.lock_path())?;
    let db = root.db_path();
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let keep_dir = root.recovery_artifacts_dir();
    fs::create_dir_all(&keep_dir)?;
    let mut preserved = keep_dir.join(format!("damaged-{stamp}.db"));
    for (suffix, target_suffix) in [("", ".db"), ("-wal", ".db-wal"), ("-shm", ".db-shm")] {
        let mut from = db.clone().into_os_string();
        from.push(suffix);
        let from = PathBuf::from(from);
        if from.exists() {
            let to = keep_dir.join(format!("damaged-{stamp}{target_suffix}"));
            fsx::rename_retry(&from, &to)?;
            if suffix.is_empty() {
                preserved = to;
            }
        }
    }
    fs::copy(&snap, &db)?;
    Ok(preserved)
}
