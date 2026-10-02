//! ADR 0001 H3 method as a permanent suite: kill the process at every defined checkpoint of the
//! activation primitive, in both modes, and prove the live database is wholly pre- or wholly
//! post-activation, that the journal resolves deterministically at next launch, and that rollback
//! restores the exact pre-state.
//!
//! Repeats per (checkpoint, mode): `QS_H3_REPEATS` (default 1 locally; CI 3 - the ADR threshold).

use qs_activation::{self as activation, MergePolicy, Mode, Options, Resolution};
use qs_platform::fault::CHECKPOINTS;
use qs_platform::DataRoot;
use qs_scenarios::*;
use qs_store::{Catalog, OpenOptions, Store};
use qs_testkit::*;
use std::path::PathBuf;
use std::sync::Arc;

fn cat() -> Arc<Catalog> {
    arc(evidence_catalog())
}
fn open(root: &DataRoot) -> Store {
    Store::open(root, cat(), &OpenOptions::default()).unwrap()
}

struct Setup {
    t: TestRoot,
    staging_db: PathBuf,
    pre: String,
    post: String,
    mode: Mode,
    mode_name: &'static str,
    op: String,
}

fn setup(mode_name: &'static str, tag: &str) -> Setup {
    let t = temp_root();
    let mode = if mode_name == "replace" { Mode::Replace } else { Mode::Merge(MergePolicy::StagingWins) };
    let op = format!("op-h3-{tag}");
    let c = cat();
    // live data
    let pre = {
        let mut s = open(&t.root);
        for n in 1..=40 {
            s.commit(&finalize_uow(&c, n, &[])).unwrap();
        }
        s.state_hash(true).unwrap()
    };
    // staging set (separate store, snapshotted): overlaps ids 30..40 and adds 41..80
    let other = temp_root();
    let st = activation::create_staging(&t.root, &op).unwrap();
    {
        let mut src = Store::open(&other.root, c.clone(), &OpenOptions { lock: false, ..OpenOptions::default() }).unwrap();
        for n in 30..=80 {
            src.commit(&finalize_uow(&c, n, &[])).unwrap();
        }
        src.snapshot_to(&st.db).unwrap();
    }
    activation::normalize_staging(&st.db).unwrap();
    // expected post state, computed on an identical copy of the live root (no fault)
    let copy = temp_root();
    copy_dir(t.root.path(), copy.root.path());
    let post = {
        let mut s = open(&copy.root);
        activation::activate(&mut s, &copy.root.staging_dir().join(&op).join("staging.db"), mode, &op, &Options::default()).unwrap();
        s.state_hash(true).unwrap()
    };
    assert_ne!(pre, post);
    Setup { t, staging_db: st.db, pre, post, mode, mode_name, op }
}

#[test]
fn kill_at_every_activation_checkpoint_leaves_exactly_pre_or_exactly_post() {
    assert!(qs_platform::fault::ENABLED, "fault injection must be compiled into the scenario binary");
    let repeats = env_usize("QS_H3_REPEATS", 1);
    let points = ["before-snapshot", "after-snapshot", "mid-copy", "before-commit", "after-commit", "after-journal-done"];
    assert!(points.iter().all(|p| CHECKPOINTS.contains(p)));
    let (mut pre_n, mut post_n) = (0, 0);
    for mode_name in ["replace", "merge"] {
        for cp in points {
            for rep in 0..repeats {
                let s = setup(mode_name, &format!("{mode_name}-{cp}-{rep}").replace('_', "-"));
                let out = run(&["activate", &root_str(&s.t.root), &s.staging_db.display().to_string(), s.mode_name, &s.op], Some(cp));
                assert_eq!(out.status.code(), Some(99), "{mode_name}/{cp}: the process must have been killed at the checkpoint: {}", String::from_utf8_lossy(&out.stderr));

                let store = open(&s.t.root);
                assert!(store.quick_check().unwrap(), "{mode_name}/{cp}: quick_check");
                let h = store.state_hash(true).unwrap();
                let committed_expected = matches!(cp, "after-commit" | "after-journal-done");
                if committed_expected {
                    assert_eq!(h, s.post, "{mode_name}/{cp}: after the commit point the state must be fully post");
                    post_n += 1;
                } else {
                    assert_eq!(h, s.pre, "{mode_name}/{cp}: before the commit point the state must be exactly pre");
                    pre_n += 1;
                }
                assert!(store.check_consistency().unwrap().is_empty(), "{mode_name}/{cp}: consistency");

                // deterministic resolution at next launch
                let rec = activation::recover(&store).unwrap();
                let mine: Vec<_> = rec.iter().filter(|r| r.op_id == s.op).collect();
                if cp == "after-journal-done" {
                    assert!(mine.is_empty(), "journal already done");
                } else {
                    assert_eq!(mine.len(), 1, "{mode_name}/{cp}: exactly one unfinished op: {rec:?}");
                    let want = if committed_expected { Resolution::Committed } else { Resolution::Discarded };
                    assert_eq!(mine[0].resolution, want, "{mode_name}/{cp}");
                }
                assert!(activation::recover(&store).unwrap().is_empty(), "recovery is idempotent");
                assert!(!s.t.root.staging_dir().join(&s.op).exists() || committed_expected, "discarded staging is removed");

                // after the commit point rollback must restore the exact pre-state
                if committed_expected {
                    drop(store);
                    let mut store = open(&s.t.root);
                    activation::rollback(&mut store, &s.op).unwrap();
                    assert_eq!(store.state_hash(true).unwrap(), s.pre, "{mode_name}/{cp}: rollback must restore exactly pre");
                }
                let _ = s.mode;
            }
        }
    }
    eprintln!("H3: {} kills at {} checkpoints x 2 modes x {repeats}: {pre_n} pre, {post_n} post, 0 intermediate", points.len() * 2 * repeats, points.len());
}

#[test]
fn kill_during_rollback_leaves_pre_or_post_and_a_retry_succeeds() {
    for rep in 0..env_usize("QS_H3_REPEATS", 1) {
        let s = setup("replace", &format!("rb-{rep}"));
        {
            let mut store = open(&s.t.root);
            activation::activate(&mut store, &s.staging_db, s.mode, &s.op, &Options::default()).unwrap();
            assert_eq!(store.state_hash(true).unwrap(), s.post);
        }
        let out = run(&["rollback", &root_str(&s.t.root), &s.op], Some("during-rollback"));
        assert_eq!(out.status.code(), Some(99), "{}", String::from_utf8_lossy(&out.stderr));
        let mut store = open(&s.t.root);
        let h = store.state_hash(true).unwrap();
        assert!(h == s.pre || h == s.post, "rollback killed mid-way must not expose an intermediate state");
        activation::recover(&store).unwrap();
        activation::rollback(&mut store, &s.op).unwrap();
        assert_eq!(store.state_hash(true).unwrap(), s.pre);
        assert!(store.check_consistency().unwrap().is_empty());
    }
}
