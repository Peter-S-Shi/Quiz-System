//! Store Port implementation (spike). Rust owns the single SQLite connection.
use crate::{canon, fault, proj, schema};
use anyhow::{anyhow, bail, Context, Result};
use rusqlite::{params, Connection, OpenFlags, TransactionBehavior};
use serde_json::{json, Value};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::time::Instant;

pub struct OpenOpts {
    pub synchronous: String, // FULL | NORMAL
    pub lock: bool,          // take exclusive process lock (single-writer)
}
impl Default for OpenOpts {
    fn default() -> Self {
        Self { synchronous: "FULL".into(), lock: false }
    }
}

pub struct Store {
    pub conn: Connection,
    pub root: PathBuf,
    pub schema_version: i32,
    pub notice: Option<String>,
    _lock: Option<File>,
}

pub fn db_path(root: &Path) -> PathBuf {
    root.join("data").join("quiz-studio.db")
}
pub fn media_dir(root: &Path) -> PathBuf {
    root.join("data").join("media")
}

/// Read application_id/user_version WITHOUT any write (read-only handle, no WAL side effects).
pub fn peek_identity(db: &Path) -> Result<(i32, i32)> {
    let c = Connection::open_with_flags(db, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI)?;
    let a: i32 = c.query_row("PRAGMA application_id", [], |r| r.get(0))?;
    let v: i32 = c.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    Ok((a, v))
}

impl Store {
    pub fn open(root: &Path, opts: &OpenOpts) -> Result<Store> {
        for d in ["data", "data/media", "staging", "snapshots", "journal", "recovery-artifacts", "logs"] {
            fs::create_dir_all(root.join(d))?;
        }
        let lock = if opts.lock {
            let f = File::options().create(true).write(true).open(root.join("data").join(".lock"))?;
            f.try_lock().map_err(|e| anyhow!("LOCKED: another process owns the store ({e:?})"))?;
            Some(f)
        } else {
            None
        };
        let mut dbp = db_path(root);
        if dbp.as_os_str().len() > 240 {
            // H4/H8 finding: SQLite cannot open plain paths > MAX_PATH; the verbatim (\\?\) form works.
            dbp = fs::canonicalize(dbp.parent().unwrap())?.join("quiz-studio.db");
        }
        let existed = dbp.exists();
        let mut notice = None;
        if existed {
            let (appid, ver) = peek_identity(&dbp)?;
            if appid != schema::APPLICATION_ID {
                bail!("REFUSED: not a Quiz Studio store (application_id {appid:#x})");
            }
            if ver > schema::SCHEMA_VERSION {
                bail!(
                    "REFUSED: store schema v{ver} is newer than this build supports (v{}); no write performed",
                    schema::SCHEMA_VERSION
                );
            }
        }
        let conn = Connection::open(&dbp)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "synchronous", &opts.synchronous)?;
        let mut st = Store { conn, root: root.to_path_buf(), schema_version: 0, notice: None, _lock: lock };
        if !existed {
            st.create_schema()?;
        } else {
            let ver: i32 = st.conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
            st.schema_version = ver;
            if ver < schema::SCHEMA_VERSION {
                notice = st.upgrade(ver)?;
            }
        }
        st.notice = notice;
        Ok(st)
    }

    fn create_schema(&mut self) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute_batch(schema::DDL_V1)?;
        #[cfg(feature = "v2")]
        tx.execute_batch(schema::MIGRATION_1_TO_2)?;
        tx.execute("INSERT INTO meta(key,value) VALUES('created_by',?1)", [env!("CARGO_PKG_VERSION")])?;
        tx.pragma_update(None, "application_id", schema::APPLICATION_ID)?;
        tx.pragma_update(None, "user_version", schema::SCHEMA_VERSION)?;
        tx.commit()?;
        self.schema_version = schema::SCHEMA_VERSION;
        Ok(())
    }

    /// Forward-only migration, always preceded by an automatic snapshot (H6).
    fn upgrade(&mut self, from: i32) -> Result<Option<String>> {
        let snap = self.root.join("snapshots").join(format!("pre-upgrade-v{from}.db"));
        let _ = fs::remove_file(&snap);
        self.conn.execute("VACUUM INTO ?1", [snap.to_string_lossy().as_ref()])?;
        let before = self.state_hash()?;
        let r: Result<()> = (|| {
            let tx = self.conn.transaction()?;
            if from < 2 {
                tx.execute_batch(schema::MIGRATION_1_TO_2)?;
                #[cfg(feature = "fail_migration")]
                {
                    tx.execute_batch("UPDATE learner_response SET summary_len = -1")?; // partial effect before failing
                    bail!("injected migration failure");
                }
            }
            tx.pragma_update(None, "user_version", schema::SCHEMA_VERSION)?;
            tx.commit()?;
            Ok(())
        })();
        match r {
            Ok(()) => {
                self.schema_version = schema::SCHEMA_VERSION;
                Ok(Some(format!("upgraded store schema v{from} -> v{}", schema::SCHEMA_VERSION)))
            }
            Err(e) => {
                if !self.conn.is_autocommit() {
                    let _ = self.conn.execute_batch("ROLLBACK");
                }
                let after = self.state_hash()?;
                let ver: i32 = self.conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
                let restored = if after != before || ver != from {
                    crate::activation::restore_snapshot_file(self, &snap)?;
                    "snapshot restored"
                } else {
                    "transaction rolled back (state hash verified equal to pre-upgrade)"
                };
                self.schema_version = from;
                Ok(Some(format!("MIGRATION FAILED ({e}); {restored}; running on store schema v{from}")))
            }
        }
    }

    pub fn quick_check(&self) -> Result<bool> {
        let mut st = self.conn.prepare("PRAGMA quick_check")?;
        let rows: Vec<String> = st.query_map([], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
        Ok(rows == vec!["ok".to_string()])
    }

    /// Store Port `commit`: ONE transaction; rejects Units of Work whose projections disagree with payloads.
    pub fn commit(&mut self, uow: &Value) -> Result<Value> {
        let t0 = Instant::now();
        let ops = uow.get("ops").and_then(|o| o.as_array()).ok_or_else(|| anyhow!("REJECT:shape: ops[] missing"))?;
        let v2 = self.schema_version >= 2;
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        if let Some(pre) = uow.get("preconditions").and_then(|p| p.as_array()) {
            for p in pre {
                let coll = p["collection"].as_str().unwrap_or("");
                let id = p["id"].as_str().unwrap_or("");
                let pk = if coll == "uow_marker" { "n" } else { "id" };
                let n: i64 = tx.query_row(&format!("SELECT count(*) FROM {coll} WHERE {pk}=?1"), [id], |r| r.get(0))?;
                match p["kind"].as_str() {
                    Some("absent") if n != 0 => bail!("REJECT:precondition: {coll}/{id} must not exist"),
                    Some("exists") if n == 0 => bail!("REJECT:precondition: {coll}/{id} must exist"),
                    _ => {}
                }
            }
        }
        for op in ops {
            let coll = op["collection"].as_str().ok_or_else(|| anyhow!("REJECT:shape: collection"))?;
            let id = op["id"]
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| op["id"].as_i64().map(|n| n.to_string()))
                .ok_or_else(|| anyhow!("REJECT:shape: id"))?;
            match op["op"].as_str() {
                Some("put") => {
                    let payload = op.get("payload").ok_or_else(|| anyhow!("REJECT:shape: payload"))?;
                    let expected = proj::extract(coll, payload).map_err(|e| anyhow!("REJECT:projection: {e}"))?;
                    let supplied = op.get("proj").ok_or_else(|| anyhow!("REJECT:projection: proj missing for {coll}/{id}"))?;
                    if canon::canonical(&expected) != canon::canonical(supplied) {
                        bail!("REJECT:projection: {coll}/{id} projection disagrees with payload");
                    }
                    let text = serde_json::to_string(payload)?;
                    put(&tx, coll, &id, &text, &expected, v2).with_context(|| format!("REJECT:constraint: put {coll}/{id}"))?;
                }
                Some("delete") => {
                    let pk = if coll == "uow_marker" { "n" } else { "id" };
                    tx.execute(&format!("DELETE FROM {coll} WHERE {pk}=?1"), [&id])
                        .with_context(|| format!("REJECT:constraint: delete {coll}/{id}"))?;
                }
                other => bail!("REJECT:shape: unknown op {other:?}"),
            }
        }
        fault::point("uow-before-commit");
        let c = tx.commit();
        if let Err(e) = c {
            if !self.conn.is_autocommit() {
                let _ = self.conn.execute_batch("ROLLBACK");
            }
            bail!("REJECT:constraint: commit failed: {e}");
        }
        Ok(json!({"ops": ops.len(), "micros": t0.elapsed().as_micros() as u64}))
    }

    pub fn list_history(&self, limit: usize) -> Result<Vec<Value>> {
        let mut st = self.conn.prepare_cached(
            "SELECT lr.id, lr.title, lr.finalized_at, lr.item_count, \
             (SELECT count(*) FROM teacher_review tr WHERE tr.response_id = lr.id) \
             FROM learner_response lr ORDER BY lr.finalized_at DESC, lr.id DESC LIMIT ?1",
        )?;
        let rows = st
            .query_map([limit as i64], |r| {
                Ok(json!({"id": r.get::<_, String>(0)?, "title": r.get::<_, Option<String>>(1)?, "finalizedAt": r.get::<_, Option<String>>(2)?,
                          "itemCount": r.get::<_, i64>(3)?, "reviewCount": r.get::<_, i64>(4)?}))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn count(&self, table: &str) -> Result<i64> {
        Ok(self.conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))?)
    }

    /// Recompute every projection from its payload and compare with the stored columns / relationship rows.
    pub fn check_consistency(&self) -> Result<Vec<String>> {
        check_consistency_conn(&self.conn)
    }

    /// Deterministic hash over all canonical content (payloads canonicalized; relationship rows included).
    pub fn state_hash(&self) -> Result<String> {
        state_hash_conn(&self.conn)
    }

    pub fn snapshot_to(&self, dest: &Path) -> Result<()> {
        let _ = fs::remove_file(dest);
        self.conn.execute("VACUUM INTO ?1", [dest.to_string_lossy().as_ref()])?;
        Ok(())
    }
}

pub fn check_consistency_conn(c: &Connection) -> Result<Vec<String>> {
    let mut bad = vec![];
    let mut st = c.prepare("SELECT id, paper_id, title, finalized_at, item_count, payload FROM learner_response")?;
    let mut items_q = c.prepare("SELECT item_id FROM response_item WHERE response_id=?1 ORDER BY ord")?;
    let mut media_q = c.prepare("SELECT media_id FROM media_ref WHERE owner_id=?1 ORDER BY media_id")?;
    let mut rows = st.query([])?;
    while let Some(r) = rows.next()? {
        let id: String = r.get(0)?;
        let payload: Value = serde_json::from_str(&r.get::<_, String>(5)?)?;
        let e = proj::extract("learner_response", &payload)?;
        let cols = (r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<String>>(3)?, r.get::<_, i64>(4)?);
        if e["paperId"] != json!(cols.0) || e["title"] != json!(cols.1) || e["finalizedAt"] != json!(cols.2) || e["itemCount"] != json!(cols.3) {
            bad.push(format!("learner_response/{id}: column projection mismatch"));
        }
        let items: Vec<String> = items_q.query_map([&id], |x| x.get(0))?.collect::<std::result::Result<_, _>>()?;
        let ei: Vec<String> = e["items"].as_array().unwrap().iter().map(|x| x.as_str().unwrap_or("").to_string()).collect();
        if items != ei {
            bad.push(format!("learner_response/{id}: response_item rows mismatch (db {} vs payload {})", items.len(), ei.len()));
        }
        let media: Vec<String> = media_q.query_map([&id], |x| x.get(0))?.collect::<std::result::Result<_, _>>()?;
        let mut em: Vec<String> = e["mediaRefs"].as_array().unwrap().iter().map(|x| x.as_str().unwrap_or("").to_string()).collect();
        em.sort();
        em.dedup();
        if media != em {
            bad.push(format!("learner_response/{id}: media_ref rows mismatch"));
        }
    }
    for (table, col, key) in [("teacher_review", "response_id", "responseId"), ("remediation_doc", "source_response_id", "sourceResponseId")] {
        let mut st = c.prepare(&format!("SELECT id, {col}, payload FROM {table}"))?;
        let mut rows = st.query([])?;
        while let Some(r) = rows.next()? {
            let id: String = r.get(0)?;
            let payload: Value = serde_json::from_str(&r.get::<_, String>(2)?)?;
            let e = proj::extract(table, &payload)?;
            if e[key] != json!(r.get::<_, String>(1)?) {
                bad.push(format!("{table}/{id}: column projection mismatch"));
            }
        }
    }
    for (q, label) in [
        ("SELECT count(*) FROM response_item WHERE response_id NOT IN (SELECT id FROM learner_response)", "orphan response_item"),
        ("SELECT count(*) FROM media_ref WHERE owner_id NOT IN (SELECT id FROM learner_response)", "orphan media_ref owner"),
        ("SELECT count(*) FROM teacher_review WHERE response_id NOT IN (SELECT id FROM learner_response)", "orphan teacher_review"),
    ] {
        let n: i64 = c.query_row(q, [], |r| r.get(0))?;
        if n > 0 {
            bad.push(format!("{label}: {n}"));
        }
    }
    let fk: i64 = c.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r.get(0))?;
    if fk > 0 {
        bad.push(format!("foreign_key_check violations: {fk}"));
    }
    Ok(bad)
}

fn put(tx: &rusqlite::Transaction, coll: &str, id: &str, text: &str, p: &Value, v2: bool) -> Result<()> {
    match coll {
        "learner_response" => {
            tx.execute(
                "INSERT INTO learner_response(id,paper_id,title,finalized_at,item_count,payload) VALUES(?1,?2,?3,?4,?5,?6) \
                 ON CONFLICT(id) DO UPDATE SET paper_id=excluded.paper_id,title=excluded.title,finalized_at=excluded.finalized_at,item_count=excluded.item_count,payload=excluded.payload",
                params![id, p["paperId"].as_str(), p["title"].as_str(), p["finalizedAt"].as_str(), p["itemCount"].as_i64(), text],
            )?;
            tx.execute("DELETE FROM response_item WHERE response_id=?1", [id])?;
            tx.execute("DELETE FROM media_ref WHERE owner_id=?1", [id])?;
            for (i, it) in p["items"].as_array().unwrap().iter().enumerate() {
                tx.execute("INSERT INTO response_item(response_id,item_id,ord) VALUES(?1,?2,?3)", params![id, it.as_str(), i as i64])?;
            }
            let mut seen = std::collections::BTreeSet::new();
            for m in p["mediaRefs"].as_array().unwrap() {
                if seen.insert(m.as_str().unwrap_or("").to_string()) {
                    tx.execute("INSERT INTO media_ref(owner_id,media_id) VALUES(?1,?2)", params![id, m.as_str()])?;
                }
            }
            if v2 {
                tx.execute("UPDATE learner_response SET summary_len=?2 WHERE id=?1", params![id, p["itemCount"].as_i64()])?;
            }
        }
        "teacher_review" => {
            tx.execute(
                "INSERT INTO teacher_review(id,response_id,payload) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET response_id=excluded.response_id,payload=excluded.payload",
                params![id, p["responseId"].as_str(), text],
            )?;
        }
        "remediation_doc" => {
            tx.execute(
                "INSERT INTO remediation_doc(id,source_response_id,source_review_id,payload) VALUES(?1,?2,?3,?4) \
                 ON CONFLICT(id) DO UPDATE SET source_response_id=excluded.source_response_id,source_review_id=excluded.source_review_id,payload=excluded.payload",
                params![id, p["sourceResponseId"].as_str(), p["sourceReviewId"].as_str(), text],
            )?;
        }
        "history_entry" => {
            tx.execute(
                "INSERT INTO history_entry(id,response_id,payload) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET response_id=excluded.response_id,payload=excluded.payload",
                params![id, p["responseId"].as_str(), text],
            )?;
        }
        "recovery_session" => {
            tx.execute(
                "INSERT INTO recovery_session(id,payload,updated_at) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
                params![id, text, 0i64],
            )?;
        }
        "uow_marker" => {
            tx.execute(
                "INSERT INTO uow_marker(n,rows,payload) VALUES(?1,?2,?3) ON CONFLICT(n) DO UPDATE SET rows=excluded.rows,payload=excluded.payload",
                params![p["n"].as_i64(), p["rows"].as_i64(), text],
            )?;
        }
        other => bail!("unknown collection {other}"),
    }
    Ok(())
}

pub fn state_hash_conn(c: &Connection) -> Result<String> {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    for t in schema::TABLES {
        let (q, cols): (&str, usize) = match *t {
            "media_object" => ("SELECT id, content_hash, mime, name, size FROM media_object ORDER BY id", 5),
            "response_item" => ("SELECT response_id, item_id, ord FROM response_item ORDER BY response_id, ord", 3),
            "media_ref" => ("SELECT owner_id, media_id FROM media_ref ORDER BY owner_id, media_id", 2),
            "uow_marker" => ("SELECT n, rows, payload FROM uow_marker ORDER BY n", 3),
            "recovery_session" => ("SELECT id, payload FROM recovery_session ORDER BY id", 2),
            "learner_response" => ("SELECT id, paper_id, title, finalized_at, item_count, payload FROM learner_response ORDER BY id", 6),
            "teacher_review" => ("SELECT id, response_id, payload FROM teacher_review ORDER BY id", 3),
            "remediation_doc" => ("SELECT id, source_response_id, source_review_id, payload FROM remediation_doc ORDER BY id", 4),
            "history_entry" => ("SELECT id, response_id, payload FROM history_entry ORDER BY id", 3),
            _ => unreachable!(),
        };
        h.update(format!("#{t}\n").as_bytes());
        let mut st = c.prepare(q)?;
        let mut rows = st.query([])?;
        while let Some(r) = rows.next()? {
            for i in 0..cols {
                let v: rusqlite::types::Value = r.get(i)?;
                let s = match v {
                    rusqlite::types::Value::Null => "\u{0}null".to_string(),
                    rusqlite::types::Value::Integer(n) => n.to_string(),
                    rusqlite::types::Value::Real(f) => f.to_string(),
                    rusqlite::types::Value::Text(t) => match serde_json::from_str::<Value>(&t) {
                        Ok(j) if t.starts_with('{') || t.starts_with('[') => canon::canonical(&j),
                        _ => t,
                    },
                    rusqlite::types::Value::Blob(_) => "blob".into(),
                };
                h.update(s.as_bytes());
                h.update(b"\x1f");
            }
            h.update(b"\n");
        }
    }
    Ok(hex::encode(h.finalize()))
}
