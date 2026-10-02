//! Opening, creating, upgrading and snapshotting the store.

use crate::catalog::Catalog;
use crate::consistency;
use qs_platform::fsx::{self, ProcessLock};
use qs_platform::identity::APP_VERSION;
use qs_platform::{bail, Code, DataRoot, Error, Result, ResultExt};
use rusqlite::{Connection, OpenFlags, TransactionBehavior};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// "QSV2" - SQLite `application_id` that identifies a Quiz Studio store file.
pub const APPLICATION_ID: i32 = 0x5153_5632;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Synchronous {
    /// Default for canonical evidence (ADR 0001 section 5.5; measured p95 commit 5-6 ms).
    Full,
    Normal,
}
impl Synchronous {
    fn pragma(self) -> &'static str {
        match self {
            Synchronous::Full => "FULL",
            Synchronous::Normal => "NORMAL",
        }
    }
}

#[derive(Debug, Clone)]
pub struct OpenOptions {
    pub synchronous: Synchronous,
    /// Take the exclusive single-writer process lock (always on in the product).
    pub lock: bool,
    pub app_version: String,
}
impl Default for OpenOptions {
    fn default() -> Self {
        OpenOptions { synchronous: Synchronous::Full, lock: true, app_version: APP_VERSION.to_string() }
    }
}

#[derive(Debug, Clone)]
pub struct UpgradeNotice {
    pub from: i32,
    pub to: i32,
    pub snapshot: PathBuf,
}

#[derive(Debug, Clone)]
pub struct StoreInfo {
    pub application_id: i32,
    pub user_version: i32,
    pub catalog_version: i32,
    pub created_by: Option<String>,
    pub last_opened_by: Option<String>,
}

pub struct Store {
    pub(crate) conn: Connection,
    root: DataRoot,
    catalog: Arc<Catalog>,
    upgrade: Option<UpgradeNotice>,
    _lock: Option<ProcessLock>,
}

impl std::fmt::Debug for Store {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Store").field("root", &self.root).finish_non_exhaustive()
    }
}

/// Read `application_id` / `user_version` without writing anything. `None` for a missing or empty file.
pub fn peek_identity(db: &Path) -> Result<Option<(i32, i32, i64)>> {
    match std::fs::metadata(db) {
        Ok(m) if m.len() > 0 => {}
        _ => return Ok(None),
    }
    let c = Connection::open_with_flags(fsx::sqlite_path(db)?, OpenFlags::SQLITE_OPEN_READ_ONLY).ctx(Code::Db, "open read-only")?;
    let app: i32 = c.query_row("PRAGMA application_id", [], |r| r.get(0)).code(Code::Db)?;
    let ver: i32 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).code(Code::Db)?;
    let tables: i64 = c.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get(0)).code(Code::Db)?;
    Ok(Some((app, ver, tables)))
}

pub(crate) fn configure(conn: &Connection, sync: Synchronous) -> Result<()> {
    conn.busy_timeout(std::time::Duration::from_secs(5)).code(Code::Db)?;
    let _mode: String = conn.query_row("PRAGMA journal_mode=WAL", [], |r| r.get(0)).code(Code::Db)?;
    conn.pragma_update(None, "foreign_keys", "ON").code(Code::Db)?;
    conn.pragma_update(None, "synchronous", sync.pragma()).code(Code::Db)?;
    Ok(())
}

impl Store {
    pub fn open(root: &DataRoot, catalog: Arc<Catalog>, opts: &OpenOptions) -> Result<Store> {
        root.ensure()?;
        let lock = if opts.lock { Some(ProcessLock::acquire(&root.lock_path())?) } else { None };
        let db = root.db_path();
        let identity = peek_identity(&db)?;
        let existing_version = match identity {
            Some((app, ver, tables)) => {
                if app == APPLICATION_ID {
                    if ver > catalog.schema_version() {
                        bail!(
                            Code::SchemaNewer,
                            "store schema v{ver} is newer than this build supports (v{}); nothing was written",
                            catalog.schema_version()
                        );
                    }
                    Some(ver)
                } else if app == 0 && ver == 0 && tables == 0 {
                    None // an interrupted first-time creation left an empty file
                } else {
                    bail!(Code::NotAStore, "database is not a Quiz Studio store (application_id {app:#x})");
                }
            }
            None => None,
        };

        let conn = Connection::open(fsx::sqlite_path(&db)?).ctx(Code::Db, "open database")?;
        configure(&conn, opts.synchronous)?;
        let mut store = Store { conn, root: root.clone(), catalog, upgrade: None, _lock: lock };
        match existing_version {
            None => store.create()?,
            Some(v) if v < store.catalog.schema_version() => store.upgrade_in_place(v, opts)?,
            Some(_) => {}
        }
        verify_catalog(&store.conn, &store.catalog)?;
        store.touch_meta(&opts.app_version)?;
        Ok(store)
    }

    fn create(&mut self) -> Result<()> {
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate).code(Code::Db)?;
        for m in self.catalog.migrations() {
            tx.execute_batch(&m.sql).ctx(Code::Db, &format!("migration {} ({})", m.version, m.name))?;
        }
        verify_catalog(&tx, &self.catalog)?;
        tx.pragma_update(None, "application_id", APPLICATION_ID).code(Code::Db)?;
        tx.pragma_update(None, "user_version", self.catalog.schema_version()).code(Code::Db)?;
        tx.execute("INSERT INTO meta(key,value) VALUES('created_by_version',?1)", [APP_VERSION]).code(Code::Db)?;
        tx.commit().code(Code::Db)
    }

    /// Forward-only upgrade (ADR 0001 section 7): snapshot first, then the whole chain in ONE transaction.
    /// A failure leaves the pre-upgrade state (verified by physical hash; restored from the snapshot if not).
    fn upgrade_in_place(&mut self, from: i32, _opts: &OpenOptions) -> Result<()> {
        let to = self.catalog.schema_version();
        let snapshot = self.root.snapshots_dir().join(format!("pre-upgrade-v{from}.db"));
        let _ = std::fs::remove_file(&snapshot);
        self.snapshot_to(&snapshot)?;
        let before = physical_hash(&self.conn)?;
        let attempt: Result<()> = (|| {
            let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate).code(Code::Db)?;
            for m in self.catalog.migrations().iter().filter(|m| m.version > from) {
                tx.execute_batch(&m.sql).ctx(Code::Db, &format!("migration {} ({})", m.version, m.name))?;
            }
            verify_catalog(&tx, &self.catalog)?;
            tx.pragma_update(None, "user_version", to).code(Code::Db)?;
            tx.commit().code(Code::Db)
        })();
        match attempt {
            Ok(()) => {
                self.upgrade = Some(UpgradeNotice { from, to, snapshot });
                Ok(())
            }
            Err(e) => {
                let ver: i32 = self.conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap_or(-1);
                let intact = ver == from && physical_hash(&self.conn).map(|h| h == before).unwrap_or(false);
                let how = if intact {
                    "the migration transaction rolled back; the store is unchanged"
                } else {
                    self.restore_file_from_snapshot(&snapshot)?;
                    "the store was restored from the pre-upgrade snapshot"
                };
                bail!(Code::UpgradeFailed, "schema upgrade v{from} -> v{to} failed ({e}); {how}; no data was lost");
            }
        }
    }

    /// File-level restore used only when no other connection can exist (we hold the lock, mid-open).
    fn restore_file_from_snapshot(&mut self, snapshot: &Path) -> Result<()> {
        let db = self.root.db_path();
        let placeholder = Connection::open_in_memory().code(Code::Db)?;
        drop(std::mem::replace(&mut self.conn, placeholder));
        for ext in ["-wal", "-shm"] {
            let mut p = db.clone().into_os_string();
            p.push(ext);
            let _ = std::fs::remove_file(PathBuf::from(p));
        }
        std::fs::copy(snapshot, &db)?;
        let conn = Connection::open(fsx::sqlite_path(&db)?).code(Code::Db)?;
        configure(&conn, Synchronous::Full)?;
        self.conn = conn;
        Ok(())
    }

    fn touch_meta(&mut self, app_version: &str) -> Result<()> {
        self.conn
            .execute(
                "INSERT INTO meta(key,value) VALUES('last_opened_by_version',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                [app_version],
            )
            .code(Code::Db)?;
        Ok(())
    }

    pub fn root(&self) -> &DataRoot {
        &self.root
    }
    pub fn catalog(&self) -> &Arc<Catalog> {
        &self.catalog
    }
    /// Set when this open performed a schema upgrade (the UI should tell the user).
    pub fn upgrade_notice(&self) -> Option<&UpgradeNotice> {
        self.upgrade.as_ref()
    }
    /// Raw connection for sibling crates (activation) that must run inside the single writer connection.
    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn info(&self) -> Result<StoreInfo> {
        let meta = |k: &str| -> Option<String> {
            self.conn.query_row("SELECT value FROM meta WHERE key=?1", [k], |r| r.get(0)).ok()
        };
        Ok(StoreInfo {
            application_id: self.conn.query_row("PRAGMA application_id", [], |r| r.get(0)).code(Code::Db)?,
            user_version: self.conn.query_row("PRAGMA user_version", [], |r| r.get(0)).code(Code::Db)?,
            catalog_version: self.catalog.schema_version(),
            created_by: meta("created_by_version"),
            last_opened_by: meta("last_opened_by_version"),
        })
    }

    pub fn quick_check(&self) -> Result<bool> {
        let mut st = self.conn.prepare("PRAGMA quick_check").code(Code::Db)?;
        let rows: Vec<String> = st.query_map([], |r| r.get(0)).code(Code::Db)?.collect::<std::result::Result<_, _>>().code(Code::Db)?;
        Ok(rows == ["ok"])
    }

    /// Consistent online snapshot (safe while the app is running). `dest` must not exist.
    pub fn snapshot_to(&self, dest: &Path) -> Result<()> {
        let _ = std::fs::remove_file(dest);
        self.conn.execute("VACUUM INTO ?1", [dest.to_string_lossy().as_ref()]).ctx(Code::Db, "VACUUM INTO")?;
        std::fs::OpenOptions::new().write(true).open(dest)?.sync_all()?; // FlushFileBuffers needs write access
        Ok(())
    }

    pub fn check_consistency(&self) -> Result<Vec<consistency::Problem>> {
        consistency::check(&self.conn, &self.catalog)
    }

    /// Deterministic hash of all canonical content (payloads canonicalized, projections and relation rows
    /// included). `include_recovery` also covers recovery-only collections.
    pub fn state_hash(&self, include_recovery: bool) -> Result<String> {
        consistency::state_hash(&self.conn, &self.catalog, include_recovery)
    }
}


/// Migrate a standalone (staging) database file forward to the catalog's schema, in one transaction.
/// Used when restoring an archive written by an older build. Returns `(from, to)` when it migrated.
pub fn migrate_file(db: &Path, catalog: &Catalog) -> Result<Option<(i32, i32)>> {
    let (app, ver, _) = peek_identity(db)?.ok_or_else(|| Error::new(Code::NotAStore, "database file is empty or missing"))?;
    if app != APPLICATION_ID {
        bail!(Code::NotAStore, "database is not a Quiz Studio store (application_id {app:#x})");
    }
    let to = catalog.schema_version();
    if ver > to {
        bail!(Code::SchemaNewer, "store schema v{ver} is newer than this build supports (v{to})");
    }
    if ver == to {
        return Ok(None);
    }
    let mut conn = Connection::open(fsx::sqlite_path(db)?).code(Code::Db)?;
    conn.pragma_update(None, "foreign_keys", "ON").code(Code::Db)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate).code(Code::Db)?;
    for m in catalog.migrations().iter().filter(|m| m.version > ver) {
        tx.execute_batch(&m.sql).ctx(Code::UpgradeFailed, &format!("migration {} ({})", m.version, m.name))?;
    }
    verify_catalog(&tx, catalog).map_err(|e| Error::new(Code::UpgradeFailed, e.message))?;
    tx.pragma_update(None, "user_version", to).code(Code::Db)?;
    tx.commit().code(Code::Db)?;
    Ok(Some((ver, to)))
}

/// Hash of the entire physical content (schema text + every row of every table) - used to prove an
/// aborted upgrade left the database exactly as it was.
pub(crate) fn physical_hash(conn: &Connection) -> Result<String> {
    let mut h = Sha256::new();
    let mut tables = conn
        .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .code(Code::Db)?;
    let list: Vec<(String, String)> = tables
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .code(Code::Db)?
        .collect::<std::result::Result<_, _>>()
        .code(Code::Db)?;
    for (name, sql) in list {
        h.update(name.as_bytes());
        h.update(sql.as_bytes());
        let mut st = conn.prepare(&format!("SELECT * FROM \"{name}\" ORDER BY rowid")).code(Code::Db)?;
        let n = st.column_count();
        let mut rows = st.query([]).code(Code::Db)?;
        while let Some(r) = rows.next().code(Code::Db)? {
            for i in 0..n {
                let v: rusqlite::types::Value = r.get(i).code(Code::Db)?;
                h.update(format!("{v:?}").as_bytes());
                h.update(b"\x1f");
            }
        }
    }
    Ok(hex::encode(h.finalize()))
}

/// The catalog (code) and the database schema must agree, and every foreign key must be
/// `DEFERRABLE INITIALLY DEFERRED` so statement order inside a Unit of Work is irrelevant (ADR 0001 A5).
pub fn verify_catalog(conn: &Connection, catalog: &Catalog) -> Result<()> {
    let cols = |table: &str| -> Result<Vec<String>> {
        let mut st = conn.prepare("SELECT name FROM pragma_table_info(?1)").code(Code::Db)?;
        let v = st.query_map([table], |r| r.get::<_, String>(0)).code(Code::Db)?.collect::<std::result::Result<Vec<_>, _>>().code(Code::Db)?;
        Ok(v)
    };
    let need = |have: &[String], table: &str, want: &str| -> Result<()> {
        if have.iter().any(|c| c == want) {
            Ok(())
        } else {
            Err(Error::new(Code::CatalogMismatch, format!("table '{table}' lacks column '{want}'")))
        }
    };
    for c in catalog.collections() {
        let have = cols(&c.name)?;
        if have.is_empty() {
            bail!(Code::CatalogMismatch, "collection table '{}' does not exist", c.name);
        }
        for w in ["id", "rev", "payload"] {
            need(&have, &c.name, w)?;
        }
        for col in &c.columns {
            need(&have, &c.name, &col.name)?;
        }
        for r in &c.relations {
            let rh = cols(&r.table)?;
            if rh.is_empty() {
                bail!(Code::CatalogMismatch, "relation table '{}' does not exist", r.table);
            }
            need(&rh, &r.table, &r.owner_column)?;
            for col in &r.columns {
                need(&rh, &r.table, &col.name)?;
            }
            if let Some(o) = &r.ordinal_column {
                need(&rh, &r.table, o)?;
            }
        }
    }
    let mut st = conn
        .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'")
        .code(Code::Db)?;
    let tables: Vec<(String, String)> = st
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .code(Code::Db)?
        .collect::<std::result::Result<_, _>>()
        .code(Code::Db)?;
    for (name, sql) in tables {
        let up = sql.to_ascii_uppercase();
        let refs = up.matches("REFERENCES").count();
        let deferred = up.matches("DEFERRABLE INITIALLY DEFERRED").count();
        if refs != deferred {
            bail!(Code::CatalogMismatch, "table '{name}' declares {refs} foreign key(s) but only {deferred} DEFERRABLE INITIALLY DEFERRED");
        }
    }
    Ok(())
}
