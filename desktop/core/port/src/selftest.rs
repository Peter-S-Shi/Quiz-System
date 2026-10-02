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

/// The catalog the product ships: the foundation's structural collections plus the V1 migration domain schema.
pub fn product_catalog() -> Arc<Catalog> {
    Arc::new(qs_task_domains::product_catalog())
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
        if reg["ok"] == true {
            Ok(ing["result"].clone())
        } else {
            Err(reg.to_string())
        }
    } else {
        Err(ing.to_string())
    };
    step("media", t, outcome);

    let t = Instant::now();
    let cc = core_a.dispatch("store.check_consistency", &json!({}));
    let clean =
        cc["ok"] == true && cc["result"]["quickCheckOk"] == true && cc["result"]["problems"].as_array().is_some_and(|p| p.is_empty());
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

    // the V1 migration closes the loop in the shipped binary too: preview -> confirm -> additive activation -> undo
    let t = Instant::now();
    let backup = dir.join("v1-backup.json");
    std::fs::write(&backup, SYNTHETIC_V1_BACKUP)?;
    let core_c = Core::open(&DataRoot::at(dir.join("data-c")), product_catalog(), &opts)?;
    let prep = core_c.dispatch("migration.prepare", &json!({"source": backup.display().to_string()}));
    let outcome = (|| -> std::result::Result<Value, String> {
        if prep["ok"] != true || prep["result"]["blocked"] != false {
            return Err(prep.to_string());
        }
        let hash = prep["result"]["reportHash"].as_str().unwrap_or_default().to_string();
        let done = core_c.dispatch("migration.confirm", &json!({"reportHash": hash}));
        if done["ok"] != true || done["result"]["result"] != "done" || core_c.with_store(|s| s.count("paper").ok()) != Some(1) {
            return Err(done.to_string());
        }
        let run = done["result"]["runOpId"].as_str().unwrap_or_default().to_string();
        let undo = core_c.dispatch("migration.undo", &json!({"runOpId": run}));
        if undo["ok"] != true || undo["result"]["result"] != "done" || core_c.with_store(|s| s.count("paper").ok()) != Some(0) {
            return Err(undo.to_string());
        }
        Ok(json!({"imported": 1, "undone": true}))
    })();
    step("migration", t, outcome);

    // Learning Orchestration (ADR 0003): the shipped store is schema 4 (Typing, ADR 0004) and the database itself refuses a second
    // active schedule in a slot
    let t = Instant::now();
    let schedule = |id: &str| {
        let payload = json!({"schemaVersion": 1, "id": id,
            "slot": {"domain": "objective", "material": {"type": "quiz-paper", "id": "paper-selftest"}, "intent": "practice"},
            "owner": "user", "status": "active", "cadence": {"kind": "once"}, "segments": [{"anchor": "2099-01-01"}],
            "createdAt": "2026-10-02T00:00:00Z", "updatedAt": "2026-10-02T00:00:00Z"});
        json!({"uow": {"ops": [{"op": "put", "collection": "schedule", "id": id, "payload": payload,
            "proj": {"columns": {"domain": "objective", "material_type": "quiz-paper", "material_id": "paper-selftest",
                                 "intent": "practice", "owner": "user", "status": "active"}, "relations": {}}}]}})
    };
    let outcome = (|| -> std::result::Result<Value, String> {
        let info = core_c.dispatch("schema.info", &json!({}));
        if info["result"]["store"]["userVersion"] != 4 {
            return Err(format!("expected store schema 4: {}", info["result"]["store"]));
        }
        let first = core_c.dispatch("store.commit", &schedule("s-selftest-1"));
        if first["ok"] != true {
            return Err(first.to_string());
        }
        let second = core_c.dispatch("store.commit", &schedule("s-selftest-2"));
        if second["ok"] == true || second["error"]["code"] != "REJECT_CONSTRAINT" {
            return Err(format!("a second active schedule in the slot must be rejected by the database: {second}"));
        }
        Ok(json!({"storeSchema": 4, "singleActiveSchedule": true}))
    })();
    step("scheduling", t, outcome);

    Ok(json!({"ok": all_ok, "steps": steps, "appVersion": qs_platform::identity::APP_VERSION}))
}

/// A minimal synthetic V1 full backup (one paper, one question) for the self-test.
const SYNTHETIC_V1_BACKUP: &str = r#"{"schemaVersion":1,"documentType":"quiz-studio.library-backup","exportedAt":"2025-04-01T12:00:00.000Z",
"library":{"schemaVersion":1,"papers":[{"schemaVersion":1,"id":"paper-selftest","title":"Self-test paper","description":"","category":"","tags":[],
"createdAt":"2025-03-01T09:00:00.000Z","updatedAt":"2025-03-01T09:00:00.000Z","lastOpenedAt":"2025-03-01T09:00:00.000Z",
"questions":[{"id":"q1","type":"truefalse","prompt":"Synthetic?","answer":true}]}],"categories":[]},
"history":[],"learnerResponses":[],"teacherReviews":[],"translationLibrary":{"schemaVersion":1,"folders":[],"documents":[]},"mediaAssets":[]}"#;
