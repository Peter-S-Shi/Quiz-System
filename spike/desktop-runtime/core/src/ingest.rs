//! Synthetic-data ingest + generators (datasets are generated, never committed).
use crate::{canon, proj, store::Store};
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::Path;
use std::time::Instant;

pub fn put_op(collection: &str, id: &str, payload: Value) -> Result<Value> {
    let p = proj::extract(collection, &payload)?;
    Ok(json!({"op": "put", "collection": collection, "id": id, "payload": payload, "proj": p}))
}

/// NDJSON lines: {"collection","id","payload"}. Returns (records, seconds).
pub fn ingest_ndjson(store: &mut Store, path: &Path, batch: usize) -> Result<(usize, f64)> {
    let t = Instant::now();
    let f = BufReader::new(File::open(path)?);
    let mut ops: Vec<Value> = vec![];
    let mut n = 0;
    for line in f.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let v: Value = serde_json::from_str(&line)?;
        let coll = v["collection"].as_str().ok_or_else(|| anyhow!("collection"))?;
        let id = v["id"].as_str().ok_or_else(|| anyhow!("id"))?;
        ops.push(put_op(coll, id, v["payload"].clone())?);
        n += 1;
        if ops.len() >= batch {
            store.commit(&json!({"ops": std::mem::take(&mut ops)}))?;
        }
    }
    if !ops.is_empty() {
        store.commit(&json!({"ops": ops}))?;
    }
    Ok((n, t.elapsed().as_secs_f64()))
}

/// Round-trip fidelity: hash(payload in file) == hash(payload in DB), per record. Optionally also == JS-computed hash.
pub fn fidelity_check(store: &Store, ndjson: &Path, js_hashes: Option<&Path>) -> Result<Value> {
    let js: std::collections::HashMap<String, String> = match js_hashes {
        Some(p) => BufReader::new(File::open(p)?)
            .lines()
            .filter_map(|l| l.ok())
            .filter(|l| !l.trim().is_empty())
            .map(|l| {
                let v: Value = serde_json::from_str(&l).unwrap();
                (format!("{}/{}", v["collection"].as_str().unwrap(), v["id"].as_str().unwrap()), v["hash"].as_str().unwrap().to_string())
            })
            .collect(),
        None => Default::default(),
    };
    let (mut total, mut equal, mut js_checked, mut js_equal) = (0, 0, 0, 0);
    let mut diffs = vec![];
    for line in BufReader::new(File::open(ndjson)?).lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let v: Value = serde_json::from_str(&line)?;
        let coll = v["collection"].as_str().unwrap();
        let id = v["id"].as_str().unwrap();
        let before = canon::hash_value(&v["payload"]);
        let table = coll;
        let stored: Option<String> = store
            .conn
            .query_row(&format!("SELECT payload FROM {table} WHERE id=?1"), [id], |r| r.get(0))
            .ok();
        total += 1;
        match stored {
            Some(t) => {
                let after = canon::hash_text_json(&t)?;
                if after == before {
                    equal += 1;
                } else {
                    diffs.push(format!("{coll}/{id}"));
                }
                if let Some(jh) = js.get(&format!("{coll}/{id}")) {
                    js_checked += 1;
                    if *jh == before && *jh == after {
                        js_equal += 1;
                    } else {
                        diffs.push(format!("{coll}/{id}: JS hash differs"));
                    }
                }
            }
            None => diffs.push(format!("{coll}/{id}: missing")),
        }
    }
    Ok(json!({"records": total, "hashEqual": equal, "jsCrossChecked": js_checked, "jsEqual": js_equal, "diffs": diffs}))
}

/// The "finalize-style" Unit of Work for crash/latency tests: 1 Learner Response (20 items) + review + history + marker.
pub fn finalize_uow(n: i64) -> Result<Value> {
    let rid = format!("crash-r-{n}");
    let items: Vec<Value> = (0..20).map(|i| json!({"itemId": format!("{rid}-i{i}"), "answer": format!("synthetic answer {n}-{i}")})).collect();
    let resp = json!({
        "id": rid, "documentType": "quiz-studio.learner-response",
        "finalizedAt": format!("2026-02-{:02}T{:02}:{:02}:{:02}.000Z", 1 + (n % 27), (n / 3600) % 24, (n / 60) % 60, n % 60),
        "material": {"type": "translation-document", "id": format!("crash-m-{}", n % 97), "title": format!("Synthetic {n}")},
        "responses": items, "mediaRefs": []
    });
    Ok(json!({"ops": [
        put_op("learner_response", &rid, resp)?,
        put_op("teacher_review", &format!("crash-t-{n}"), json!({"id": format!("crash-t-{n}"), "responseId": rid, "itemReviews": []}))?,
        put_op("history_entry", &format!("crash-h-{n}"), json!({"id": format!("crash-h-{n}"), "responseId": rid, "kind": "finalize"}))?,
        put_op("uow_marker", &n.to_string(), json!({"n": n, "rows": 4}))?,
    ]}))
}

/// Streamed generator of a V1-shaped backup envelope with base64 media (≈300 MB of raw media).
/// Writes `<out>` and `<out>.manifest.json` (id -> sha256 of raw bytes) for byte-identity checks.
pub fn gen_media_envelope(out: &Path, scale_percent: u32) -> Result<Value> {
    let mut sizes: Vec<(String, usize, &str)> = vec![];
    let mb = 1024 * 1024usize;
    let big = [50, 40, 30, 25, 20, 20, 15, 15];
    for (i, m) in big.iter().enumerate() {
        sizes.push((format!("aud-big-{i}"), m * mb, "audio/mpeg"));
    }
    for i in 0..30 {
        sizes.push((format!("img-mid-{i}"), 2 * mb, "image/png"));
    }
    for i in 0..100 {
        sizes.push((format!("img-small-{i}"), 300 * 1024, "image/jpeg"));
    }
    let mut w = BufWriter::with_capacity(1 << 20, File::create(out)?);
    w.write_all(br#"{"schemaVersion":3,"documentType":"quiz-studio.library-backup","exportedAt":"2026-01-01T00:00:00.000Z","library":{"papers":[]},"history":[],"learnerResponses":[],"teacherReviews":[],"translationLibrary":{},"mediaAssets":["#)?;
    let mut manifest = serde_json::Map::new();
    let mut total = 0u64;
    let mut first = true;
    let mut dup_src: Option<(Vec<u8>, String)> = None;
    let long_name = "a_very_long_name_".repeat(20);
    let names = ["音频 ünï-cødé 😀.mp3", "plain.png", long_name.as_str()];
    let mut emit = |w: &mut BufWriter<File>, id: &str, mime: &str, name: &str, raw: &[u8], first: &mut bool| -> Result<String> {
        if !*first {
            w.write_all(b",")?;
        }
        *first = false;
        write!(w, "{{\"id\":{},\"mimeType\":{},\"name\":{},\"size\":{},\"data\":\"", json!(id), json!(mime), json!(name), raw.len())?;
        // chunked base64 (multiples of 3 bytes)
        for ch in raw.chunks(3 * 1024 * 256) {
            w.write_all(STANDARD.encode(ch).as_bytes())?;
        }
        w.write_all(b"\"}")?;
        Ok(hex::encode(Sha256::digest(raw)))
    };
    let mut rng = fastrand::Rng::with_seed(20260101);
    for (i, (id, size, mime)) in sizes.iter().enumerate() {
        let size = size * scale_percent as usize / 100;
        let mut raw = vec![0u8; size.max(16)];
        rng.fill(&mut raw);
        let name = names[i % names.len()];
        let h = emit(&mut w, id, mime, &format!("{i}-{name}"), &raw, &mut first)?;
        manifest.insert(id.clone(), json!(h));
        total += raw.len() as u64;
        if i == 0 {
            dup_src = Some((raw.clone(), h));
        }
    }
    // duplicate-content pair: same bytes as the first asset, different id (dedupe check)
    if let Some((raw, _)) = dup_src {
        let raw5 = &raw[..(5 * mb * scale_percent as usize / 100).max(16).min(raw.len())];
        let h = emit(&mut w, "img-dup-a", "image/png", "dup-a.png", raw5, &mut first)?;
        let h2 = emit(&mut w, "img-dup-b", "image/png", "dup-b.png", raw5, &mut first)?;
        manifest.insert("img-dup-a".into(), json!(h));
        manifest.insert("img-dup-b".into(), json!(h2));
        total += 2 * raw5.len() as u64;
    }
    w.write_all(b"]}")?;
    w.flush()?;
    let mp = format!("{}.manifest.json", out.to_string_lossy());
    std::fs::write(&mp, serde_json::to_vec(&Value::Object(manifest.clone()))?)?;
    Ok(json!({"assets": manifest.len(), "rawBytes": total, "envelopeBytes": std::fs::metadata(out)?.len()}))
}
