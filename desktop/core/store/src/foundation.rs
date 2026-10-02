//! The foundation catalog: structural tables every Quiz Studio store has, independent of any domain.
//!
//! * `meta` / `operation_journal` - store bookkeeping (not collections; never in archives).
//! * `media_object` - stable media id -> content hash mapping (ADR 0001 section 5.4).
//! * `setting` - canonical key/value settings (in archives, ADR 0001 section 8).
//! * `recovery_session` - recovery-only data (ADR 0001 section 5.5; excluded from archives and hashes).
//!
//! Domain collections (papers, responses, reviews, schedules, typing attempts...) are added by the
//! domain/Migration/Scheduler milestones as further migrations; none exist yet by design.

use crate::catalog::{Catalog, Collection, ColumnKind, Migration};

pub const MEDIA_COLLECTION: &str = "media_object";

const V1: &str = r#"
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE operation_journal(
  op_id TEXT PRIMARY KEY,
  kind  TEXT NOT NULL,
  mode  TEXT NOT NULL
);
CREATE TABLE media_object(
  id           TEXT PRIMARY KEY,
  rev          INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  size         INTEGER NOT NULL,
  mime         TEXT,
  name         TEXT,
  payload      TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE INDEX idx_media_object_hash ON media_object(content_hash);
CREATE TABLE setting(
  id      TEXT PRIMARY KEY,
  rev     INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE TABLE recovery_session(
  id      TEXT PRIMARY KEY,
  rev     INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload))
);
"#;

pub fn catalog() -> Catalog {
    let migrations = vec![Migration { version: 1, name: "foundation".into(), sql: V1.into() }];
    let collections = vec![
        Collection::new(MEDIA_COLLECTION)
            .id_pointer("/id")
            .column("content_hash", "/contentHash", ColumnKind::Text, true)
            .column("size", "/size", ColumnKind::Integer, true)
            .column("mime", "/mimeType", ColumnKind::Text, false)
            .column("name", "/name", ColumnKind::Text, false),
        Collection::new("setting"),
        Collection::new("recovery_session").recovery_only(),
    ];
    Catalog::new(migrations, collections).expect("foundation catalog is valid")
}
