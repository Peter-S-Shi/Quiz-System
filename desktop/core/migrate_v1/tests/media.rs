//! Media integrity (ADR 0002 section 10, 16.2-7): byte identity, special mapping (no base64 in payloads),
//! content sharing, orphans, staging that outlives the GC delay.

mod common;
use common::*;
use qs_media::MediaStore;
use qs_migrate_v1::catalog::*;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::time::Duration;

fn asset<'a>(v: &'a Value, id: &str) -> &'a Value {
    v["mediaAssets"].as_array().unwrap().iter().find(|a| a["id"] == id).unwrap()
}

#[test]
fn published_media_is_byte_identical_ids_and_metadata_are_preserved_and_no_base64_is_stored() {
    let e = env();
    let v = fixture("r-full.json");
    e.import("v1.json", &v);
    let media = MediaStore::new(e.root.media_dir());
    for id in ["img-1", "aud-1", "img-1-copy"] {
        let a = asset(&v, id);
        let want = b64_decode(a["data"].as_str().unwrap());
        let row = e.host.with_store(|s| s.read("media_object", &json!({"id": id})).unwrap()[0].payload.clone());
        let hash = row["contentHash"].as_str().unwrap();
        assert_eq!(hash, sha256_hex(&want), "{id}: contentHash is the SHA-256 of the decoded bytes");
        assert_eq!(std::fs::read(media.path_for(hash).unwrap()).unwrap(), want, "{id}: stored bytes are identical");
        assert_eq!(row["id"], a["id"]);
        assert_eq!(row["mimeType"], a["mimeType"]);
        assert_eq!(row["name"], a["name"]);
        assert_eq!(row["size"], a["size"]);
        assert!(row.get("data").is_none(), "{id}: the base64 payload is never stored");
    }
}

#[test]
fn identical_bytes_under_two_ids_share_one_file_and_keep_two_media_rows() {
    let e = env();
    let (p, _) = e.import("v1.json", &fixture("r-full.json"));
    assert!(has(&p, "MIG_MEDIA_SHARED_CONTENT"));
    let files = MediaStore::new(e.root.media_dir()).list().unwrap();
    assert_eq!(files.len(), 2, "img-1 and img-1-copy share a file; aud-1 is the other");
    assert_eq!(e.count("media_object"), 3);
}

#[test]
fn an_identical_duplicate_asset_collapses_and_an_unreferenced_asset_is_reported_not_migrated() {
    let e = env();
    let mut v = fixture("r-full.json");
    let dup = v["mediaAssets"][0].clone();
    v["mediaAssets"].as_array_mut().unwrap().push(dup);
    let orphan = json!({"id": "img-orphan", "mimeType": "image/png", "name": "orphan.png", "size": 3, "data": "AQID"});
    v["mediaAssets"].as_array_mut().unwrap().push(orphan);
    // a stray mention of the orphan's id in a field V1 never used for references
    v["library"]["papers"][0]["zz_note"] = json!("img-orphan");
    let p = e.prepare(&e.source_json("v1.json", &v));
    assert!(!p.blocked, "{:?}", p.report["diagnostics"]);
    assert!(
        has(&p, "MIG_MEDIA_DUPLICATE_IDENTICAL")
            && has(&p, "MIG_MEDIA_UNREFERENCED_NOT_MIGRATED")
            && has(&p, "MIG_MEDIA_ID_IN_UNMODELED_FIELD")
    );
    assert_eq!(p.report["media"]["unreferencedNotMigrated"], 1);
    let c = &p.report["counts"]["media_object"];
    assert_eq!(
        (c["source"].as_u64(), c["carried"].as_u64(), c["collapsed"].as_u64(), c["reportedUnmigrated"].as_u64()),
        (Some(5), Some(3), Some(1), Some(1))
    );
    e.activate(&p);
    assert_eq!(e.count("media_object"), 3, "the orphan is not migrated (D-8) - and it was reported, not silently dropped");
    let hash = sha256_hex(&[1u8, 2, 3]);
    assert!(!MediaStore::new(e.root.media_dir()).contains(&hash));
}

#[test]
fn base64_with_a_data_url_prefix_and_without_padding_is_accepted_exactly_as_v1_accepts_it() {
    let e = env();
    let mut v = fixture("r-min.json");
    v["library"]["papers"][0]["questions"][0]["image"] = json!({"id": "i1", "mimeType": "image/png", "name": "a.png", "size": 3});
    v["library"]["papers"][0]["questions"].as_array_mut().unwrap().push(json!({"id": "q2", "type": "truefalse", "prompt": "x", "answer": true, "audio": {"id": "a1", "mimeType": "audio/wav", "name": "a.wav", "size": 5}}));
    v["mediaAssets"] = json!([
        {"id": "i1", "mimeType": "image/png", "name": "a.png", "size": 3, "data": "data:image/png;base64,AQID"},
        {"id": "a1", "mimeType": "audio/wav", "name": "a.wav", "size": 5, "data": "AQIDBAU"}
    ]);
    let (_, _) = e.import("v1.json", &v);
    let media = MediaStore::new(e.root.media_dir());
    assert!(media.contains(&sha256_hex(&[1, 2, 3])));
    assert!(media.contains(&sha256_hex(&[1, 2, 3, 4, 5])));
}

#[test]
fn staged_media_lives_outside_the_live_store_and_survives_a_preview_that_outlasts_the_gc_delay() {
    let e = env();
    let p = e.prepare(&e.source("v1.json", &fixture_bytes("r-full.json")));
    assert!(!p.blocked);
    let live = MediaStore::new(e.root.media_dir());
    assert!(live.list().unwrap().is_empty(), "nothing is published before the confirmation");
    // age every staged file far beyond the 24 h safety delay, then run the same GC the app runs
    let old = std::time::SystemTime::now() - Duration::from_secs(72 * 3600);
    for entry in std::fs::read_dir(p.staging_dir().join("media")).unwrap().flatten() {
        let f = std::fs::File::options().write(true).open(entry.path()).unwrap();
        f.set_modified(old).unwrap();
    }
    let report = live.gc(&HashSet::new(), Duration::from_secs(24 * 3600)).unwrap();
    assert_eq!(report.removed_orphans, 0);
    let staged = std::fs::read_dir(p.staging_dir().join("media")).unwrap().count();
    assert!(staged >= 2, "staged media must survive GC: {staged}");
    // and activation still publishes everything
    e.activate(&p);
    assert_eq!(live.list().unwrap().len(), 2);
    for h in live.list().unwrap() {
        live.verify(&h, None).unwrap();
    }
}

#[test]
fn a_migrated_store_that_is_garbage_collected_loses_no_referenced_media() {
    let e = env();
    e.import("v1.json", &fixture("r-full.json"));
    let live = MediaStore::new(e.root.media_dir());
    let referenced: HashSet<String> = e.host.with_store(|s| {
        let mut st = s.conn().prepare("SELECT DISTINCT content_hash FROM media_object").unwrap();
        st.query_map([], |r| r.get::<_, String>(0)).unwrap().map(|x| x.unwrap()).collect()
    });
    let r = live.gc(&referenced, Duration::from_secs(0)).unwrap();
    assert_eq!(r.removed_orphans, 0);
    assert_eq!(live.list().unwrap().len(), 2);
}

#[test]
fn media_rows_carry_unknown_asset_keys_and_the_media_gap() {
    let e = env();
    let mut v = fixture("r-full.json");
    v["mediaAssets"][0]["zz_asset_note"] = json!({"kept": true});
    let (p, _) = e.import("v1.json", &v);
    let row = e.host.with_store(|s| s.read("media_object", &json!({"id": "img-1"})).unwrap()[0].payload.clone());
    assert_eq!(row["zz_asset_note"], json!({"kept": true}));
    let origin: Value =
        e.host.with_store(|s| s.read(ORIGIN, &json!({"id": format!("{}:media_object:img-1", p.source_id)})).unwrap()[0].payload.clone());
    assert!(origin["gaps"].as_array().unwrap().contains(&json!("media.created-at")));
}
