//! Projection extractors: derive the DB-enforced projection of a payload.
//! The Store Port compares caller-supplied projection with this and rejects any disagreement.
use anyhow::{anyhow, Result};
use serde_json::{json, Value};

fn s(v: &Value, path: &[&str]) -> Option<String> {
    let mut cur = v;
    for p in path {
        cur = cur.get(*p)?;
    }
    cur.as_str().map(|x| x.to_string())
}

pub fn extract(collection: &str, payload: &Value) -> Result<Value> {
    Ok(match collection {
        "learner_response" => {
            let items: Vec<Value> = payload
                .get("responses")
                .and_then(|r| r.as_array())
                .ok_or_else(|| anyhow!("learner_response: responses[] missing"))?
                .iter()
                .map(|r| r.get("itemId").cloned().unwrap_or(Value::Null))
                .collect();
            let media = payload.get("mediaRefs").cloned().unwrap_or(json!([]));
            json!({
                "paperId": s(payload, &["material", "id"]).ok_or_else(|| anyhow!("learner_response: material.id missing"))?,
                "title": s(payload, &["material", "title"]),
                "finalizedAt": s(payload, &["finalizedAt"]),
                "itemCount": items.len(),
                "items": items,
                "mediaRefs": media,
            })
        }
        "teacher_review" => json!({"responseId": s(payload, &["responseId"]).ok_or_else(|| anyhow!("teacher_review: responseId missing"))?}),
        "remediation_doc" => json!({
            "sourceResponseId": s(payload, &["sourceResponseId"]).ok_or_else(|| anyhow!("remediation_doc: sourceResponseId missing"))?,
            "sourceReviewId": s(payload, &["sourceReviewId"]),
        }),
        "history_entry" => json!({"responseId": s(payload, &["responseId"])}),
        "recovery_session" => json!({}),
        "uow_marker" => json!({"n": payload.get("n").cloned().unwrap_or(Value::Null), "rows": payload.get("rows").cloned().unwrap_or(Value::Null)}),
        other => return Err(anyhow!("unknown collection {other}")),
    })
}
