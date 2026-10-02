//! `check_consistency` (ADR 0001 A5): recompute every projection from its stored payload and compare
//! with the stored columns and relationship rows, plus referential and identity checks. Runs at startup
//! and as a diagnostic; it never repairs - a mismatch is reported, not "fixed" (ADR 0001 section 5.2).

use crate::canon;
use crate::catalog::{Catalog, Collection};
use crate::project::{self, Projection};
use qs_platform::{Code, Result, ResultExt};
use rusqlite::{types::Value as Sql, Connection};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone)]
pub struct Problem {
    pub kind: &'static str,
    pub collection: String,
    pub id: Option<String>,
    pub detail: String,
}

impl Problem {
    pub fn to_json(&self) -> Value {
        json!({"kind": self.kind, "collection": self.collection, "id": self.id, "detail": self.detail})
    }
}

fn stored_columns(c: &Collection, r: &rusqlite::Row, first: usize) -> rusqlite::Result<Vec<Sql>> {
    (0..c.columns.len()).map(|i| r.get::<_, Sql>(first + i)).collect()
}

pub fn check(conn: &Connection, catalog: &Catalog) -> Result<Vec<Problem>> {
    let mut bad = vec![];
    for coll in catalog.collections() {
        let cols = coll.columns.iter().map(|c| c.name.as_str()).collect::<Vec<_>>();
        let select = if cols.is_empty() { "id, payload".to_string() } else { format!("id, payload, {}", cols.join(",")) };
        let mut st = conn.prepare(&format!("SELECT {select} FROM {}", coll.name)).code(Code::Db)?;
        let mut rel_stmts = Vec::new();
        for rel in &coll.relations {
            let mut names: Vec<String> = rel.columns.iter().map(|c| c.name.clone()).collect();
            if let Some(o) = &rel.ordinal_column {
                names.push(o.clone());
            }
            let order = rel.ordinal_column.clone().unwrap_or_else(|| "rowid".into());
            let sql = if names.is_empty() {
                format!("SELECT 1 FROM {} WHERE {}=?1 ORDER BY {order}", rel.table, rel.owner_column)
            } else {
                format!("SELECT {} FROM {} WHERE {}=?1 ORDER BY {order}", names.join(","), rel.table, rel.owner_column)
            };
            rel_stmts.push(conn.prepare(&sql).code(Code::Db)?);
        }
        let mut rows = st.query([]).code(Code::Db)?;
        while let Some(r) = rows.next().code(Code::Db)? {
            let id: String = r.get(0).code(Code::Db)?;
            let text: String = r.get(1).code(Code::Db)?;
            let payload: Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(e) => {
                    bad.push(Problem { kind: "payload-invalid", collection: coll.name.clone(), id: Some(id), detail: e.to_string() });
                    continue;
                }
            };
            let expected: Projection = match project::extract(coll, &id, &payload) {
                Ok(p) => p,
                Err(e) => {
                    bad.push(Problem { kind: "projection-uncomputable", collection: coll.name.clone(), id: Some(id), detail: e.message });
                    continue;
                }
            };
            let have_cols = stored_columns(coll, r, 2).code(Code::Db)?;
            if have_cols != expected.columns {
                bad.push(Problem { kind: "column-mismatch", collection: coll.name.clone(), id: Some(id.clone()), detail: "stored columns differ from the payload projection".into() });
            }
            for (rel, (stmt, (_, want))) in coll.relations.iter().zip(rel_stmts.iter_mut().zip(&expected.relations)) {
                let width = rel.columns.len() + rel.ordinal_column.is_some() as usize;
                let have: Vec<Vec<Sql>> = stmt
                    .query_map([&id], |row| (0..width).map(|i| row.get::<_, Sql>(i)).collect())
                    .code(Code::Db)?
                    .collect::<std::result::Result<_, _>>()
                    .code(Code::Db)?;
                let same = if width == 0 { have.len() == want.len() } else { &have == want };
                if !same {
                    bad.push(Problem {
                        kind: "relation-mismatch",
                        collection: coll.name.clone(),
                        id: Some(id.clone()),
                        detail: format!("relation rows in '{}' differ from the payload (db {} vs payload {})", rel.table, have.len(), want.len()),
                    });
                }
            }
        }
        for rel in &coll.relations {
            let n: i64 = conn
                .query_row(
                    &format!("SELECT count(*) FROM {} WHERE {} NOT IN (SELECT id FROM {})", rel.table, rel.owner_column, coll.name),
                    [],
                    |r| r.get(0),
                )
                .code(Code::Db)?;
            if n > 0 {
                bad.push(Problem { kind: "orphan-relation-rows", collection: coll.name.clone(), id: None, detail: format!("{n} row(s) in '{}' have no owner", rel.table) });
            }
        }
    }
    let fk: i64 = conn.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).code(Code::Db)?;
    if fk > 0 {
        bad.push(Problem { kind: "foreign-key-violation", collection: String::new(), id: None, detail: format!("{fk} foreign key violation(s)") });
    }
    Ok(bad)
}

/// Deterministic hash over catalog content: canonical payloads, revisions, projected columns and relation rows.
pub fn state_hash(conn: &Connection, catalog: &Catalog, include_recovery: bool) -> Result<String> {
    let mut h = Sha256::new();
    for coll in catalog.collections().iter().filter(|c| include_recovery || c.canonical) {
        h.update(format!("#{}\n", coll.name).as_bytes());
        let cols = coll.columns.iter().map(|c| format!(",{}", c.name)).collect::<String>();
        let mut st = conn.prepare(&format!("SELECT id, rev, payload{cols} FROM {} ORDER BY id", coll.name)).code(Code::Db)?;
        let n = 3 + coll.columns.len();
        let mut rows = st.query([]).code(Code::Db)?;
        while let Some(r) = rows.next().code(Code::Db)? {
            for i in 0..n {
                let v: Sql = r.get(i).code(Code::Db)?;
                feed(&mut h, &v, i == 2);
            }
            h.update(b"\n");
        }
        for rel in &coll.relations {
            h.update(format!("#{}\n", rel.table).as_bytes());
            let mut names = vec![rel.owner_column.clone()];
            names.extend(rel.columns.iter().map(|c| c.name.clone()));
            let order_tail = rel.ordinal_column.clone();
            if let Some(o) = &order_tail {
                names.push(o.clone());
            }
            let order = names.join(",");
            let mut st = conn.prepare(&format!("SELECT {order} FROM {} ORDER BY {order}", rel.table)).code(Code::Db)?;
            let mut rows = st.query([]).code(Code::Db)?;
            while let Some(r) = rows.next().code(Code::Db)? {
                for i in 0..names.len() {
                    let v: Sql = r.get(i).code(Code::Db)?;
                    feed(&mut h, &v, false);
                }
                h.update(b"\n");
            }
        }
    }
    Ok(hex::encode(h.finalize()))
}

fn feed(h: &mut Sha256, v: &Sql, canonical_json: bool) {
    let s = match v {
        Sql::Null => "\u{0}null".to_string(),
        Sql::Integer(n) => n.to_string(),
        Sql::Real(f) => f.to_string(),
        Sql::Text(t) if canonical_json => serde_json::from_str::<Value>(t).map(|j| canon::canonical(&j)).unwrap_or_else(|_| t.clone()),
        Sql::Text(t) => t.clone(),
        Sql::Blob(_) => "blob".into(),
    };
    h.update(s.as_bytes());
    h.update(b"\x1f");
}
