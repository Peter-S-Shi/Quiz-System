//! Projection extraction: derive the indexed columns and relationship rows from a payload, per the
//! catalog. The Store Port recomputes this in Rust and rejects a Unit of Work whose caller-supplied
//! projection differs (ADR 0001 sections 5.2/5.3), and `check_consistency` recomputes it from stored
//! payloads to detect drift.

use crate::catalog::{Collection, Column, ColumnKind, Relation};
use qs_platform::{bail, Code, Result};
use rusqlite::types::Value as Sql;
use serde_json::{Map, Value};

/// One extracted row: values aligned with the declaring column list (+ ordinal for relation rows).
pub type Row = Vec<Sql>;

#[derive(Debug, Clone)]
pub struct Projection {
    pub columns: Row,
    /// (relation table, rows) in catalog order.
    pub relations: Vec<(String, Vec<Row>)>,
}

pub fn extract(coll: &Collection, id: &str, payload: &Value) -> Result<Projection> {
    if !payload.is_object() {
        bail!(Code::RejectShape, "payload of {}/{id} must be a JSON object", coll.name);
    }
    if let Some(p) = &coll.id_pointer {
        match payload.pointer(p) {
            Some(Value::String(s)) if s == id => {}
            other => bail!(
                Code::RejectProjection,
                "{}/{id}: payload identity at '{p}' ({}) does not match the record id",
                coll.name,
                other.map(|v| v.to_string()).unwrap_or_else(|| "missing".into())
            ),
        }
    }
    let mut columns = Vec::with_capacity(coll.columns.len());
    for c in &coll.columns {
        columns.push(value_for(c, payload, &format!("{}/{id}", coll.name))?);
    }
    let mut relations = Vec::with_capacity(coll.relations.len());
    for r in &coll.relations {
        relations.push((r.table.clone(), relation_rows(r, payload, &format!("{}/{id}", coll.name))?));
    }
    Ok(Projection { columns, relations })
}

fn relation_rows(r: &Relation, payload: &Value, what: &str) -> Result<Vec<Row>> {
    let items: &[Value] = match payload.pointer(&r.pointer) {
        None | Some(Value::Null) => &[],
        Some(Value::Array(a)) => a,
        Some(_) => bail!(Code::RejectProjection, "{what}: '{}' must be an array", r.pointer),
    };
    let mut rows: Vec<Row> = Vec::with_capacity(items.len());
    for it in items {
        let mut row = Vec::with_capacity(r.columns.len() + 1);
        for c in &r.columns {
            row.push(value_for(c, it, &format!("{what} {}", r.table))?);
        }
        if r.dedupe && rows.iter().any(|x| x == &row) {
            continue;
        }
        rows.push(row);
    }
    if r.ordinal_column.is_some() {
        for (i, row) in rows.iter_mut().enumerate() {
            row.push(Sql::Integer(i as i64));
        }
    }
    Ok(rows)
}

fn value_for(c: &Column, doc: &Value, what: &str) -> Result<Sql> {
    let v = doc.pointer(&c.pointer);
    let v = match v {
        None | Some(Value::Null) => {
            if c.required {
                bail!(Code::RejectProjection, "{what}: required field '{}' is missing", c.pointer);
            }
            return Ok(Sql::Null);
        }
        Some(v) => v,
    };
    let bad = || Error_type(what, &c.pointer, c.kind);
    Ok(match (c.kind, v) {
        (ColumnKind::Text, Value::String(s)) => Sql::Text(s.clone()),
        (ColumnKind::Integer, Value::Number(n)) => match n.to_string().parse::<i64>() {
            Ok(i) => Sql::Integer(i),
            Err(_) => return Err(bad()),
        },
        (ColumnKind::Real, Value::Number(n)) => match n.to_string().parse::<f64>() {
            Ok(f) if f.is_finite() => Sql::Real(f),
            _ => return Err(bad()),
        },
        (ColumnKind::Bool, Value::Bool(b)) => Sql::Integer(*b as i64),
        _ => return Err(bad()),
    })
}

#[allow(non_snake_case)]
fn Error_type(what: &str, pointer: &str, kind: ColumnKind) -> qs_platform::Error {
    qs_platform::Error::new(Code::RejectProjection, format!("{what}: field '{pointer}' is not a valid {kind:?}"))
}

/// The wire/compare form: `{"columns": {name: value}, "relations": {table: [ {col: value} ]}}`.
pub fn to_json(coll: &Collection, p: &Projection) -> Value {
    let mut cols = Map::new();
    for (c, v) in coll.columns.iter().zip(&p.columns) {
        cols.insert(c.name.clone(), sql_to_json(c.kind, v));
    }
    let mut rels = Map::new();
    for (r, (_, rows)) in coll.relations.iter().zip(&p.relations) {
        let arr = rows
            .iter()
            .map(|row| {
                let mut o = Map::new();
                for (c, v) in r.columns.iter().zip(row) {
                    o.insert(c.name.clone(), sql_to_json(c.kind, v));
                }
                Value::Object(o)
            })
            .collect();
        rels.insert(r.table.clone(), Value::Array(arr));
    }
    let mut top = Map::new();
    top.insert("columns".into(), Value::Object(cols));
    top.insert("relations".into(), Value::Object(rels));
    Value::Object(top)
}

pub fn sql_to_json(kind: ColumnKind, v: &Sql) -> Value {
    match v {
        Sql::Null => Value::Null,
        Sql::Integer(i) => match kind {
            ColumnKind::Bool => Value::Bool(*i != 0),
            _ => Value::from(*i),
        },
        Sql::Real(f) => serde_json::Number::from_f64(*f).map(Value::Number).unwrap_or(Value::Null),
        Sql::Text(s) => Value::String(s.clone()),
        Sql::Blob(_) => Value::Null,
    }
}

/// Is `supplied` (from the caller) the same projection as `expected` (recomputed in Rust)?
pub fn matches_supplied(coll: &Collection, expected: &Projection, supplied: &Value) -> bool {
    crate::canon::canonical(&to_json(coll, expected)) == crate::canon::canonical(supplied)
}
