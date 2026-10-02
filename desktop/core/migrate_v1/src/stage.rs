//! Mapping (ADR 0002 section 7): the plan of rows a source produces, reconciliation with the live store,
//! writing the isolated staging store, and the Disposition Ledger.
//!
//! Structured canonical records are carried **verbatim** (the payload is the source value, normalized only to
//! the canonical text so equal records are textually equal). Media assets are the one special mapping.
//! Everything V2 says *about* a record is a sidecar `migration_origin` row, never part of the payload.

use crate::catalog::*;
use crate::diag::Diags;
use crate::model::{Entity, Model, Role};
use qs_platform::{Code, DataRoot, Error, Result};
use qs_store::foundation::MEDIA_COLLECTION;
use qs_store::{canon, project, Catalog, OpenOptions, Store};
use rusqlite::Connection;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

pub const MAPPING_VERSION: &str = "v1-mapping/1";
pub const OFFSET_ENCODING: &str = "utf16-code-unit";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Disposition {
    Carried,
    DeduplicatedIdentical,
}
impl Disposition {
    pub fn as_str(self) -> &'static str {
        match self {
            Disposition::Carried => "carried",
            Disposition::DeduplicatedIdentical => "deduplicated-identical",
        }
    }
}

#[derive(Debug, Clone)]
pub struct PlanRow {
    pub collection: &'static str,
    pub id: String,
    /// Canonical-normalized stored payload.
    pub payload: Value,
    pub canon_hash: String,
    pub pointer: String,
    pub position: usize,
    pub kind: &'static str,
    pub gaps: Vec<String>,
    pub offset_encoding: bool,
    pub identity: Option<&'static str>,
    pub disposition: Disposition,
}

/// Re-parse the canonical text so that equal values are textually equal in storage (`1.0` and `1` alike).
pub fn normalized(v: &Value) -> Value {
    serde_json::from_str(&canon::canonical(v)).expect("canonical JSON is valid JSON")
}

fn gaps_for_timestamps(kind: &str, v: &Value, fields: &[&str]) -> Vec<String> {
    let _ = kind;
    fields.iter().filter(|f| v.pointer(&format!("/{}", f.replace('.', "/"))).is_none()).map(|f| format!("timestamp.absent:{f}")).collect()
}

fn row(collection: &'static str, e: &Entity, kind: &'static str, mut gaps: Vec<String>, ts: &[&str], offset: bool) -> PlanRow {
    gaps.extend(gaps_for_timestamps(kind, &e.value, ts));
    let payload = normalized(&e.value);
    PlanRow {
        collection,
        id: e.id.clone(),
        canon_hash: canon::hash_hex(&payload),
        payload,
        pointer: e.pointer.clone(),
        position: e.position,
        kind,
        gaps,
        offset_encoding: offset,
        identity: Some("v1"),
        disposition: Disposition::Carried,
    }
}

pub fn plan(m: &Model, source_id: &str) -> Vec<PlanRow> {
    let mut rows = vec![];
    for e in &m.papers {
        rows.push(row(PAPER, e, "paper", vec!["v2.answer-explanation".into()], &["createdAt", "updatedAt", "lastOpenedAt"], false));
    }
    if let Some((pointer, list)) = &m.categories {
        let payload = normalized(&json!({"categories": list}));
        rows.push(PlanRow {
            collection: CATEGORIES,
            id: CATEGORIES_ID.into(),
            canon_hash: canon::hash_hex(&payload),
            payload,
            pointer: pointer.clone(),
            position: 0,
            kind: "library_categories",
            gaps: vec![],
            offset_encoding: false,
            identity: Some("v1"),
            disposition: Disposition::Carried,
        });
    }
    for e in &m.responses {
        let objective = e.value.pointer("/material/type") == Some(&json!("quiz-paper"));
        let gaps: Vec<String> = if objective {
            ["objective.feedback-mode", "objective.retry-lineage", "v2.answer-explanation", "v2.scheduling"].map(String::from).to_vec()
        } else {
            ["translation.item-lineage", "v2.typing", "v2.scheduling"].map(String::from).to_vec()
        };
        let anchors = e.value.get("learnerAnnotations").and_then(Value::as_array).is_some_and(|a| !a.is_empty());
        rows.push(row(
            LEARNER_RESPONSE,
            e,
            if objective { "learner_response.objective" } else { "learner_response.translation" },
            gaps,
            &["finalizedAt", "session.startedAt", "session.completedAt"],
            anchors,
        ));
    }
    for e in &m.reviews {
        let anchors = e
            .value
            .get("itemReviews")
            .and_then(Value::as_array)
            .is_some_and(|a| a.iter().any(|ir| ir.get("corrections").and_then(Value::as_array).is_some_and(|c| !c.is_empty())));
        rows.push(row(TEACHER_REVIEW, e, "teacher_review", vec![], &["createdAt"], anchors));
    }
    for e in &m.folders {
        rows.push(row(FOLDER, e, "translation_folder", vec![], &["createdAt", "updatedAt"], false));
    }
    for e in &m.documents {
        let mut gaps = vec!["v2.typing".to_string(), "v2.scheduling".to_string()];
        if e.value.get("provenance").is_some() {
            gaps.push("translation.item-lineage".into());
        }
        rows.push(row(DOCUMENT, e, "translation_document", gaps, &["createdAt", "updatedAt"], false));
    }
    for h in &m.history {
        let mut o = Map::new();
        o.insert("entry".into(), h.entry.clone());
        o.insert("role".into(), json!(h.role.as_str()));
        if let Some(t) = &h.twin {
            o.insert("twinResponseId".into(), json!(t));
        }
        if !h.divergence.is_empty() {
            o.insert("divergence".into(), json!(h.divergence));
        }
        let payload = normalized(&Value::Object(o));
        let mut gaps = vec![];
        if h.role == Role::LegacyOnly {
            gaps.push("history.snapshot".to_string());
        }
        gaps.extend(gaps_for_timestamps("history", &h.entry, &["completedAt"]));
        rows.push(PlanRow {
            collection: HISTORY,
            id: h.row_id.clone(),
            canon_hash: canon::hash_hex(&payload),
            payload,
            pointer: h.pointer.clone(),
            position: h.position,
            kind: "legacy_history_entry",
            gaps,
            offset_encoding: false,
            identity: Some(if h.content_derived { "content-derived" } else { "v1" }),
            disposition: Disposition::Carried,
        });
    }
    for a in &m.assets {
        let mut meta = a.meta.as_object().cloned().unwrap_or_default();
        meta.insert("contentHash".into(), json!(a.sha256));
        let payload = normalized(&Value::Object(meta));
        rows.push(PlanRow {
            collection: MEDIA_COLLECTION,
            id: a.id.clone(),
            canon_hash: canon::hash_hex(&payload),
            payload,
            pointer: a.pointer.clone(),
            position: a.position,
            kind: "media_object",
            gaps: vec!["media.created-at".into()],
            offset_encoding: false,
            identity: Some("v1"),
            disposition: Disposition::Carried,
        });
    }
    for (i, (pointer, value)) in m.residue.iter().enumerate() {
        let id = format!("{source_id}#{pointer}");
        let payload = normalized(&json!({"pointer": pointer, "value": value}));
        rows.push(PlanRow {
            collection: RESIDUE,
            id,
            canon_hash: canon::hash_hex(&payload),
            payload,
            pointer: pointer.clone(),
            position: i,
            kind: "legacy_residue",
            gaps: vec![],
            offset_encoding: false,
            identity: Some("v1"),
            disposition: Disposition::Carried,
        });
    }
    rows
}

/// Section 9.2/9.5 (preview side): same id + canonically identical stored payload => deduplicated; same id +
/// different payload => `MIG_LIVE_CONFLICT`. Nothing is overwritten or remapped.
pub fn reconcile_live(conn: &Connection, rows: &mut [PlanRow], d: &mut Diags) -> Result<()> {
    let mut identical = 0u64;
    for r in rows.iter_mut() {
        let live: Option<String> = match conn.query_row(&format!("SELECT payload FROM {} WHERE id=?1", r.collection), [&r.id], |x| x.get(0))
        {
            Ok(t) => Some(t),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(Error::new(Code::Db, e.to_string())),
        };
        if let Some(text) = live {
            let live_v: Value = serde_json::from_str(&text).map_err(|e| Error::new(Code::Db, e.to_string()))?;
            if canon::canonical(&live_v) == canon::canonical(&r.payload) {
                r.disposition = Disposition::DeduplicatedIdentical;
                identical += 1;
            } else {
                d.add("MIG_LIVE_CONFLICT", Some(&r.pointer), json!({"collection": r.collection, "id": r.id}));
            }
        }
    }
    if identical > 0 {
        d.add("MIG_EXISTING_IDENTICAL", None, json!({"count": identical}));
    }
    Ok(())
}

pub struct OriginCtx<'a> {
    pub source_id: &'a str,
    pub op_id: &'a str,
}

pub fn origin_row(r: &PlanRow, ctx: &OriginCtx) -> (String, Value) {
    let id = format!("{}:{}:{}", ctx.source_id, r.collection, r.id);
    let mut o = Map::new();
    o.insert("collection".into(), json!(r.collection));
    o.insert("recordId".into(), json!(r.id));
    o.insert("sourceId".into(), json!(ctx.source_id));
    o.insert("runOpId".into(), json!(ctx.op_id));
    o.insert("sourcePointer".into(), json!(r.pointer));
    o.insert("sourcePosition".into(), json!(r.position));
    o.insert("disposition".into(), json!(r.disposition.as_str()));
    // current deletion ownership, separate from the immutable disposition: only the run that created the record
    // owns its deletion; undo may move ownership to another active holder but never rewrites the disposition
    o.insert("deletionOwner".into(), json!(r.disposition == Disposition::Carried));
    o.insert("mappingVersion".into(), json!(MAPPING_VERSION));
    o.insert("canonHash".into(), json!(r.canon_hash));
    o.insert("kind".into(), json!(r.kind));
    o.insert("gaps".into(), json!(r.gaps));
    if r.offset_encoding {
        o.insert("offsetEncoding".into(), json!(OFFSET_ENCODING));
    }
    if let Some(i) = r.identity {
        o.insert("identity".into(), json!(i));
    }
    (id, normalized(&Value::Object(o)))
}

pub fn put_op(catalog: &Catalog, collection: &str, id: &str, payload: &Value) -> Result<Value> {
    let coll = catalog.collection(collection).ok_or_else(|| Error::new(Code::Internal, format!("unknown collection {collection}")))?;
    let p = project::extract(coll, id, payload)?;
    Ok(json!({"op": "put", "collection": collection, "id": id, "payload": payload, "proj": project::to_json(coll, &p)}))
}

pub struct StagedStore {
    pub root: DataRoot,
    pub db: PathBuf,
}

/// Build the isolated staging store through the real Store Port (so projections, foreign keys and identity are
/// verified by the same code the live store uses). `extra` are additional `(collection, id, payload)` rows
/// (recovery artifact row). The run row is added at confirmation time (`add_run_row`).
pub fn write_staging(
    stage_root: &DataRoot,
    catalog: &Arc<Catalog>,
    rows: &[PlanRow],
    ctx: &OriginCtx,
    extra: &[(&'static str, String, Value)],
) -> Result<StagedStore> {
    let mut store = Store::open(stage_root, catalog.clone(), &OpenOptions { lock: false, ..OpenOptions::default() })?;
    let mut ops: Vec<Value> = vec![];
    let flush = |store: &mut Store, ops: &mut Vec<Value>| -> Result<()> {
        if !ops.is_empty() {
            store.commit(&json!({"ops": std::mem::take(ops)}))?;
        }
        Ok(())
    };
    let mut n = 0usize;
    // media first is not required (deferred FKs), but keeps batches readable
    let ordered = rows.iter().filter(|r| r.collection == MEDIA_COLLECTION).chain(rows.iter().filter(|r| r.collection != MEDIA_COLLECTION));
    for r in ordered {
        ops.push(put_op(catalog, r.collection, &r.id, &r.payload)?);
        let (oid, op) = origin_row(r, ctx);
        ops.push(put_op(catalog, ORIGIN, &oid, &op)?);
        n += 1;
        if ops.len() >= 200 {
            flush(&mut store, &mut ops)?;
        }
        if n == rows.len() / 2 + 1 {
            qs_platform::fault::point("mig-mid-staging");
        }
    }
    for (c, id, payload) in extra {
        ops.push(put_op(catalog, c, id, payload)?);
    }
    flush(&mut store, &mut ops)?;
    let db = stage_root.db_path();
    drop(store);
    qs_activation::normalize_staging(&db)?;
    Ok(StagedStore { root: stage_root.clone(), db })
}

/// Commit the run row into the (closed) staging store, then re-normalize it for the read-only `ATTACH`.
pub fn add_run_row(stage_root: &DataRoot, catalog: &Arc<Catalog>, run: &Value) -> Result<()> {
    let mut store = Store::open(stage_root, catalog.clone(), &OpenOptions { lock: false, ..OpenOptions::default() })?;
    let id = run["opId"].as_str().ok_or_else(|| Error::new(Code::Internal, "run record without opId"))?;
    store.commit(&json!({"ops": [put_op(catalog, RUN, id, run)?]}))?;
    let db = stage_root.db_path();
    drop(store);
    qs_activation::normalize_staging(&db)
}

// ----------------------------------------------------------------------------------------------- ledger

/// One line of the Disposition Ledger (section 14.1): every source entity and key has exactly one.
#[derive(Debug, Clone)]
pub struct LedgerEntry {
    pub pointer: String,
    pub kind: String,
    /// `carried`, `deduplicated-identical`, `collapsed-duplicate`, `reported-unmigrated`, `structural`
    pub disposition: String,
    pub collection: Option<String>,
    pub id: Option<String>,
    pub canon_hash: Option<String>,
    pub note: Option<String>,
}

impl LedgerEntry {
    pub fn to_json(&self) -> Value {
        json!({"pointer": self.pointer, "kind": self.kind, "disposition": self.disposition, "collection": self.collection,
               "id": self.id, "canonHash": self.canon_hash, "note": self.note})
    }
}

pub fn ledger(m: &Model, rows: &[PlanRow]) -> Vec<LedgerEntry> {
    let mut out: Vec<LedgerEntry> = rows
        .iter()
        .map(|r| LedgerEntry {
            pointer: r.pointer.clone(),
            kind: r.kind.into(),
            disposition: r.disposition.as_str().into(),
            collection: Some(r.collection.into()),
            id: Some(r.id.clone()),
            canon_hash: Some(r.canon_hash.clone()),
            note: None,
        })
        .collect();
    for h in &m.history {
        for p in &h.collapsed_positions {
            out.push(LedgerEntry {
                pointer: format!("/history/{p}"),
                kind: "legacy_history_entry".into(),
                disposition: "collapsed-duplicate".into(),
                collection: Some(HISTORY.into()),
                id: Some(h.row_id.clone()),
                canon_hash: None,
                note: Some(format!("identical to {}", h.pointer)),
            });
        }
    }
    for a in &m.assets {
        for p in &a.collapsed_positions {
            out.push(LedgerEntry {
                pointer: format!("{}/{p}", a.pointer.rsplit_once('/').map(|x| x.0).unwrap_or("")),
                kind: "media_object".into(),
                disposition: "collapsed-duplicate".into(),
                collection: Some(MEDIA_COLLECTION.into()),
                id: Some(a.id.clone()),
                canon_hash: None,
                note: Some(format!("identical to {}", a.pointer)),
            });
        }
    }
    for a in &m.unreferenced {
        out.push(LedgerEntry {
            pointer: a.pointer.clone(),
            kind: "media_object".into(),
            disposition: "reported-unmigrated".into(),
            collection: None,
            id: Some(a.id.clone()),
            canon_hash: None,
            note: Some("MIG_MEDIA_UNREFERENCED_NOT_MIGRATED".into()),
        });
    }
    out
}

/// Counts per kind for the report: `{kind: {source, carried, deduplicatedIdentical, collapsed, reportedUnmigrated, blocked}}`.
pub fn counts(entries: &[LedgerEntry]) -> BTreeMap<String, BTreeMap<&'static str, u64>> {
    let mut m: BTreeMap<String, BTreeMap<&'static str, u64>> = BTreeMap::new();
    for e in entries {
        let k = m.entry(e.kind.clone()).or_default();
        *k.entry("source").or_default() += 1;
        let col = match e.disposition.as_str() {
            "carried" => "carried",
            "deduplicated-identical" => "deduplicatedIdentical",
            "collapsed-duplicate" => "collapsed",
            "reported-unmigrated" => "reportedUnmigrated",
            _ => "blocked",
        };
        *k.entry(col).or_default() += 1;
    }
    m
}
