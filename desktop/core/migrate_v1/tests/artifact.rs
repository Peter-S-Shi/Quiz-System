//! The S3 recovery artifact (ADR 0002 section 10.3, D-4, H-4): preserved byte-for-byte, reported in the
//! preview, never activated, archived, and never canonical.

mod common;
use common::*;
use qs_migrate_v1::catalog::*;
use qs_migrate_v1::{Activation, UndoOutcome};
use serde_json::{json, Value};

/// A V1 recovery blob whose `rawValue` is itself a (different) library - it must stay inert.
fn artifact_bytes() -> Vec<u8> {
    let raw = json!({"schemaVersion": 1, "papers": [{"id": "paper-inside-artifact", "title": "Only in the recovery blob", "questions": []}], "categories": []}).to_string();
    let blob = json!({"schemaVersion": 1, "sourceKey": "quiz-studio-library-v1", "rawValue": raw, "reason": "unsupported-or-corrupt", "preservedAt": "2025-02-01T00:00:00.000Z"});
    // not canonical on purpose: odd whitespace, CRLF, trailing newline - byte-for-byte means exactly these bytes
    format!("{}\r\n", serde_json::to_string_pretty(&blob).unwrap().replace('\n', "\r\n")).into_bytes()
}

#[test]
fn a_recovery_artifact_is_preserved_byte_for_byte_reported_and_never_activated() {
    let e = env();
    let bytes = artifact_bytes();
    let art = e.source("recovery.json", &bytes);
    let src = e.source("v1.json", &fixture_bytes("r-full.json"));
    let p = e.prepare_with_artifact(&src, &art);
    assert!(!p.blocked, "{:?}", p.report["diagnostics"]);
    let ra = &p.report["recoveryArtifact"];
    assert_eq!(ra["sha256"], sha256_hex(&bytes));
    assert_eq!(ra["rawValueParses"], true);
    assert!(ra["statement"].as_str().unwrap().contains("never activated"));
    assert!(has(&p, "MIG_RECOVERY_ARTIFACT_PRESERVED"));
    assert!(
        !e.root.recovery_artifacts_dir().join(format!("{}.artifact", sha256_hex(&bytes))).exists(),
        "nothing is written before the confirmation"
    );
    e.activate(&p);
    let file = e.root.recovery_artifacts_dir().join(format!("{}.artifact", sha256_hex(&bytes)));
    assert_eq!(std::fs::read(&file).unwrap(), bytes, "byte-for-byte, including CRLF");
    assert_eq!(e.count("recovery_artifact"), 1);
    // the artifact is never canonical: nothing was derived from its rawValue
    assert_eq!(e.count("paper"), 2, "only the backup's papers exist; the library inside the artifact stayed inert");
    let none: i64 =
        e.host.with_store(|s| s.conn().query_row("SELECT count(*) FROM paper WHERE id='paper-inside-artifact'", [], |r| r.get(0)).unwrap());
    assert_eq!(none, 0);
    let row: Value = e.host.with_store(|s| s.read(ARTIFACT, &json!({"id": sha256_hex(&bytes)})).unwrap()[0].payload.clone());
    assert_eq!(row["reason"], "unsupported-or-corrupt");
    assert_eq!(row["rawValueParses"], true);
    assert!(row.get("runOpId").is_none(), "the run link lives in the run record, so the same artifact deduplicates");
    let run: Value = e.host.with_store(|s| s.read(RUN, &json!({"id": p.op_id})).unwrap()[0].payload.clone());
    assert_eq!(run["recoveryId"], sha256_hex(&bytes));
    // the catalog classifies it as retained, not domain data
    let cat = e.host.catalog();
    assert_eq!(cat.collection(ARTIFACT).unwrap().role, qs_store::Role::Retained);
    assert!(cat.domain_collections().all(|c| c.name != ARTIFACT && c.name != ORIGIN && c.name != RUN));
}

#[test]
fn an_unrecognized_or_unreadable_artifact_blocks_the_run_and_a_bom_is_tolerated() {
    let e = env();
    let src = e.source("v1.json", &fixture_bytes("r-min.json"));
    for (name, bytes) in [
        ("not-json.bin", b"hello".to_vec()),
        ("wrong-key.json", br#"{"schemaVersion":1,"sourceKey":"other","rawValue":"{}","reason":"x","preservedAt":"t"}"#.to_vec()),
        ("missing-raw.json", br#"{"schemaVersion":1,"sourceKey":"quiz-studio-library-v1","reason":"x","preservedAt":"t"}"#.to_vec()),
    ] {
        let art = e.source(name, &bytes);
        let p = e.prepare_with_artifact(&src, &art);
        assert!(p.blocked && blocking_codes(&p).contains(&"MIG_RECOVERY_ARTIFACT_UNRECOGNIZED".to_string()), "{name}");
    }
    assert_eq!(e.count("recovery_artifact"), 0);
    let mut with_bom = vec![0xEF, 0xBB, 0xBF];
    with_bom.extend(artifact_bytes());
    let art = e.source("bom.json", &with_bom);
    let p = e.prepare_with_artifact(&src, &art);
    assert!(!p.blocked, "{:?}", p.report["diagnostics"]);
    e.activate(&p);
    let file = e.root.recovery_artifacts_dir().join(format!("{}.artifact", sha256_hex(&with_bom)));
    assert_eq!(std::fs::read(file).unwrap(), with_bom, "the BOM is preserved too");
}

#[test]
fn the_artifact_survives_an_archive_round_trip_with_the_migrated_store() {
    let e = env();
    let bytes = artifact_bytes();
    let art = e.source("recovery.json", &bytes);
    let p = e.prepare_with_artifact(&e.source("v1.json", &fixture_bytes("r-full.json")), &art);
    e.activate(&p);
    let archive = e.dir.path().join("backup.qsarchive");
    e.host.with_store(|s| qs_archive::create_archive(s, &archive).unwrap());
    let want = e.host.with_store(|s| s.state_hash(false).unwrap());
    let manifest = qs_archive::verify_archive(&archive, e.host.catalog().schema_version()).unwrap();
    assert!(manifest.entries.keys().any(|k| k.starts_with("recovery/")), "{:?}", manifest.entries.keys().collect::<Vec<_>>());
    let other = env();
    other.host.with_store(|s| qs_archive::restore_archive(s, &archive).unwrap());
    assert_eq!(
        other.host.with_store(|s| s.state_hash(false).unwrap()),
        want,
        "migrated records, origins, runs and the artifact row all travel"
    );
    let restored = std::fs::read(other.root.recovery_artifacts_dir().join(format!("{}.artifact", sha256_hex(&bytes)))).unwrap();
    assert_eq!(restored, bytes);
    assert_eq!(other.count("media_object"), 3);
    assert!(other.host.with_store(|s| s.check_consistency().unwrap()).is_empty());
}

#[test]
fn undo_removes_the_artifact_row_but_never_the_preserved_file_and_a_shared_artifact_stays() {
    let e = env();
    let bytes = artifact_bytes();
    let art = e.source("recovery.json", &bytes);
    let p = e.prepare_with_artifact(&e.source("v1.json", &fixture_bytes("r-min.json")), &art);
    e.activate(&p);
    let file = e.root.recovery_artifacts_dir().join(format!("{}.artifact", sha256_hex(&bytes)));
    assert!(matches!(qs_migrate_v1::undo(&e.host, &p.op_id).unwrap(), qs_migrate_v1::UndoOutcome::Done { .. }));
    assert_eq!(e.count("recovery_artifact"), 0);
    assert!(file.is_file(), "a preserved recovery artifact file is never deleted by undo");

    // supplied again with a different backup, then shared with a third one: undoing one keeps the row
    let e2 = env();
    let art2 = e2.source("recovery.json", &bytes);
    let p1 = e2.prepare_with_artifact(&e2.source("a.json", &fixture_bytes("r-min.json")), &art2);
    e2.activate(&p1);
    let mut v = fixture("r-min.json");
    v["library"]["papers"].as_array_mut().unwrap().push(json!({"schemaVersion": 1, "id": "p2", "title": "Two", "description": "", "category": "", "tags": [],
        "createdAt": "2025-05-01T00:00:00.000Z", "updatedAt": "2025-05-01T00:00:00.000Z", "lastOpenedAt": "2025-05-01T00:00:00.000Z", "questions": []}));
    let p2 = e2.prepare_with_artifact(&e2.source_json("b.json", &v), &art2);
    assert!(!p2.blocked, "{:?}", p2.report["diagnostics"]);
    e2.activate(&p2);
    assert_eq!(e2.count("recovery_artifact"), 1, "the same artifact deduplicates");
    qs_migrate_v1::undo(&e2.host, &p1.op_id).unwrap();
    assert_eq!(e2.count("recovery_artifact"), 1, "still referenced by the second run");
    qs_migrate_v1::undo(&e2.host, &p2.op_id).unwrap();
    assert_eq!(e2.count("recovery_artifact"), 0);
}

#[test]
fn an_artifact_supplied_later_for_an_already_migrated_source_is_preserved_without_touching_canonical_data() {
    let e = env();
    let bytes = artifact_bytes();
    let art = e.source("recovery.json", &bytes);
    let src = e.source("v1.json", &fixture_bytes("r-full.json"));

    // first import, no artifact
    let first = e.prepare(&src);
    let Activation::Done(done) = e.activate(&first) else { panic!("first import") };
    assert_eq!(e.count("recovery_artifact"), 0);

    // same source, no artifact: still a zero-write no-op
    let again = e.prepare(&src);
    assert!(again.already_migrated && !again.artifact_only);
    let quiet = e.state_hash();
    assert_eq!(e.state_hash(), quiet);

    // same source, now with a legal artifact that is not preserved yet: artifact-only
    let canonical_before = e.canonical_hash();
    let p = e.prepare_with_artifact(&src, &art);
    assert!(!p.blocked && !p.already_migrated && p.artifact_only, "{:?}", p.report["diagnostics"]);
    assert_eq!(p.report["plan"]["mode"], "artifact-only");
    assert_eq!(p.report["plan"]["canonicalRecordsTouched"], 0);
    assert_eq!(p.report["recoveryArtifact"]["sha256"], sha256_hex(&bytes));
    let file = e.root.recovery_artifacts_dir().join(format!("{}.artifact", sha256_hex(&bytes)));
    assert!(!file.exists(), "nothing is written before the confirmation");
    let Activation::Done(att) = e.activate(&p) else { panic!("attach") };
    assert_ne!(att.run_op_id, done.run_op_id);
    assert_eq!(std::fs::read(&file).unwrap(), bytes, "byte-for-byte, including CRLF");
    assert_eq!(e.count("recovery_artifact"), 1);
    assert_eq!(e.canonical_hash(), canonical_before, "no canonical record, origin or earlier run was written or overwritten");
    assert_eq!(e.count("migration_origin"), 19);
    assert_eq!(e.count("paper"), 2, "nothing inside the artifact was activated");

    // the durable link is the attach record; the canonical run is still the only active import of the source
    let rec: Value = e.host.with_store(|s| s.read(RUN, &json!({"id": att.run_op_id})).unwrap()[0].payload.clone());
    assert_eq!(
        (rec["kind"].as_str(), rec["recoveryId"].as_str(), rec["sourceId"].as_str()),
        (Some("artifact-attach"), Some(sha256_hex(&bytes).as_str()), Some(first.source_id.as_str()))
    );
    assert_eq!(rec["attachedTo"], done.run_op_id);

    // supplying the same artifact again is a no-op; so is the source without it
    let quiet = e.state_hash();
    let again = e.prepare_with_artifact(&src, &art);
    assert!(again.already_migrated && !again.artifact_only);
    assert_eq!(e.state_hash(), quiet);

    // archive round-trip: migrated records, origins, both run records and the artifact all travel
    let archive = e.dir.path().join("backup.qsarchive");
    e.host.with_store(|s| qs_archive::create_archive(s, &archive).unwrap());
    let want = e.host.with_store(|s| s.state_hash(false).unwrap());
    let manifest = qs_archive::verify_archive(&archive, e.host.catalog().schema_version()).unwrap();
    assert!(manifest.entries.keys().any(|k| k.starts_with("recovery/")));
    let other = env();
    other.host.with_store(|s| qs_archive::restore_archive(s, &archive).unwrap());
    assert_eq!(other.host.with_store(|s| s.state_hash(false).unwrap()), want);
    assert_eq!(std::fs::read(other.root.recovery_artifacts_dir().join(format!("{}.artifact", sha256_hex(&bytes)))).unwrap(), bytes);

    // undoing the attach removes only the artifact row (never the file); the import stays and is still a no-op
    let UndoOutcome::Done { records_deleted, .. } = qs_migrate_v1::undo(&e.host, &att.run_op_id).unwrap() else { panic!("undo attach") };
    assert_eq!(records_deleted, 0);
    assert_eq!(e.count("recovery_artifact"), 0);
    assert!(file.is_file());
    assert_eq!(e.canonical_hash(), canonical_before);
    assert!(e.prepare(&src).already_migrated);
}

#[test]
fn an_illegal_artifact_for_an_already_migrated_source_is_blocked_and_changes_nothing() {
    let e = env();
    let src = e.source("v1.json", &fixture_bytes("r-min.json"));
    e.activate(&e.prepare(&src));
    let quiet = e.state_hash();
    let bad = e.source("bad.bin", b"not an artifact");
    let p = e.prepare_with_artifact(&src, &bad);
    assert!(p.blocked && blocking_codes(&p).contains(&"MIG_RECOVERY_ARTIFACT_UNRECOGNIZED".to_string()));
    assert_eq!(e.state_hash(), quiet);
}
