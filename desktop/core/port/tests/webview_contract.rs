//! WebView boundary contract (ADR 0001 sections 4 and 8): the WebView never receives a raw filesystem
//! path, cannot trigger filesystem maintenance (media GC) or call path-carrying commands, and the JS
//! Store Port surface equals the real allowlist.

use qs_port::webview::{self, ALLOWLIST};
use qs_port::Core;
use qs_store::{Catalog, OpenOptions};
use qs_testkit::*;
use serde_json::{json, Value};
use std::sync::Arc;

fn open(t: &TestRoot, c: &Arc<Catalog>) -> Core {
    Core::open(&t.root, c.clone(), &OpenOptions::default()).unwrap()
}

#[test]
fn allowlist_excludes_gc_and_every_path_carrying_command() {
    for forbidden in ["media.gc", "media.ingest_file", "backup.create", "backup.verify", "backup.restore"] {
        assert!(!ALLOWLIST.contains(&forbidden), "{forbidden} must not be WebView-callable");
    }
    assert!(ALLOWLIST.contains(&"store.commit") && ALLOWLIST.contains(&"schema.info"));
}

#[test]
fn forbidden_commands_are_rejected_and_media_gc_never_touches_the_filesystem() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let core = open(&t, &c);
    // an unreferenced media file old enough that ANY gc with a zero delay would remove it
    let media = qs_media::MediaStore::new(t.root.media_dir());
    let orphan = media.put_bytes(b"orphan bytes").unwrap();
    for (cmd, args) in [
        ("media.gc", json!({"minAgeSeconds": 0})),
        ("media.ingest_file", json!({"path": "C:/Windows/win.ini"})),
        ("backup.create", json!({"dest": "C:/x.qsarchive"})),
        ("backup.verify", json!({"path": "C:/x.qsarchive"})),
        ("backup.restore", json!({"path": "C:/x.qsarchive"})),
    ] {
        let r = webview::dispatch(&core, cmd, &args);
        assert_eq!(r["ok"], false, "{cmd}");
        assert_eq!(r["error"]["code"], "REJECT_SHAPE", "{cmd}");
    }
    assert!(media.contains(&orphan.hash), "the WebView must not be able to trigger or tune GC");
}

#[test]
fn media_gc_runs_only_through_the_rust_maintenance_path_with_a_fixed_safety_delay() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let core = open(&t, &c);
    let media = qs_media::MediaStore::new(t.root.media_dir());
    let orphan = media.put_bytes(b"young orphan").unwrap();
    let rep = core.maintenance_gc().unwrap();
    assert_eq!(rep.removed_orphans, 0, "a fresh orphan is protected by the fixed safety delay");
    assert!(media.contains(&orphan.hash));
    assert_eq!(qs_port::MEDIA_GC_SAFETY_DELAY.as_secs(), 24 * 3600);
}

fn assert_clean(label: &str, v: &Value, root: &str) {
    let text = v.to_string();
    assert!(webview::find_absolute_path(v).is_none(), "{label}: absolute path in {text}");
    assert!(!text.contains(root), "{label}: data root leaked: {text}");
    assert!(!text.contains("absolutePath") && !text.contains("dataRoot"), "{label}: path-shaped field in {text}");
}

#[test]
fn no_webview_visible_response_exposes_an_absolute_or_local_path() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let core = open(&t, &c);
    let root = t.root.path().display().to_string();
    let media = qs_media::MediaStore::new(t.root.media_dir());
    let stored = media.put_bytes(&[5u8; 4096]).unwrap();
    core.with_store(|s| s.snapshot_to(&t.root.snapshots_dir().join("pre-manual.db")).unwrap());

    let uw = uow(vec![
        put_op(&c, "media_object", "img-1", media_object_payload("img-1", &stored.hash, stored.size)),
        put_op(&c, "learner_response", "resp-1", response_payload(1, 2, &["img-1".to_string()])),
    ]);
    let calls: Vec<(&str, Value)> = vec![
        ("schema.info", json!({})),
        ("store.commit", json!({"uow": uw})),
        ("store.commit", json!({"uow": {"ops": []}})), // error path
        ("store.read", json!({"collection": "learner_response", "query": {}})),
        ("store.read", json!({"collection": "nope"})), // error path
        ("store.count", json!({"collection": "learner_response"})),
        ("store.check_consistency", json!({})),
        ("media.locate", json!({"id": "img-1"})),
        ("media.locate", json!({"id": "missing"})), // error path
        ("snapshots.list", json!({})),
        ("snapshots.restore", json!({"name": "../../evil.db"})), // error path
        ("snapshots.restore", json!({"name": "pre-manual.db"})),
    ];
    assert_eq!(
        calls.iter().map(|c| c.0).collect::<std::collections::BTreeSet<_>>().len(),
        ALLOWLIST.len(),
        "every allowlisted command is audited"
    );
    for (cmd, args) in calls {
        assert_clean(cmd, &webview::dispatch(&core, cmd, &args), &root);
    }
}

#[test]
fn native_media_result_shape_carries_no_path() {
    let r = webview::media_ingest_result("media-abc", &"ab".repeat(32), 12, "photo.png", "image/png", false);
    assert_eq!(r["ok"], true);
    assert!(webview::find_absolute_path(&r).is_none());
    let keys: Vec<&String> = r["result"].as_object().unwrap().keys().collect();
    assert!(keys.iter().all(|k| !k.to_lowercase().contains("path")), "{keys:?}");
}

#[test]
fn error_diagnostics_have_internal_paths_redacted_including_spaces_unc_verbatim_and_unix() {
    let root = r"C:\Users\Jane Doe\AppData\Local\io.github.example.app";
    let cases: &[(&str, &str)] = &[
        (r"failed to open C:\Users\Jane Doe\AppData\Local\x y\quiz.db: Access is denied", "Access is denied"),
        (r"rename C:/Users/Jane Doe/data/a b.tmp failed (os error 5)", "(os error 5)"),
        (r"cannot create \\?\C:\very long\segment\file.db: path not found", "path not found"),
        (r"share \\fileserver\team share\backup.qsarchive: unreachable", "unreachable"),
        ("could not read /home/jane doe/notes/x.db: permission denied", "permission denied"),
        (&format!(r"snapshot {root}\snapshots\pre-op.db is damaged"), "is damaged"),
        (r#"open "C:\Program Files\App Name\app.exe" failed"#, "failed"),
    ];
    for (msg, kept) in cases {
        let mut env = json!({"ok": false, "error": {"code": "IO", "message": msg}});
        webview::sanitize_envelope(&mut env, root);
        let out = env["error"]["message"].as_str().unwrap();
        assert!(webview::path_spans(out).is_empty(), "path left in {out:?} (from {msg:?})");
        assert!(!out.contains("Jane") && !out.contains("fileserver") && !out.contains("Program Files"), "{out:?}");
        assert!(out.contains(kept), "diagnostic context lost: {out:?}");
        assert!(out.contains("<path>") || out.contains("<data folder>"), "{out:?}");
    }
    // only the diagnostic field of a FAILURE envelope is ever touched
    let mut ok = json!({"ok": true, "result": {"title": r"C:\Windows\System32", "error": {"message": r"\\server\share\doc"}}});
    let before = ok.clone();
    webview::sanitize_envelope(&mut ok, root);
    assert_eq!(ok, before, "success results (canonical/user content) are never rewritten");
    let mut bad = json!({"ok": false, "error": {"code": "X", "message": "m"}, "result": {"title": r"C:\Windows\System32"}});
    webview::sanitize_envelope(&mut bad, root);
    assert_eq!(bad["result"]["title"], r"C:\Windows\System32");
}

#[test]
fn the_js_store_port_surface_equals_the_allowlist() {
    let src = std::fs::read_to_string(format!("{}/../../ui/web/src/store-port.js", env!("CARGO_MANIFEST_DIR"))).unwrap();
    let mut used = std::collections::BTreeSet::new();
    let mut rest = src.as_str();
    while let Some(i) = rest.find("call('") {
        rest = &rest[i + 6..];
        used.insert(rest[..rest.find('\'').unwrap()].to_string());
    }
    assert!(!used.is_empty());
    for cmd in &used {
        assert!(ALLOWLIST.contains(&cmd.as_str()), "store-port.js calls '{cmd}' which is not WebView-allowlisted");
    }
    assert!(!src.contains("verifyBackup"), "path-carrying verifyBackup must be gone from the JS surface");
}

const PATH_LIKE_TEXT: &[&str] = &[
    r"C:\Windows\System32",
    r"c:/Program Files/App Name/file.txt",
    r"/home/alice/file",
    r"/Users/bob/My Documents/x.md",
    r"\\server\share\doc",
    r"\\?\C:\very\long\path",
    r"see C:\Windows\System32 and /home/alice/file for details",
    r"D:\Users\Jane Doe\AppData\Local\note.txt: not an error",
];

#[test]
fn user_authored_path_like_text_round_trips_losslessly_through_the_webview() {
    let t = temp_root();
    let c = arc(evidence_catalog());
    let core = open(&t, &c);
    let mut payload = response_payload(1, 2, &[]);
    payload["title"] = json!(PATH_LIKE_TEXT[0]);
    payload["notes"] = json!(PATH_LIKE_TEXT);
    payload["nested"] =
        json!({"p": PATH_LIKE_TEXT[4], "error": {"message": PATH_LIKE_TEXT[6], "code": "USER"}, PATH_LIKE_TEXT[2]: PATH_LIKE_TEXT[5]});
    let uw = uow(vec![put_op(&c, "learner_response", "resp-1", payload.clone())]);
    let commit = webview::dispatch(&core, "store.commit", &json!({"uow": uw}));
    assert_eq!(commit["ok"], true, "{commit}");
    let read = webview::dispatch(&core, "store.read", &json!({"collection": "learner_response", "query": {"id": "resp-1"}}));
    assert_eq!(read["ok"], true);
    let back = &read["result"]["records"][0]["payload"];
    assert_eq!(qs_store::canon::canonical(back), qs_store::canon::canonical(&payload), "payload must round-trip byte-for-byte");
    assert_eq!(back["title"], PATH_LIKE_TEXT[0]);
    assert_eq!(back["notes"], json!(PATH_LIKE_TEXT));
    assert!(!read.to_string().contains("<path>") && !read.to_string().contains("<data folder>"), "no user string may be scrubbed");
    // the projection column derived from user text is untouched too
    let q = webview::dispatch(
        &core,
        "store.read",
        &json!({"collection": "learner_response", "query": {"where": [{"column": "paper_id", "value": "paper-1"}]}}),
    );
    assert_eq!(q["result"]["records"].as_array().unwrap().len(), 1);
}
