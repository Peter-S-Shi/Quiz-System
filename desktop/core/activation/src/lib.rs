//! The one activation primitive (ADR 0001 section 6): isolated staging -> full validation ->
//! pre-activation snapshot -> **one SQLite transaction** on the live connection that `ATTACH`es the
//! staging database read-only and applies it -> operation journal -> rollback through the same path.
//!
//! It serves three callers with the same machinery - backup restore (replace), schema upgrade /
//! rollback (replace from a snapshot) and the future V1 migration (merge or replace, per the Migration
//! ADR). Nothing here knows any domain table: the table lists come from the store's catalog.
//!
//! Crash behaviour: a crash before the commit leaves no visible change; after it, everything is applied.
//! At next launch `recover` resolves any unfinished operation deterministically from the journal plus the
//! in-database commit record (`operation_journal`), never a half state.

pub mod journal;
pub mod validate;

use qs_platform::{bail, fault, fsx, mem, Code, DataRoot, Error, Result, ResultExt};
use qs_store::{Catalog, Store};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MergePolicy {
    /// Staging rows overwrite rows with the same id (relationship rows of those owners are replaced).
    StagingWins,
    /// Existing rows are kept; only new ids are added.
    KeepExisting,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Merge(MergePolicy),
    /// Delete-then-insert of every collection the staging database holds.
    Replace,
}
impl Mode {
    pub fn name(&self) -> &'static str {
        match self {
            Mode::Merge(MergePolicy::StagingWins) => "merge-staging-wins",
            Mode::Merge(MergePolicy::KeepExisting) => "merge-keep-existing",
            Mode::Replace => "replace",
        }
    }
}

/// A read-only assertion evaluated **inside the commit transaction** (after `ATTACH`, before the first write).
/// `sql` must return one integer: the number of violations. Anything but 0 rolls the whole activation back
/// (`ACTIVATION_FAILED`, live data unchanged). With no guards configured behavior is unchanged (ADR 0002 section 15.1).
#[derive(Debug, Clone)]
pub struct Guard {
    pub name: String,
    pub sql: String,
}

impl Guard {
    /// "No staged row shares an `id` with a live row whose stored payload differs", for every collection that the
    /// given mode merges. The attached staging database is addressed as `stg`, the live one as `main`.
    pub fn no_conflicting_ids(catalog: &Catalog, mode: Mode) -> Vec<Guard> {
        tables_for(catalog, mode)
            .into_iter()
            .map(|c| Guard {
                name: format!("no-conflicting-ids:{}", c.name),
                sql: format!("SELECT count(*) FROM stg.{t} s JOIN main.{t} m ON m.id = s.id WHERE m.payload <> s.payload", t = c.name),
            })
            .collect()
    }
}

#[derive(Debug, Clone)]
pub struct Options {
    /// Journal/audit label: "restore", "migration", "upgrade", "rollback", ...
    pub kind: String,
    /// Re-hash every referenced media file during validation (slow; archive restore does its own pass).
    pub deep_media_check: bool,
    /// Prove the staging file was not modified by the activation (WAL + ATTACH must only write `main`).
    pub verify_staging_untouched: bool,
    /// Commit-transaction guards (see [`Guard`]).
    pub guards: Vec<Guard>,
}
impl Default for Options {
    fn default() -> Self {
        Options { kind: "activation".into(), deep_media_check: false, verify_staging_untouched: false, guards: vec![] }
    }
}

#[derive(Debug, Clone)]
pub struct Report {
    pub op_id: String,
    pub mode: Mode,
    pub validate_ms: u128,
    pub snapshot_ms: u128,
    pub commit_ms: u128,
    pub peak_mib: f64,
    pub snapshot: PathBuf,
}
impl Report {
    pub fn to_json(&self) -> Value {
        json!({"opId": self.op_id, "mode": self.mode.name(), "validateMs": self.validate_ms as u64, "snapshotMs": self.snapshot_ms as u64,
               "commitMs": self.commit_ms as u64, "peakWorkingSetMiB": self.peak_mib})
    }
}

/// Time-sortable, filesystem-safe, unique operation id.
pub fn new_operation_id() -> String {
    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    format!("op-{ms:013}-{:06x}", fastrand::u32(..0xff_ffff))
}

#[derive(Debug, Clone)]
pub struct Staging {
    pub op_id: String,
    pub dir: PathBuf,
    pub db: PathBuf,
}

/// Create the isolated staging area `staging/<op>/` (the live database is never touched).
pub fn create_staging(root: &DataRoot, op_id: &str) -> Result<Staging> {
    let dir = root.staging_dir().join(op_id);
    fs::create_dir_all(&dir)?;
    Ok(Staging { op_id: op_id.to_string(), db: dir.join("staging.db"), dir })
}

/// Staging databases are read through a read-only `ATTACH`; keep them in rollback-journal mode so that
/// needs no `-shm` (ADR 0001 A7).
pub fn normalize_staging(db: &Path) -> Result<()> {
    let c = Connection::open(fsx::sqlite_path(db)?).code(Code::Db)?;
    let _: String = c.query_row("PRAGMA journal_mode=DELETE", [], |r| r.get(0)).code(Code::Db)?;
    Ok(())
}

fn sqlite_uri(path: &Path, mode: &str) -> String {
    let abs = std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf());
    let p = abs.to_string_lossy().trim_start_matches(r"\\?\").replace('\\', "/");
    let mut enc = String::with_capacity(p.len() + 16);
    for ch in p.chars() {
        match ch {
            ' ' => enc.push_str("%20"),
            '#' => enc.push_str("%23"),
            '?' => enc.push_str("%3f"),
            '%' => enc.push_str("%25"),
            c => enc.push(c),
        }
    }
    format!("file:///{}?mode={mode}", enc.trim_start_matches('/'))
}

pub fn activate(store: &mut Store, staging_db: &Path, mode: Mode, op_id: &str, opts: &Options) -> Result<Report> {
    activate_inner(store, staging_db, mode, op_id, opts, "mid-copy", true)
}

/// Rollback = apply the pre-activation snapshot through the same primitive in replace mode.
pub fn rollback(store: &mut Store, op_id: &str) -> Result<Report> {
    let snap = store.root().snapshots_dir().join(format!("pre-{op_id}.db"));
    if !snap.is_file() {
        bail!(Code::NotFound, "no pre-activation snapshot for {op_id}");
    }
    restore_snapshot(store, &snap, &format!("rb-{op_id}"), "rollback")
}

/// Apply any snapshot file (pre-activation, pre-upgrade) as a replace activation.
pub fn restore_snapshot(store: &mut Store, snapshot: &Path, op_id: &str, kind: &str) -> Result<Report> {
    let st = create_staging(store.root(), op_id)?;
    fs::copy(snapshot, &st.db)?;
    normalize_staging(&st.db)?;
    fault::point("during-rollback");
    let opts = Options { kind: kind.into(), ..Options::default() };
    let r = activate_inner(store, &st.db, Mode::Replace, op_id, &opts, "mid-copy", false);
    fsx::remove_dir_all_quiet(&st.dir);
    r
}

fn tables_for(catalog: &Catalog, mode: Mode) -> Vec<&qs_store::Collection> {
    catalog.collections().iter().filter(|c| matches!(mode, Mode::Replace) || c.canonical).collect()
}

fn activate_inner(
    store: &mut Store,
    staging_db: &Path,
    mode: Mode,
    op_id: &str,
    opts: &Options,
    mid: &str,
    snapshot_live: bool,
) -> Result<Report> {
    let root = store.root().clone();
    if staging_db.as_os_str().len() > 240 {
        bail!(Code::ActivationFailed, "staging path is too long to attach safely");
    }
    journal::write(&root, op_id, &opts.kind, mode.name(), "begun", json!({}))?;

    // 1-2. validate in isolation (blocking problems abort before anything live is touched)
    let t = Instant::now();
    let problems = validate::validate_staging(store, staging_db, opts.deep_media_check)?;
    if !problems.is_empty() {
        journal::write(&root, op_id, &opts.kind, mode.name(), "aborted", json!({"reason": "validation", "problems": problems.len()}))?;
        bail!(Code::ValidationFailed, "{} blocking problem(s); first: {}", problems.len(), problems[0]);
    }
    let validate_ms = t.elapsed().as_millis();
    journal::write(&root, op_id, &opts.kind, mode.name(), "validated", json!({}))?;
    let staging_before = if opts.verify_staging_untouched { Some(fsx::sha256_file(staging_db)?) } else { None };

    // 3. pre-activation snapshot (the rollback source)
    fault::point("before-snapshot");
    let t = Instant::now();
    let snap = root.snapshots_dir().join(format!("pre-{op_id}.db"));
    if snapshot_live {
        store.snapshot_to(&snap)?;
    }
    let snapshot_ms = t.elapsed().as_millis();
    journal::write(&root, op_id, &opts.kind, mode.name(), "snapshotted", json!({}))?;
    fault::point("after-snapshot");

    // 4. the commit point: ONE transaction on the live connection
    let t = Instant::now();
    let catalog = store.catalog().clone();
    let uri = sqlite_uri(staging_db, "ro");
    let conn = store.conn();
    conn.execute("ATTACH DATABASE ?1 AS stg", [&uri]).ctx(Code::ActivationFailed, "attach staging")?;
    let res = apply(conn, &catalog, mode, op_id, &opts.kind, mid, &opts.guards);
    if !conn.is_autocommit() {
        let _ = conn.execute_batch("ROLLBACK");
    }
    let _ = conn.execute("DETACH DATABASE stg", []);
    res.map_err(|e| Error::new(Code::ActivationFailed, format!("live data unchanged: {}", e.message)))?;
    let commit_ms = t.elapsed().as_millis();
    fault::point("after-commit");
    journal::write(&root, op_id, &opts.kind, mode.name(), "done", json!({}))?;
    fault::point("after-journal-done");

    if let Some(before) = staging_before {
        if fsx::sha256_file(staging_db)? != before {
            bail!(Code::Internal, "invariant violated: activation modified the staging file");
        }
    }
    Ok(Report { op_id: op_id.to_string(), mode, validate_ms, snapshot_ms, commit_ms, peak_mib: mem::peak_mib(), snapshot: snap })
}

fn apply(conn: &Connection, catalog: &Catalog, mode: Mode, op_id: &str, kind: &str, mid: &str, guards: &[Guard]) -> Result<()> {
    conn.execute_batch("BEGIN IMMEDIATE").code(Code::Db)?;
    for g in guards {
        let violations: i64 = conn.query_row(&g.sql, [], |r| r.get(0)).ctx(Code::Db, &format!("guard {}", g.name))?;
        if violations != 0 {
            bail!(Code::ActivationFailed, "commit guard '{}' failed ({violations} violation(s))", g.name);
        }
    }
    let colls = tables_for(catalog, mode);
    if mode == Mode::Replace {
        for c in colls.iter().rev() {
            for r in &c.relations {
                conn.execute(&format!("DELETE FROM main.{}", r.table), []).code(Code::Db)?;
            }
            conn.execute(&format!("DELETE FROM main.{}", c.name), []).code(Code::Db)?;
        }
    }
    for (i, c) in colls.iter().enumerate() {
        let mut cols = vec!["id".to_string(), "rev".into(), "payload".into()];
        cols.extend(c.columns.iter().map(|x| x.name.clone()));
        let names = cols.join(",");
        // relationship rows first for KeepExisting: they must be filtered by the *pre-activation* owner set
        for r in &c.relations {
            let mut rc = vec![r.owner_column.clone()];
            rc.extend(r.columns.iter().map(|x| x.name.clone()));
            if let Some(o) = &r.ordinal_column {
                rc.push(o.clone());
            }
            let rn = rc.join(",");
            match mode {
                Mode::Replace => {}
                Mode::Merge(MergePolicy::StagingWins) => {
                    conn.execute(&format!("DELETE FROM main.{} WHERE {} IN (SELECT id FROM stg.{})", r.table, r.owner_column, c.name), [])
                        .code(Code::Db)?;
                }
                Mode::Merge(MergePolicy::KeepExisting) => {
                    conn.execute(
                        &format!(
                            "INSERT INTO main.{t}({rn}) SELECT {rn} FROM stg.{t} WHERE {o} NOT IN (SELECT id FROM main.{c})",
                            t = r.table,
                            o = r.owner_column,
                            c = c.name
                        ),
                        [],
                    )
                    .code(Code::Db)?;
                    continue;
                }
            }
            // relation rows are inserted after the owners (below) for the other modes
        }
        let conflict = match mode {
            Mode::Replace => String::new(),
            Mode::Merge(MergePolicy::StagingWins) => {
                let upd = cols.iter().skip(1).map(|n| format!("{n}=excluded.{n}")).collect::<Vec<_>>().join(",");
                format!("ON CONFLICT(id) DO UPDATE SET {upd}")
            }
            Mode::Merge(MergePolicy::KeepExisting) => "ON CONFLICT(id) DO NOTHING".to_string(),
        };
        conn.execute(&format!("INSERT INTO main.{}({names}) SELECT {names} FROM stg.{} WHERE true {conflict}", c.name, c.name), [])
            .code(Code::Db)?;
        if mode != Mode::Merge(MergePolicy::KeepExisting) {
            for r in &c.relations {
                let mut rc = vec![r.owner_column.clone()];
                rc.extend(r.columns.iter().map(|x| x.name.clone()));
                if let Some(o) = &r.ordinal_column {
                    rc.push(o.clone());
                }
                let rn = rc.join(",");
                conn.execute(&format!("INSERT INTO main.{t}({rn}) SELECT {rn} FROM stg.{t}", t = r.table), []).code(Code::Db)?;
            }
        }
        if i == 2 {
            fault::point(mid);
        }
    }
    conn.execute("INSERT INTO main.operation_journal(op_id,kind,mode) VALUES(?1,?2,?3)", [op_id, kind, mode.name()]).code(Code::Db)?;
    fault::point("before-commit");
    conn.execute_batch("COMMIT").code(Code::Db)?; // deferred foreign keys are verified here
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolution {
    /// The commit record exists: the operation is fully applied (complete-forward).
    Committed,
    /// No commit record: nothing visible changed; staging is discarded.
    Discarded,
}

#[derive(Debug, Clone)]
pub struct Recovered {
    pub op_id: String,
    pub from_state: String,
    pub resolution: Resolution,
}

/// At next launch: resolve every unfinished operation deterministically (never a half state).
pub fn recover(store: &Store) -> Result<Vec<Recovered>> {
    let root = store.root();
    let mut out = vec![];
    for j in journal::read_all(root)? {
        let state = j["state"].as_str().unwrap_or("").to_string();
        if state == "done" || state == "aborted" {
            continue;
        }
        let op = j["opId"].as_str().unwrap_or("").to_string();
        let kind = j["kind"].as_str().unwrap_or("").to_string();
        let mode = j["mode"].as_str().unwrap_or("").to_string();
        let applied: i64 =
            store.conn().query_row("SELECT count(*) FROM operation_journal WHERE op_id=?1", [&op], |r| r.get(0)).code(Code::Db)?;
        let resolution = if applied > 0 {
            journal::write(root, &op, &kind, &mode, "done", json!({"resolvedBy": "recovery: committed -> complete-forward"}))?;
            Resolution::Committed
        } else {
            journal::write(root, &op, &kind, &mode, "aborted", json!({"resolvedBy": "recovery: not committed -> discard"}))?;
            Resolution::Discarded
        };
        fsx::remove_dir_all_quiet(&root.staging_dir().join(&op));
        out.push(Recovered { op_id: op, from_state: state, resolution });
    }
    Ok(out)
}

/// Keep only the newest `keep` snapshots (bounded retention).
pub fn prune_snapshots(root: &DataRoot, keep: usize) -> Result<usize> {
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(root.snapshots_dir())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|x| x == "db"))
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    files.sort_by_key(|f| std::cmp::Reverse(f.0));
    let mut n = 0;
    for (_, p) in files.into_iter().skip(keep) {
        fs::remove_file(p)?;
        n += 1;
    }
    Ok(n)
}
