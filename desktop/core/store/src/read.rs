//! Store Port `read(collection, query)`: indexed reads over a collection's declared columns.
//!
//! Query JSON: `{"id":"x"} | {"ids":[..]}`, `"where":[{"column","op":"eq|ne|lt|le|gt|ge","value"}]`,
//! `"orderBy":[{"column","desc"}]`, `"limit"`, `"offset"`. Only `id`, `rev` and the collection's declared
//! projection columns can be filtered/ordered; everything is parameterized.

use crate::store::Store;
use crate::uow::db_err;
use qs_platform::{bail, Code, Error, Result, ResultExt};
use rusqlite::{params_from_iter, types::Value as Sql};
use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct Record {
    pub id: String,
    pub rev: i64,
    pub payload: Value,
}

impl Record {
    pub fn to_json(&self) -> Value {
        json!({"id": self.id, "rev": self.rev, "payload": self.payload})
    }
}

fn json_to_sql(v: &Value) -> Result<Sql> {
    Ok(match v {
        Value::Null => Sql::Null,
        Value::Bool(b) => Sql::Integer(*b as i64),
        Value::Number(n) => match n.to_string().parse::<i64>() {
            Ok(i) => Sql::Integer(i),
            Err(_) => Sql::Real(n.to_string().parse::<f64>().code(Code::RejectShape)?),
        },
        Value::String(s) => Sql::Text(s.clone()),
        _ => bail!(Code::RejectShape, "filter values must be scalars"),
    })
}

impl Store {
    pub fn read(&self, collection: &str, query: &Value) -> Result<Vec<Record>> {
        let coll = self
            .catalog()
            .collection(collection)
            .ok_or_else(|| Error::new(Code::RejectShape, format!("unknown collection '{collection}'")))?;
        let allowed = |c: &str| c == "id" || c == "rev" || coll.columns.iter().any(|x| x.name == c);
        let mut wheres: Vec<String> = vec![];
        let mut params: Vec<Sql> = vec![];
        if let Some(id) = query.get("id").and_then(Value::as_str) {
            params.push(Sql::Text(id.into()));
            wheres.push(format!("id=?{}", params.len()));
        }
        if let Some(Value::Array(ids)) = query.get("ids") {
            if ids.is_empty() {
                return Ok(vec![]);
            }
            let mut ph = vec![];
            for i in ids {
                params.push(json_to_sql(i)?);
                ph.push(format!("?{}", params.len()));
            }
            wheres.push(format!("id IN ({})", ph.join(",")));
        }
        if let Some(Value::Array(ws)) = query.get("where") {
            for w in ws {
                let col = w.get("column").and_then(Value::as_str).unwrap_or("");
                if !allowed(col) {
                    bail!(Code::RejectShape, "column '{col}' is not queryable on '{collection}'");
                }
                let op = match w.get("op").and_then(Value::as_str).unwrap_or("eq") {
                    "eq" => "=",
                    "ne" => "<>",
                    "lt" => "<",
                    "le" => "<=",
                    "gt" => ">",
                    "ge" => ">=",
                    o => bail!(Code::RejectShape, "unknown operator '{o}'"),
                };
                let val = json_to_sql(w.get("value").unwrap_or(&Value::Null))?;
                if val == Sql::Null {
                    bail!(Code::RejectShape, "filtering on null is not supported; use a dedicated column");
                }
                params.push(val);
                wheres.push(format!("{col}{op}?{}", params.len()));
            }
        }
        let mut sql = format!("SELECT id, rev, payload FROM {collection}");
        if !wheres.is_empty() {
            sql.push_str(&format!(" WHERE {}", wheres.join(" AND ")));
        }
        let mut order: Vec<String> = vec![];
        if let Some(Value::Array(os)) = query.get("orderBy") {
            for o in os {
                let col = o.get("column").and_then(Value::as_str).unwrap_or("");
                if !allowed(col) {
                    bail!(Code::RejectShape, "column '{col}' is not orderable on '{collection}'");
                }
                order.push(format!("{col} {}", if o.get("desc").and_then(Value::as_bool).unwrap_or(false) { "DESC" } else { "ASC" }));
            }
        }
        order.push("id ASC".into()); // deterministic tiebreak
        sql.push_str(&format!(" ORDER BY {}", order.join(", ")));
        if let Some(l) = query.get("limit").and_then(Value::as_u64) {
            sql.push_str(&format!(" LIMIT {l}"));
            if let Some(o) = query.get("offset").and_then(Value::as_u64) {
                sql.push_str(&format!(" OFFSET {o}"));
            }
        }
        let mut st = self.conn.prepare_cached(&sql).map_err(db_err)?;
        let rows = st
            .query_map(params_from_iter(params.iter()), |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?)))
            .map_err(db_err)?;
        let mut out = vec![];
        for r in rows {
            let (id, rev, text) = r.map_err(db_err)?;
            out.push(Record { id, rev, payload: serde_json::from_str(&text).ctx(Code::Db, "stored payload is not valid JSON")? });
        }
        Ok(out)
    }

    pub fn count(&self, collection: &str) -> Result<i64> {
        if self.catalog().collection(collection).is_none() {
            bail!(Code::RejectShape, "unknown collection '{collection}'");
        }
        self.conn.query_row(&format!("SELECT count(*) FROM {collection}"), [], |r| r.get(0)).map_err(db_err)
    }
}
