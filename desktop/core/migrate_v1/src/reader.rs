//! The lossless-first reader (ADR 0002 section 6; Inventory D-1).
//!
//! An event-level JSON reader that is **not** `serde_json::Value` parsing and **not** V1's `normalize*`:
//! * a duplicate object key at any depth is `MIG_SOURCE_DUPLICATE_KEY` (last-wins would silently discard data);
//! * strings are code-point exact; a lone UTF-16 surrogate escape is `MIG_SOURCE_LONE_SURROGATE` (never U+FFFD);
//! * a number must be JS-producible (same value as the shortest ECMAScript form of its double, integers within
//!   the safe range), otherwise `MIG_SOURCE_UNSAFE_NUMBER`;
//! * `mediaAssets[*].data` / `assets[*].data` are **streamed**: base64 is decoded on the fly into a temp file and
//!   hashed (SHA-256 over the decoded bytes); everything else is materialized under a bound.
//!
//! Nothing here interprets the document (that is detection/model); it only guarantees what was read is exact.

use crate::diag::{esc, Diags};
use qs_platform::{Code, Error, Result};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs::File;
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};

pub const DEFAULT_NONMEDIA_LIMIT: u64 = 128 * 1024 * 1024;
const MAX_DEPTH: usize = 256;
const BUF: usize = 1 << 20;

#[derive(Debug, Clone)]
pub struct ReaderOptions {
    /// Bound on the materialized (non-media) part of the document.
    pub nonmedia_limit: u64,
    /// Where decoded media payloads are written (created if missing).
    pub media_dir: PathBuf,
    /// Decode and hash media but write nothing (the verifier re-reads the source this way).
    pub discard_media: bool,
}

/// One streamed `data` payload.
#[derive(Debug, Clone)]
pub struct MediaBlob {
    /// `"mediaAssets"` or `"assets"`.
    pub list_key: String,
    pub index: usize,
    /// Decoded bytes on disk (absent when the payload was invalid).
    pub tmp: Option<PathBuf>,
    pub sha256: String,
    pub size: u64,
    pub invalid: Option<String>,
}

#[derive(Debug)]
pub struct Read_ {
    /// The document with media `data` removed (their presence is recorded in `media`). `None` after a fatal error.
    pub root: Option<Value>,
    pub media: Vec<MediaBlob>,
    pub diags: Diags,
    pub nonmedia_bytes: u64,
}

enum Fatal {
    NotUtf8,
    NotJson(String),
    TooLarge,
    Io(String),
}

#[derive(Clone)]
enum Seg {
    Key(String),
    Idx(usize),
}

struct P {
    f: File,
    buf: Vec<u8>,
    pos: usize,
    len: usize,
    eof: bool,
    nonmedia: u64,
    limit: u64,
    path: Vec<Seg>,
    diags: Diags,
    media: Vec<MediaBlob>,
    media_dir: PathBuf,
    discard_media: bool,
    media_seq: usize,
}

type R<T> = std::result::Result<T, Fatal>;

fn is_ws(c: u8) -> bool {
    matches!(c, b' ' | b'\t' | b'\n' | b'\r')
}

const B64: [i8; 256] = {
    let mut t = [-1i8; 256];
    let mut i = 0;
    while i < 26 {
        t[(b'A' + i) as usize] = i as i8;
        t[(b'a' + i) as usize] = 26 + i as i8;
        i += 1;
    }
    let mut d = 0;
    while d < 10 {
        t[(b'0' + d) as usize] = 52 + d as i8;
        d += 1;
    }
    t[b'+' as usize] = 62;
    t[b'/' as usize] = 63;
    t
};

enum Prefix {
    Probing(Vec<u8>),
    SkipToComma(usize),
    Body,
}

struct Decoder {
    out: Option<BufWriter<File>>,
    wrote: bool,
    tmp: PathBuf,
    hasher: Sha256,
    size: u64,
    acc: u32,
    n: u8,
    pad: u8,
    invalid: Option<String>,
    prefix: Prefix,
}

impl Decoder {
    fn fail(&mut self, why: &str) {
        if self.invalid.is_none() {
            self.invalid = Some(why.to_string());
        }
        self.out = None;
    }
    fn emit(&mut self, bytes: &[u8]) {
        if self.invalid.is_some() {
            return;
        }
        if let Some(o) = self.out.as_mut() {
            if o.write_all(bytes).is_err() {
                self.fail("write failed");
                return;
            }
        }
        self.hasher.update(bytes);
        self.size += bytes.len() as u64;
    }
    fn symbol(&mut self, c: u8) {
        if self.invalid.is_some() {
            return;
        }
        let v = B64[c as usize];
        if v >= 0 {
            if self.pad > 0 {
                return self.fail("data after padding");
            }
            self.acc = (self.acc << 6) | v as u32;
            self.n += 1;
            if self.n == 4 {
                let b = [(self.acc >> 16) as u8, (self.acc >> 8) as u8, self.acc as u8];
                self.emit(&b);
                self.acc = 0;
                self.n = 0;
            }
        } else if c == b'=' {
            if self.n < 2 {
                return self.fail("misplaced padding");
            }
            self.pad += 1;
            if self.pad > 2 || self.n + self.pad > 4 {
                self.fail("too much padding");
            }
        } else {
            self.fail("illegal base64 character");
        }
    }
    fn byte(&mut self, c: u8) {
        match &mut self.prefix {
            Prefix::Body => self.symbol(c),
            Prefix::SkipToComma(n) => {
                if c == b',' {
                    self.prefix = Prefix::Body;
                } else {
                    *n += 1;
                    if *n > 256 {
                        self.fail("unterminated data: prefix");
                    }
                }
            }
            Prefix::Probing(p) => {
                p.push(c);
                let want = b"data:";
                if !want.starts_with(p.as_slice()) {
                    let held = std::mem::take(p);
                    self.prefix = Prefix::Body;
                    for b in held {
                        self.symbol(b);
                    }
                } else if p.len() == want.len() {
                    self.prefix = Prefix::SkipToComma(0);
                }
            }
        }
    }
    fn finish(mut self) -> (Option<PathBuf>, String, u64, Option<String>) {
        if let Prefix::Probing(p) = std::mem::replace(&mut self.prefix, Prefix::Body) {
            for b in p {
                self.symbol(b);
            }
        }
        if matches!(self.prefix, Prefix::SkipToComma(_)) {
            self.fail("data: prefix without a comma");
        }
        if self.invalid.is_none() {
            if self.pad > 0 && self.n + self.pad != 4 {
                self.fail("incomplete padding");
            } else {
                match self.n {
                    0 => {}
                    1 => self.fail("truncated base64"),
                    2 => {
                        let b = [(self.acc >> 4) as u8];
                        self.emit(&b);
                    }
                    _ => {
                        let b = [(self.acc >> 10) as u8, (self.acc >> 2) as u8];
                        self.emit(&b);
                    }
                }
            }
        }
        if self.invalid.is_none() && self.size == 0 {
            self.fail("empty payload");
        }
        if self.invalid.is_none() {
            if let Some(mut o) = self.out.take() {
                if o.flush().is_err() || o.get_ref().sync_all().is_err() {
                    self.invalid = Some("write failed".into());
                }
            }
        }
        self.out = None;
        if self.invalid.is_some() {
            if self.wrote {
                let _ = std::fs::remove_file(&self.tmp);
            }
            return (None, String::new(), 0, self.invalid);
        }
        (if self.wrote { Some(self.tmp) } else { None }, hex::encode(self.hasher.finalize()), self.size, None)
    }
}

impl P {
    fn pointer(&self) -> String {
        self.path
            .iter()
            .map(|s| match s {
                Seg::Key(k) => format!("/{}", esc(k)),
                Seg::Idx(i) => format!("/{i}"),
            })
            .collect()
    }

    fn fill(&mut self) -> R<()> {
        if self.eof || self.pos < self.len {
            return Ok(());
        }
        self.pos = 0;
        self.len = 0;
        let n = self.f.read(&mut self.buf).map_err(|e| Fatal::Io(e.to_string()))?;
        if n == 0 {
            self.eof = true;
        }
        self.len = n;
        Ok(())
    }
    fn peek(&mut self) -> R<Option<u8>> {
        self.fill()?;
        Ok(if self.pos < self.len { Some(self.buf[self.pos]) } else { None })
    }
    fn count(&mut self, n: usize) -> R<()> {
        self.nonmedia += n as u64;
        if self.nonmedia > self.limit {
            return Err(Fatal::TooLarge);
        }
        Ok(())
    }
    fn bump(&mut self) -> R<u8> {
        match self.peek()? {
            Some(c) => {
                self.pos += 1;
                self.count(1)?;
                Ok(c)
            }
            None => Err(Fatal::NotJson("unexpected end of document".into())),
        }
    }
    fn skip_ws(&mut self) -> R<()> {
        while let Some(c) = self.peek()? {
            if is_ws(c) {
                self.bump()?;
            } else {
                break;
            }
        }
        Ok(())
    }
    fn expect(&mut self, lit: &[u8]) -> R<()> {
        for &b in lit {
            if self.bump()? != b {
                return Err(Fatal::NotJson("invalid literal".into()));
            }
        }
        Ok(())
    }

    /// Returns `None` for a streamed (omitted) media payload.
    fn value(&mut self) -> R<Option<Value>> {
        if self.path.len() > MAX_DEPTH {
            return Err(Fatal::NotJson("nesting too deep".into()));
        }
        self.skip_ws()?;
        match self.peek()? {
            None => Err(Fatal::NotJson("unexpected end of document".into())),
            Some(b'{') => self.object().map(Some),
            Some(b'[') => self.array().map(Some),
            Some(b'"') => {
                if self.is_media_data_path() {
                    self.bump()?;
                    self.media_string()?;
                    Ok(None)
                } else {
                    self.string().map(|s| Some(Value::String(s)))
                }
            }
            Some(b't') => self.expect(b"true").map(|_| Some(Value::Bool(true))),
            Some(b'f') => self.expect(b"false").map(|_| Some(Value::Bool(false))),
            Some(b'n') => self.expect(b"null").map(|_| Some(Value::Null)),
            Some(b'-') | Some(b'0'..=b'9') => self.number().map(Some),
            Some(_) => Err(Fatal::NotJson("unexpected character".into())),
        }
    }

    fn is_media_data_path(&self) -> bool {
        matches!(self.path.as_slice(), [Seg::Key(k), Seg::Idx(_), Seg::Key(d)] if (k == "mediaAssets" || k == "assets") && d == "data")
    }

    fn object(&mut self) -> R<Value> {
        self.bump()?; // {
        let mut m = Map::new();
        let mut seen: BTreeSet<String> = BTreeSet::new();
        self.skip_ws()?;
        if self.peek()? == Some(b'}') {
            self.bump()?;
            return Ok(Value::Object(m));
        }
        loop {
            self.skip_ws()?;
            if self.peek()? != Some(b'"') {
                return Err(Fatal::NotJson("object key expected".into()));
            }
            self.bump()?;
            let key = self.string_body()?;
            self.skip_ws()?;
            if self.bump()? != b':' {
                return Err(Fatal::NotJson("':' expected".into()));
            }
            self.path.push(Seg::Key(key.clone()));
            if !seen.insert(key.clone()) {
                let p = self.pointer();
                self.diags.add("MIG_SOURCE_DUPLICATE_KEY", Some(&p), serde_json::json!({"key": key}));
            }
            let v = self.value()?;
            self.path.pop();
            if let Some(v) = v {
                m.insert(key, v);
            }
            self.skip_ws()?;
            match self.bump()? {
                b',' => continue,
                b'}' => return Ok(Value::Object(m)),
                _ => return Err(Fatal::NotJson("',' or '}' expected".into())),
            }
        }
    }

    fn array(&mut self) -> R<Value> {
        self.bump()?; // [
        let mut a = vec![];
        self.skip_ws()?;
        if self.peek()? == Some(b']') {
            self.bump()?;
            return Ok(Value::Array(a));
        }
        loop {
            self.path.push(Seg::Idx(a.len()));
            let v = self.value()?;
            self.path.pop();
            a.push(v.unwrap_or(Value::Null));
            self.skip_ws()?;
            match self.bump()? {
                b',' => continue,
                b']' => return Ok(Value::Array(a)),
                _ => return Err(Fatal::NotJson("',' or ']' expected".into())),
            }
        }
    }

    fn string(&mut self) -> R<String> {
        self.bump()?; // opening quote
        self.string_body()
    }

    fn hex4(&mut self) -> R<u16> {
        let mut v = 0u16;
        for _ in 0..4 {
            let c = self.bump()?;
            let d = (c as char).to_digit(16).ok_or_else(|| Fatal::NotJson("bad \\u escape".into()))?;
            v = (v << 4) | d as u16;
        }
        Ok(v)
    }

    /// After the opening quote: decode up to the closing quote.
    fn string_body(&mut self) -> R<String> {
        let mut out: Vec<u8> = Vec::new();
        loop {
            self.fill()?;
            if self.pos >= self.len {
                return Err(Fatal::NotJson("unterminated string".into()));
            }
            let chunk = &self.buf[self.pos..self.len];
            let clen = chunk.len();
            let n = chunk.iter().position(|&c| c == b'"' || c == b'\\' || c < 0x20).unwrap_or(clen);
            out.extend_from_slice(&chunk[..n]);
            self.pos += n;
            self.count(n)?;
            if n == clen {
                continue;
            }
            match self.bump()? {
                b'"' => break,
                b'\\' => {
                    let e = self.bump()?;
                    let simple = match e {
                        b'"' => Some(b'"'),
                        b'\\' => Some(b'\\'),
                        b'/' => Some(b'/'),
                        b'b' => Some(8),
                        b'f' => Some(12),
                        b'n' => Some(b'\n'),
                        b'r' => Some(b'\r'),
                        b't' => Some(b'\t'),
                        _ => None,
                    };
                    if let Some(b) = simple {
                        out.push(b);
                    } else if e == b'u' {
                        let hi = self.hex4()?;
                        let ch = if (0xD800..0xDC00).contains(&hi) {
                            if self.peek()? == Some(b'\\') {
                                self.bump()?;
                                if self.bump()? != b'u' {
                                    return Err(Fatal::NotJson("bad escape".into()));
                                }
                                let lo = self.hex4()?;
                                if (0xDC00..0xE000).contains(&lo) {
                                    char::from_u32(0x10000 + (((hi as u32) - 0xD800) << 10) + (lo as u32 - 0xDC00))
                                } else {
                                    self.lone_surrogate();
                                    // `lo` is itself a code unit; if it is another lone surrogate it was reported too
                                    if (0xD800..0xE000).contains(&lo) {
                                        self.lone_surrogate();
                                    }
                                    Some('\u{FFFD}')
                                }
                            } else {
                                self.lone_surrogate();
                                Some('\u{FFFD}')
                            }
                        } else if (0xDC00..0xE000).contains(&hi) {
                            self.lone_surrogate();
                            Some('\u{FFFD}')
                        } else {
                            char::from_u32(hi as u32)
                        };
                        let mut tmp = [0u8; 4];
                        out.extend_from_slice(ch.unwrap_or('\u{FFFD}').encode_utf8(&mut tmp).as_bytes());
                    } else {
                        return Err(Fatal::NotJson("bad escape".into()));
                    }
                }
                _ => return Err(Fatal::NotJson("control character in string".into())),
            }
        }
        String::from_utf8(out).map_err(|_| Fatal::NotUtf8)
    }

    fn lone_surrogate(&mut self) {
        let p = self.pointer();
        self.diags.add("MIG_SOURCE_LONE_SURROGATE", Some(&p), serde_json::json!({}));
    }

    /// Stream-decode a media payload string (after its opening quote).
    fn media_string(&mut self) -> R<()> {
        let (list_key, index) = match self.path.as_slice() {
            [Seg::Key(k), Seg::Idx(i), _] => (k.clone(), *i),
            _ => unreachable!("is_media_data_path"),
        };
        self.media_seq += 1;
        let tmp = self.media_dir.join(format!("blob-{}.part", self.media_seq));
        let out = if self.discard_media {
            None
        } else {
            std::fs::create_dir_all(&self.media_dir).map_err(|e| Fatal::Io(e.to_string()))?;
            Some(BufWriter::with_capacity(1 << 20, File::create(&tmp).map_err(|e| Fatal::Io(e.to_string()))?))
        };
        let mut d = Decoder {
            wrote: out.is_some(),
            out,
            tmp,
            hasher: Sha256::new(),
            size: 0,
            acc: 0,
            n: 0,
            pad: 0,
            invalid: None,
            prefix: Prefix::Probing(vec![]),
        };
        loop {
            self.fill()?;
            if self.pos >= self.len {
                return Err(Fatal::NotJson("unterminated string".into()));
            }
            let chunk = &self.buf[self.pos..self.len];
            let clen = chunk.len();
            let n = chunk.iter().position(|&c| c == b'"' || c == b'\\' || c < 0x20).unwrap_or(clen);
            if matches!(d.prefix, Prefix::Body) && d.invalid.is_none() {
                for &c in &chunk[..n] {
                    d.symbol(c);
                }
            } else {
                for &c in &chunk[..n] {
                    d.byte(c);
                }
            }
            self.pos += n;
            if n == clen {
                continue;
            }
            match self.buf[self.pos] {
                b'"' => {
                    self.pos += 1;
                    break;
                }
                b'\\' => {
                    self.pos += 1;
                    let e = self.bump()?;
                    match e {
                        b'/' => d.byte(b'/'),
                        b'u' => {
                            let v = self.hex4()?;
                            if v < 0x80 {
                                d.byte(v as u8);
                            } else {
                                d.fail("illegal base64 character");
                            }
                        }
                        b'"' | b'\\' | b'b' | b'f' | b'n' | b'r' | b't' => d.fail("illegal base64 character"),
                        _ => return Err(Fatal::NotJson("bad escape".into())),
                    }
                }
                _ => return Err(Fatal::NotJson("control character in string".into())),
            }
        }
        let (tmp, sha256, size, invalid) = d.finish();
        self.media.push(MediaBlob { list_key, index, tmp, sha256, size, invalid });
        Ok(())
    }

    fn number(&mut self) -> R<Value> {
        let mut tok = String::new();
        while let Some(c) = self.peek()? {
            if matches!(c, b'0'..=b'9' | b'-' | b'+' | b'.' | b'e' | b'E') {
                tok.push(self.bump()? as char);
            } else {
                break;
            }
        }
        if !valid_json_number(&tok) {
            return Err(Fatal::NotJson("malformed number".into()));
        }
        if !js_producible(&tok) {
            let p = self.pointer();
            self.diags.add("MIG_SOURCE_UNSAFE_NUMBER", Some(&p), serde_json::json!({"token": tok}));
        }
        serde_json::from_str::<Value>(&tok).map_err(|_| Fatal::NotJson("malformed number".into()))
    }
}

fn valid_json_number(t: &str) -> bool {
    let b = t.as_bytes();
    let mut i = 0;
    if i < b.len() && b[i] == b'-' {
        i += 1;
    }
    match b.get(i) {
        Some(b'0') => i += 1,
        Some(b'1'..=b'9') => {
            while matches!(b.get(i), Some(b'0'..=b'9')) {
                i += 1;
            }
        }
        _ => return false,
    }
    if b.get(i) == Some(&b'.') {
        i += 1;
        let s = i;
        while matches!(b.get(i), Some(b'0'..=b'9')) {
            i += 1;
        }
        if i == s {
            return false;
        }
    }
    if matches!(b.get(i), Some(b'e') | Some(b'E')) {
        i += 1;
        if matches!(b.get(i), Some(b'+') | Some(b'-')) {
            i += 1;
        }
        let s = i;
        while matches!(b.get(i), Some(b'0'..=b'9')) {
            i += 1;
        }
        if i == s {
            return false;
        }
    }
    i == b.len()
}

/// `(digits-without-leading/trailing-zeros, exponent of the first digit)`; `None` for zero.
fn decimal_norm(neg_ok_token: &str) -> Option<(bool, String, i64)> {
    let t = neg_ok_token;
    let (neg, t) = match t.strip_prefix('-') {
        Some(r) => (true, r),
        None => (false, t),
    };
    let (mant, exp) = match t.find(['e', 'E']) {
        Some(i) => (&t[..i], t[i + 1..].parse::<i64>().ok()?),
        None => (t, 0),
    };
    let (int, frac) = match mant.split_once('.') {
        Some((a, b)) => (a, b),
        None => (mant, ""),
    };
    let all = format!("{int}{frac}");
    let lead = all.len() - all.trim_start_matches('0').len();
    let digits = all.trim_start_matches('0').trim_end_matches('0').to_string();
    if digits.is_empty() {
        return None;
    }
    // exponent of the first significant digit
    let first_exp = int.len() as i64 - 1 - lead as i64 + exp;
    Some((neg, digits, first_exp))
}

/// The ADR 0002 rule: the token denotes exactly the same value as the shortest ECMAScript representation of its
/// IEEE-754 double, and an integer token lies within +-(2^53 - 1) (A4).
pub fn js_producible(tok: &str) -> bool {
    let Ok(f) = tok.parse::<f64>() else { return false };
    if !f.is_finite() {
        return false;
    }
    let is_int = !tok.contains(['.', 'e', 'E']);
    if is_int && f.abs() > 9_007_199_254_740_991.0 {
        return false;
    }
    let a = decimal_norm(tok);
    let b = decimal_norm(&format!("{f:e}"));
    match (a, b) {
        (None, None) => true,
        (Some(x), Some(y)) => x == y,
        _ => false,
    }
}

/// Read the staged source copy. Fatal problems (not UTF-8, not JSON, too large, I/O) end the read with a blocking
/// diagnostic and no tree; duplicate keys, lone surrogates and unsafe numbers are collected and the read continues.
pub fn read_source(path: &Path, opts: &ReaderOptions) -> Result<Read_> {
    let mut f = File::open(path).map_err(|e| Error::new(Code::Io, format!("open source copy: {e}")))?;
    let mut head = [0u8; 4];
    let n = f.read(&mut head)?;
    let mut diags = Diags::default();
    if n >= 2 && ((head[0] == 0xFF && head[1] == 0xFE) || (head[0] == 0xFE && head[1] == 0xFF)) || (n >= 4 && head == [0, 0, 0xFE, 0xFF]) {
        diags.add("MIG_SOURCE_NOT_UTF8", None, serde_json::json!({"reason": "UTF-16/UTF-32 byte order mark"}));
        return Ok(Read_ { root: None, media: vec![], diags, nonmedia_bytes: 0 });
    }
    drop(f);
    let mut file = File::open(path)?;
    // a UTF-8 BOM is tolerated for parsing (the digest is over the raw bytes, computed at copy-in)
    let mut bom = [0u8; 3];
    let got = file.read(&mut bom)?;
    let start: u64 = if got == 3 && bom == [0xEF, 0xBB, 0xBF] { 3 } else { 0 };
    use std::io::Seek;
    file.seek(std::io::SeekFrom::Start(start))?;
    let mut p = P {
        f: file,
        buf: vec![0u8; BUF],
        pos: 0,
        len: 0,
        eof: false,
        nonmedia: 0,
        limit: opts.nonmedia_limit,
        path: vec![],
        diags,
        media: vec![],
        media_dir: opts.media_dir.clone(),
        discard_media: opts.discard_media,
        media_seq: 0,
    };
    let outcome: R<Value> = (|| {
        let v = p.value()?.ok_or_else(|| Fatal::NotJson("document is not a value".into()))?;
        p.skip_ws()?;
        if p.peek()?.is_some() {
            return Err(Fatal::NotJson("trailing data after the document".into()));
        }
        Ok(v)
    })();
    let nonmedia_bytes = p.nonmedia;
    let mut diags = p.diags;
    let media = p.media;
    match outcome {
        Ok(v) => Ok(Read_ { root: Some(v), media, diags, nonmedia_bytes }),
        Err(f) => {
            for m in &media {
                if let Some(t) = &m.tmp {
                    let _ = std::fs::remove_file(t);
                }
            }
            match f {
                Fatal::NotUtf8 => diags.add("MIG_SOURCE_NOT_UTF8", None, serde_json::json!({"reason": "invalid UTF-8"})),
                Fatal::NotJson(why) => diags.add("MIG_SOURCE_NOT_JSON", None, serde_json::json!({"reason": why})),
                Fatal::TooLarge => diags.add("MIG_SOURCE_TOO_LARGE", None, serde_json::json!({"limitBytes": opts.nonmedia_limit})),
                Fatal::Io(e) => return Err(Error::new(Code::Io, e)),
            }
            Ok(Read_ { root: None, media: vec![], diags, nonmedia_bytes })
        }
    }
}
