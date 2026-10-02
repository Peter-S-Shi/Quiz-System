//! Operation identity, repeat import and undo (ADR 0002 sections 9, 13.3, 16.2-8).

mod common;
use common::*;
use qs_migrate_v1::catalog::*;
use qs_migrate_v1::{stage, Activation, Host, UndoOutcome};
use serde_json::{json, Value};

fn run_id(a: Activation) -> String {
    match a {
        Activation::Done(d) => d.run_op_id,
        other => panic!("expected Done, got {other:?}"),
    }
}

fn domain_counts(e: &Env) -> Vec<(String, i64)> {
    [
        "paper",
        "library_categories",
        "learner_response",
        "teacher_review",
        "translation_folder",
        "translation_document",
        "legacy_history_entry",
        "legacy_residue",
        "media_object",
        "migration_origin",
        "recovery_artifact",
    ]
    .iter()
    .map(|c| (c.to_string(), e.count(c)))
    .collect()
}

#[test]
fn importing_the_same_bytes_twice_is_a_no_op_with_zero_writes() {
    let e = env();
    let bytes = fixture_bytes("r-full.json");
    let p1 = e.prepare(&e.source("a.json", &bytes));
    run_id(e.activate(&p1));
    let after_first = e.state_hash();
    // the same bytes under a different file name: the digest identifies the source
    let p2 = e.prepare(&e.source("renamed-copy.json", &bytes));
    assert!(p2.already_migrated && !p2.blocked);
    assert!(has(&p2, "MIG_ALREADY_MIGRATED"));
    assert!(qs_migrate_v1::activate(&e.host, &p2, &p2.report_hash).is_err(), "an already-migrated preview has nothing to activate");
    assert_eq!(e.state_hash(), after_first, "zero writes");
    assert_eq!(e.count("migration_run"), 1);
}

#[test]
fn two_previews_of_one_source_activate_once_and_the_second_confirmation_is_a_no_op() {
    let e = env();
    let src = e.source("a.json", &fixture_bytes("r-full.json"));
    let p1 = e.prepare(&src);
    let p2 = e.prepare(&src);
    assert!(!p1.already_migrated && !p2.already_migrated);
    let id = run_id(e.activate(&p1));
    let after = e.state_hash();
    match e.activate(&p2) {
        Activation::AlreadyMigrated { run_op_id } => assert_eq!(run_op_id, id),
        other => panic!("{other:?}"),
    }
    assert_eq!(e.state_hash(), after);
}

#[test]
fn a_stale_or_foreign_confirmation_is_refused() {
    let e = env();
    let p = e.prepare(&e.source("a.json", &fixture_bytes("r-min.json")));
    let err = qs_migrate_v1::activate(&e.host, &p, "not-the-report-hash").unwrap_err();
    assert_eq!(err.code, qs_platform::Code::RejectPrecondition);
    assert_eq!(e.count("paper"), 0);
    assert!(!e.host.gate_is_open(), "the write gate is released on every exit path");
}

#[test]
fn an_overlapping_source_deduplicates_identical_records_adds_the_new_ones_and_never_overwrites() {
    let e = env();
    let (first, _) = e.import("one.json", &fixture("r-full.json"));
    let mut v = fixture("r-full.json");
    v["library"]["papers"].as_array_mut().unwrap().push(json!({
        "schemaVersion": 1, "id": "paper-new", "title": "Brand new", "description": "", "category": "", "tags": [],
        "createdAt": "2025-05-01T00:00:00.000Z", "updatedAt": "2025-05-01T00:00:00.000Z", "lastOpenedAt": "2025-05-01T00:00:00.000Z",
        "questions": [{"id": "qn", "type": "truefalse", "prompt": "New?", "answer": true}]
    }));
    let p = e.prepare(&e.source_json("two.json", &v));
    assert!(!p.blocked, "{:?}", p.report["diagnostics"]);
    assert!(has(&p, "MIG_EXISTING_IDENTICAL"));
    assert_eq!(p.report["plan"]["liveConflicts"], 0);
    assert!(p.report["plan"]["liveIdentical"].as_u64().unwrap() > 10);
    let before_papers = e.count("paper");
    e.activate(&p);
    assert_eq!(e.count("paper"), before_papers + 1);
    assert_eq!(e.count("migration_run"), 2);
    // both sources have an origin for a shared record; the second is a deduplicated one
    let oid = format!("{}:paper:paper-a", p.source_id);
    let o: Value = e.host.with_store(|s| s.read(ORIGIN, &json!({"id": oid})).unwrap()[0].payload.clone());
    assert_eq!(o["disposition"], "deduplicated-identical");
    let o1: Value =
        e.host.with_store(|s| s.read(ORIGIN, &json!({"id": format!("{}:paper:paper-a", first.source_id)})).unwrap()[0].payload.clone());
    assert_eq!(o1["disposition"], "carried");
    assert!(e.host.with_store(|s| s.check_consistency().unwrap()).is_empty());
}

#[test]
fn import_undo_import_again_works_and_undo_removes_exactly_what_the_run_created() {
    let e = env();
    let empty = domain_counts(&e);
    let src = e.source("a.json", &fixture_bytes("r-full.json"));
    let p = e.prepare(&src);
    let run = run_id(e.activate(&p));
    assert!(e.count("paper") > 0);
    match qs_migrate_v1::undo(&e.host, &run).unwrap() {
        UndoOutcome::Done { records_deleted, .. } => {
            assert_eq!(records_deleted, 19, "2 papers + categories + 4 responses + 3 reviews + folder + 2 documents + 3 history + 3 media")
        }
        other => panic!("{other:?}"),
    }
    assert_eq!(domain_counts(&e), empty, "every migrated record, origin and relationship row is gone");
    assert_eq!(e.count("migration_run"), 1, "the run record is operational history and stays");
    assert_eq!(e.count("migration_undo"), 1);
    assert!(e.host.with_store(|s| s.check_consistency().unwrap()).is_empty());
    // a second undo of the same run is refused
    match qs_migrate_v1::undo(&e.host, &run).unwrap() {
        UndoOutcome::Refused { reasons } => assert!(reasons[0]["reason"].as_str().unwrap().contains("not active")),
        other => panic!("{other:?}"),
    }
    // the same source can be imported again
    let p2 = e.prepare(&src);
    assert!(!p2.already_migrated && !p2.blocked);
    let run2 = run_id(e.activate(&p2));
    assert_ne!(run, run2);
    assert!(e.count("paper") > 0);
    let st = qs_migrate_v1::status(&e.host).unwrap();
    assert_eq!(st["runs"].as_array().unwrap().len(), 2);
    assert_eq!(st["runs"][0]["undone"], false);
    assert_eq!(st["runs"][1]["undone"], true);
}

#[test]
fn undo_is_refused_when_a_migrated_record_was_modified_and_changes_nothing() {
    let e = env();
    let (_, a) = e.import("a.json", &fixture("r-full.json"));
    let run = run_id(a);
    e.host.with_store(|s| {
        let c = s.catalog().clone();
        let mut paper = s.read(PAPER, &json!({"id": "paper-a"})).unwrap()[0].payload.clone();
        paper["title"] = json!("Edited in V2");
        s.commit(&json!({"ops": [stage::put_op(&c, PAPER, "paper-a", &paper).unwrap()]})).unwrap();
    });
    let before = e.state_hash();
    match qs_migrate_v1::undo(&e.host, &run).unwrap() {
        UndoOutcome::Refused { reasons } => {
            assert!(reasons.iter().any(|r| r["reason"].as_str().unwrap().contains("modified")), "{reasons:?}")
        }
        other => panic!("{other:?}"),
    }
    assert_eq!(e.state_hash(), before, "a refused undo changes nothing (there is no partial undo)");
}

#[test]
fn undo_is_refused_when_a_later_record_depends_on_a_migrated_one() {
    let e = env();
    let (_, a) = e.import("a.json", &fixture("r-full.json"));
    let run = run_id(a);
    // a V2-native review of a migrated Learner Response
    e.host.with_store(|s| {
        let c = s.catalog().clone();
        let review = json!({"schemaVersion": 1, "documentType": "quiz-studio.teacher-review", "id": "tr-v2-native", "responseId": "lr-obj-1",
                            "createdAt": "2026-01-01T00:00:00.000Z", "reviewer": {"type": "human"}, "itemReviews": [], "remediationRecommendations": []});
        s.commit(&json!({"ops": [stage::put_op(&c, TEACHER_REVIEW, "tr-v2-native", &review).unwrap()]})).unwrap();
    });
    let before = e.state_hash();
    match qs_migrate_v1::undo(&e.host, &run).unwrap() {
        UndoOutcome::Refused { reasons } => {
            assert!(reasons.iter().any(|r| r["reason"].as_str().unwrap().contains("depends")), "{reasons:?}")
        }
        other => panic!("{other:?}"),
    }
    assert_eq!(e.state_hash(), before);
}

#[test]
fn undoing_one_of_two_sources_keeps_the_records_the_other_still_contains() {
    let e = env();
    let (_, a) = e.import("x.json", &fixture("r-full.json"));
    let x = run_id(a);
    let mut v = fixture("r-full.json");
    v["library"]["papers"].as_array_mut().unwrap().push(
        json!({"schemaVersion": 1, "id": "paper-y", "title": "Y", "description": "", "category": "", "tags": [],
        "createdAt": "2025-05-01T00:00:00.000Z", "updatedAt": "2025-05-01T00:00:00.000Z", "lastOpenedAt": "2025-05-01T00:00:00.000Z",
        "questions": [{"id": "qy", "type": "truefalse", "prompt": "Y?", "answer": true}]}),
    );
    let (_, b) = e.import("y.json", &v);
    let y = run_id(b);
    // undo X: everything X created that Y also contains stays
    let UndoOutcome::Done { .. } = qs_migrate_v1::undo(&e.host, &x).unwrap() else { panic!("undo X") };
    assert_eq!(e.count("paper"), 3, "Y still contains paper-a/paper-b/paper-y");
    assert!(e.host.with_store(|s| s.check_consistency().unwrap()).is_empty());
    // undo Y: now nothing references them
    let UndoOutcome::Done { .. } = qs_migrate_v1::undo(&e.host, &y).unwrap() else { panic!("undo Y") };
    assert_eq!(e.count("paper"), 0);
    assert_eq!(e.count("media_object"), 0);
}

#[test]
fn an_absent_section_in_a_later_source_never_deletes_the_live_copy() {
    let e = env();
    e.import("full.json", &fixture("r-full.json"));
    let history = e.count("legacy_history_entry");
    assert!(history > 0);
    // a later backup of the same library (identical records) that lacks the history section entirely
    let mut v = fixture("r-full.json");
    v.as_object_mut().unwrap().remove("history");
    let (p, _) = e.import("no-history.json", &v);
    assert!(has(&p, "MIG_SECTION_ABSENT"));
    assert_eq!(e.count("legacy_history_entry"), history, "absent means not in this backup, never delete");
}

#[test]
fn the_write_gate_refuses_a_second_maintenance_operation_and_is_released_after_activation() {
    let e = env();
    let p = e.prepare(&e.source("a.json", &fixture_bytes("r-min.json")));
    {
        let _g = e.host.write_gate().unwrap();
        let err = qs_migrate_v1::activate(&e.host, &p, &p.report_hash).unwrap_err();
        assert_eq!(err.code, qs_platform::Code::StoreBusy);
    }
    e.activate(&p);
    assert!(!e.host.gate_is_open());
}

#[test]
fn a_defect_found_by_the_post_commit_verification_triggers_an_automatic_undo() {
    let e = env();
    let p = e.prepare(&e.source("v1.json", &fixture_bytes("r-full.json")));
    assert!(!p.blocked);
    // sabotage the staged source copy after the preview: the live post-verify re-reads it and must disagree
    let copy = p.staging_dir().join("source.bin");
    let mut v: Value = serde_json::from_slice(&std::fs::read(&copy).unwrap()).unwrap();
    v["history"].as_array_mut().unwrap().push(json!({"id": "sneaky", "paperId": "x"}));
    std::fs::write(&copy, serde_json::to_vec(&v).unwrap()).unwrap();
    let err = qs_migrate_v1::activate(&e.host, &p, &p.report_hash).unwrap_err();
    assert!(err.message.contains("ACTIVATION_POST_VERIFY_FAILED"), "{}", err.message);
    // the committed import was undone: no migrated record survives, the run and its undo are on record
    assert_eq!(domain_counts(&e).iter().filter(|(c, _)| c != "migration_origin").map(|(_, n)| n).sum::<i64>(), 0);
    assert_eq!(e.count("migration_origin"), 0);
    assert_eq!(e.count("migration_run"), 1);
    assert_eq!(e.count("migration_undo"), 1);
    assert!(e.host.with_store(|s| s.check_consistency().unwrap()).is_empty());
    assert!(!e.host.gate_is_open());
}

#[test]
fn a_live_record_that_appears_between_preview_and_commit_is_caught_by_the_commit_guard() {
    let e = env();
    let p = e.prepare(&e.source("v1.json", &fixture_bytes("r-full.json")));
    assert!(!p.blocked);
    // after the preview the user creates a *different* paper with the same id in the live store
    e.host.with_store(|s| {
        let c = s.catalog().clone();
        let mut paper = fixture("r-full.json")["library"]["papers"][0].clone();
        paper["title"] = json!("Created in V2 after the preview");
        paper["questions"] = json!([]); // no media: the live store does not hold the backup's media yet
        s.commit(&json!({"ops": [stage::put_op(&c, PAPER, "paper-a", &paper).unwrap()]})).unwrap();
    });
    let before = e.state_hash();
    let err = qs_migrate_v1::activate(&e.host, &p, &p.report_hash).unwrap_err();
    assert_eq!(err.code, qs_platform::Code::ActivationFailed, "{}", err.message);
    assert!(err.message.contains("no-conflicting-ids"), "{}", err.message);
    assert_eq!(e.state_hash(), before, "the guard rolled the whole activation back: live data is exactly what it was");
    assert_eq!(e.count("migration_run"), 0);
    assert!(!e.host.gate_is_open(), "the write gate is released on the failure path");
    // the user can retry the import after resolving the conflict: a fresh preview now reports it up front
    let again = e.prepare(&e.source("v1-again.json", &fixture_bytes("r-full.json")));
    assert!(again.blocked && blocking_codes(&again).contains(&"MIG_LIVE_CONFLICT".to_string()));
}

fn origin_of(e: &Env, source_id: &str, coll: &str, id: &str) -> Option<Value> {
    e.host.with_store(|s| s.read(ORIGIN, &json!({"id": format!("{source_id}:{coll}:{id}")})).unwrap().first().map(|r| r.payload.clone()))
}

fn paper_y() -> Value {
    json!({"schemaVersion": 1, "id": "paper-y", "title": "Y", "description": "", "category": "", "tags": [],
           "createdAt": "2025-05-01T00:00:00.000Z", "updatedAt": "2025-05-01T00:00:00.000Z", "lastOpenedAt": "2025-05-01T00:00:00.000Z",
           "questions": [{"id": "qy", "type": "truefalse", "prompt": "Y?", "answer": true}]})
}

#[test]
fn undo_moves_deletion_ownership_but_never_rewrites_the_original_disposition() {
    let e = env();
    let (px, a) = e.import("x.json", &fixture("r-full.json"));
    let x = run_id(a);
    let mut v = fixture("r-full.json");
    v["library"]["papers"].as_array_mut().unwrap().push(paper_y());
    let (py, b) = e.import("y.json", &v);
    let y = run_id(b);

    // X carried paper-a, Y only deduplicated it: the facts and the owners
    let ox = origin_of(&e, &px.source_id, "paper", "paper-a").unwrap();
    let oy = origin_of(&e, &py.source_id, "paper", "paper-a").unwrap();
    assert_eq!((ox["disposition"].as_str(), ox["deletionOwner"].as_bool()), (Some("carried"), Some(true)));
    assert_eq!((oy["disposition"].as_str(), oy["deletionOwner"].as_bool()), (Some("deduplicated-identical"), Some(false)));

    // undo X: the record stays because Y still contains it; Y now owns its deletion, its disposition is untouched
    let UndoOutcome::Done { .. } = qs_migrate_v1::undo(&e.host, &x).unwrap() else { panic!("undo X") };
    assert_eq!(e.count("paper"), 3);
    assert!(origin_of(&e, &px.source_id, "paper", "paper-a").is_none(), "X's origin rows are gone with X");
    let oy = origin_of(&e, &py.source_id, "paper", "paper-a").unwrap();
    assert_eq!(oy["disposition"], "deduplicated-identical", "the historical migration fact is never rewritten");
    assert_eq!(oy["deletionOwner"], true, "only the current deletion ownership moved");
    assert_eq!(oy["canonHash"], ox["canonHash"]);
    // Y's own new record stays Y's: carried, owner
    let ony = origin_of(&e, &py.source_id, "paper", "paper-y").unwrap();
    assert_eq!((ony["disposition"].as_str(), ony["deletionOwner"].as_bool()), (Some("carried"), Some(true)));

    // undo Y: nobody else holds them any more, so the records are removed safely
    let UndoOutcome::Done { .. } = qs_migrate_v1::undo(&e.host, &y).unwrap() else { panic!("undo Y") };
    assert_eq!(e.count("paper"), 0);
    assert_eq!(e.count("media_object"), 0);
    assert_eq!(e.count("migration_origin"), 0);
    assert!(e.host.with_store(|s| s.check_consistency().unwrap()).is_empty());
}

#[test]
fn undoing_the_deduplicating_run_first_changes_neither_the_record_nor_the_owner() {
    let e = env();
    let (px, a) = e.import("x.json", &fixture("r-full.json"));
    let x = run_id(a);
    let mut v = fixture("r-full.json");
    v["library"]["papers"].as_array_mut().unwrap().push(paper_y());
    let (_py, b) = e.import("y.json", &v);
    let y = run_id(b);
    let UndoOutcome::Done { .. } = qs_migrate_v1::undo(&e.host, &y).unwrap() else { panic!("undo Y") };
    assert_eq!(e.count("paper"), 2, "only Y's own paper-y is gone");
    let ox = origin_of(&e, &px.source_id, "paper", "paper-a").unwrap();
    assert_eq!((ox["disposition"].as_str(), ox["deletionOwner"].as_bool()), (Some("carried"), Some(true)));
    let UndoOutcome::Done { .. } = qs_migrate_v1::undo(&e.host, &x).unwrap() else { panic!("undo X") };
    assert_eq!(e.count("paper"), 0);
}

#[test]
fn a_native_v2_record_that_migrations_only_deduplicated_survives_every_undo() {
    let e = env();
    // a V2-native paper exists first (no migration origin); it has no media, so it can stand alone
    let native = paper_y();
    e.host.with_store(|s| {
        let c = s.catalog().clone();
        s.commit(&json!({"ops": [stage::put_op(&c, PAPER, "paper-y", &stage::normalized(&native)).unwrap()]})).unwrap();
    });
    assert_eq!(e.count("paper"), 1);

    // two different sources both contain it, so both only deduplicate against it
    let mut v1 = fixture("r-full.json");
    v1["library"]["papers"].as_array_mut().unwrap().push(native.clone());
    let (p1, a1) = e.import("one.json", &v1);
    let r1 = run_id(a1);
    let mut v2 = v1.clone();
    let mut extra = native.clone();
    extra["id"] = json!("paper-z");
    extra["questions"][0]["id"] = json!("qz");
    v2["library"]["papers"].as_array_mut().unwrap().push(extra);
    let (p2, a2) = e.import("two.json", &v2);
    let r2 = run_id(a2);
    for src in [&p1.source_id, &p2.source_id] {
        let o = origin_of(&e, src, "paper", "paper-y").unwrap();
        assert_eq!((o["disposition"].as_str(), o["deletionOwner"].as_bool()), (Some("deduplicated-identical"), Some(false)), "{src}");
    }
    let UndoOutcome::Done { .. } = qs_migrate_v1::undo(&e.host, &r1).unwrap() else { panic!("undo 1") };
    let UndoOutcome::Done { .. } = qs_migrate_v1::undo(&e.host, &r2).unwrap() else { panic!("undo 2") };
    assert_eq!(e.count("paper"), 1, "only the native record is left: every migrated paper is gone, the native one is never deleted");
    let kept = e.host.with_store(|s| s.read(PAPER, &json!({"id": "paper-y"})).unwrap()[0].payload.clone());
    assert_eq!(kept, stage::normalized(&native), "and it is unchanged");
    assert_eq!(e.count("migration_origin"), 0);
}
