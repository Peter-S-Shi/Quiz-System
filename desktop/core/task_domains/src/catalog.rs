//! Store schema 3 -> 4: the Typing collections (ADR 0004 sections 8 and 11).
//!
//! * `typing_text` — Content (a learner-supplied reference text), role `canonical`.
//! * `typing_attempt` — Evidence (an immutable copy-typing record), role `canonical`.
//!
//! Both are canonical, so they appear in `Catalog::domain_collections()`, in archives, state hashes and backups.
//! Every reference (material, session, source attempt) is **soft**: no foreign key, so lineage and snapshots
//! survive deletion of the live text (ADR 0002 I-8 precedent). Nothing else in the store changes.

use qs_store::{Catalog, Collection, ColumnKind, Migration};

pub const TYPING_TEXT: &str = "typing_text";
pub const TYPING_ATTEMPT: &str = "typing_attempt";

/// The two collection names.
pub const TYPING_COLLECTIONS: [&str; 2] = [TYPING_TEXT, TYPING_ATTEMPT];

const SQL: &str = r#"
CREATE TABLE typing_text(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  title TEXT, created_at TEXT, updated_at TEXT,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
-- soft relationships on purpose: material, session and source attempt may outlive (or never have had) a row
CREATE TABLE typing_attempt(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  material_id TEXT, session_id TEXT, completed_at TEXT,
  intent TEXT NOT NULL CHECK(intent IN ('practice','test')),
  source_attempt_id TEXT,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX idx_typing_attempt_material ON typing_attempt(material_id);
"#;

/// The two collections with their projections.
pub fn task_domain_collections() -> Vec<Collection> {
    vec![
        Collection::new(TYPING_TEXT)
            .id_pointer("/id")
            .column("title", "/title", ColumnKind::Text, false)
            .column("created_at", "/createdAt", ColumnKind::Text, false)
            .column("updated_at", "/updatedAt", ColumnKind::Text, false),
        Collection::new(TYPING_ATTEMPT)
            .id_pointer("/id")
            .column("material_id", "/material/id", ColumnKind::Text, false)
            .column("session_id", "/session/id", ColumnKind::Text, false)
            .column("completed_at", "/session/completedAt", ColumnKind::Text, false)
            .column("intent", "/intent", ColumnKind::Text, true)
            .column("source_attempt_id", "/provenance/sourceAttemptId", ColumnKind::Text, false),
    ]
}

/// Foundation + migration schema + Scheduling Context + Typing: the catalog the shipped app runs (store schema 4).
pub fn product_catalog() -> Catalog {
    qs_orchestration::product_catalog()
        .extend(vec![Migration { version: 4, name: "task-domain-typing".into(), sql: SQL.into() }], task_domain_collections())
        .expect("the product catalog is valid")
}
