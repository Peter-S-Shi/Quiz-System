//! H3: isolated staging -> validation -> pre-activation snapshot -> single-transaction ATTACH commit -> rollback.
//! Same primitive for merge, replace (restore/migration) and rollback.
use crate::{canon, fault, journal, mem, media, schema, store};
use crate::store::Store;
use anyhow::{anyhow, bail, Result};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Mode {
    Merge,
    Replace,
}
impl Mode {
    pub fn name(&self) -> &'static str {
        match self {
            Mode::Merge => "merge",
            Mode::Replace => "replace",
        }
    }
    pub fn parse(s: &str) -> Result<Mode> {
        match s {
            "merge" => Ok(Mode::Merge),
            "replace" => Ok(Mode::Replace),
            o => bail!("bad mode {o}"),
        }
    }
}

pub fn uri_for(path: &Path, mode: &str) -> String {
    let abs = std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf());
    let p = abs.to_string_lossy().trim_start_matches("\\\\?\\").replace('\\', "/");
    let mut enc = String::new();
    for ch in p.chars() {
        match ch {
            ' ' => enc.push_str("%20"),
            '#' => enc.push_str("%23"),
            '?' => enc.push_str("%3f"),
            '%' => enc.push_str("%25"),
            c => enc.push(c),
        }
    }
    let enc = enc.trim_start_matches('/').to_string();
    format!("file:///{enc}?mode={mode}")
}

/// Full validation of a staging DB in isolation. Returns blocking problems (empty = valid).
pub fn validate_staging(staging: &Path, live_root: &Path) -> Result<Vec<String>> {
    let c = Connection::open(uri_for(staging, "ro"))?;
    let mut bad = vec![];
    let qc: String = c.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
    if qc != "ok" {
        bad.push(format!("quick_check: {qc}"));
    }
    let appid: i32 = c.query_row("PRAGMA application_id", [], |r| r.get(0))?;
    if appid != schema::APPLICATION_ID {
        bad.push("application_id mismatch".into());
    }
    bad.extend(store::check_consistency_conn(&c)?);
    // media presence (fail closed): every media_object must exist in the live content-addressed store
    let mut st = c.prepare("SELECT id, content_hash, size FROM media_object")?;
    let mut rows = st.query([])?;
    while let Some(r) = rows.next()? {
        let (id, hash, size): (String, String, i64) = (r.get(0)?, r.get(1)?, r.get(2)?);
        let p = media::path_for(live_root, &hash);
        match fs::metadata(&p) {
            Ok(m) if m.len() as i64 == size => {}
            Ok(_) => bad.push(format!("media {id}: size mismatch")),
            Err(_) => bad.push(format!("media {id}: file missing")),
        }
    }
    Ok(bad)
}

fn cols(c: &Connection, schema_name: &str, table: &str) -> Result<Vec<(String, bool)>> {
    let mut st = c.prepare(&format!("SELECT name, pk FROM pragma_table_info('{table}', '{schema_name}')"))?;
    let v = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? > 0)))?.collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(v)
}

pub struct Report {
    pub op_id: String,
    pub mode: Mode,
    pub validate_ms: u128,
    pub snapshot_ms: u128,
    pub commit_ms: u128,
    pub peak_mib: f64,
    pub pre_hash: String,
    pub post_hash: String,
}
impl Report {
    pub fn to_json(&self) -> Value {
        json!({"opId": self.op_id, "mode": self.mode.name(), "validateMs": self.validate_ms as u64, "snapshotMs": self.snapshot_ms as u64,
               "commitMs": self.commit_ms as u64, "peakWorkingSetMiB": self.peak_mib, "preHash": self.pre_hash, "postHash": self.post_hash})
    }
}

pub fn activate(store: &mut Store, staging: &Path, mode: Mode, op_id: &str) -> Result<Report> {
    activate_inner(store, staging, mode, op_id, "mid-copy", true)
}

/// Rollback = apply the pre-activation snapshot through the same primitive (replace mode).
pub fn rollback(store: &mut Store, op_id: &str) -> Result<Report> {
    let snap = store.root.join("snapshots").join(format!("pre-{op_id}.db"));
    if !snap.exists() {
        bail!("no pre-activation snapshot for {op_id}");
    }
    let work = store.root.join("staging").join(format!("rb-{op_id}.db"));
    fs::copy(&snap, &work)?;
    normalize_staging(&work)?;
    activate_inner(store, &work, Mode::Replace, &format!("rb-{op_id}"), "during-rollback", false)
}

pub fn restore_snapshot_file(store: &mut Store, snap: &Path) -> Result<Report> {
    let work = store.root.join("staging").join("restore-snap.db");
    fs::copy(snap, &work)?;
    normalize_staging(&work)?;
    activate_inner(store, &work, Mode::Replace, &format!("restore-{}", fastrand::u32(..)), "mid-copy", false)
}

/// Staging DBs are read through `mode=ro`; make sure they are in rollback-journal mode (no -shm needed).
pub fn normalize_staging(path: &Path) -> Result<()> {
    let c = Connection::open(path)?;
    let _: String = c.query_row("PRAGMA journal_mode=DELETE", [], |r| r.get(0))?;
    Ok(())
}

fn activate_inner(store: &mut Store, staging: &Path, mode: Mode, op_id: &str, mid_ckpt: &str, with_gc_and_validate: bool) -> Result<Report> {
    let root = store.root.clone();
    journal::write(&root, op_id, "begun", json!({"mode": mode.name(), "staging": staging.file_name().map(|s| s.to_string_lossy().to_string())}))?;

    // 1-2. validation in isolation
    let t = Instant::now();
    if with_gc_and_validate {
        let bad = validate_staging(staging, &root)?;
        if !bad.is_empty() {
            journal::write(&root, op_id, "aborted", json!({"reason": "validation", "problems": bad.len()}))?;
            bail!("VALIDATION_FAILED: {} problem(s); first: {}", bad.len(), bad[0]);
        }
    }
    let validate_ms = t.elapsed().as_millis();
    let staging_hash_before = file_sha(staging)?;

    // 3. snapshot
    fault::point("before-snapshot");
    let t = Instant::now();
    let pre_hash = store.state_hash()?;
    let snap = root.join("snapshots").join(format!("pre-{op_id}.db"));
    if with_gc_and_validate {
        store.snapshot_to(&snap)?;
    }
    let snapshot_ms = t.elapsed().as_millis();
    journal::write(&root, op_id, "snapshotted", json!({"preHash": pre_hash}))?;
    fault::point("after-snapshot");

    // 4. commit point: one transaction on the live connection
    let t = Instant::now();
    let uri = uri_for(staging, "ro");
    store.conn.execute("ATTACH DATABASE ?1 AS stg", [&uri])?;
    let res = (|| -> Result<()> {
        let tx = store.conn.unchecked_transaction_immediate()?;
        let canonical: Vec<&str> = schema::TABLES.iter().copied().filter(|t| *t != "recovery_session").collect();
        if mode == Mode::Replace {
            for t in canonical.iter().rev() {
                tx.execute(&format!("DELETE FROM main.{t}"), [])?;
            }
        }
        for (i, t) in canonical.iter().enumerate() {
            let sc = cols(&tx, "stg", t)?;
            let mc = cols(&tx, "main", t)?;
            let common: Vec<&(String, bool)> = sc.iter().filter(|(n, _)| mc.iter().any(|(m, _)| m == n)).collect();
            let names = common.iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>().join(",");
            if mode == Mode::Merge && (*t == "response_item" || *t == "media_ref") {
                let (col, parent) = if *t == "response_item" { ("response_id", "learner_response") } else { ("owner_id", "learner_response") };
                tx.execute(&format!("DELETE FROM main.{t} WHERE {col} IN (SELECT id FROM stg.{parent})"), [])?;
            }
            let pk: Vec<&str> = mc.iter().filter(|(_, p)| *p).map(|(n, _)| n.as_str()).collect();
            let upd: Vec<String> = common.iter().filter(|(n, _)| !pk.contains(&n.as_str())).map(|(n, _)| format!("{n}=excluded.{n}")).collect();
            let conflict = if mode == Mode::Merge {
                if upd.is_empty() {
                    format!("ON CONFLICT({}) DO NOTHING", pk.join(","))
                } else {
                    format!("ON CONFLICT({}) DO UPDATE SET {}", pk.join(","), upd.join(","))
                }
            } else {
                String::new()
            };
            tx.execute(&format!("INSERT INTO main.{t}({names}) SELECT {names} FROM stg.{t} WHERE true {conflict}"), [])?;
            if i == 2 {
                fault::point(mid_ckpt);
            }
        }
        tx.execute("INSERT INTO main.applied_ops(op_id,kind,mode) VALUES(?1,'activation',?2)", [op_id, mode.name()])?;
        fault::point("before-commit");
        tx.commit()?;
        Ok(())
    })();
    if res.is_err() && !store.conn.is_autocommit() {
        let _ = store.conn.execute_batch("ROLLBACK");
    }
    let _ = store.conn.execute("DETACH DATABASE stg", []);
    res.map_err(|e| anyhow!("ACTIVATION_FAILED (live unchanged): {e}"))?;
    let commit_ms = t.elapsed().as_millis();
    fault::point("after-commit");
    journal::write(&root, op_id, "done", json!({}))?;
    fault::point("after-journal-done");

    // staging was only read: prove it (WAL + ATTACH writes only to main)
    if file_sha(staging)? != staging_hash_before {
        bail!("INVARIANT: staging file modified by activation");
    }
    if with_gc_and_validate {
        media::gc(&root, &store.conn, 0)?;
    }
    Ok(Report {
        op_id: op_id.to_string(),
        mode,
        validate_ms,
        snapshot_ms,
        commit_ms,
        peak_mib: mem::peak_mib(),
        pre_hash,
        post_hash: store.state_hash()?,
    })
}

fn file_sha(p: &Path) -> Result<String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut f = fs::File::open(p)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex::encode(h.finalize()))
}

/// At next launch: resolve unfinished operations deterministically from the journal.
pub fn recover(store: &Store) -> Result<Vec<String>> {
    let mut out = vec![];
    for j in journal::read_all(&store.root)? {
        let op = j["opId"].as_str().unwrap_or("").to_string();
        let state = j["state"].as_str().unwrap_or("");
        if state == "done" || state == "aborted" {
            continue;
        }
        let applied: i64 = store.conn.query_row("SELECT count(*) FROM applied_ops WHERE op_id=?1", [&op], |r| r.get(0))?;
        if applied > 0 {
            journal::write(&store.root, &op, "done", json!({"resolvedBy": "recovery: committed -> complete-forward"}))?;
            out.push(format!("{op}: {state} -> committed (post-activation)"));
        } else {
            journal::write(&store.root, &op, "aborted", json!({"resolvedBy": "recovery: not committed -> discard"}))?;
            out.push(format!("{op}: {state} -> not committed (pre-activation)"));
        }
    }
    Ok(out)
}

pub fn staging_path(root: &Path, name: &str) -> PathBuf {
    root.join("staging").join(name)
}

trait ImmediateTx {
    fn unchecked_transaction_immediate(&self) -> rusqlite::Result<rusqlite::Transaction<'_>>;
}
impl ImmediateTx for Connection {
    fn unchecked_transaction_immediate(&self) -> rusqlite::Result<rusqlite::Transaction<'_>> {
        rusqlite::Transaction::new_unchecked(self, rusqlite::TransactionBehavior::Immediate)
    }
}

pub fn canonical_hash_of(v: &Value) -> String {
    canon::hash_value(v)
}
