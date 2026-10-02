//! Test support for the Rust core. **Never shipped** (no product crate depends on it).
//!
//! The evidence-shaped tables here are a *synthetic* catalog used to exercise the store, activation and
//! archive machinery. They are NOT a proposed domain schema (ADR 0001 section 5.3: domain tables are
//! decided by later ADRs); they exist so the foundation's guarantees can be proven against realistic
//! hard relationships (FK), soft provenance (no FK), many-valued projections and unknown fields.

pub mod catalogs;
pub mod data;

pub use catalogs::{evidence_catalog, evidence_catalog_v2, evidence_catalog_v2_failing};
pub use data::*;
