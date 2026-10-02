//! The first domain catalog migration (store schema 1 -> 2; ADR 0002 section 7.1 / 15.4).
//!
//! Structured V1 records are stored as their exact JSON in `payload`; hard relationships V1 guarantees are
//! projected so SQLite foreign keys enforce them below JS. The one relationship a foreign key cannot express
//! here - remediation provenance, which only applies when `provenance.purpose == "remediation"` - is enforced
//! by the migrator's referential validation and re-proved by the conservation verifier instead (see the
//! milestone record).

use qs_store::{Catalog, Collection, ColumnKind, Migration, Relation};

pub const PAPER: &str = "paper";
pub const CATEGORIES: &str = "library_categories";
pub const LEARNER_RESPONSE: &str = "learner_response";
pub const TEACHER_REVIEW: &str = "teacher_review";
pub const FOLDER: &str = "translation_folder";
pub const DOCUMENT: &str = "translation_document";
pub const HISTORY: &str = "legacy_history_entry";
pub const RESIDUE: &str = "legacy_residue";
pub const ORIGIN: &str = "migration_origin";
pub const RUN: &str = "migration_run";
pub const UNDO: &str = "migration_undo";
pub const ARTIFACT: &str = "recovery_artifact";

/// Singleton id of the category list record.
pub const CATEGORIES_ID: &str = "categories";

const SQL: &str = r#"
CREATE TABLE paper(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  title TEXT, category TEXT, created_at TEXT, updated_at TEXT,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE paper_media(
  paper_id TEXT NOT NULL REFERENCES paper(id) DEFERRABLE INITIALLY DEFERRED,
  image_id TEXT REFERENCES media_object(id) DEFERRABLE INITIALLY DEFERRED,
  audio_id TEXT REFERENCES media_object(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY(paper_id, ordinal));
CREATE TABLE library_categories(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE learner_response(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  material_type TEXT NOT NULL, material_id TEXT, session_id TEXT, completed_at TEXT,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX idx_lr_material ON learner_response(material_type, material_id);
CREATE TABLE learner_response_media(
  response_id TEXT NOT NULL REFERENCES learner_response(id) DEFERRABLE INITIALLY DEFERRED,
  image_id TEXT REFERENCES media_object(id) DEFERRABLE INITIALLY DEFERRED,
  audio_id TEXT REFERENCES media_object(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY(response_id, ordinal));
CREATE TABLE teacher_review(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  response_id TEXT NOT NULL REFERENCES learner_response(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX idx_tr_response ON teacher_review(response_id);
CREATE TABLE translation_folder(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE translation_document(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  folder_id TEXT NOT NULL REFERENCES translation_folder(id) DEFERRABLE INITIALLY DEFERRED,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
-- soft relationship (history may outlive its source): NO foreign key on purpose (ADR 0001 section 5.3)
CREATE TABLE legacy_history_entry(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  role TEXT NOT NULL, twin_response_id TEXT,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE legacy_residue(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE migration_origin(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  source_id TEXT NOT NULL, collection_name TEXT NOT NULL, record_id TEXT NOT NULL, disposition TEXT NOT NULL, run_op_id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX idx_origin_run ON migration_origin(run_op_id);
CREATE INDEX idx_origin_record ON migration_origin(collection_name, record_id);
CREATE TABLE migration_run(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  source_id TEXT NOT NULL, recovery_id TEXT,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX idx_run_source ON migration_run(source_id);
CREATE TABLE migration_undo(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  undoes TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX idx_undo_run ON migration_undo(undoes);
CREATE TABLE recovery_artifact(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  size INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
"#;

fn media_relation(table: &str, owner: &str, pointer: &str) -> Relation {
    Relation::new(table, owner, pointer)
        .column("image_id", "/image/id", ColumnKind::Text, false)
        .column("audio_id", "/audio/id", ColumnKind::Text, false)
        .ordinal("ordinal")
}

/// The collections added by the migration domain schema. `media_object`, `setting` and `recovery_session`
/// already exist in the foundation catalog.
pub fn domain_collections() -> Vec<Collection> {
    vec![
        Collection::new(PAPER)
            .id_pointer("/id")
            .column("title", "/title", ColumnKind::Text, false)
            .column("category", "/category", ColumnKind::Text, false)
            .column("created_at", "/createdAt", ColumnKind::Text, false)
            .column("updated_at", "/updatedAt", ColumnKind::Text, false)
            .relation(media_relation("paper_media", "paper_id", "/questions")),
        Collection::new(CATEGORIES),
        Collection::new(LEARNER_RESPONSE)
            .id_pointer("/id")
            .column("material_type", "/material/type", ColumnKind::Text, true)
            .column("material_id", "/material/id", ColumnKind::Text, false)
            .column("session_id", "/session/id", ColumnKind::Text, false)
            .column("completed_at", "/session/completedAt", ColumnKind::Text, false)
            .relation(media_relation("learner_response_media", "response_id", "/material/snapshot/items")),
        Collection::new(TEACHER_REVIEW).id_pointer("/id").column("response_id", "/responseId", ColumnKind::Text, true).column(
            "created_at",
            "/createdAt",
            ColumnKind::Text,
            false,
        ),
        Collection::new(FOLDER).id_pointer("/id"),
        Collection::new(DOCUMENT).id_pointer("/id").column("folder_id", "/folderId", ColumnKind::Text, true),
        Collection::new(HISTORY).column("role", "/role", ColumnKind::Text, true).column(
            "twin_response_id",
            "/twinResponseId",
            ColumnKind::Text,
            false,
        ),
        Collection::new(RESIDUE),
        Collection::new(ORIGIN)
            .metadata()
            .column("source_id", "/sourceId", ColumnKind::Text, true)
            .column("collection_name", "/collection", ColumnKind::Text, true)
            .column("record_id", "/recordId", ColumnKind::Text, true)
            .column("disposition", "/disposition", ColumnKind::Text, true)
            .column("run_op_id", "/runOpId", ColumnKind::Text, true),
        Collection::new(RUN).metadata().id_pointer("/opId").column("source_id", "/sourceId", ColumnKind::Text, true).column(
            "recovery_id",
            "/recoveryId",
            ColumnKind::Text,
            false,
        ),
        Collection::new(UNDO).metadata().id_pointer("/opId").column("undoes", "/undoes", ColumnKind::Text, true),
        Collection::new(ARTIFACT).retained().id_pointer("/id").column("size", "/size", ColumnKind::Integer, true),
    ]
}

/// Foundation + the migration domain schema: the catalog the shipped app runs (store schema 2).
pub fn product_catalog() -> Catalog {
    Catalog::foundation()
        .extend(vec![Migration { version: 2, name: "v1-migration-domain".into(), sql: SQL.into() }], domain_collections())
        .expect("the product catalog is valid")
}
