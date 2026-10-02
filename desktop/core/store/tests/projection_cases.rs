//! Shared projection cases: the Rust extractor and the JS `projectionFor` helper must produce identical
//! projections from the same declarative spec. `QS_UPDATE_FIXTURES=1 cargo test -p qs-store --test
//! projection_cases` rewrites the fixture; the Node suite (`desktop/ui/tests`) verifies the JS side.

use qs_store::project;
use qs_testkit::*;
use serde_json::{json, Value};

fn cases() -> (Value, Vec<Value>, Vec<Value>) {
    let c = evidence_catalog();
    let specs: Vec<Value> = c.collections().iter().map(|x| x.to_json()).collect();
    let ok = |collection: &str, id: &str, payload: Value| {
        let coll = c.collection(collection).unwrap();
        let p = project::extract(coll, id, &payload).unwrap();
        json!({"collection": collection, "id": id, "payload": payload, "expected": project::to_json(coll, &p)})
    };
    let valid = vec![
        ok("learner_response", "resp-1", response_payload(1, 4, &["m1".into(), "m2".into(), "m1".into()])),
        ok("learner_response", "resp-2", json!({"id": "resp-2", "paperId": "p", "itemCount": 0, "items": []})),
        ok(
            "learner_response",
            "resp-3",
            json!({"id": "resp-3", "paperId": "p", "title": null, "itemCount": 2, "items": ["a", "b"], "mediaRefs": ["x", "x"]}),
        ),
        ok("teacher_review", "rev-1", review_payload("rev-1", "resp-1")),
        ok("remediation_doc", "rem-1", json!({"id": "rem-1", "sourceResponseId": "resp-1"})),
        ok("remediation_doc", "rem-2", json!({"id": "rem-2", "sourceResponseId": "resp-1", "sourceReviewId": "rev-1"})),
        ok("history_entry", "hist-1", json!({"id": "hist-1"})),
        ok("history_entry", "hist-2", history_payload("hist-2", "resp-9")),
        ok("uow_marker", "m-7", marker_payload(7, 4)),
        ok("media_object", "img-1", media_object_payload("img-1", &"ab".repeat(32), 12)),
        ok("setting", "theme", json!({"key": "theme", "value": "paper"})),
    ];
    let invalid = vec![
        json!({"collection": "learner_response", "id": "resp-1", "payload": {"id": "resp-1", "itemCount": 1, "items": ["a"]}}), // paperId missing
        json!({"collection": "learner_response", "id": "resp-1", "payload": {"id": "resp-OTHER", "paperId": "p", "itemCount": 1}}), // identity mismatch
        json!({"collection": "learner_response", "id": "resp-1", "payload": {"id": "resp-1", "paperId": "p", "itemCount": "1"}}), // wrong type
        json!({"collection": "learner_response", "id": "resp-1", "payload": {"id": "resp-1", "paperId": "p", "itemCount": 1.5}}), // not an integer
        json!({"collection": "learner_response", "id": "resp-1", "payload": {"id": "resp-1", "paperId": "p", "itemCount": 1, "items": "nope"}}), // not an array
        json!({"collection": "learner_response", "id": "resp-1", "payload": {"id": "resp-1", "paperId": "p", "itemCount": 1, "items": [1]}}), // element not text
        json!({"collection": "teacher_review", "id": "rev-1", "payload": [1]}), // not an object
    ];
    (json!(specs), valid, invalid)
}

fn fixture_path() -> String {
    format!("{}/tests/fixtures/projection-cases.json", env!("CARGO_MANIFEST_DIR"))
}

#[test]
fn projection_fixture_is_current_and_invalid_payloads_are_rejected() {
    let (specs, valid, invalid) = cases();
    let doc = json!({"specs": specs, "valid": valid, "invalid": invalid});
    if std::env::var("QS_UPDATE_FIXTURES").is_ok() {
        std::fs::create_dir_all(std::path::Path::new(&fixture_path()).parent().unwrap()).unwrap();
        std::fs::write(fixture_path(), serde_json::to_string_pretty(&doc).unwrap()).unwrap();
    }
    let on_disk: Value =
        serde_json::from_str(&std::fs::read_to_string(fixture_path()).expect("fixture missing - run with QS_UPDATE_FIXTURES=1")).unwrap();
    assert_eq!(
        qs_store::canon::canonical(&on_disk),
        qs_store::canon::canonical(&doc),
        "fixture is stale; regenerate with QS_UPDATE_FIXTURES=1"
    );
    let c = evidence_catalog();
    for bad in on_disk["invalid"].as_array().unwrap() {
        let coll = c.collection(bad["collection"].as_str().unwrap()).unwrap();
        assert!(project::extract(coll, bad["id"].as_str().unwrap(), &bad["payload"]).is_err(), "should be invalid: {bad}");
    }
}
