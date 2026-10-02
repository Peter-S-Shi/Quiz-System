//! Zero silent discard and lossless carry (ADR 0002 sections 7, 14, 16.2-3/4/5): every source entity and key is
//! accounted for; structured records equal their source value (unknown fields, path-like text, CJK/astral,
//! number forms); V1-unrecorded facts stay absent; and a verifier that would not notice a defect is useless,
//! so the mutation-kill suite sabotages the staged store and demands the verifier fails.

mod common;
use common::*;
use qs_migrate_v1::catalog::*;
use qs_store::canon;
use rusqlite::Connection;
use serde_json::{json, Value};

fn stored(e: &Env, coll: &str, id: &str) -> Value {
    e.host.with_store(|s| {
        let r = s.read(coll, &json!({"id": id})).unwrap();
        r[0].payload.clone()
    })
}

fn eq(a: &Value, b: &Value) -> bool {
    canon::canonical(a) == canon::canonical(b)
}

/// Add an unknown field (nested, with arrays and numbers) to every object-shaped entity and level.
fn sprinkle(v: &mut Value) {
    let unk = json!({"zz_unknown": {"nested": [1, {"deep": "x"}, 2.5], "flag": true}, "extensions": {"vendor": {"k": 1}}});
    let add = |t: &mut Value| {
        if let Some(o) = t.as_object_mut() {
            o.insert("zz_unknown".into(), unk["zz_unknown"].clone());
        }
    };
    add(v); // envelope
    add(&mut v["library"]);
    add(&mut v["translationLibrary"]);
    for p in v["library"]["papers"].as_array_mut().unwrap() {
        add(p);
        for q in p["questions"].as_array_mut().unwrap() {
            add(q);
            if let Some(opts) = q.get_mut("options").and_then(Value::as_array_mut) {
                opts.iter_mut().for_each(add);
            }
            if let Some(pairs) = q.get_mut("pairs").and_then(Value::as_array_mut) {
                pairs.iter_mut().for_each(add);
            }
        }
    }
    for r in v["learnerResponses"].as_array_mut().unwrap() {
        add(r);
        add(&mut r["material"]);
        add(&mut r["session"]);
        add(&mut r["summary"]);
        for x in r["responses"].as_array_mut().unwrap() {
            add(x);
        }
        if let Some(a) = r.get_mut("learnerAnnotations").and_then(Value::as_array_mut) {
            a.iter_mut().for_each(add);
        }
        for it in r["material"]["snapshot"]["items"].as_array_mut().unwrap() {
            add(it);
        }
        r["extensions"] = unk["extensions"].clone();
    }
    for t in v["teacherReviews"].as_array_mut().unwrap() {
        add(t);
        add(&mut t["reviewer"]);
        for ir in t["itemReviews"].as_array_mut().unwrap() {
            add(ir);
            if let Some(cs) = ir.get_mut("corrections").and_then(Value::as_array_mut) {
                cs.iter_mut().for_each(add);
            }
        }
    }
    for f in v["translationLibrary"]["folders"].as_array_mut().unwrap() {
        add(f);
    }
    for d in v["translationLibrary"]["documents"].as_array_mut().unwrap() {
        add(d);
        for it in d["items"].as_array_mut().unwrap() {
            add(it);
        }
    }
    for h in v["history"].as_array_mut().unwrap() {
        add(h);
    }
    for a in v["mediaAssets"].as_array_mut().unwrap() {
        add(a);
    }
}

#[test]
fn unknown_fields_at_every_level_and_path_like_text_round_trip_losslessly() {
    let e = env();
    let mut v = fixture("r-full.json");
    sprinkle(&mut v);
    // user text that merely looks like a path, plus CJK / astral / combining characters and number forms
    v["library"]["papers"][0]["title"] = json!(r"C:\Windows\System32 and /home/alice/file and \\server\share\doc");
    v["library"]["papers"][0]["description"] = json!("e\u{301} 猫 😀 \u{200d} \u{2028} tab\there");
    v["library"]["papers"][0]["questions"][2]["answers"] = json!(["a", "b", ""]);
    let src = e.source_json("v1.json", &v);
    let p = e.prepare(&src);
    assert!(!p.blocked, "{:?}", p.report["diagnostics"]);
    assert!(p.report["diagnostics"].as_array().unwrap().iter().any(|d| d["code"] == "MIG_UNKNOWN_FIELD_PRESERVED"));
    e.activate(&p);
    for (i, paper) in v["library"]["papers"].as_array().unwrap().iter().enumerate() {
        let got = stored(&e, PAPER, paper["id"].as_str().unwrap());
        assert!(eq(&got, paper), "paper {i} must equal its source value");
        assert!(got["zz_unknown"]["nested"][1]["deep"] == "x");
    }
    for r in v["learnerResponses"].as_array().unwrap() {
        assert!(eq(&stored(&e, LEARNER_RESPONSE, r["id"].as_str().unwrap()), r));
    }
    for t in v["teacherReviews"].as_array().unwrap() {
        assert!(eq(&stored(&e, TEACHER_REVIEW, t["id"].as_str().unwrap()), t));
    }
    for f in v["translationLibrary"]["folders"].as_array().unwrap() {
        assert!(eq(&stored(&e, FOLDER, f["id"].as_str().unwrap()), f));
    }
    for d in v["translationLibrary"]["documents"].as_array().unwrap() {
        assert!(eq(&stored(&e, DOCUMENT, d["id"].as_str().unwrap()), d));
    }
    assert!(!serde_json::to_string(&stored(&e, PAPER, "paper-a")).unwrap().contains("<path>"), "user text is never scrubbed");
    // keys outside any entity are preserved as residue (envelope, library, translation library)
    assert_eq!(e.count(RESIDUE), 3);
    let residue = stored(&e, RESIDUE, &format!("{}#/zz_unknown", p.source_id));
    assert!(eq(&residue["value"], &v["zz_unknown"]));
    // the origin of the category list and the order of entities are conserved facts
    let origin = stored(&e, ORIGIN, &format!("{}:paper:paper-b", p.source_id));
    assert_eq!(origin["sourcePointer"], "/library/papers/1");
    assert_eq!(origin["sourcePosition"], 1);
}

#[test]
fn array_order_and_empty_values_are_preserved_and_absent_is_never_turned_into_null_or_a_default() {
    let e = env();
    let mut v = fixture("r-full.json");
    v["library"]["papers"][0]["description"] = json!(""); // recorded empty
    v["library"]["papers"][0]["tags"] = json!([]);
    v["library"]["papers"][1].as_object_mut().unwrap().remove("updatedAt"); // absent
    v["library"]["papers"][1].as_object_mut().unwrap().remove("lastOpenedAt");
    v["teacherReviews"][1].as_object_mut().unwrap().remove("createdAt");
    v["learnerResponses"][1]["session"].as_object_mut().unwrap().remove("startedAt");
    e.import("v1.json", &v);
    let pa = stored(&e, PAPER, "paper-a");
    assert_eq!(pa["description"], "");
    assert_eq!(pa["tags"], json!([]));
    let pb = stored(&e, PAPER, "paper-b");
    assert!(pb.get("updatedAt").is_none() && pb.get("lastOpenedAt").is_none(), "absent stays absent (D-10): {pb}");
    assert!(stored(&e, TEACHER_REVIEW, "tr-2").get("createdAt").is_none());
    assert!(stored(&e, LEARNER_RESPONSE, "lr-obj-2")["session"].get("startedAt").is_none());
    // the projection columns are NULL, never a fabricated value
    let nulls: i64 = e.host.with_store(|s| {
        s.conn().query_row("SELECT count(*) FROM paper WHERE id='paper-b' AND updated_at IS NULL", [], |r| r.get(0)).unwrap()
    });
    assert_eq!(nulls, 1);
    // gaps are declared in the origin, so consumers can tell "V1 never recorded" from "recorded none"
    let origin = stored(
        &e,
        ORIGIN,
        &format!(
            "{}:paper:paper-b",
            e.host.with_store(|s| s
                .conn()
                .query_row("SELECT source_id FROM migration_origin LIMIT 1", [], |r| r.get::<_, String>(0))
                .unwrap())
        ),
    );
    let gaps = origin["gaps"].as_array().unwrap();
    assert!(gaps.contains(&json!("timestamp.absent:updatedAt")) && gaps.contains(&json!("timestamp.absent:lastOpenedAt")));
    assert!(!gaps.contains(&json!("timestamp.absent:createdAt")));
    // order of the source array of responses inside a record is part of the payload
    let r1 = stored(&e, LEARNER_RESPONSE, "lr-obj-1");
    let ids: Vec<&str> = r1["responses"].as_array().unwrap().iter().map(|x| x["itemId"].as_str().unwrap()).collect();
    assert_eq!(ids, ["q-single", "q-multi", "q-blank", "q-tf", "q-match"]);
}

#[test]
fn v1_unrecorded_facts_stay_unknown_and_v2_only_facts_are_never_created() {
    let e = env();
    e.import("v1.json", &fixture("r-full.json"));
    let obj = stored(&e, LEARNER_RESPONSE, "lr-obj-1");
    for k in ["feedbackMode", "retryLineage", "explanation", "typing", "dueAt", "schedule"] {
        assert!(obj.get(k).is_none(), "{k} must not be invented");
    }
    let origin = stored(
        &e,
        ORIGIN,
        &e.host.with_store(|s| {
            s.conn()
                .query_row("SELECT id FROM migration_origin WHERE collection_name='learner_response' AND record_id='lr-obj-1'", [], |r| {
                    r.get::<_, String>(0)
                })
                .unwrap()
        }),
    );
    let gaps: Vec<&str> = origin["gaps"].as_array().unwrap().iter().filter_map(Value::as_str).collect();
    for g in ["objective.feedback-mode", "objective.retry-lineage", "v2.answer-explanation", "v2.scheduling"] {
        assert!(gaps.contains(&g), "{g} missing from {gaps:?}");
    }
    let t = e.host.with_store(|s| {
        s.conn()
            .query_row("SELECT id FROM migration_origin WHERE collection_name='learner_response' AND record_id='lr-tr-retry'", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap()
    });
    let g2 = stored(&e, ORIGIN, &t);
    assert!(g2["gaps"].as_array().unwrap().contains(&json!("translation.item-lineage")), "no item-level retry lineage is guessed (D-7)");
    // the retry response keeps its response-level provenance verbatim, including the dangling source (M-7)
    let retry = stored(&e, LEARNER_RESPONSE, "lr-tr-retry");
    assert_eq!(retry["provenance"]["sourceResponseId"], "lr-gone");
    // no scheduling / recommendation / typing facts exist anywhere
    for c in ["setting", "recovery_session"] {
        assert_eq!(e.count(c), 0, "{c}");
    }
}

#[test]
fn offset_encoding_is_labeled_in_the_origin_of_anchor_bearing_migrated_records_only() {
    let e = env();
    let (p, _) = e.import("v1.json", &fixture("r-full.json"));
    let label = |coll: &str, id: &str| -> Value {
        let oid = format!("{}:{coll}:{id}", p.source_id);
        stored(&e, ORIGIN, &oid).get("offsetEncoding").cloned().unwrap_or(Value::Null)
    };
    assert_eq!(label(LEARNER_RESPONSE, "lr-tr-1"), "utf16-code-unit");
    assert_eq!(label(TEACHER_REVIEW, "tr-1"), "utf16-code-unit");
    assert_eq!(label(LEARNER_RESPONSE, "lr-obj-1"), Value::Null, "no anchors, no label");
    assert_eq!(label(TEACHER_REVIEW, "tr-2"), Value::Null);
    // the payload itself stays verbatim: no encoding field is injected (Human Gate H-3)
    assert!(stored(&e, LEARNER_RESPONSE, "lr-tr-1").get("offsetEncoding").is_none());
    // and the offsets are untouched UTF-16 indices into the answer (astral characters count 2)
    let r = stored(&e, LEARNER_RESPONSE, "lr-tr-1");
    let answer = r["responses"][0]["answer"].as_str().unwrap();
    let units: Vec<u16> = answer.encode_utf16().collect();
    for a in r["learnerAnnotations"].as_array().unwrap() {
        let (s, en) = (a["start"].as_u64().unwrap() as usize, a["end"].as_u64().unwrap() as usize);
        assert_eq!(String::from_utf16(&units[s..en]).unwrap(), a["text"].as_str().unwrap());
    }
}

// ------------------------------------------------------------------------------------ mutation-kill

fn staged_fixture(mut f: impl FnMut(&mut Value)) -> (Env, qs_migrate_v1::Prepared) {
    let e = env();
    let mut v = fixture("r-full.json");
    f(&mut v);
    let p = e.prepare(&e.source_json("v1.json", &v));
    assert!(!p.blocked, "{:?}", p.report["diagnostics"]);
    assert_eq!(p.reverify().unwrap(), Vec::<String>::new(), "the unmodified staging must verify clean");
    (e, p)
}

fn edit_payload(p: &qs_migrate_v1::Prepared, coll: &str, id: &str, f: impl FnOnce(&mut Value)) {
    let c = Connection::open(p.staging_db()).unwrap();
    let t: String = c.query_row(&format!("SELECT payload FROM {coll} WHERE id=?1"), [id], |r| r.get(0)).unwrap();
    let mut v: Value = serde_json::from_str(&t).unwrap();
    f(&mut v);
    c.execute(&format!("UPDATE {coll} SET payload=?1 WHERE id=?2"), [serde_json::to_string(&v).unwrap(), id.to_string()]).unwrap();
}

fn exec(p: &qs_migrate_v1::Prepared, sql: &str) {
    Connection::open(p.staging_db()).unwrap().execute_batch(sql).unwrap();
}

fn expect_failure(p: &qs_migrate_v1::Prepared, what: &str, tag: &str) {
    let bad = p.reverify().unwrap();
    assert!(!bad.is_empty(), "{what}: the verifier did not notice the defect");
    assert!(bad.iter().any(|b| b.starts_with(tag)), "{what}: expected a {tag} failure, got {:?}", &bad[..bad.len().min(4)]);
}

#[test]
fn the_verifier_catches_every_class_of_mapper_defect() {
    // drop a field
    let (_e, p) = staged_fixture(|_| {});
    edit_payload(&p, LEARNER_RESPONSE, "lr-obj-1", |v| {
        v["summary"].as_object_mut().unwrap().remove("percent");
    });
    expect_failure(&p, "dropped field", "C-2");

    // reorder an array
    let (_e, p) = staged_fixture(|_| {});
    edit_payload(&p, LEARNER_RESPONSE, "lr-obj-1", |v| v["responses"].as_array_mut().unwrap().reverse());
    expect_failure(&p, "reordered array", "C-2");

    // default a timestamp the source did not have
    let (_e, p) = staged_fixture(|v| {
        v["teacherReviews"][1].as_object_mut().unwrap().remove("createdAt");
    });
    edit_payload(&p, TEACHER_REVIEW, "tr-2", |v| v["createdAt"] = json!("2030-01-01T00:00:00.000Z"));
    expect_failure(&p, "defaulted timestamp", "C-2");

    // turn an absent field into null
    let (_e, p) = staged_fixture(|v| {
        v["library"]["papers"][1].as_object_mut().unwrap().remove("updatedAt");
    });
    edit_payload(&p, PAPER, "paper-b", |v| v["updatedAt"] = Value::Null);
    expect_failure(&p, "absent -> null", "C-2");

    // rewrite a string
    let (_e, p) = staged_fixture(|_| {});
    edit_payload(&p, PAPER, "paper-a", |v| v["title"] = json!("Rewritten"));
    expect_failure(&p, "rewritten string", "C-2");

    // drop an unknown key
    let (_e, p) = staged_fixture(|v| {
        v["library"]["papers"][0]["zz_unknown"] = json!({"a": 1});
    });
    edit_payload(&p, PAPER, "paper-a", |v| {
        v.as_object_mut().unwrap().remove("zz_unknown");
    });
    expect_failure(&p, "dropped unknown key", "C-2");

    // lose a record (as if two ids had been merged)
    let (_e, p) = staged_fixture(|_| {});
    exec(&p, "DELETE FROM paper_media WHERE paper_id='paper-b'; DELETE FROM paper WHERE id='paper-b';");
    expect_failure(&p, "missing record", "C-2");

    // skip an origin row
    let (_e, p) = staged_fixture(|_| {});
    exec(&p, "DELETE FROM migration_origin WHERE record_id='lr-obj-2'");
    expect_failure(&p, "missing origin", "C-7");

    // wrong source position (order not conserved)
    let (_e, p) = staged_fixture(|_| {});
    let c = Connection::open(p.staging_db()).unwrap();
    let id: String = c.query_row("SELECT id FROM migration_origin WHERE record_id='paper-b'", [], |r| r.get(0)).unwrap();
    drop(c);
    edit_payload(&p, ORIGIN, &id, |v| v["sourcePosition"] = json!(7));
    expect_failure(&p, "origin position", "C-3");

    // history role that does not recompute
    let (_e, p) = staged_fixture(|_| {});
    let c = Connection::open(p.staging_db()).unwrap();
    let hid: String = c.query_row("SELECT id FROM legacy_history_entry WHERE role='twin' LIMIT 1", [], |r| r.get(0)).unwrap();
    drop(c);
    edit_payload(&p, HISTORY, &hid, |v| v["role"] = json!("legacy-only"));
    exec(&p, &format!("UPDATE legacy_history_entry SET role='legacy-only', twin_response_id=NULL WHERE id='{hid}'"));
    edit_payload(&p, HISTORY, &hid, |v| {
        v.as_object_mut().unwrap().remove("twinResponseId");
    });
    expect_failure(&p, "history role", "C-6");

    // a media record whose hash is not the hash of the decoded bytes
    let (_e, p) = staged_fixture(|_| {});
    edit_payload(&p, "media_object", "img-1", |v| v["contentHash"] = json!("0".repeat(64)));
    exec(&p, &format!("UPDATE media_object SET content_hash='{}' WHERE id='img-1'", "0".repeat(64)));
    expect_failure(&p, "media hash", "C-4");

    // base64 left inside a payload
    let (_e, p) = staged_fixture(|_| {});
    edit_payload(&p, "media_object", "aud-1", |v| v["data"] = json!("AAAA"));
    expect_failure(&p, "base64 in payload", "C-4");

    // a V2-only / scheduling fact created by the migration
    let (_e, p) = staged_fixture(|_| {});
    exec(&p, "INSERT INTO setting(id,rev,payload) VALUES('dueAt',1,'{}')");
    expect_failure(&p, "scheduling row", "C-8");

    // remediation provenance that no longer resolves inside the store (no database foreign key can express it)
    let (_e, p) = staged_fixture(|_| {});
    edit_payload(&p, DOCUMENT, "doc-remed", |v| v["provenance"]["sourceReviewId"] = json!("nope"));
    expect_failure(&p, "dangling remediation provenance", "C-12");

    // the staged source copy gains an entity nobody dispositioned (zero silent discard in the other direction)
    let (_e, p) = staged_fixture(|_| {});
    let copy = p.staging_dir().join("source.bin");
    let mut v: Value = serde_json::from_slice(&std::fs::read(&copy).unwrap()).unwrap();
    v["history"].as_array_mut().unwrap().push(json!({"id": "sneaky", "paperId": "x"}));
    std::fs::write(&copy, serde_json::to_vec(&v).unwrap()).unwrap();
    expect_failure(&p, "undispositioned source entity", "C-1");
}

#[test]
fn the_ledger_accounts_for_every_entity_and_key_exactly_once() {
    let (_e, p) = staged_fixture(|v| {
        v["zz_envelope"] = json!(1);
        v["library"]["zz_lib"] = json!([1]);
    });
    let ledger = p.ledger_json();
    let arr = ledger.as_array().unwrap();
    let pointers: Vec<&str> = arr.iter().map(|x| x["pointer"].as_str().unwrap()).collect();
    let unique: std::collections::BTreeSet<&&str> = pointers.iter().collect();
    assert_eq!(unique.len(), pointers.len(), "no entity has two dispositions");
    for must in
        ["/zz_envelope", "/library/zz_lib", "/library/categories", "/library/papers/0", "/history/2", "/mediaAssets/2", "/teacherReviews/2"]
    {
        assert!(pointers.contains(&must), "{must} has no disposition");
    }
    // counts reconcile (C-5): source = carried + deduplicated + collapsed + reported-unmigrated, nothing blocked
    for (_, c) in p.report["counts"].as_object().unwrap() {
        let n = |k: &str| c[k].as_u64().unwrap_or(0);
        assert_eq!(n("source"), n("carried") + n("deduplicatedIdentical") + n("collapsed") + n("reportedUnmigrated"));
        assert_eq!(n("blocked"), 0);
    }
}
