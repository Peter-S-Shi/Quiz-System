//! The migration through the Store Port and the WebView boundary (ADR 0002 section 12; ADR 0001 section 4):
//! only path-free steps are WebView-callable, the native flow carries the path, the preview is confirmed by its
//! hash, and user text that looks like a path round-trips untouched.

use qs_migrate_v1::catalog::PAPER;
use qs_port::webview::{self, ALLOWLIST};
use qs_port::Core;
use qs_store::OpenOptions;
use qs_testkit::*;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../migrate_v1/tests/fixtures").join(name)
}

fn core(t: &TestRoot) -> Core {
    Core::open(&t.root, qs_port::selftest::product_catalog(), &OpenOptions::default()).unwrap()
}

#[test]
fn the_webview_can_only_reach_the_path_free_migration_steps() {
    for ok in ["migration.status", "migration.confirm", "migration.cancel", "migration.undo"] {
        assert!(ALLOWLIST.contains(&ok), "{ok}");
    }
    assert!(!ALLOWLIST.contains(&"migration.prepare"), "preparing carries a source path: native flow only");
    let t = temp_root();
    let c = core(&t);
    let r = webview::dispatch(&c, "migration.prepare", &json!({"source": fixture("r-full.json").display().to_string()}));
    assert_eq!(r["error"]["code"], "REJECT_SHAPE");
}

#[test]
fn preview_confirm_and_undo_through_the_port_with_a_path_free_report() {
    let t = temp_root();
    let c = core(&t);
    let src = fixture("r-full.json");
    let prep = c.dispatch("migration.prepare", &json!({"source": src.display().to_string()}));
    assert_eq!(prep["ok"], true, "{prep}");
    let res = &prep["result"];
    assert_eq!(res["blocked"], false);
    let hash = res["reportHash"].as_str().unwrap().to_string();
    // what the WebView would see: status carries the pending preview, with no path anywhere
    let st = webview::dispatch(&c, "migration.status", &json!({}));
    assert_eq!(st["ok"], true);
    assert_eq!(st["result"]["pending"]["reportHash"], hash);
    assert!(webview::find_absolute_path(&st).is_none(), "the preview must be path-free: {st}");
    assert!(!st.to_string().contains(&t.dir.path().display().to_string()));

    // a wrong confirmation is refused and the preview stays valid
    let bad = webview::dispatch(&c, "migration.confirm", &json!({"reportHash": "wrong"}));
    assert_eq!(bad["ok"], false);
    assert_eq!(bad["error"]["code"], "REJECT_PRECONDITION");
    assert_eq!(webview::dispatch(&c, "migration.status", &json!({}))["result"]["pending"]["reportHash"], hash);

    let done = webview::dispatch(&c, "migration.confirm", &json!({"reportHash": hash}));
    assert_eq!(done["ok"], true, "{done}");
    assert_eq!(done["result"]["result"], "done");
    let run = done["result"]["runOpId"].as_str().unwrap().to_string();
    assert!(webview::find_absolute_path(&done).is_none());
    assert_eq!(webview::dispatch(&c, "migration.status", &json!({}))["result"]["pending"], Value::Null);
    assert_eq!(c.with_store(|s| s.count(PAPER).unwrap()), 2);

    // importing the same bytes again is a no-op reported as such
    let again = c.dispatch("migration.prepare", &json!({"source": src.display().to_string()}));
    assert_eq!(again["result"]["alreadyMigrated"], true);

    // undo through the WebView-callable step
    let undo = webview::dispatch(&c, "migration.undo", &json!({"runOpId": run}));
    assert_eq!(undo["result"]["result"], "done", "{undo}");
    assert_eq!(c.with_store(|s| s.count(PAPER).unwrap()), 0);
    assert_eq!(webview::dispatch(&c, "migration.status", &json!({}))["result"]["runs"][0]["undone"], true);
}

#[test]
fn migrated_text_that_looks_like_a_path_round_trips_losslessly_through_the_webview() {
    let t = temp_root();
    let c = core(&t);
    let mut v: Value = serde_json::from_slice(&std::fs::read(fixture("r-min.json")).unwrap()).unwrap();
    let literal = r"C:\Windows\System32 and /home/alice/file and \\server\share\doc";
    v["library"]["papers"][0]["title"] = json!(literal);
    let src = t.dir.path().join("v1.json");
    std::fs::write(&src, serde_json::to_vec(&v).unwrap()).unwrap();
    let prep = c.dispatch("migration.prepare", &json!({"source": src.display().to_string()}));
    let hash = prep["result"]["reportHash"].as_str().unwrap().to_string();
    assert_eq!(webview::dispatch(&c, "migration.confirm", &json!({"reportHash": hash}))["ok"], true);
    let read = webview::dispatch(&c, "store.read", &json!({"collection": "paper", "query": {"id": "paper-min"}}));
    assert_eq!(read["result"]["records"][0]["payload"]["title"], literal, "user text is never scrubbed");
    assert!(!read.to_string().contains("<path>"));
}

#[test]
fn a_blocked_source_surfaces_a_blocked_report_and_leaves_nothing_pending() {
    let t = temp_root();
    let c = core(&t);
    let src = t.dir.path().join("bad.json");
    std::fs::write(&src, b"definitely not json").unwrap();
    let prep = c.dispatch("migration.prepare", &json!({"source": src.display().to_string()}));
    assert_eq!(prep["ok"], true);
    assert_eq!(prep["result"]["blocked"], true);
    assert_eq!(prep["result"]["report"]["diagnostics"][0]["code"], "MIG_SOURCE_NOT_JSON");
    assert_eq!(c.dispatch("migration.status", &json!({}))["result"]["pending"], Value::Null);
    let confirm = c.dispatch("migration.confirm", &json!({"reportHash": prep["result"]["reportHash"]}));
    assert_eq!(confirm["error"]["code"], "NOT_FOUND");
}

#[test]
fn writes_and_migration_confirmation_are_refused_while_the_gate_is_open_and_the_preview_survives() {
    let t = temp_root();
    let c = core(&t);
    let prep = c.dispatch("migration.prepare", &json!({"source": fixture("r-min.json").display().to_string()}));
    let hash = prep["result"]["reportHash"].as_str().unwrap().to_string();
    {
        let _g = c.write_gate().unwrap();
        let r = c.dispatch("migration.confirm", &json!({"reportHash": hash}));
        assert_eq!(r["error"]["code"], "STORE_BUSY");
        let w = c.dispatch("store.commit", &json!({"uow": {"ops": []}}));
        assert_eq!(w["error"]["code"], "STORE_BUSY");
    }
    assert_eq!(c.dispatch("migration.status", &json!({}))["result"]["pending"]["reportHash"], hash, "the preview is still valid");
    assert_eq!(c.dispatch("migration.confirm", &json!({"reportHash": hash}))["ok"], true);
    let _ = Arc::strong_count(&qs_port::selftest::product_catalog());
}

#[test]
fn startup_purges_staging_leftovers_of_an_interrupted_preview() {
    let t = temp_root();
    {
        let c = core(&t);
        let p = c.dispatch("migration.prepare", &json!({"source": fixture("r-full.json").display().to_string()}));
        assert_eq!(p["ok"], true);
        assert!(std::fs::read_dir(t.root.staging_dir()).unwrap().next().is_some(), "a preview stages its work");
    } // process "dies" without confirming or cancelling
    let _c = core(&t);
    assert!(std::fs::read_dir(t.root.staging_dir()).unwrap().next().is_none(), "orphan staging is purged at startup");
}
