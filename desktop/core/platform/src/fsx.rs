//! Durable file operations.
//!
//! * `write_atomic` / `publish` - temp file, fsync, atomic rename **with bounded retry** for transient
//!   sharing violations such as an antivirus scanner holding a fresh temp file (ADR 0001 A6).
//! * `sqlite_path` - verbatim `\\?\` form when the path is beyond `MAX_PATH` (ADR 0001 A7).
//! * `ProcessLock` - the exclusive single-writer lock (ADR 0001 section 4).

use crate::error::{Code, Error, Result};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

const RENAME_ATTEMPTS: u32 = 40;
const RENAME_BACKOFF: Duration = Duration::from_millis(50);
/// Plain Win32 paths fail beyond 260; stay clear of it so a file name can still be appended.
const LONG_PATH_THRESHOLD: usize = 240;

/// Rename that retries on transient failures (sharing violations / access denied from scanners).
pub fn rename_retry(from: &Path, to: &Path) -> Result<()> {
    let mut last = None;
    for attempt in 0..RENAME_ATTEMPTS {
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) => {
                last = Some(e);
                if attempt + 1 < RENAME_ATTEMPTS {
                    std::thread::sleep(RENAME_BACKOFF);
                }
            }
        }
    }
    Err(Error::new(
        Code::Io,
        format!("rename failed after {RENAME_ATTEMPTS} attempts: {}", last.map(|e| e.to_string()).unwrap_or_default()),
    ))
}

/// Replace `dest` with `bytes` atomically: a reader sees the old or the new content, never a torn file.
pub fn write_atomic(dest: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = temp_sibling(dest);
    {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    rename_retry(&tmp, dest)
}

/// A unique sibling temp name (`<name>.<pid>.<rand>.tmp`) in the same directory, so rename stays on one volume.
pub fn temp_sibling(dest: &Path) -> PathBuf {
    let name = dest.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    dest.with_file_name(format!("{name}.{}.{:08x}.tmp", std::process::id(), fastrand::u32(..)))
}

/// Path form SQLite can open. Beyond the plain-path limit use the verbatim `\\?\` form of the
/// canonicalized parent directory.
pub fn sqlite_path(db: &Path) -> Result<PathBuf> {
    if db.as_os_str().len() <= LONG_PATH_THRESHOLD {
        return Ok(db.to_path_buf());
    }
    let parent = db.parent().ok_or_else(|| Error::new(Code::Internal, "database path has no parent"))?;
    let file = db.file_name().ok_or_else(|| Error::new(Code::Internal, "database path has no file name"))?;
    Ok(fs::canonicalize(parent)?.join(file))
}

pub fn sha256_file(path: &Path) -> Result<String> {
    let mut f = File::open(path)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex::encode(h.finalize()))
}

pub fn remove_dir_all_quiet(path: &Path) {
    let _ = fs::remove_dir_all(path);
}

/// Exclusive, advisory single-writer lock held for the life of the value. Released by the OS when the
/// process exits or is killed, so a crash never leaves a stale lock.
#[derive(Debug)]
pub struct ProcessLock {
    _file: File,
}

impl ProcessLock {
    pub fn acquire(path: &Path) -> Result<ProcessLock> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let file = File::options().create(true).truncate(false).write(true).open(path)?;
        match file.try_lock() {
            Ok(()) => Ok(ProcessLock { _file: file }),
            Err(fs::TryLockError::WouldBlock) => Err(Error::new(Code::Locked, "another process owns the Quiz Studio data store")),
            Err(fs::TryLockError::Error(e)) => Err(Error::new(Code::Io, format!("lock failed: {e}"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_atomic_replaces_content_and_leaves_no_temp() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.json");
        write_atomic(&p, b"one").unwrap();
        write_atomic(&p, b"two").unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"two");
        let leftovers: Vec<_> = fs::read_dir(d.path()).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(leftovers.len(), 1, "{leftovers:?}");
    }

    #[test]
    fn process_lock_is_exclusive_and_released_on_drop() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(".lock");
        let a = ProcessLock::acquire(&p).unwrap();
        let err = ProcessLock::acquire(&p).unwrap_err();
        assert_eq!(err.code, Code::Locked);
        drop(a);
        ProcessLock::acquire(&p).unwrap();
    }

    #[test]
    fn long_paths_use_verbatim_form() {
        let d = tempfile::tempdir().unwrap();
        let mut dir = d.path().to_path_buf();
        while dir.as_os_str().len() < 300 {
            dir.push("segment-with-a-fairly-long-name");
        }
        // creating the tree itself needs the verbatim form on Windows
        let v = if cfg!(windows) { PathBuf::from(format!(r"\\?\{}", dir.display())) } else { dir.clone() };
        fs::create_dir_all(&v).unwrap();
        let db = dir.join("quiz-studio.db");
        let p = sqlite_path(&db).unwrap();
        if cfg!(windows) {
            assert!(p.to_string_lossy().starts_with(r"\\?\"), "{p:?}");
        }
        fs::write(&p, b"x").unwrap();
    }
}
