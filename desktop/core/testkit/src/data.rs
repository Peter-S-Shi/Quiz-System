//! Deterministic synthetic data (no real user data, ever) and Unit-of-Work builders.

use qs_platform::DataRoot;
use qs_store::{project, Catalog};
use serde_json::{json, Value};
use std::sync::Arc;

pub struct TestRoot {
    pub dir: tempfile::TempDir,
    pub root: DataRoot,
}

pub fn temp_root() -> TestRoot {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = DataRoot::at(dir.path().join("qs-data"));
    TestRoot { dir, root }
}

pub fn arc(c: Catalog) -> Arc<Catalog> {
    Arc::new(c)
}

/// The projection JSON a correct caller would send for `payload`.
pub fn proj_json(catalog: &Catalog, collection: &str, id: &str, payload: &Value) -> Value {
    let coll = catalog.collection(collection).expect("collection");
    let p = project::extract(coll, id, payload).expect("extract");
    project::to_json(coll, &p)
}

pub fn put_op(catalog: &Catalog, collection: &str, id: &str, payload: Value) -> Value {
    let proj = proj_json(catalog, collection, id, &payload);
    json!({"op": "put", "collection": collection, "id": id, "payload": payload, "proj": proj})
}

pub fn delete_op(collection: &str, id: &str) -> Value {
    json!({"op": "delete", "collection": collection, "id": id})
}

pub fn uow(ops: Vec<Value>) -> Value {
    json!({"ops": ops})
}

/// An evidence-shaped learner response with unknown fields, extensions, nesting and mixed content.
pub fn response_payload(seed: u64, items: usize, media: &[String]) -> Value {
    let mut rng = fastrand::Rng::with_seed(seed);
    let item_ids: Vec<String> = (0..items).map(|i| format!("q-{seed}-{i}")).collect();
    let answers: Vec<Value> = item_ids
        .iter()
        .map(|q| {
            json!({
                "itemId": q,
                "answer": match rng.u8(0..4) {
                    0 => json!("text \u{4f60}\u{597d} \u{1f469}\u{200d}\u{1f4bb} e\u{301}"),
                    1 => json!([rng.i32(-5..5), rng.i32(0..9), "x"]),
                    2 => json!({"matched": [["a", "1"], ["b", "2"]], "elapsedMs": rng.u32(0..90_000)}),
                    _ => json!(null),
                },
                "score": rng.f64(),
                "flags": {"flagged": rng.bool(), "viewedHint": rng.bool()},
            })
        })
        .collect();
    json!({
        "id": format!("resp-{seed}"),
        "paperId": format!("paper-{}", seed % 7),
        "title": format!("Synthetic Response {seed}"),
        "finalizedAt": format!("2026-01-{:02}T{:02}:{:02}:00.000Z", 1 + seed % 28, seed % 24, seed % 60),
        "itemCount": items,
        "items": item_ids,
        "mediaRefs": media,
        "responses": answers,
        "bigCounter": "9007199254740993",
        "extensions": {"vendor.example": {"nested": {"deep": [1, [2, [3, {"k": "v"}]]]}}, "unknownFutureField": true},
        "schemaVersion": 1,
    })
}

pub fn review_payload(id: &str, response_id: &str) -> Value {
    json!({"id": id, "responseId": response_id, "marks": [{"item": 1, "ok": true}], "extensions": {"x": 1}})
}

pub fn history_payload(id: &str, response_id: &str) -> Value {
    json!({"id": id, "responseId": response_id, "summary": {"correct": 3, "total": 5}})
}

pub fn marker_payload(n: i64, rows: usize) -> Value {
    json!({"id": format!("m-{n}"), "n": n, "rows": rows, "filler": "x".repeat(64)})
}

pub fn media_object_payload(id: &str, content_hash: &str, size: u64) -> Value {
    json!({"id": id, "contentHash": content_hash, "size": size, "mimeType": "application/octet-stream", "name": format!("{id}.bin")})
}

/// A finalize-style Unit of Work: one response (20 items) + review + history + marker = 4 rows across 4 collections.
pub fn finalize_uow(catalog: &Catalog, n: u64, media: &[String]) -> Value {
    let rid = format!("resp-{n}");
    uow(vec![
        put_op(catalog, "learner_response", &rid, response_payload(n, 20, media)),
        put_op(catalog, "teacher_review", &format!("rev-{n}"), review_payload(&format!("rev-{n}"), &rid)),
        put_op(catalog, "history_entry", &format!("hist-{n}"), history_payload(&format!("hist-{n}"), &rid)),
        put_op(catalog, "uow_marker", &format!("m-{n}"), marker_payload(n as i64, 4)),
    ])
}
