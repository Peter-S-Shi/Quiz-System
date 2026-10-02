//! JS <-> Rust <-> DB lossless-fidelity contract (ADR 0001 H2 method, A4).
//!
//! Vectors are produced by the JS implementation (`desktop/scripts/gen-canonical-vectors.mjs`). For every
//! vector the Rust canonical text and SHA-256 must equal JS's, and the value must survive a round trip
//! through the database with the same canonical hash (unknown fields, nesting, array order, unicode).
//!
//! The checked-in fixture is small; CI regenerates a 5,000-vector set and points `QS_VECTORS` at it.

use qs_store::canon;
use qs_store::{OpenOptions, Store};
use qs_testkit::*;
use serde_json::{json, Value};

fn load() -> Vec<Value> {
    let path =
        std::env::var("QS_VECTORS").unwrap_or_else(|_| format!("{}/tests/fixtures/canonical-vectors.json", env!("CARGO_MANIFEST_DIR")));
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap();
    doc["vectors"].as_array().expect("vectors").clone()
}

#[test]
fn rust_canonical_text_and_hash_equal_the_js_implementation() {
    let vs = load();
    assert!(vs.len() >= 100, "fixture too small to mean anything");
    for (i, v) in vs.iter().enumerate() {
        assert_eq!(canon::canonical(&v["value"]), v["canonical"].as_str().unwrap(), "vector {i}");
        assert_eq!(canon::hash_hex(&v["value"]), v["sha256"].as_str().unwrap(), "vector {i}");
    }
}

#[test]
fn every_vector_round_trips_through_the_database_with_an_identical_hash() {
    let vs = load();
    let t = temp_root();
    let c = arc(evidence_catalog());
    let mut s = Store::open(&t.root, c, &OpenOptions::default()).unwrap();
    for (chunk_no, chunk) in vs.chunks(200).enumerate() {
        let ops: Vec<Value> = chunk
            .iter()
            .enumerate()
            .map(|(j, v)| {
                let id = format!("vec-{}", chunk_no * 200 + j);
                json!({"op": "put", "collection": "setting", "id": id, "payload": v["value"]})
            })
            .collect();
        s.commit(&uow(ops)).unwrap();
    }
    for (i, v) in vs.iter().enumerate() {
        let r = s.read("setting", &json!({"id": format!("vec-{i}")})).unwrap();
        assert_eq!(canon::hash_hex(&r[0].payload), v["sha256"].as_str().unwrap(), "vector {i} changed in the database");
    }
    eprintln!("fidelity: {} vectors, 0 mismatches (JS == Rust == DB)", vs.len());
}
