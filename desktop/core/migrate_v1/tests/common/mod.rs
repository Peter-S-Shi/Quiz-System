#![allow(dead_code)]
//! Shared test harness: a temp V2 data root with the product catalog, V1 fixtures, JSON editing helpers.

pub use qs_migrate_v1::Host;
use qs_migrate_v1::{activate, prepare, Activation, PrepareOptions, Prepared, StandaloneHost};
use qs_platform::DataRoot;
use qs_store::{OpenOptions, Store};
use serde_json::Value;
use std::path::{Path, PathBuf};

pub struct Env {
    pub dir: tempfile::TempDir,
    pub root: DataRoot,
    pub host: StandaloneHost,
}

pub fn env() -> Env {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = DataRoot::at(dir.path().join("qs-data"));
    let store = Store::open(&root, std::sync::Arc::new(qs_migrate_v1::product_catalog()), &OpenOptions::default()).expect("open store");
    Env { dir, root, host: StandaloneHost::new(store) }
}

pub fn fixture_path(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join(name)
}
pub fn fixture_bytes(name: &str) -> Vec<u8> {
    std::fs::read(fixture_path(name)).unwrap_or_else(|e| panic!("fixture {name}: {e}"))
}
pub fn fixture(name: &str) -> Value {
    serde_json::from_slice(&fixture_bytes(name)).unwrap()
}

impl Env {
    /// Write source bytes into the temp dir (the "user's file") and return its path.
    pub fn source(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let p = self.dir.path().join(name);
        std::fs::write(&p, bytes).unwrap();
        p
    }
    pub fn source_json(&self, name: &str, v: &Value) -> PathBuf {
        self.source(name, serde_json::to_vec(v).unwrap().as_slice())
    }
    pub fn prepare(&self, path: &Path) -> Prepared {
        prepare(&self.host, path, None, &PrepareOptions::default()).expect("prepare returns a result")
    }
    pub fn prepare_with_artifact(&self, path: &Path, artifact: &Path) -> Prepared {
        prepare(&self.host, path, Some(artifact), &PrepareOptions::default()).expect("prepare returns a result")
    }
    pub fn activate(&self, p: &Prepared) -> Activation {
        activate(&self.host, p, &p.report_hash).expect("activation")
    }
    /// prepare + confirm + activate; panics if blocked.
    pub fn import(&self, name: &str, v: &Value) -> (Prepared, Activation) {
        let src = self.source_json(name, v);
        let p = self.prepare(&src);
        assert!(!p.blocked, "unexpectedly blocked: {}", codes(&p).join(","));
        let a = self.activate(&p);
        (p, a)
    }
    pub fn state_hash(&self) -> String {
        self.host.with_store(|s| s.state_hash(true).unwrap())
    }
    pub fn count(&self, coll: &str) -> i64 {
        self.host.with_store(|s| s.count(coll).unwrap())
    }
}

pub fn codes(p: &Prepared) -> Vec<String> {
    p.report["diagnostics"].as_array().unwrap().iter().map(|d| d["code"].as_str().unwrap().to_string()).collect()
}
pub fn blocking_codes(p: &Prepared) -> Vec<String> {
    p.report["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|d| d["severity"] == "blocking")
        .map(|d| d["code"].as_str().unwrap().to_string())
        .collect()
}
pub fn has(p: &Prepared, code: &str) -> bool {
    codes(p).iter().any(|c| c == code)
}

/// Independent base64 decoder (std only) used as the test-side reference for decoded media bytes.
pub fn b64_decode(s: &str) -> Vec<u8> {
    let val = |c: u8| -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a') as u32 + 26),
            b'0'..=b'9' => Some((c - b'0') as u32 + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    };
    let mut out = vec![];
    let (mut acc, mut n) = (0u32, 0);
    for c in s.bytes() {
        if let Some(v) = val(c) {
            acc = (acc << 6) | v;
            n += 1;
            if n == 4 {
                out.extend_from_slice(&[(acc >> 16) as u8, (acc >> 8) as u8, acc as u8]);
                acc = 0;
                n = 0;
            }
        }
    }
    match n {
        2 => out.push((acc >> 4) as u8),
        3 => out.extend_from_slice(&[(acc >> 10) as u8, (acc >> 2) as u8]),
        _ => {}
    }
    out
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(bytes))
}

/// Every string anywhere in `v` that looks like an absolute/local path (the report must carry none).
pub fn path_like_strings(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::String(s) => {
            let b = s.as_bytes();
            let drive = b.len() > 2 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/');
            if drive || s.starts_with("\\\\") || s.starts_with("/Users/") || s.starts_with("/home/") || s.contains("AppData") {
                out.push(s.clone());
            }
        }
        Value::Array(a) => a.iter().for_each(|x| path_like_strings(x, out)),
        Value::Object(o) => o.values().for_each(|x| path_like_strings(x, out)),
        _ => {}
    }
}
