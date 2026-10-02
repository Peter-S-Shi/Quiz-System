//! Immutable, content-addressed media store (ADR 0001 section 5.4).
//!
//! * bytes live at `<dir>/<hh>/<sha256>` and are **never modified once present**;
//! * a file only ever gets its final name when complete and fsynced (temp -> fsync -> atomic rename with
//!   bounded retry, A6), so a crash leaves only complete files or discardable temps;
//! * ingest streams (bounded memory) - hashing happens on the decoded bytes while they are written;
//! * adding media is idempotent and happens **before** the database commit that makes it visible, so an
//!   orphan after a crash is harmless garbage, collected later by `gc` (zero references + safety delay).
//!
//! The mapping from stable media IDs to hashes lives in the store's `media_object` collection, not here.

use qs_platform::{bail, fault, fsx, Code, Error, Result, ResultExt};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub const TEMP_SUFFIX: &str = ".tmp";
const CHUNK: usize = 1 << 20;

pub fn is_hash(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stored {
    pub hash: String,
    pub size: u64,
    /// The content was already present (nothing new was written).
    pub deduplicated: bool,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct GcReport {
    pub removed_temp: usize,
    pub removed_orphans: usize,
    pub kept_young: usize,
}

#[derive(Debug, Clone)]
pub struct MediaStore {
    dir: PathBuf,
}

impl MediaStore {
    pub fn new(dir: impl Into<PathBuf>) -> MediaStore {
        MediaStore { dir: dir.into() }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Final location of a content address. Errors on anything that is not a lowercase SHA-256 hex digest
    /// (so a hostile id can never escape the media directory).
    pub fn path_for(&self, hash: &str) -> Result<PathBuf> {
        if !is_hash(hash) {
            bail!(Code::RejectShape, "'{hash}' is not a SHA-256 content address");
        }
        Ok(self.dir.join(&hash[..2]).join(hash))
    }

    pub fn contains(&self, hash: &str) -> bool {
        self.path_for(hash).map(|p| p.is_file()).unwrap_or(false)
    }

    pub fn size_of(&self, hash: &str) -> Result<u64> {
        let p = self.path_for(hash)?;
        match fs::metadata(&p) {
            Ok(m) => Ok(m.len()),
            Err(_) => Err(Error::new(Code::MediaMissing, format!("media {hash} is missing"))),
        }
    }

    pub fn open(&self, hash: &str) -> Result<File> {
        let p = self.path_for(hash)?;
        File::open(&p).map_err(|_| Error::new(Code::MediaMissing, format!("media {hash} is missing")))
    }

    /// Begin a streaming write. Dropping the intake without `finish` removes its temp file.
    pub fn begin(&self) -> Result<Intake> {
        fs::create_dir_all(&self.dir)?;
        let tmp = self.dir.join(format!("incoming-{}-{:08x}{TEMP_SUFFIX}", std::process::id(), fastrand::u32(..)));
        let file = BufWriter::with_capacity(CHUNK, File::create(&tmp)?);
        Ok(Intake { store: self.clone(), file: Some(file), tmp, hasher: Sha256::new(), size: 0, chunks: 0 })
    }

    pub fn put_bytes(&self, bytes: &[u8]) -> Result<Stored> {
        let mut i = self.begin()?;
        i.write(bytes)?;
        i.finish()
    }

    /// Stream any reader in (e.g. a file, an archive entry) with constant memory.
    pub fn put_reader(&self, mut r: impl Read) -> Result<Stored> {
        let mut i = self.begin()?;
        let mut buf = vec![0u8; CHUNK];
        loop {
            let n = r.read(&mut buf)?;
            if n == 0 {
                break;
            }
            i.write(&buf[..n])?;
        }
        i.finish()
    }

    pub fn put_file(&self, path: &Path) -> Result<Stored> {
        self.put_reader(File::open(path)?)
    }

    /// Re-hash the stored bytes. `MediaMissing` / `MediaHashMismatch` on failure.
    pub fn verify(&self, hash: &str, expected_size: Option<u64>) -> Result<()> {
        let mut f = self.open(hash)?;
        let mut h = Sha256::new();
        let mut size = 0u64;
        let mut buf = vec![0u8; CHUNK];
        loop {
            let n = f.read(&mut buf)?;
            if n == 0 {
                break;
            }
            h.update(&buf[..n]);
            size += n as u64;
        }
        if hex::encode(h.finalize()) != hash || expected_size.is_some_and(|s| s != size) {
            bail!(Code::MediaHashMismatch, "media {hash} does not match its content address");
        }
        Ok(())
    }

    /// Remove stale temp files and files nothing references. `referenced` is the set of content hashes the
    /// database still points at; anything younger than `min_age` is kept (it may belong to an operation
    /// that has not committed yet).
    pub fn gc(&self, referenced: &HashSet<String>, min_age: Duration) -> Result<GcReport> {
        let mut rep = GcReport::default();
        if !self.dir.is_dir() {
            return Ok(rep);
        }
        let old_enough = |p: &Path| -> bool {
            fs::metadata(p)
                .and_then(|m| m.modified())
                .map(|t| SystemTime::now().duration_since(t).unwrap_or_default() >= min_age)
                .unwrap_or(false)
        };
        let mut first = true;
        for entry in fs::read_dir(&self.dir)? {
            let path = entry?.path();
            if path.is_file() && path.to_string_lossy().ends_with(TEMP_SUFFIX) {
                if old_enough(&path) {
                    fs::remove_file(&path)?;
                    rep.removed_temp += 1;
                } else {
                    rep.kept_young += 1;
                }
            } else if path.is_dir() {
                for f in fs::read_dir(&path)? {
                    let fp = f?.path();
                    let name = fp.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                    if !fp.is_file() || !is_hash(&name) || referenced.contains(&name) {
                        continue;
                    }
                    if old_enough(&fp) {
                        fs::remove_file(&fp)?;
                        rep.removed_orphans += 1;
                        if first {
                            first = false;
                            fault::point("during-media-gc");
                        }
                    } else {
                        rep.kept_young += 1;
                    }
                }
                let _ = fs::remove_dir(&path); // only succeeds when empty
            }
        }
        Ok(rep)
    }

    /// Every content hash present on disk (diagnostics / archive sanity checks).
    pub fn list(&self) -> Result<Vec<String>> {
        let mut out = vec![];
        if !self.dir.is_dir() {
            return Ok(out);
        }
        for d in fs::read_dir(&self.dir)? {
            let d = d?.path();
            if d.is_dir() {
                for f in fs::read_dir(&d)? {
                    let n = f?.file_name().to_string_lossy().into_owned();
                    if is_hash(&n) {
                        out.push(n);
                    }
                }
            }
        }
        out.sort();
        Ok(out)
    }
}

pub struct Intake {
    store: MediaStore,
    file: Option<BufWriter<File>>,
    tmp: PathBuf,
    hasher: Sha256,
    size: u64,
    chunks: u64,
}

impl Intake {
    pub fn write(&mut self, bytes: &[u8]) -> Result<()> {
        self.hasher.update(bytes);
        self.file.as_mut().expect("intake open").write_all(bytes)?;
        self.size += bytes.len() as u64;
        self.chunks += 1;
        if self.chunks == 3 {
            fault::point("media-mid-write");
        }
        Ok(())
    }

    /// Fsync, then publish under the content address (or drop the duplicate). Returns the content address.
    pub fn finish(mut self) -> Result<Stored> {
        let file = self.file.take().expect("intake open");
        let file = file.into_inner().map_err(|e| Error::new(Code::Io, e.to_string()))?;
        file.sync_all()?;
        drop(file);
        let hash = hex::encode(self.hasher.clone().finalize());
        let fin = self.store.path_for(&hash)?;
        fs::create_dir_all(fin.parent().expect("hash dir"))?;
        let deduplicated = if fin.is_file() {
            fs::remove_file(&self.tmp)?;
            true
        } else {
            fsx::rename_retry(&self.tmp, &fin).ctx(Code::Io, "publish media")?;
            false
        };
        // a clean exit: nothing left for Drop to clean up
        self.tmp = PathBuf::new();
        Ok(Stored { hash, size: self.size, deduplicated })
    }
}

impl Drop for Intake {
    fn drop(&mut self) {
        if !self.tmp.as_os_str().is_empty() {
            self.file.take();
            let _ = fs::remove_file(&self.tmp);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn store() -> (tempfile::TempDir, MediaStore) {
        let d = tempfile::tempdir().unwrap();
        let s = MediaStore::new(d.path().join("media"));
        (d, s)
    }

    fn sha(b: &[u8]) -> String {
        hex::encode(Sha256::digest(b))
    }

    #[test]
    fn stores_bytes_under_their_hash_and_dedupes() {
        let (_d, s) = store();
        let a = s.put_bytes(b"hello media").unwrap();
        assert_eq!(a.hash, sha(b"hello media"));
        assert!(!a.deduplicated);
        let b = s.put_reader(Cursor::new(b"hello media".to_vec())).unwrap();
        assert!(b.deduplicated);
        assert_eq!(fs::read(s.path_for(&a.hash).unwrap()).unwrap(), b"hello media");
        assert_eq!(s.list().unwrap(), vec![a.hash.clone()]);
        s.verify(&a.hash, Some(11)).unwrap();
        assert_eq!(s.verify(&a.hash, Some(12)).unwrap_err().code, Code::MediaHashMismatch);
    }

    #[test]
    fn large_streaming_ingest_is_byte_identical() {
        let (_d, s) = store();
        let blob: Vec<u8> = (0..(5 * CHUNK + 123)).map(|i| (i % 251) as u8).collect();
        let st = s.put_reader(Cursor::new(blob.clone())).unwrap();
        assert_eq!(st.size, blob.len() as u64);
        assert_eq!(st.hash, sha(&blob));
        assert_eq!(fs::read(s.path_for(&st.hash).unwrap()).unwrap(), blob);
    }

    #[test]
    fn an_abandoned_intake_leaves_nothing_behind() {
        let (_d, s) = store();
        {
            let mut i = s.begin().unwrap();
            i.write(b"partial").unwrap();
        }
        assert!(s.list().unwrap().is_empty());
        let temps = fs::read_dir(s.dir()).unwrap().filter(|e| e.as_ref().unwrap().path().to_string_lossy().ends_with(TEMP_SUFFIX)).count();
        assert_eq!(temps, 0);
    }

    #[test]
    fn tampered_content_is_detected() {
        let (_d, s) = store();
        let a = s.put_bytes(b"original").unwrap();
        fs::write(s.path_for(&a.hash).unwrap(), b"tampered").unwrap();
        assert_eq!(s.verify(&a.hash, None).unwrap_err().code, Code::MediaHashMismatch);
    }

    #[test]
    fn hostile_ids_cannot_escape_the_media_directory() {
        let (_d, s) = store();
        for bad in ["../../etc/passwd", "ABCDEF", "", &"g".repeat(64), &"A".repeat(64)] {
            assert!(s.path_for(bad).is_err(), "{bad}");
        }
        assert!(!s.contains("../x"));
    }

    #[test]
    fn missing_media_has_a_specific_code() {
        let (_d, s) = store();
        assert_eq!(s.size_of(&sha(b"nope")).unwrap_err().code, Code::MediaMissing);
        assert_eq!(s.open(&sha(b"nope")).unwrap_err().code, Code::MediaMissing);
    }

    #[test]
    fn gc_removes_only_unreferenced_old_files_and_stale_temps() {
        let (_d, s) = store();
        let keep = s.put_bytes(b"keep me").unwrap();
        let orphan = s.put_bytes(b"orphan").unwrap();
        fs::write(s.dir().join("incoming-1-deadbeef.tmp"), b"crashed mid-write").unwrap();
        let referenced: HashSet<String> = [keep.hash.clone()].into();

        // too young: nothing may be removed
        let r = s.gc(&referenced, Duration::from_secs(3600)).unwrap();
        assert_eq!((r.removed_temp, r.removed_orphans), (0, 0));
        assert!(s.contains(&orphan.hash));

        // safety delay of zero: orphan + stale temp go, referenced stays
        let r = s.gc(&referenced, Duration::ZERO).unwrap();
        assert_eq!((r.removed_temp, r.removed_orphans), (1, 1));
        assert!(s.contains(&keep.hash));
        assert!(!s.contains(&orphan.hash));
        s.verify(&keep.hash, None).unwrap();
    }
}
