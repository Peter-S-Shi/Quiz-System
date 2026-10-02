//! spikectl: disposable harness CLI for H2-H6 (drives the same spike_core code the Tauri app uses).
use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};
use spike_core::activation::{self, Mode};
use spike_core::store::{self, OpenOpts, Store};
use spike_core::{archive, canon, ingest, mem, media};
use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn arg(a: &[String], k: &str) -> Option<String> {
    a.iter().position(|x| x == k).and_then(|i| a.get(i + 1)).cloned()
}
fn req(a: &[String], k: &str) -> Result<String> {
    arg(a, k).ok_or_else(|| anyhow!("missing {k}"))
}
fn open(root: &Path) -> Result<Store> {
    Store::open(root, &OpenOpts::default())
}
fn pct(v: &mut Vec<f64>, p: f64) -> f64 {
    if v.is_empty() {
        return 0.0;
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    v[((v.len() as f64 * p).ceil() as usize).clamp(1, v.len()) - 1]
}
fn out(v: Value) {
    println!("{}", serde_json::to_string(&v).unwrap());
}

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    if let Err(e) = run(&a) {
        eprintln!("ERROR: {e:#}");
        std::process::exit(1);
    }
}

fn run(a: &[String]) -> Result<()> {
    let cmd = a.first().map(|s| s.as_str()).unwrap_or("");
    match cmd {
        "gen-media" => {
            let o = PathBuf::from(req(a, "--out")?);
            out(ingest::gen_media_envelope(&o, arg(a, "--scale").map(|s| s.parse().unwrap()).unwrap_or(100))?);
        }
        "ingest-ndjson" => {
            let mut s = open(Path::new(&req(a, "--root")?))?;
            let (n, secs) = ingest::ingest_ndjson(&mut s, Path::new(&req(a, "--file")?), arg(a, "--batch").map(|x| x.parse().unwrap()).unwrap_or(100))?;
            out(json!({"records": n, "seconds": secs, "peakWorkingSetMiB": mem::peak_mib(), "stateHash": s.state_hash()?}));
        }
        "ingest-media" => {
            let root = PathBuf::from(req(a, "--root")?);
            let s = open(&root)?;
            let env = PathBuf::from(req(a, "--envelope")?);
            let t = Instant::now();
            let st = media::ingest_envelope(&root, &env)?;
            media::register(&s.conn, &st.metas)?;
            let manifest: Value = serde_json::from_slice(&fs::read(format!("{}.manifest.json", env.to_string_lossy()))?)?;
            let v = media::verify(&root, &s.conn, Some(&manifest))?;
            let hashes: BTreeSet<&String> = st.metas.iter().map(|m| &m.hash).collect();
            out(json!({"assets": st.assets, "bytesDecoded": st.bytes, "distinctFiles": hashes.len(), "dedupedFiles": st.deduped_files,
                       "seconds": t.elapsed().as_secs_f64(), "peakWorkingSetMiB": st.peak_mib, "verify": v}));
        }
        "link-media" => {
            // make media "referenced": responses that reference media ids (so the backup includes them)
            let mut s = open(Path::new(&req(a, "--root")?))?;
            let ids: Vec<String> = {
                let mut st = s.conn.prepare("SELECT id FROM media_object ORDER BY id")?;
                let v = st.query_map([], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
                v
            };
            for (k, chunk) in ids.chunks(10).enumerate() {
                let rid = format!("media-holder-{k}");
                let p = json!({"id": rid, "material": {"id": format!("mm-{k}"), "title": "holder"}, "finalizedAt": "2026-03-01T00:00:00.000Z", "responses": [], "mediaRefs": chunk});
                s.commit(&json!({"ops": [ingest::put_op("learner_response", &rid, p)?]}))?;
            }
            out(json!({"holders": ids.chunks(10).count(), "mediaObjects": ids.len()}));
        }
        "fidelity" => {
            let s = open(Path::new(&req(a, "--root")?))?;
            let js = arg(a, "--js");
            let r = ingest::fidelity_check(&s, Path::new(&req(a, "--file")?), js.as_deref().map(Path::new))?;
            out(r);
        }
        "fidelity-bignum" => {
            // Rust-side lossless numbers: values JS cannot even represent must survive the store unchanged.
            let mut s = open(Path::new(&req(a, "--root")?))?;
            let text = r#"{"id":"bignum-1","material":{"id":"m","title":"t"},"finalizedAt":"2026-01-01T00:00:00Z","responses":[],"mediaRefs":[],"big":12345678901234567890,"dec":0.10000000000000000555,"exp":1.5e-7,"neg0":-0.0,"unknownField":{"nested":[3,2,1,{"k":null}]}}"#;
            let v: Value = serde_json::from_str(text)?;
            s.commit(&json!({"ops": [ingest::put_op("learner_response", "bignum-1", v.clone())?]}))?;
            let stored: String = s.conn.query_row("SELECT payload FROM learner_response WHERE id='bignum-1'", [], |r| r.get(0))?;
            let back: Value = serde_json::from_str(&stored)?;
            out(json!({"canonicalEqual": canon::hash_value(&v) == canon::hash_value(&back), "bigPreserved": stored.contains("12345678901234567890"),
                       "decPreserved": stored.contains("0.10000000000000000555"), "storedBytesIdenticalToInput": stored == text}));
        }
        "h2-probes" => h2_probes(Path::new(&req(a, "--root")?))?,
        "bench-commit" => {
            let mut s = open(Path::new(&req(a, "--root")?))?;
            let n: i64 = arg(a, "--n").map(|x| x.parse().unwrap()).unwrap_or(2000);
            let start = s.count("uow_marker")? + 1_000_000;
            let mut lat = vec![];
            for i in 0..n {
                let uow = ingest::finalize_uow(start + i)?;
                let t = Instant::now();
                s.commit(&uow)?;
                lat.push(t.elapsed().as_secs_f64() * 1000.0);
            }
            out(json!({"n": n, "synchronous": "FULL", "p50ms": pct(&mut lat.clone(), 0.5), "p95ms": pct(&mut lat.clone(), 0.95), "p99ms": pct(&mut lat.clone(), 0.99), "maxMs": pct(&mut lat, 1.0)}));
        }
        "bench-history" => {
            let s = open(Path::new(&req(a, "--root")?))?;
            let iters: usize = arg(a, "--iters").map(|x| x.parse().unwrap()).unwrap_or(200);
            let limit: usize = arg(a, "--limit").map(|x| x.parse().unwrap()).unwrap_or(100000);
            let mut lat = vec![];
            let mut rows = 0;
            for _ in 0..iters {
                let t = Instant::now();
                let r = s.list_history(limit)?;
                let _ = serde_json::to_string(&r)?; // serialization cost as IPC would pay
                lat.push(t.elapsed().as_secs_f64() * 1000.0);
                rows = r.len();
            }
            out(json!({"rows": rows, "limit": limit, "iters": iters, "p50ms": pct(&mut lat.clone(), 0.5), "p95ms": pct(&mut lat.clone(), 0.95), "maxMs": pct(&mut lat, 1.0), "note": "includes JSON serialization, excludes IPC hop"}));
        }
        "crash-worker" => {
            let root = PathBuf::from(req(a, "--root")?);
            let ack = PathBuf::from(req(a, "--acklog")?);
            let mut n: i64 = req(a, "--start")?.parse()?;
            let mut s = open(&root)?;
            let mut f = File::options().create(true).append(true).open(&ack)?;
            loop {
                s.commit(&ingest::finalize_uow(n)?)?;
                writeln!(f, "ACK {n}")?;
                n += 1;
            }
        }
        "crash-loop" => crash_loop(a)?,
        "verify" => {
            let root = PathBuf::from(req(a, "--root")?);
            let s = open(&root)?;
            let rec = activation::recover(&s)?;
            out(json!({"quickCheck": s.quick_check()?, "consistency": s.check_consistency()?, "recovery": rec, "stateHash": s.state_hash()?,
                       "counts": {"learner_response": s.count("learner_response")?, "teacher_review": s.count("teacher_review")?, "media_object": s.count("media_object")?},
                       "notice": s.notice}));
        }
        "state-hash" => {
            let s = open(Path::new(&req(a, "--root")?))?;
            out(json!({"stateHash": s.state_hash()?}));
        }
        "build-staging" => {
            // build a staging DB (isolated, in its own root) from NDJSON; result path printed
            let root = PathBuf::from(req(a, "--root")?);
            let name = req(a, "--name")?;
            let sroot = root.join("staging").join(&name);
            let mut s = open(&sroot)?;
            let (n, secs) = ingest::ingest_ndjson(&mut s, Path::new(&req(a, "--file")?), 200)?;
            // media rows copied from live so staging validation can find files
            if arg(a, "--with-media").is_some() {
                let live = open(&root)?;
                let mut st = live.conn.prepare("SELECT id,content_hash,mime,name,size FROM media_object")?;
                let rows: Vec<media::MediaMeta> = st
                    .query_map([], |r| Ok(media::MediaMeta { id: r.get(0)?, hash: r.get(1)?, mime: r.get(2)?, name: r.get(3)?, declared_size: None, size: r.get::<_, i64>(4)? as u64 }))?
                    .collect::<std::result::Result<_, _>>()?;
                media::register(&s.conn, &rows)?;
            }
            let hash = s.state_hash()?;
            drop(s);
            let db = store::db_path(&sroot);
            {
                let c = rusqlite::Connection::open(&db)?;
                let _: i64 = c.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| r.get(0))?;
            }
            activation::normalize_staging(&db)?;
            out(json!({"staging": db.to_string_lossy(), "records": n, "seconds": secs, "stateHash": hash}));
        }
        "activate" => {
            let root = PathBuf::from(req(a, "--root")?);
            let mut s = open(&root)?;
            let rep = activation::activate(&mut s, Path::new(&req(a, "--staging")?), Mode::parse(&req(a, "--mode")?)?, &req(a, "--op")?)?;
            out(rep.to_json());
        }
        "rollback" => {
            let mut s = open(Path::new(&req(a, "--root")?))?;
            out(activation::rollback(&mut s, &req(a, "--op")?)?.to_json());
        }
        "recover" => {
            let s = open(Path::new(&req(a, "--root")?))?;
            out(json!({"resolved": activation::recover(&s)?}));
        }
        "gc" => {
            let root = PathBuf::from(req(a, "--root")?);
            let s = open(&root)?;
            let (d, k) = media::gc(&root, &s.conn, 0)?;
            out(json!({"deleted": d, "kept": k}));
        }
        "media-verify" => {
            let root = PathBuf::from(req(a, "--root")?);
            let s = open(&root)?;
            let r = media::verify(&root, &s.conn, None)?;
            let partial = media::assert_no_partial(&root).map(|_| json!([])).unwrap_or_else(|e| json!(e.to_string()));
            let temps = fs::read_dir(media::dir(&root))?.filter_map(|e| e.ok()).filter(|e| e.path().extension().map(|x| x == "tmp").unwrap_or(false)).count();
            out(json!({"verify": r, "finalFilesWithWrongHash": partial, "leftoverTemps": temps}));
        }
        "h3-matrix" => h3_matrix(a)?,
        "h4-faults" => h4_faults(a)?,
        "h3-visibility" => h3_visibility(a)?,
        "archive-create" => out(archive::create(Path::new(&req(a, "--root")?), Path::new(&req(a, "--out")?))?),
        "archive-restore" => {
            let mut s = open(Path::new(&req(a, "--root")?))?;
            out(archive::restore(&mut s, Path::new(&req(a, "--archive")?), Mode::parse(&req(a, "--mode")?)?, &req(a, "--op")?)?);
        }
        "h5-mutations" => h5_mutations(a)?,
        "writer-loop" => {
            // background writer used while an archive is being created
            let root = PathBuf::from(req(a, "--root")?);
            let mut s = open(&root)?;
            let mut n: i64 = 2_000_000;
            loop {
                s.commit(&ingest::finalize_uow(n)?)?;
                n += 1;
            }
        }
        other => bail!("unknown command {other:?}"),
    }
    Ok(())
}

// ---------------------------------------------------------------- H2 probes
fn h2_probes(root: &Path) -> Result<()> {
    let mut s = open(root)?;
    let mut results = vec![];
    // base data
    for i in 0..20 {
        let rid = format!("probe-r-{i}");
        let items: Vec<Value> = (0..5).map(|k| json!({"itemId": format!("{rid}-i{k}")})).collect();
        let p = json!({"id": rid, "material": {"id": "pm", "title": format!("T{i}")}, "finalizedAt": format!("2026-01-{:02}T00:00:00Z", i + 1), "responses": items, "mediaRefs": []});
        s.commit(&json!({"ops": [ingest::put_op("learner_response", &rid, p)?]}))?;
    }
    s.conn.execute("INSERT INTO media_object(id,content_hash,mime,name,size) VALUES('img-probe','00','image/png','x',1)", [])?;
    let base_hash = s.state_hash()?;

    let good = |rid: &str| -> Value {
        json!({"id": rid, "material": {"id": "pm", "title": "NEW"}, "finalizedAt": "2026-02-01T00:00:00Z", "responses": [{"itemId": "a"}, {"itemId": "b"}], "mediaRefs": []})
    };
    let mut bad_cases: Vec<(&str, Value)> = vec![];
    // 1 itemCount disagrees
    let mut op = ingest::put_op("learner_response", "probe-new", good("probe-new"))?;
    op["proj"]["itemCount"] = json!(3);
    bad_cases.push(("itemCount disagrees with payload", json!({"ops": [op]})));
    // 2 review responseId A vs B
    let mut op = ingest::put_op("teacher_review", "probe-t", json!({"id": "probe-t", "responseId": "probe-r-1"}))?;
    op["proj"]["responseId"] = json!("probe-r-2");
    bad_cases.push(("review payload responseId=A, projection=B", json!({"ops": [op]})));
    // 3 relationship rows missing
    let mut op = ingest::put_op("learner_response", "probe-new", good("probe-new"))?;
    op["proj"]["items"] = json!(["a"]);
    bad_cases.push(("relationship rows missing (items)", json!({"ops": [op]})));
    // 4 relationship rows extra
    let mut op = ingest::put_op("learner_response", "probe-new", good("probe-new"))?;
    op["proj"]["items"] = json!(["a", "b", "zz"]);
    bad_cases.push(("relationship rows extra (items)", json!({"ops": [op]})));
    // 5 payload changed without projection (update existing)
    let mut op = ingest::put_op("learner_response", "probe-r-3", json!({"id": "probe-r-3", "material": {"id": "pm", "title": "T3"}, "finalizedAt": "2026-01-04T00:00:00Z", "responses": [{"itemId": "probe-r-3-i0"}], "mediaRefs": []}))?;
    op["payload"]["material"]["title"] = json!("CHANGED-WITHOUT-PROJECTION");
    bad_cases.push(("payload changed without its projection", json!({"ops": [op]})));
    // 6 projection missing entirely
    let mut op = ingest::put_op("learner_response", "probe-new", good("probe-new"))?;
    op.as_object_mut().unwrap().remove("proj");
    bad_cases.push(("projection missing", json!({"ops": [op]})));
    // 7 mediaRefs in projection only
    let mut op = ingest::put_op("learner_response", "probe-new", good("probe-new"))?;
    op["proj"]["mediaRefs"] = json!(["img-probe"]);
    bad_cases.push(("media projection not in payload", json!({"ops": [op]})));
    // 8 array order differs
    let mut op = ingest::put_op("learner_response", "probe-new", good("probe-new"))?;
    op["proj"]["items"] = json!(["b", "a"]);
    bad_cases.push(("relationship array order differs", json!({"ops": [op]})));
    // 9 valid op followed by inconsistent op: nothing may be applied
    let valid = ingest::put_op("learner_response", "probe-valid-first", good("probe-valid-first"))?;
    let mut op = ingest::put_op("learner_response", "probe-new", good("probe-new"))?;
    op["proj"]["paperId"] = json!("other");
    bad_cases.push(("mixed UoW: valid op + inconsistent op (whole UoW must fail)", json!({"ops": [valid, op]})));
    // 10 title projection disagrees
    let mut op = ingest::put_op("learner_response", "probe-new", good("probe-new"))?;
    op["proj"]["title"] = json!("DIFFERENT");
    bad_cases.push(("title projection disagrees", json!({"ops": [op]})));
    // 11 remediation doc projection mismatch
    let mut op = ingest::put_op("remediation_doc", "probe-d", json!({"id": "probe-d", "sourceResponseId": "probe-r-1", "sourceReviewId": null}))?;
    op["proj"]["sourceResponseId"] = json!("probe-r-9");
    bad_cases.push(("remediation doc source projection mismatch", json!({"ops": [op]})));
    // 12 finalizedAt projection disagrees
    let mut op = ingest::put_op("learner_response", "probe-new", good("probe-new"))?;
    op["proj"]["finalizedAt"] = json!("1999-01-01T00:00:00Z");
    bad_cases.push(("finalizedAt projection disagrees", json!({"ops": [op]})));

    let mut rejected = 0;
    for (name, uow) in &bad_cases {
        let r = s.commit(uow);
        let h = s.state_hash()?;
        let unchanged = h == base_hash;
        let ok = r.is_err() && unchanged;
        if ok {
            rejected += 1;
        }
        results.push(json!({"case": name, "rejected": r.is_err(), "error": r.err().map(|e| format!("{e:#}")), "stateUnchanged": unchanged}));
    }
    let consistent_after = s.check_consistency()?;

    // FK probes
    let mut fk = vec![];
    let mut probe = |s: &mut Store, name: &str, uow: Value, expect_ok: bool| -> Result<()> {
        let before = s.state_hash()?;
        let r = s.commit(&uow);
        let after = s.state_hash()?;
        let pass = if expect_ok { r.is_ok() } else { r.is_err() && before == after };
        fk.push(json!({"case": name, "expected": if expect_ok {"accepted"} else {"rejected"}, "actual": if r.is_ok() {"accepted"} else {"rejected"}, "pass": pass, "error": r.err().map(|e| format!("{e:#}"))}));
        Ok(())
    };
    probe(&mut s, "orphan Teacher Review (responseId does not exist)", json!({"ops": [ingest::put_op("teacher_review", "fk-t1", json!({"id": "fk-t1", "responseId": "does-not-exist"}))?]}), false)?;
    probe(&mut s, "orphan live remediation reference (source response missing)", json!({"ops": [ingest::put_op("remediation_doc", "fk-d1", json!({"id": "fk-d1", "sourceResponseId": "does-not-exist"}))?]}), false)?;
    probe(&mut s, "remediation doc -> missing review", json!({"ops": [ingest::put_op("remediation_doc", "fk-d2", json!({"id": "fk-d2", "sourceResponseId": "probe-r-1", "sourceReviewId": "no-such-review"}))?]}), false)?;
    let mut mp = good("fk-m1");
    mp["mediaRefs"] = json!(["img-does-not-exist"]);
    probe(&mut s, "orphan media reference", json!({"ops": [ingest::put_op("learner_response", "fk-m1", mp)?]}), false)?;
    probe(&mut s, "add a Teacher Review for an existing response (valid)", json!({"ops": [ingest::put_op("teacher_review", "fk-t2", json!({"id": "fk-t2", "responseId": "probe-r-1"}))?]}), true)?;
    probe(&mut s, "  -> now delete that response (child review exists)", json!({"ops": [{"op": "delete", "collection": "learner_response", "id": "probe-r-1"}]}), false)?;
    probe(&mut s, "dangling SOFT provenance (history -> missing response)", json!({"ops": [ingest::put_op("history_entry", "fk-h1", json!({"id": "fk-h1", "responseId": "gone-response"}))?]}), true)?;
    let mut sp = good("fk-soft");
    sp["provenance"] = json!({"purpose": "retry", "sourceResponseId": "gone-response"});
    probe(&mut s, "dangling soft provenance inside payload (no projection, no FK)", json!({"ops": [ingest::put_op("learner_response", "fk-soft", sp)?]}), true)?;
    // order independence: child before parent in the same UoW
    probe(&mut s, "same-UoW child-before-parent (deferred FK)", json!({"ops": [
        ingest::put_op("teacher_review", "fk-t3", json!({"id": "fk-t3", "responseId": "fk-parent"}))?,
        ingest::put_op("learner_response", "fk-parent", good("fk-parent"))?]}), true)?;
    probe(&mut s, "precondition: id must not exist (exists)", json!({"preconditions": [{"kind": "absent", "collection": "learner_response", "id": "fk-parent"}], "ops": [ingest::put_op("learner_response", "fk-parent2", good("fk-parent2"))?]}), false)?;

    // out-of-band projection mutations: separate raw connection with FK off, on copies of the DB
    let mut oob = vec![];
    let mutations: Vec<(&str, &str)> = vec![
        ("UPDATE learner_response SET paper_id='tampered' WHERE id='probe-r-5'", "column paper_id"),
        ("UPDATE learner_response SET title='tampered' WHERE id='probe-r-5'", "column title"),
        ("UPDATE learner_response SET item_count=99 WHERE id='probe-r-5'", "column item_count"),
        ("DELETE FROM response_item WHERE response_id='probe-r-6' AND ord=0", "relationship row deleted"),
        ("INSERT INTO response_item(response_id,item_id,ord) VALUES('probe-r-6','extra-item',99)", "relationship row extra"),
        ("UPDATE response_item SET item_id='swapped' WHERE response_id='probe-r-6' AND ord=1", "relationship row altered"),
        ("UPDATE learner_response SET payload=json_set(payload,'$.material.title','payload-only-change') WHERE id='probe-r-7'", "payload changed, projection stale"),
        ("UPDATE learner_response SET payload=json_remove(payload,'$.responses[0]') WHERE id='probe-r-8'", "payload relationship removed, rows stale"),
        ("INSERT INTO teacher_review(id,response_id,payload) VALUES('oob-t','missing-parent','{\"responseId\":\"missing-parent\"}')", "orphan review (FK bypassed)"),
        ("UPDATE teacher_review SET response_id='probe-r-2' WHERE id='fk-t2'", "review column differs from payload"),
        ("INSERT INTO media_ref(owner_id,media_id) VALUES('probe-r-9','img-probe')", "media_ref row extra"),
    ];
    for (i, (sql, label)) in mutations.iter().enumerate() {
        let copy = root.join("staging").join(format!("oob-{i}.db"));
        s.snapshot_to(&copy)?;
        let c = rusqlite::Connection::open(&copy)?;
        c.execute_batch("PRAGMA foreign_keys=OFF")?;
        c.execute_batch(sql)?;
        let flagged = store::check_consistency_conn(&c)?;
        oob.push(json!({"mutation": label, "flagged": !flagged.is_empty(), "details": flagged}));
        drop(c);
        let _ = fs::remove_file(&copy);
    }
    let fk_pass = fk.iter().filter(|x| x["pass"] == json!(true)).count();
    let oob_flagged = oob.iter().filter(|x| x["flagged"] == json!(true)).count();
    out(json!({
        "driftCases": {"total": bad_cases.len(), "rejectedAtomically": rejected, "details": results},
        "consistentAfterDriftCases": consistent_after.is_empty(),
        "fkProbes": {"total": fk.len(), "pass": fk_pass, "details": fk},
        "outOfBandMutations": {"total": oob.len(), "flagged": oob_flagged, "details": oob},
    }));
    Ok(())
}

// ---------------------------------------------------------------- H2 crash loop
fn read_acks(p: &Path) -> BTreeSet<i64> {
    fs::read_to_string(p).unwrap_or_default().lines().filter_map(|l| l.strip_prefix("ACK ").and_then(|x| x.trim().parse().ok())).collect()
}

fn verify_crash(s: &Store, acked: &BTreeSet<i64>, full: bool) -> Result<(bool, Vec<String>, i64)> {
    let mut problems = vec![];
    if !s.quick_check()? {
        problems.push("quick_check not ok".to_string());
    }
    if full {
        problems.extend(s.check_consistency()?);
    }
    let markers: BTreeSet<i64> = {
        let mut st = s.conn.prepare("SELECT n FROM uow_marker WHERE n < 1000000")?;
        let v = st.query_map([], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
        v
    };
    for n in acked {
        if !markers.contains(n) {
            problems.push(format!("ACKED UoW {n} missing"));
        }
    }
    let miss: i64 = s.conn.query_row(
        "SELECT count(*) FROM uow_marker m WHERE m.n < 1000000 AND NOT ( \
           (SELECT count(*) FROM learner_response WHERE id = 'crash-r-' || m.n) = 1 \
       AND (SELECT count(*) FROM response_item WHERE response_id = 'crash-r-' || m.n) = 20 \
       AND (SELECT count(*) FROM teacher_review WHERE id = 'crash-t-' || m.n) = 1 \
       AND (SELECT count(*) FROM history_entry WHERE id = 'crash-h-' || m.n) = 1)",
        [],
        |r| r.get(0),
    )?;
    if miss > 0 {
        problems.push(format!("{miss} marker(s) without a complete UoW (partial)"));
    }
    // reverse: every crash-* row must have a marker
    let (lr, tr, he): (i64, i64, i64) = (
        s.conn.query_row("SELECT count(*) FROM learner_response WHERE id LIKE 'crash-r-%'", [], |r| r.get(0))?,
        s.conn.query_row("SELECT count(*) FROM teacher_review WHERE id LIKE 'crash-t-%'", [], |r| r.get(0))?,
        s.conn.query_row("SELECT count(*) FROM history_entry WHERE id LIKE 'crash-h-%'", [], |r| r.get(0))?,
    );
    let m = markers.len() as i64;
    if lr != m || tr != m || he != m {
        problems.push(format!("rows without marker (lr {lr}, tr {tr}, he {he}, markers {m})"));
    }
    Ok((problems.is_empty(), problems, markers.iter().next_back().copied().unwrap_or(0)))
}

fn crash_loop(a: &[String]) -> Result<()> {
    let root = PathBuf::from(req(a, "--root")?);
    let target: usize = arg(a, "--target-midloop").map(|x| x.parse().unwrap()).unwrap_or(500);
    let max_iters: usize = arg(a, "--max-iters").map(|x| x.parse().unwrap()).unwrap_or(target * 3);
    let (min_ms, max_ms): (u64, u64) = (arg(a, "--min-ms").map(|x| x.parse().unwrap()).unwrap_or(60), arg(a, "--max-ms").map(|x| x.parse().unwrap()).unwrap_or(500));
    let seed: u64 = arg(a, "--seed").map(|x| x.parse().unwrap()).unwrap_or(1);
    let logp = arg(a, "--log");
    let ack = root.join("logs").join("ack.log");
    drop(open(&root)?);
    let exe = std::env::current_exe()?;
    let mut rng = fastrand::Rng::with_seed(seed);
    let mut next_n = 1i64;
    let (mut mid, mut total, mut failures) = (0usize, 0usize, 0usize);
    let mut log = logp.map(|p| File::create(p)).transpose()?;
    let mut acked_per_run = vec![];
    while mid < target && total < max_iters {
        total += 1;
        let before = read_acks(&ack).len();
        let mut child = Command::new(&exe)
            .args(["crash-worker", "--root", root.to_str().unwrap(), "--acklog", ack.to_str().unwrap(), "--start", &next_n.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;
        std::thread::sleep(Duration::from_millis(rng.u64(min_ms..=max_ms)));
        let pid = child.id();
        let _ = Command::new("taskkill").args(["/F", "/PID", &pid.to_string()]).stdout(Stdio::null()).stderr(Stdio::null()).status();
        let _ = child.wait();
        let acks = read_acks(&ack);
        let this_run = acks.len() - before;
        if this_run > 0 {
            mid += 1;
        }
        acked_per_run.push(this_run as f64);
        let s = open(&root)?;
        let (ok, problems, max_marker) = verify_crash(&s, &acks, total % 50 == 0)?;
        if !ok {
            failures += 1;
        }
        next_n = max_marker.max(*acks.iter().next_back().unwrap_or(&0)) + 1;
        let line = json!({"iter": total, "ackedThisRun": this_run, "ackedTotal": acks.len(), "ok": ok, "problems": problems});
        if let Some(l) = log.as_mut() {
            writeln!(l, "{}", line)?;
        }
        if !ok {
            eprintln!("FAILURE iter {total}: {problems:?}");
        }
    }
    let s = open(&root)?;
    out(json!({"forcedKills": total, "killsWithAtLeastOneCommitInRun": mid, "failures": failures, "totalAckedUoW": read_acks(&ack).len(),
               "committedMarkers": s.count("uow_marker")?, "p50AckedPerRun": pct(&mut acked_per_run.clone(), 0.5), "maxAckedPerRun": pct(&mut acked_per_run, 1.0),
               "finalQuickCheck": s.quick_check()?, "finalConsistency": s.check_consistency()?.len()}));
    Ok(())
}

// ---------------------------------------------------------------- H3 matrix
fn copy_dir_files(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir_all(to)?;
    for e in fs::read_dir(from)? {
        let e = e?;
        let p = e.path();
        let dest = to.join(e.file_name());
        if p.is_dir() {
            copy_dir_files(&p, &dest)?;
        } else {
            fs::copy(&p, &dest)?;
        }
    }
    Ok(())
}

fn run_child(exe: &Path, args: &[&str], kill_at: Option<&str>) -> Result<(i32, String)> {
    let mut c = Command::new(exe);
    c.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(k) = kill_at {
        c.env("SPIKE_KILL_AT", k);
    }
    let o = c.output()?;
    Ok((o.status.code().unwrap_or(-1), String::from_utf8_lossy(&o.stdout).to_string()))
}

fn h3_matrix(a: &[String]) -> Result<()> {
    let work = PathBuf::from(req(a, "--work")?);
    let nd = req(a, "--ndjson")?; // staging dataset (10,000 responses)
    let live_n: usize = arg(a, "--live-n").map(|x| x.parse().unwrap()).unwrap_or(5000);
    let repeats: usize = arg(a, "--repeats").map(|x| x.parse().unwrap()).unwrap_or(3);
    let exe = std::env::current_exe()?;
    let ex = exe.to_str().unwrap();
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work)?;
    // base live fixtures
    let nd_live = work.join("live.ndjson");
    {
        let mut o = File::create(&nd_live)?;
        for (i, l) in fs::read_to_string(&nd)?.lines().enumerate() {
            if i >= live_n {
                break;
            }
            writeln!(o, "{l}")?;
        }
    }
    let base_merge = work.join("base-merge");
    let base_replace = work.join("base-replace");
    run_child(&exe, &["ingest-ndjson", "--root", base_merge.to_str().unwrap(), "--file", nd_live.to_str().unwrap()], None)?;
    drop(open(&base_replace)?);
    for r in [&base_merge, &base_replace] {
        let c = rusqlite::Connection::open(store::db_path(r))?;
        let _: i64 = c.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |x| x.get(0))?;
    }
    // staging DB at 10k (built once; copied per run)
    let (code, o) = run_child(&exe, &["build-staging", "--root", base_replace.to_str().unwrap(), "--name", "src", "--file", &nd], None)?;
    if code != 0 {
        bail!("build-staging failed: {o}");
    }
    let staging_src = store::db_path(&base_replace.join("staging").join("src"));
    let mut rows = vec![];
    let mut violations = 0;
    for mode in ["merge", "replace"] {
        let base = if mode == "merge" { &base_merge } else { &base_replace };
        for ckpt in spike_core::fault::CHECKPOINTS {
            for rep in 0..repeats {
                let live = work.join(format!("run-{mode}-{ckpt}-{rep}"));
                copy_dir_files(base, &live)?;
                let _ = fs::remove_dir_all(live.join("staging"));
                fs::create_dir_all(live.join("staging"))?;
                let stg = live.join("staging").join("stage.db");
                fs::copy(&staging_src, &stg)?;
                let pre = {
                    let s = open(&live)?;
                    s.state_hash()?
                };
                // expected post-state from an uninterrupted run on a twin
                let twin = work.join(format!("twin-{mode}-{ckpt}-{rep}"));
                copy_dir_files(base, &twin)?;
                fs::create_dir_all(twin.join("staging"))?;
                fs::copy(&staging_src, twin.join("staging").join("stage.db"))?;
                let (c, o) = run_child(&exe, &["activate", "--root", twin.to_str().unwrap(), "--staging", twin.join("staging").join("stage.db").to_str().unwrap(), "--mode", mode, "--op", "op1"], None)?;
                if c != 0 {
                    bail!("twin activation failed: {o}");
                }
                let rep_json: Value = serde_json::from_str(o.trim())?;
                let post = rep_json["postHash"].as_str().unwrap().to_string();
                let peak = rep_json["peakWorkingSetMiB"].as_f64().unwrap_or(0.0);
                let commit_ms = rep_json["commitMs"].as_u64().unwrap_or(0);
                let (state_after_kill, outcome, killed);
                if *ckpt == "during-rollback" || *ckpt == "during-media-gc" {
                    // complete activation first, then kill during rollback / gc
                    let (c, _) = run_child(&exe, &["activate", "--root", live.to_str().unwrap(), "--staging", stg.to_str().unwrap(), "--mode", mode, "--op", "op1"], None)?;
                    if c != 0 {
                        bail!("activation failed");
                    }
                    let (c, _) = if *ckpt == "during-rollback" {
                        run_child(&exe, &["rollback", "--root", live.to_str().unwrap(), "--op", "op1"], Some(ckpt))?
                    } else {
                        // make some unreferenced media garbage, then gc and die mid-way
                        let junk = media::path_for(&live, &"ab".repeat(32));
                        fs::create_dir_all(junk.parent().unwrap())?;
                        fs::write(&junk, b"junk")?;
                        let junk2 = media::path_for(&live, &format!("{}{}", "ab", "cd".repeat(31)));
                        fs::write(&junk2, b"junk2")?;
                        run_child(&exe, &["gc", "--root", live.to_str().unwrap()], Some(ckpt))?
                    };
                    killed = c == 99;
                } else {
                    let (c, _) = run_child(&exe, &["activate", "--root", live.to_str().unwrap(), "--staging", stg.to_str().unwrap(), "--mode", mode, "--op", "op1"], Some(ckpt))?;
                    killed = c == 99;
                }
                // relaunch: recovery + observation
                let s = open(&live)?;
                let resolved = activation::recover(&s)?;
                let h = s.state_hash()?;
                let qc = s.quick_check()?;
                let cons = s.check_consistency()?.len();
                state_after_kill = if h == pre { "pre" } else if h == post { "post" } else { "OTHER" };
                // for rollback checkpoint, the legal states are post-activation or pre
                let ok = (state_after_kill != "OTHER") && qc && cons == 0;
                let mut final_rollback_ok = true;
                if *ckpt == "during-rollback" {
                    // finish rollback via the same primitive, must be exactly pre
                    let mut s2 = s;
                    let _ = fs::remove_file(s2.root.join("journal").join("rb-op1.json"));
                    activation::rollback(&mut s2, "op1")?;
                    final_rollback_ok = s2.state_hash()? == pre;
                }
                outcome = if ok && final_rollback_ok { "PASS" } else { "FAIL" };
                if outcome == "FAIL" {
                    violations += 1;
                }
                rows.push(json!({"mode": mode, "checkpoint": ckpt, "repeat": rep, "killedByFault": killed, "stateAfterKill": state_after_kill,
                                 "quickCheck": qc, "consistencyProblems": cons, "journalResolution": resolved, "rollbackExactPre": final_rollback_ok,
                                 "result": outcome, "peakWorkingSetMiB_uninterrupted": peak, "commitMs_uninterrupted": commit_ms}));
                let _ = fs::remove_dir_all(&live);
                let _ = fs::remove_dir_all(&twin);
            }
        }
    }
    let by_state = |st: &str| rows.iter().filter(|r| r["stateAfterKill"] == json!(st)).count();
    out(json!({"runs": rows.len(), "violations": violations, "statePre": by_state("pre"), "statePost": by_state("post"), "stateOTHER": by_state("OTHER"),
               "killedByFaultCount": rows.iter().filter(|r| r["killedByFault"] == json!(true)).count(), "rows": rows}));
    Ok(())
}

// ---------------------------------------------------------------- H5 mutations
fn h5_mutations(a: &[String]) -> Result<()> {
    let work = PathBuf::from(req(a, "--work")?);
    let archive_path = PathBuf::from(req(a, "--archive")?);
    let fuzz_n: usize = arg(a, "--fuzz").map(|x| x.parse().unwrap()).unwrap_or(150);
    let orig = fs::read(&archive_path)?;
    let mut results = vec![];
    let live = work.join("live");
    let _ = fs::remove_dir_all(&live);
    // populate a live store whose state must remain untouched after every failed restore
    {
        let mut s = open(&live)?;
        s.commit(&ingest::finalize_uow(1)?)?;
    }
    let before = open(&live)?.state_hash()?;
    // reference: logical content of the untouched archive
    let good_hash = {
        let refroot = work.join("ref");
        let _ = fs::remove_dir_all(&refroot);
        let mut s = open(&refroot)?;
        archive::restore(&mut s, &archive_path, Mode::Replace, "ref")?;
        s.state_hash()?
    };
    // mode: 0 = must be rejected (live untouched); 1 = must restore with identical content; 2 = rejected OR identical content
    let mut case = |name: &str, bytes: Vec<u8>, mode: u8| -> Result<()> {
        let p = work.join("mut.zip");
        fs::write(&p, &bytes)?;
        let mut s = open(&live)?;
        let r = archive::restore(&mut s, &p, Mode::Replace, &format!("mut-{}", fastrand::u32(..)));
        let after = s.state_hash()?;
        let identical = r.is_ok() && after == good_hash;
        let ok = match mode {
            0 => r.is_err() && after == before,
            1 => identical,
            _ => (r.is_err() && after == before) || identical,
        };
        results.push(json!({"case": name, "rejected": r.is_err(), "acceptedWithIdenticalContent": identical, "diagnostic": r.as_ref().err().map(|e| format!("{e:#}").chars().take(160).collect::<String>()), "liveUntouched": after == before, "pass": ok}));
        // reset live to baseline if a legit restore replaced it
        if r.is_ok() {
            drop(s);
            let _ = fs::remove_dir_all(&live);
            let mut s = open(&live)?;
            s.commit(&ingest::finalize_uow(1)?)?;
        }
        Ok(())
    };
    // locate offsets of the stored db entry (first bytes after local header ~ 30+name)
    let mid = orig.len() / 2;
    let mut v = orig.clone();
    v[100] ^= 0x01;
    case("flip one byte inside DB entry", v, 0)?;
    let mut v = orig.clone();
    v[mid] ^= 0x80;
    case("flip one byte in the middle (media area)", v, 0)?;
    let mut v = orig.clone();
    let l = v.len();
    v[l - 40] ^= 0x01;
    case("flip one byte in central directory/manifest tail (reject or identical)", v, 2)?;
    case("truncate archive (drop last 1 KiB)", orig[..orig.len() - 1024].to_vec(), 0)?;
    case("truncate archive (half)", orig[..mid].to_vec(), 0)?;
    // drop a media entry / wrong schema: rebuild zip with edits
    {
        use std::io::Read;
        let mut za = zip::ZipArchive::new(File::open(&archive_path)?)?;
        let mut m = String::new();
        za.by_name("manifest.json")?.read_to_string(&mut m)?;
        let mv: Value = serde_json::from_str(&m)?;
        let rebuild = |mutate: &dyn Fn(&mut Value, &str) -> bool| -> Result<Vec<u8>> {
            let mut za = zip::ZipArchive::new(File::open(&archive_path)?)?;
            let mut mv = mv.clone();
            let names: Vec<String> = (0..za.len()).map(|i| za.by_index(i).unwrap().name().to_string()).collect();
            let mut buf = vec![];
            {
                let mut zw = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
                let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored).large_file(true);
                let mut dropped = false;
                for n in &names {
                    if n == "manifest.json" {
                        continue;
                    }
                    if mutate(&mut mv, n) {
                        dropped = true;
                        continue;
                    }
                    let mut data = vec![];
                    za.by_name(n)?.read_to_end(&mut data)?;
                    zw.start_file(n, opts)?;
                    zw.write_all(&data)?;
                }
                let _ = dropped;
                zw.start_file("manifest.json", opts)?;
                zw.write_all(serde_json::to_string(&mv)?.as_bytes())?;
                zw.finish()?;
            }
            Ok(buf)
        };
        let first_media = mv["files"].as_array().unwrap().iter().filter_map(|f| f["path"].as_str()).find(|p| p.starts_with("media/")).map(|s| s.to_string());
        if let Some(fm) = first_media {
            let fm2 = fm.clone();
            case("drop one media entry (manifest still lists it)", rebuild(&|_m, n| n == fm2)?, 0)?;
        }
        case("wrong storeSchemaVersion (newer)", rebuild(&|m, _| { m["storeSchemaVersion"] = json!(99); false })?, 0)?;
        case("wrong formatVersion", rebuild(&|m, _| { m["formatVersion"] = json!(7); false })?, 0)?;
        case("manifest hash for DB altered", rebuild(&|m, _| { m["files"][0]["sha256"] = json!("00".repeat(32)); false })?, 0)?;
        case("unlisted extra entry injected via manifest removal", rebuild(&|m, _| { let f = m["files"].as_array_mut().unwrap(); if f.len() > 1 { f.pop(); } false })?, 0)?;
        case("control: unmodified archive restores", orig.clone(), 1)?;
    }
    // random single-byte flip fuzz: either rejected, or restored content must equal the original
    let mut rng = fastrand::Rng::with_seed(7);
    let (mut rejected, mut accepted_equal, mut undetected) = (0, 0, 0);
    let good_hash = {
        let mut s = open(&live)?;
        archive::restore(&mut s, &archive_path, Mode::Replace, "fuzz-ref")?;
        s.state_hash()?
    };
    for _ in 0..fuzz_n {
        let mut v = orig.clone();
        let pos = rng.usize(0..v.len());
        v[pos] ^= 1 << rng.u32(0..8);
        let p = work.join("fuzz.zip");
        fs::write(&p, &v)?;
        let _ = fs::remove_dir_all(&live);
        let mut s = open(&live)?;
        match archive::restore(&mut s, &p, Mode::Replace, "fuzz") {
            Err(_) => rejected += 1,
            Ok(_) => {
                if s.state_hash()? == good_hash {
                    accepted_equal += 1; // benign: flipped byte did not alter any restored content (e.g. timestamp)
                } else {
                    undetected += 1;
                }
            }
        }
    }
    let pass = results.iter().filter(|r| r["pass"] == json!(true)).count();
    out(json!({"namedCases": {"total": results.len(), "pass": pass, "details": results},
               "fuzz": {"flips": fuzz_n, "rejected": rejected, "acceptedWithIdenticalContent": accepted_equal, "undetectedCorruption": undetected}}));
    Ok(())
}

#[allow(dead_code)]
fn _unused(_: &dyn Fn() -> Result<()>) -> Result<()> {
    Err(anyhow!("x")).context("y")
}

// ---------------------------------------------------------------- H4 faults
fn h4_faults(a: &[String]) -> Result<()> {
    use std::os::windows::fs::OpenOptionsExt;
    let work = PathBuf::from(req(a, "--work")?);
    let _ = fs::remove_dir_all(&work);
    let exe = std::env::current_exe()?;
    let mut res = serde_json::Map::new();
    // (1) crash during media write: only complete files may carry a final name; temps are discardable
    let env_small = work.join("small.json");
    fs::create_dir_all(&work)?;
    ingest::gen_media_envelope(&env_small, 12)?;
    let mut kills = vec![];
    for i in 0..5 {
        let root = work.join(format!("crash-{i}"));
        let mut c = Command::new(&exe);
        c.args(["ingest-media", "--root", root.to_str().unwrap(), "--envelope", env_small.to_str().unwrap()]).stdout(Stdio::null()).stderr(Stdio::null()).env("SPIKE_KILL_AT", "media-mid-write");
        let code = c.status()?.code().unwrap_or(-1);
        let s = open(&root)?;
        let partial = media::assert_no_partial(&root).is_ok();
        let temps_before = fs::read_dir(media::dir(&root))?.filter_map(|e| e.ok()).filter(|e| e.path().extension().map(|x| x == "tmp").unwrap_or(false)).count();
        let (deleted, _) = media::gc(&root, &s.conn, 0)?;
        let temps_after = fs::read_dir(media::dir(&root))?.filter_map(|e| e.ok()).filter(|e| e.path().extension().map(|x| x == "tmp").unwrap_or(false)).count();
        kills.push(json!({"exitCode": code, "noCorruptFinalFile": partial, "tempsLeft": temps_before, "gcRemoved": deleted, "tempsAfterGc": temps_after}));
    }
    res.insert("crashDuringWrite".into(), json!(kills));
    // (2) delayed rename: another handle without FILE_SHARE_DELETE blocks the rename for ~400 ms
    {
        let root = work.join("avdelay");
        fs::create_dir_all(media::dir(&root))?;
        let tmp = media::dir(&root).join("incoming-av.tmp");
        fs::write(&tmp, b"payload")?;
        let hash = canon::sha256_hex(b"payload");
        let hold = File::options().read(true).share_mode(1).open(&tmp)?;
        let t = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(400));
            drop(hold);
        });
        let t0 = Instant::now();
        let r = media::publish(&root, &tmp, &hash);
        t.join().ok();
        res.insert("delayedRename".into(), json!({"ok": r.is_ok(), "waitedMs": t0.elapsed().as_millis() as u64, "finalExists": media::path_for(&root, &hash).exists()}));
    }
    // (3) Unicode + very long (>260 char) path for the whole data root
    {
        let mut root = work.join("路径-中文-日本語-ünï");
        while root.to_string_lossy().len() < 330 {
            root = root.join("segment-with-long-name-0123456789");
        }
        let len = root.to_string_lossy().len();
        // media files go through Rust std (long-path safe); SQLite is probed separately
        let st = media::ingest_envelope(&root, &env_small)?;
        let mediapath_len = media::path_for(&root, &st.metas[0].hash).to_string_lossy().len();
        let all_present = st.metas.iter().all(|m| media::path_for(&root, &m.hash).exists());
        fs::create_dir_all(root.join("data"))?;
        let plain_ok = rusqlite::Connection::open(store::db_path(&root)).is_ok();
        let canon_root = fs::canonicalize(&root)?; // verbatim (\\?\) form
        let verbatim_ok = rusqlite::Connection::open(canon_root.join("data").join("probe.db")).is_ok();
        res.insert(
            "longUnicodePath".into(),
            json!({"dataRootChars": len, "longestMediaPathChars": mediapath_len, "mediaAssetsWritten": st.assets, "allMediaFilesPresent": all_present,
                   "sqliteOpensPlainLongPath": plain_ok, "sqliteOpensVerbatimPrefixedPath": verbatim_ok}),
        );
    }
    out(Value::Object(res));
    Ok(())
}


// ---------------------------------------------------------------- H3 visibility during activation
fn h3_visibility(a: &[String]) -> Result<()> {
    let base = PathBuf::from(req(a, "--base")?);
    let staging = PathBuf::from(req(a, "--staging")?);
    let mode = Mode::parse(&req(a, "--mode")?)?;
    let scratch = PathBuf::from(req(a, "--work")?);
    let _ = fs::remove_dir_all(&scratch);
    copy_dir_files(&base, &scratch)?;
    fs::create_dir_all(scratch.join("staging"))?;
    let stg = scratch.join("staging").join("stage.db");
    fs::copy(&staging, &stg)?;
    let mut s = open(&scratch)?;
    let pre_count = s.count("learner_response")?;
    let pre_tr = s.count("teacher_review")?;
    let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let stop2 = stop.clone();
    let dbp = store::db_path(&scratch);
    let reader = std::thread::spawn(move || -> Result<(BTreeSet<(i64, i64)>, u64)> {
        let c = rusqlite::Connection::open_with_flags(&dbp, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let (mut seen, mut polls) = (BTreeSet::new(), 0u64);
        while !stop2.load(std::sync::atomic::Ordering::Relaxed) {
            // both counts read in ONE statement => one snapshot
            let pair: (i64, i64) = c.query_row(
                "SELECT (SELECT count(*) FROM learner_response), (SELECT count(*) FROM teacher_review)",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            seen.insert(pair);
            polls += 1;
        }
        Ok((seen, polls))
    });
    std::thread::sleep(Duration::from_millis(100));
    let rep = activation::activate(&mut s, &stg, mode, "vis1")?;
    std::thread::sleep(Duration::from_millis(100));
    stop.store(true, std::sync::atomic::Ordering::Relaxed);
    let (seen, polls) = reader.join().map_err(|_| anyhow!("reader panicked"))??;
    let post = (s.count("learner_response")?, s.count("teacher_review")?);
    let pre = (pre_count, pre_tr);
    let only = seen.iter().all(|p| *p == pre || *p == post);
    out(json!({"mode": mode.name(), "polls": polls, "observedSnapshots": seen.iter().map(|p| json!([p.0, p.1])).collect::<Vec<_>>(), "pre": [pre.0, pre.1], "post": [post.0, post.1],
               "onlyPreOrPostObserved": only, "report": rep.to_json()}));
    Ok(())
}
