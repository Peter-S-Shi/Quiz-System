//! One error type with stable, machine-readable codes. The WebView and tests match on `Code`,
//! never on message text (ADR 0001 A8: "specific refusal codes").

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Code {
    Io,
    Db,
    Internal,
    NotFound,
    /// Another process owns the single-writer lock.
    Locked,
    /// File is not a Quiz Studio store.
    NotAStore,
    /// Store schema is newer than this build understands (downgrade refused, nothing written).
    SchemaNewer,
    /// The catalog (code) and the database schema disagree.
    CatalogMismatch,
    /// Startup integrity (`quick_check` / consistency) failed.
    IntegrityFailed,
    /// A schema upgrade failed; the pre-upgrade state was restored.
    UpgradeFailed,
    RejectShape,
    RejectPrecondition,
    RejectProjection,
    RejectConstraint,
    ValidationFailed,
    ActivationFailed,
    MediaMissing,
    MediaHashMismatch,
    ArchiveWrongFormat,
    ArchiveCorrupt,
    ArchiveMissingEntry,
    ArchiveUnlistedEntry,
    ArchiveHashMismatch,
    ArchiveNewerSchema,
    ArchiveInvalidStore,
    /// A maintenance gate (an activation window) is open; the write was refused, nothing changed.
    StoreBusy,
}

impl Code {
    pub fn as_str(self) -> &'static str {
        match self {
            Code::Io => "IO",
            Code::Db => "DB",
            Code::Internal => "INTERNAL",
            Code::NotFound => "NOT_FOUND",
            Code::Locked => "LOCKED",
            Code::NotAStore => "NOT_A_STORE",
            Code::SchemaNewer => "SCHEMA_NEWER",
            Code::CatalogMismatch => "CATALOG_MISMATCH",
            Code::IntegrityFailed => "INTEGRITY_FAILED",
            Code::UpgradeFailed => "UPGRADE_FAILED",
            Code::RejectShape => "REJECT_SHAPE",
            Code::RejectPrecondition => "REJECT_PRECONDITION",
            Code::RejectProjection => "REJECT_PROJECTION",
            Code::RejectConstraint => "REJECT_CONSTRAINT",
            Code::ValidationFailed => "VALIDATION_FAILED",
            Code::ActivationFailed => "ACTIVATION_FAILED",
            Code::MediaMissing => "MEDIA_MISSING",
            Code::MediaHashMismatch => "MEDIA_HASH_MISMATCH",
            Code::ArchiveWrongFormat => "ARCHIVE_WRONG_FORMAT",
            Code::ArchiveCorrupt => "ARCHIVE_CORRUPT",
            Code::ArchiveMissingEntry => "ARCHIVE_MISSING_ENTRY",
            Code::ArchiveUnlistedEntry => "ARCHIVE_UNLISTED_ENTRY",
            Code::ArchiveHashMismatch => "ARCHIVE_HASH_MISMATCH",
            Code::ArchiveNewerSchema => "ARCHIVE_NEWER_SCHEMA",
            Code::ArchiveInvalidStore => "ARCHIVE_INVALID_STORE",
            Code::StoreBusy => "STORE_BUSY",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Error {
    pub code: Code,
    pub message: String,
}

pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    pub fn new(code: Code, message: impl Into<String>) -> Self {
        Error { code, message: message.into() }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code.as_str(), self.message)
    }
}
impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::new(Code::Io, e.to_string())
    }
}

/// Attach a code to any displayable error: `.code(Code::Db)?`.
pub trait ResultExt<T> {
    fn code(self, code: Code) -> Result<T>;
    fn ctx(self, code: Code, what: &str) -> Result<T>;
}
impl<T, E: fmt::Display> ResultExt<T> for std::result::Result<T, E> {
    fn code(self, code: Code) -> Result<T> {
        self.map_err(|e| Error::new(code, e.to_string()))
    }
    fn ctx(self, code: Code, what: &str) -> Result<T> {
        self.map_err(|e| Error::new(code, format!("{what}: {e}")))
    }
}

#[macro_export]
macro_rules! bail {
    ($code:expr, $($arg:tt)*) => { return Err($crate::Error::new($code, format!($($arg)*))) };
}
