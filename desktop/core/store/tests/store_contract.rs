//! Store contract (ADR 0001 H2 method, re-implemented as a permanent suite): Unit of Work atomicity,
//! lossless fidelity, payload/projection integrity, hard vs soft relationships, schema ownership.

use qs_platform::Code;
use qs_store::canon;
use qs_store::{Catalog, OpenOptions, Store};
use qs_testkit::*;
use serde_json::{json, Value};
use std::sync::Arc;

fn open(t: &TestRoot, c: &Arc<Catalog>) -> Store {
    Store::open(&t.root, c.clone(), &OpenOptions::default()).expect("open")
}

fn seeded() -> (TestRoot, Arc<Catalog>, Store) {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let mut s = open(&t, &c);
    s.commit(&finalize_uow(&c, 1, &[])).unwrap();
    (t, c, s)
}

fn err_code<T: std::fmt::Debug>(r: qs_platform::Result<T>) -> Code {
    r.expect_err("expected rejection").code
}

#[test]
fn creates_store_with_identity_and_reopens() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    {
        let s = open(&t, &c);
        let i = s.info().unwrap();
        assert_eq!(i.application_id, qs_store::APPLICATION_ID);
        assert_eq!(i.user_version, c.schema_version());
        assert!(s.quick_check().unwrap());
        assert!(s.check_consistency().unwrap().is_empty());
    }
    let s = open(&t, &c);
    assert_eq!(s.info().unwrap().user_version, 2);
}

#[test]
fn second_open_is_refused_by_the_single_writer_lock() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let _first = open(&t, &c);
    assert_eq!(err_code(Store::open(&t.root, c.clone(), &OpenOptions::default())), Code::Locked);
}

#[test]
fn a_foreign_sqlite_file_is_not_a_store_and_is_not_touched() {
    let t = temp_root();
    t.root.ensure().unwrap();
    {
        let conn = rusqlite::Connection::open(t.root.db_path()).unwrap();
        conn.execute_batch("CREATE TABLE other(x); INSERT INTO other VALUES(1);").unwrap();
    }
    let before = std::fs::read(t.root.db_path()).unwrap();
    assert_eq!(err_code(Store::open(&t.root, arc(evidence_catalog()), &OpenOptions::default())), Code::NotAStore);
    assert_eq!(std::fs::read(t.root.db_path()).unwrap(), before);
}

#[test]
fn newer_store_schema_is_refused_without_any_write() {
    let t = temp_root();
    let newer = arc(evidence_catalog_v2());
    drop(open(&t, &newer));
    let before = std::fs::read(t.root.db_path()).unwrap();
    let older = arc(evidence_catalog());
    assert_eq!(err_code(Store::open(&t.root, older, &OpenOptions::default())), Code::SchemaNewer);
    assert_eq!(std::fs::read(t.root.db_path()).unwrap(), before, "downgrade refusal must not write");
}

#[test]
fn payload_round_trips_with_identical_canonical_hash() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let mut s = open(&t, &c);
    let payload = response_payload(42, 20, &[]);
    s.commit(&uow(vec![put_op(&c, "learner_response", "resp-42", payload.clone())])).unwrap();
    let back = s.read("learner_response", &json!({"id": "resp-42"})).unwrap();
    assert_eq!(back.len(), 1);
    assert_eq!(canon::hash_hex(&back[0].payload), canon::hash_hex(&payload));
    // unknown fields, extensions, nesting and array order survived
    assert_eq!(back[0].payload["extensions"]["vendor.example"]["nested"]["deep"][1][1][1]["k"], "v");
    assert_eq!(back[0].payload["bigCounter"], "9007199254740993");
    assert_eq!(back[0].payload["items"], payload["items"]);
}

#[test]
fn revisions_and_preconditions() {
    let (_t, c, mut s) = seeded();
    let put = |s: &mut Store, extra: Value| {
        let mut u = uow(vec![put_op(&c, "teacher_review", "rev-1", review_payload("rev-1", "resp-1"))]);
        u["preconditions"] = extra;
        s.commit(&u)
    };
    // rev-1 already exists (rev 1) -> "absent" fails, "exists" and rev=1 succeed and bump to rev 2
    assert_eq!(err_code(put(&mut s, json!([{"kind":"absent","collection":"teacher_review","id":"rev-1"}]))), Code::RejectPrecondition);
    let r = put(&mut s, json!([{"kind":"exists","collection":"teacher_review","id":"rev-1"},{"kind":"rev","collection":"teacher_review","id":"rev-1","equals":1}])).unwrap();
    assert_eq!(r.writes[0].rev, 2);
    assert_eq!(
        err_code(put(&mut s, json!([{"kind":"rev","collection":"teacher_review","id":"rev-1","equals":1}]))),
        Code::RejectPrecondition
    );
    assert_eq!(s.read("teacher_review", &json!({"id":"rev-1"})).unwrap()[0].rev, 2);
}

#[test]
fn a_unit_of_work_is_all_or_nothing() {
    let (_t, c, mut s) = seeded();
    let before = s.state_hash(true).unwrap();
    // valid response + a review pointing at a response that does not exist: the whole UoW must vanish
    let bad = uow(vec![
        put_op(&c, "learner_response", "resp-9", response_payload(9, 3, &[])),
        put_op(&c, "teacher_review", "rev-9", review_payload("rev-9", "resp-DOES-NOT-EXIST")),
    ]);
    assert_eq!(err_code(s.commit(&bad)), Code::RejectConstraint);
    assert_eq!(s.state_hash(true).unwrap(), before);
    assert_eq!(s.count("learner_response").unwrap(), 1);
    assert!(s.check_consistency().unwrap().is_empty());
}

#[test]
fn statement_order_inside_a_unit_of_work_is_irrelevant() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let mut s = open(&t, &c);
    // child before parent: deferred foreign keys make this legal
    s.commit(&uow(vec![
        put_op(&c, "teacher_review", "rev-1", review_payload("rev-1", "resp-1")),
        put_op(&c, "learner_response", "resp-1", response_payload(1, 2, &[])),
    ]))
    .unwrap();
    assert_eq!(s.count("teacher_review").unwrap(), 1);
}

#[test]
fn drift_probe_every_inconsistent_unit_of_work_is_rejected_whole() {
    let (_t, c, mut s) = seeded();
    let base = response_payload(2, 3, &["m1".to_string()]);
    let good = put_op(&c, "learner_response", "resp-2", base.clone());
    let mutate = |f: &dyn Fn(&mut Value)| {
        let mut op = good.clone();
        f(&mut op);
        uow(vec![op])
    };
    // media m1 must exist for the *valid* case; register it so only the drift is under test
    s.commit(&uow(vec![put_op(&c, "media_object", "m1", media_object_payload("m1", &"ab".repeat(32), 3))])).unwrap();

    let cases: Vec<(&str, Value, Code)> = vec![
        ("column disagrees (paperId)", mutate(&|o| o["proj"]["columns"]["paper_id"] = json!("paper-B")), Code::RejectProjection),
        ("column disagrees (itemCount)", mutate(&|o| o["proj"]["columns"]["item_count"] = json!(99)), Code::RejectProjection),
        ("relation rows missing", mutate(&|o| o["proj"]["relations"]["response_item"] = json!([])), Code::RejectProjection),
        (
            "relation rows extra",
            mutate(&|o| o["proj"]["relations"]["media_ref"].as_array_mut().unwrap().push(json!({"media_id":"m-extra"}))),
            Code::RejectProjection,
        ),
        (
            "relation order differs",
            mutate(&|o| o["proj"]["relations"]["response_item"].as_array_mut().unwrap().reverse()),
            Code::RejectProjection,
        ),
        ("payload changed, projection stale", mutate(&|o| o["payload"]["paperId"] = json!("paper-C")), Code::RejectProjection),
        ("payload identity differs from record id", mutate(&|o| o["payload"]["id"] = json!("resp-OTHER")), Code::RejectProjection),
        (
            "projection omitted",
            mutate(&|o| {
                o.as_object_mut().unwrap().remove("proj");
            }),
            Code::RejectProjection,
        ),
        (
            "required field missing",
            mutate(&|o| {
                o["payload"].as_object_mut().unwrap().remove("paperId");
            }),
            Code::RejectProjection,
        ),
        ("wrong type for a typed column", mutate(&|o| o["payload"]["itemCount"] = json!("three")), Code::RejectProjection),
        ("payload is not an object", mutate(&|o| o["payload"] = json!([1, 2])), Code::RejectShape),
        ("unknown collection", mutate(&|o| o["collection"] = json!("nope")), Code::RejectShape),
    ];
    let before = s.state_hash(true).unwrap();
    for (name, u, code) in &cases {
        let e = s.commit(u).expect_err(name);
        assert_eq!(e.code, *code, "{name}: {e}");
        assert_eq!(s.state_hash(true).unwrap(), before, "{name}: state changed");
    }
    assert_eq!(s.count("learner_response").unwrap(), 1, "no inconsistent row may ever be committed");
    // and the untouched good op still commits
    s.commit(&uow(vec![good])).unwrap();
    assert!(s.check_consistency().unwrap().is_empty());
}

#[test]
fn out_of_band_projection_mutations_are_detected_by_check_consistency() {
    let sqls = [
        "UPDATE learner_response SET paper_id='tampered'",
        "UPDATE learner_response SET item_count=item_count+1",
        "DELETE FROM response_item WHERE ord=0",
        "INSERT INTO response_item(response_id,item_id,ord) VALUES('resp-1','ghost',99)",
        "UPDATE response_item SET item_id='swapped' WHERE ord=1",
        "UPDATE learner_response SET payload=json_set(payload,'$.paperId','forged')",
        "UPDATE teacher_review SET response_id='resp-1' || ''", // control: harmless no-op must NOT be flagged
    ];
    for (i, sql) in sqls.iter().enumerate() {
        let (_t, _c, s) = seeded();
        s.conn().execute_batch(sql).unwrap();
        let problems = s.check_consistency().unwrap();
        if i == sqls.len() - 1 {
            assert!(problems.is_empty(), "{sql}: {problems:?}");
        } else {
            assert!(!problems.is_empty(), "{sql}: not detected");
        }
    }
}

#[test]
fn hard_relationships_are_enforced_and_soft_provenance_may_dangle() {
    let (_t, c, mut s) = seeded();
    let reject = |s: &mut Store, op: Value, what: &str| {
        let e = s.commit(&uow(vec![op])).expect_err(what);
        assert_eq!(e.code, Code::RejectConstraint, "{what}: {e}");
    };
    reject(&mut s, put_op(&c, "teacher_review", "rev-orphan", review_payload("rev-orphan", "nope")), "orphan teacher review");
    reject(
        &mut s,
        put_op(&c, "remediation_doc", "rem-1", json!({"id":"rem-1","sourceResponseId":"nope"})),
        "orphan remediation source response",
    );
    reject(
        &mut s,
        put_op(&c, "remediation_doc", "rem-2", json!({"id":"rem-2","sourceResponseId":"resp-1","sourceReviewId":"no-review"})),
        "orphan remediation source review",
    );
    reject(
        &mut s,
        put_op(&c, "learner_response", "resp-3", response_payload(3, 2, &["media-that-does-not-exist".to_string()])),
        "orphan media reference",
    );
    // deleting a parent that still has children is rejected
    let e = s.commit(&uow(vec![delete_op("learner_response", "resp-1")])).expect_err("delete parent");
    assert_eq!(e.code, Code::RejectConstraint);
    // soft provenance: a history entry may reference a response that does not exist
    s.commit(&uow(vec![put_op(&c, "history_entry", "hist-x", history_payload("hist-x", "long-gone"))])).unwrap();
    // ...and may outlive its source
    s.commit(&uow(vec![delete_op("teacher_review", "rev-1"), delete_op("learner_response", "resp-1")])).unwrap();
    assert_eq!(s.count("history_entry").unwrap(), 2);
    assert!(s.check_consistency().unwrap().is_empty());
}

#[test]
fn reads_filter_order_limit_and_refuse_unsafe_columns() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let mut s = open(&t, &c);
    for n in 1..=5u64 {
        s.commit(&finalize_uow(&c, n, &[])).unwrap();
    }
    let r = s.read("learner_response", &json!({"orderBy":[{"column":"finalized_at","desc":true}],"limit":2})).unwrap();
    assert_eq!(r.len(), 2);
    assert!(r[0].payload["finalizedAt"].as_str() > r[1].payload["finalizedAt"].as_str());
    let r = s.read("learner_response", &json!({"where":[{"column":"paper_id","op":"eq","value":"paper-3"}]})).unwrap();
    assert_eq!(r.len(), 1);
    assert_eq!(s.read("learner_response", &json!({"ids":["resp-2","resp-4","nope"]})).unwrap().len(), 2);
    let e = s.read("learner_response", &json!({"where":[{"column":"payload; DROP TABLE meta;--","value":1}]})).unwrap_err();
    assert_eq!(e.code, Code::RejectShape);
    assert_eq!(s.read("nope", &json!({})).unwrap_err().code, Code::RejectShape);
}

#[test]
fn upgrade_is_snapshotted_transactional_and_preserves_every_record() {
    let t = temp_root();
    let v2 = arc(evidence_catalog());
    let mut s = open(&t, &v2);
    for n in 1..=10u64 {
        s.commit(&finalize_uow(&v2, n, &[])).unwrap();
    }
    let hashes: Vec<String> =
        (1..=10).map(|n| canon::hash_hex(&s.read("learner_response", &json!({"id": format!("resp-{n}")})).unwrap()[0].payload)).collect();
    drop(s);

    let v3 = arc(evidence_catalog_v2());
    let s = open(&t, &v3);
    let notice = s.upgrade_notice().expect("upgrade performed");
    assert_eq!((notice.from, notice.to), (2, 3));
    assert!(notice.snapshot.exists(), "an automatic pre-upgrade snapshot is mandatory");
    for n in 1..=10u64 {
        let r = &s.read("learner_response", &json!({"id": format!("resp-{n}")})).unwrap()[0];
        assert_eq!(canon::hash_hex(&r.payload), hashes[n as usize - 1], "payload changed by migration");
    }
    let backfilled: i64 = s.conn().query_row("SELECT count(*) FROM learner_response WHERE summary_len=20", [], |r| r.get(0)).unwrap();
    assert_eq!(backfilled, 10);
    assert!(s.check_consistency().unwrap().is_empty());
}

#[test]
fn a_failing_migration_leaves_the_store_exactly_as_it_was() {
    let t = temp_root();
    let v2 = arc(evidence_catalog());
    let mut s = open(&t, &v2);
    for n in 1..=5u64 {
        s.commit(&finalize_uow(&v2, n, &[])).unwrap();
    }
    let hash = s.state_hash(true).unwrap();
    drop(s);

    let e = Store::open(&t.root, arc(evidence_catalog_v2_failing()), &OpenOptions::default()).expect_err("must fail");
    assert_eq!(e.code, Code::UpgradeFailed, "{e}");
    assert!(e.message.contains("no data was lost"));

    let s = open(&t, &v2); // the old build still opens it at the old schema
    assert_eq!(s.info().unwrap().user_version, 2);
    assert_eq!(s.state_hash(true).unwrap(), hash);
    assert!(s.check_consistency().unwrap().is_empty());
}

#[test]
fn catalog_lint_rejects_non_deferrable_foreign_keys() {
    let t = temp_root();
    let bad = qs_store::Catalog::foundation()
        .extend(
            vec![qs_store::Migration {
                version: 2,
                name: "bad".into(),
                sql: "CREATE TABLE parent_c(id TEXT PRIMARY KEY, rev INTEGER NOT NULL, payload TEXT NOT NULL);
                      CREATE TABLE child_c(id TEXT PRIMARY KEY, rev INTEGER NOT NULL, payload TEXT NOT NULL,
                                           p TEXT REFERENCES parent_c(id));"
                    .into(),
            }],
            vec![qs_store::Collection::new("parent_c"), qs_store::Collection::new("child_c")],
        )
        .unwrap();
    let e = Store::open(&t.root, Arc::new(bad), &OpenOptions::default()).expect_err("must fail");
    assert_eq!(e.code, Code::CatalogMismatch, "{e}");
}

#[test]
fn malformed_units_of_work_are_rejected_before_touching_the_database() {
    let (_t, _c, mut s) = seeded();
    for (what, u) in [
        ("empty ops", json!({"ops": []})),
        ("no ops", json!({})),
        ("unknown op", json!({"ops":[{"op":"merge","collection":"setting","id":"x"}]})),
        ("missing id", json!({"ops":[{"op":"delete","collection":"setting"}]})),
        (
            "bad precondition kind",
            json!({"preconditions":[{"kind":"maybe","collection":"setting","id":"x"}],"ops":[{"op":"delete","collection":"setting","id":"x"}]}),
        ),
    ] {
        let e = s.commit(&u).expect_err(what);
        assert!(matches!(e.code, Code::RejectShape), "{what}: {e}");
    }
}

#[test]
fn recovery_only_collections_are_excluded_from_the_canonical_hash() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let mut s = open(&t, &c);
    let canonical_before = s.state_hash(false).unwrap();
    s.commit(&uow(vec![put_op(&c, "recovery_session", "sess-1", json!({"answers": [1, 2, 3]}))])).unwrap();
    assert_eq!(s.state_hash(false).unwrap(), canonical_before);
    assert_ne!(s.state_hash(true).unwrap(), canonical_before);
}

#[test]
fn database_under_a_very_long_path_opens_and_commits() {
    let t = temp_root();
    let mut p = t.dir.path().to_path_buf();
    while p.as_os_str().len() < 300 {
        p.push("a-rather-long-directory-segment");
    }
    let root = qs_platform::DataRoot::at(p.join("data-root"));
    // creating the tree needs the verbatim form on Windows
    let verbatim =
        if cfg!(windows) { std::path::PathBuf::from(format!(r"\\?\{}", root.path().display())) } else { root.path().to_path_buf() };
    std::fs::create_dir_all(&verbatim).unwrap();
    let c = arc(evidence_catalog());
    let mut s = Store::open(&root, c.clone(), &OpenOptions::default()).unwrap();
    s.commit(&finalize_uow(&c, 1, &[])).unwrap();
    assert!(s.check_consistency().unwrap().is_empty());
}
