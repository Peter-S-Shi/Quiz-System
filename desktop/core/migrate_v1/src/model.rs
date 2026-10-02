//! Detection precedence (ADR 0002 section 5), the minimal V1 model the reader needs, and the structural,
//! identity, referential, media and semantic validation (sections 6, 9, 10, 11).
//!
//! Everything here reads the lossless tree; it never normalizes, defaults or repairs. A condition that would
//! require guessing is a *blocking* diagnostic; everything else is carried or reported.

use crate::diag::{esc, Diags};
use crate::reader::MediaBlob;
use qs_store::canon;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};

pub const BACKUP_TYPE: &str = "quiz-studio.library-backup";
pub const LR_TYPE: &str = "quiz-studio.learner-response";
pub const TR_TYPE: &str = "quiz-studio.teacher-review";
pub const TD_TYPE: &str = "quiz-studio.translation-document";

pub const IMAGE_MIMES: &[&str] = &["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
pub const AUDIO_MIMES: &[&str] = &[
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/webm",
    "audio/aac",
    "audio/m4a",
    "audio/mp4",
    "audio/flac",
    "audio/x-wav",
    "audio/x-m4a",
    "audio/x-flac",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaClass {
    Image,
    Audio,
}

pub fn mime_class(mime: &str) -> Option<MediaClass> {
    let m = mime.trim().to_ascii_lowercase();
    if IMAGE_MIMES.contains(&m.as_str()) {
        Some(MediaClass::Image)
    } else if AUDIO_MIMES.contains(&m.as_str()) {
        Some(MediaClass::Audio)
    } else {
        None
    }
}

/// A record the reader recognizes as a unit of source data.
#[derive(Debug, Clone)]
pub struct Entity {
    pub pointer: String,
    pub position: usize,
    pub id: String,
    pub value: Value,
}

#[derive(Debug, Clone)]
pub struct Asset {
    pub pointer: String,
    pub position: usize,
    pub id: String,
    /// Source asset object without `data`.
    pub meta: Value,
    pub mime: String,
    pub blob_tmp: Option<std::path::PathBuf>,
    pub sha256: String,
    pub size: u64,
    /// Positions of byte-identical duplicates collapsed into this asset.
    pub collapsed_positions: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Role {
    Twin,
    TwinDivergent,
    LegacyOnly,
}
impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Twin => "twin",
            Role::TwinDivergent => "twin-divergent",
            Role::LegacyOnly => "legacy-only",
        }
    }
}

#[derive(Debug, Clone)]
pub struct HistoryRow {
    pub pointer: String,
    pub position: usize,
    pub row_id: String,
    pub content_derived: bool,
    pub entry: Value,
    pub role: Role,
    pub twin: Option<String>,
    pub divergence: Vec<String>,
    pub collapsed_positions: Vec<usize>,
}

#[derive(Debug, Default)]
pub struct Model {
    pub classification: Value,
    pub papers: Vec<Entity>,
    pub categories: Option<(String, Value)>,
    pub responses: Vec<Entity>,
    pub reviews: Vec<Entity>,
    pub folders: Vec<Entity>,
    pub documents: Vec<Entity>,
    pub history: Vec<HistoryRow>,
    pub assets: Vec<Asset>,
    /// Unreferenced assets (not migrated, reported).
    pub unreferenced: Vec<Asset>,
    /// asset id -> referencing pointers (V1 reference contract only)
    pub referenced: BTreeMap<String, Vec<String>>,
    /// (pointer, value) of keys outside any entity that must be preserved verbatim.
    pub residue: Vec<(String, Value)>,
    /// Envelope-level facts carried verbatim in the run record.
    pub envelope: Value,
    pub unknown_fields: BTreeMap<String, u64>,
    pub timestamps_absent: BTreeMap<String, u64>,
    pub sections_present: BTreeMap<String, bool>,
    pub history_cap_possible: bool,
}

// ------------------------------------------------------------------------------------------------ helpers

fn ptr(base: &str, seg: &str) -> String {
    format!("{base}/{}", esc(seg))
}
fn idx(base: &str, i: usize) -> String {
    format!("{base}/{i}")
}
fn nonempty(v: Option<&Value>) -> Option<&str> {
    match v {
        Some(Value::String(s)) if !s.is_empty() => Some(s),
        _ => None,
    }
}
fn text_ok(v: &Value, pointer_in: &str) -> bool {
    matches!(v.pointer(pointer_in), None | Some(Value::Null) | Some(Value::String(_)))
}
fn canon_eq(a: &Value, b: &Value) -> bool {
    canon::canonical(a) == canon::canonical(b)
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

fn known_keys(kind: &str) -> &'static [&'static str] {
    match kind {
        "paper" => &[
            "schemaVersion",
            "id",
            "title",
            "description",
            "category",
            "tags",
            "createdAt",
            "updatedAt",
            "lastOpenedAt",
            "questions",
            "provenance",
        ],
        "question" => &["id", "type", "prompt", "options", "answers", "caseSensitive", "answer", "pairs", "image", "audio"],
        "learner_response" => &[
            "schemaVersion",
            "documentType",
            "id",
            "status",
            "finalizedAt",
            "material",
            "session",
            "responses",
            "summary",
            "provenance",
            "learnerAnnotations",
            "learnerItemMarks",
            "extensions",
        ],
        "teacher_review" => &[
            "schemaVersion",
            "documentType",
            "id",
            "responseId",
            "createdAt",
            "reviewer",
            "summary",
            "itemReviews",
            "remediationRecommendations",
            "extensions",
        ],
        "folder" => &["id", "name", "createdAt", "updatedAt"],
        "document" => &[
            "schemaVersion",
            "documentType",
            "id",
            "title",
            "folderId",
            "sourceLanguage",
            "targetLanguage",
            "createdAt",
            "updatedAt",
            "items",
            "provenance",
            "extensions",
        ],
        "history" => &[
            "id",
            "paperId",
            "paperTitle",
            "completedAt",
            "questionCount",
            "correctCount",
            "percent",
            "responseId",
            "missedQuestionIds",
            "results",
        ],
        "media_asset" => &["id", "mimeType", "name", "size", "data"],
        _ => &[],
    }
}

fn count_unknown(m: &mut BTreeMap<String, u64>, kind: &str, class: &str, v: &Value) {
    if let Some(o) = v.as_object() {
        let known = known_keys(kind);
        let n = o.keys().filter(|k| !known.contains(&k.as_str())).count() as u64;
        if n > 0 {
            *m.entry(class.to_string()).or_default() += n;
        }
    }
}

fn count_absent(m: &mut BTreeMap<String, u64>, kind: &str, v: &Value, fields: &[&str]) {
    for f in fields {
        let p = format!("/{}", f.replace('.', "/"));
        if v.pointer(&p).is_none() {
            *m.entry(format!("{kind}.{f}")).or_default() += 1;
        }
    }
}

// ------------------------------------------------------------------------------------------- detection

/// Stages 3-6 of section 5 over a parsed tree. Returns `None` for the model when a detection-level problem
/// blocks (the diagnostics say why).
pub fn detect(root: &Value, media: &[MediaBlob], d: &mut Diags) -> Option<Model> {
    let Some(obj) = root.as_object() else {
        d.add("MIG_SOURCE_NOT_A_BACKUP", Some(""), json!({"reason": "the document root is not an object"}));
        return None;
    };
    // 3. declared identity - never overridden by structure
    let mut declared = false;
    match obj.get("documentType") {
        Some(Value::String(t)) if t == BACKUP_TYPE => declared = true,
        Some(Value::String(t)) if t.starts_with("quiz-studio.") => {
            d.add(
                "MIG_SOURCE_WRONG_KIND",
                Some("/documentType"),
                json!({"kind": t, "hint": "this is another Quiz Studio artifact, not a library backup"}),
            );
            return None;
        }
        Some(other) => {
            d.add("MIG_SOURCE_DECLARED_CONFLICT", Some("/documentType"), json!({"found": other}));
            return None;
        }
        None => {
            if obj.contains_key("sourceKey") && obj.contains_key("rawValue") {
                d.add(
                    "MIG_SOURCE_WRONG_KIND",
                    Some(""),
                    json!({"kind": "recovery-artifact", "hint": "supply it as the optional recovery artifact input"}),
                );
                return None;
            }
        }
    }
    // 4. envelope shape
    let papers_ok = obj.get("library").and_then(|l| l.get("papers")).and_then(Value::as_array).is_some_and(|a| !a.is_empty());
    if !papers_ok {
        d.add("MIG_SOURCE_NOT_A_BACKUP", Some("/library"), json!({"reason": "library.papers must be a non-empty array"}));
        return None;
    }
    if !declared {
        d.add("MIG_ENVELOPE_UNDECLARED", None, json!({}));
    }
    // 5. envelope schemaVersion is informational
    if obj.get("schemaVersion") != Some(&json!(1)) {
        d.add(
            "MIG_ENVELOPE_VERSION_UNEXPECTED",
            Some("/schemaVersion"),
            json!({"found": obj.get("schemaVersion").cloned().unwrap_or(Value::Null)}),
        );
    }

    let mut m = Model::default();
    let mut envelope = Map::new();
    for k in ["schemaVersion", "documentType", "exportedAt"] {
        if let Some(v) = obj.get(k) {
            envelope.insert(k.to_string(), v.clone());
        }
    }
    for (k, v) in obj {
        if !ENVELOPE_KEYS.contains(&k.as_str()) {
            m.residue.push((ptr("", k), v.clone()));
        }
    }

    // 6. per-sub-document detection, fixed order: library -> mediaAssets -> translationLibrary -> learnerResponses -> teacherReviews -> history
    let before = d.blocking_count();
    detect_library(obj, &mut m, &mut envelope, d);
    detect_media(obj, media, &mut m, d);
    detect_translation(obj, &mut m, &mut envelope, d);
    detect_responses(obj, &mut m, d);
    detect_reviews(obj, &mut m, d);
    detect_history(obj, &mut m, d);
    m.envelope = Value::Object(envelope);
    m.classification = json!({
        "declared": declared,
        "envelopeVersion": obj.get("schemaVersion").cloned().unwrap_or(Value::Null),
        "sections": m.sections_present,
    });
    if d.blocking_count() > before {
        return None;
    }
    Some(m)
}

fn detect_library(obj: &Map<String, Value>, m: &mut Model, envelope: &mut Map<String, Value>, d: &mut Diags) {
    let lib = obj["library"].as_object().cloned();
    let Some(lib) = lib else {
        d.add("MIG_SECTION_SHAPE", Some("/library"), json!({"reason": "library must be an object"}));
        return;
    };
    m.sections_present.insert("library".into(), true);
    match lib.get("schemaVersion") {
        Some(v) if v == &json!(1) => {}
        None => d.add("MIG_LIBRARY_PREVERSIONED", Some("/library"), json!({})),
        Some(other) => d.add("MIG_RECORD_KIND_UNKNOWN", Some("/library/schemaVersion"), json!({"found": other})),
    }
    let mut lenv = Map::new();
    if let Some(v) = lib.get("schemaVersion") {
        lenv.insert("schemaVersion".into(), v.clone());
    }
    envelope.insert("library".into(), Value::Object(lenv));
    for (k, v) in &lib {
        if !LIBRARY_KEYS.contains(&k.as_str()) {
            m.residue.push((ptr("/library", k), v.clone()));
        }
    }
    match lib.get("categories") {
        None => d.add("MIG_SECTION_ABSENT", Some("/library/categories"), json!({"section": "library.categories"})),
        Some(Value::Array(_)) => m.categories = Some(("/library/categories".into(), lib["categories"].clone())),
        Some(_) => d.add("MIG_SECTION_SHAPE", Some("/library/categories"), json!({"reason": "categories must be an array"})),
    }
    let mut ids: BTreeMap<String, usize> = BTreeMap::new();
    for (i, p) in lib["papers"].as_array().unwrap().iter().enumerate() {
        let pointer = idx("/library/papers", i);
        let Some(po) = p.as_object() else {
            d.add("MIG_SECTION_SHAPE", Some(&pointer), json!({"reason": "paper must be an object"}));
            continue;
        };
        let Some(id) = nonempty(po.get("id")) else {
            d.add("MIG_RECORD_UNIDENTIFIABLE", Some(&pointer), json!({"kind": "paper"}));
            continue;
        };
        if let Some(first) = ids.insert(id.to_string(), i) {
            d.add("MIG_IDENTITY_AMBIGUOUS", Some(&pointer), json!({"kind": "paper", "id": id, "firstPosition": first}));
            continue;
        }
        for f in ["/title", "/category", "/createdAt", "/updatedAt"] {
            if !text_ok(p, f) {
                d.add("MIG_SECTION_SHAPE", Some(&format!("{pointer}{f}")), json!({"reason": "expected a string"}));
            }
        }
        match po.get("questions") {
            None | Some(Value::Null) => {}
            Some(Value::Array(qs)) => {
                let mut qids: BTreeMap<String, usize> = BTreeMap::new();
                for (qi, q) in qs.iter().enumerate() {
                    count_unknown(&mut m.unknown_fields, "question", "/library/papers/*/questions/*", q);
                    if let Some(qid) = nonempty(q.get("id")) {
                        if let Some(first) = qids.insert(qid.to_string(), qi) {
                            d.add(
                                "MIG_IDENTITY_AMBIGUOUS",
                                Some(&format!("{pointer}/questions/{qi}")),
                                json!({"kind": "question", "id": qid, "paper": id, "firstPosition": first}),
                            );
                        }
                    }
                    for slot in ["image", "audio"] {
                        if let Some(Value::Object(o)) = q.get(slot) {
                            if let Some(idv) = o.get("id") {
                                if !idv.is_string() {
                                    d.add(
                                        "MIG_SECTION_SHAPE",
                                        Some(&format!("{pointer}/questions/{qi}/{slot}/id")),
                                        json!({"reason": "expected a string"}),
                                    );
                                }
                            }
                        }
                    }
                }
            }
            Some(_) => d.add("MIG_SECTION_SHAPE", Some(&format!("{pointer}/questions")), json!({"reason": "questions must be an array"})),
        }
        count_unknown(&mut m.unknown_fields, "paper", "/library/papers/*", p);
        count_absent(&mut m.timestamps_absent, "paper", p, &["createdAt", "updatedAt", "lastOpenedAt"]);
        m.papers.push(Entity { pointer, position: i, id: id.to_string(), value: p.clone() });
    }
}

fn detect_media(obj: &Map<String, Value>, blobs: &[MediaBlob], m: &mut Model, d: &mut Diags) {
    let list_key = match (obj.get("mediaAssets"), obj.get("assets")) {
        (Some(a), Some(b)) => {
            let empty = |v: &Value| v.as_array().is_some_and(|x| x.is_empty());
            if empty(a) {
                "assets"
            } else if empty(b) {
                "mediaAssets"
            } else {
                d.add("MIG_SECTION_SHAPE", Some("/assets"), json!({"reason": "both mediaAssets and its legacy alias assets are present"}));
                return;
            }
        }
        (Some(_), None) => "mediaAssets",
        (None, Some(_)) => {
            d.add("MIG_ASSETS_ALIAS_USED", Some("/assets"), json!({}));
            "assets"
        }
        (None, None) => {
            d.add("MIG_SECTION_ABSENT", Some("/mediaAssets"), json!({"section": "mediaAssets"}));
            m.sections_present.insert("mediaAssets".into(), false);
            return;
        }
    };
    let Some(list) = obj[list_key].as_array() else {
        d.add("MIG_SECTION_SHAPE", Some(&ptr("", list_key)), json!({"reason": "must be an array"}));
        return;
    };
    m.sections_present.insert("mediaAssets".into(), true);
    let by_pos: BTreeMap<usize, &MediaBlob> = blobs.iter().filter(|b| b.list_key == list_key).map(|b| (b.index, b)).collect();
    for (i, a) in list.iter().enumerate() {
        let pointer = idx(&ptr("", list_key), i);
        let Some(ao) = a.as_object() else {
            d.add("MIG_SECTION_SHAPE", Some(&pointer), json!({"reason": "media asset must be an object"}));
            continue;
        };
        let Some(id) = nonempty(ao.get("id")) else {
            d.add("MIG_RECORD_UNIDENTIFIABLE", Some(&pointer), json!({"kind": "media_asset"}));
            continue;
        };
        if id.trim() != id {
            d.add("MIG_RECORD_UNIDENTIFIABLE", Some(&pointer), json!({"kind": "media_asset", "reason": "id has surrounding whitespace"}));
            continue;
        }
        count_unknown(&mut m.unknown_fields, "media_asset", "/mediaAssets/*", a);
        let mime = match ao.get("mimeType") {
            Some(Value::String(s)) if !s.trim().is_empty() => s.clone(),
            _ => {
                d.add("MIG_MEDIA_MIME_CLASS", Some(&pointer), json!({"id": id, "reason": "mimeType is missing or not a string"}));
                continue;
            }
        };
        if mime_class(&mime).is_none() {
            d.add("MIG_MEDIA_MIME_CLASS", Some(&pointer), json!({"id": id, "mimeType": mime, "reason": "unsupported mimeType"}));
            continue;
        }
        let Some(declared) = ao.get("size").and_then(Value::as_u64) else {
            d.add(
                "MIG_MEDIA_SIZE_MISMATCH",
                Some(&pointer),
                json!({"id": id, "reason": "declared size is missing or not a non-negative integer"}),
            );
            continue;
        };
        let Some(b) = by_pos.get(&i) else {
            d.add("MIG_MEDIA_PAYLOAD_INVALID", Some(&pointer), json!({"id": id, "reason": "no data payload"}));
            continue;
        };
        if let Some(why) = &b.invalid {
            d.add("MIG_MEDIA_PAYLOAD_INVALID", Some(&pointer), json!({"id": id, "reason": why}));
            continue;
        }
        if b.size != declared {
            d.add("MIG_MEDIA_SIZE_MISMATCH", Some(&pointer), json!({"id": id, "declared": declared, "decoded": b.size}));
            continue;
        }
        let mut meta = ao.clone();
        meta.remove("data");
        let meta = Value::Object(meta);
        if let Some(prev) = m.assets.iter_mut().find(|x| x.id == id) {
            if prev.sha256 == b.sha256 && prev.mime == mime && canon_eq(&prev.meta, &meta) {
                prev.collapsed_positions.push(i);
                d.add("MIG_MEDIA_DUPLICATE_IDENTICAL", Some(&pointer), json!({"id": id, "firstPosition": prev.position}));
                if let Some(t) = &b.tmp {
                    let _ = std::fs::remove_file(t);
                }
            } else {
                d.add("MIG_MEDIA_CONFLICT", Some(&pointer), json!({"id": id, "firstPosition": prev.position}));
            }
            continue;
        }
        m.assets.push(Asset {
            pointer,
            position: i,
            id: id.to_string(),
            meta,
            mime,
            blob_tmp: b.tmp.clone(),
            sha256: b.sha256.clone(),
            size: b.size,
            collapsed_positions: vec![],
        });
    }
}

fn detect_translation(obj: &Map<String, Value>, m: &mut Model, envelope: &mut Map<String, Value>, d: &mut Diags) {
    let Some(tl) = obj.get("translationLibrary") else {
        d.add("MIG_SECTION_ABSENT", Some("/translationLibrary"), json!({"section": "translationLibrary"}));
        m.sections_present.insert("translationLibrary".into(), false);
        return;
    };
    let Some(tlo) = tl.as_object() else {
        d.add("MIG_SECTION_SHAPE", Some("/translationLibrary"), json!({"reason": "must be an object"}));
        return;
    };
    m.sections_present.insert("translationLibrary".into(), true);
    let mut tenv = Map::new();
    if let Some(v) = tlo.get("schemaVersion") {
        tenv.insert("schemaVersion".into(), v.clone());
    }
    envelope.insert("translationLibrary".into(), Value::Object(tenv));
    for (k, v) in tlo {
        if !TLIB_KEYS.contains(&k.as_str()) {
            m.residue.push((ptr("/translationLibrary", k), v.clone()));
        }
    }
    let mut folder_ids: BTreeMap<String, usize> = BTreeMap::new();
    match tlo.get("folders") {
        Some(Value::Array(fs)) => {
            for (i, f) in fs.iter().enumerate() {
                let pointer = idx("/translationLibrary/folders", i);
                let Some(id) = nonempty(f.get("id")) else {
                    d.add("MIG_RECORD_UNIDENTIFIABLE", Some(&pointer), json!({"kind": "translation_folder"}));
                    continue;
                };
                if let Some(first) = folder_ids.insert(id.to_string(), i) {
                    d.add(
                        "MIG_IDENTITY_AMBIGUOUS",
                        Some(&pointer),
                        json!({"kind": "translation_folder", "id": id, "firstPosition": first}),
                    );
                    continue;
                }
                count_unknown(&mut m.unknown_fields, "folder", "/translationLibrary/folders/*", f);
                count_absent(&mut m.timestamps_absent, "folder", f, &["createdAt", "updatedAt"]);
                m.folders.push(Entity { pointer, position: i, id: id.to_string(), value: f.clone() });
            }
        }
        None => d.add("MIG_SECTION_ABSENT", Some("/translationLibrary/folders"), json!({"section": "translationLibrary.folders"})),
        Some(_) => d.add("MIG_SECTION_SHAPE", Some("/translationLibrary/folders"), json!({"reason": "must be an array"})),
    }
    let mut doc_ids: BTreeMap<String, usize> = BTreeMap::new();
    match tlo.get("documents") {
        Some(Value::Array(ds)) => {
            for (i, doc) in ds.iter().enumerate() {
                let pointer = idx("/translationLibrary/documents", i);
                let Some(id) = nonempty(doc.get("id")) else {
                    d.add("MIG_RECORD_UNIDENTIFIABLE", Some(&pointer), json!({"kind": "translation_document"}));
                    continue;
                };
                if doc.get("documentType") != Some(&json!(TD_TYPE)) {
                    d.add(
                        "MIG_RECORD_KIND_UNKNOWN",
                        Some(&format!("{pointer}/documentType")),
                        json!({"found": doc.get("documentType").cloned().unwrap_or(Value::Null)}),
                    );
                    continue;
                }
                if let Some(first) = doc_ids.insert(id.to_string(), i) {
                    d.add(
                        "MIG_IDENTITY_AMBIGUOUS",
                        Some(&pointer),
                        json!({"kind": "translation_document", "id": id, "firstPosition": first}),
                    );
                    continue;
                }
                if !text_ok(doc, "/folderId") {
                    d.add("MIG_SECTION_SHAPE", Some(&format!("{pointer}/folderId")), json!({"reason": "expected a string"}));
                }
                match doc.get("items") {
                    None | Some(Value::Null) => {}
                    Some(Value::Array(items)) => {
                        let mut item_ids: BTreeMap<String, usize> = BTreeMap::new();
                        for (ii, it) in items.iter().enumerate() {
                            if let Some(iid) = nonempty(it.get("id")) {
                                if let Some(first) = item_ids.insert(iid.to_string(), ii) {
                                    d.add(
                                        "MIG_IDENTITY_AMBIGUOUS",
                                        Some(&format!("{pointer}/items/{ii}")),
                                        json!({"kind": "translation_item", "id": iid, "document": id, "firstPosition": first}),
                                    );
                                }
                            }
                            if it.get("position").is_some_and(|p| p != &json!(ii)) {
                                d.add(
                                    "MIG_SECTION_SHAPE",
                                    Some(&format!("{pointer}/items/{ii}/position")),
                                    json!({"reason": "item positions must be contiguous from 0"}),
                                );
                            }
                        }
                    }
                    Some(_) => d.add("MIG_SECTION_SHAPE", Some(&format!("{pointer}/items")), json!({"reason": "items must be an array"})),
                }
                count_unknown(&mut m.unknown_fields, "document", "/translationLibrary/documents/*", doc);
                count_absent(&mut m.timestamps_absent, "document", doc, &["createdAt", "updatedAt"]);
                m.documents.push(Entity { pointer, position: i, id: id.to_string(), value: doc.clone() });
            }
        }
        None => d.add("MIG_SECTION_ABSENT", Some("/translationLibrary/documents"), json!({"section": "translationLibrary.documents"})),
        Some(_) => d.add("MIG_SECTION_SHAPE", Some("/translationLibrary/documents"), json!({"reason": "must be an array"})),
    }
}

fn detect_responses(obj: &Map<String, Value>, m: &mut Model, d: &mut Diags) {
    let Some(lr) = obj.get("learnerResponses") else {
        d.add("MIG_SECTION_ABSENT", Some("/learnerResponses"), json!({"section": "learnerResponses"}));
        m.sections_present.insert("learnerResponses".into(), false);
        return;
    };
    let Some(list) = lr.as_array() else {
        d.add("MIG_SECTION_SHAPE", Some("/learnerResponses"), json!({"reason": "must be an array"}));
        return;
    };
    m.sections_present.insert("learnerResponses".into(), true);
    let mut ids: BTreeMap<String, usize> = BTreeMap::new();
    for (i, r) in list.iter().enumerate() {
        let pointer = idx("/learnerResponses", i);
        let Some(id) = nonempty(r.get("id")) else {
            d.add("MIG_RECORD_UNIDENTIFIABLE", Some(&pointer), json!({"kind": "learner_response"}));
            continue;
        };
        if r.get("documentType") != Some(&json!(LR_TYPE)) {
            d.add(
                "MIG_RECORD_KIND_UNKNOWN",
                Some(&format!("{pointer}/documentType")),
                json!({"found": r.get("documentType").cloned().unwrap_or(Value::Null)}),
            );
            continue;
        }
        match r.pointer("/material/type") {
            Some(Value::String(t)) if t == "quiz-paper" || t == "translation-document" => {}
            other => {
                d.add(
                    "MIG_RECORD_KIND_UNKNOWN",
                    Some(&format!("{pointer}/material/type")),
                    json!({"found": other.cloned().unwrap_or(Value::Null)}),
                );
                continue;
            }
        }
        if let Some(first) = ids.insert(id.to_string(), i) {
            d.add("MIG_IDENTITY_AMBIGUOUS", Some(&pointer), json!({"kind": "learner_response", "id": id, "firstPosition": first}));
            continue;
        }
        for f in ["/material/id", "/session/id", "/session/completedAt"] {
            if !text_ok(r, f) {
                d.add("MIG_SECTION_SHAPE", Some(&format!("{pointer}{f}")), json!({"reason": "expected a string"}));
            }
        }
        if let Some(Value::Array(items)) = r.pointer("/material/snapshot/items") {
            for (ii, it) in items.iter().enumerate() {
                for slot in ["image", "audio"] {
                    if let Some(idv) = it.pointer(&format!("/{slot}/id")) {
                        if !idv.is_string() {
                            d.add(
                                "MIG_SECTION_SHAPE",
                                Some(&format!("{pointer}/material/snapshot/items/{ii}/{slot}/id")),
                                json!({"reason": "expected a string"}),
                            );
                        }
                    }
                }
            }
        }
        count_unknown(&mut m.unknown_fields, "learner_response", "/learnerResponses/*", r);
        count_absent(&mut m.timestamps_absent, "learner_response", r, &["finalizedAt", "session.startedAt", "session.completedAt"]);
        m.responses.push(Entity { pointer, position: i, id: id.to_string(), value: r.clone() });
    }
}

fn detect_reviews(obj: &Map<String, Value>, m: &mut Model, d: &mut Diags) {
    let Some(tr) = obj.get("teacherReviews") else {
        d.add("MIG_SECTION_ABSENT", Some("/teacherReviews"), json!({"section": "teacherReviews"}));
        m.sections_present.insert("teacherReviews".into(), false);
        return;
    };
    let Some(list) = tr.as_array() else {
        d.add("MIG_SECTION_SHAPE", Some("/teacherReviews"), json!({"reason": "must be an array"}));
        return;
    };
    m.sections_present.insert("teacherReviews".into(), true);
    let mut ids: BTreeMap<String, usize> = BTreeMap::new();
    for (i, r) in list.iter().enumerate() {
        let pointer = idx("/teacherReviews", i);
        let Some(id) = nonempty(r.get("id")) else {
            d.add("MIG_RECORD_UNIDENTIFIABLE", Some(&pointer), json!({"kind": "teacher_review"}));
            continue;
        };
        if r.get("documentType") != Some(&json!(TR_TYPE)) {
            d.add(
                "MIG_RECORD_KIND_UNKNOWN",
                Some(&format!("{pointer}/documentType")),
                json!({"found": r.get("documentType").cloned().unwrap_or(Value::Null)}),
            );
            continue;
        }
        if let Some(first) = ids.insert(id.to_string(), i) {
            d.add("MIG_IDENTITY_AMBIGUOUS", Some(&pointer), json!({"kind": "teacher_review", "id": id, "firstPosition": first}));
            continue;
        }
        if nonempty(r.get("responseId")).is_none() {
            d.add("MIG_RECORD_UNIDENTIFIABLE", Some(&format!("{pointer}/responseId")), json!({"kind": "teacher_review.responseId"}));
            continue;
        }
        if !text_ok(r, "/createdAt") {
            d.add("MIG_SECTION_SHAPE", Some(&format!("{pointer}/createdAt")), json!({"reason": "expected a string"}));
        }
        count_unknown(&mut m.unknown_fields, "teacher_review", "/teacherReviews/*", r);
        count_absent(&mut m.timestamps_absent, "teacher_review", r, &["createdAt"]);
        m.reviews.push(Entity { pointer, position: i, id: id.to_string(), value: r.clone() });
    }
}

fn detect_history(obj: &Map<String, Value>, m: &mut Model, d: &mut Diags) {
    let Some(h) = obj.get("history") else {
        d.add("MIG_SECTION_ABSENT", Some("/history"), json!({"section": "history"}));
        m.sections_present.insert("history".into(), false);
        return;
    };
    let Some(list) = h.as_array() else {
        d.add("MIG_SECTION_SHAPE", Some("/history"), json!({"reason": "must be an array"}));
        return;
    };
    m.sections_present.insert("history".into(), true);
    m.history_cap_possible = list.len() == 100;
    for (i, e) in list.iter().enumerate() {
        if !e.is_object() {
            d.add("MIG_SECTION_SHAPE", Some(&idx("/history", i)), json!({"reason": "history entry must be an object"}));
            continue;
        }
        count_unknown(&mut m.unknown_fields, "history", "/history/*", e);
        count_absent(&mut m.timestamps_absent, "history", e, &["completedAt"]);
    }
}

// -------------------------------------------------------------------------------- identity / referential

/// UTF-16 code units of a string (V1 offsets are measured in these).
pub fn utf16(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

fn answers_by_item(r: &Value) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    if let Some(Value::Array(rs)) = r.get("responses") {
        for x in rs {
            if let (Some(id), Some(Value::String(a))) = (nonempty(x.get("itemId")), x.get("answer")) {
                out.insert(id.to_string(), a.clone());
            }
        }
    }
    out
}

/// Section 9.4: hard relationships and Learner Response invariants (stage `referential`), then the
/// diagnostic-only soft-reference report.
pub fn validate_references(m: &mut Model, d: &mut Diags) {
    let resp_by_id: BTreeMap<&str, &Entity> = m.responses.iter().map(|e| (e.id.as_str(), e)).collect();
    let review_by_id: BTreeMap<&str, &Entity> = m.reviews.iter().map(|e| (e.id.as_str(), e)).collect();
    let folder_ids: BTreeSet<&str> = m.folders.iter().map(|e| e.id.as_str()).collect();

    // Learner Response invariants (I-5)
    for e in &m.responses {
        let r = &e.value;
        let items = r.pointer("/material/snapshot/items").and_then(Value::as_array);
        let responses = r.get("responses").and_then(Value::as_array);
        let mut item_ids = BTreeSet::new();
        let mut bad = |why: String| d.add("MIG_LEARNER_RESPONSE_INVARIANT", Some(&e.pointer), json!({"id": e.id, "reason": why}));
        match items {
            Some(its) if !its.is_empty() => {
                for it in its {
                    match nonempty(it.get("id")) {
                        Some(i) => {
                            if !item_ids.insert(i.to_string()) {
                                bad(format!("duplicate snapshot item id {i}"));
                            }
                        }
                        None => bad("a snapshot item has no id".into()),
                    }
                }
            }
            _ => bad("material snapshot items are required".into()),
        }
        match responses {
            Some(rs) if !rs.is_empty() => {
                let mut seen = BTreeSet::new();
                for x in rs {
                    match nonempty(x.get("itemId")) {
                        Some(i) => {
                            if !seen.insert(i.to_string()) {
                                bad(format!("duplicate response for item {i}"));
                            }
                            if !item_ids.contains(i) {
                                bad(format!("response for unknown item {i}"));
                            }
                        }
                        None => bad("a response has no itemId".into()),
                    }
                }
                for i in &item_ids {
                    if !seen.contains(i) {
                        bad(format!("missing response for item {i}"));
                    }
                }
                if r.pointer("/summary/itemCount") != Some(&json!(rs.len())) {
                    bad("summary.itemCount does not match the response count".into());
                }
            }
            _ => bad("responses are required".into()),
        }
    }

    // Teacher Review -> Learner Response (I-1, I-2)
    for e in &m.reviews {
        let rid = e.value["responseId"].as_str().unwrap_or_default();
        let Some(resp) = resp_by_id.get(rid) else {
            d.add(
                "MIG_REF_UNRESOLVED",
                Some(&format!("{}/responseId", e.pointer)),
                json!({"kind": "teacher_review->learner_response", "id": e.id, "target": rid}),
            );
            continue;
        };
        let known: BTreeSet<&str> = resp
            .value
            .get("responses")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|x| x.get("itemId").and_then(Value::as_str)).collect())
            .unwrap_or_default();
        if let Some(Value::Array(irs)) = e.value.get("itemReviews") {
            for (i, ir) in irs.iter().enumerate() {
                match ir.get("itemId").and_then(Value::as_str) {
                    Some(iid) if known.contains(iid) => {}
                    other => d.add(
                        "MIG_REF_UNRESOLVED",
                        Some(&format!("{}/itemReviews/{i}/itemId", e.pointer)),
                        json!({"kind": "teacher_review.item->response.item", "id": e.id, "target": other}),
                    ),
                }
            }
        }
    }

    // document -> folder (I-9) and live remediation provenance (I-7)
    for e in &m.documents {
        match nonempty(e.value.get("folderId")) {
            Some(fid) if folder_ids.contains(fid) => {}
            other => d.add(
                "MIG_REF_UNRESOLVED",
                Some(&format!("{}/folderId", e.pointer)),
                json!({"kind": "translation_document->translation_folder", "id": e.id, "target": other}),
            ),
        }
        if let Some(p) = e.value.get("provenance").filter(|p| p.get("purpose") == Some(&json!("remediation"))) {
            let rp = format!("{}/provenance", e.pointer);
            let mut bad =
                |why: &str| d.add("MIG_REF_UNRESOLVED", Some(&rp), json!({"kind": "remediation-provenance", "id": e.id, "reason": why}));
            let (sr, sv) = (nonempty(p.get("sourceResponseId")), nonempty(p.get("sourceReviewId")));
            if sr.is_none() {
                bad("sourceResponseId is required");
            }
            if sv.is_none() {
                bad("sourceReviewId is required");
            }
            let resp = sr.and_then(|i| resp_by_id.get(i));
            if sr.is_some() && resp.is_none() {
                bad("sourceResponseId does not resolve to a Learner Response");
            }
            let rev = sv.and_then(|i| review_by_id.get(i));
            if sv.is_some() && rev.is_none() {
                bad("sourceReviewId does not resolve to a Teacher Review");
            }
            if let (Some(rev), Some(sr)) = (rev, sr) {
                if rev.value.get("responseId").and_then(Value::as_str) != Some(sr) {
                    bad("sourceReviewId belongs to a different Learner Response");
                }
            }
            if let (Some(sm), Some(resp)) = (nonempty(p.get("sourceMaterialId")), resp) {
                if resp.value.pointer("/material/id").and_then(Value::as_str) != Some(sm) {
                    bad("sourceMaterialId does not match the source response material");
                }
            }
        }
    }

    // soft provenance (I-8): reportable, never repaired (M-7)
    let mut dangling = 0u64;
    let mut dangling_ptrs = vec![];
    let mut soft = |pointer: &str, p: Option<&Value>| {
        let Some(p) = p else { return };
        let missing_resp = nonempty(p.get("sourceResponseId")).is_some_and(|i| !resp_by_id.contains_key(i));
        let missing_rev = nonempty(p.get("sourceReviewId")).is_some_and(|i| !review_by_id.contains_key(i));
        if missing_resp || missing_rev {
            dangling += 1;
            if dangling_ptrs.len() < 20 {
                dangling_ptrs.push(pointer.to_string());
            }
        }
    };
    for e in &m.responses {
        soft(&format!("{}/provenance", e.pointer), e.value.get("provenance"));
    }
    for e in m.documents.iter().filter(|e| e.value.pointer("/provenance/purpose") != Some(&json!("remediation"))) {
        soft(&format!("{}/provenance", e.pointer), e.value.get("provenance"));
    }
    if dangling > 0 {
        d.add("MIG_PROVENANCE_DANGLING", None, json!({"count": dangling, "firstPointers": dangling_ptrs}));
    }
}

// ----------------------------------------------------------------------------------------------- media

fn collect_item_refs(items: &Value, base: &str, out: &mut Vec<(String, MediaClass, String)>, d: &mut Diags) {
    let Some(arr) = items.as_array() else { return };
    for (i, it) in arr.iter().enumerate() {
        for (slot, class) in [("image", MediaClass::Image), ("audio", MediaClass::Audio)] {
            if let Some(Value::String(id)) = it.pointer(&format!("/{slot}/id")) {
                if id.trim().is_empty() {
                    continue; // V1 ignores an empty reference
                }
                let pointer = format!("{base}/{i}/{slot}/id");
                if id.trim() != id {
                    d.add(
                        "MIG_REF_UNRESOLVED",
                        Some(&pointer),
                        json!({"kind": "media-reference", "reason": "reference id has surrounding whitespace", "target": id}),
                    );
                    continue;
                }
                out.push((id.clone(), class, pointer));
            }
        }
    }
}

/// Section 10: resolve references by V1's contract, fail closed on missing media, report orphans.
pub fn validate_media(m: &mut Model, root: &Value, d: &mut Diags) {
    let mut refs: Vec<(String, MediaClass, String)> = vec![];
    for p in &m.papers {
        if let Some(q) = p.value.get("questions") {
            collect_item_refs(q, &format!("{}/questions", p.pointer), &mut refs, d);
        }
    }
    for r in &m.responses {
        if let Some(items) = r.value.pointer("/material/snapshot/items") {
            collect_item_refs(items, &format!("{}/material/snapshot/items", r.pointer), &mut refs, d);
        }
    }
    let by_id: BTreeMap<&str, &Asset> = m.assets.iter().map(|a| (a.id.as_str(), a)).collect();
    let mut missing: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (id, class, pointer) in &refs {
        match by_id.get(id.as_str()) {
            None => missing.entry(id.clone()).or_default().push(pointer.clone()),
            Some(a) => {
                if mime_class(&a.mime) != Some(*class) {
                    d.add(
                        "MIG_MEDIA_MIME_CLASS",
                        Some(pointer),
                        json!({"id": id, "mimeType": a.mime, "expected": if *class == MediaClass::Image { "image" } else { "audio" }}),
                    );
                }
                m.referenced.entry(id.clone()).or_default().push(pointer.clone());
            }
        }
    }
    for (id, ptrs) in missing {
        d.add("MIG_MEDIA_MISSING", None, json!({"id": id, "references": ptrs}));
    }
    // orphans: assets nothing references (D-8) - reported, never silently dropped
    let (kept, orphans): (Vec<Asset>, Vec<Asset>) =
        std::mem::take(&mut m.assets).into_iter().partition(|a| m.referenced.contains_key(&a.id));
    m.assets = kept;
    if !orphans.is_empty() {
        let ids: BTreeSet<&str> = orphans.iter().map(|a| a.id.as_str()).collect();
        let mut mentions: BTreeMap<String, Vec<String>> = BTreeMap::new();
        scan_mentions(root, "", &ids, &mut mentions);
        for a in &orphans {
            d.add(
                "MIG_MEDIA_UNREFERENCED_NOT_MIGRATED",
                Some(&a.pointer),
                json!({"id": a.id, "mimeType": a.mime, "size": a.size, "sha256": a.sha256}),
            );
            if let Some(ps) = mentions.get(&a.id) {
                d.add("MIG_MEDIA_ID_IN_UNMODELED_FIELD", Some(&ps[0]), json!({"id": a.id, "pointers": ps}));
            }
            if let Some(t) = &a.blob_tmp {
                let _ = std::fs::remove_file(t);
            }
        }
    }
    m.unreferenced = orphans;
    // shared content under distinct ids: reportable
    let mut by_hash: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for a in &m.assets {
        by_hash.entry(a.sha256.as_str()).or_default().push(a.id.as_str());
    }
    for (h, ids) in by_hash {
        if ids.len() > 1 {
            d.add("MIG_MEDIA_SHARED_CONTENT", None, json!({"sha256": h, "ids": ids}));
        }
    }
}

/// Diagnostic only: string values equal to an unreferenced asset id, outside the asset lists themselves.
fn scan_mentions(v: &Value, at: &str, ids: &BTreeSet<&str>, out: &mut BTreeMap<String, Vec<String>>) {
    match v {
        Value::String(s) => {
            if ids.contains(s.as_str()) {
                out.entry(s.clone()).or_default().push(at.to_string());
            }
        }
        Value::Array(a) => {
            if at == "/mediaAssets" || at == "/assets" {
                return;
            }
            for (i, x) in a.iter().enumerate() {
                scan_mentions(x, &format!("{at}/{i}"), ids, out);
            }
        }
        Value::Object(o) => {
            for (k, x) in o {
                scan_mentions(x, &format!("{at}/{}", esc(k)), ids, out);
            }
        }
        _ => {}
    }
}

// ------------------------------------------------------------------------------------------- semantic

fn splits_surrogate(units: &[u16], at: usize) -> bool {
    at > 0 && at < units.len() && (0xDC00..0xE000).contains(&units[at]) && (0xD800..0xDC00).contains(&units[at - 1])
}

/// UTF-16 anchor validation (V1 I-3) for learner annotations and teacher corrections.
pub fn validate_anchors(m: &Model, d: &mut Diags) {
    let mut splits = 0u64;
    let mut check = |pointer: &str,
                     answer: &[u16],
                     start: &Value,
                     end: &Value,
                     text: &Value,
                     what: &str,
                     min_len: i64,
                     d: &mut Diags|
     -> Option<(i64, i64)> {
        let (Some(s), Some(e)) = (start.as_i64(), end.as_i64()) else {
            d.add("MIG_ANCHOR_MISMATCH", Some(pointer), json!({"reason": format!("{what} start/end are not integers")}));
            return None;
        };
        let Value::String(t) = text else {
            d.add("MIG_ANCHOR_MISMATCH", Some(pointer), json!({"reason": format!("{what} anchored text is not a string")}));
            return None;
        };
        if s < 0 || e < s + min_len || e as usize > answer.len() {
            d.add(
                "MIG_ANCHOR_MISMATCH",
                Some(pointer),
                json!({"reason": format!("{what} range is outside the learner answer"), "start": s, "end": e}),
            );
            return None;
        }
        if answer[s as usize..e as usize] != utf16(t)[..] {
            d.add(
                "MIG_ANCHOR_MISMATCH",
                Some(pointer),
                json!({"reason": format!("{what} text does not match the anchored span"), "start": s, "end": e}),
            );
            return None;
        }
        if splits_surrogate(answer, s as usize) || splits_surrogate(answer, e as usize) {
            splits += 1;
        }
        Some((s, e))
    };
    for e in &m.responses {
        let answers = answers_by_item(&e.value);
        let mut spans: BTreeMap<String, Vec<(i64, i64)>> = BTreeMap::new();
        if let Some(Value::Array(anns)) = e.value.get("learnerAnnotations") {
            for (i, a) in anns.iter().enumerate() {
                let pointer = format!("{}/learnerAnnotations/{i}", e.pointer);
                let Some(item) = nonempty(a.get("itemId")) else {
                    d.add("MIG_ANCHOR_MISMATCH", Some(&pointer), json!({"reason": "annotation has no itemId"}));
                    continue;
                };
                let Some(ans) = answers.get(item) else {
                    d.add(
                        "MIG_ANCHOR_MISMATCH",
                        Some(&pointer),
                        json!({"reason": "annotation references an item with no learner answer text"}),
                    );
                    continue;
                };
                let units = utf16(ans);
                let null = Value::Null;
                if let Some(sp) = check(
                    &pointer,
                    &units,
                    a.get("start").unwrap_or(&null),
                    a.get("end").unwrap_or(&null),
                    a.get("text").unwrap_or(&null),
                    "annotation",
                    1,
                    d,
                ) {
                    spans.entry(item.to_string()).or_default().push(sp);
                }
            }
        }
        for (item, list) in spans {
            for i in 0..list.len() {
                for j in i + 1..list.len() {
                    if list[i].0 < list[j].1 && list[j].0 < list[i].1 {
                        d.add("MIG_ANCHOR_MISMATCH", Some(&e.pointer), json!({"reason": "annotations overlap", "item": item}));
                    }
                }
            }
        }
    }
    let resp_by_id: BTreeMap<&str, &Entity> = m.responses.iter().map(|e| (e.id.as_str(), e)).collect();
    for e in &m.reviews {
        let Some(resp) = e.value.get("responseId").and_then(Value::as_str).and_then(|i| resp_by_id.get(i)) else { continue };
        let answers = answers_by_item(&resp.value);
        if let Some(Value::Array(irs)) = e.value.get("itemReviews") {
            for (i, ir) in irs.iter().enumerate() {
                let Some(Value::Array(cs)) = ir.get("corrections") else { continue };
                for (ci, c) in cs.iter().enumerate() {
                    let pointer = format!("{}/itemReviews/{i}/corrections/{ci}", e.pointer);
                    let Some(ans) = ir.get("itemId").and_then(Value::as_str).and_then(|x| answers.get(x)) else {
                        d.add(
                            "MIG_ANCHOR_MISMATCH",
                            Some(&pointer),
                            json!({"reason": "correction references an item with no learner answer text"}),
                        );
                        continue;
                    };
                    let units = utf16(ans);
                    let null = Value::Null;
                    check(
                        &pointer,
                        &units,
                        c.get("start").unwrap_or(&null),
                        c.get("end").unwrap_or(&null),
                        c.get("anchoredText").unwrap_or(&null),
                        "correction",
                        0,
                        d,
                    );
                }
            }
        }
    }
    if splits > 0 {
        d.add("MIG_OFFSET_SPLITS_SURROGATE", None, json!({"count": splits}));
    }
}

// ----------------------------------------------------------------------------------------------- history

fn history_row_id(entry: &Value) -> (String, bool) {
    match nonempty(entry.get("id")) {
        Some(i) => (i.to_string(), false),
        None => (format!("h-{}", canon::hash_hex(entry)), true),
    }
}

/// The fields where V1 duplicated facts between a history entry and its Learner Response (ADR 0002 section 8.1).
/// Returns the names of the fields that disagree.
pub fn reconcile(entry: &Value, resp: &Value) -> Vec<String> {
    let results = Value::Array(
        resp.get("responses")
            .and_then(Value::as_array)
            .map(|a| a.iter().map(|x| x.get("result").cloned().unwrap_or(Value::Null)).collect())
            .unwrap_or_default(),
    );
    let pairs: [(&str, Option<&Value>, Option<Value>); 9] = [
        ("id", entry.get("id"), resp.pointer("/session/id").cloned()),
        ("responseId", entry.get("responseId"), resp.get("id").cloned()),
        ("paperId", entry.get("paperId"), resp.pointer("/material/id").cloned()),
        ("completedAt", entry.get("completedAt"), resp.pointer("/session/completedAt").cloned()),
        ("questionCount", entry.get("questionCount"), resp.pointer("/summary/itemCount").cloned()),
        ("correctCount", entry.get("correctCount"), resp.pointer("/summary/correctCount").cloned()),
        ("percent", entry.get("percent"), resp.pointer("/summary/percent").cloned()),
        ("results", entry.get("results"), Some(results)),
        ("paperTitle", entry.get("paperTitle"), resp.pointer("/material/title").cloned()),
    ];
    pairs
        .into_iter()
        .filter(|(_, a, b)| match (a, b) {
            (Some(a), Some(b)) => !canon_eq(a, b),
            (None, None) => false,
            _ => true,
        })
        .map(|(n, _, _)| n.to_string())
        .collect()
}

/// Classify every history entry against the Learner Responses (section 8) and collapse identical duplicates.
pub fn classify_history(m: &mut Model, root: &Value, d: &mut Diags) {
    let Some(Value::Array(list)) = root.get("history") else { return };
    let resp_by_id: BTreeMap<&str, &Entity> = m.responses.iter().map(|e| (e.id.as_str(), e)).collect();
    let mut rows: Vec<HistoryRow> = vec![];
    let mut collapsed: Vec<(String, Vec<usize>)> = vec![];
    for (i, e) in list.iter().enumerate() {
        if !e.is_object() {
            continue;
        }
        let pointer = idx("/history", i);
        let (row_id, content_derived) = history_row_id(e);
        if let Some(prev) = rows.iter_mut().find(|r| r.row_id == row_id) {
            if canon_eq(&prev.entry, e) {
                prev.collapsed_positions.push(i);
                match collapsed.iter_mut().find(|(r, _)| *r == row_id) {
                    Some((_, v)) => v.push(i),
                    None => collapsed.push((row_id.clone(), vec![prev.position, i])),
                }
            } else {
                d.add("MIG_IDENTITY_AMBIGUOUS", Some(&pointer), json!({"kind": "history", "id": row_id, "firstPosition": prev.position}));
            }
            continue;
        }
        let rid = nonempty(e.get("responseId"));
        let target = rid.and_then(|r| resp_by_id.get(r));
        let (role, twin, divergence) = match target {
            Some(t)
                if t.value.pointer("/material/type") == Some(&json!("quiz-paper"))
                    && t.value.pointer("/session/id") == e.get("id")
                    && e.get("id").is_some() =>
            {
                let div = reconcile(e, &t.value);
                if div.is_empty() {
                    (Role::Twin, Some(t.id.clone()), vec![])
                } else {
                    (Role::TwinDivergent, Some(t.id.clone()), div)
                }
            }
            Some(t) if t.value.pointer("/material/type") != Some(&json!("quiz-paper")) => {
                d.add("MIG_HISTORY_RESPONSE_KIND_MISMATCH", Some(&pointer), json!({"id": row_id, "responseId": t.id}));
                (Role::LegacyOnly, None, vec![])
            }
            _ => (Role::LegacyOnly, None, vec![]),
        };
        rows.push(HistoryRow {
            pointer,
            position: i,
            row_id,
            content_derived,
            entry: e.clone(),
            role,
            twin,
            divergence,
            collapsed_positions: vec![],
        });
    }
    for (id, positions) in collapsed {
        d.add("MIG_HISTORY_DUPLICATE_COLLAPSED", None, json!({"id": id, "positions": positions}));
    }
    let div = rows.iter().filter(|r| r.role == Role::TwinDivergent).count();
    if div > 0 {
        d.add("MIG_HISTORY_TWIN_DIVERGENT", None, json!({"count": div, "rows": rows.iter().filter(|r| r.role == Role::TwinDivergent).take(20).map(|r| json!({"id": r.row_id, "fields": r.divergence})).collect::<Vec<_>>()}));
    }
    if m.history_cap_possible {
        d.add("MIG_HISTORY_CAP_POSSIBLE", Some("/history"), json!({"entries": 100}));
    }
    m.history = rows;
}
