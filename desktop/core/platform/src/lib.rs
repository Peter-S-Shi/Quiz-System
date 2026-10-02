//! Platform primitives shared by every Rust-core crate.
//!
//! This crate knows nothing about SQLite or the domain. It owns: stable error codes, the on-disk
//! layout under the data root, durable file operations (fsync, atomic publish with retry, verbatim
//! long paths), the process lock, memory probes and the test-only fault-injection hook.

pub mod error;
pub mod fault;
pub mod fsx;
pub mod identity;
pub mod layout;
pub mod mem;

pub use error::{Code, Error, Result, ResultExt};
pub use layout::DataRoot;
