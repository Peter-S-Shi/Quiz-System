//! Canonical (deterministic) JSON encoding + SHA-256, used for lossless-fidelity checks.
//! Object keys sorted by UTF-16 code units (RFC 8785 order); numbers keep their source text
//! (serde_json `arbitrary_precision`), so no precision is lost inside Rust.
use serde_json::Value;
use sha2::{Digest, Sha256};

pub fn canonical(v: &Value) -> String {
    let mut s = String::new();
    write(v, &mut s);
    s
}

fn write(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&n.to_string()),
        Value::String(s) => out.push_str(&serde_json::to_string(s).unwrap()),
        Value::Array(a) => {
            out.push('[');
            for (i, x) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write(x, out);
            }
            out.push(']');
        }
        Value::Object(m) => {
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(k).unwrap());
                out.push(':');
                write(&m[*k], out);
            }
            out.push('}');
        }
    }
}

pub fn hash_value(v: &Value) -> String {
    hex::encode(Sha256::digest(canonical(v).as_bytes()))
}

pub fn hash_text_json(text: &str) -> anyhow::Result<String> {
    let v: Value = serde_json::from_str(text)?;
    Ok(hash_value(&v))
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}
