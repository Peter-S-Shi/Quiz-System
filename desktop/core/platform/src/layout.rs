//! On-disk layout under the data root (ADR 0001 section 4).
//!
//! ```text
//! <root>/data/quiz-studio.db (+ -wal/-shm)   canonical structured data
//! <root>/data/media/<hh>/<sha256>            immutable content-addressed media
//! <root>/data/.lock                          single-writer process lock
//! <root>/staging/<operation-id>/             isolated, disposable
//! <root>/snapshots/                          pre-activation / pre-upgrade snapshots
//! <root>/journal/                            operation journal (atomic json files)
//! <root>/recovery-artifacts/                 raw/opaque artifacts, byte-for-byte
//! <root>/logs/
//! ```

use crate::error::{Code, Error, Result};
use crate::identity::APP_IDENTIFIER;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct DataRoot {
    root: PathBuf,
}

impl DataRoot {
    /// `%LOCALAPPDATA%\<app-id>` - never roaming, never OneDrive-redirected, never under the install directory.
    pub fn default_for_user() -> Result<DataRoot> {
        let base = std::env::var_os("LOCALAPPDATA").ok_or_else(|| Error::new(Code::Internal, "LOCALAPPDATA is not set"))?;
        Ok(DataRoot { root: PathBuf::from(base).join(APP_IDENTIFIER) })
    }

    /// An explicit root (tests, self-test, tooling). The shipped app never lets the user choose one.
    pub fn at(root: impl Into<PathBuf>) -> DataRoot {
        DataRoot { root: root.into() }
    }

    pub fn path(&self) -> &Path {
        &self.root
    }
    pub fn data_dir(&self) -> PathBuf {
        self.root.join("data")
    }
    pub fn db_path(&self) -> PathBuf {
        self.data_dir().join("quiz-studio.db")
    }
    pub fn lock_path(&self) -> PathBuf {
        self.data_dir().join(".lock")
    }
    pub fn media_dir(&self) -> PathBuf {
        self.data_dir().join("media")
    }
    pub fn staging_dir(&self) -> PathBuf {
        self.root.join("staging")
    }
    pub fn snapshots_dir(&self) -> PathBuf {
        self.root.join("snapshots")
    }
    pub fn journal_dir(&self) -> PathBuf {
        self.root.join("journal")
    }
    pub fn recovery_artifacts_dir(&self) -> PathBuf {
        self.root.join("recovery-artifacts")
    }
    pub fn logs_dir(&self) -> PathBuf {
        self.root.join("logs")
    }

    pub fn ensure(&self) -> Result<()> {
        for d in [
            self.data_dir(),
            self.media_dir(),
            self.staging_dir(),
            self.snapshots_dir(),
            self.journal_dir(),
            self.recovery_artifacts_dir(),
            self.logs_dir(),
        ] {
            std::fs::create_dir_all(&d)?;
        }
        Ok(())
    }
}
