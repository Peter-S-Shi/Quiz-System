//! H5: streamed backup archive (zip container): manifest + consistent DB snapshot + referenced media.
//! Verified before activation; restore goes through the H3 activation primitive.
use crate::{activation, canon, mem, media, schema, store, store::Store};
use anyhow::{anyhow, bail, Result};
use rusqlite::Connection;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

fn copy_hash<R: Read, W: Write>(r: &mut R, w: &mut W) -> Result<(String, u64)> {
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
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
    Ok((hex::encode(h.finalize()), n))
}

/// Create an archive from the store at `root`, using a *separate* connection (online-safe: WAL snapshot).
pub fn create(root: &Path, out: &Path) -> Result<Value> {
    let t = std::time::Instant::now();
    let tmp_db = root.join("staging").join(format!("archive-{}.db", fastrand::u32(..)));
    let _ = fs::remove_file(&tmp_db);
    let state_hash;
    let (mut counts, schema_ver);
    {
        let c = Connection::open(store::db_path(root))?;
        c.execute("VACUUM INTO ?1", [tmp_db.to_string_lossy().as_ref()])?;
        schema_ver = c.query_row::<i32, _, _>("PRAGMA user_version", [], |r| r.get(0))?;
    }
    {
        let s = Connection::open(&tmp_db)?;
        state_hash = store::state_hash_conn(&s)?;
        counts = serde_json::Map::new();
        for t in schema::TABLES {
            if *t == "recovery_session" {
                continue;
            }
            let n: i64 = s.query_row(&format!("SELECT count(*) FROM {t}"), [], |r| r.get(0))?;
            counts.insert((*t).into(), json!(n));
        }
    }
    activation::normalize_staging(&tmp_db)?;
    // referenced media only (ADR §8: unreferenced media is out of the backup)
    let media_rows: Vec<(String, i64)> = {
        let s = Connection::open(&tmp_db)?;
        let mut st = s.prepare("SELECT DISTINCT content_hash, size FROM media_object WHERE id IN (SELECT media_id FROM media_ref) ORDER BY content_hash")?;
        let v = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?.collect::<std::result::Result<_, _>>()?;
        v
    };
    let mut zw = ZipWriter::new(File::create(out)?);
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Stored).large_file(true);
    let mut files = vec![];
    zw.start_file("db/store.db", opts)?;
    let (h, n) = copy_hash(&mut File::open(&tmp_db)?, &mut zw)?;
    files.push(json!({"path": "db/store.db", "sha256": h, "size": n}));
    for (hash, size) in &media_rows {
        let p = media::path_for(root, hash);
        let name = format!("media/{}", hash);
        zw.start_file(&name, opts)?;
        let (h, n) = copy_hash(&mut File::open(&p).map_err(|e| anyhow!("referenced media {hash} missing: {e}"))?, &mut zw)?;
        if h != *hash || n as i64 != *size {
            bail!("source media {hash} failed self-check during archive");
        }
        files.push(json!({"path": name, "sha256": h, "size": n}));
    }
    let manifest = json!({
        "formatVersion": 1, "storeSchemaVersion": schema_ver, "appVersion": env!("CARGO_PKG_VERSION"),
        "counts": Value::Object(counts), "stateHash": state_hash, "files": files,
    });
    zw.start_file("manifest.json", SimpleFileOptions::default().compression_method(CompressionMethod::Deflated))?;
    zw.write_all(serde_json::to_string_pretty(&manifest)?.as_bytes())?;
    zw.finish()?;
    let _ = fs::remove_file(&tmp_db);
    Ok(json!({"archive": out.file_name().map(|s| s.to_string_lossy().to_string()), "bytes": fs::metadata(out)?.len(), "mediaFiles": media_rows.len(),
              "seconds": t.elapsed().as_secs_f64(), "peakWorkingSetMiB": mem::peak_mib(), "stateHash": state_hash}))
}

pub struct Verified {
    pub staged_db: PathBuf,
    pub media_files: Vec<(String, PathBuf)>,
    pub manifest: Value,
}

/// Verify an archive completely into a staging dir. Fails closed with a specific diagnostic; never touches live data.
pub fn verify_into_staging(archive: &Path, staging_dir: &Path) -> Result<Verified> {
    let f = File::open(archive).map_err(|e| anyhow!("ARCHIVE_UNREADABLE: {e}"))?;
    let mut za = ZipArchive::new(f).map_err(|e| anyhow!("ARCHIVE_UNREADABLE: {e}"))?;
    let mut mtext = String::new();
    {
        let mut e = za.by_name("manifest.json").map_err(|_| anyhow!("ARCHIVE_MANIFEST_MISSING"))?;
        e.read_to_string(&mut mtext).map_err(|e| anyhow!("ARCHIVE_ENTRY_CORRUPT: manifest.json: {e}"))?;
    }
    let manifest: Value = serde_json::from_str(&mtext).map_err(|e| anyhow!("ARCHIVE_MANIFEST_INVALID: {e}"))?;
    if manifest["formatVersion"] != json!(1) {
        bail!("ARCHIVE_FORMAT_UNSUPPORTED: formatVersion {}", manifest["formatVersion"]);
    }
    let sv = manifest["storeSchemaVersion"].as_i64().ok_or_else(|| anyhow!("ARCHIVE_MANIFEST_INVALID: storeSchemaVersion"))?;
    if sv > schema::SCHEMA_VERSION as i64 {
        bail!("ARCHIVE_NEWER_SCHEMA: archive store schema v{sv} > supported v{}", schema::SCHEMA_VERSION);
    }
    let files = manifest["files"].as_array().ok_or_else(|| anyhow!("ARCHIVE_MANIFEST_INVALID: files"))?;
    let listed: std::collections::HashSet<&str> = files.iter().filter_map(|f| f["path"].as_str()).collect();
    for i in 0..za.len() {
        let n = za.by_index(i).map_err(|e| anyhow!("ARCHIVE_UNREADABLE: {e}"))?.name().to_string();
        if n != "manifest.json" && !listed.contains(n.as_str()) {
            bail!("ARCHIVE_UNLISTED_ENTRY: {n}");
        }
    }
    fs::create_dir_all(staging_dir)?;
    let mut out = Verified { staged_db: staging_dir.join("store.db"), media_files: vec![], manifest: manifest.clone() };
    for f in files {
        let path = f["path"].as_str().ok_or_else(|| anyhow!("ARCHIVE_MANIFEST_INVALID: path"))?;
        let want = f["sha256"].as_str().unwrap_or("");
        let want_size = f["size"].as_u64().unwrap_or(u64::MAX);
        let mut e = za.by_name(path).map_err(|_| anyhow!("ARCHIVE_ENTRY_MISSING: {path}"))?;
        let dest = if path == "db/store.db" { out.staged_db.clone() } else { staging_dir.join(format!("m-{}", path.trim_start_matches("media/"))) };
        let mut w = File::create(&dest)?;
        let (h, n) = copy_hash(&mut e, &mut w).map_err(|er| anyhow!("ARCHIVE_ENTRY_CORRUPT: {path}: {er}"))?;
        w.sync_all()?;
        if n != want_size {
            bail!("ARCHIVE_SIZE_MISMATCH: {path}");
        }
        if h != want {
            bail!("ARCHIVE_HASH_MISMATCH: {path}");
        }
        if path != "db/store.db" {
            out.media_files.push((want.to_string(), dest));
        }
    }
    if !listed.contains("db/store.db") {
        bail!("ARCHIVE_ENTRY_MISSING: db/store.db");
    }
    Ok(out)
}

/// Restore: verify -> place media (immutable, idempotent) -> activation primitive.
pub fn restore(store: &mut Store, archive: &Path, mode: activation::Mode, op_id: &str) -> Result<Value> {
    let stage = store.root.join("staging").join(op_id);
    let _ = fs::remove_dir_all(&stage);
    let v = match verify_into_staging(archive, &stage) {
        Ok(v) => v,
        Err(e) => {
            let _ = fs::remove_dir_all(&stage);
            return Err(e);
        }
    };
    for (hash, p) in &v.media_files {
        let fin = media::path_for(&store.root, hash);
        fs::create_dir_all(fin.parent().unwrap())?;
        if fin.exists() {
            fs::remove_file(p)?;
        } else {
            fs::rename(p, &fin)?;
        }
    }
    activation::normalize_staging(&v.staged_db)?;
    let rep = activation::activate(store, &v.staged_db, mode, op_id);
    let _ = fs::remove_dir_all(&stage);
    let rep = rep?;
    let state_ok = v.manifest["stateHash"].as_str() == Some(&rep.post_hash) || mode == activation::Mode::Merge;
    Ok(json!({"activation": rep.to_json(), "manifestStateHashMatches": state_ok, "peakWorkingSetMiB": mem::peak_mib()}))
}

pub fn canonical_manifest_hash(v: &Value) -> String {
    canon::hash_value(v)
}
