//! The conservation verifier (ADR 0002 section 14.2). It does **not** call the mapper: it re-walks the source
//! tree and re-reads the stored rows, and proves C-1 (zero silent discard: every entity and key has exactly one
//! disposition), C-2 (structured records equal their source value), C-3 (order), C-4 (media: byte identity,
//! metadata, references), C-5 (counts), C-6 (history roles recompute), C-7 (provenance bijection and gaps),
//! C-8 (no V2-only rows), C-9 (store consistency). C-10/C-11 are checked by the engine that owns the files.

use crate::catalog::*;
use crate::model::{self, BACKUP_TYPE};
use crate::reader::MediaBlob;
use crate::stage::{LedgerEntry, MAPPING_VERSION, OFFSET_ENCODING};
use qs_store::foundation::MEDIA_COLLECTION;
use qs_store::{canon, Catalog};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

pub struct VerifyInput<'a> {
    pub conn: &'a Connection,
    pub catalog: &'a Catalog,
    pub root: &'a Value,
    pub blobs: &'a [MediaBlob],
    pub ledger: &'a [LedgerEntry],
    pub source_id: &'a str,
    /// Only origin rows of this run (live verification); `None` = all (staging).
    pub run_op_id: Option<&'a str>,
    /// Where the bytes of a content hash currently live (staging temp before publish, media store after).
    pub blob_file: &'a dyn Fn(&str) -> Option<PathBuf>,
    pub envelope: &'a Value,
    /// Staging-only checks (C-8).
    pub staging: bool,
}

const ENVELOPE_KEYS: &[&str] = &[
    "schemaVersion",
    "documentType",
    "exportedAt",
    "library",
    "history",
    "learnerResponses",
    "teacherReviews",
    "translationLibrary",
    "mediaAssets",
    "assets",
];
const LIBRARY_KEYS: &[&str] = &["schemaVersion", "papers", "categories"];
const TLIB_KEYS: &[&str] = &["schemaVersion", "folders", "documents"];

fn row_payload(conn: &Connection, collection: &str, id: &str) -> Option<Value> {
    let t: String = conn.query_row(&format!("SELECT payload FROM {collection} WHERE id=?1"), [id], |r| r.get(0)).ok()?;
    serde_json::from_str(&t).ok()
}

fn eq(a: &Value, b: &Value) -> bool {
    canon::canonical(a) == canon::canonical(b)
}

fn walk_arrays(root: &Value) -> Vec<(String, &'static str)> {
    let mut out = vec![];
    let mut arr = |ptr: &str, kind: &'static str| {
        if let Some(Value::Array(a)) = root.pointer(ptr) {
            for i in 0..a.len() {
                out.push((format!("{ptr}/{i}"), kind));
            }
        }
    };
    arr("/library/papers", "paper");
    arr("/learnerResponses", "learner_response");
    arr("/teacherReviews", "teacher_review");
    arr("/translationLibrary/folders", "translation_folder");
    arr("/translationLibrary/documents", "translation_document");
    arr("/history", "legacy_history_entry");
    arr("/mediaAssets", "media_object");
    arr("/assets", "media_object");
    out
}

fn kind_family(k: &str) -> &str {
    if k.starts_with("learner_response") {
        "learner_response"
    } else {
        k
    }
}

fn expected_fixed_gaps(kind: &str, has_provenance: bool) -> Vec<&'static str> {
    match kind {
        "paper" => vec!["v2.answer-explanation"],
        "learner_response.objective" => {
            vec!["objective.feedback-mode", "objective.retry-lineage", "v2.answer-explanation", "v2.scheduling"]
        }
        "learner_response.translation" => vec!["translation.item-lineage", "v2.typing", "v2.scheduling"],
        "translation_document" => {
            let mut v = vec!["v2.typing", "v2.scheduling"];
            if has_provenance {
                v.push("translation.item-lineage");
            }
            v
        }
        "media_object" => vec!["media.created-at"],
        _ => vec![],
    }
}

fn ts_fields(kind: &str) -> &'static [&'static str] {
    match kind {
        "paper" => &["createdAt", "updatedAt", "lastOpenedAt"],
        k if k.starts_with("learner_response") => &["finalizedAt", "session.startedAt", "session.completedAt"],
        "teacher_review" => &["createdAt"],
        "translation_folder" | "translation_document" => &["createdAt", "updatedAt"],
        "legacy_history_entry" => &["completedAt"],
        _ => &[],
    }
}

pub fn verify(i: &VerifyInput) -> Vec<String> {
    let mut bad: Vec<String> = vec![];
    let root = i.root;

    // ---- C-1: every source entity and key has exactly one disposition
    let mut by_ptr: BTreeMap<&str, Vec<&LedgerEntry>> = BTreeMap::new();
    for e in i.ledger {
        by_ptr.entry(e.pointer.as_str()).or_default().push(e);
    }
    let expected = walk_arrays(root);
    let expected_ptrs: BTreeSet<&str> = expected.iter().map(|(p, _)| p.as_str()).collect();
    for (p, kind) in &expected {
        match by_ptr.get(p.as_str()) {
            None => bad.push(format!("C-1: source entity {p} ({kind}) has no disposition")),
            Some(v) if v.len() != 1 => bad.push(format!("C-1: source entity {p} has {} dispositions", v.len())),
            Some(v) => {
                if kind_family(&v[0].kind) != *kind {
                    bad.push(format!("C-1: {p} was ledgered as {} but is a {kind}", v[0].kind));
                }
            }
        }
    }
    let obj = root.as_object().cloned().unwrap_or_default();
    let mut key_ptrs: Vec<String> = vec![];
    for k in obj.keys().filter(|k| !ENVELOPE_KEYS.contains(&k.as_str())) {
        key_ptrs.push(format!("/{}", crate::diag::esc(k)));
    }
    for (parent, known) in [("/library", LIBRARY_KEYS), ("/translationLibrary", TLIB_KEYS)] {
        if let Some(Value::Object(o)) = root.pointer(parent) {
            for k in o.keys().filter(|k| !known.contains(&k.as_str())) {
                key_ptrs.push(format!("{parent}/{}", crate::diag::esc(k)));
            }
        }
    }
    if root.pointer("/library/categories").is_some() {
        key_ptrs.push("/library/categories".into());
    }
    for p in &key_ptrs {
        if by_ptr.get(p.as_str()).map(|v| v.len()) != Some(1) {
            bad.push(format!("C-1: source key {p} is not accounted for exactly once"));
        }
    }
    let key_set: BTreeSet<&str> = key_ptrs.iter().map(String::as_str).collect();
    for p in by_ptr.keys() {
        if !expected_ptrs.contains(p) && !key_set.contains(p) {
            bad.push(format!("C-1: ledger entry {p} does not correspond to anything in the source"));
        }
    }
    // envelope facts (carried in the run record) equal the source
    let mut env_expect = serde_json::Map::new();
    for k in ["schemaVersion", "documentType", "exportedAt"] {
        if let Some(v) = obj.get(k) {
            env_expect.insert(k.into(), v.clone());
        }
    }
    for (k, p) in [("library", "/library/schemaVersion"), ("translationLibrary", "/translationLibrary/schemaVersion")] {
        if let Some(Value::Object(_)) = root.get(k) {
            let mut m = serde_json::Map::new();
            if let Some(v) = root.pointer(p) {
                m.insert("schemaVersion".into(), v.clone());
            }
            env_expect.insert(k.into(), Value::Object(m));
        }
    }
    if !eq(i.envelope, &Value::Object(env_expect)) {
        bad.push("C-1: the envelope facts carried in the run record differ from the source".into());
    }
    if obj.get("documentType").is_some_and(|d| d != &json!(BACKUP_TYPE)) {
        bad.push("C-1: source documentType is not a library backup".into());
    }

    // ---- per entry: C-2 / C-3 / C-4 / C-7
    let mut origin_expected = 0usize;
    let mut blob_by_pos: BTreeMap<(String, usize), &MediaBlob> = BTreeMap::new();
    for b in i.blobs {
        blob_by_pos.insert((b.list_key.clone(), b.index), b);
    }
    for e in i.ledger {
        match e.disposition.as_str() {
            "carried" | "deduplicated-identical" => {}
            "collapsed-duplicate" | "reported-unmigrated" | "structural" => continue,
            other => {
                bad.push(format!("C-5: entry {} has disposition {other}", e.pointer));
                continue;
            }
        }
        origin_expected += 1;
        let (Some(coll), Some(id)) = (e.collection.as_deref(), e.id.as_deref()) else {
            bad.push(format!("C-1: entry {} has no target", e.pointer));
            continue;
        };
        let Some(stored) = row_payload(i.conn, coll, id) else {
            bad.push(format!("C-2: {coll}/{id} (from {}) is missing from the store", e.pointer));
            continue;
        };
        let src = root.pointer(&e.pointer);
        let Some(src) = src else {
            bad.push(format!("C-1: {} does not exist in the source", e.pointer));
            continue;
        };
        let stored_hash = canon::hash_hex(&stored);
        match e.kind.as_str() {
            "library_categories" => {
                if stored.get("categories").map(|c| !eq(c, src)).unwrap_or(true) {
                    bad.push(format!("C-2: categories differ from the source ({})", e.pointer));
                }
            }
            "legacy_residue" => {
                let want = json!({"pointer": e.pointer, "value": src});
                if !eq(&stored, &want) {
                    bad.push(format!("C-2: residue {} differs from the source", e.pointer));
                }
            }
            "legacy_history_entry" => {
                if stored.get("entry").map(|x| !eq(x, src)).unwrap_or(true) {
                    bad.push(format!("C-2: history entry {} differs from the source", e.pointer));
                }
            }
            "media_object" => {
                let mut want = src.as_object().cloned().unwrap_or_default();
                want.remove("data");
                let mut have = stored.as_object().cloned().unwrap_or_default();
                let hash = have.remove("contentHash");
                if !eq(&Value::Object(want), &Value::Object(have)) {
                    bad.push(format!("C-4: media {id} metadata differs from the source asset"));
                }
                if stored.get("data").is_some() {
                    bad.push(format!("C-4: media {id} payload still carries base64 data"));
                }
                let list_key = if e.pointer.starts_with("/assets/") { "assets" } else { "mediaAssets" };
                let pos: usize = e.pointer.rsplit('/').next().and_then(|x| x.parse().ok()).unwrap_or(usize::MAX);
                match (blob_by_pos.get(&(list_key.to_string(), pos)), hash.as_ref().and_then(Value::as_str)) {
                    (Some(b), Some(h)) if b.sha256 == h => {
                        let size_decl = src.get("size").and_then(Value::as_u64);
                        if size_decl != Some(b.size) {
                            bad.push(format!("C-4: media {id} declared size differs from the decoded size"));
                        }
                        match (i.blob_file)(h) {
                            Some(path) => match qs_platform::fsx::sha256_file(&path) {
                                Ok(actual) if actual == h => {}
                                _ => bad.push(format!("C-4: media {id} stored bytes do not hash to {h}")),
                            },
                            None => bad.push(format!("C-4: media {id} bytes are not present")),
                        }
                    }
                    _ => bad.push(format!("C-4: media {id} contentHash does not equal the SHA-256 of the decoded source bytes")),
                }
            }
            _ => {
                if !eq(&stored, src) {
                    bad.push(format!("C-2: {coll}/{id} differs from its source value at {}", e.pointer));
                }
                if e.canon_hash.as_deref() != Some(stored_hash.as_str()) {
                    bad.push(format!("C-2: {coll}/{id} ledger hash does not match the stored payload"));
                }
            }
        }
        // C-12: remediation provenance cannot be a database foreign key (it only applies when purpose is
        // "remediation"), so the verifier re-proves it against the target store itself
        if e.kind == "translation_document" {
            if let Some(p) = stored.get("provenance").filter(|p| p.get("purpose") == Some(&json!("remediation"))) {
                let (sr, sv) = (p.get("sourceResponseId").and_then(Value::as_str), p.get("sourceReviewId").and_then(Value::as_str));
                let ok = match (sr, sv) {
                    (Some(sr), Some(sv)) => {
                        let resp = row_payload(i.conn, LEARNER_RESPONSE, sr);
                        let rev = row_payload(i.conn, TEACHER_REVIEW, sv);
                        match (resp, rev) {
                            (Some(resp), Some(rev)) => {
                                rev.get("responseId").and_then(Value::as_str) == Some(sr)
                                    && p.get("sourceMaterialId")
                                        .and_then(Value::as_str)
                                        .is_none_or(|m| resp.pointer("/material/id").and_then(Value::as_str) == Some(m))
                            }
                            _ => false,
                        }
                    }
                    _ => false,
                };
                if !ok {
                    bad.push(format!("C-12: remediation document {id} no longer resolves to its source response/review in the store"));
                }
            }
        }
        // origin row (C-7) and order (C-3)
        let oid = format!("{}:{coll}:{id}", i.source_id);
        let Some(origin) = row_payload(i.conn, ORIGIN, &oid) else {
            bad.push(format!("C-7: {coll}/{id} has no migration_origin"));
            continue;
        };
        if let Some(run) = i.run_op_id {
            if origin["runOpId"] != json!(run) {
                bad.push(format!("C-7: origin of {coll}/{id} belongs to another run"));
            }
        }
        if origin["sourcePointer"] != json!(e.pointer) {
            bad.push(format!("C-7: origin of {coll}/{id} points at {} instead of {}", origin["sourcePointer"], e.pointer));
        }
        let want_pos = if e.kind == "library_categories" || e.kind == "legacy_residue" {
            origin["sourcePosition"].as_u64()
        } else {
            e.pointer.rsplit('/').next().and_then(|x| x.parse().ok())
        };
        if origin["sourcePosition"].as_u64() != want_pos {
            bad.push(format!("C-3: origin of {coll}/{id} has the wrong source position"));
        }
        if origin["mappingVersion"] != json!(MAPPING_VERSION) {
            bad.push(format!("C-7: origin of {coll}/{id} has an unknown mapping version"));
        }
        if origin["disposition"] != json!(e.disposition) {
            bad.push(format!("C-7: origin of {coll}/{id} disposition differs from the ledger"));
        }
        if origin["deletionOwner"] != json!(e.disposition == "carried") {
            bad.push(format!("C-7: origin of {coll}/{id} claims a deletion ownership that the original disposition does not give it"));
        }
        if i.run_op_id.is_none() && origin["canonHash"] != json!(stored_hash) {
            bad.push(format!("C-7: origin canonHash of {coll}/{id} differs from the stored payload"));
        }
        let gaps: Vec<&str> = origin["gaps"].as_array().map(|a| a.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
        let has_prov = src.get("provenance").is_some();
        for g in expected_fixed_gaps(&e.kind, has_prov && e.kind == "translation_document") {
            if !gaps.contains(&g) {
                bad.push(format!("C-7: origin of {coll}/{id} lacks gap {g}"));
            }
        }
        for g in &gaps {
            if let Some(f) = g.strip_prefix("timestamp.absent:") {
                if !ts_fields(&e.kind).contains(&f) || src.pointer(&format!("/{}", f.replace('.', "/"))).is_some() {
                    bad.push(format!("C-7: origin of {coll}/{id} claims timestamp {f} is absent but the source has it"));
                }
            }
        }
        for f in ts_fields(&e.kind) {
            if src.pointer(&format!("/{}", f.replace('.', "/"))).is_none() && !gaps.contains(&format!("timestamp.absent:{f}").as_str()) {
                bad.push(format!("C-7: origin of {coll}/{id} does not declare the absent timestamp {f}"));
            }
        }
        let anchors = match e.kind.as_str() {
            k if k.starts_with("learner_response") => {
                src.get("learnerAnnotations").and_then(Value::as_array).is_some_and(|a| !a.is_empty())
            }
            "teacher_review" => src
                .get("itemReviews")
                .and_then(Value::as_array)
                .is_some_and(|a| a.iter().any(|ir| ir.get("corrections").and_then(Value::as_array).is_some_and(|c| !c.is_empty()))),
            _ => false,
        };
        if anchors != (origin.get("offsetEncoding") == Some(&json!(OFFSET_ENCODING))) {
            bad.push(format!("C-7: origin of {coll}/{id} offsetEncoding label is wrong"));
        }
        // C-6: history roles recompute from the stored rows
        if e.kind == "legacy_history_entry" {
            let entry = stored.get("entry").cloned().unwrap_or(Value::Null);
            let twin = entry.get("responseId").and_then(Value::as_str).and_then(|rid| row_payload(i.conn, LEARNER_RESPONSE, rid));
            let (role, twin_id): (&str, Option<String>) = match &twin {
                Some(t)
                    if t.pointer("/material/type") == Some(&json!("quiz-paper"))
                        && t.pointer("/session/id") == entry.get("id")
                        && entry.get("id").is_some() =>
                {
                    let div = model::reconcile(&entry, t);
                    (if div.is_empty() { "twin" } else { "twin-divergent" }, t.get("id").and_then(Value::as_str).map(String::from))
                }
                _ => ("legacy-only", None),
            };
            if stored["role"] != json!(role) || stored.get("twinResponseId").and_then(Value::as_str).map(String::from) != twin_id {
                bad.push(format!("C-6: history {id} role {} does not recompute ({role})", stored["role"]));
            }
        }
    }
    // origin rows without a ledger entry
    let origins_present: i64 = match i.run_op_id {
        Some(r) => {
            i.conn.query_row("SELECT count(*) FROM migration_origin WHERE source_id=?1 AND run_op_id=?2", [i.source_id, r], |x| x.get(0))
        }
        None => i.conn.query_row("SELECT count(*) FROM migration_origin WHERE source_id=?1", [i.source_id], |x| x.get(0)),
    }
    .unwrap_or(-1);
    if origins_present != origin_expected as i64 {
        bad.push(format!("C-7: {origins_present} origin row(s) exist but the ledger accounts for {origin_expected} migrated record(s)"));
    }

    // ---- C-5: counts reconcile per kind
    let mut walk_counts: BTreeMap<&str, usize> = BTreeMap::new();
    for (_, k) in &expected {
        *walk_counts.entry(k).or_default() += 1;
    }
    let mut ledger_counts: BTreeMap<&str, usize> = BTreeMap::new();
    for e in i.ledger.iter().filter(|e| expected_ptrs.contains(e.pointer.as_str())) {
        *ledger_counts.entry(kind_family(&e.kind)).or_default() += 1;
    }
    if walk_counts != ledger_counts {
        bad.push(format!("C-5: per-kind counts differ (source {walk_counts:?}, ledger {ledger_counts:?})"));
    }

    // ---- C-8 (staging) and C-9
    if i.staging {
        for c in ["setting", "recovery_session"] {
            let n: i64 = i.conn.query_row(&format!("SELECT count(*) FROM {c}"), [], |r| r.get(0)).unwrap_or(-1);
            if n != 0 {
                bad.push(format!("C-8: migration staged {n} row(s) in {c}; migration never creates V2-only or scheduling facts"));
            }
        }
        let known: BTreeSet<&str> = [
            PAPER,
            CATEGORIES,
            LEARNER_RESPONSE,
            TEACHER_REVIEW,
            FOLDER,
            DOCUMENT,
            HISTORY,
            RESIDUE,
            ORIGIN,
            RUN,
            UNDO,
            ARTIFACT,
            MEDIA_COLLECTION,
            "setting",
            "recovery_session",
        ]
        .into_iter()
        .collect();
        for c in i.catalog.collections().iter().filter(|c| !known.contains(c.name.as_str())) {
            let n: i64 = i.conn.query_row(&format!("SELECT count(*) FROM {}", c.name), [], |r| r.get(0)).unwrap_or(-1);
            if n != 0 {
                bad.push(format!("C-8: unexpected rows in {}", c.name));
            }
        }
        match qs_store::consistency::check(i.conn, i.catalog) {
            Ok(p) => {
                for x in p {
                    bad.push(format!("C-9: {} {}", x.kind, x.collection));
                }
            }
            Err(e) => bad.push(format!("C-9: consistency check failed: {}", e.message)),
        }
    }
    bad
}
