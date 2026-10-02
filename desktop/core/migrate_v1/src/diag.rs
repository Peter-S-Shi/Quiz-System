//! Diagnostics (ADR 0002 section 11): structured, never free text built from user content.
//!
//! A condition is **blocking** iff proceeding would require guessing, discarding or altering canonical data, or
//! would break a hard relationship; **reportable** iff every source fact is carried or explicitly listed and
//! nothing was guessed. Activation is allowed iff the blocking count is zero.

use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Blocking,
    Reportable,
}

impl Severity {
    pub fn as_str(self) -> &'static str {
        match self {
            Severity::Blocking => "blocking",
            Severity::Reportable => "reportable",
        }
    }
}

use Severity::{Blocking as B, Reportable as R};

/// The closed registry: (code, severity, stage). Every code the migrator can emit is here; a test asserts that
/// every blocking code has at least one fixture and that no undeclared code is ever emitted.
pub const CODES: &[(&str, Severity, &str)] = &[
    // intake
    ("MIG_SOURCE_UNREADABLE", B, "intake"),
    ("MIG_INSUFFICIENT_SPACE", B, "intake"),
    ("MIG_SOURCE_NOT_UTF8", B, "intake"),
    ("MIG_SOURCE_NOT_JSON", B, "intake"),
    ("MIG_SOURCE_WRONG_KIND", B, "intake"),
    ("MIG_SOURCE_DECLARED_CONFLICT", B, "intake"),
    ("MIG_SOURCE_NOT_A_BACKUP", B, "intake"),
    ("MIG_ENVELOPE_UNDECLARED", R, "intake"),
    // reader
    ("MIG_SOURCE_DUPLICATE_KEY", B, "reader"),
    ("MIG_SOURCE_LONE_SURROGATE", B, "reader"),
    ("MIG_SOURCE_UNSAFE_NUMBER", B, "reader"),
    ("MIG_SOURCE_TOO_LARGE", B, "reader"),
    // detection
    ("MIG_SECTION_SHAPE", B, "detection"),
    ("MIG_RECORD_KIND_UNKNOWN", B, "detection"),
    ("MIG_RECORD_UNIDENTIFIABLE", B, "detection"),
    ("MIG_ENVELOPE_VERSION_UNEXPECTED", R, "detection"),
    ("MIG_LIBRARY_PREVERSIONED", R, "detection"),
    ("MIG_SECTION_ABSENT", R, "detection"),
    ("MIG_ASSETS_ALIAS_USED", R, "detection"),
    // identity
    ("MIG_IDENTITY_AMBIGUOUS", B, "identity"),
    ("MIG_LIVE_CONFLICT", B, "identity"),
    ("MIG_HISTORY_DUPLICATE_COLLAPSED", R, "identity"),
    ("MIG_EXISTING_IDENTICAL", R, "identity"),
    // referential
    ("MIG_REF_UNRESOLVED", B, "referential"),
    ("MIG_LEARNER_RESPONSE_INVARIANT", B, "referential"),
    ("MIG_PROVENANCE_DANGLING", R, "referential"),
    // media
    ("MIG_MEDIA_MISSING", B, "media"),
    ("MIG_MEDIA_PAYLOAD_INVALID", B, "media"),
    ("MIG_MEDIA_SIZE_MISMATCH", B, "media"),
    ("MIG_MEDIA_CONFLICT", B, "media"),
    ("MIG_MEDIA_MIME_CLASS", B, "media"),
    ("MIG_MEDIA_DUPLICATE_IDENTICAL", R, "media"),
    ("MIG_MEDIA_SHARED_CONTENT", R, "media"),
    ("MIG_MEDIA_UNREFERENCED_NOT_MIGRATED", R, "media"),
    ("MIG_MEDIA_ID_IN_UNMODELED_FIELD", R, "media"),
    // semantic
    ("MIG_ANCHOR_MISMATCH", B, "semantic"),
    ("MIG_OFFSET_SPLITS_SURROGATE", R, "semantic"),
    ("MIG_HISTORY_TWIN_DIVERGENT", R, "semantic"),
    ("MIG_HISTORY_RESPONSE_KIND_MISMATCH", R, "semantic"),
    ("MIG_HISTORY_CAP_POSSIBLE", R, "semantic"),
    ("MIG_UNKNOWN_FIELD_PRESERVED", R, "semantic"),
    ("MIG_RESIDUE_PRESERVED", R, "semantic"),
    ("MIG_TIMESTAMP_ABSENT", R, "semantic"),
    ("MIG_GAPS_DECLARED", R, "semantic"),
    // artifact
    ("MIG_RECOVERY_ARTIFACT_UNRECOGNIZED", B, "artifact"),
    ("MIG_RECOVERY_ARTIFACT_PRESERVED", R, "artifact"),
    // internal
    ("MIG_LEDGER_INCOMPLETE", B, "internal"),
    ("MIG_STAGING_INVALID", B, "internal"),
    ("ACTIVATION_POST_VERIFY_FAILED", B, "internal"),
    // run
    ("MIG_ALREADY_MIGRATED", R, "run"),
];

pub fn lookup(code: &str) -> Option<(Severity, &'static str)> {
    CODES.iter().find(|(c, _, _)| *c == code).map(|(_, s, st)| (*s, *st))
}

#[derive(Debug, Clone)]
pub struct Diag {
    pub code: &'static str,
    pub severity: Severity,
    pub stage: &'static str,
    pub pointer: Option<String>,
    /// Structured data only; user text may appear here as *data* but never inside a built message.
    pub params: Value,
}

impl Diag {
    pub fn new(code: &'static str, pointer: Option<&str>, params: Value) -> Diag {
        let (severity, stage) = lookup(code).unwrap_or_else(|| panic!("diagnostic code {code} is not in the registry"));
        Diag { code, severity, stage, pointer: pointer.map(str::to_string), params }
    }
    pub fn is_blocking(&self) -> bool {
        self.severity == Severity::Blocking
    }
    pub fn to_json(&self) -> Value {
        json!({"code": self.code, "severity": self.severity.as_str(), "stage": self.stage, "pointer": self.pointer, "params": self.params})
    }
}

/// Order stages are evaluated in; a failing stage stops later stages (all of that stage's problems are still collected).
pub const STAGE_ORDER: &[&str] =
    &["intake", "reader", "detection", "identity", "referential", "media", "semantic", "artifact", "internal", "run"];

#[derive(Debug, Default, Clone)]
pub struct Diags {
    pub list: Vec<Diag>,
}

impl Diags {
    pub fn push(&mut self, d: Diag) {
        self.list.push(d);
    }
    pub fn add(&mut self, code: &'static str, pointer: Option<&str>, params: Value) {
        self.list.push(Diag::new(code, pointer, params));
    }
    pub fn extend(&mut self, other: Diags) {
        self.list.extend(other.list);
    }
    pub fn blocking(&self) -> Vec<&Diag> {
        self.list.iter().filter(|d| d.is_blocking()).collect()
    }
    pub fn blocking_count(&self) -> usize {
        self.list.iter().filter(|d| d.is_blocking()).count()
    }
    pub fn has_blocking_in(&self, stage: &str) -> bool {
        self.list.iter().any(|d| d.is_blocking() && d.stage == stage)
    }
    pub fn codes(&self) -> Vec<&'static str> {
        self.list.iter().map(|d| d.code).collect()
    }
    pub fn to_json(&self) -> Value {
        Value::Array(self.list.iter().map(Diag::to_json).collect())
    }
}

/// RFC 6901 pointer segment escaping.
pub fn esc(seg: &str) -> String {
    seg.replace('~', "~0").replace('/', "~1")
}
