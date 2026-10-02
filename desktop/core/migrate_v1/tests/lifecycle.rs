//! End-to-end lifecycle (ADR 0002 section 4): a valid V1 backup migrates after preview + confirmation.

mod common;
use common::*;
use qs_migrate_v1::Activation;
use serde_json::json;

#[test]
fn a_minimal_valid_backup_previews_confirms_and_activates_with_a_consistent_store() {
    let e = env();
    let src = e.source("v1-backup.json", &fixture_bytes("r-min.json"));
    let p = e.prepare(&src);
    assert!(!p.blocked, "{:?}", codes(&p));
    assert!(p.source_id.starts_with("v1-src-"));
    assert_eq!(p.report["counts"]["paper"]["carried"], 1);
    let a = e.activate(&p);
    let Activation::Done(done) = a else { panic!("expected a completed activation") };
    assert_eq!(e.count("paper"), 1);
    assert_eq!(e.count("migration_run"), 1);
    assert_eq!(e.count("migration_origin"), 2, "one origin per migrated record (the paper and the category list)");
    let problems = e.host.with_store(|s| s.check_consistency().unwrap());
    assert!(problems.is_empty(), "{problems:?}");
    assert_eq!(done.run_op_id, p.op_id);
    assert!(src.exists(), "the user's file is never touched");
    let _ = json!(null);
}

#[test]
fn the_full_synthetic_backup_migrates_every_entity_kind_and_proves_conservation() {
    let e = env();
    let src = e.source("v1-full.json", &fixture_bytes("r-full.json"));
    let p = e.prepare(&src);
    assert!(!p.blocked, "{:?}", p.report["diagnostics"]);
    let c = &p.report["counts"];
    assert_eq!(c["paper"]["carried"], 2);
    assert_eq!(c["teacher_review"]["carried"], 3);
    assert_eq!(c["translation_folder"]["carried"], 1);
    assert_eq!(c["translation_document"]["carried"], 2);
    assert_eq!(c["legacy_history_entry"]["carried"], 3);
    assert_eq!(c["media_object"]["carried"], 3);
    assert_eq!(c["learner_response.objective"]["carried"], 2);
    assert_eq!(c["learner_response.translation"]["carried"], 2);
    // the verifier already ran inside prepare(); activate and let the live post-verify run too
    let a = e.activate(&p);
    assert!(matches!(a, qs_migrate_v1::Activation::Done(_)));
    assert!(e.host.with_store(|s| s.check_consistency().unwrap()).is_empty());
    assert_eq!(e.count("learner_response"), 4);
    assert_eq!(e.count("media_object"), 3);
}
