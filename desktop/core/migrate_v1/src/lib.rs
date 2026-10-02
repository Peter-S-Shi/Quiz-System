//! V1 -> V2 migration (ADR 0002). Rust reads, maps, stages, validates and activates; the WebView only ever
//! sees the path-free preview report and confirms by `reportHash`.
//!
//! Pipeline: `prepare` (intake with copy-in -> lossless read -> detection -> validation -> staging ->
//! conservation proof -> preview report) then `activate` (confirm -> publish media/artifact -> additive
//! activation with a commit guard -> post-verify) and `undo` (targeted inverse unit of work).

pub mod catalog;
pub mod diag;
pub mod engine;
pub mod model;
pub mod reader;
pub mod stage;
pub mod verify;

pub use catalog::product_catalog;
pub use engine::{activate, prepare, purge_orphan_staging, status, undo, Activation, Host, PrepareOptions, Prepared, UndoOutcome};

use qs_platform::{bail, Code, DataRoot, Result};
use qs_store::{Catalog, Store};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// A minimal [`Host`] (store + write gate) for tests, tooling and the child-process scenarios. The shipped
/// app implements `Host` for `qs_port::Core`.
pub struct StandaloneHost {
    store: Mutex<Store>,
    gate: AtomicBool,
    catalog: Arc<Catalog>,
    root: DataRoot,
}

pub struct StandaloneGate<'a>(&'a AtomicBool);
impl Drop for StandaloneGate<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl StandaloneHost {
    pub fn new(store: Store) -> StandaloneHost {
        let catalog = store.catalog().clone();
        let root = store.root().clone();
        StandaloneHost { store: Mutex::new(store), gate: AtomicBool::new(false), catalog, root }
    }
    pub fn gate_is_open(&self) -> bool {
        self.gate.load(Ordering::SeqCst)
    }
}

impl Host for StandaloneHost {
    type Gate<'a> = StandaloneGate<'a>;
    fn root(&self) -> &DataRoot {
        &self.root
    }
    fn catalog(&self) -> Arc<Catalog> {
        self.catalog.clone()
    }
    fn with_store<T>(&self, f: impl FnOnce(&mut Store) -> T) -> T {
        f(&mut self.store.lock().unwrap_or_else(|e| e.into_inner()))
    }
    fn write_gate(&self) -> Result<StandaloneGate<'_>> {
        if self.gate.swap(true, Ordering::SeqCst) {
            bail!(Code::StoreBusy, "another maintenance operation holds the write gate");
        }
        Ok(StandaloneGate(&self.gate))
    }
}
