//! Store schema 4 (ADR 0004 section 11 and 13.5): `typing_text` (Content) and `typing_attempt` (Evidence) are
//! canonical collections with soft references only; the upgrade is forward-only and safe; both travel with archives,
//! state hashes and backups; nothing else changes.

use qs_platform::Code;
use qs_store::{Catalog, Migration, OpenOptions, Role, Store};
use qs_task_domains::*;
use qs_testkit::*;
use serde_json::{json, Value};
use std::sync::Arc;

fn catalog() -> Arc<Catalog> {
    Arc::new(product_catalog())
}

fn text(id: &str) -> Value {
    json!({"schemaVersion": 1, "id": id, "title": "Copy text", "text": "environment",
           "createdAt": "2026-10-02T00:00:00Z", "updatedAt": "2026-10-02T00:00:00Z"})
}

fn attempt(id: &str, material: &str, source: Option<&str>) -> Value {
    let mut prov = json!({"purpose": if source.is_some() { "retry" } else { "practice" }, "createdAt": "2026-10-02T10:00:00Z"});
    if let Some(s) = source {
        prov["sourceAttemptId"] = json!(s);
    }
    json!({"schemaVersion": 1, "id": id, "status": "finalized",
           "material": {"type": "typing-text", "id": material, "title": "Copy text", "snapshot": {"text": "environment"}},
           "session": {"id": format!("sess-{id}"), "startedAt": "2026-10-02T09:59:00Z", "completedAt": "2026-10-02T10:00:00Z"},
           "intent": "practice", "policy": {"feedbackTiming": "live", "corrections": "allowed"},
           "committed": {"text": "enviroment"},
           "comparison": {"version": "typing-compare/1", "normalization": "NFC",
                          "segmentation": "extended-grapheme-cluster", "offsetEncoding": "utf16-code-unit"},
           "counts": {"referenceGraphemes": 11, "committedGraphemes": 10},
           "errors": [{"kind": "omission", "reference": {"start": 5, "end": 6}, "committed": {"start": 5, "end": 5}}],
           "provenance": prov})
}

#[test]
fn the_typing_collections_are_canonical_evidence_domain_data_with_only_soft_references() {
    let c = catalog();
    assert_eq!(c.schema_version(), 4);
    for n in TYPING_COLLECTIONS {
        assert_eq!(c.collection(n).unwrap().role, Role::Canonical, "{n}");
    }
    let domain: Vec<&str> = c.domain_collections().map(|x| x.name.as_str()).collect();
    assert!(domain.contains(&TYPING_ATTEMPT) && domain.contains(&TYPING_TEXT));
    assert!(domain.contains(&"learner_response"), "existing evidence collections are untouched");
    // soft references: an attempt may name a text, a session or a source attempt that does not exist (no FK)
    let t = temp_root();
    let mut s = Store::open(&t.root, c.clone(), &OpenOptions::default()).unwrap();
    s.commit(&uow(vec![put_op(&c, TYPING_ATTEMPT, "a1", attempt("a1", "no-such-text", Some("no-such-attempt")))])).unwrap();
    assert!(s.check_consistency().unwrap().is_empty());
}

#[test]
fn a_projection_that_disagrees_with_the_payload_is_rejected() {
    let c = catalog();
    let t = temp_root();
    let mut s = Store::open(&t.root, c.clone(), &OpenOptions::default()).unwrap();
    let mut op = put_op(&c, TYPING_ATTEMPT, "a1", attempt("a1", "t1", None));
    op["proj"]["columns"]["intent"] = json!("test");
    let err = s.commit(&uow(vec![op])).unwrap_err();
    assert_eq!(err.code, Code::RejectProjection);
    assert_eq!(s.count(TYPING_ATTEMPT).unwrap(), 0);
}

#[test]
fn the_intent_column_is_a_checked_enum() {
    let c = catalog();
    let t = temp_root();
    let mut s = Store::open(&t.root, c.clone(), &OpenOptions::default()).unwrap();
    let mut bad = attempt("a1", "t1", None);
    bad["intent"] = json!("mode-zoo");
    let err = s.commit(&uow(vec![put_op(&c, TYPING_ATTEMPT, "a1", bad)])).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint);
}

#[test]
fn the_three_to_four_upgrade_preserves_everything_and_a_failing_one_refuses_to_run() {
    let t = temp_root();
    let v3 = Arc::new(qs_orchestration::product_catalog());
    let hash = {
        let mut s = Store::open(&t.root, v3.clone(), &OpenOptions::default()).unwrap();
        s.commit(&uow(vec![put_op(&v3, "setting", "theme", json!({"key": "theme", "value": "paper"}))])).unwrap();
        s.state_hash(true).unwrap()
    };
    let broken = qs_orchestration::product_catalog()
        .extend(
            vec![Migration {
                version: 4,
                name: "broken".into(),
                sql: "CREATE TABLE typing_text(id TEXT PRIMARY KEY); INSERT INTO nonexistent VALUES(1);".into(),
            }],
            vec![],
        )
        .unwrap();
    let err = Store::open(&t.root, Arc::new(broken), &OpenOptions::default()).unwrap_err();
    assert_eq!(err.code, Code::UpgradeFailed);
    assert_eq!(Store::open(&t.root, v3.clone(), &OpenOptions::default()).unwrap().state_hash(true).unwrap(), hash);
    let s = Store::open(&t.root, catalog(), &OpenOptions::default()).unwrap();
    let n = s.upgrade_notice().expect("reported");
    assert_eq!((n.from, n.to), (3, 4));
    assert!(n.snapshot.is_file());
    assert_eq!(s.read("setting", &json!({"id": "theme"})).unwrap()[0].payload, json!({"key": "theme", "value": "paper"}));
    for c in TYPING_COLLECTIONS {
        assert_eq!(s.count(c).unwrap(), 0);
    }
    assert!(s.check_consistency().unwrap().is_empty());
    drop(s);
    let err = Store::open(&t.root, v3, &OpenOptions::default()).unwrap_err();
    assert_eq!(err.code, Code::SchemaNewer, "an older build never opens a schema-4 store");
}

#[test]
fn typing_data_survives_an_archive_round_trip_with_an_identical_state_hash() {
    let t = temp_root();
    let c = catalog();
    let archive = t.dir.path().join("typing.qsarchive");
    // verbatim, deliberately non-normalized text: an NFD input must come back byte-identical
    let mut a = attempt("a1", "t1", None);
    a["committed"]["text"] = json!("e\u{301}nvironment");
    let want = {
        let mut s = Store::open(&t.root, c.clone(), &OpenOptions::default()).unwrap();
        s.commit(&uow(vec![put_op(&c, TYPING_TEXT, "t1", text("t1")), put_op(&c, TYPING_ATTEMPT, "a1", a.clone())])).unwrap();
        qs_archive::create_archive(&s, &archive).unwrap();
        s.state_hash(false).unwrap()
    };
    let other = temp_root();
    let mut target = Store::open(&other.root, catalog(), &OpenOptions::default()).unwrap();
    qs_archive::restore_archive(&mut target, &archive).unwrap();
    assert_eq!(target.state_hash(false).unwrap(), want);
    assert_eq!(target.read(TYPING_ATTEMPT, &json!({"id": "a1"})).unwrap()[0].payload, a);
    assert_eq!(target.count(TYPING_TEXT).unwrap(), 1);
    assert!(target.check_consistency().unwrap().is_empty());
}

#[test]
fn a_schema_three_archive_restores_into_the_schema_four_store() {
    let t = temp_root();
    let v3 = Arc::new(qs_orchestration::product_catalog());
    let archive = t.dir.path().join("old.qsarchive");
    {
        let mut s = Store::open(&t.root, v3.clone(), &OpenOptions::default()).unwrap();
        s.commit(&uow(vec![put_op(&v3, "setting", "theme", json!({"key": "theme", "value": "paper"}))])).unwrap();
        qs_archive::create_archive(&s, &archive).unwrap();
    }
    let other = temp_root();
    let mut target = Store::open(&other.root, catalog(), &OpenOptions::default()).unwrap();
    let r = qs_archive::restore_archive(&mut target, &archive).unwrap();
    assert_eq!(r.migrated_from, Some(3));
    assert_eq!(target.count("setting").unwrap(), 1);
    assert_eq!(target.count(TYPING_ATTEMPT).unwrap(), 0);
    assert!(target.check_consistency().unwrap().is_empty());
}
