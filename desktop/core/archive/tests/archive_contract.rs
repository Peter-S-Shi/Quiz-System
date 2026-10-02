//! Archive contract (ADR 0001 H5 method, re-implemented): consistent snapshot while a writer runs,
//! restore through the activation primitive, and every corruption rejected *before* activation with a
//! specific code. Heavy/memory variants live in `qs-scenarios`.

use qs_archive::*;
use qs_media::MediaStore;
use qs_platform::Code;
use qs_store::{Catalog, OpenOptions, Store};
use qs_testkit::*;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

fn cat() -> Arc<Catalog> {
    arc(evidence_catalog())
}
fn open(t: &TestRoot, c: &Arc<Catalog>) -> Store {
    Store::open(&t.root, c.clone(), &OpenOptions::default()).unwrap()
}

/// A store with `n` responses, two media files (one shared by two media ids), a recovery session and a setting.
fn populated(n: u64) -> (TestRoot, Arc<Catalog>, Store) {
    let t = temp_root();
    let c = cat();
    let mut s = open(&t, &c);
    let media = MediaStore::new(s.root().media_dir());
    let a = media.put_bytes(&vec![7u8; 300_000]).unwrap();
    let b = media.put_bytes(b"audio-ish bytes").unwrap();
    s.commit(&uow(vec![
        put_op(&c, "media_object", "img-1", media_object_payload("img-1", &a.hash, a.size)),
        put_op(&c, "media_object", "img-1-copy", media_object_payload("img-1-copy", &a.hash, a.size)),
        put_op(&c, "media_object", "aud-1", media_object_payload("aud-1", &b.hash, b.size)),
        put_op(&c, "setting", "theme", json!({"key": "theme", "value": "paper"})),
        put_op(&c, "recovery_session", "sess", json!({"answers": [1, 2]})),
    ]))
    .unwrap();
    for i in 1..=n {
        let media_refs = if i % 2 == 0 { vec!["img-1".to_string(), "aud-1".to_string()] } else { vec![] };
        s.commit(&finalize_uow(&c, i, &media_refs)).unwrap();
    }
    (t, c, s)
}

fn code<T: std::fmt::Debug>(r: qs_platform::Result<T>) -> Code {
    r.expect_err("expected an archive refusal").code
}

fn make_archive(s: &Store, dir: &Path, name: &str) -> PathBuf {
    let p = dir.join(name);
    create_archive(s, &p).unwrap();
    p
}

/// Read every entry of an archive into memory, let the test mutate the set, write a new archive.
fn rewrite(src: &Path, dst: &Path, f: impl FnOnce(&mut BTreeMap<String, Vec<u8>>)) {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(src).unwrap()).unwrap();
    let mut entries = BTreeMap::new();
    for i in 0..zip.len() {
        let mut e = zip.by_index(i).unwrap();
        let mut b = vec![];
        e.read_to_end(&mut b).unwrap();
        entries.insert(e.name().to_string(), b);
    }
    f(&mut entries);
    let mut w = zip::ZipWriter::new(std::fs::File::create(dst).unwrap());
    for (n, b) in entries {
        w.start_file(n, zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored)).unwrap();
        w.write_all(&b).unwrap();
    }
    w.finish().unwrap();
}

fn manifest(entries: &BTreeMap<String, Vec<u8>>) -> Value {
    serde_json::from_slice(&entries["manifest.json"]).unwrap()
}
fn set_manifest(entries: &mut BTreeMap<String, Vec<u8>>, m: &Value) {
    entries.insert("manifest.json".into(), serde_json::to_vec(m).unwrap());
}

#[test]
fn archive_round_trips_into_a_clean_profile_with_identical_canonical_state() {
    let (t, c, s) = populated(12);
    let arc_path = make_archive(&s, t.dir.path(), "backup.qsarchive");
    let want = s.state_hash(false).unwrap();

    let clean = temp_root();
    let mut target = open(&clean, &c);
    let rep = restore_archive(&mut target, &arc_path).unwrap();
    assert_eq!(rep.media_added, 2, "two distinct media files");
    assert_eq!(target.state_hash(false).unwrap(), want);
    assert!(target.quick_check().unwrap());
    assert!(target.check_consistency().unwrap().is_empty());
    let tm = MediaStore::new(target.root().media_dir());
    for h in tm.list().unwrap() {
        tm.verify(&h, None).unwrap();
    }
    assert_eq!(tm.list().unwrap().len(), 2);
}

#[test]
fn recovery_only_data_and_bookkeeping_do_not_travel() {
    let (t, c, s) = populated(2);
    let p = make_archive(&s, t.dir.path(), "b.qsarchive");
    let clean = temp_root();
    let mut target = open(&clean, &c);
    restore_archive(&mut target, &p).unwrap();
    assert_eq!(target.count("recovery_session").unwrap(), 0);
    assert_eq!(target.count("setting").unwrap(), 1);
    // the only operation_journal row is the restore's own commit record
    let n: i64 = target.conn().query_row("SELECT count(*) FROM operation_journal", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 1);
}

#[test]
fn restore_replaces_a_populated_store() {
    let (t, c, s) = populated(5);
    let p = make_archive(&s, t.dir.path(), "b.qsarchive");
    let want = s.state_hash(false).unwrap();
    let other = temp_root();
    let mut target = open(&other, &c);
    for n in 100..=110 {
        target.commit(&finalize_uow(&c, n, &[])).unwrap();
    }
    restore_archive(&mut target, &p).unwrap();
    assert_eq!(target.state_hash(false).unwrap(), want);
    assert_eq!(target.count("learner_response").unwrap(), 5);
}

#[test]
fn archive_taken_while_a_writer_is_running_is_internally_consistent() {
    let (t, c, s) = populated(3);
    let shared = Arc::new(Mutex::new(s));
    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let writer = {
        let (shared, stop, c) = (shared.clone(), stop.clone(), c.clone());
        std::thread::spawn(move || {
            let mut n = 1000u64;
            while !stop.load(std::sync::atomic::Ordering::Relaxed) {
                shared.lock().unwrap().commit(&finalize_uow(&c, n, &[])).unwrap();
                n += 1;
            }
            n - 1000
        })
    };
    let mut snapshots = vec![];
    for i in 0..3 {
        let (handle, hash) = {
            let g = shared.lock().unwrap(); // the store is held only for the snapshot
            let h = snapshot_for_archive(&g, &format!("op-snap-{i}")).unwrap();
            (h, g.state_hash(false).unwrap())
        };
        let media = MediaStore::new(t.root.media_dir());
        let p = t.dir.path().join(format!("live-{i}.qsarchive"));
        write_archive(&handle, &media, &p).unwrap();
        handle.discard();
        snapshots.push((p, hash));
        std::thread::sleep(std::time::Duration::from_millis(30));
    }
    stop.store(true, std::sync::atomic::Ordering::Relaxed);
    let written = writer.join().unwrap();
    assert!(written > 0, "the writer must actually have been running");
    for (p, hash) in snapshots {
        let clean = temp_root();
        let mut target = open(&clean, &c);
        restore_archive(&mut target, &p).unwrap();
        assert_eq!(target.state_hash(false).unwrap(), hash, "archive must equal the DB state at snapshot time");
        assert!(target.check_consistency().unwrap().is_empty());
    }
}

#[test]
fn every_named_mutation_is_rejected_before_activation_with_a_specific_code() {
    let (t, c, s) = populated(4);
    let good = make_archive(&s, t.dir.path(), "good.qsarchive");
    let media_name = |e: &BTreeMap<String, Vec<u8>>| e.keys().find(|k| k.starts_with("media/")).unwrap().clone();

    type Mutator = Box<dyn Fn(&mut BTreeMap<String, Vec<u8>>)>;
    let cases: Vec<(&str, Code, Mutator)> = vec![
        (
            "flip a byte in a media entry",
            Code::ArchiveHashMismatch,
            Box::new(move |e| {
                let k = media_name(e);
                e.get_mut(&k).unwrap()[10] ^= 0x01;
            }),
        ),
        (
            "flip a byte in the database",
            Code::ArchiveHashMismatch,
            Box::new(|e| {
                let d = e.get_mut("db/quiz-studio.db").unwrap();
                let i = d.len() / 2;
                d[i] ^= 0x01;
            }),
        ),
        (
            "drop a media entry",
            Code::ArchiveMissingEntry,
            Box::new(move |e| {
                let k = media_name(e);
                e.remove(&k);
            }),
        ),
        (
            "drop the database",
            Code::ArchiveMissingEntry,
            Box::new(|e| {
                e.remove("db/quiz-studio.db");
            }),
        ),
        (
            "add an unlisted entry",
            Code::ArchiveUnlistedEntry,
            Box::new(|e| {
                e.insert("media/ab/".to_string() + &"ab".repeat(32), b"smuggled".to_vec());
            }),
        ),
        (
            "add an entry outside the layout",
            Code::ArchiveUnlistedEntry,
            Box::new(|e| {
                e.insert("../evil.txt".into(), b"x".to_vec());
            }),
        ),
        (
            "manifest checksum altered",
            Code::ArchiveHashMismatch,
            Box::new(|e| {
                let mut m = manifest(e);
                m["entries"][0]["sha256"] = json!("0".repeat(64));
                set_manifest(e, &m);
            }),
        ),
        (
            "manifest size altered",
            Code::ArchiveHashMismatch,
            Box::new(|e| {
                let mut m = manifest(e);
                m["entries"][0]["size"] = json!(1);
                set_manifest(e, &m);
            }),
        ),
        (
            "newer store schema",
            Code::ArchiveNewerSchema,
            Box::new(|e| {
                let mut m = manifest(e);
                m["storeSchemaVersion"] = json!(99);
                set_manifest(e, &m);
            }),
        ),
        (
            "wrong format marker",
            Code::ArchiveWrongFormat,
            Box::new(|e| {
                let mut m = manifest(e);
                m["format"] = json!("something-else");
                set_manifest(e, &m);
            }),
        ),
        (
            "unsupported format version",
            Code::ArchiveWrongFormat,
            Box::new(|e| {
                let mut m = manifest(e);
                m["formatVersion"] = json!(3);
                set_manifest(e, &m);
            }),
        ),
        (
            "manifest missing",
            Code::ArchiveWrongFormat,
            Box::new(|e| {
                e.remove("manifest.json");
            }),
        ),
        (
            "manifest is not JSON",
            Code::ArchiveCorrupt,
            Box::new(|e| {
                e.insert("manifest.json".into(), b"{ not json".to_vec());
            }),
        ),
        (
            "manifest lists a path outside the layout",
            Code::ArchiveWrongFormat,
            Box::new(|e| {
                let mut m = manifest(e);
                m["entries"].as_array_mut().unwrap().push(json!({"path":"../x","size":1,"sha256":"00"}));
                set_manifest(e, &m);
            }),
        ),
    ];
    let live_clean = temp_root();
    let mut target = open(&live_clean, &c);
    let pre = target.state_hash(true).unwrap();
    for (name, want, f) in cases {
        let bad = t.dir.path().join("bad.qsarchive");
        rewrite(&good, &bad, |e| f(e));
        assert_eq!(code(verify_archive(&bad, 99_999.min(c.schema_version()))), want, "verify: {name}");
        assert_eq!(code(restore_archive(&mut target, &bad)), want, "restore: {name}");
        assert_eq!(target.state_hash(true).unwrap(), pre, "{name}: a refused restore must not change live data");
    }
}

#[test]
fn not_a_zip_and_truncated_archives_are_refused() {
    let (t, c, s) = populated(3);
    let good = make_archive(&s, t.dir.path(), "good.qsarchive");
    let junk = t.dir.path().join("junk.bin");
    std::fs::write(&junk, b"definitely not a zip file").unwrap();
    assert_eq!(code(verify_archive(&junk, c.schema_version())), Code::ArchiveWrongFormat);
    let empty = t.dir.path().join("empty.bin");
    std::fs::write(&empty, b"").unwrap();
    assert_eq!(code(verify_archive(&empty, c.schema_version())), Code::ArchiveWrongFormat);
    let bytes = std::fs::read(&good).unwrap();
    for cut in [bytes.len() - 1, bytes.len() - 30, bytes.len() / 2, 100] {
        let p = t.dir.path().join("trunc.qsarchive");
        std::fs::write(&p, &bytes[..cut]).unwrap();
        assert_eq!(code(verify_archive(&p, c.schema_version())), Code::ArchiveCorrupt, "truncated at {cut}");
    }
}

#[test]
fn a_database_that_contradicts_its_manifest_is_refused_at_restore_and_changes_nothing() {
    let (t, c, s) = populated(3);
    let good = make_archive(&s, t.dir.path(), "good.qsarchive");
    let live = temp_root();
    let mut target = open(&live, &c);
    target.commit(&finalize_uow(&c, 500, &[])).unwrap();
    let pre = target.state_hash(true).unwrap();

    // a database entry that is not a database, with a *consistent* manifest (verify passes, restore must refuse)
    let bad = t.dir.path().join("fake-db.qsarchive");
    rewrite(&good, &bad, |e| {
        let fake = b"SQLite format 3\0 but not really".to_vec();
        let sha = {
            use sha2::{Digest, Sha256};
            hex::encode(Sha256::digest(&fake))
        };
        let mut m = manifest(e);
        for en in m["entries"].as_array_mut().unwrap() {
            if en["path"] == "db/quiz-studio.db" {
                en["size"] = json!(fake.len());
                en["sha256"] = json!(sha);
            }
        }
        e.insert("db/quiz-studio.db".into(), fake);
        set_manifest(e, &m);
    });
    verify_archive(&bad, c.schema_version()).expect("structurally consistent");
    let e = restore_archive(&mut target, &bad).unwrap_err();
    assert_eq!(e.code, Code::ArchiveInvalidStore, "{e}");
    assert_eq!(target.state_hash(true).unwrap(), pre);

    // manifest claims an older schema than the database really has
    let bad2 = t.dir.path().join("lying.qsarchive");
    rewrite(&good, &bad2, |e| {
        let mut m = manifest(e);
        m["storeSchemaVersion"] = json!(1);
        set_manifest(e, &m);
    });
    assert_eq!(code(restore_archive(&mut target, &bad2)), Code::ArchiveInvalidStore);
    assert_eq!(target.state_hash(true).unwrap(), pre);
}

#[test]
fn random_bit_flips_never_produce_undetected_data_corruption() {
    let (t, c, s) = populated(6);
    let good = make_archive(&s, t.dir.path(), "good.qsarchive");
    let want = s.state_hash(false).unwrap();
    let bytes = std::fs::read(&good).unwrap();
    let flips: usize = std::env::var("QS_BITFLIPS").ok().and_then(|v| v.parse().ok()).unwrap_or(120);
    let mut rng = fastrand::Rng::with_seed(0xB17F11B5);
    let (mut rejected, mut harmless) = (0, 0);
    for i in 0..flips {
        let mut b = bytes.clone();
        let off = rng.usize(0..b.len());
        b[off] ^= 1 << rng.u8(0..8);
        let p = t.dir.path().join(format!("flip-{}.qsarchive", i % 4));
        std::fs::write(&p, &b).unwrap();
        match verify_archive(&p, c.schema_version()) {
            Err(e) => {
                assert!(format!("{:?}", e.code).starts_with("Archive") || e.code == Code::Io, "flip at {off}: unexpected {e}");
                rejected += 1;
            }
            Ok(_) => {
                // header bytes that carry no data (timestamps etc.): the restored state must still be identical
                let clean = temp_root();
                let mut target = open(&clean, &c);
                match restore_archive(&mut target, &p) {
                    Ok(_) => {
                        assert_eq!(target.state_hash(false).unwrap(), want, "flip at {off} produced silently different data");
                        harmless += 1;
                    }
                    Err(_) => rejected += 1,
                }
            }
        }
    }
    eprintln!("bit flips: {flips} total, {rejected} rejected, {harmless} harmless (no data difference)");
    assert!(rejected as f64 / flips as f64 > 0.9, "suspiciously many flips went unnoticed");
}

#[test]
fn older_archive_is_migrated_forward_during_restore() {
    let (t, _c, s) = populated(5); // written by the schema-v2 lineage
    let p = make_archive(&s, t.dir.path(), "old.qsarchive");
    let clean = temp_root();
    let v3 = arc(evidence_catalog_v2());
    let mut target = open(&clean, &v3);
    let rep = restore_archive(&mut target, &p).unwrap();
    assert_eq!(rep.migrated_from, Some(2));
    let n: i64 = target.conn().query_row("SELECT count(*) FROM learner_response WHERE summary_len=20", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 5);
    assert!(target.check_consistency().unwrap().is_empty());
}

#[test]
fn newer_archive_is_refused_by_an_older_build() {
    let t = temp_root();
    let v3 = arc(evidence_catalog_v2());
    let s = open(&t, &v3);
    let p = make_archive(&s, t.dir.path(), "new.qsarchive");
    let clean = temp_root();
    let mut target = open(&clean, &cat());
    assert_eq!(code(restore_archive(&mut target, &p)), Code::ArchiveNewerSchema);
}

#[test]
fn archiving_fails_closed_when_media_is_missing_or_tampered() {
    let (t, _c, s) = populated(2);
    let media = MediaStore::new(s.root().media_dir());
    let hashes = media.list().unwrap();
    let victim = hashes.iter().find(|h| media.size_of(h).unwrap() == 15).unwrap().clone();
    // tamper (same length)
    std::fs::write(media.path_for(&victim).unwrap(), b"AUDIO-ISH BYTES!").unwrap();
    let dest = t.dir.path().join("x.qsarchive");
    assert_eq!(code(create_archive(&s, &dest)), Code::MediaHashMismatch);
    assert!(!dest.exists(), "no (partial) archive may be left behind");
    assert!(!PathBuf::from(format!("{}.partial", dest.display())).exists());
    // missing
    std::fs::remove_file(media.path_for(&victim).unwrap()).unwrap();
    assert_eq!(code(create_archive(&s, &dest)), Code::MediaMissing);
}

// ---- recovery artifacts in archives (ADR 0002 H-4) ----

fn artifact_store(t: &TestRoot, bytes: &[u8]) -> (Arc<Catalog>, Store, String) {
    let c = arc(artifact_catalog());
    let mut s = open(t, &c);
    let hash = hex::encode(<sha2::Sha256 as sha2::Digest>::digest(bytes));
    std::fs::create_dir_all(s.root().recovery_artifacts_dir()).unwrap();
    std::fs::write(s.root().recovery_artifacts_dir().join(format!("{hash}.artifact")), bytes).unwrap();
    s.commit(&uow(vec![put_op(&c, "recovery_artifact", &hash, json!({"id": hash, "size": bytes.len(), "reason": "synthetic"}))])).unwrap();
    s.commit(&finalize_uow(&c, 1, &[])).unwrap();
    (c, s, hash)
}

#[test]
fn recovery_artifacts_travel_in_the_archive_byte_for_byte_and_come_back_on_restore() {
    let t = temp_root();
    let bytes = b"\xEF\xBB\xBF{\"raw\":\"synthetic recovery blob with odd bytes\"}\r\n\x00\xff".to_vec();
    let (c, s, hash) = artifact_store(&t, &bytes);
    let p = make_archive(&s, t.dir.path(), "a.qsarchive");
    let mf = verify_archive(&p, c.schema_version()).unwrap();
    assert!(mf.entries.contains_key(&format!("recovery/{hash}")), "{:?}", mf.entries.keys().collect::<Vec<_>>());
    let clean = temp_root();
    let mut target = Store::open(&clean.root, c.clone(), &OpenOptions::default()).unwrap();
    restore_archive(&mut target, &p).unwrap();
    let restored = std::fs::read(clean.root.recovery_artifacts_dir().join(format!("{hash}.artifact"))).unwrap();
    assert_eq!(restored, bytes, "the artifact must be preserved byte-for-byte");
    assert_eq!(target.count("recovery_artifact").unwrap(), 1);
    assert_eq!(target.state_hash(false).unwrap(), s.state_hash(false).unwrap());
}

#[test]
fn an_indexed_artifact_whose_file_is_missing_fails_the_archive_closed_and_a_tampered_one_is_rejected_before_activation() {
    let t = temp_root();
    let (c, s, hash) = artifact_store(&t, b"artifact bytes");
    let dest = t.dir.path().join("x.qsarchive");
    std::fs::remove_file(s.root().recovery_artifacts_dir().join(format!("{hash}.artifact"))).unwrap();
    assert_eq!(code(create_archive(&s, &dest)), Code::MediaMissing);
    assert!(!dest.exists(), "no partial archive may be left behind");

    let t2 = temp_root();
    let (c2, s2, hash2) = artifact_store(&t2, b"artifact bytes");
    let good = make_archive(&s2, t2.dir.path(), "g.qsarchive");
    let bad = t2.dir.path().join("bad.qsarchive");
    rewrite(&good, &bad, |e| {
        let b = e.get_mut(&format!("recovery/{hash2}")).unwrap();
        b[0] ^= 1;
    });
    assert_eq!(code(verify_archive(&bad, c2.schema_version())), Code::ArchiveHashMismatch);
    let other = temp_root();
    let mut target = Store::open(&other.root, c2.clone(), &OpenOptions::default()).unwrap();
    let before = target.state_hash(true).unwrap();
    assert_eq!(code(restore_archive(&mut target, &bad)), Code::ArchiveHashMismatch);
    assert_eq!(target.state_hash(true).unwrap(), before);
    drop(c);
}

#[test]
fn a_row_that_indexes_an_artifact_the_archive_does_not_carry_is_refused() {
    let t = temp_root();
    let (c, s, hash) = artifact_store(&t, b"artifact bytes");
    let good = make_archive(&s, t.dir.path(), "g.qsarchive");
    let stripped = t.dir.path().join("stripped.qsarchive");
    rewrite(&good, &stripped, |e| {
        e.remove(&format!("recovery/{hash}"));
        let mut m = manifest(e);
        m["entries"] =
            json!(m["entries"].as_array().unwrap().iter().filter(|x| x["path"] != format!("recovery/{hash}")).cloned().collect::<Vec<_>>());
        set_manifest(e, &m);
    });
    let other = temp_root();
    let mut target = Store::open(&other.root, c.clone(), &OpenOptions::default()).unwrap();
    assert_eq!(code(restore_archive(&mut target, &stripped)), Code::ArchiveMissingEntry);
}

#[test]
fn a_format_version_1_archive_written_by_the_previous_build_is_still_readable_and_restorable() {
    let (t, c, s) = populated(4);
    let new = make_archive(&s, t.dir.path(), "new.qsarchive");
    let old = t.dir.path().join("old.qsarchive");
    rewrite(&new, &old, |e| {
        let mut m = manifest(e);
        m["formatVersion"] = json!(1);
        m["counts"].as_object_mut().unwrap().remove("recoveryArtifacts");
        m["counts"].as_object_mut().unwrap().remove("recoveryArtifactBytes");
        set_manifest(e, &m);
    });
    assert_eq!(verify_archive(&old, c.schema_version()).unwrap().store_schema_version, c.schema_version());
    let other = temp_root();
    let mut target = open(&other, &c);
    restore_archive(&mut target, &old).unwrap();
    assert_eq!(target.state_hash(false).unwrap(), s.state_hash(false).unwrap());
    // a version-1 archive may not smuggle in recovery entries
    let smuggled = t.dir.path().join("smuggled.qsarchive");
    rewrite(&old, &smuggled, |e| {
        let h = hex::encode(<sha2::Sha256 as sha2::Digest>::digest(b"x"));
        e.insert(format!("recovery/{h}"), b"x".to_vec());
        let mut m = manifest(e);
        m["entries"].as_array_mut().unwrap().push(json!({"path": format!("recovery/{h}"), "size": 1, "sha256": h}));
        set_manifest(e, &m);
    });
    assert_eq!(code(verify_archive(&smuggled, c.schema_version())), Code::ArchiveUnlistedEntry);
}
