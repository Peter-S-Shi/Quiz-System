//! Independent oracles (ADR 0002 section 16.2-2): V1's own `parseLibraryBackup` (differential) and the JS
//! canonicalizer (cross-language conservation). Both run in Node; CI has Node, and the test fails loudly when
//! it is missing rather than silently passing.

mod common;
use common::*;
use serde_json::{json, Value};
use std::process::Command;

fn oracle(path: &std::path::Path) -> Value {
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../scripts/migration-oracle.mjs");
    let out = Command::new("node").arg(&script).arg(path).output().expect("node must be installed to run the migration oracles");
    assert!(out.status.success(), "oracle failed: {}", String::from_utf8_lossy(&out.stderr));
    serde_json::from_slice(&out.stdout).unwrap()
}

#[test]
fn the_js_canonicalizer_agrees_with_the_recorded_origin_hash_of_every_migrated_entity() {
    for f in ["r-min.json", "r-full.json", "r-hist100.json"] {
        let e = env();
        let src = e.source(f, &fixture_bytes(f));
        let o = oracle(&src);
        let p = e.prepare(&src);
        assert!(!p.blocked, "{f}: {:?}", p.report["diagnostics"]);
        e.activate(&p);
        let mut checked = 0;
        for (pointer, js_hash) in o["hashes"].as_object().unwrap() {
            let js_hash = js_hash.as_str().unwrap();
            let h: Option<String> = e.host.with_store(|s| {
                s.conn()
                    .query_row(
                        "SELECT json_extract(payload,'$.canonHash') FROM migration_origin WHERE json_extract(payload,'$.sourcePointer')=?1",
                        [pointer],
                        |r| r.get(0),
                    )
                    .ok()
            });
            // history entries are stored inside a V2 envelope; their JS hash is of the bare entry, compared via the entry itself
            if pointer.starts_with("/history/") {
                let id: Option<String> = e.host.with_store(|s| {
                    s.conn()
                        .query_row(
                            "SELECT record_id FROM migration_origin WHERE json_extract(payload,'$.sourcePointer')=?1",
                            [pointer],
                            |r| r.get(0),
                        )
                        .ok()
                });
                let payload: String = e.host.with_store(|s| {
                    s.conn().query_row("SELECT payload FROM legacy_history_entry WHERE id=?1", [id.unwrap()], |r| r.get(0)).unwrap()
                });
                let entry = serde_json::from_str::<Value>(&payload).unwrap()["entry"].clone();
                assert_eq!(qs_store::canon::hash_hex(&entry), js_hash, "{f} {pointer}");
            } else if pointer.starts_with("/mediaAssets/") {
                let id: String = e.host.with_store(|s| {
                    s.conn()
                        .query_row(
                            "SELECT record_id FROM migration_origin WHERE json_extract(payload,'$.sourcePointer')=?1",
                            [pointer],
                            |r| r.get(0),
                        )
                        .unwrap()
                });
                let payload: String =
                    e.host.with_store(|s| s.conn().query_row("SELECT payload FROM media_object WHERE id=?1", [id], |r| r.get(0)).unwrap());
                let mut meta: Value = serde_json::from_str(&payload).unwrap();
                meta.as_object_mut().unwrap().remove("contentHash");
                assert_eq!(qs_store::canon::hash_hex(&meta), js_hash, "{f} {pointer}");
            } else {
                assert_eq!(h.as_deref(), Some(js_hash), "{f}: JS and Rust disagree on {pointer}");
            }
            checked += 1;
        }
        assert!(checked >= 1, "{f}");
        if f == "r-full.json" {
            assert!(checked >= 19, "every entity of the full fixture is compared ({checked})");
        }
    }
}

/// Cases V1 accepts: the migrator must accept them too, except where ADR 0002 is explicitly stricter.
#[test]
fn whatever_v1_accepts_the_migrator_accepts_except_where_the_adr_is_stricter() {
    let mut stricter_seen = 0;
    let mk = |name: &str, f: &dyn Fn(&mut Value)| -> (String, Vec<u8>) {
        let mut v = fixture("r-full.json");
        f(&mut v);
        (name.to_string(), serde_json::to_vec(&v).unwrap())
    };
    // (case, is the migrator allowed to be stricter than V1 for it?)
    let accepted_by_both: Vec<(String, Vec<u8>)> = vec![
        mk("as exported", &|_| {}),
        mk("history absent", &|v| {
            v.as_object_mut().unwrap().remove("history");
        }),
        mk("no documentType", &|v| {
            v.as_object_mut().unwrap().remove("documentType");
        }),
        mk("envelope version 99", &|v| v["schemaVersion"] = json!(99)),
        mk("unknown top-level field", &|v| v["zz"] = json!(1)),
        mk("assets alias", &|v| {
            let m = v["mediaAssets"].take();
            v.as_object_mut().unwrap().remove("mediaAssets");
            v["assets"] = m;
        }),
        mk("pre-versioned library", &|v| {
            v["library"].as_object_mut().unwrap().remove("schemaVersion");
        }),
        mk("an unreferenced media asset", &|v| {
            v["mediaAssets"]
                .as_array_mut()
                .unwrap()
                .push(json!({"id": "orphan", "mimeType": "image/png", "name": "o.png", "size": 3, "data": "AQID"}))
        }),
        mk("cross-paper duplicate question ids (legal)", &|_| {}),
        mk("missing paper timestamps", &|v| {
            v["library"]["papers"][1].as_object_mut().unwrap().remove("createdAt");
        }),
    ];
    for (name, bytes) in accepted_by_both {
        let e = env();
        let src = e.source("x.json", &bytes);
        let o = oracle(&src);
        assert_eq!(o["v1"]["accepted"], true, "{name}: V1 should accept this ({})", o["v1"]["error"]);
        let p = e.prepare(&src);
        assert!(!p.blocked, "{name}: V1 accepts but the migrator blocked: {:?}", blocking_codes(&p));
    }

    // Cases where the migrator is deliberately stricter than V1 (ADR 0002 sections 6, 9.3): V1 accepts, we block.
    let stricter: Vec<(&str, Vec<u8>, &str)> = vec![
        (
            "duplicate paper id",
            {
                let mut v = fixture("r-full.json");
                v["library"]["papers"][1]["id"] = json!("paper-a");
                serde_json::to_vec(&v).unwrap()
            },
            "MIG_IDENTITY_AMBIGUOUS",
        ),
        (
            "duplicate question id inside a paper",
            {
                let mut v = fixture("r-full.json");
                v["library"]["papers"][0]["questions"][1]["id"] = json!("q-single");
                serde_json::to_vec(&v).unwrap()
            },
            "MIG_IDENTITY_AMBIGUOUS",
        ),
        (
            "duplicate key (last-wins in V1)",
            String::from_utf8(fixture_bytes("r-min.json"))
                .unwrap()
                .replacen("\"title\": \"Minimal\",", "\"title\": \"Minimal\", \"title\": \"Other\",", 1)
                .into_bytes(),
            "MIG_SOURCE_DUPLICATE_KEY",
        ),
    ];
    for (name, bytes, code) in stricter {
        let e = env();
        let src = e.source("x.json", &bytes);
        let o = oracle(&src);
        assert_eq!(o["v1"]["accepted"], true, "{name}: V1 accepts ({})", o["v1"]["error"]);
        let p = e.prepare(&src);
        assert!(blocking_codes(&p).contains(&code.to_string()), "{name}: {:?}", blocking_codes(&p));
        stricter_seen += 1;
    }
    assert_eq!(stricter_seen, 3);
}

/// Cases V1 rejects: the migrator must not accept them silently.
#[test]
fn whatever_v1_rejects_the_migrator_does_not_accept() {
    let rejected: Vec<(&str, Value)> = vec![
        ("review of a missing response", {
            let mut v = fixture("r-full.json");
            v["teacherReviews"][0]["responseId"] = json!("nope");
            v
        }),
        ("missing referenced media", {
            let mut v = fixture("r-full.json");
            v["mediaAssets"].as_array_mut().unwrap().retain(|a| a["id"] != "img-1");
            v
        }),
        ("remediation provenance that does not resolve", {
            let mut v = fixture("r-full.json");
            v["translationLibrary"]["documents"][1]["provenance"]["sourceReviewId"] = json!("nope");
            v
        }),
        ("document in a missing folder", {
            let mut v = fixture("r-full.json");
            v["translationLibrary"]["documents"][0]["folderId"] = json!("nope");
            v
        }),
        ("no papers", {
            let mut v = fixture("r-full.json");
            v["library"]["papers"] = json!([]);
            v
        }),
    ];
    for (name, v) in rejected {
        let e = env();
        let src = e.source_json("x.json", &v);
        let o = oracle(&src);
        assert_eq!(o["v1"]["accepted"], false, "{name}: V1 should reject");
        assert!(e.prepare(&src).blocked, "{name}: the migrator must block what V1 rejects");
    }
}
