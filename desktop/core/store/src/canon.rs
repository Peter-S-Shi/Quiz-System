//! Canonical, deterministic JSON and its SHA-256 (ADR 0001 section 5.3, "lossless structured-JSON fidelity").
//!
//! Rules (mirrored byte-for-byte by `desktop/ui/src/canonical.js`, verified by shared vectors):
//! * object keys sorted by Unicode code point (== UTF-8 byte order), no insignificant whitespace;
//! * arrays keep their order;
//! * strings are JSON-escaped minimally and never normalized (no NFC/NFD rewriting);
//! * integers print as exact decimal digits; other numbers print as the ECMAScript `Number::toString`
//!   of the nearest f64 (so `1.0`, `1` and `1e0` hash identically, as they do in JS);
//! * numbers outside the JS safe-integer range must travel as strings (A4); Rust keeps such literals exact.

use serde_json::Value;
use sha2::{Digest, Sha256};

pub fn canonical(v: &Value) -> String {
    let mut out = String::new();
    write_value(v, &mut out);
    out
}

pub fn hash_hex(v: &Value) -> String {
    hex::encode(Sha256::digest(canonical(v).as_bytes()))
}

fn write_value(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&canonical_number(&n.to_string())),
        Value::String(s) => write_string(s, out),
        Value::Array(a) => {
            out.push('[');
            for (i, x) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_value(x, out);
            }
            out.push(']');
        }
        Value::Object(m) => {
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort();
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(k, out);
                out.push(':');
                write_value(&m[k.as_str()], out);
            }
            out.push('}');
        }
    }
}

fn write_string(s: &str, out: &mut String) {
    // serde_json's escaping equals JSON.stringify: short escapes for \b \f \n \r \t, lowercase \u00xx for
    // other control characters, everything else (including U+2028/2029 and DEL) raw.
    out.push_str(&serde_json::to_string(s).expect("string serialization cannot fail"));
}

fn canonical_number(text: &str) -> String {
    let is_int = !text.contains(['.', 'e', 'E']);
    if is_int {
        let t = text.strip_prefix('+').unwrap_or(text);
        let (neg, digits) = match t.strip_prefix('-') {
            Some(d) => (true, d),
            None => (false, t),
        };
        let digits = digits.trim_start_matches('0');
        if digits.is_empty() {
            return "0".into();
        }
        return if neg { format!("-{digits}") } else { digits.to_string() };
    }
    match text.parse::<f64>() {
        Ok(x) if x.is_finite() => es_number_to_string(x),
        _ => text.to_string(),
    }
}

/// Shortest round-trip decimal digits of a positive finite f64 as (digits, exponent10-of-first-digit), with
/// ECMAScript's tie rule: among equally short candidates take the closest to the exact value, and on an
/// exact tie the one with an even last digit. Rust's formatter picks the other candidate on exact ties
/// (found by the JS<->Rust vectors: 153924.33520507812), so ties are re-decided from the exact expansion.
fn shortest_digits(x: f64) -> (String, i32) {
    let sci = format!("{:e}", x); // shortest round-trip digits, e.g. "1.2345e-7"
    let (mant, exp) = sci.split_once('e').expect("exponent form");
    let exp: i32 = exp.parse().expect("exponent");
    let digits: String = mant.chars().filter(|c| *c != '.').collect();
    if digits.len() < 16 {
        return (digits, exp); // an exact-tie between two round-tripping candidates needs ~16+ digits
    }
    let exact = format!("{:.780e}", x);
    let (emant, eexp) = exact.split_once('e').expect("exponent form");
    let eexp: i32 = eexp.parse().expect("exponent");
    let ed: Vec<u8> = emant.bytes().filter(|b| *b != b'.').map(|b| b - b'0').collect();
    let k = digits.len();
    let mut kept: Vec<u8> = ed[..k].to_vec();
    let rest = &ed[k..];
    let up = match rest[0] {
        0..=4 => false,
        6..=9 => true,
        _ => rest[1..].iter().any(|d| *d != 0) || kept[k - 1] % 2 == 1, // exact tie -> round to even
    };
    let mut e10 = eexp;
    if up {
        let mut i = k;
        loop {
            if i == 0 {
                kept.insert(0, 1);
                kept.truncate(k);
                e10 += 1;
                break;
            }
            i -= 1;
            if kept[i] == 9 {
                kept[i] = 0;
            } else {
                kept[i] += 1;
                break;
            }
        }
    }
    let cand: String = kept.iter().map(|d| (b'0' + d) as char).collect();
    let text = format!("{}.{}e{}", &cand[..1], &cand[1..], e10);
    match text.parse::<f64>() {
        Ok(back) if back == x => (cand, e10),
        _ => (digits, exp),
    }
}

/// ECMAScript `Number::toString(x)` for a finite f64 (ECMA-262 section 6.1.6.1.20).
pub fn es_number_to_string(x: f64) -> String {
    if x == 0.0 {
        return "0".into();
    }
    let neg = x < 0.0;
    let (digits, exp) = shortest_digits(x.abs());
    let k = digits.len() as i32;
    let n = exp + 1; // value = 0.DIGITS * 10^n
    let mut s = String::new();
    if neg {
        s.push('-');
    }
    if k <= n && n <= 21 {
        s.push_str(&digits);
        s.push_str(&"0".repeat((n - k) as usize));
    } else if 0 < n && n <= 21 {
        s.push_str(&digits[..n as usize]);
        s.push('.');
        s.push_str(&digits[n as usize..]);
    } else if -6 < n && n <= 0 {
        s.push_str("0.");
        s.push_str(&"0".repeat((-n) as usize));
        s.push_str(&digits);
    } else {
        let e = n - 1;
        s.push_str(&digits[..1]);
        if k > 1 {
            s.push('.');
            s.push_str(&digits[1..]);
        }
        s.push('e');
        s.push(if e < 0 { '-' } else { '+' });
        s.push_str(&e.abs().to_string());
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn parse(t: &str) -> Value {
        serde_json::from_str(t).unwrap()
    }

    #[test]
    fn keys_sorted_arrays_ordered_no_whitespace() {
        let v = parse(r#"{ "b": [3, 1, 2], "a": {"z": 1, "y": null}, "c": "x" }"#);
        assert_eq!(canonical(&v), r#"{"a":{"y":null,"z":1},"b":[3,1,2],"c":"x"}"#);
    }

    #[test]
    fn key_order_is_not_significant_but_array_order_is() {
        assert_eq!(hash_hex(&parse(r#"{"a":1,"b":2}"#)), hash_hex(&parse(r#"{"b":2,"a":1}"#)));
        assert_ne!(hash_hex(&parse("[1,2]")), hash_hex(&parse("[2,1]")));
    }

    #[test]
    fn unknown_fields_and_extensions_change_the_hash() {
        let base = json!({"id": "r1", "answer": "x"});
        let with = json!({"id": "r1", "answer": "x", "extensions": {"vendor": [1, 2]}});
        assert_ne!(hash_hex(&base), hash_hex(&with));
    }

    #[test]
    fn numbers_follow_ecmascript_formatting() {
        for (src, want) in [
            ("1", "1"),
            ("1.0", "1"),
            ("1e0", "1"),
            ("-0", "0"),
            ("-0.0", "0"),
            ("0.5", "0.5"),
            ("1.5e300", "1.5e+300"),
            ("1e21", "1e+21"),
            ("123456789012345680000", "123456789012345680000"),
            ("1e-7", "1e-7"),
            ("0.000001", "0.000001"),
            ("0.0000001", "1e-7"),
            ("9007199254740991", "9007199254740991"),
            ("3.141592653589793", "3.141592653589793"),
            ("100", "100"),
            ("1.25e2", "125"),
            ("153924.33520507812", "153924.33520507812"), // exact decimal tie: ES picks the even candidate
            ("0.30000000000000004", "0.30000000000000004"),
            ("5e-324", "5e-324"),
            ("1.7976931348623157e308", "1.7976931348623157e+308"),
        ] {
            assert_eq!(canonical(&parse(src)), want, "{src}");
        }
    }

    #[test]
    fn integers_beyond_f64_stay_exact_on_the_rust_side() {
        assert_eq!(canonical(&parse("12345678901234567890123")), "12345678901234567890123");
    }

    #[test]
    fn strings_are_never_normalized() {
        let nfc = "\u{e9}"; // e-acute precomposed
        let nfd = "e\u{301}"; // e + combining acute
        assert_ne!(hash_hex(&json!(nfc)), hash_hex(&json!(nfd)));
        assert_eq!(canonical(&json!("a\u{1}\n\"\\")), "\"a\\u0001\\n\\\"\\\\\"");
        assert_eq!(canonical(&json!("\u{2028}")), "\"\u{2028}\"");
    }
}
