//! Catalog-driven SQLite store: the Rust-owned durability boundary (ADR 0001).
//!
//! * one SQLite database (WAL, `foreign_keys=ON`, single writer behind a process lock);
//! * lossless JSON payload + projections, rejected as a whole when they disagree (Unit of Work);
//! * schema ownership: `application_id`, forward-only `user_version`, downgrade refusal, automatic
//!   pre-upgrade snapshot;
//! * `check_consistency` (recompute every projection) and canonical state hashes for verification.

pub mod canon;
pub mod catalog;
pub mod consistency;
pub mod foundation;
pub mod project;
pub mod read;
pub mod store;
pub mod uow;

pub use catalog::{Catalog, Collection, Column, ColumnKind, Migration, Relation, Role};
pub use store::{OpenOptions, Store, StoreInfo, Synchronous, UpgradeNotice, APPLICATION_ID};
