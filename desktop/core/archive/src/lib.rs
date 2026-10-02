//! V2 backup archive (ADR 0001 section 8 + A8).
//!
//! One zip containing `manifest.json` (format/version, store schema version, app version, counts and a
//! SHA-256 + size for every file), a **consistent online snapshot** of the database (recovery-only data
//! stripped) and every referenced media object. Everything streams - nothing is held whole in memory.
//! Restore **verifies everything before** invoking the activation primitive and refuses with specific
//! codes: `ArchiveWrongFormat`, `ArchiveCorrupt`, `ArchiveMissingEntry`, `ArchiveUnlistedEntry`,
//! `ArchiveHashMismatch`, `ArchiveNewerSchema`, `ArchiveInvalidStore`. A failed restore leaves live data
//! untouched. The V1 JSON backup is import-only and is not this crate's concern.

use qs_activation::{self as activation, Mode, Options};
use qs_media::{is_hash, MediaStore};
use qs_platform::identity::{APP_IDENTIFIER, APP_VERSION};
use qs_platform::{bail, fsx, Code, Error, Result, ResultExt};
use qs_store::foundation::MEDIA_COLLECTION;
use qs_store::store::{migrate_file, peek_identity};
use qs_store::Store;
use rusqlite::Connection;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const FORMAT: &str = "quiz-studio-archive";
pub const FORMAT_VERSION: i64 = 1;
pub const MANIFEST: &str = "manifest.json";
pub const DB_ENTRY: &str = "db/quiz-studio.db";
const CHUNK: usize = 1 << 20;

#[derive(Debug, Clone)]
pub struct Manifest {
    pub store_schema_version: i32,
    pub app_version: String,
    pub media_count: usize,
    pub media_bytes: u64,
    /// path -> (size, sha256)
    pub entries: BTreeMap<String, (u64, String)>,
}

#[derive(Debug, Clone)]
pub struct ArchiveSummary {
    pub path: PathBuf,
    pub bytes: u64,
    pub media_count: usize,
    pub media_bytes: u64,
    pub store_schema_version: i32,
    pub sha256: String,
}
impl ArchiveSummary {
    pub fn to_json(&self) -> Value {
        json!({"bytes": self.bytes, "mediaCount": self.media_count, "mediaBytes": self.media_bytes,
               "storeSchemaVersion": self.store_schema_version, "sha256": self.sha256})
    }
}

/// A consistent database snapshot ready to be written into an archive. Created while holding the store
/// (brief); the slow media streaming that follows does not need the store at all.
pub struct SnapshotHandle {
    dir: PathBuf,
    db: PathBuf,
    schema_version: i32,
    /// distinct (content hash, size) of every registered media object
    media: Vec<(String, u64)>,
}

pub fn snapshot_for_archive(store: &Store, op_id: &str) -> Result<SnapshotHandle> {
    let dir = store.root().staging_dir().join(op_id);
    fs::create_dir_all(&dir)?;
    let db = dir.join("archive-db.db");
    store.snapshot_to(&db)?;
    // strip everything that must not travel: recovery-only collections and operation bookkeeping
    {
        let c = Connection::open(fsx::sqlite_path(&db)?).code(Code::Db)?;
        for coll in store.catalog().collections().iter().filter(|c| !c.canonical) {
            for r in &coll.relations {
                c.execute(&format!("DELETE FROM {}", r.table), []).code(Code::Db)?;
            }
            c.execute(&format!("DELETE FROM {}", coll.name), []).code(Code::Db)?;
        }
        c.execute("DELETE FROM operation_journal", []).code(Code::Db)?;
        let _: String = c.query_row("PRAGMA journal_mode=DELETE", [], |r| r.get(0)).code(Code::Db)?;
        c.execute_batch("VACUUM").code(Code::Db)?;
    }
    let (schema_version, media) = {
        let c = Connection::open(fsx::sqlite_path(&db)?).code(Code::Db)?;
        let v: i32 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).code(Code::Db)?;
        let mut st = c.prepare(&format!("SELECT DISTINCT content_hash, size FROM {MEDIA_COLLECTION} ORDER BY content_hash")).code(Code::Db)?;
        let m: Vec<(String, u64)> = st
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as u64)))
            .code(Code::Db)?
            .collect::<std::result::Result<_, _>>()
            .code(Code::Db)?;
        (v, m)
    };
    Ok(SnapshotHandle { dir, db, schema_version, media })
}

impl SnapshotHandle {
    pub fn discard(self) {
        fsx::remove_dir_all_quiet(&self.dir);
    }
}

struct HashingZip<'a> {
    zip: &'a mut ZipWriter<File>,
    h: Sha256,
    size: u64,
}
impl Write for HashingZip<'_> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let n = self.zip.write(buf)?;
        self.h.update(&buf[..n]);
        self.size += n as u64;
        Ok(n)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.zip.flush()
    }
}

fn add_entry(zip: &mut ZipWriter<File>, name: &str, mut src: impl Read, method: CompressionMethod) -> Result<(u64, String)> {
    zip.start_file(name, SimpleFileOptions::default().compression_method(method).large_file(true)).code(Code::Io)?;
    let mut w = HashingZip { zip, h: Sha256::new(), size: 0 };
    let mut buf = vec![0u8; CHUNK];
    loop {
        let n = src.read(&mut buf)?;
        if n == 0 {
            break;
        }
        w.write_all(&buf[..n])?;
    }
    Ok((w.size, hex::encode(w.h.finalize())))
}

/// Write the archive atomically (`<dest>.partial` -> fsync -> rename). Fails closed on any media problem.
pub fn write_archive(handle: &SnapshotHandle, media: &MediaStore, dest: &Path) -> Result<ArchiveSummary> {
    let partial = PathBuf::from(format!("{}.partial", dest.display()));
    let result = write_archive_inner(handle, media, &partial);
    match result {
        Ok(sum) => {
            fsx::rename_retry(&partial, dest)?;
            Ok(ArchiveSummary { path: dest.to_path_buf(), ..sum })
        }
        Err(e) => {
            let _ = fs::remove_file(&partial);
            Err(e)
        }
    }
}

fn write_archive_inner(handle: &SnapshotHandle, media: &MediaStore, partial: &Path) -> Result<ArchiveSummary> {
    let file = File::create(partial)?;
    let mut zip = ZipWriter::new(file);
    let mut entries = BTreeMap::new();

    let (size, sha) = add_entry(&mut zip, DB_ENTRY, File::open(&handle.db)?, CompressionMethod::Deflated)?;
    entries.insert(DB_ENTRY.to_string(), (size, sha));

    let mut media_bytes = 0u64;
    for (hash, size) in &handle.media {
        let name = format!("media/{}/{hash}", &hash[..2]);
        let src = media.open(hash)?; // MediaMissing: fail closed
        let (n, sha) = add_entry(&mut zip, &name, src, CompressionMethod::Stored)?;
        if &sha != hash || n != *size {
            bail!(Code::MediaHashMismatch, "media {hash} on disk does not match its content address; refusing to archive it");
        }
        media_bytes += n;
        entries.insert(name, (n, sha));
    }

    let manifest = json!({
        "format": FORMAT,
        "formatVersion": FORMAT_VERSION,
        "applicationId": APP_IDENTIFIER,
        "storeSchemaVersion": handle.schema_version,
        "appVersion": APP_VERSION,
        "counts": {"media": handle.media.len(), "mediaBytes": media_bytes},
        "entries": entries.iter().map(|(p, (s, h))| json!({"path": p, "size": s, "sha256": h})).collect::<Vec<_>>(),
    });
    zip.start_file(MANIFEST, SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)).code(Code::Io)?;
    zip.write_all(serde_json::to_string_pretty(&manifest).code(Code::Internal)?.as_bytes())?;
    let file = zip.finish().code(Code::Io)?;
    file.sync_all()?;
    drop(file);
    Ok(ArchiveSummary {
        path: partial.to_path_buf(),
        bytes: fs::metadata(partial)?.len(),
        media_count: handle.media.len(),
        media_bytes,
        store_schema_version: handle.schema_version,
        sha256: fsx::sha256_file(partial)?,
    })
}

/// Convenience: snapshot, write, clean up.
pub fn create_archive(store: &Store, dest: &Path) -> Result<ArchiveSummary> {
    let handle = snapshot_for_archive(store, &activation::new_operation_id())?;
    let media = MediaStore::new(store.root().media_dir());
    let r = write_archive(&handle, &media, dest);
    handle.discard();
    r
}

// ---------------------------------------------------------------------------------------------- verify

fn entry_path_ok(name: &str) -> bool {
    if name == DB_ENTRY {
        return true;
    }
    match name.strip_prefix("media/").and_then(|r| r.split_once('/')) {
        Some((hh, hash)) => is_hash(hash) && hash.starts_with(hh) && hh.len() == 2,
        None => false,
    }
}

fn open_zip(path: &Path) -> Result<ZipArchive<File>> {
    let mut f = File::open(path).ctx(Code::Io, "open archive")?;
    let mut sig = [0u8; 4];
    let n = f.read(&mut sig)?;
    if n < 4 || !(sig == *b"PK\x03\x04" || sig == *b"PK\x05\x06") {
        bail!(Code::ArchiveWrongFormat, "not a Quiz Studio archive (not a zip file)");
    }
    ZipArchive::new(File::open(path)?).map_err(|e| Error::new(Code::ArchiveCorrupt, format!("archive directory unreadable: {e}")))
}

fn read_manifest(zip: &mut ZipArchive<File>) -> Result<(Manifest, i64)> {
    let mut m = match zip.by_name(MANIFEST) {
        Ok(m) => m,
        Err(zip::result::ZipError::FileNotFound) => bail!(Code::ArchiveWrongFormat, "manifest.json is missing"),
        Err(e) => bail!(Code::ArchiveCorrupt, "manifest unreadable: {e}"),
    };
    let mut text = String::new();
    m.read_to_string(&mut text).map_err(|e| Error::new(Code::ArchiveCorrupt, format!("manifest unreadable: {e}")))?;
    let v: Value = serde_json::from_str(&text).map_err(|e| Error::new(Code::ArchiveCorrupt, format!("manifest is not valid JSON: {e}")))?;
    if v["format"] != FORMAT {
        bail!(Code::ArchiveWrongFormat, "not a Quiz Studio archive (format {:?})", v["format"]);
    }
    let fv = v["formatVersion"].as_i64().unwrap_or(-1);
    let schema = v["storeSchemaVersion"].as_i64().ok_or_else(|| Error::new(Code::ArchiveWrongFormat, "manifest lacks storeSchemaVersion"))? as i32;
    let mut entries = BTreeMap::new();
    for e in v["entries"].as_array().ok_or_else(|| Error::new(Code::ArchiveWrongFormat, "manifest lacks entries"))? {
        let (Some(p), Some(s), Some(h)) = (e["path"].as_str(), e["size"].as_u64(), e["sha256"].as_str()) else {
            bail!(Code::ArchiveWrongFormat, "manifest entry is malformed");
        };
        if !entry_path_ok(p) {
            bail!(Code::ArchiveWrongFormat, "manifest lists an unexpected path '{p}'");
        }
        if entries.insert(p.to_string(), (s, h.to_string())).is_some() {
            bail!(Code::ArchiveCorrupt, "manifest lists '{p}' twice");
        }
    }
    let mf = Manifest {
        store_schema_version: schema,
        app_version: v["appVersion"].as_str().unwrap_or("").to_string(),
        media_count: v["counts"]["media"].as_u64().unwrap_or(0) as usize,
        media_bytes: v["counts"]["mediaBytes"].as_u64().unwrap_or(0),
        entries,
    };
    Ok((mf, fv))
}

/// Verify the whole archive without touching any live data. `max_schema` is the newest store schema this
/// build understands.
pub fn verify_archive(path: &Path, max_schema: i32) -> Result<Manifest> {
    let mut zip = open_zip(path)?;
    let (mf, fv) = read_manifest(&mut zip)?;
    if fv != FORMAT_VERSION {
        bail!(Code::ArchiveWrongFormat, "unsupported archive format version {fv}");
    }
    if mf.store_schema_version > max_schema {
        bail!(Code::ArchiveNewerSchema, "archive was written by a newer store schema (v{}); this build supports v{max_schema}", mf.store_schema_version);
    }
    if mf.store_schema_version < 1 {
        bail!(Code::ArchiveWrongFormat, "archive has an invalid store schema version");
    }
    let mut present = BTreeSet::new();
    for i in 0..zip.len() {
        let f = zip.by_index_raw(i).map_err(|e| Error::new(Code::ArchiveCorrupt, format!("entry {i} unreadable: {e}")))?;
        if f.is_dir() || f.name() == MANIFEST {
            continue;
        }
        if !entry_path_ok(f.name()) {
            bail!(Code::ArchiveUnlistedEntry, "archive contains an unexpected entry '{}'", f.name());
        }
        if !present.insert(f.name().to_string()) {
            bail!(Code::ArchiveCorrupt, "archive contains '{}' twice", f.name());
        }
    }
    for listed in mf.entries.keys() {
        if !present.contains(listed) {
            bail!(Code::ArchiveMissingEntry, "archive is missing '{listed}'");
        }
    }
    for p in &present {
        if !mf.entries.contains_key(p) {
            bail!(Code::ArchiveUnlistedEntry, "archive contains '{p}' which the manifest does not list");
        }
    }
    if !mf.entries.contains_key(DB_ENTRY) {
        bail!(Code::ArchiveMissingEntry, "archive has no database");
    }
    // stream-hash every entry
    let mut buf = vec![0u8; CHUNK];
    for (name, (size, sha)) in &mf.entries {
        let mut f = zip.by_name(name).map_err(|e| Error::new(Code::ArchiveCorrupt, format!("'{name}' unreadable: {e}")))?;
        let mut h = Sha256::new();
        let mut n_total = 0u64;
        loop {
            let n = f.read(&mut buf).map_err(|e| Error::new(Code::ArchiveCorrupt, format!("'{name}' is corrupt: {e}")))?;
            if n == 0 {
                break;
            }
            h.update(&buf[..n]);
            n_total += n as u64;
        }
        let got = hex::encode(h.finalize());
        if &got != sha || n_total != *size {
            bail!(Code::ArchiveHashMismatch, "'{name}' does not match the manifest checksum");
        }
        if let Some(addr) = name.strip_prefix("media/").and_then(|r| r.split_once('/')).map(|x| x.1) {
            if addr != got {
                bail!(Code::ArchiveHashMismatch, "'{name}' content does not match its content address");
            }
        }
    }
    Ok(mf)
}

// --------------------------------------------------------------------------------------------- restore

#[derive(Debug, Clone)]
pub struct RestoreReport {
    pub op_id: String,
    pub media_added: usize,
    pub media_already_present: usize,
    pub migrated_from: Option<i32>,
    pub activation: activation::Report,
}
impl RestoreReport {
    pub fn to_json(&self) -> Value {
        json!({"opId": self.op_id, "mediaAdded": self.media_added, "mediaAlreadyPresent": self.media_already_present,
               "migratedFromSchema": self.migrated_from, "activation": self.activation.to_json()})
    }
}

/// Restore = verify everything, stage the archive's database, add its media, then activate in replace
/// mode through the shared primitive. Nothing live changes unless every step before the commit succeeded.
pub fn restore_archive(store: &mut Store, archive: &Path) -> Result<RestoreReport> {
    let max = store.catalog().schema_version();
    let mf = verify_archive(archive, max)?;
    let op_id = activation::new_operation_id();
    let staging = activation::create_staging(store.root(), &op_id)?;
    let result = (|| -> Result<RestoreReport> {
        let mut zip = open_zip(archive)?;
        {
            let mut src = zip.by_name(DB_ENTRY).map_err(|e| Error::new(Code::ArchiveMissingEntry, e.to_string()))?;
            let mut out = File::create(&staging.db)?;
            std::io::copy(&mut src, &mut out).map_err(|e| Error::new(Code::ArchiveCorrupt, e.to_string()))?;
            out.sync_all()?;
        }
        match peek_identity(&staging.db).ok().flatten() {
            Some((app, ver, _)) if app == qs_store::APPLICATION_ID && ver == mf.store_schema_version => {}
            _ => bail!(Code::ArchiveInvalidStore, "the archive's database is not a valid store at the schema its manifest declares"),
        }
        let migrated_from = migrate_file(&staging.db, store.catalog())?.map(|(from, _)| from);
        activation::normalize_staging(&staging.db)?;

        let media = MediaStore::new(store.root().media_dir());
        let (mut added, mut present) = (0, 0);
        for name in mf.entries.keys().filter(|n| n.starts_with("media/")) {
            let src = zip.by_name(name).map_err(|e| Error::new(Code::ArchiveCorrupt, e.to_string()))?;
            let stored = media.put_reader(src)?;
            if name.rsplit('/').next() != Some(stored.hash.as_str()) {
                bail!(Code::ArchiveHashMismatch, "'{name}' changed while restoring");
            }
            if stored.deduplicated {
                present += 1;
            } else {
                added += 1;
            }
        }
        let opts = Options { kind: "restore".into(), ..Options::default() };
        let activation = activation::activate(store, &staging.db, Mode::Replace, &op_id, &opts)?;
        Ok(RestoreReport { op_id: op_id.clone(), media_added: added, media_already_present: present, migrated_from, activation })
    })();
    fsx::remove_dir_all_quiet(&staging.dir);
    result
}
