//! On-disk operation journal (atomic write: tmp + fsync + rename). Resolved deterministically at next launch.
use anyhow::Result;
use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn dir(root: &Path) -> PathBuf {
    root.join("journal")
}

pub fn write(root: &Path, op_id: &str, state: &str, extra: Value) -> Result<()> {
    let d = dir(root);
    fs::create_dir_all(&d)?;
    let tmp = d.join(format!("{op_id}.tmp"));
    let fin = d.join(format!("{op_id}.json"));
    let body = json!({"opId": op_id, "state": state, "extra": extra});
    {
        let mut f = File::create(&tmp)?;
        f.write_all(serde_json::to_string(&body)?.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, &fin)?;
    Ok(())
}

pub fn read_all(root: &Path) -> Result<Vec<Value>> {
    let d = dir(root);
    let mut out = vec![];
    if !d.exists() {
        return Ok(out);
    }
    for e in fs::read_dir(&d)? {
        let p = e?.path();
        if p.extension().and_then(|s| s.to_str()) == Some("json") {
            out.push(serde_json::from_str(&fs::read_to_string(&p)?)?);
        } else if p.extension().and_then(|s| s.to_str()) == Some("tmp") {
            let _ = fs::remove_file(&p); // torn journal write: ignore
        }
    }
    Ok(out)
}
