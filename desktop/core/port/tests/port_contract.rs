use qs_platform::DataRoot;
use qs_port::{offline, selftest, Core};
use qs_store::{Catalog, OpenOptions};
use qs_testkit::*;
use serde_json::{json, Value};
use std::sync::Arc;

fn open(root: &DataRoot, c: &Arc<Catalog>) -> Core {
    Core::open(root, c.clone(), &OpenOptions::default()).unwrap()
}
fn ok(v: &Value) -> &Value {
    assert_eq!(v["ok"], true, "{v}");
    &v["result"]
}

#[test]
fn self_test_passes_end_to_end_on_an_isolated_root() {
    let d = tempfile::tempdir().unwrap();
    let r = selftest::run(d.path()).unwrap();
    assert_eq!(r["ok"], true, "{}", serde_json::to_string_pretty(&r).unwrap());
    assert_eq!(r["steps"].as_array().unwrap().len(), 7);
}

#[test]
fn commands_use_the_wire_envelope_and_stable_error_codes() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let core = open(&t.root, &c);
    let info = core.dispatch("schema.info", &json!({}));
    assert_eq!(ok(&info)["identifier"], "io.github.peter-s-shi.quiz-studio");
    assert_eq!(ok(&info)["startup"]["healthy"], true);

    let put = put_op(&c, "learner_response", "resp-1", response_payload(1, 4, &[]));
    ok(&core.dispatch("store.commit", &json!({"uow": uow(vec![put])})));
    let read = core.dispatch("store.read", &json!({"collection": "learner_response", "query": {"id": "resp-1"}}));
    assert_eq!(ok(&read)["records"][0]["payload"]["id"], "resp-1");
    assert_eq!(ok(&core.dispatch("store.count", &json!({"collection": "learner_response"})))["count"], 1);

    let bad = core.dispatch("store.commit", &json!({"uow": {"ops": []}}));
    assert_eq!(bad["ok"], false);
    assert_eq!(bad["error"]["code"], "REJECT_SHAPE");
    assert_eq!(core.dispatch("nope.nothing", &json!({}))["error"]["code"], "REJECT_SHAPE");
    assert_eq!(core.dispatch("store.read", &json!({}))["error"]["code"], "REJECT_SHAPE");
}

#[test]
fn media_is_ingested_by_streaming_registered_in_one_unit_of_work_and_locatable() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let core = open(&t.root, &c);
    let f = t.dir.path().join("pic.bin");
    std::fs::write(&f, vec![9u8; 200_000]).unwrap();
    let ing = core.dispatch("media.ingest_file", &json!({"path": f.display().to_string()}));
    let (hash, size) = (ok(&ing)["hash"].as_str().unwrap().to_string(), ok(&ing)["size"].as_u64().unwrap());
    // media + the response that references it become visible together, in one Unit of Work
    let uw = uow(vec![
        put_op(&c, "media_object", "img-1", media_object_payload("img-1", &hash, size)),
        put_op(&c, "learner_response", "resp-1", response_payload(1, 2, &["img-1".to_string()])),
    ]);
    ok(&core.dispatch("store.commit", &json!({"uow": uw})));
    let loc = core.dispatch("media.locate", &json!({"id": "img-1"}));
    assert_eq!(ok(&loc)["size"], 200_000);
    assert!(loc["result"].get("relativePath").is_none() && loc["result"].get("path").is_none(), "no path-shaped field");
    assert_eq!(core.dispatch("media.locate", &json!({"id": "nope"}))["error"]["code"], "NOT_FOUND");
    // nothing is orphaned, and GC is a Rust-owned maintenance call with a fixed safety delay
    assert_eq!(core.maintenance_gc().unwrap().removed_orphans, 0);
}

#[test]
fn an_unhealthy_store_refuses_writes_but_stays_readable_and_is_never_auto_repaired() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    {
        let core = open(&t.root, &c);
        ok(&core.dispatch("store.commit", &json!({"uow": finalize_uow(&c, 1, &[])})));
        core.with_store(|s| s.conn().execute_batch("UPDATE learner_response SET paper_id='tampered'").unwrap());
    }
    let core = open(&t.root, &c);
    assert!(!core.startup().healthy());
    let w = core.dispatch("store.commit", &json!({"uow": finalize_uow(&c, 2, &[])}));
    assert_eq!(w["error"]["code"], "INTEGRITY_FAILED");
    assert_eq!(ok(&core.dispatch("store.count", &json!({"collection": "learner_response"})))["count"], 1);
    let paper: String = core.with_store(|s| s.conn().query_row("SELECT paper_id FROM learner_response", [], |r| r.get(0)).unwrap());
    assert_eq!(paper, "tampered", "the mismatch is reported, not silently repaired");
}

#[test]
fn backup_and_restore_work_through_the_port_and_snapshots_are_listed() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let core = open(&t.root, &c);
    ok(&core.dispatch("store.commit", &json!({"uow": finalize_uow(&c, 1, &[])})));
    let dest = t.dir.path().join("b.qsarchive");
    ok(&core.dispatch("backup.create", &json!({"dest": dest.display().to_string()})));
    assert_eq!(ok(&core.dispatch("backup.verify", &json!({"path": dest.display().to_string()})))["entries"], 1);

    ok(&core.dispatch("store.commit", &json!({"uow": finalize_uow(&c, 2, &[])})));
    assert_eq!(ok(&core.dispatch("store.count", &json!({"collection": "learner_response"})))["count"], 2);
    ok(&core.dispatch("backup.restore", &json!({"path": dest.display().to_string()})));
    assert_eq!(ok(&core.dispatch("store.count", &json!({"collection": "learner_response"})))["count"], 1);

    // the restore left a pre-activation snapshot that can bring the second response back
    let list = core.dispatch("snapshots.list", &json!({}));
    let name = ok(&list)["snapshots"][0]["name"].as_str().unwrap().to_string();
    ok(&core.dispatch("snapshots.restore", &json!({"name": name})));
    assert_eq!(ok(&core.dispatch("store.count", &json!({"collection": "learner_response"})))["count"], 2);
    assert_eq!(core.dispatch("snapshots.restore", &json!({"name": "../../evil.db"}))["error"]["code"], "REJECT_SHAPE");
}

#[test]
fn a_corrupt_database_file_is_recoverable_from_a_snapshot_without_losing_the_damaged_file() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let snapshot_name;
    {
        let core = open(&t.root, &c);
        ok(&core.dispatch("store.commit", &json!({"uow": finalize_uow(&c, 1, &[])})));
        core.with_store(|s| s.snapshot_to(&t.root.snapshots_dir().join("pre-manual.db")).unwrap());
        snapshot_name = "pre-manual.db";
    }
    // destroy the database file
    std::fs::write(t.root.db_path(), vec![0xABu8; 8192]).unwrap();
    let err = Core::open(&t.root, c.clone(), &OpenOptions::default()).err().expect("corrupt db must not open");
    assert!(matches!(err.code, qs_platform::Code::Db | qs_platform::Code::NotAStore), "{err}");

    let preserved = offline::restore_snapshot_offline(&t.root, snapshot_name).unwrap();
    assert_eq!(std::fs::read(&preserved).unwrap(), vec![0xABu8; 8192], "the damaged file is kept byte-for-byte");
    let core = open(&t.root, &c);
    assert!(core.startup().healthy());
    assert_eq!(ok(&core.dispatch("store.count", &json!({"collection": "learner_response"})))["count"], 1);
}

#[test]
fn startup_resolves_an_interrupted_operation_from_the_journal() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    drop(open(&t.root, &c));
    qs_activation::journal::write(&t.root, "op-crashed", "restore", "replace", "snapshotted", json!({})).unwrap();
    let core = open(&t.root, &c);
    assert_eq!(core.startup().recovered, vec![("op-crashed".to_string(), "discarded".to_string())]);
}
