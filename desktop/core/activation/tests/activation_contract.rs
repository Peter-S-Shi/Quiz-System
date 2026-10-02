//! Activation primitive contract (ADR 0001 H3 method, in-process half; the kill-point matrix lives in
//! `qs-scenarios`): validate in isolation, commit atomically, roll back through the same primitive.

use qs_activation::*;
use qs_media::MediaStore;
use qs_platform::Code;
use qs_store::{Catalog, OpenOptions, Store};
use qs_testkit::*;
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;

fn cat() -> Arc<Catalog> {
    arc(evidence_catalog())
}

fn open_live(t: &TestRoot, c: &Arc<Catalog>) -> Store {
    Store::open(&t.root, c.clone(), &OpenOptions::default()).unwrap()
}

/// Build a staging DB by filling a *separate* store and snapshotting it (what a restore/migration builder does).
fn build_staging(live: &Store, c: &Arc<Catalog>, op: &str, fill: impl Fn(&mut Store)) -> (Staging, String) {
    let other = temp_root();
    let mut src = Store::open(&other.root, c.clone(), &OpenOptions { lock: false, ..OpenOptions::default() }).unwrap();
    fill(&mut src);
    let st = create_staging(live.root(), op).unwrap();
    src.snapshot_to(&st.db).unwrap();
    normalize_staging(&st.db).unwrap();
    let hash = src.state_hash(true).unwrap();
    (st, hash)
}

fn fill_n(range: std::ops::RangeInclusive<u64>) -> impl Fn(&mut Store) {
    move |s: &mut Store| {
        let c = s.catalog().clone();
        for n in range.clone() {
            s.commit(&finalize_uow(&c, n, &[])).unwrap();
        }
    }
}

fn hash(s: &Store) -> String {
    s.state_hash(true).unwrap()
}

#[test]
fn replace_on_an_empty_store_makes_it_equal_to_the_staging_set() {
    let t = temp_root();
    let c = cat();
    let mut live = open_live(&t, &c);
    let (st, staged_hash) = build_staging(&live, &c, "op-r1", fill_n(1..=25));
    let before = std::fs::read(&st.db).unwrap();
    let rep = activate(&mut live, &st.db, Mode::Replace, "op-r1", &Options { verify_staging_untouched: true, ..Options::default() }).unwrap();
    assert_eq!(hash(&live), staged_hash);
    assert_eq!(live.count("learner_response").unwrap(), 25);
    assert!(live.check_consistency().unwrap().is_empty());
    assert!(rep.snapshot.exists());
    assert_eq!(std::fs::read(&st.db).unwrap(), before, "staging must be read-only to the activation");
}

#[test]
fn replace_discards_existing_live_data() {
    let t = temp_root();
    let c = cat();
    let mut live = open_live(&t, &c);
    fill_n(100..=110)(&mut live);
    let (st, staged) = build_staging(&live, &c, "op-r2", fill_n(1..=5));
    activate(&mut live, &st.db, Mode::Replace, "op-r2", &Options::default()).unwrap();
    assert_eq!(hash(&live), staged);
    assert_eq!(live.count("learner_response").unwrap(), 5);
}

#[test]
fn merge_staging_wins_unions_and_overwrites_by_id_replacing_relationship_rows() {
    let t = temp_root();
    let c = cat();
    let mut live = open_live(&t, &c);
    fill_n(1..=3)(&mut live);
    // staging: resp-3 re-authored with 5 items, plus new resp-4
    let (st, _) = build_staging(&live, &c, "op-m1", |s| {
        let c = s.catalog().clone();
        s.commit(&uow(vec![put_op(&c, "learner_response", "resp-3", response_payload(3, 5, &[]))])).unwrap();
        s.commit(&finalize_uow(&c, 4, &[])).unwrap();
    });
    activate(&mut live, &st.db, Mode::Merge(MergePolicy::StagingWins), "op-m1", &Options::default()).unwrap();
    assert_eq!(live.count("learner_response").unwrap(), 4);
    let r3 = live.read("learner_response", &json!({"id": "resp-3"})).unwrap();
    assert_eq!(r3[0].payload["itemCount"], 5);
    let items: i64 = live.conn().query_row("SELECT count(*) FROM response_item WHERE response_id='resp-3'", [], |r| r.get(0)).unwrap();
    assert_eq!(items, 5, "relationship rows of a merged owner are replaced, not appended");
    assert!(live.check_consistency().unwrap().is_empty());
}

#[test]
fn merge_keep_existing_only_adds_new_ids() {
    let t = temp_root();
    let c = cat();
    let mut live = open_live(&t, &c);
    fill_n(1..=3)(&mut live);
    let (st, _) = build_staging(&live, &c, "op-m2", |s| {
        let c = s.catalog().clone();
        s.commit(&uow(vec![put_op(&c, "learner_response", "resp-3", response_payload(3, 5, &[]))])).unwrap();
        s.commit(&finalize_uow(&c, 4, &[])).unwrap();
    });
    activate(&mut live, &st.db, Mode::Merge(MergePolicy::KeepExisting), "op-m2", &Options::default()).unwrap();
    assert_eq!(live.count("learner_response").unwrap(), 4);
    assert_eq!(live.read("learner_response", &json!({"id": "resp-3"})).unwrap()[0].payload["itemCount"], 20, "existing row kept");
    let items: i64 = live.conn().query_row("SELECT count(*) FROM response_item WHERE response_id='resp-3'", [], |r| r.get(0)).unwrap();
    assert_eq!(items, 20);
    assert!(live.check_consistency().unwrap().is_empty());
}

#[test]
fn validation_failures_block_activation_and_leave_live_data_untouched() {
    let t = temp_root();
    let c = cat();
    let mut live = open_live(&t, &c);
    fill_n(1..=3)(&mut live);
    let live_hash = hash(&live);

    // 1. a staging set whose projections drifted out-of-band
    let (st, _) = build_staging(&live, &c, "op-v1", fill_n(10..=12));
    rusqlite::Connection::open(&st.db).unwrap().execute_batch("UPDATE learner_response SET paper_id='tampered'").unwrap();
    let e = activate(&mut live, &st.db, Mode::Replace, "op-v1", &Options::default()).unwrap_err();
    assert_eq!(e.code, Code::ValidationFailed, "{e}");
    assert_eq!(hash(&live), live_hash);

    // 2. a corrupt (non-database) staging file
    let st2 = create_staging(live.root(), "op-v2").unwrap();
    std::fs::write(&st2.db, b"this is not a database at all").unwrap();
    assert!(activate(&mut live, &st2.db, Mode::Replace, "op-v2", &Options::default()).is_err());
    assert_eq!(hash(&live), live_hash);

    // 3. a staging set that references media the live store does not have
    let (st3, _) = build_staging(&live, &c, "op-v3", |s| {
        let c = s.catalog().clone();
        s.commit(&uow(vec![put_op(&c, "media_object", "m1", media_object_payload("m1", &"cd".repeat(32), 10))])).unwrap();
    });
    let e = activate(&mut live, &st3.db, Mode::Replace, "op-v3", &Options::default()).unwrap_err();
    assert_eq!(e.code, Code::ValidationFailed);
    assert!(e.message.contains("file missing"), "{e}");
    assert_eq!(hash(&live), live_hash);

    // 4. wrong store schema version in the staging set
    let (st4, _) = build_staging(&live, &c, "op-v4", fill_n(1..=1));
    rusqlite::Connection::open(&st4.db).unwrap().pragma_update(None, "user_version", 1).unwrap();
    assert_eq!(activate(&mut live, &st4.db, Mode::Replace, "op-v4", &Options::default()).unwrap_err().code, Code::ValidationFailed);
    assert_eq!(hash(&live), live_hash);
}

#[test]
fn media_referenced_by_staging_must_be_present_and_intact() {
    let t = temp_root();
    let c = cat();
    let mut live = open_live(&t, &c);
    let media = MediaStore::new(live.root().media_dir());
    let stored = media.put_bytes(b"some image bytes").unwrap();
    let (st, _) = build_staging(&live, &c, "op-med", |s| {
        let c = s.catalog().clone();
        s.commit(&uow(vec![
            put_op(&c, "media_object", "img-1", media_object_payload("img-1", &stored.hash, stored.size)),
            put_op(&c, "learner_response", "resp-1", response_payload(1, 2, &["img-1".to_string()])),
        ]))
        .unwrap();
    });
    // tamper the media file: a deep check must catch it, the shallow check (presence + size) cannot
    std::fs::write(media.path_for(&stored.hash).unwrap(), b"SOME IMAGE BYTES").unwrap();
    let e = activate(&mut live, &st.db, Mode::Replace, "op-med", &Options { deep_media_check: true, ..Options::default() }).unwrap_err();
    assert_eq!(e.code, Code::ValidationFailed);
    assert!(e.message.contains("content address"), "{e}");
}

#[test]
fn rollback_restores_the_exact_pre_activation_state_through_the_same_primitive() {
    let t = temp_root();
    let c = cat();
    let mut live = open_live(&t, &c);
    fill_n(1..=8)(&mut live);
    let pre = hash(&live);
    let (st, staged) = build_staging(&live, &c, "op-rb", fill_n(50..=60));
    activate(&mut live, &st.db, Mode::Replace, "op-rb", &Options::default()).unwrap();
    assert_eq!(hash(&live), staged);
    rollback(&mut live, "op-rb").unwrap();
    assert_eq!(hash(&live), pre, "rollback must restore exactly the pre-activation state");
    assert!(live.check_consistency().unwrap().is_empty());
    assert_eq!(rollback(&mut live, "op-never-happened").unwrap_err().code, Code::NotFound);
}

#[test]
fn recovery_resolves_unfinished_operations_from_journal_and_commit_record() {
    let t = temp_root();
    let c = cat();
    let live = open_live(&t, &c);
    let root = live.root().clone();
    // A: begun/snapshotted but never committed -> discarded
    journal::write(&root, "op-a", "restore", "replace", "snapshotted", json!({})).unwrap();
    create_staging(&root, "op-a").unwrap();
    // B: commit record exists in the database but the journal never reached "done" -> complete-forward
    journal::write(&root, "op-b", "restore", "replace", "snapshotted", json!({})).unwrap();
    live.conn().execute("INSERT INTO operation_journal(op_id,kind,mode) VALUES('op-b','restore','replace')", []).unwrap();
    // C: already done -> untouched
    journal::write(&root, "op-c", "restore", "replace", "done", json!({})).unwrap();
    // D: a torn journal write must be ignored
    std::fs::write(root.journal_dir().join("op-d.json.1.deadbeef.tmp"), b"{").unwrap();

    let rec = recover(&live).unwrap();
    let get = |id: &str| rec.iter().find(|r| r.op_id == id).map(|r| r.resolution.clone());
    assert_eq!(get("op-a"), Some(Resolution::Discarded));
    assert_eq!(get("op-b"), Some(Resolution::Committed));
    assert_eq!(get("op-c"), None);
    assert!(!root.staging_dir().join("op-a").exists());
    assert!(recover(&live).unwrap().is_empty(), "recovery is idempotent");
}

#[test]
fn snapshot_retention_is_bounded() {
    let t = temp_root();
    let c = cat();
    let live = open_live(&t, &c);
    let dir = live.root().snapshots_dir();
    for i in 0..6 {
        let p: PathBuf = dir.join(format!("pre-op-{i}.db"));
        std::fs::write(&p, b"x").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    assert_eq!(prune_snapshots(live.root(), 2).unwrap(), 4);
    assert_eq!(std::fs::read_dir(dir).unwrap().count(), 2);
}
