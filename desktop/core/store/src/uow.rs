//! Store Port `commit(unitOfWork)`: ONE transaction containing every write, with declared
//! preconditions, in which a payload and its projections are always written together - and a Unit of
//! Work whose projections disagree with its payload is rejected as a whole (ADR 0001 section 5.2).
//!
//! Wire shape (JSON):
//! ```json
//! { "preconditions": [ {"kind":"absent|exists","collection":"c","id":"x"}, {"kind":"rev","collection":"c","id":"x","equals":3} ],
//!   "ops": [ {"op":"put","collection":"c","id":"x","payload":{...},"proj":{"columns":{...},"relations":{...}}},
//!            {"op":"delete","collection":"c","id":"x"} ] }
//! ```

use crate::catalog::Collection;
use crate::project::{self, Projection};
use crate::store::Store;
use qs_platform::{bail, fault, Code, Error, Result, ResultExt};
use rusqlite::{params_from_iter, types::Value as Sql, Transaction, TransactionBehavior};
use serde_json::{json, Value};
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct Write {
    pub collection: String,
    pub id: String,
    pub rev: i64,
}

#[derive(Debug, Clone)]
pub struct CommitReceipt {
    pub ops: usize,
    pub writes: Vec<Write>,
    pub micros: u64,
}

impl CommitReceipt {
    pub fn to_json(&self) -> Value {
        json!({
            "ops": self.ops,
            "micros": self.micros,
            "writes": self.writes.iter().map(|w| json!({"collection": w.collection, "id": w.id, "rev": w.rev})).collect::<Vec<_>>(),
        })
    }
}

/// Map a SQLite error: constraint violations are rejections of the Unit of Work, anything else is a DB fault.
pub fn db_err(e: rusqlite::Error) -> Error {
    match &e {
        rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
            Error::new(Code::RejectConstraint, e.to_string())
        }
        _ => Error::new(Code::Db, e.to_string()),
    }
}

fn str_field<'a>(v: &'a Value, key: &str, what: &str) -> Result<&'a str> {
    match v.get(key) {
        Some(Value::String(s)) if !s.is_empty() => Ok(s),
        _ => Err(Error::new(Code::RejectShape, format!("{what}: '{key}' must be a non-empty string"))),
    }
}

fn collection<'a>(catalog: &'a crate::Catalog, name: &str) -> Result<&'a Collection> {
    catalog.collection(name).ok_or_else(|| Error::new(Code::RejectShape, format!("unknown collection '{name}'")))
}

impl Store {
    pub fn commit(&mut self, uow: &Value) -> Result<CommitReceipt> {
        let started = Instant::now();
        let ops = match uow.get("ops") {
            Some(Value::Array(a)) if !a.is_empty() => a.as_slice(),
            _ => bail!(Code::RejectShape, "'ops' must be a non-empty array"),
        };
        let pre: &[Value] = match uow.get("preconditions") {
            None | Some(Value::Null) => &[],
            Some(Value::Array(a)) => a,
            Some(_) => bail!(Code::RejectShape, "'preconditions' must be an array"),
        };
        // Resolve everything that can be rejected without touching the database first.
        let catalog = self.catalog().clone();
        let mut planned = Vec::with_capacity(ops.len());
        for (i, op) in ops.iter().enumerate() {
            let what = format!("ops[{i}]");
            let coll = collection(&catalog, str_field(op, "collection", &what)?)?;
            let id = str_field(op, "id", &what)?.to_string();
            match op.get("op").and_then(Value::as_str) {
                Some("put") => {
                    let payload = op.get("payload").ok_or_else(|| Error::new(Code::RejectShape, format!("{what}: payload missing")))?;
                    let expected = project::extract(coll, &id, payload)?;
                    match op.get("proj") {
                        Some(p) if !p.is_null() => {
                            if !project::matches_supplied(coll, &expected, p) {
                                bail!(Code::RejectProjection, "{}/{id}: supplied projection disagrees with the payload", coll.name);
                            }
                        }
                        _ if coll.has_projections() => {
                            bail!(
                                Code::RejectProjection,
                                "{}/{id}: projection missing for a collection that declares projections",
                                coll.name
                            )
                        }
                        _ => {}
                    }
                    let text = serde_json::to_string(payload).code(Code::RejectShape)?;
                    planned.push(Planned::Put { coll, id, text, expected });
                }
                Some("delete") => planned.push(Planned::Delete { coll, id }),
                other => bail!(Code::RejectShape, "{what}: unknown op {other:?}"),
            }
        }

        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate).map_err(db_err)?;
        for (i, p) in pre.iter().enumerate() {
            check_precondition(&tx, &catalog, p, i)?;
        }
        let mut writes = Vec::new();
        for op in &planned {
            match op {
                Planned::Put { coll, id, text, expected } => {
                    let rev = put(&tx, coll, id, text, expected)?;
                    writes.push(Write { collection: coll.name.clone(), id: id.clone(), rev });
                }
                Planned::Delete { coll, id } => delete(&tx, coll, id)?,
            }
        }
        fault::point("uow-before-commit");
        tx.commit().map_err(db_err)?; // deferred foreign keys are checked here; a failure leaves nothing committed
        Ok(CommitReceipt { ops: planned.len(), writes, micros: started.elapsed().as_micros() as u64 })
    }
}

enum Planned<'a> {
    Put { coll: &'a Collection, id: String, text: String, expected: Projection },
    Delete { coll: &'a Collection, id: String },
}

fn check_precondition(tx: &Transaction, catalog: &crate::Catalog, p: &Value, i: usize) -> Result<()> {
    let what = format!("preconditions[{i}]");
    let name = str_field(p, "collection", &what)?;
    let coll = catalog.collection(name).ok_or_else(|| Error::new(Code::RejectShape, format!("{what}: unknown collection '{name}'")))?;
    let id = str_field(p, "id", &what)?;
    let rev: Option<i64> = tx
        .query_row(&format!("SELECT rev FROM {} WHERE id=?1", coll.name), [id], |r| r.get(0))
        .map(Some)
        .or_else(|e| if matches!(e, rusqlite::Error::QueryReturnedNoRows) { Ok(None) } else { Err(e) })
        .map_err(db_err)?;
    match p.get("kind").and_then(Value::as_str) {
        Some("absent") if rev.is_some() => bail!(Code::RejectPrecondition, "{name}/{id} must not exist"),
        Some("exists") if rev.is_none() => bail!(Code::RejectPrecondition, "{name}/{id} must exist"),
        Some("rev") => {
            let want = p
                .get("equals")
                .and_then(Value::as_i64)
                .ok_or_else(|| Error::new(Code::RejectShape, format!("{what}: 'equals' must be an integer")))?;
            if rev != Some(want) {
                bail!(Code::RejectPrecondition, "{name}/{id} is at revision {rev:?}, expected {want}");
            }
        }
        Some("absent") | Some("exists") => {}
        other => bail!(Code::RejectShape, "{what}: unknown kind {other:?}"),
    }
    Ok(())
}

fn put(tx: &Transaction, coll: &Collection, id: &str, text: &str, p: &Projection) -> Result<i64> {
    let prior: Option<i64> = match tx.query_row(&format!("SELECT rev FROM {} WHERE id=?1", coll.name), [id], |r| r.get(0)) {
        Ok(r) => Some(r),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(e) => return Err(db_err(e)),
    };
    let rev = prior.unwrap_or(0) + 1;
    let mut names = vec!["id".to_string(), "rev".into(), "payload".into()];
    names.extend(coll.columns.iter().map(|c| c.name.clone()));
    let mut vals: Vec<Sql> = vec![Sql::Text(id.into()), Sql::Integer(rev), Sql::Text(text.into())];
    vals.extend(p.columns.iter().cloned());
    let placeholders = (1..=names.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
    let updates = names.iter().skip(1).map(|n| format!("{n}=excluded.{n}")).collect::<Vec<_>>().join(",");
    let sql = format!("INSERT INTO {}({}) VALUES({placeholders}) ON CONFLICT(id) DO UPDATE SET {updates}", coll.name, names.join(","));
    tx.prepare_cached(&sql).map_err(db_err)?.execute(params_from_iter(vals.iter())).map_err(db_err)?;

    for (rel, (_, rows)) in coll.relations.iter().zip(&p.relations) {
        tx.prepare_cached(&format!("DELETE FROM {} WHERE {}=?1", rel.table, rel.owner_column))
            .map_err(db_err)?
            .execute([id])
            .map_err(db_err)?;
        let mut cols = vec![rel.owner_column.clone()];
        cols.extend(rel.columns.iter().map(|c| c.name.clone()));
        if let Some(o) = &rel.ordinal_column {
            cols.push(o.clone());
        }
        let ph = (1..=cols.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
        let mut ins = tx.prepare_cached(&format!("INSERT INTO {}({}) VALUES({ph})", rel.table, cols.join(","))).map_err(db_err)?;
        for row in rows {
            let mut v: Vec<Sql> = vec![Sql::Text(id.into())];
            v.extend(row.iter().cloned());
            ins.execute(params_from_iter(v.iter())).map_err(db_err)?;
        }
    }
    Ok(rev)
}

fn delete(tx: &Transaction, coll: &Collection, id: &str) -> Result<()> {
    for rel in &coll.relations {
        tx.prepare_cached(&format!("DELETE FROM {} WHERE {}=?1", rel.table, rel.owner_column))
            .map_err(db_err)?
            .execute([id])
            .map_err(db_err)?;
    }
    tx.prepare_cached(&format!("DELETE FROM {} WHERE id=?1", coll.name)).map_err(db_err)?.execute([id]).map_err(db_err)?;
    Ok(())
}
