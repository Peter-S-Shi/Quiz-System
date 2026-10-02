//! The WebView-facing surface of the Store Port.
//!
//! Boundary rules (ADR 0001 sections 4 and 8):
//! * the WebView may call only [`ALLOWLIST`] - commands that carry no filesystem path and cannot trigger
//!   filesystem maintenance (media GC is Rust-owned and runs under a fixed safety policy);
//! * no response that crosses into the WebView may contain an absolute/local filesystem path. Responses
//!   are built path-free, and [`scrub`] is a defense-in-depth pass that redacts any path that slips into an
//!   error message.

use crate::Core;
use serde_json::{json, Value};

/// Store Port commands the WebView may call. Path-carrying commands (`media.ingest_file`, `backup.*`) and
/// maintenance (`media.gc`) are deliberately absent: they are reachable only from Rust.
pub const ALLOWLIST: &[&str] = &[
    "schema.info",
    "store.read",
    "store.count",
    "store.commit",
    "store.check_consistency",
    "media.locate",
    "snapshots.list",
    "snapshots.restore",
];

/// Dispatch a WebView request: allowlist check, then the command, then path scrubbing of the envelope.
pub fn dispatch(core: &Core, command: &str, args: &Value) -> Value {
    if !ALLOWLIST.contains(&command) {
        return json!({"ok": false, "error": {"code": "REJECT_SHAPE", "message": format!("command '{command}' is not available to the WebView")}});
    }
    let mut out = core.dispatch(command, args);
    scrub(&mut out, &core.root().path().display().to_string());
    out
}

/// Result envelope for a media file stored from a native flow (dialog / drag-and-drop). Path-free by construction.
pub fn media_ingest_result(id: &str, hash: &str, size: u64, name: &str, mime: &str, deduplicated: bool) -> Value {
    json!({"ok": true, "result": {"id": id, "hash": hash, "size": size, "name": name, "mimeType": mime, "deduplicated": deduplicated}})
}

fn token_is_abs_path(tok: &str) -> bool {
    let t = tok.trim_matches(|c: char| matches!(c, '"' | '\'' | '(' | ')' | '[' | ']' | ',' | ';' | ':' | '<' | '>'));
    let b = t.as_bytes();
    t.starts_with(r"\\") // UNC and \\?\ verbatim
        || t.starts_with("/Users/")
        || t.starts_with("/home/")
        || (b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/'))
}

fn tokens(s: &str) -> impl Iterator<Item = &str> {
    s.split(|c: char| c.is_whitespace())
}

fn string_has_path(s: &str) -> bool {
    tokens(s).any(token_is_abs_path)
}

/// First string anywhere in `v` that contains an absolute/local filesystem path.
pub fn find_absolute_path(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => string_has_path(s).then(|| s.clone()),
        Value::Array(a) => a.iter().find_map(find_absolute_path),
        Value::Object(m) => m.values().find_map(find_absolute_path),
        _ => None,
    }
}

/// Redact absolute paths (and the literal data root) from every string in the envelope.
pub fn scrub(v: &mut Value, root: &str) {
    match v {
        Value::String(s) => {
            let mut text = if !root.is_empty() && s.contains(root) { s.replace(root, "<data folder>") } else { s.clone() };
            if string_has_path(&text) {
                text = text
                    .split_inclusive(|c: char| c.is_whitespace())
                    .map(|part| {
                        let trimmed = part.trim_end();
                        let ws = &part[trimmed.len()..];
                        if token_is_abs_path(trimmed) {
                            format!("<path>{ws}")
                        } else {
                            part.to_string()
                        }
                    })
                    .collect();
            }
            *s = text;
        }
        Value::Array(a) => a.iter_mut().for_each(|x| scrub(x, root)),
        Value::Object(m) => m.values_mut().for_each(|x| scrub(x, root)),
        _ => {}
    }
}
