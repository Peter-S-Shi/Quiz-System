//! Full validation of a staging database in isolation (ADR 0001 section 6, step 2). Returns the list of
//! **blocking** problems; an empty list means the staging set may be activated. Migration-specific
//! blocking-vs-reportable classification belongs to the Migration ADR; this layer only knows
//! structural facts.

use qs_media::MediaStore;
use qs_platform::{fsx, Code, Result, ResultExt};
use qs_store::consistency;
use qs_store::foundation::MEDIA_COLLECTION;
use qs_store::store::{verify_catalog, APPLICATION_ID};
use qs_store::Store;
use rusqlite::{Connection, OpenFlags};
use std::path::Path;

pub fn validate_staging(live: &Store, staging_db: &Path, deep_media: bool) -> Result<Vec<String>> {
    let media = MediaStore::new(live.root().media_dir());
    validate_file(live.catalog(), staging_db, &media, deep_media)
}

pub fn validate_file(catalog: &qs_store::Catalog, staging_db: &Path, media: &MediaStore, deep_media: bool) -> Result<Vec<String>> {
    let mut bad = vec![];
    if !staging_db.is_file() {
        bad.push("staging database file is missing".to_string());
        return Ok(bad);
    }
    let c = Connection::open_with_flags(fsx::sqlite_path(staging_db)?, OpenFlags::SQLITE_OPEN_READ_ONLY).ctx(Code::Db, "open staging")?;
    let qc: String = c.query_row("PRAGMA quick_check", [], |r| r.get(0)).code(Code::Db)?;
    if qc != "ok" {
        bad.push(format!("quick_check: {qc}"));
        return Ok(bad); // nothing further is trustworthy
    }
    let app: i32 = c.query_row("PRAGMA application_id", [], |r| r.get(0)).code(Code::Db)?;
    if app != APPLICATION_ID {
        bad.push(format!("application_id {app:#x} is not a Quiz Studio store"));
        return Ok(bad);
    }
    let ver: i32 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).code(Code::Db)?;
    if ver != catalog.schema_version() {
        bad.push(format!("store schema v{ver} does not match the live schema v{} (staging must be migrated first)", catalog.schema_version()));
        return Ok(bad);
    }
    if let Err(e) = verify_catalog(&c, catalog) {
        bad.push(format!("catalog: {}", e.message));
        return Ok(bad);
    }
    for p in consistency::check(&c, catalog)? {
        bad.push(format!("{} {}{}: {}", p.kind, p.collection, p.id.map(|i| format!("/{i}")).unwrap_or_default(), p.detail));
    }
    // media presence (fail closed): every media_object must exist in the content-addressed store
    let mut st = c.prepare(&format!("SELECT id, content_hash, size FROM {MEDIA_COLLECTION}")).code(Code::Db)?;
    let rows: Vec<(String, String, i64)> =
        st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).code(Code::Db)?.collect::<std::result::Result<_, _>>().code(Code::Db)?;
    for (id, hash, size) in rows {
        match media.size_of(&hash) {
            Ok(s) if s as i64 == size => {
                if deep_media {
                    if let Err(e) = media.verify(&hash, Some(size as u64)) {
                        bad.push(format!("media {id}: {}", e.message));
                    }
                }
            }
            Ok(_) => bad.push(format!("media {id}: size mismatch")),
            Err(_) => bad.push(format!("media {id}: file missing")),
        }
    }
    Ok(bad)
}
