use qs_store::{Catalog, Collection, ColumnKind, Migration, Relation};

const EVIDENCE_V2_SQL: &str = r#"
CREATE TABLE learner_response(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  paper_id TEXT NOT NULL, title TEXT, finalized_at TEXT, item_count INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX idx_lr_finalized ON learner_response(finalized_at DESC);
CREATE TABLE response_item(
  response_id TEXT NOT NULL REFERENCES learner_response(id) DEFERRABLE INITIALLY DEFERRED,
  item_id TEXT NOT NULL, ord INTEGER NOT NULL,
  PRIMARY KEY(response_id, item_id));
CREATE TABLE media_ref(
  owner_id TEXT NOT NULL REFERENCES learner_response(id) DEFERRABLE INITIALLY DEFERRED,
  media_id TEXT NOT NULL REFERENCES media_object(id) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(owner_id, media_id));
CREATE TABLE teacher_review(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  response_id TEXT NOT NULL REFERENCES learner_response(id) DEFERRABLE INITIALLY DEFERRED,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX idx_tr_response ON teacher_review(response_id);
CREATE TABLE remediation_doc(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  source_response_id TEXT NOT NULL REFERENCES learner_response(id) DEFERRABLE INITIALLY DEFERRED,
  source_review_id TEXT REFERENCES teacher_review(id) DEFERRABLE INITIALLY DEFERRED,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
-- soft provenance: NO foreign key on purpose (history may outlive its source, ADR 0001 section 5.3)
CREATE TABLE history_entry(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  response_id TEXT,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE uow_marker(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  n INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
"#;

fn evidence_collections() -> Vec<Collection> {
    vec![
        Collection::new("learner_response")
            .id_pointer("/id")
            .column("paper_id", "/paperId", ColumnKind::Text, true)
            .column("title", "/title", ColumnKind::Text, false)
            .column("finalized_at", "/finalizedAt", ColumnKind::Text, false)
            .column("item_count", "/itemCount", ColumnKind::Integer, true)
            .relation(Relation::new("response_item", "response_id", "/items").column("item_id", "", ColumnKind::Text, true).ordinal("ord"))
            .relation(Relation::new("media_ref", "owner_id", "/mediaRefs").column("media_id", "", ColumnKind::Text, true).dedupe()),
        Collection::new("teacher_review")
            .id_pointer("/id")
            .column("response_id", "/responseId", ColumnKind::Text, true),
        Collection::new("remediation_doc")
            .id_pointer("/id")
            .column("source_response_id", "/sourceResponseId", ColumnKind::Text, true)
            .column("source_review_id", "/sourceReviewId", ColumnKind::Text, false),
        Collection::new("history_entry").id_pointer("/id").column("response_id", "/responseId", ColumnKind::Text, false),
        Collection::new("uow_marker").id_pointer("/id").column("n", "/n", ColumnKind::Integer, true),
    ]
}

/// Foundation + synthetic evidence tables (store schema v2 of the *test* lineage).
pub fn evidence_catalog() -> Catalog {
    Catalog::foundation()
        .extend(
            vec![Migration { version: 2, name: "test-evidence-tables".into(), sql: EVIDENCE_V2_SQL.into() }],
            evidence_collections(),
        )
        .expect("valid test catalog")
}

/// One schema step beyond `evidence_catalog` (adds a column and backfills it) - for upgrade tests.
pub fn evidence_catalog_v2() -> Catalog {
    let mut cols = evidence_collections();
    cols[0] = cols.remove(0).column("summary_len", "/itemCount", ColumnKind::Integer, false);
    Catalog::foundation()
        .extend(
            vec![
                Migration { version: 2, name: "test-evidence-tables".into(), sql: EVIDENCE_V2_SQL.into() },
                Migration {
                    version: 3,
                    name: "test-add-summary-len".into(),
                    sql: "ALTER TABLE learner_response ADD COLUMN summary_len INTEGER; UPDATE learner_response SET summary_len = json_extract(payload,'$.itemCount');".into(),
                },
            ],
            cols,
        )
        .expect("valid test catalog")
}

/// Like `evidence_catalog_v2` but the migration does partial work and then fails.
pub fn evidence_catalog_v2_failing() -> Catalog {
    let mut cols = evidence_collections();
    cols[0] = cols.remove(0).column("summary_len", "/itemCount", ColumnKind::Integer, false);
    Catalog::foundation()
        .extend(
            vec![
                Migration { version: 2, name: "test-evidence-tables".into(), sql: EVIDENCE_V2_SQL.into() },
                Migration {
                    version: 3,
                    name: "test-failing-migration".into(),
                    sql: "ALTER TABLE learner_response ADD COLUMN summary_len INTEGER; UPDATE learner_response SET summary_len = -1; INSERT INTO nonexistent_table VALUES(1);".into(),
                },
            ],
            cols,
        )
        .expect("valid test catalog")
}
