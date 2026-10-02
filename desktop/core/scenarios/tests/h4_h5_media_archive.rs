//! ADR 0001 H4/H5 methods as a permanent suite: media crash safety and the bounded-memory envelopes for
//! streaming ingest, archive creation and restore (peak Rust working set <= 300 MiB).
//!
//! Size: `QS_HEAVY_MIB` total media (default 160 locally; CI sets 400 - the ADR dataset).

use qs_media::MediaStore;
use qs_platform::DataRoot;
use qs_scenarios::*;
use qs_store::{OpenOptions, Store};
use qs_testkit::*;
use serde_json::Value;

const PEAK_LIMIT_MIB: f64 = 300.0;

fn stdout_json(o: &std::process::Output) -> Value {
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    serde_json::from_slice(&o.stdout).unwrap()
}

#[test]
fn a_kill_mid_media_write_leaves_only_complete_files_or_discardable_temps() {
    let t = temp_root();
    t.root.ensure().unwrap();
    let out = run(&["media-write", &root_str(&t.root), "64"], Some("media-mid-write"));
    assert_eq!(out.status.code(), Some(99));
    let media = MediaStore::new(t.root.media_dir());
    assert!(media.list().unwrap().is_empty(), "no final-named file may exist for an incomplete write");
    let temps: Vec<_> =
        std::fs::read_dir(media.dir()).unwrap().map(|e| e.unwrap().path()).filter(|p| p.to_string_lossy().ends_with(".tmp")).collect();
    assert_eq!(temps.len(), 1, "exactly one discardable temp file");
    // the orphan is collected by gc (no references)
    let rep = media.gc(&Default::default(), std::time::Duration::ZERO).unwrap();
    assert_eq!(rep.removed_temp, 1);
    // a clean ingest afterwards works and verifies
    let ok = run(&["media-write", &root_str(&t.root), "8"], None);
    assert!(ok.status.success());
    for h in media.list().unwrap() {
        media.verify(&h, None).unwrap();
    }
}

#[test]
fn a_kill_during_media_gc_never_damages_referenced_media() {
    let t = temp_root();
    t.root.ensure().unwrap();
    let media = MediaStore::new(t.root.media_dir());
    let keep = media.put_bytes(b"referenced").unwrap();
    for i in 0..5u8 {
        media.put_bytes(&[i; 1000]).unwrap();
    }
    // the child gc has an empty reference set => everything is an orphan; it dies after the first deletion.
    // Referenced-protection is exercised in-process; here we prove no half-deleted/corrupt file remains.
    let out = run(&["gc", &root_str(&t.root)], Some("during-media-gc"));
    assert_eq!(out.status.code(), Some(99));
    for h in media.list().unwrap() {
        media.verify(&h, None).unwrap();
    }
    let _ = keep;
}

#[test]
fn streaming_ingest_archive_and_restore_stay_within_the_memory_envelope() {
    let total = env_usize("QS_HEAVY_MIB", 160) as u64;
    // mixed sizes, largest <= 50 MiB, summing to `total`
    let mut sizes: Vec<u64> = vec![];
    let mut left = total;
    while left > 0 {
        let s = [50u64, 25, 10, 5, 1][sizes.len() % 5].min(left);
        sizes.push(s);
        left -= s;
    }
    let spec = sizes.iter().map(u64::to_string).collect::<Vec<_>>().join(",");

    let t = temp_root();
    t.root.ensure().unwrap();
    let ing = stdout_json(&run(&["ingest-many", &root_str(&t.root), &spec], None));
    let peak = ing["peakMiB"].as_f64().unwrap();
    eprintln!("H4 ingest {total} MiB in {} files: child peak {peak} MiB", sizes.len());
    assert!(peak <= PEAK_LIMIT_MIB, "ingest peak {peak} MiB exceeds {PEAK_LIMIT_MIB}");

    // register every file as a media object, then archive and restore it in child processes
    let media = MediaStore::new(t.root.media_dir());
    {
        let c = arc(evidence_catalog());
        let mut s = Store::open(&t.root, c.clone(), &OpenOptions::default()).unwrap();
        let ops: Vec<Value> = media
            .list()
            .unwrap()
            .iter()
            .enumerate()
            .map(|(i, h)| {
                put_op(&c, "media_object", &format!("m-{i}"), media_object_payload(&format!("m-{i}"), h, media.size_of(h).unwrap()))
            })
            .collect();
        s.commit(&uow(ops)).unwrap();
    }
    let archive = t.dir.path().join("big.qsarchive");
    let a = stdout_json(&run(&["archive-create", &root_str(&t.root), &archive.display().to_string()], None));
    let peak_a = a["peakMiB"].as_f64().unwrap();
    eprintln!("H5 archive create: bytes {} peak {peak_a} MiB", a["bytes"]);
    assert!(peak_a <= PEAK_LIMIT_MIB, "archive-create peak {peak_a}");

    let clean = DataRoot::at(t.dir.path().join("restore-root"));
    clean.ensure().unwrap();
    let r = stdout_json(&run(&["archive-restore", &root_str(&clean), &archive.display().to_string()], None));
    let peak_r = r["peakMiB"].as_f64().unwrap();
    eprintln!("H5 archive restore: peak {peak_r} MiB");
    assert!(peak_r <= PEAK_LIMIT_MIB, "archive-restore peak {peak_r}");

    // byte-identical media after the round trip
    let restored = MediaStore::new(clean.media_dir());
    assert_eq!(restored.list().unwrap(), media.list().unwrap());
    for h in restored.list().unwrap() {
        restored.verify(&h, Some(media.size_of(&h).unwrap())).unwrap();
    }
}
