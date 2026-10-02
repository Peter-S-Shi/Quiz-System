//! The catalog: what the store knows about its own schema.
//!
//! ADR 0001 deliberately does **not** fix domain table schemas (Calendar/Scheduler/Typing and the
//! migration schemas belong to later ADRs). So the store is *catalog driven*: a catalog is an ordered
//! list of forward-only migrations plus a declarative description of every **collection** - a table that
//! holds a lossless JSON `payload` and its extracted **projections** (indexed columns and relationship
//! rows). The Store Port enforces the payload/projection contract for whatever catalog it is given; the
//! foundation catalog ships only the structural collections, later milestones extend it.

use qs_platform::{bail, Code, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColumnKind {
    Text,
    /// JSON integer that fits i64. (Values beyond the JS safe range travel as strings; project them as Text.)
    Integer,
    Real,
    Bool,
}

/// A value extracted from the payload at an RFC 6901 JSON pointer.
#[derive(Debug, Clone)]
pub struct Column {
    pub name: String,
    pub pointer: String,
    pub kind: ColumnKind,
    pub required: bool,
}

/// A many-valued relationship projected into rows of its own table (so a foreign key can constrain it).
/// Row columns use pointers **relative to each array element** (`""` is the element itself).
#[derive(Debug, Clone)]
pub struct Relation {
    pub table: String,
    pub owner_column: String,
    /// Pointer to the array in the payload. A missing array is an empty relationship.
    pub pointer: String,
    pub columns: Vec<Column>,
    /// When set, the element index is stored here (preserves array order).
    pub ordinal_column: Option<String>,
    /// Collapse identical rows (keeps the first) - for set-like references.
    pub dedupe: bool,
}

/// What a collection is *for* (ADR 0002 section 7.1 / 15.5). Every role except `RecoveryOnly` travels through
/// activation merges, snapshots, archives and state hashes; only `Canonical` is consumer-visible domain data.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    /// Canonical learning/product data: the only role Evidence, Recommendation and other consumers read as domain data.
    Canonical,
    /// Durable metadata about operations (migration provenance, runs, undo records): preserved and archived, not learning data.
    Metadata,
    /// Durable recovery-only artifact index (e.g. a preserved raw V1 recovery blob): archived, never canonical.
    Retained,
    /// Scheduling Context (ADR 0003 section 5): durable user data that is archived and restored but is never Evidence
    /// and is outside the evidence-domain view (`domain_collections`).
    Context,
    /// Recovery-only data (ADR 0001 section 5.5): excluded from activation, archives and canonical hashes.
    RecoveryOnly,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Canonical => "canonical",
            Role::Metadata => "metadata",
            Role::Retained => "retained",
            Role::Context => "context",
            Role::RecoveryOnly => "recovery-only",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Collection {
    /// Table name == collection name.
    pub name: String,
    /// When set, the payload value at this pointer must equal the record id (identity is not duplicated silently).
    pub id_pointer: Option<String>,
    pub columns: Vec<Column>,
    pub relations: Vec<Relation>,
    /// False for recovery-only data (ADR 0001 section 5.5): excluded from activation, archives and canonical hashes.
    pub canonical: bool,
    /// Finer classification; `canonical == (role != RecoveryOnly)` (i.e. "travels"), see [`Role`].
    pub role: Role,
}

impl Collection {
    pub fn new(name: &str) -> Collection {
        Collection { name: name.into(), id_pointer: None, columns: vec![], relations: vec![], canonical: true, role: Role::Canonical }
    }
    pub fn id_pointer(mut self, p: &str) -> Self {
        self.id_pointer = Some(p.into());
        self
    }
    pub fn column(mut self, name: &str, pointer: &str, kind: ColumnKind, required: bool) -> Self {
        self.columns.push(Column { name: name.into(), pointer: pointer.into(), kind, required });
        self
    }
    pub fn relation(mut self, r: Relation) -> Self {
        self.relations.push(r);
        self
    }
    pub fn recovery_only(mut self) -> Self {
        self.canonical = false;
        self.role = Role::RecoveryOnly;
        self
    }
    /// Durable operation metadata: travels everywhere, but is not domain data.
    pub fn metadata(mut self) -> Self {
        self.role = Role::Metadata;
        self
    }
    /// Scheduling Context: travels everywhere (archive, snapshot, state hash), is not Evidence and not domain data.
    pub fn context(mut self) -> Self {
        self.role = Role::Context;
        self
    }
    /// Durable recovery-only artifact index: travels everywhere, never domain data.
    pub fn retained(mut self) -> Self {
        self.role = Role::Retained;
        self
    }
    pub fn has_projections(&self) -> bool {
        !self.columns.is_empty() || !self.relations.is_empty()
    }
}

impl Relation {
    pub fn new(table: &str, owner_column: &str, pointer: &str) -> Relation {
        Relation {
            table: table.into(),
            owner_column: owner_column.into(),
            pointer: pointer.into(),
            columns: vec![],
            ordinal_column: None,
            dedupe: false,
        }
    }
    pub fn column(mut self, name: &str, pointer: &str, kind: ColumnKind, required: bool) -> Self {
        self.columns.push(Column { name: name.into(), pointer: pointer.into(), kind, required });
        self
    }
    pub fn ordinal(mut self, column: &str) -> Self {
        self.ordinal_column = Some(column.into());
        self
    }
    pub fn dedupe(mut self) -> Self {
        self.dedupe = true;
        self
    }
}

#[derive(Debug, Clone)]
pub struct Migration {
    pub version: i32,
    pub name: String,
    pub sql: String,
}

#[derive(Debug, Clone)]
pub struct Catalog {
    migrations: Vec<Migration>,
    collections: Vec<Collection>,
}

fn ident_ok(s: &str) -> bool {
    let mut c = s.chars();
    matches!(c.next(), Some(f) if f.is_ascii_lowercase() || f == '_') && c.all(|x| x.is_ascii_lowercase() || x.is_ascii_digit() || x == '_')
}

impl Column {
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({"name": self.name, "pointer": self.pointer, "kind": format!("{:?}", self.kind).to_lowercase(), "required": self.required})
    }
}

impl Collection {
    /// Declarative description shipped to the JS side (`schema.info`) so the domain layer can build projections.
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "name": self.name,
            "idPointer": self.id_pointer,
            "canonical": self.canonical,
            "role": self.role.as_str(),
            "columns": self.columns.iter().map(Column::to_json).collect::<Vec<_>>(),
            "relations": self.relations.iter().map(|r| serde_json::json!({
                "table": r.table, "ownerColumn": r.owner_column, "pointer": r.pointer, "dedupe": r.dedupe,
                "ordinalColumn": r.ordinal_column, "columns": r.columns.iter().map(Column::to_json).collect::<Vec<_>>(),
            })).collect::<Vec<_>>(),
        })
    }
}

impl Catalog {
    pub fn new(migrations: Vec<Migration>, collections: Vec<Collection>) -> Result<Catalog> {
        for (i, m) in migrations.iter().enumerate() {
            if m.version != i as i32 + 1 {
                bail!(Code::CatalogMismatch, "migration versions must be contiguous from 1 (got {} at position {})", m.version, i);
            }
        }
        let mut seen = std::collections::BTreeSet::new();
        for c in &collections {
            if !ident_ok(&c.name) || !seen.insert(c.name.clone()) {
                bail!(Code::CatalogMismatch, "bad or duplicate collection name '{}'", c.name);
            }
            for col in &c.columns {
                if !ident_ok(&col.name) || matches!(col.name.as_str(), "id" | "rev" | "payload") {
                    bail!(Code::CatalogMismatch, "bad column name '{}' in '{}'", col.name, c.name);
                }
            }
            for r in &c.relations {
                if r.columns.iter().any(|col| !ident_ok(&col.name)) {
                    bail!(Code::CatalogMismatch, "bad column name in relation '{}'", r.table);
                }
                if !ident_ok(&r.table) || !ident_ok(&r.owner_column) || !seen.insert(r.table.clone()) {
                    bail!(Code::CatalogMismatch, "bad or duplicate relation table '{}'", r.table);
                }
                if let Some(o) = &r.ordinal_column {
                    if !ident_ok(o) {
                        bail!(Code::CatalogMismatch, "bad ordinal column '{o}'");
                    }
                }
            }
        }
        Ok(Catalog { migrations, collections })
    }

    /// The foundation catalog: structural collections only (no domain tables).
    pub fn foundation() -> Catalog {
        crate::foundation::catalog()
    }

    /// A catalog that extends this one with more migrations (versions continue) and collections.
    pub fn extend(&self, migrations: Vec<Migration>, collections: Vec<Collection>) -> Result<Catalog> {
        let mut m = self.migrations.clone();
        m.extend(migrations);
        let mut c = self.collections.clone();
        c.extend(collections);
        Catalog::new(m, c)
    }

    pub fn schema_version(&self) -> i32 {
        self.migrations.len() as i32
    }
    pub fn migrations(&self) -> &[Migration] {
        &self.migrations
    }
    pub fn collections(&self) -> &[Collection] {
        &self.collections
    }
    pub fn collection(&self, name: &str) -> Option<&Collection> {
        self.collections.iter().find(|c| c.name == name)
    }
    /// Collections that travel (merge, snapshot, archive, state hash): every role except recovery-only.
    pub fn canonical_collections(&self) -> impl Iterator<Item = &Collection> {
        self.collections.iter().filter(|c| c.canonical)
    }
    /// Consumer-visible domain data only (role `Canonical`).
    pub fn domain_collections(&self) -> impl Iterator<Item = &Collection> {
        self.collections.iter().filter(|c| c.role == Role::Canonical)
    }
}
