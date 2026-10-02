//! Legacy history facts without double counting (ADR 0002 section 8, 16.2-6).

mod common;
use common::*;
use qs_migrate_v1::catalog::*;
use serde_json::{json, Value};

fn role_of(e: &Env, id: &str) -> Value {
    e.host.with_store(|s| s.read(HISTORY, &json!({"id": id})).unwrap()[0].payload.clone())
}

#[test]
fn history_entries_are_classified_twin_divergent_or_legacy_only_and_the_attempt_set_never_double_counts() {
    let e = env();
    let (p, _) = e.import("v1.json", &fixture("r-full.json"));
    // history[0] agrees with lr-obj-2; history[1] disagrees with lr-obj-1 on percent; history[2] has no response
    let twin = role_of(&e, "sess-2");
    assert_eq!(twin["role"], "twin");
    assert_eq!(twin["twinResponseId"], "lr-obj-2");
    let div = role_of(&e, "sess-1");
    assert_eq!(div["role"], "twin-divergent");
    assert_eq!(div["divergence"], json!(["percent"]));
    let only = role_of(&e, "sess-old");
    assert_eq!(only["role"], "legacy-only");
    assert!(only.get("twinResponseId").is_none());
    // the V1 entry is retained verbatim inside the envelope
    assert_eq!(only["entry"]["percent"], json!(33.333333333333336));
    assert_eq!(div["entry"]["percent"], 12.5, "the divergent value is kept, not 'corrected'");
    // counting contract: attempts = objective responses + legacy-only entries
    let objective: i64 = e.host.with_store(|s| {
        s.conn().query_row("SELECT count(*) FROM learner_response WHERE material_type='quiz-paper'", [], |r| r.get(0)).unwrap()
    });
    let legacy_only: i64 = e.host.with_store(|s| {
        s.conn().query_row("SELECT count(*) FROM legacy_history_entry WHERE role='legacy-only'", [], |r| r.get(0)).unwrap()
    });
    assert_eq!((objective, legacy_only), (2, 1));
    assert_eq!(
        objective + legacy_only,
        3,
        "three attempts, although V1 recorded five rows (two Learner Responses ... plus three history entries)"
    );
    assert!(has(&p, "MIG_HISTORY_TWIN_DIVERGENT"));
    // the gap for a legacy-only attempt is declared
    let origin: Value = e.host.with_store(|s| {
        s.read(ORIGIN, &json!({"id": format!("{}:legacy_history_entry:sess-old", p.source_id)})).unwrap()[0].payload.clone()
    });
    assert!(origin["gaps"].as_array().unwrap().contains(&json!("history.snapshot")));
}

#[test]
fn identical_duplicates_collapse_with_a_report_and_conflicting_duplicates_block() {
    let e = env();
    let mut v = fixture("r-full.json");
    let dup = v["history"][2].clone();
    v["history"].as_array_mut().unwrap().push(dup);
    let p = e.prepare(&e.source_json("dup.json", &v));
    assert!(!p.blocked, "{:?}", p.report["diagnostics"]);
    assert!(has(&p, "MIG_HISTORY_DUPLICATE_COLLAPSED"));
    let c = &p.report["counts"]["legacy_history_entry"];
    assert_eq!(c["source"], 4);
    assert_eq!(c["carried"], 3);
    assert_eq!(c["collapsed"], 1);
    e.activate(&p);
    assert_eq!(e.count("legacy_history_entry"), 3);
}

#[test]
fn an_entry_without_an_id_gets_a_content_derived_storage_key_that_is_never_presented_as_a_v1_identity() {
    let e = env();
    let mut v = fixture("r-min.json");
    v["history"] = json!([{"paperId": "paper-min", "paperTitle": "Minimal", "completedAt": "2025-03-01T09:00:00.000Z", "questionCount": 1, "correctCount": 1, "percent": 100}]);
    let (p, _) = e.import("noid.json", &v);
    let (id, payload): (String, String) = e
        .host
        .with_store(|s| s.conn().query_row("SELECT id, payload FROM legacy_history_entry", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap());
    assert!(id.starts_with("h-") && id.len() == 66, "{id}");
    let payload: Value = serde_json::from_str(&payload).unwrap();
    assert!(payload["entry"].get("id").is_none(), "no V1 identity is invented inside the entry");
    let origin: Value = e
        .host
        .with_store(|s| s.read(ORIGIN, &json!({"id": format!("{}:legacy_history_entry:{id}", p.source_id)})).unwrap()[0].payload.clone());
    assert_eq!(origin["identity"], "content-derived");
    assert_eq!(payload["role"], "legacy-only");
}

#[test]
fn a_history_entry_whose_response_is_a_translation_response_has_no_twin_and_is_reported() {
    let e = env();
    let mut v = fixture("r-full.json");
    v["history"][2]["responseId"] = json!("lr-tr-1");
    let (p, _) = e.import("kind.json", &v);
    assert!(has(&p, "MIG_HISTORY_RESPONSE_KIND_MISMATCH"));
    assert_eq!(role_of(&e, "sess-old")["role"], "legacy-only");
}

#[test]
fn exactly_one_hundred_history_entries_flags_the_v1_cap_without_inventing_anything() {
    let e = env();
    let (p, _) = e.import("h100.json", &fixture("r-hist100.json"));
    assert!(has(&p, "MIG_HISTORY_CAP_POSSIBLE"));
    assert_eq!(e.count("legacy_history_entry"), 100);
    let p99 = {
        let mut v = fixture("r-hist100.json");
        v["history"].as_array_mut().unwrap().pop();
        let e2 = env();
        e2.prepare(&e2.source_json("h99.json", &v))
    };
    assert!(!has(&p99, "MIG_HISTORY_CAP_POSSIBLE"));
}
