//! Minimal THROWAWAY tables needed to exercise H2-H6. Not a proposed domain schema (ADR 0001 §5.3).
pub const APPLICATION_ID: i32 = 0x5153_5632; // "QSV2"
#[cfg(not(feature = "v2"))]
pub const SCHEMA_VERSION: i32 = 1;
#[cfg(feature = "v2")]
pub const SCHEMA_VERSION: i32 = 2;

/// Canonical tables in dependency order (parents first). Used by state hash / copy / delete.
pub const TABLES: &[&str] = &[
    "media_object",
    "learner_response",
    "response_item",
    "media_ref",
    "teacher_review",
    "remediation_doc",
    "history_entry",
    "recovery_session",
    "uow_marker",
];

pub const DDL_V1: &str = r#"
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE applied_ops(op_id TEXT PRIMARY KEY, kind TEXT NOT NULL, mode TEXT NOT NULL);
CREATE TABLE media_object(id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, mime TEXT, name TEXT, size INTEGER NOT NULL);
CREATE TABLE learner_response(
  id TEXT PRIMARY KEY, paper_id TEXT NOT NULL, title TEXT, finalized_at TEXT, item_count INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX idx_lr_finalized ON learner_response(finalized_at DESC);
CREATE TABLE response_item(
  response_id TEXT NOT NULL REFERENCES learner_response(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  item_id TEXT NOT NULL, ord INTEGER NOT NULL, PRIMARY KEY(response_id, item_id));
CREATE TABLE media_ref(
  owner_id TEXT NOT NULL REFERENCES learner_response(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  media_id TEXT NOT NULL REFERENCES media_object(id) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(owner_id, media_id));
CREATE TABLE teacher_review(
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES learner_response(id) DEFERRABLE INITIALLY DEFERRED,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX idx_tr_response ON teacher_review(response_id);
CREATE TABLE remediation_doc(
  id TEXT PRIMARY KEY,
  source_response_id TEXT NOT NULL REFERENCES learner_response(id) DEFERRABLE INITIALLY DEFERRED,
  source_review_id TEXT REFERENCES teacher_review(id) DEFERRABLE INITIALLY DEFERRED,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
-- soft provenance: NO foreign key on purpose (history may outlive its source)
CREATE TABLE history_entry(id TEXT PRIMARY KEY, response_id TEXT, payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE recovery_session(id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE uow_marker(n INTEGER PRIMARY KEY, rows INTEGER NOT NULL, payload TEXT NOT NULL);
"#;

/// H6 v2 migration: add a column + backfill from payload.
pub const MIGRATION_1_TO_2: &str = r#"
ALTER TABLE learner_response ADD COLUMN summary_len INTEGER;
UPDATE learner_response SET summary_len = json_array_length(payload, '$.responses');
"#;
