//! H4: content-addressed immutable media store + streaming ingest of a V1-shaped base64 envelope.
use crate::{fault, mem};
use anyhow::{anyhow, bail, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::Connection;
use serde::de::{DeserializeSeed, Deserializer, IgnoredAny, MapAccess, SeqAccess, Visitor};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};

pub fn dir(root: &Path) -> PathBuf {
    root.join("data").join("media")
}
pub fn path_for(root: &Path, hash: &str) -> PathBuf {
    dir(root).join(&hash[..2]).join(hash)
}

#[derive(Debug, Clone)]
pub struct MediaMeta {
    pub id: String,
    pub mime: Option<String>,
    pub name: Option<String>,
    pub declared_size: Option<i64>,
    pub hash: String,
    pub size: u64,
}

#[derive(Default)]
pub struct IngestStats {
    pub assets: usize,
    pub deduped_files: usize,
    pub bytes: u64,
    pub metas: Vec<MediaMeta>,
    pub peak_mib: f64,
}

struct Ingestor<'a> {
    root: &'a Path,
    stats: IngestStats,
    seq: u64,
}

impl<'a> Ingestor<'a> {
    fn tmp_path(&mut self) -> PathBuf {
        self.seq += 1;
        dir(self.root).join(format!("incoming-{}-{}.tmp", std::process::id(), self.seq))
    }
    /// Stream-decode a base64 string slice into a temp file while hashing. Returns (tmp, hash, size).
    fn write_b64(&mut self, text: &str) -> Result<(PathBuf, String, u64)> {
        let body = match text.strip_prefix("data:") {
            Some(rest) => rest.split_once(',').map(|x| x.1).unwrap_or(""),
            None => text,
        };
        fs::create_dir_all(dir(self.root))?;
        let tmp = self.tmp_path();
        let mut w = BufWriter::with_capacity(1 << 20, File::create(&tmp)?);
        let mut h = Sha256::new();
        let bytes = body.as_bytes();
        const CHUNK: usize = 4 * 1024 * 256; // multiple of 4
        let mut out = vec![0u8; CHUNK / 4 * 3 + 8];
        let mut size = 0u64;
        let mut chunks = 0u64;
        for ch in bytes.chunks(CHUNK) {
            let n = STANDARD.decode_slice(ch, &mut out).map_err(|e| anyhow!("base64 decode: {e}"))?;
            h.update(&out[..n]);
            w.write_all(&out[..n])?;
            size += n as u64;
            chunks += 1;
            if chunks == 3 {
                w.flush()?;
                fault::point("media-mid-write");
            }
        }
        w.flush()?;
        let f = w.into_inner().map_err(|e| anyhow!("{e}"))?;
        f.sync_all()?;
        Ok((tmp, hex::encode(h.finalize()), size))
    }
    fn finalize(&mut self, tmp: &Path, hash: &str) -> Result<()> {
        if publish(self.root, tmp, hash)? {
            self.stats.deduped_files += 1;
        }
        Ok(())
    }
}

/// Publish a complete, fsynced temp file under its content address. Returns true if it was a duplicate.
pub fn publish(root: &Path, tmp: &Path, hash: &str) -> Result<bool> {
    let fin = path_for(root, hash);
    fs::create_dir_all(fin.parent().unwrap())?;
    if fin.exists() {
        fs::remove_file(tmp)?;
        return Ok(true);
    }
    // atomic publish: only complete, fsynced files ever have a final name.
    // Retry covers transient sharing violations (e.g. an AV scanner briefly holding the fresh temp file).
    let mut last = None;
    for _ in 0..40 {
        match fs::rename(tmp, &fin) {
            Ok(()) => {
                last = None;
                break;
            }
            Err(e) => {
                last = Some(e);
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }
    }
    if let Some(e) = last {
        return Err(anyhow!("publish rename failed after retries: {e}"));
    }
    Ok(false)
}

struct EnvVisitor<'a, 'b>(&'b mut Ingestor<'a>);
impl<'de, 'a, 'b> Visitor<'de> for EnvVisitor<'a, 'b> {
    type Value = ();
    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "envelope object")
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> std::result::Result<(), A::Error> {
        while let Some(k) = map.next_key::<String>()? {
            if k == "mediaAssets" {
                map.next_value_seed(SeqSeed(self.0))?;
            } else {
                map.next_value::<IgnoredAny>()?;
            }
        }
        Ok(())
    }
}
struct SeqSeed<'a, 'b>(&'b mut Ingestor<'a>);
impl<'de, 'a, 'b> DeserializeSeed<'de> for SeqSeed<'a, 'b> {
    type Value = ();
    fn deserialize<D: Deserializer<'de>>(self, d: D) -> std::result::Result<(), D::Error> {
        d.deserialize_seq(SeqVisitor(self.0))
    }
}
struct SeqVisitor<'a, 'b>(&'b mut Ingestor<'a>);
impl<'de, 'a, 'b> Visitor<'de> for SeqVisitor<'a, 'b> {
    type Value = ();
    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "mediaAssets array")
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> std::result::Result<(), A::Error> {
        while seq.next_element_seed(AssetSeed(self.0))?.is_some() {}
        Ok(())
    }
}
struct AssetSeed<'a, 'b>(&'b mut Ingestor<'a>);
impl<'de, 'a, 'b> DeserializeSeed<'de> for AssetSeed<'a, 'b> {
    type Value = ();
    fn deserialize<D: Deserializer<'de>>(self, d: D) -> std::result::Result<(), D::Error> {
        d.deserialize_map(AssetVisitor(self.0))
    }
}
struct DataSeed<'a, 'b>(&'b mut Ingestor<'a>);
impl<'de, 'a, 'b> DeserializeSeed<'de> for DataSeed<'a, 'b> {
    type Value = (PathBuf, String, u64);
    fn deserialize<D: Deserializer<'de>>(self, d: D) -> std::result::Result<Self::Value, D::Error> {
        d.deserialize_str(DataVisitor(self.0))
    }
}
struct DataVisitor<'a, 'b>(&'b mut Ingestor<'a>);
impl<'de, 'a, 'b> Visitor<'de> for DataVisitor<'a, 'b> {
    type Value = (PathBuf, String, u64);
    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "base64 string")
    }
    fn visit_str<E: serde::de::Error>(self, v: &str) -> std::result::Result<Self::Value, E> {
        self.0.write_b64(v).map_err(E::custom)
    }
}
struct AssetVisitor<'a, 'b>(&'b mut Ingestor<'a>);
impl<'de, 'a, 'b> Visitor<'de> for AssetVisitor<'a, 'b> {
    type Value = ();
    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "asset object")
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> std::result::Result<(), A::Error> {
        use serde::de::Error;
        let (mut id, mut mime, mut name, mut size): (Option<String>, Option<String>, Option<String>, Option<i64>) = (None, None, None, None);
        let mut data: Option<(PathBuf, String, u64)> = None;
        while let Some(k) = map.next_key::<String>()? {
            match k.as_str() {
                "id" => id = map.next_value()?,
                "mimeType" => mime = map.next_value()?,
                "name" => name = map.next_value()?,
                "size" => size = map.next_value::<Option<i64>>()?,
                "data" => data = Some(map.next_value_seed(DataSeed(self.0))?),
                _ => {
                    map.next_value::<IgnoredAny>()?;
                }
            }
        }
        let id = id.ok_or_else(|| A::Error::custom("asset without id"))?;
        let (tmp, hash, sz) = data.ok_or_else(|| A::Error::custom(format!("asset {id}: no data")))?;
        self.0.finalize(&tmp, &hash).map_err(A::Error::custom)?;
        self.0.stats.assets += 1;
        self.0.stats.bytes += sz;
        self.0.stats.metas.push(MediaMeta { id, mime, name, declared_size: size, hash, size: sz });
        Ok(())
    }
}

/// Streaming ingest of a V1-shaped backup envelope. Never holds more than one asset's base64 string.
pub fn ingest_envelope(root: &Path, envelope: &Path) -> Result<IngestStats> {
    let f = BufReader::with_capacity(1 << 20, File::open(envelope)?);
    let mut de = serde_json::Deserializer::from_reader(f);
    let mut ing = Ingestor { root, stats: IngestStats::default(), seq: 0 };
    de.deserialize_map(EnvVisitor(&mut ing)).map_err(|e| anyhow!("envelope parse: {e}"))?;
    ing.stats.peak_mib = mem::peak_mib();
    Ok(ing.stats)
}

pub fn register(conn: &Connection, metas: &[MediaMeta]) -> Result<()> {
    conn.execute_batch("BEGIN IMMEDIATE")?;
    let r = (|| -> Result<()> {
        for m in metas {
            conn.execute(
                "INSERT INTO media_object(id,content_hash,mime,name,size) VALUES(?1,?2,?3,?4,?5) \
                 ON CONFLICT(id) DO UPDATE SET content_hash=excluded.content_hash,mime=excluded.mime,name=excluded.name,size=excluded.size",
                rusqlite::params![m.id, m.hash, m.mime, m.name, m.size as i64],
            )?;
        }
        Ok(())
    })();
    match r {
        Ok(()) => {
            conn.execute_batch("COMMIT")?;
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

/// Re-hash every registered media file; compare to registered hash and (optionally) an expected id->sha256 manifest.
pub fn verify(root: &Path, conn: &Connection, expected: Option<&Value>) -> Result<Value> {
    let mut st = conn.prepare("SELECT id, content_hash, size FROM media_object ORDER BY id")?;
    let mut rows = st.query([])?;
    let (mut ok, mut bad) = (0, vec![]);
    while let Some(r) = rows.next()? {
        let (id, hash, size): (String, String, i64) = (r.get(0)?, r.get(1)?, r.get(2)?);
        let p = path_for(root, &hash);
        let mut f = match File::open(&p) {
            Ok(f) => f,
            Err(_) => {
                bad.push(format!("{id}: missing file"));
                continue;
            }
        };
        let mut h = Sha256::new();
        let mut n = 0u64;
        let mut buf = vec![0u8; 1 << 20];
        loop {
            let k = std::io::Read::read(&mut f, &mut buf)?;
            if k == 0 {
                break;
            }
            h.update(&buf[..k]);
            n += k as u64;
        }
        let got = hex::encode(h.finalize());
        if got != hash || n as i64 != size {
            bad.push(format!("{id}: bytes differ from registered hash/size"));
        } else if let Some(exp) = expected {
            match exp.get(&id).and_then(|v| v.as_str()) {
                Some(e) if e == got => ok += 1,
                Some(_) => bad.push(format!("{id}: bytes differ from SOURCE hash")),
                None => bad.push(format!("{id}: not in source manifest")),
            }
        } else {
            ok += 1;
        }
    }
    Ok(json!({"verified": ok, "problems": bad}))
}

/// Delete content-addressed files with no DB reference and stale temp files. Returns (deleted, kept).
pub fn gc(root: &Path, conn: &Connection, min_age_secs: u64) -> Result<(usize, usize)> {
    let referenced: std::collections::HashSet<String> = {
        let mut st = conn.prepare("SELECT content_hash FROM media_object")?;
        let v = st.query_map([], |r| r.get::<_, String>(0))?.collect::<std::result::Result<_, _>>()?;
        v
    };
    let (mut deleted, mut kept) = (0, 0);
    let d = dir(root);
    if !d.exists() {
        return Ok((0, 0));
    }
    let now = std::time::SystemTime::now();
    let old_enough = |p: &Path| -> bool {
        fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| now.duration_since(t).ok()).map(|a| a.as_secs() >= min_age_secs).unwrap_or(false)
    };
    for e in fs::read_dir(&d)? {
        let p = e?.path();
        if p.is_file() && p.extension().and_then(|s| s.to_str()) == Some("tmp") {
            if old_enough(&p) {
                fs::remove_file(&p)?;
                deleted += 1;
            }
            continue;
        }
        if p.is_dir() {
            for f in fs::read_dir(&p)? {
                let fp = f?.path();
                let h = fp.file_name().unwrap().to_string_lossy().to_string();
                if referenced.contains(&h) {
                    kept += 1;
                } else if old_enough(&fp) {
                    fs::remove_file(&fp)?;
                    deleted += 1;
                    fault::point("during-media-gc");
                }
            }
        }
    }
    Ok((deleted, kept))
}

pub fn assert_no_partial(root: &Path) -> Result<Vec<String>> {
    // every FINAL file name must equal the sha256 of its content; temps are discardable
    let mut bad = vec![];
    let d = dir(root);
    for e in fs::read_dir(&d)? {
        let p = e?.path();
        if p.is_dir() {
            for f in fs::read_dir(&p)? {
                let fp = f?.path();
                let name = fp.file_name().unwrap().to_string_lossy().to_string();
                let mut file = File::open(&fp)?;
                let mut h = Sha256::new();
                std::io::copy(&mut file, &mut h)?;
                if hex::encode(h.finalize()) != name {
                    bad.push(name);
                }
            }
        }
    }
    if !bad.is_empty() {
        bail!("corrupt final files: {bad:?}");
    }
    Ok(bad)
}
