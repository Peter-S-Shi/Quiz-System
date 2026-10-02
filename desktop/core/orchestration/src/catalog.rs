//! Store schema 2 -> 3: the five Scheduling Context collections (ADR 0003 sections 5, 7 and 15).
//!
//! All five have the catalog role `context`: durable user data that is archived and restored with the store, is
//! never Evidence and is outside `Catalog::domain_collections()`. The single-active-schedule, single-pending-
//! suggestion, one-fulfillment-per-occurrence and one-fulfillment-per-session invariants are **database**
//! constraints (partial unique indexes), not only domain code. Revision binding of a suggestion is enforced by
//! the Unit of Work's `rev` preconditions (`schedule.rev == suggestion.scheduleRev`).
//!
//! Implementation note: the ADR describes a `slot_key` projection; the slot is projected as its four component
//! columns instead, so the partial unique index needs no computed field inside the payload.

use qs_store::{Catalog, Collection, ColumnKind, Migration};

pub const SCHEDULE: &str = "schedule";
pub const EXCEPTION: &str = "schedule_exception";
pub const FULFILLMENT: &str = "schedule_fulfillment";
pub const SUGGESTION: &str = "schedule_suggestion";
pub const SELECTION: &str = "session_selection";

/// The five collection names.
pub const SCHEDULING_COLLECTIONS: [&str; 5] = [SCHEDULE, EXCEPTION, FULFILLMENT, SUGGESTION, SELECTION];

const SQL: &str = r#"
CREATE TABLE schedule(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  domain TEXT NOT NULL, material_type TEXT NOT NULL, material_id TEXT NOT NULL,
  intent TEXT NOT NULL CHECK(intent IN ('practice','test')),
  owner TEXT NOT NULL CHECK(owner IN ('engine','user')),
  status TEXT NOT NULL CHECK(status IN ('active','cancelled','completed')),
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE UNIQUE INDEX ux_schedule_active_slot ON schedule(domain, material_type, material_id, intent) WHERE status='active';
CREATE INDEX idx_schedule_material ON schedule(material_type, material_id);
CREATE TABLE schedule_exception(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  schedule_id TEXT NOT NULL REFERENCES schedule(id) DEFERRABLE INITIALLY DEFERRED,
  original_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('moved','cancelled')),
  moved_to TEXT,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE UNIQUE INDEX ux_exception_occurrence ON schedule_exception(schedule_id, original_date);
CREATE TABLE schedule_fulfillment(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  schedule_id TEXT NOT NULL REFERENCES schedule(id) DEFERRABLE INITIALLY DEFERRED,
  original_date TEXT NOT NULL,
  session_collection TEXT NOT NULL, session_id TEXT NOT NULL,
  fulfilled_on TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE UNIQUE INDEX ux_fulfillment_occurrence ON schedule_fulfillment(schedule_id, original_date);
CREATE UNIQUE INDEX ux_fulfillment_session ON schedule_fulfillment(session_collection, session_id);
CREATE TABLE schedule_suggestion(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  schedule_id TEXT NOT NULL REFERENCES schedule(id) DEFERRABLE INITIALLY DEFERRED,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','kept','superseded')),
  schedule_rev INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE UNIQUE INDEX ux_suggestion_pending ON schedule_suggestion(schedule_id) WHERE status='pending';
CREATE INDEX idx_suggestion_schedule ON schedule_suggestion(schedule_id);
CREATE TABLE session_selection(
  id TEXT PRIMARY KEY, rev INTEGER NOT NULL,
  session_collection TEXT NOT NULL, session_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('manual','recommended')),
  schedule_id TEXT REFERENCES schedule(id) DEFERRABLE INITIALLY DEFERRED,
  payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE UNIQUE INDEX ux_selection_session ON session_selection(session_collection, session_id);
"#;

/// The five collections with their projections (hard FKs live in the SQL above).
pub fn scheduling_collections() -> Vec<Collection> {
    vec![
        Collection::new(SCHEDULE)
            .context()
            .id_pointer("/id")
            .column("domain", "/slot/domain", ColumnKind::Text, true)
            .column("material_type", "/slot/material/type", ColumnKind::Text, true)
            .column("material_id", "/slot/material/id", ColumnKind::Text, true)
            .column("intent", "/slot/intent", ColumnKind::Text, true)
            .column("owner", "/owner", ColumnKind::Text, true)
            .column("status", "/status", ColumnKind::Text, true),
        Collection::new(EXCEPTION)
            .context()
            .id_pointer("/id")
            .column("schedule_id", "/scheduleId", ColumnKind::Text, true)
            .column("original_date", "/originalDate", ColumnKind::Text, true)
            .column("kind", "/kind", ColumnKind::Text, true)
            .column("moved_to", "/movedTo", ColumnKind::Text, false),
        Collection::new(FULFILLMENT)
            .context()
            .id_pointer("/id")
            .column("schedule_id", "/scheduleId", ColumnKind::Text, true)
            .column("original_date", "/originalDate", ColumnKind::Text, true)
            .column("session_collection", "/session/collection", ColumnKind::Text, true)
            .column("session_id", "/session/id", ColumnKind::Text, true)
            .column("fulfilled_on", "/fulfilledOn", ColumnKind::Text, true),
        Collection::new(SUGGESTION)
            .context()
            .id_pointer("/id")
            .column("schedule_id", "/scheduleId", ColumnKind::Text, true)
            .column("status", "/status", ColumnKind::Text, true)
            .column("schedule_rev", "/scheduleRev", ColumnKind::Integer, true),
        Collection::new(SELECTION)
            .context()
            .id_pointer("/id")
            .column("session_collection", "/session/collection", ColumnKind::Text, true)
            .column("session_id", "/session/id", ColumnKind::Text, true)
            .column("source", "/selection/source", ColumnKind::Text, true)
            .column("schedule_id", "/scheduleRef/scheduleId", ColumnKind::Text, false),
    ]
}

/// Foundation + migration domain schema + Scheduling Context: the catalog the shipped app runs (store schema 3).
pub fn product_catalog() -> Catalog {
    qs_migrate_v1::product_catalog()
        .extend(vec![Migration { version: 3, name: "learning-orchestration".into(), sql: SQL.into() }], scheduling_collections())
        .expect("the product catalog is valid")
}
