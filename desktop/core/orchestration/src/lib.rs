//! Learning Orchestration persistence (ADR 0003 section 15): the second domain catalog migration (store
//! schema 2 -> 3). The scheduling *semantics* live in the JS/TS domain layer (ADR 0001 section 4); Rust owns
//! only the structural invariants: identity, uniqueness (partial unique indexes), foreign keys and atomic
//! Units of Work with revision preconditions.

pub mod catalog;

pub use catalog::{
    product_catalog, scheduling_collections, EXCEPTION, FULFILLMENT, SCHEDULE, SCHEDULING_COLLECTIONS, SELECTION, SUGGESTION,
};
