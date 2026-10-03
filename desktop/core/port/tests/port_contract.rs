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
    assert_eq!(r["steps"].as_array().unwrap().len(), 9);
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
fn media_is_readable_in_bounded_chunks_by_id_and_every_byte_round_trips() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let core = open(&t.root, &c);
    let payload: Vec<u8> = (0..300_000u32).map(|i| (i.wrapping_mul(31) % 251) as u8).collect();
    let f = t.dir.path().join("clip.bin");
    std::fs::write(&f, &payload).unwrap();
    let ing = core.dispatch("media.ingest_file", &json!({"path": f.display().to_string()}));
    let (hash, size) = (ok(&ing)["hash"].as_str().unwrap().to_string(), ok(&ing)["size"].as_u64().unwrap());
    ok(&core.dispatch("store.commit", &json!({"uow": uow(vec![put_op(&c, "media_object", "m-1", media_object_payload("m-1", &hash, size))])})));
    let mut got: Vec<u8> = Vec::new();
    let mut offset = 0u64;
    loop {
        let r = core.dispatch("media.read", &json!({"id": "m-1", "offset": offset, "length": 100_000}));
        let r = ok(&r);
        let chunk = b64_decode(r["data"].as_str().unwrap());
        assert_eq!(chunk.len() as u64, r["length"].as_u64().unwrap());
        assert!(chunk.len() <= 100_000, "never more than requested");
        assert_eq!(r["size"], 300_000);
        got.extend_from_slice(&chunk);
        offset += chunk.len() as u64;
        if r["eof"] == true {
            break;
        }
    }
    assert_eq!(got, payload, "byte-for-byte");
    // bounds: past the end is an empty eof chunk; an oversized request is capped, not refused; bad ids are refused
    let end = core.dispatch("media.read", &json!({"id": "m-1", "offset": 300_000, "length": 10}));
    assert_eq!(ok(&end)["length"], 0);
    assert_eq!(ok(&end)["eof"], true);
    let capped = core.dispatch("media.read", &json!({"id": "m-1", "offset": 0, "length": 100_000_000}));
    assert!(ok(&capped)["length"].as_u64().unwrap() <= 1_048_576, "a request is capped at 1 MiB");
    assert_eq!(core.dispatch("media.read", &json!({"id": "nope", "offset": 0, "length": 10}))["error"]["code"], "NOT_FOUND");
    assert_eq!(core.dispatch("media.read", &json!({"id": "m-1", "offset": "x", "length": 10}))["error"]["code"], "REJECT_SHAPE");
}

#[test]
fn media_put_stores_bytes_registers_the_object_dedupes_and_refuses_bad_input() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let core = open(&t.root, &c);
    let bytes: Vec<u8> = (0..5000u32).map(|i| (i % 253) as u8).collect();
    let b64 = b64_encode(&bytes);
    let put = core.dispatch("media.put", &json!({"name": "figure.png", "mimeType": "image/png", "data": b64}));
    let r = ok(&put).clone();
    let id = r["id"].as_str().unwrap().to_string();
    assert_eq!(r["size"], 5000);
    assert_eq!(r["deduplicated"], false);
    assert!(qs_port::webview::find_absolute_path(&put).is_none());
    // the object is registered and readable back byte-for-byte
    let back = core.dispatch("media.read", &json!({"id": id, "offset": 0, "length": 100_000}));
    assert_eq!(b64_decode(ok(&back)["data"].as_str().unwrap()), bytes);
    assert_eq!(ok(&core.dispatch("media.locate", &json!({"id": id})))["mimeType"], "image/png");
    // the same bytes again are deduplicated onto the same object
    let again = core.dispatch("media.put", &json!({"name": "copy.png", "mimeType": "image/png", "data": b64}));
    assert_eq!(ok(&again)["id"], r["id"]);
    assert_eq!(ok(&again)["deduplicated"], true);
    // refused: unknown mime, invalid base64, empty data, missing fields
    for bad in [
        json!({"name": "x.exe", "mimeType": "application/x-msdownload", "data": b64}),
        json!({"name": "x.png", "mimeType": "image/png", "data": "***not base64***"}),
        json!({"name": "x.png", "mimeType": "image/png", "data": ""}),
        json!({"name": "x.png", "mimeType": "image/png"}),
    ] {
        assert_eq!(core.dispatch("media.put", &bad)["ok"], false, "{bad}");
    }
}

fn b64_encode(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for c in bytes.chunks(3) {
        let n = (u32::from(c[0]) << 16) | (u32::from(*c.get(1).unwrap_or(&0)) << 8) | u32::from(*c.get(2).unwrap_or(&0));
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

fn b64_decode(s: &str) -> Vec<u8> {
    const T: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let (mut acc, mut bits) = (0u32, 0u32);
    for ch in s.bytes().filter(|b| *b != b'=') {
        acc = (acc << 6) | T.bytes().position(|x| x == ch).unwrap() as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    out
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

// ---- write gate (ADR 0002 section 15.2) ----

#[test]
fn the_write_gate_refuses_writes_and_gc_with_store_busy_and_is_released_on_drop_even_when_unwinding() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let core = Core::open(&t.root, c.clone(), &OpenOptions::default()).unwrap();
    let uw = finalize_uow(&c, 1, &[]);
    {
        let _gate = core.write_gate().unwrap();
        let busy = core.dispatch("store.commit", &json!({"uow": uw.clone()}));
        assert_eq!(busy["ok"], false);
        assert_eq!(busy["error"]["code"], "STORE_BUSY");
        assert_eq!(core.maintenance_gc().unwrap_err().code.as_str(), "STORE_BUSY");
        assert_eq!(core.write_gate().err().unwrap().code.as_str(), "STORE_BUSY", "gates do not nest");
        // reads are never gated, and the holder's own work goes through with_store
        assert_eq!(core.dispatch("store.count", &json!({"collection": "learner_response"}))["ok"], true);
        core.with_store(|s| s.commit(&uw).unwrap());
    }
    assert_eq!(core.dispatch("store.commit", &json!({"uow": finalize_uow(&c, 2, &[])}))["ok"], true);

    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _gate = core.write_gate().unwrap();
        panic!("simulated failure inside the gated section");
    }));
    assert!(r.is_err());
    assert_eq!(core.dispatch("store.commit", &json!({"uow": finalize_uow(&c, 3, &[])}))["ok"], true, "gate released by unwinding");
}
