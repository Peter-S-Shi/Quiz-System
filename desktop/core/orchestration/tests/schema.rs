//! Store schema 3 (ADR 0003 section 15 and 17.1-3, 17.7): the database itself enforces the single-active,
//! single-pending and one-fulfillment invariants; foreign keys are hard; the role is `context`; the upgrade is
//! forward-only and safe; scheduling data survives an archive round trip; `check_consistency` stays clean.

use qs_orchestration::*;
use qs_platform::Code;
use qs_store::{Catalog, Migration, OpenOptions, Role, Store};
use qs_testkit::*;
use serde_json::{json, Value};
use std::sync::Arc;

fn catalog() -> Arc<Catalog> {
    Arc::new(product_catalog())
}

fn open(t: &TestRoot) -> Store {
    Store::open(&t.root, catalog(), &OpenOptions::default()).unwrap()
}

fn schedule(id: &str, material: &str, intent: &str, status: &str) -> Value {
    json!({"schemaVersion": 1, "id": id,
           "slot": {"domain": "objective", "material": {"type": "quiz-paper", "id": material}, "intent": intent},
           "owner": "user", "status": status, "cadence": {"kind": "once"}, "segments": [{"anchor": "2026-10-06"}],
           "createdAt": "2026-10-02T00:00:00Z", "updatedAt": "2026-10-02T00:00:00Z"})
}

fn put(s: &mut Store, coll: &str, id: &str, payload: Value) -> qs_platform::Result<qs_store::uow::CommitReceipt> {
    let c = catalog();
    s.commit(&uow(vec![put_op(&c, coll, id, payload)]))
}

fn fulfillment(id: &str, schedule: &str, date: &str, session: &str) -> Value {
    json!({"schemaVersion": 1, "id": id, "scheduleId": schedule, "originalDate": date,
           "session": {"collection": "learner_response", "id": session}, "fulfilledOn": date, "via": "linked"})
}

fn suggestion(id: &str, schedule: &str, status: &str, rev: i64) -> Value {
    json!({"schemaVersion": 1, "id": id, "scheduleId": schedule, "scheduleRev": rev, "targetOriginalDate": "2026-10-06",
           "currentDate": "2026-10-06", "suggestedDate": "2026-10-08", "reasons": [], "algorithmVersion": "v1", "basis": [],
           "status": status, "createdAt": "2026-10-02T00:00:00Z"})
}

#[test]
fn the_five_collections_are_scheduling_context_not_evidence_domain_data() {
    let c = catalog();
    assert_eq!(c.schema_version(), 3);
    for n in SCHEDULING_COLLECTIONS {
        let coll = c.collection(n).unwrap();
        assert_eq!(coll.role, Role::Context, "{n}");
        assert!(coll.canonical, "{n} travels with archives, snapshots and state hashes");
    }
    let domain: Vec<&str> = c.domain_collections().map(|x| x.name.as_str()).collect();
    for n in SCHEDULING_COLLECTIONS {
        assert!(!domain.contains(&n), "{n} is outside the evidence-domain view");
    }
    assert!(domain.contains(&"learner_response") && domain.contains(&"teacher_review"));
}

#[test]
fn the_database_allows_one_active_schedule_per_slot_and_frees_the_slot_when_it_ends() {
    let t = temp_root();
    let mut s = open(&t);
    put(&mut s, SCHEDULE, "s1", schedule("s1", "paper-a", "practice", "active")).unwrap();
    // a second active schedule in the same slot is rejected by the index, not by domain code
    let err = put(&mut s, SCHEDULE, "s2", schedule("s2", "paper-a", "practice", "active")).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint);
    // other slots (different intent, different material) are unaffected
    put(&mut s, SCHEDULE, "s3", schedule("s3", "paper-a", "test", "active")).unwrap();
    put(&mut s, SCHEDULE, "s4", schedule("s4", "paper-b", "practice", "active")).unwrap();
    // cancelled / completed rows do not occupy the slot, in any number
    put(&mut s, SCHEDULE, "s5", schedule("s5", "paper-a", "practice", "cancelled")).unwrap();
    put(&mut s, SCHEDULE, "s6", schedule("s6", "paper-a", "practice", "completed")).unwrap();
    // ending the active one frees the slot for a new identity
    put(&mut s, SCHEDULE, "s1", schedule("s1", "paper-a", "practice", "cancelled")).unwrap();
    put(&mut s, SCHEDULE, "s2", schedule("s2", "paper-a", "practice", "active")).unwrap();
    assert_eq!(s.count(SCHEDULE).unwrap(), 6);
    assert!(s.check_consistency().unwrap().is_empty());
}

#[test]
fn a_bad_enum_value_is_rejected_by_the_table() {
    let t = temp_root();
    let mut s = open(&t);
    let err = put(&mut s, SCHEDULE, "s1", schedule("s1", "paper-a", "drill", "active")).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint);
    let err = put(&mut s, SCHEDULE, "s1", schedule("s1", "paper-a", "practice", "paused")).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint);
}

#[test]
fn one_pending_suggestion_per_schedule_and_decided_ones_do_not_count() {
    let t = temp_root();
    let mut s = open(&t);
    put(&mut s, SCHEDULE, "s1", schedule("s1", "paper-a", "practice", "active")).unwrap();
    put(&mut s, SUGGESTION, "g1", suggestion("g1", "s1", "pending", 1)).unwrap();
    let err = put(&mut s, SUGGESTION, "g2", suggestion("g2", "s1", "pending", 1)).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint);
    put(&mut s, SUGGESTION, "g1", suggestion("g1", "s1", "superseded", 1)).unwrap();
    put(&mut s, SUGGESTION, "g2", suggestion("g2", "s1", "pending", 2)).unwrap();
    put(&mut s, SUGGESTION, "g3", suggestion("g3", "s1", "kept", 2)).unwrap();
    assert_eq!(s.count(SUGGESTION).unwrap(), 3);
}

#[test]
fn an_occurrence_is_fulfilled_once_and_a_session_fulfills_one_occurrence() {
    let t = temp_root();
    let mut s = open(&t);
    put(&mut s, SCHEDULE, "s1", schedule("s1", "paper-a", "practice", "active")).unwrap();
    put(&mut s, FULFILLMENT, "s1#2026-10-06", fulfillment("s1#2026-10-06", "s1", "2026-10-06", "lr-1")).unwrap();
    // the same session cannot satisfy a second occurrence (S-6)
    let err = put(&mut s, FULFILLMENT, "s1#2026-10-09", fulfillment("s1#2026-10-09", "s1", "2026-10-09", "lr-1")).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint);
    // the same occurrence cannot be fulfilled twice, even through a differently-keyed row
    let mut dup = fulfillment("other-key", "s1", "2026-10-06", "lr-2");
    dup["id"] = json!("other-key");
    let err = put(&mut s, FULFILLMENT, "other-key", dup).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint);
    // a different session for a different occurrence is fine
    put(&mut s, FULFILLMENT, "s1#2026-10-09", fulfillment("s1#2026-10-09", "s1", "2026-10-09", "lr-3")).unwrap();
}

#[test]
fn one_exception_and_one_selection_per_key() {
    let t = temp_root();
    let mut s = open(&t);
    put(&mut s, SCHEDULE, "s1", schedule("s1", "paper-a", "practice", "active")).unwrap();
    let ex = |id: &str, date: &str| json!({"schemaVersion": 1, "id": id, "scheduleId": "s1", "originalDate": date, "kind": "moved", "movedTo": "2026-10-20"});
    put(&mut s, EXCEPTION, "s1#2026-10-06", ex("s1#2026-10-06", "2026-10-06")).unwrap();
    let err = put(&mut s, EXCEPTION, "dup", ex("dup", "2026-10-06")).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint, "an occurrence has one exception");
    let sel = |id: &str| json!({"schemaVersion": 1, "id": id, "session": {"collection": "learner_response", "id": "lr-1"}, "selection": {"source": "manual"}, "createdAt": "2026-10-02T00:00:00Z"});
    put(&mut s, SELECTION, "learner_response:lr-1", sel("learner_response:lr-1")).unwrap();
    let err = put(&mut s, SELECTION, "again", sel("again")).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint, "a session has one selection record");
}

#[test]
fn foreign_keys_are_hard_and_deferred_to_the_end_of_the_unit_of_work() {
    let t = temp_root();
    let mut s = open(&t);
    let c = catalog();
    // an exception whose schedule does not exist is rejected as a whole
    let ex =
        json!({"schemaVersion": 1, "id": "ghost#2026-10-06", "scheduleId": "ghost", "originalDate": "2026-10-06", "kind": "cancelled"});
    let err = put(&mut s, EXCEPTION, "ghost#2026-10-06", ex.clone()).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint);
    assert_eq!(s.count(EXCEPTION).unwrap(), 0);
    // child first, parent later in the SAME unit of work: statement order is irrelevant (deferred FKs)
    s.commit(&uow(vec![
        put_op(&c, EXCEPTION, "ghost#2026-10-06", ex),
        put_op(&c, SCHEDULE, "ghost", schedule("ghost", "paper-z", "practice", "active")),
    ]))
    .unwrap();
    // a schedule that still has children cannot be hard-deleted
    let err = s.commit(&uow(vec![json!({"op": "delete", "collection": SCHEDULE, "id": "ghost"})])).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint);
    assert!(s.check_consistency().unwrap().is_empty());
}

#[test]
fn a_projection_that_disagrees_with_the_payload_is_rejected() {
    let t = temp_root();
    let mut s = open(&t);
    let c = catalog();
    let payload = schedule("s1", "paper-a", "practice", "active");
    let mut op = put_op(&c, SCHEDULE, "s1", payload);
    op["proj"]["columns"]["owner"] = json!("engine");
    let err = s.commit(&uow(vec![op])).unwrap_err();
    assert_eq!(err.code, Code::RejectProjection);
}

#[test]
fn a_revision_precondition_makes_a_stale_decision_abort_with_no_change() {
    let t = temp_root();
    let mut s = open(&t);
    let c = catalog();
    let r = put(&mut s, SCHEDULE, "s1", schedule("s1", "paper-a", "practice", "active")).unwrap();
    let rev = r.writes[0].rev;
    put(&mut s, SCHEDULE, "s1", schedule("s1", "paper-a", "practice", "active")).unwrap(); // the learner changed it: rev advances
    let before = s.state_hash(true).unwrap();
    let mut u = uow(vec![put_op(&c, SUGGESTION, "g1", suggestion("g1", "s1", "accepted", rev))]);
    u["preconditions"] = json!([{"kind": "rev", "collection": SCHEDULE, "id": "s1", "equals": rev}]);
    let err = s.commit(&u).unwrap_err();
    assert_eq!(err.code, Code::RejectPrecondition);
    assert_eq!(s.state_hash(true).unwrap(), before);
}

#[test]
fn the_two_to_three_upgrade_preserves_everything_and_a_failing_one_refuses_to_run() {
    let t = temp_root();
    let v2 = Arc::new(qs_migrate_v1::product_catalog());
    let hash = {
        let mut s = Store::open(&t.root, v2.clone(), &OpenOptions::default()).unwrap();
        s.commit(&uow(vec![put_op(&v2, "setting", "theme", json!({"key": "theme", "value": "paper"}))])).unwrap();
        s.state_hash(true).unwrap()
    };
    // a failing 2 -> 3 leaves the schema-2 store untouched and still openable by the previous build
    let broken = qs_migrate_v1::product_catalog()
        .extend(
            vec![Migration {
                version: 3,
                name: "broken".into(),
                sql: "CREATE TABLE schedule(id TEXT PRIMARY KEY); INSERT INTO nonexistent VALUES(1);".into(),
            }],
            vec![],
        )
        .unwrap();
    let err = Store::open(&t.root, Arc::new(broken), &OpenOptions::default()).unwrap_err();
    assert_eq!(err.code, Code::UpgradeFailed);
    assert_eq!(Store::open(&t.root, v2.clone(), &OpenOptions::default()).unwrap().state_hash(true).unwrap(), hash);
    // the real upgrade
    let s = Store::open(&t.root, catalog(), &OpenOptions::default()).unwrap();
    let n = s.upgrade_notice().expect("reported");
    assert_eq!((n.from, n.to), (2, 3));
    assert!(n.snapshot.is_file());
    assert_eq!(s.read("setting", &json!({"id": "theme"})).unwrap()[0].payload, json!({"key": "theme", "value": "paper"}));
    for c in SCHEDULING_COLLECTIONS {
        assert_eq!(s.count(c).unwrap(), 0);
    }
    assert!(s.check_consistency().unwrap().is_empty());
    drop(s);
    // an older build never opens a schema-3 store
    let err = Store::open(&t.root, v2, &OpenOptions::default()).unwrap_err();
    assert_eq!(err.code, Code::SchemaNewer);
}

#[test]
fn scheduling_context_survives_an_archive_round_trip_with_an_identical_state_hash() {
    let t = temp_root();
    let c = catalog();
    let archive = t.dir.path().join("sched.qsarchive");
    let want = {
        let mut s = open(&t);
        s.commit(&uow(vec![
            put_op(&c, SCHEDULE, "s1", schedule("s1", "paper-a", "practice", "active")),
            put_op(&c, SUGGESTION, "g1", suggestion("g1", "s1", "pending", 1)),
            put_op(&c, FULFILLMENT, "s1#2026-10-06", fulfillment("s1#2026-10-06", "s1", "2026-10-06", "lr-1")),
        ]))
        .unwrap();
        qs_archive::create_archive(&s, &archive).unwrap();
        s.state_hash(false).unwrap()
    };
    let other = temp_root();
    let mut target = Store::open(&other.root, catalog(), &OpenOptions::default()).unwrap();
    qs_archive::restore_archive(&mut target, &archive).unwrap();
    assert_eq!(target.state_hash(false).unwrap(), want);
    for (coll, n) in [(SCHEDULE, 1), (SUGGESTION, 1), (FULFILLMENT, 1)] {
        assert_eq!(target.count(coll).unwrap(), n, "{coll}");
    }
    assert!(target.check_consistency().unwrap().is_empty());
    // the restored constraints still hold
    let err = put(&mut target, SCHEDULE, "s9", schedule("s9", "paper-a", "practice", "active")).unwrap_err();
    assert_eq!(err.code, Code::RejectConstraint);
}

#[test]
fn a_schema_two_archive_restores_into_the_schema_three_store() {
    let t = temp_root();
    let v2 = Arc::new(qs_migrate_v1::product_catalog());
    let archive = t.dir.path().join("old.qsarchive");
    {
        let mut s = Store::open(&t.root, v2.clone(), &OpenOptions::default()).unwrap();
        s.commit(&uow(vec![put_op(&v2, "setting", "theme", json!({"key": "theme", "value": "paper"}))])).unwrap();
        qs_archive::create_archive(&s, &archive).unwrap();
    }
    let other = temp_root();
    let mut target = Store::open(&other.root, catalog(), &OpenOptions::default()).unwrap();
    let r = qs_archive::restore_archive(&mut target, &archive).unwrap();
    assert_eq!(r.migrated_from, Some(2));
    assert_eq!(target.count("setting").unwrap(), 1);
    assert!(target.check_consistency().unwrap().is_empty());
}

#[test]
fn the_scheduling_fault_checkpoints_are_registered() {
    for tag in [
        "create",
        "move-once",
        "move-occurrence",
        "move-future",
        "cancel",
        "apply-plan",
        "decide-accept",
        "decide-keep",
        "session-complete",
    ] {
        for phase in ["before", "after"] {
            let name = format!("sched-{phase}-commit:{tag}");
            assert!(qs_platform::fault::CHECKPOINTS.contains(&name.as_str()), "{name}");
        }
    }
}
