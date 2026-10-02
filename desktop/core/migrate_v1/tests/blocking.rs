//! Fail-closed (ADR 0002 sections 11, 16.2-9): every blocking diagnostic of the registry has a fixture; each
//! one ends with the live store physically unchanged, no staging residue, and the user's file untouched.

mod common;
use common::*;
use qs_migrate_v1::diag::{Severity, CODES};
use qs_migrate_v1::{prepare, PrepareOptions};
use serde_json::{json, Value};
use std::collections::BTreeSet;

fn edit(name: &str, f: impl FnOnce(&mut Value)) -> Vec<u8> {
    let mut v = fixture(name);
    f(&mut v);
    serde_json::to_vec(&v).unwrap()
}
fn text(name: &str) -> String {
    String::from_utf8(fixture_bytes(name)).unwrap()
}

/// Internal defence-in-depth codes that a *source* cannot reach; each is proven elsewhere:
/// `MIG_LEDGER_INCOMPLETE` by the mutation-kill suite (`conservation.rs`), `MIG_STAGING_INVALID` and
/// `ACTIVATION_POST_VERIFY_FAILED` by the activation tests (they are raised only on a mapper/store defect).
const EXEMPT: &[&str] = &["MIG_LEDGER_INCOMPLETE", "MIG_STAGING_INVALID", "ACTIVATION_POST_VERIFY_FAILED"];

fn cases() -> Vec<(&'static str, &'static str, Vec<u8>)> {
    let ru = |s: &str| s.to_string();
    let tiny = text("r-min.json");
    vec![
        ("invalid utf-8 inside a string", "MIG_SOURCE_NOT_UTF8", {
            let mut b = tiny.clone().into_bytes();
            let at = b.windows(7).position(|w| w == b"Minimal").unwrap();
            b[at] = 0xFF;
            b
        }),
        ("utf-16 file", "MIG_SOURCE_NOT_UTF8", {
            let mut b = vec![0xFF, 0xFE];
            for u in tiny.encode_utf16() {
                b.extend_from_slice(&u.to_le_bytes());
            }
            b
        }),
        ("truncated mid-document", "MIG_SOURCE_NOT_JSON", tiny.as_bytes()[..tiny.len() / 2].to_vec()),
        ("empty file", "MIG_SOURCE_NOT_JSON", vec![]),
        ("trailing garbage", "MIG_SOURCE_NOT_JSON", format!("{tiny} xx").into_bytes()),
        ("not json at all", "MIG_SOURCE_NOT_JSON", b"hello".to_vec()),
        (
            "duplicate key",
            "MIG_SOURCE_DUPLICATE_KEY",
            ru(&tiny.replacen("\"title\": \"Minimal\",", "\"title\": \"Minimal\", \"title\": \"Other\",", 1)).into_bytes(),
        ),
        ("lone surrogate", "MIG_SOURCE_LONE_SURROGATE", ru(&tiny.replacen("Minimal", "Min\\ud800imal", 1)).into_bytes()),
        (
            "unsafe integer",
            "MIG_SOURCE_UNSAFE_NUMBER",
            ru(&tiny.replacen("\"title\"", "\"big\": 9007199254740993, \"title\"", 1)).into_bytes(),
        ),
        (
            "non js-producible decimal",
            "MIG_SOURCE_UNSAFE_NUMBER",
            ru(&tiny.replacen("\"title\"", "\"x\": 0.1000000000000000055511151231257827, \"title\"", 1)).into_bytes(),
        ),
        ("declared as something else", "MIG_SOURCE_DECLARED_CONFLICT", edit("r-min.json", |v| v["documentType"] = json!("x"))),
        ("another artifact", "MIG_SOURCE_WRONG_KIND", edit("r-min.json", |v| v["documentType"] = json!("quiz-studio.teacher-review"))),
        ("array root", "MIG_SOURCE_NOT_A_BACKUP", b"[]".to_vec()),
        ("section of the wrong shape", "MIG_SECTION_SHAPE", edit("r-min.json", |v| v["history"] = json!(1))),
        (
            "unknown record kind",
            "MIG_RECORD_KIND_UNKNOWN",
            edit("r-full.json", |v| v["learnerResponses"][0]["material"]["type"] = json!("exam")),
        ),
        (
            "unidentifiable record",
            "MIG_RECORD_UNIDENTIFIABLE",
            edit("r-full.json", |v| {
                v["teacherReviews"][0].as_object_mut().unwrap().remove("id");
            }),
        ),
        ("duplicate paper id", "MIG_IDENTITY_AMBIGUOUS", edit("r-full.json", |v| v["library"]["papers"][1]["id"] = json!("paper-a"))),
        (
            "duplicate question id inside one paper",
            "MIG_IDENTITY_AMBIGUOUS",
            edit("r-full.json", |v| v["library"]["papers"][0]["questions"][1]["id"] = json!("q-single")),
        ),
        (
            "duplicate learner response id",
            "MIG_IDENTITY_AMBIGUOUS",
            edit("r-full.json", |v| {
                let id = v["learnerResponses"][0]["id"].clone();
                v["learnerResponses"][1]["id"] = id;
            }),
        ),
        (
            "duplicate teacher review id",
            "MIG_IDENTITY_AMBIGUOUS",
            edit("r-full.json", |v| {
                let id = v["teacherReviews"][0]["id"].clone();
                v["teacherReviews"][1]["id"] = id;
            }),
        ),
        (
            "duplicate translation document id",
            "MIG_IDENTITY_AMBIGUOUS",
            edit("r-full.json", |v| v["translationLibrary"]["documents"][1]["id"] = json!("doc-1")),
        ),
        (
            "duplicate translation item id",
            "MIG_IDENTITY_AMBIGUOUS",
            edit("r-full.json", |v| v["translationLibrary"]["documents"][0]["items"][1]["id"] = json!("ti-1")),
        ),
        (
            "history duplicate id with different content",
            "MIG_IDENTITY_AMBIGUOUS",
            edit("r-full.json", |v| {
                let mut e = v["history"][2].clone();
                e["percent"] = json!(1);
                v["history"].as_array_mut().unwrap().push(e);
            }),
        ),
        (
            "review of a response that is not in the backup",
            "MIG_REF_UNRESOLVED",
            edit("r-full.json", |v| v["teacherReviews"][0]["responseId"] = json!("nope")),
        ),
        (
            "review of an item the response lacks",
            "MIG_REF_UNRESOLVED",
            edit("r-full.json", |v| v["teacherReviews"][0]["itemReviews"][0]["itemId"] = json!("zzz")),
        ),
        (
            "document in a folder that does not exist",
            "MIG_REF_UNRESOLVED",
            edit("r-full.json", |v| v["translationLibrary"]["documents"][0]["folderId"] = json!("nope")),
        ),
        (
            "remediation provenance that does not resolve",
            "MIG_REF_UNRESOLVED",
            edit("r-full.json", |v| v["translationLibrary"]["documents"][1]["provenance"]["sourceReviewId"] = json!("nope")),
        ),
        (
            "response summary that disagrees with its responses",
            "MIG_LEARNER_RESPONSE_INVARIANT",
            edit("r-full.json", |v| v["learnerResponses"][0]["summary"]["itemCount"] = json!(99)),
        ),
        (
            "duplicate snapshot item id",
            "MIG_LEARNER_RESPONSE_INVARIANT",
            edit("r-full.json", |v| {
                let id = v["learnerResponses"][0]["material"]["snapshot"]["items"][0]["id"].clone();
                v["learnerResponses"][0]["material"]["snapshot"]["items"][1]["id"] = id;
            }),
        ),
        (
            "paper references media the backup lacks",
            "MIG_MEDIA_MISSING",
            edit("r-full.json", |v| {
                v["mediaAssets"].as_array_mut().unwrap().retain(|a| a["id"] != "img-1");
            }),
        ),
        ("invalid base64", "MIG_MEDIA_PAYLOAD_INVALID", edit("r-full.json", |v| v["mediaAssets"][0]["data"] = json!("!!!! not base64"))),
        ("empty media payload", "MIG_MEDIA_PAYLOAD_INVALID", edit("r-full.json", |v| v["mediaAssets"][0]["data"] = json!(""))),
        (
            "media without a payload",
            "MIG_MEDIA_PAYLOAD_INVALID",
            edit("r-full.json", |v| {
                v["mediaAssets"][0].as_object_mut().unwrap().remove("data");
            }),
        ),
        (
            "declared size differs from the decoded bytes",
            "MIG_MEDIA_SIZE_MISMATCH",
            edit("r-full.json", |v| {
                let n = v["mediaAssets"][0]["size"].as_u64().unwrap();
                v["mediaAssets"][0]["size"] = json!(n + 1);
            }),
        ),
        (
            "same media id with different bytes",
            "MIG_MEDIA_CONFLICT",
            edit("r-full.json", |v| {
                let mut a = v["mediaAssets"][0].clone();
                a["data"] = json!("eHl6");
                a["size"] = json!(3);
                v["mediaAssets"].as_array_mut().unwrap().push(a);
            }),
        ),
        (
            "image referenced as audio",
            "MIG_MEDIA_MIME_CLASS",
            edit("r-full.json", |v| v["mediaAssets"][0]["mimeType"] = json!("audio/wav")),
        ),
        ("unsupported mime", "MIG_MEDIA_MIME_CLASS", edit("r-full.json", |v| v["mediaAssets"][0]["mimeType"] = json!("application/pdf"))),
        (
            "annotation text does not match its span",
            "MIG_ANCHOR_MISMATCH",
            edit("r-full.json", |v| v["learnerResponses"][2]["learnerAnnotations"][0]["text"] = json!("狗")),
        ),
        (
            "annotation outside the answer",
            "MIG_ANCHOR_MISMATCH",
            edit("r-full.json", |v| v["learnerResponses"][2]["learnerAnnotations"][0]["end"] = json!(9999)),
        ),
        (
            "overlapping annotations",
            "MIG_ANCHOR_MISMATCH",
            edit("r-full.json", |v| {
                let a = v["learnerResponses"][2]["learnerAnnotations"][0].clone();
                let mut b = a.clone();
                b["id"] = json!("an-overlap");
                v["learnerResponses"][2]["learnerAnnotations"].as_array_mut().unwrap().push(b);
            }),
        ),
        (
            "correction anchored text does not match",
            "MIG_ANCHOR_MISMATCH",
            edit("r-full.json", |v| v["teacherReviews"][0]["itemReviews"][0]["corrections"][0]["anchoredText"] = json!("X")),
        ),
        // a split surrogate pair needs a lone surrogate in the anchored text, which H-1 blocks at the reader
        ("annotation that splits a surrogate pair", "MIG_SOURCE_LONE_SURROGATE", {
            let s = text("r-full.json").replacen("\"text\": \"😀\"", "\"text\": \"\\ude00\"", 1);
            s.into_bytes()
        }),
    ]
}

#[test]
fn every_blocking_code_fails_closed_with_the_live_store_and_source_untouched() {
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for (name, code, bytes) in cases() {
        let e = env();
        let src = e.source("src.json", &bytes);
        let before = e.state_hash();
        let p = e.prepare(&src);
        assert!(p.blocked, "{name}: expected a blocking diagnostic ({code}) but it was accepted");
        let got = blocking_codes(&p);
        assert!(got.iter().any(|c| c == code), "{name}: expected {code}, got {got:?}");
        assert_eq!(e.state_hash(), before, "{name}: the live store must be unchanged");
        assert!(std::fs::read_dir(e.root.staging_dir()).unwrap().next().is_none(), "{name}: no staging residue after a blocked run");
        assert_eq!(std::fs::read(&src).unwrap(), bytes, "{name}: the user's file must be untouched");
        assert!(p.report["blocked"].as_bool().unwrap());
        assert!(
            p.report["diagnostics"].as_array().unwrap().iter().all(|d| d["params"].is_object() || d["params"].is_null()),
            "{name}: structured params only"
        );
        seen.insert(code.to_string());
    }

    // a source that does not exist
    let e = env();
    let p = prepare(&e.host, &e.dir.path().join("missing.json"), None, &PrepareOptions::default()).unwrap();
    assert!(blocking_codes(&p).contains(&"MIG_SOURCE_UNREADABLE".to_string()));
    seen.insert("MIG_SOURCE_UNREADABLE".into());

    // not enough free space (pre-flight)
    let src = e.source("big.json", &fixture_bytes("r-min.json"));
    let p = prepare(&e.host, &src, None, &PrepareOptions { free_space_override: Some(10), ..PrepareOptions::default() }).unwrap();
    assert!(blocking_codes(&p).contains(&"MIG_INSUFFICIENT_SPACE".to_string()));
    seen.insert("MIG_INSUFFICIENT_SPACE".into());

    // non-media JSON beyond the bound
    let p = prepare(&e.host, &src, None, &PrepareOptions { nonmedia_limit: 100, ..PrepareOptions::default() }).unwrap();
    assert!(blocking_codes(&p).contains(&"MIG_SOURCE_TOO_LARGE".to_string()));
    seen.insert("MIG_SOURCE_TOO_LARGE".into());

    // an explicitly supplied artifact that is not recognized blocks the run
    let bad = e.source("artifact.bin", b"this is not an artifact");
    let p = e.prepare_with_artifact(&src, &bad);
    assert!(blocking_codes(&p).contains(&"MIG_RECOVERY_ARTIFACT_UNRECOGNIZED".to_string()));
    seen.insert("MIG_RECOVERY_ARTIFACT_UNRECOGNIZED".into());

    // a live record with the same id and different content
    let e = env();
    e.import("first.json", &fixture("r-full.json"));
    let before = e.state_hash();
    let other = edit("r-full.json", |v| v["library"]["papers"][0]["title"] = json!("Edited elsewhere"));
    let p = e.prepare(&e.source("second.json", &other));
    assert!(p.blocked && blocking_codes(&p).contains(&"MIG_LIVE_CONFLICT".to_string()), "{:?}", codes(&p));
    assert_eq!(e.state_hash(), before);
    seen.insert("MIG_LIVE_CONFLICT".into());

    // the registry and the fixtures agree: every blocking code is exercised
    let blocking: BTreeSet<String> =
        CODES.iter().filter(|(c, s, _)| *s == Severity::Blocking && !EXEMPT.contains(c)).map(|(c, _, _)| c.to_string()).collect();
    let missing: Vec<_> = blocking.difference(&seen).collect();
    assert!(missing.is_empty(), "blocking codes without a fixture: {missing:?}");
}
