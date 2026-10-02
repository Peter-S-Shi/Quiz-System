//! V1 migration crash/fault matrix and memory envelope (ADR 0002 sections 13.1, 16.3; method of ADR 0001 H3).
//!
//! A child process runs the migration and is hard-terminated at a named checkpoint (or at a random time). After
//! every kill the store must be in EXACTLY the pre-state or EXACTLY the post-state (never a third), recovery is
//! deterministic and idempotent, the user's file is untouched, and a retry completes.
//!
//! Scale: `QS_H3_REPEATS` (checkpoint repeats, default 1; CI 3), `QS_MIG_KILLS` (random kills, default 12; CI 200),
//! `QS_HEAVY_MIB` (memory-envelope media size, default 48; CI 400).

use qs_media::MediaStore;
use qs_migrate_v1::catalog::*;
use qs_platform::DataRoot;
use qs_scenarios::*;
use qs_store::{OpenOptions, Store};
use qs_testkit::*;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Arc;

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../migrate_v1/tests/fixtures").join(name)
}

fn open(root: &DataRoot) -> Store {
    Store::open(root, Arc::new(qs_migrate_v1::product_catalog()), &OpenOptions::default()).expect("open after kill")
}

const COLLECTIONS: &[&str] =
    &[PAPER, CATEGORIES, LEARNER_RESPONSE, TEACHER_REVIEW, FOLDER, DOCUMENT, HISTORY, RESIDUE, ORIGIN, "media_object", ARTIFACT, RUN];

fn counts(s: &Store) -> Vec<(String, i64)> {
    COLLECTIONS.iter().map(|c| (c.to_string(), s.count(c).unwrap())).collect()
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
enum State {
    Pre,
    Post,
}

/// The whole-store predicate: exactly empty, or exactly the full import - nothing in between.
fn classify(s: &Store, with_artifact: bool) -> State {
    let c: std::collections::BTreeMap<String, i64> = counts(s).into_iter().collect();
    let all_zero = c.values().all(|v| *v == 0);
    let artifact = with_artifact as i64;
    let full = c[PAPER] == 2
        && c[CATEGORIES] == 1
        && c[LEARNER_RESPONSE] == 4
        && c[TEACHER_REVIEW] == 3
        && c[FOLDER] == 1
        && c[DOCUMENT] == 2
        && c[HISTORY] == 3
        && c["media_object"] == 3
        && c[ORIGIN] == 19
        && c[RUN] == 1
        && c[ARTIFACT] == artifact;
    match (all_zero, full) {
        (true, false) => State::Pre,
        (false, true) => State::Post,
        _ => panic!("HALF STATE after a kill: {c:?}"),
    }
}

fn artifact_file(t: &TestRoot) -> PathBuf {
    let p = t.dir.path().join("recovery.json");
    std::fs::write(&p, br#"{"schemaVersion":1,"sourceKey":"quiz-studio-library-v1","rawValue":"{}","reason":"synthetic","preservedAt":"2025-02-01T00:00:00.000Z"}"#).unwrap();
    p
}

fn last_json(out: &std::process::Output) -> Value {
    let text = String::from_utf8_lossy(&out.stdout);
    serde_json::from_str(text.lines().rev().find(|l| l.starts_with('{')).unwrap_or("{}")).unwrap_or(Value::Null)
}

fn killed_at(checkpoint: &str, with_artifact: bool, round: usize) {
    let t = temp_root();
    let src = fixture("r-full.json");
    let before = std::fs::read(&src).unwrap();
    let root_s = root_str(&t.root);
    let src_s = src.display().to_string();
    let art = artifact_file(&t);
    let art_s = art.display().to_string();
    let mut args = vec!["migrate", root_s.as_str(), src_s.as_str()];
    if with_artifact {
        args.push(art_s.as_str());
    }
    let out = run(&args, Some(checkpoint));
    assert_eq!(
        out.status.code(),
        Some(99),
        "{checkpoint} round {round}: the child was not terminated at the checkpoint (not reached?)\n{}",
        String::from_utf8_lossy(&out.stderr)
    );

    // reopen like the app does: recover, then judge the store
    let store = open(&t.root);
    let recovered = qs_activation::recover(&store).expect("recover");
    let state = classify(&store, with_artifact);
    assert!(store.quick_check().unwrap(), "{checkpoint}: quick_check");
    assert!(store.check_consistency().unwrap().is_empty(), "{checkpoint}: projections drifted");
    assert!(qs_activation::recover(&store).unwrap().is_empty(), "{checkpoint}: recovery must be idempotent");
    let expected_post = matches!(checkpoint, "after-commit" | "after-journal-done");
    let expected_pre = matches!(
        checkpoint,
        "mig-after-intake"
            | "mig-mid-staging"
            | "mig-after-staging"
            | "mig-after-report"
            | "mig-mid-media-publish"
            | "mig-after-media-publish"
            | "mig-after-artifact-publish"
            | "before-snapshot"
            | "after-snapshot"
            | "mid-copy"
            | "before-commit"
    );
    if expected_post {
        assert_eq!(state, State::Post, "{checkpoint}: commit record exists => complete-forward");
    }
    if expected_pre {
        assert_eq!(state, State::Pre, "{checkpoint}: nothing may be visible before the commit point");
    }
    if state == State::Post {
        // media and artifact are present and intact
        let media = MediaStore::new(t.root.media_dir());
        assert_eq!(media.list().unwrap().len(), 2);
        for h in media.list().unwrap() {
            media.verify(&h, None).unwrap();
        }
        assert!(
            !recovered.is_empty() || checkpoint == "after-journal-done",
            "{checkpoint}: the interrupted operation was resolved by recovery"
        );
    }
    assert_eq!(std::fs::read(&src).unwrap(), before, "the user's file is untouched");
    drop(store);

    // retry completes: fresh work from a pre-state, a no-op from a post-state
    let out = run(&args, None);
    assert!(out.status.success(), "{checkpoint}: retry failed: {}", String::from_utf8_lossy(&out.stderr));
    let r = last_json(&out);
    match state {
        State::Pre => assert_eq!(r["result"], "done", "{checkpoint}: {r}"),
        State::Post => assert_eq!(r["result"], "already-migrated", "{checkpoint}: {r}"),
    }
    let store = open(&t.root);
    assert_eq!(classify(&store, with_artifact), State::Post);
    assert!(store.check_consistency().unwrap().is_empty());
}

#[test]
fn every_checkpoint_leaves_exactly_the_pre_state_or_exactly_the_post_state() {
    let repeats = env_usize("QS_H3_REPEATS", 1);
    let checkpoints = [
        "mig-after-intake",
        "mig-mid-staging",
        "mig-after-staging",
        "mig-after-report",
        "mig-mid-media-publish",
        "mig-after-media-publish",
        "mig-after-artifact-publish",
        "before-snapshot",
        "after-snapshot",
        "mid-copy",
        "before-commit",
        "after-commit",
        "after-journal-done",
    ];
    let mut runs = 0;
    for cp in checkpoints {
        for r in 0..repeats {
            killed_at(cp, false, r);
            runs += 1;
        }
    }
    // the recovery artifact variant exercises its publication ordering too
    for cp in ["mig-after-media-publish", "mig-after-artifact-publish", "before-commit", "after-commit"] {
        killed_at(cp, true, 0);
        runs += 1;
    }
    eprintln!("migration fault matrix: {runs} kills, every one exactly pre or post");
}

#[test]
fn randomly_timed_kills_never_leave_a_half_import_and_a_retry_always_completes() {
    let kills = env_usize("QS_MIG_KILLS", 12);
    let mut rng = fastrand::Rng::with_seed(0x5EED_1234);
    let (mut pre, mut post) = (0, 0);
    for round in 0..kills {
        let t = temp_root();
        let src = fixture("r-full.json");
        let (root_s, src_s) = (root_str(&t.root), src.display().to_string());
        let mut child = spawn(&["migrate", &root_s, &src_s]);
        std::thread::sleep(std::time::Duration::from_millis(rng.u64(20..700)));
        let _ = child.kill();
        let _ = child.wait();
        let store = open(&t.root);
        qs_activation::recover(&store).expect("recover");
        match classify(&store, false) {
            State::Pre => pre += 1,
            State::Post => post += 1,
        }
        assert!(store.quick_check().unwrap() && store.check_consistency().unwrap().is_empty(), "round {round}");
        assert!(qs_activation::recover(&store).unwrap().is_empty());
        drop(store);
        let out = run(&["migrate", &root_s, &src_s], None);
        assert!(out.status.success(), "round {round}: retry: {}", String::from_utf8_lossy(&out.stderr));
        assert_eq!(classify(&open(&t.root), false), State::Post);
    }
    eprintln!("migration random kills: {kills} rounds ({pre} pre, {post} post), 0 violations");
}

#[test]
fn a_kill_during_undo_leaves_the_import_intact_and_undo_can_be_repeated() {
    for cp in ["mig-before-undo-commit", "uow-before-commit"] {
        let t = temp_root();
        let src = fixture("r-full.json");
        let (root_s, src_s) = (root_str(&t.root), src.display().to_string());
        let done = last_json(&run(&["migrate", &root_s, &src_s], None));
        let run_id = done["runOpId"].as_str().unwrap().to_string();
        let out = run(&["migrate-undo", &root_s, &run_id], Some(cp));
        assert_eq!(out.status.code(), Some(99), "{cp}: {}", String::from_utf8_lossy(&out.stderr));
        {
            let store = open(&t.root);
            assert_eq!(classify(&store, false), State::Post, "{cp}: undo is one transaction - killed before commit it changed nothing");
        }
        let r = last_json(&run(&["migrate-undo", &root_s, &run_id], None));
        assert_eq!(r["result"], "done", "{cp}: {r}");
        let store = open(&t.root);
        let c = counts(&store);
        assert!(c.iter().all(|(k, v)| k == RUN || *v == 0), "{cp}: undo removed everything it created: {c:?}");
        assert!(store.check_consistency().unwrap().is_empty());
    }
}

#[test]
fn a_large_backup_streams_within_the_memory_envelope_and_media_is_byte_identical() {
    let mib = env_usize("QS_HEAVY_MIB", 48);
    let t = temp_root();
    let big = t.dir.path().join("big-backup.json");
    let (root_s, big_s) = (root_str(&t.root), big.display().to_string());
    let g = run(&["gen-big", &big_s, &mib.to_string(), "4"], None);
    assert!(g.status.success(), "{}", String::from_utf8_lossy(&g.stderr));
    let expected: Vec<String> = serde_json::from_slice(&std::fs::read(format!("{big_s}.hashes.json")).unwrap()).unwrap();
    let file_mib = std::fs::metadata(&big).unwrap().len() / (1024 * 1024);
    let out = run(&["migrate", &root_s, &big_s], None);
    assert!(out.status.success(), "{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    let r = last_json(&out);
    assert_eq!(r["result"], "done", "{r}");
    let peak = r["peakMiB"].as_f64().unwrap();
    eprintln!("migration memory envelope: {mib} MiB decoded media ({file_mib} MiB backup file) -> child peak working set {peak:.1} MiB");
    assert!(peak < 300.0, "peak working set {peak} MiB exceeds the 300 MiB envelope");
    let store = open(&t.root);
    let media = MediaStore::new(t.root.media_dir());
    let hashes: std::collections::BTreeSet<String> = media.list().unwrap().into_iter().collect();
    assert_eq!(hashes.len(), 4);
    for h in &expected {
        assert!(hashes.contains(h), "published media is byte-identical to what the source encoded: {h}");
        media.verify(h, None).unwrap();
    }
    assert_eq!(store.count("media_object").unwrap(), 4);
    assert!(store.check_consistency().unwrap().is_empty());
}
