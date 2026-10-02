//! The lossless-first reader (ADR 0002 section 6): exactness of strings and numbers, duplicate keys, surrogates,
//! streaming media decode, bounds. Direct tests of `read_source`.

mod common;
use common::*;
use qs_migrate_v1::reader::{js_producible, read_source, ReaderOptions};
use serde_json::{json, Value};

fn read(bytes: &[u8]) -> qs_migrate_v1::reader::Read_ {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("x.json");
    std::fs::write(&p, bytes).unwrap();
    let r = read_source(&p, &ReaderOptions { nonmedia_limit: 1 << 30, media_dir: dir.path().join("m"), discard_media: false }).unwrap();
    std::mem::forget(dir); // the decoded media files must outlive this helper (they live in the OS temp dir)
    r
}

fn codes(r: &qs_migrate_v1::reader::Read_) -> Vec<&'static str> {
    r.diags.codes()
}

#[test]
fn strings_are_code_point_exact_including_escapes_astral_characters_and_unnormalized_text() {
    let r = read("{\"a\":\"e\\u0301 \\ud83d\\ude00 猫 \\u2028 \\/ \\\\ \\\"q\\\" \\n\"}".as_bytes());
    assert!(codes(&r).is_empty());
    assert_eq!(r.root.unwrap()["a"], "e\u{301} \u{1F600} 猫 \u{2028} / \\ \"q\" \n");
    // no NFC/NFD normalization, no trimming
    let r = read("{\"a\":\"  e\u{301}  \"}".as_bytes());
    assert_eq!(r.root.unwrap()["a"], "  e\u{301}  ");
}

#[test]
fn duplicate_keys_are_detected_at_any_depth_and_the_read_continues() {
    let r = read(br#"{"a":1,"b":{"c":[{"d":1,"d":2}],"c":3}}"#);
    let c = codes(&r);
    assert_eq!(c.iter().filter(|x| **x == "MIG_SOURCE_DUPLICATE_KEY").count(), 2, "{c:?}");
    assert!(r.root.is_some());
}

#[test]
fn lone_surrogates_are_reported_and_never_silently_replaced() {
    for body in [r#"{"a":"\ud800"}"#, r#"{"a":"\udc00x"}"#, r#"{"a":"\ud800\u0041"}"#, r#"{"a":"x\ud800"}"#] {
        let r = read(body.as_bytes());
        assert!(codes(&r).contains(&"MIG_SOURCE_LONE_SURROGATE"), "{body}: {:?}", codes(&r));
    }
    // a valid pair is fine
    assert!(codes(&read(br#"{"a":"\ud83d\ude00"}"#)).is_empty());
}

#[test]
fn numbers_must_be_js_producible() {
    for ok in [
        "0",
        "-0",
        "1",
        "1.0",
        "1e2",
        "0.5",
        "123456789012345",
        "9007199254740991",
        "-9007199254740991",
        "1.5e300",
        "5e-324",
        "0.30000000000000004",
        "66.66666666666667",
    ] {
        assert!(js_producible(ok), "{ok} should be accepted");
    }
    for bad in [
        "9007199254740993",
        "9007199254740992",
        "-9007199254740993",
        "0.1000000000000000055511151231257827",
        "1e999",
        "123456789012345678901234567890",
        "0.30000000000000004441",
    ] {
        assert!(!js_producible(bad), "{bad} should be rejected");
    }
    let r = read(br#"{"n":[1.0,1e2,0.1,9007199254740993]}"#);
    assert_eq!(codes(&r), vec!["MIG_SOURCE_UNSAFE_NUMBER"]);
    // accepted numbers keep their exact token inside the tree (canonical form is decided at storage)
    let r = read(br#"{"n":[1.0,1e2]}"#);
    assert_eq!(qs_store::canon::canonical(&r.root.unwrap()["n"]), "[1,100]");
}

#[test]
fn malformed_documents_end_with_a_specific_fatal_diagnostic_and_no_tree() {
    let cases: Vec<(&str, Vec<u8>, &str)> = vec![
        ("empty", vec![], "MIG_SOURCE_NOT_JSON"),
        ("truncated object", br#"{"a":"#.to_vec(), "MIG_SOURCE_NOT_JSON"),
        ("unterminated string", br#"{"a":"x"#.to_vec(), "MIG_SOURCE_NOT_JSON"),
        ("trailing comma", br#"{"a":1,}"#.to_vec(), "MIG_SOURCE_NOT_JSON"),
        ("bare word", b"nope".to_vec(), "MIG_SOURCE_NOT_JSON"),
        ("single quotes", b"{'a':1}".to_vec(), "MIG_SOURCE_NOT_JSON"),
        ("control character in a string", b"{\"a\":\"x\ty\"}".to_vec(), "MIG_SOURCE_NOT_JSON"),
        ("leading zero number", b"[01]".to_vec(), "MIG_SOURCE_NOT_JSON"),
        ("trailing data", b"{} {}".to_vec(), "MIG_SOURCE_NOT_JSON"),
        ("invalid utf-8 in a string", b"{\"a\":\"\xff\"}".to_vec(), "MIG_SOURCE_NOT_UTF8"),
        ("utf-16 bom", vec![0xFF, 0xFE, b'{', 0, b'}', 0], "MIG_SOURCE_NOT_UTF8"),
        ("too deep", format!("{}1{}", "[".repeat(400), "]".repeat(400)).into_bytes(), "MIG_SOURCE_NOT_JSON"),
    ];
    for (name, bytes, code) in cases {
        let r = read(&bytes);
        assert!(r.root.is_none() && codes(&r).contains(&code), "{name}: {:?}", codes(&r));
    }
}

#[test]
fn a_utf8_bom_is_tolerated_for_parsing() {
    let mut b = vec![0xEF, 0xBB, 0xBF];
    b.extend_from_slice(br#"{"a":1}"#);
    assert_eq!(read(&b).root.unwrap(), json!({"a": 1}));
}

#[test]
fn media_data_is_streamed_to_disk_hashed_and_left_out_of_the_tree() {
    let bytes: Vec<u8> = (0..=255u8).cycle().take(100_000).collect();
    let b64 = {
        // reference encoder (std only)
        const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut s = String::new();
        for c in bytes.chunks(3) {
            let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
            s.push(T[(n >> 18) as usize & 63] as char);
            s.push(T[(n >> 12) as usize & 63] as char);
            s.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
            s.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
        }
        s
    };
    let doc = format!("{{\"mediaAssets\":[{{\"id\":\"m\",\"size\":{},\"data\":\"{b64}\"}}]}}", bytes.len());
    let r = read(doc.as_bytes());
    assert!(codes(&r).is_empty());
    let tree = r.root.as_ref().unwrap();
    assert!(tree["mediaAssets"][0].get("data").is_none(), "the payload never enters the materialized tree");
    assert_eq!(tree["mediaAssets"][0]["id"], "m");
    let blob = &r.media[0];
    assert_eq!((blob.list_key.as_str(), blob.index, blob.size), ("mediaAssets", 0, 100_000));
    assert_eq!(blob.sha256, sha256_hex(&bytes));
    assert_eq!(std::fs::read(blob.tmp.as_ref().unwrap()).unwrap(), bytes);
    assert!(r.nonmedia_bytes < 200, "only the non-media part is counted against the bound ({})", r.nonmedia_bytes);
}

#[test]
fn invalid_media_payloads_are_recorded_per_asset_without_failing_the_read() {
    let doc = br#"{"mediaAssets":[{"id":"a","data":"!!"},{"id":"b","data":""},{"id":"c","data":"QQ=="},{"id":"d","data":"QUJD="},{"id":"e","data":"Q"},{"id":"f","data":"QUJDRA=A"}]}"#;
    let r = read(doc);
    let by: std::collections::BTreeMap<usize, &qs_migrate_v1::reader::MediaBlob> = r.media.iter().map(|m| (m.index, m)).collect();
    assert!(by[&0].invalid.is_some(), "illegal character");
    assert!(by[&1].invalid.is_some(), "empty payload");
    assert!(by[&2].invalid.is_none() && by[&2].size == 1, "padded");
    assert!(by[&3].invalid.is_some(), "padding that does not complete a quantum");
    assert!(by[&4].invalid.is_some(), "a single trailing symbol cannot be decoded");
    assert!(by[&5].invalid.is_some(), "data after padding");
    assert!(by.values().all(|b| b.invalid.is_some() || b.tmp.is_some()));
}

#[test]
fn the_non_media_bound_is_enforced_without_counting_media() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("x.json");
    let big_text = "x".repeat(10_000);
    std::fs::write(&p, format!("{{\"a\":\"{big_text}\"}}")).unwrap();
    let r = read_source(&p, &ReaderOptions { nonmedia_limit: 1000, media_dir: dir.path().join("m"), discard_media: false }).unwrap();
    assert!(r.root.is_none() && r.diags.codes().contains(&"MIG_SOURCE_TOO_LARGE"));
    // the same size as media is fine
    std::fs::write(&p, format!("{{\"mediaAssets\":[{{\"id\":\"a\",\"data\":\"{}\"}}]}}", "QUJD".repeat(5_000))).unwrap();
    let r = read_source(&p, &ReaderOptions { nonmedia_limit: 1000, media_dir: dir.path().join("m"), discard_media: true }).unwrap();
    assert!(r.root.is_some(), "{:?}", r.diags.codes());
    assert_eq!(r.media[0].size, 15_000);
    assert!(r.media[0].tmp.is_none(), "discard mode writes nothing");
    let _ = Value::Null;
}

#[test]
fn the_reader_reads_every_committed_fixture_without_diagnostics() {
    for f in ["r-min.json", "r-full.json", "r-hist100.json"] {
        let r = read(&fixture_bytes(f));
        assert!(codes(&r).is_empty(), "{f}: {:?}", codes(&r));
        assert!(r.root.is_some());
    }
}
