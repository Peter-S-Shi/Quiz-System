//! The WebView-facing surface of the Store Port.
//!
//! Structured boundary contract (ADR 0001 sections 4 and 8):
//! * the WebView may call only [`ALLOWLIST`] - commands that carry no filesystem path and cannot trigger
//!   filesystem maintenance (media GC is Rust-owned and runs under a fixed safety policy);
//! * **system-generated results are path-free by construction** (`schema.info`, `media.locate`, native
//!   media/backup results, snapshot names, ...) and are tested to be so - they are never post-processed;
//! * **canonical/domain content is never rewritten.** `store.read` payloads, projections and user-authored
//!   text that merely *looks* like a path (`C:\Windows\System32`, `/home/alice/file`, `\\server\share`)
//!   round-trip losslessly;
//! * the only text sanitized is the system-generated diagnostic: `error.message` of a failure envelope (and
//!   the same field where the app builds boot/recovery status), so an internal path in an I/O or database
//!   error can never leak.

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
    // V1 migration (ADR 0002): only the path-free steps. `migration.prepare` carries a source path and is
    // reachable only from the native Open flow in Rust.
    "migration.status",
    "migration.confirm",
    "migration.cancel",
    "migration.undo",
];

/// Dispatch a WebView request: allowlist check, then the command, then diagnostic sanitization of a failure.
pub fn dispatch(core: &Core, command: &str, args: &Value) -> Value {
    if !ALLOWLIST.contains(&command) {
        return json!({"ok": false, "error": {"code": "REJECT_SHAPE", "message": format!("command '{command}' is not available to the WebView")}});
    }
    let mut out = core.dispatch(command, args);
    sanitize_envelope(&mut out, &core.root().path().display().to_string());
    out
}

/// Result envelope for a media file stored from a native flow (dialog / drag-and-drop). Path-free by construction.
pub fn media_ingest_result(id: &str, hash: &str, size: u64, name: &str, mime: &str, deduplicated: bool) -> Value {
    json!({"ok": true, "result": {"id": id, "hash": hash, "size": size, "name": name, "mimeType": mime, "deduplicated": deduplicated}})
}

const UNIX_ROOTS: &[&str] = &["/Users/", "/home/", "/tmp/", "/var/", "/etc/", "/mnt/", "/root/", "/opt/", "/usr/"];

fn prev_blocks_path_start(prev: Option<char>) -> bool {
    prev.is_some_and(|c| c.is_alphanumeric() || c == '.' || c == '_' || c == '-')
}

/// Byte spans of absolute/local filesystem paths inside a diagnostic string: drive paths (`C:\..`, `C:/..`,
/// spaces allowed), UNC and verbatim paths (`\\server\share`, `\\?\C:\..`), and common Unix roots. A path
/// extends to the first character that cannot be part of one in a diagnostic (a quote, `<>|*?`, a line
/// break) or to a `: ` / `:` + end that separates it from the message.
pub fn path_spans(s: &str) -> Vec<(usize, usize)> {
    let b = s.as_bytes();
    let mut spans = vec![];
    let mut i = 0;
    while i < b.len() {
        let prev = s[..i].chars().next_back();
        let drive = i + 2 < b.len()
            && b[i].is_ascii_alphabetic()
            && b[i + 1] == b':'
            && matches!(b[i + 2], b'\\' | b'/')
            && !prev_blocks_path_start(prev);
        let unc = i + 1 < b.len() && b[i] == b'\\' && b[i + 1] == b'\\' && prev != Some('\\');
        let unix = s.is_char_boundary(i) && UNIX_ROOTS.iter().any(|r| s[i..].starts_with(r)) && !prev_blocks_path_start(prev);
        if !(drive || unc || unix) {
            i += 1;
            continue;
        }
        let mut j = i;
        while j < b.len() {
            let c = b[j];
            if matches!(c, b'"' | b'\'' | b'<' | b'>' | b'|' | b'*' | b'?' | b'\n' | b'\r' | b'\t') {
                break;
            }
            if c == b':' && j > i + 1 && (j + 1 == b.len() || b[j + 1] == b' ' || b[j + 1] == b'\n') {
                break;
            }
            if c == b' ' && b[j..].starts_with(b" (os error") {
                break; // the standard I/O error suffix follows the path
            }
            j += 1;
        }
        while j > i && matches!(b[j - 1], b'.' | b',' | b';' | b')' | b' ') {
            j -= 1;
        }
        if j > i + 2 {
            spans.push((i, j));
            i = j;
        } else {
            i += 1;
        }
    }
    spans
}

/// Redact internal paths from a system-generated diagnostic: the literal data root first, then any path.
pub fn sanitize_message(msg: &str, root: &str) -> String {
    let mut text = msg.to_string();
    if !root.is_empty() {
        text = text.replace(root, "<data folder>").replace(&root.replace('\\', "/"), "<data folder>");
    }
    let spans = path_spans(&text);
    if spans.is_empty() {
        return text;
    }
    let mut out = String::with_capacity(text.len());
    let mut at = 0;
    for (s, e) in spans {
        out.push_str(&text[at..s]);
        out.push_str("<path>");
        at = e;
    }
    out.push_str(&text[at..]);
    out
}

/// Sanitize ONLY the diagnostic field of a failure envelope (`{"ok":false,"error":{"message":..}}`).
/// Success results and any canonical/domain content are never touched.
pub fn sanitize_envelope(v: &mut Value, root: &str) {
    if v.get("ok") != Some(&Value::Bool(false)) {
        return;
    }
    if let Some(Value::String(m)) = v.get_mut("error").and_then(|e| e.get_mut("message")) {
        *m = sanitize_message(m, root);
    }
}

/// First string anywhere in `v` that contains an absolute/local path (used by the "responses are
/// path-free" regression tests on system-generated results; never applied to canonical content).
pub fn find_absolute_path(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => (!path_spans(s).is_empty()).then(|| s.clone()),
        Value::Array(a) => a.iter().find_map(find_absolute_path),
        Value::Object(m) => m.values().find_map(find_absolute_path),
        _ => None,
    }
}
