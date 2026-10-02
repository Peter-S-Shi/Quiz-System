//! `--self-test`: an end-to-end proof of the desktop foundation that runs against an *isolated*
//! temporary data root (never the user's real data). It exercises the same Store Port the WebView uses:
//! open -> commit -> media ingest -> consistency -> backup -> verify -> restore into a second root.
//! CI runs it from the installed application to show the shipped binary - not just the test binaries -
//! works.

use crate::Core;
use qs_platform::{DataRoot, Result};
use qs_store::{Catalog, OpenOptions};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

/// The catalog the product ships today: structural collections only (domain tables come with later milestones).
pub fn product_catalog() -> Arc<Catalog> {
    Arc::new(Catalog::foundation())
}

pub fn run(dir: &Path) -> Result<Value> {
    let mut steps: Vec<Value> = vec![];
    let mut all_ok = true;
    let mut step = |name: &str, started: Instant, outcome: std::result::Result<Value, String>| {
        let ok = outcome.is_ok();
        all_ok &= ok;
        steps.push(json!({"step": name, "ok": ok, "ms": started.elapsed().as_millis() as u64,
                          "detail": outcome.unwrap_or_else(|e| json!(e))}));
    };

    std::fs::create_dir_all(dir)?;
    let a = DataRoot::at(dir.join("data-a"));
    let b = DataRoot::at(dir.join("data-b"));
    let opts = OpenOptions::default();
    let t = Instant::now();
    let core_a = Core::open(&a, product_catalog(), &opts)?;
    step("open", t, Ok(core_a.startup().to_json()));

    let t = Instant::now();
    let r = core_a.dispatch(
        "store.commit",
        &json!({"uow": {"ops": [{"op": "put", "collection": "setting", "id": "self-test", "payload": {"key": "self-test", "value": "ok", "nested": {"unicode": "\u{4f60}\u{597d} e\u{301}"}}}]}}),
    );
    step("commit", t, if r["ok"] == true { Ok(r["result"].clone()) } else { Err(r.to_string()) });

    let t = Instant::now();
    let blob = dir.join("blob.bin");
    let bytes: Vec<u8> = (0..3 * 1024 * 1024u32).map(|i| (i.wrapping_mul(2654435761) >> 24) as u8).collect();
    std::fs::write(&blob, &bytes)?;
    let ing = core_a.dispatch("media.ingest_file", &json!({"path": blob.display().to_string()}));
    let outcome = if ing["ok"] == true {
        let (hash, size) = (ing["result"]["hash"].as_str().unwrap_or_default().to_string(), ing["result"]["size"].clone());
        let reg = core_a.dispatch(
            "store.commit",
            &json!({"uow": {"ops": [{"op": "put", "collection": "media_object", "id": "m-1",
                "payload": {"id": "m-1", "contentHash": hash, "size": size, "mimeType": "application/octet-stream", "name": "blob.bin"},
                "proj": {"columns": {"content_hash": hash, "size": size, "mime": "application/octet-stream", "name": "blob.bin"}, "relations": {}}}]}}),
        );
        if reg["ok"] == true { Ok(ing["result"].clone()) } else { Err(reg.to_string()) }
    } else {
        Err(ing.to_string())
    };
    step("media", t, outcome);

    let t = Instant::now();
    let cc = core_a.dispatch("store.check_consistency", &json!({}));
    let clean = cc["ok"] == true && cc["result"]["quickCheckOk"] == true && cc["result"]["problems"].as_array().is_some_and(|p| p.is_empty());
    step("consistency", t, if clean { Ok(cc["result"].clone()) } else { Err(cc.to_string()) });

    let t = Instant::now();
    let archive = dir.join("backup.qsarchive");
    let bk = core_a.dispatch("backup.create", &json!({"dest": archive.display().to_string()}));
    step("backup.create", t, if bk["ok"] == true { Ok(bk["result"].clone()) } else { Err(bk.to_string()) });

    let t = Instant::now();
    let vf = core_a.dispatch("backup.verify", &json!({"path": archive.display().to_string()}));
    step("backup.verify", t, if vf["ok"] == true { Ok(vf["result"].clone()) } else { Err(vf.to_string()) });

    let t = Instant::now();
    let core_b = Core::open(&b, product_catalog(), &opts)?;
    let rs = core_b.dispatch("backup.restore", &json!({"path": archive.display().to_string()}));
    let same = core_a.with_store(|s| s.state_hash(false).ok()) == core_b.with_store(|s| s.state_hash(false).ok());
    step(
        "backup.restore",
        t,
        if rs["ok"] == true && same { Ok(rs["result"].clone()) } else { Err(format!("restore ok={} state-equal={same}: {rs}", rs["ok"])) },
    );

    Ok(json!({"ok": all_ok, "steps": steps, "appVersion": qs_platform::identity::APP_VERSION}))
}
