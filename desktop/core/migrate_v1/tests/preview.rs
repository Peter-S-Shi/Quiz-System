//! Preview and confirmation contract, source immutability and the TOCTOU boundary
//! (ADR 0002 sections 4, 12, 16.2-10/11).

mod common;
use common::*;
use qs_migrate_v1::{Activation, Host};
use serde_json::{json, Value};

#[test]
fn the_report_is_deterministic_path_free_and_carries_every_required_section() {
    let a = env();
    let b = env();
    let pa = a.prepare(&a.source("one-name.json", &fixture_bytes("r-full.json")));
    let pb = b.prepare(&b.source("one-name.json", &fixture_bytes("r-full.json")));
    assert_eq!(pa.report_hash, pb.report_hash, "identical inputs give an identical reportHash (no op id, no time, no path)");
    let r = &pa.report;
    for key in ["classification", "counts", "diagnostics", "loss", "plan", "media", "sourceId", "sourceBytes", "blocking", "reportable"] {
        assert!(!r[key].is_null(), "report section {key} is missing");
    }
    assert_eq!(r["plan"]["mode"], "merge-keep-existing");
    assert_eq!(r["plan"]["snapshotBeforeActivation"], true);
    assert_eq!(r["loss"]["notMigrated"].as_array().unwrap().len(), 5, "the fixed not-migrated list is always stated");
    assert!(r["loss"]["gaps"]["objective.feedback-mode"].as_u64().unwrap() >= 2);
    assert_eq!(r["media"]["referenced"], 3);
    assert!(r["recoveryArtifact"].is_null());
    let mut paths = vec![];
    path_like_strings(r, &mut paths);
    assert!(paths.is_empty(), "the report must carry no path: {paths:?}");
    let text = r.to_string();
    assert!(!text.contains(&a.dir.path().display().to_string()) && !text.contains("qs-data"));
    // the source appears as a base name plus its digest only
    assert_eq!(r["sourceName"], "one-name.json");
    // blocking first, structured params only
    assert!(r["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .all(|d| d["code"].is_string() && d["severity"].is_string() && d["stage"].is_string()));
}

#[test]
fn a_blocked_preview_has_nothing_to_confirm() {
    let e = env();
    let mut v = fixture("r-full.json");
    v["teacherReviews"][0]["responseId"] = json!("nope");
    let p = e.prepare(&e.source_json("v1.json", &v));
    assert!(p.blocked);
    let err = qs_migrate_v1::activate(&e.host, &p, &p.report_hash).unwrap_err();
    assert_eq!(err.code, qs_platform::Code::ValidationFailed);
    assert_eq!(e.count("paper"), 0);
}

#[test]
fn the_staged_copy_is_the_authority_after_intake_so_later_changes_to_the_users_file_do_not_matter() {
    let e = env();
    let bytes = fixture_bytes("r-full.json");
    let src = e.source("v1.json", &bytes);
    let p = e.prepare(&src);
    assert!(!p.blocked);
    // the staging copy hashes to the source id (the TOCTOU boundary)
    let copy = std::fs::read(p.staging_dir().join("source.bin")).unwrap();
    assert_eq!(p.source_id, format!("v1-src-{}", sha256_hex(&bytes)));
    assert_eq!(sha256_hex(&copy), sha256_hex(&bytes));
    // the user then edits, and finally deletes, the original
    std::fs::write(&src, b"{\"completely\": \"different now\"}").unwrap();
    std::fs::remove_file(&src).unwrap();
    let a = e.activate(&p);
    assert!(matches!(a, Activation::Done(_)), "the attempt completes on the staged copy");
    assert_eq!(e.count("paper"), 2);
    assert_eq!(e.count("learner_response"), 4);
}

#[test]
#[allow(clippy::permissions_set_readonly_false)] // Windows read-only attribute, reset so the temp dir can be removed
fn the_users_file_is_only_ever_opened_for_reading() {
    let e = env();
    let bytes = fixture_bytes("r-full.json");
    let src = e.source("v1.json", &bytes);
    // a read-only file cannot be opened for writing: if the migrator ever tried, intake would fail
    let mut perm = std::fs::metadata(&src).unwrap().permissions();
    perm.set_readonly(true);
    std::fs::set_permissions(&src, perm).unwrap();
    let p = e.prepare(&src);
    assert!(!p.blocked, "{:?}", p.report["diagnostics"]);
    e.activate(&p);
    // blocked outcomes too
    let bad = e.source("bad.json", b"not json");
    let mut perm = std::fs::metadata(&bad).unwrap().permissions();
    perm.set_readonly(true);
    std::fs::set_permissions(&bad, perm).unwrap();
    let pb = e.prepare(&bad);
    assert!(pb.blocked);
    assert_eq!(std::fs::read(&src).unwrap(), bytes);
    assert_eq!(std::fs::read(&bad).unwrap(), b"not json");
    for f in [&src, &bad] {
        let mut perm = std::fs::metadata(f).unwrap().permissions();
        perm.set_readonly(false);
        std::fs::set_permissions(f, perm).unwrap();
    }
}

#[test]
fn a_cancelled_preview_leaves_no_trace_and_orphan_staging_is_purged() {
    let e = env();
    let p = e.prepare(&e.source("v1.json", &fixture_bytes("r-full.json")));
    let dir = p.staging_dir().to_path_buf();
    assert!(dir.exists());
    let before = e.state_hash();
    p.discard();
    assert!(!dir.exists());
    assert_eq!(e.state_hash(), before);
    // a crash would leave a staging directory behind; startup purges it
    let leftover = e.root.staging_dir().join("op-leftover");
    std::fs::create_dir_all(leftover.join("media")).unwrap();
    std::fs::write(leftover.join("source.bin"), b"x").unwrap();
    qs_migrate_v1::purge_orphan_staging(&e.root);
    assert!(!leftover.exists());
}

#[test]
fn the_pre_activation_snapshot_is_kept_as_the_disaster_path() {
    let e = env();
    let p = e.prepare(&e.source("v1.json", &fixture_bytes("r-min.json")));
    e.activate(&p);
    let snap = e.root.snapshots_dir().join(format!("pre-{}.db", p.op_id));
    assert!(snap.is_file(), "pre-activation snapshot must exist");
    // restoring it through the foundation primitive returns the store to the state before the import
    e.host.with_store(|s| qs_activation::restore_snapshot(s, &snap, "op-disaster", "snapshot-restore").unwrap());
    assert_eq!(e.count("paper"), 0);
    let _ = (Value::Null, e.host.gate_is_open());
}
