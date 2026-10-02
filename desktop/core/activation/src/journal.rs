//! On-disk operation journal: one small JSON file per operation, replaced atomically (temp + fsync +
//! rename). It records *intent and progress*; the commit fact itself lives inside the database
//! (`operation_journal` row written in the activation transaction), so the two can never disagree about
//! whether an operation was applied.

use qs_platform::{fsx, Code, DataRoot, ResultExt, Result};
use serde_json::{json, Value};
use std::fs;

pub fn write(root: &DataRoot, op_id: &str, kind: &str, mode: &str, state: &str, extra: Value) -> Result<()> {
    fs::create_dir_all(root.journal_dir())?;
    let body = json!({"opId": op_id, "kind": kind, "mode": mode, "state": state, "extra": extra});
    fsx::write_atomic(&root.journal_dir().join(format!("{op_id}.json")), body.to_string().as_bytes())
}

pub fn read_all(root: &DataRoot) -> Result<Vec<Value>> {
    let dir = root.journal_dir();
    let mut out = vec![];
    if !dir.exists() {
        return Ok(out);
    }
    for e in fs::read_dir(&dir)? {
        let p = e?.path();
        match p.extension().and_then(|s| s.to_str()) {
            Some("json") => out.push(serde_json::from_str(&fs::read_to_string(&p)?).ctx(Code::Io, "journal entry")?),
            Some("tmp") => {
                let _ = fs::remove_file(&p); // torn journal write: the previous complete state still stands
            }
            _ => {}
        }
    }
    out.sort_by(|a, b| a["opId"].as_str().cmp(&b["opId"].as_str()));
    Ok(out)
}
