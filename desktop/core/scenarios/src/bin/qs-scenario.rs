//! Child-process workloads for the fault/crash acceptance tests. The parent test kills these processes
//! (or lets them kill themselves at a named checkpoint via `QS_FAULT_AT`) and then inspects the data
//! root they left behind. Synthetic data only. Never shipped.
//!
//! usage:
//!   qs-scenario writer   <root> <ackfile>             commit finalize-style Units of Work forever, ack each one
//!   qs-scenario activate <root> <staging.db> <mode> <op-id>
//!   qs-scenario rollback <root> <op-id>
//!   qs-scenario media-write <root> <mib>               stream-ingest one synthetic file
//!   qs-scenario gc <root>
//!   qs-scenario ingest-many <root> <mib-per-file>,<mib-per-file>,...   prints peak working set
//!   qs-scenario archive-create <root> <dest>           prints peak working set
//!   qs-scenario archive-restore <root> <archive>       prints peak working set
//!   qs-scenario migrate <root> <source> [artifact]     V1 migration: prepare + confirm + activate (prints JSON)
//!   qs-scenario migrate-undo <root> <run-op-id>        undo an import (prints JSON)
//!   qs-scenario gen-big <path> <mib> <assets>          write a synthetic V1 backup with ~<mib> MiB of decoded media

use qs_activation::{MergePolicy, Mode, Options};
use qs_media::MediaStore;
use qs_platform::{mem, DataRoot};
use qs_store::{OpenOptions, Store};
use qs_testkit::*;
use std::fs::OpenOptions as FsOpen;
use std::io::{Read, Write};
use std::sync::Arc;

fn open(root: &DataRoot) -> Store {
    Store::open(root, arc(evidence_catalog()), &OpenOptions::default()).expect("open store")
}

fn synthetic(mib: u64, seed: u64) -> impl Read {
    struct Gen {
        left: u64,
        state: u64,
    }
    impl Read for Gen {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let n = buf.len().min(self.left as usize);
            for b in &mut buf[..n] {
                self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                *b = (self.state >> 56) as u8;
            }
            self.left -= n as u64;
            Ok(n)
        }
    }
    Gen { left: mib * 1024 * 1024, state: seed }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let cmd = args.get(1).map(String::as_str).unwrap_or("");
    let root = DataRoot::at(args.get(2).cloned().unwrap_or_default());
    match cmd {
        "writer" => {
            let ack_path = &args[3];
            let mut store = open(&root);
            let c = Arc::clone(store.catalog());
            let last: u64 =
                std::fs::read_to_string(ack_path).ok().and_then(|t| t.lines().last().and_then(|l| l.trim().parse().ok())).unwrap_or(0);
            let mut ack = FsOpen::new().create(true).append(true).open(ack_path).expect("ack file");
            println!("ready");
            let mut n = last + 1;
            loop {
                store.commit(&finalize_uow(&c, n, &[])).expect("commit");
                writeln!(ack, "{n}").unwrap(); // acked only AFTER the commit returned
                ack.sync_all().unwrap();
                n += 1;
            }
        }
        "activate" => {
            let mut store = open(&root);
            let mode = match args[4].as_str() {
                "replace" => Mode::Replace,
                _ => Mode::Merge(MergePolicy::StagingWins),
            };
            qs_activation::activate(&mut store, std::path::Path::new(&args[3]), mode, &args[5], &Options::default()).expect("activate");
        }
        "rollback" => {
            let mut store = open(&root);
            qs_activation::rollback(&mut store, &args[3]).expect("rollback");
        }
        "media-write" => {
            let media = MediaStore::new(root.media_dir());
            media.put_reader(synthetic(args[3].parse().unwrap(), 1)).expect("ingest");
        }
        "gc" => {
            let media = MediaStore::new(root.media_dir());
            media.gc(&Default::default(), std::time::Duration::ZERO).expect("gc");
        }
        "ingest-many" => {
            let media = MediaStore::new(root.media_dir());
            for (i, mib) in args[3].split(',').enumerate() {
                media.put_reader(synthetic(mib.parse().unwrap(), i as u64 + 10)).expect("ingest");
            }
            println!("{{\"peakMiB\":{:.1}}}", mem::peak_mib());
        }
        "archive-create" => {
            let store = open(&root);
            let sum = qs_archive::create_archive(&store, std::path::Path::new(&args[3])).expect("archive");
            println!("{{\"peakMiB\":{:.1},\"bytes\":{},\"mediaCount\":{}}}", mem::peak_mib(), sum.bytes, sum.media_count);
        }
        "archive-restore" => {
            let mut store = open(&root);
            let r = qs_archive::restore_archive(&mut store, std::path::Path::new(&args[3])).expect("restore");
            println!("{{\"peakMiB\":{:.1},\"mediaAdded\":{}}}", mem::peak_mib(), r.media_added);
        }
        "migrate" => {
            let store = Store::open(&root, Arc::new(qs_migrate_v1::product_catalog()), &OpenOptions::default()).expect("open store");
            let host = qs_migrate_v1::StandaloneHost::new(store);
            use qs_migrate_v1::Host;
            host.with_store(|s| qs_activation::recover(s).expect("recover"));
            qs_migrate_v1::purge_orphan_staging(&root);
            let artifact = args.get(4).map(std::path::PathBuf::from);
            let p = qs_migrate_v1::prepare(
                &host,
                std::path::Path::new(&args[3]),
                artifact.as_deref(),
                &qs_migrate_v1::PrepareOptions::default(),
            )
            .expect("prepare");
            if p.blocked {
                println!("{{\"result\":\"blocked\",\"report\":{}}}", p.report);
                std::process::exit(3);
            }
            if p.already_migrated {
                println!("{{\"result\":\"already-migrated\"}}");
                return;
            }
            match qs_migrate_v1::activate(&host, &p, &p.report_hash).expect("activate") {
                qs_migrate_v1::Activation::Done(d) => {
                    println!("{{\"result\":\"done\",\"runOpId\":\"{}\",\"peakMiB\":{:.1}}}", d.run_op_id, mem::peak_mib())
                }
                qs_migrate_v1::Activation::AlreadyMigrated { run_op_id } => {
                    println!("{{\"result\":\"already-migrated\",\"runOpId\":\"{run_op_id}\"}}")
                }
            }
        }
        "migrate-undo" => {
            let store = Store::open(&root, Arc::new(qs_migrate_v1::product_catalog()), &OpenOptions::default()).expect("open store");
            let host = qs_migrate_v1::StandaloneHost::new(store);
            match qs_migrate_v1::undo(&host, &args[3]).expect("undo") {
                qs_migrate_v1::UndoOutcome::Done { undo_op_id, records_deleted } => {
                    println!("{{\"result\":\"done\",\"undoOpId\":\"{undo_op_id}\",\"recordsDeleted\":{records_deleted}}}")
                }
                qs_migrate_v1::UndoOutcome::Refused { reasons } => {
                    println!("{{\"result\":\"refused\",\"reasons\":{}}}", serde_json::Value::Array(reasons))
                }
            }
        }
        "gen-big" => gen_big(std::path::Path::new(&args[2]), args[3].parse().unwrap(), args[4].parse().unwrap()),
        other => {
            eprintln!("unknown scenario '{other}'");
            std::process::exit(2);
        }
    }
}

/// Stream a synthetic V1 backup whose media (base64 inside one JSON, like V1) totals about `mib` MiB decoded.
/// Writes `<path>.hashes.json` with the SHA-256 of every asset's decoded bytes. Never holds a payload in memory.
fn gen_big(path: &std::path::Path, mib: u64, assets: usize) {
    use sha2::{Digest, Sha256};
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let per = (mib * 1024 * 1024 / assets as u64) / 3 * 3;
    let mut w = std::io::BufWriter::with_capacity(1 << 20, std::fs::File::create(path).expect("create"));
    let ts = "2025-04-01T12:00:00.000Z";
    let questions: Vec<String> = (0..assets)
        .map(|i| format!("{{\"id\":\"q{i}\",\"type\":\"truefalse\",\"prompt\":\"x\",\"answer\":true,\"image\":{{\"id\":\"big-{i}\",\"mimeType\":\"image/png\",\"name\":\"big-{i}.png\",\"size\":{per}}}}}"))
        .collect();
    write!(w, "{{\"schemaVersion\":1,\"documentType\":\"quiz-studio.library-backup\",\"exportedAt\":\"{ts}\",\"library\":{{\"schemaVersion\":1,\"papers\":[{{\"schemaVersion\":1,\"id\":\"paper-big\",\"title\":\"Big\",\"description\":\"\",\"category\":\"\",\"tags\":[],\"createdAt\":\"{ts}\",\"updatedAt\":\"{ts}\",\"lastOpenedAt\":\"{ts}\",\"questions\":[{}]}}],\"categories\":[]}},\"history\":[],\"learnerResponses\":[],\"teacherReviews\":[],\"translationLibrary\":{{\"schemaVersion\":1,\"folders\":[],\"documents\":[]}},\"mediaAssets\":[", questions.join(",")).unwrap();
    let mut hashes = vec![];
    for i in 0..assets {
        if i > 0 {
            w.write_all(b",").unwrap();
        }
        write!(w, "{{\"id\":\"big-{i}\",\"mimeType\":\"image/png\",\"name\":\"big-{i}.png\",\"size\":{per},\"data\":\"").unwrap();
        let mut state = 0x9E37_79B9_7F4A_7C15u64 ^ (i as u64 + 1);
        let mut h = Sha256::new();
        let mut left = per as usize;
        let mut raw = vec![0u8; 3 * 65_536];
        let mut enc: Vec<u8> = Vec::with_capacity(4 * 65_536);
        while left > 0 {
            let n = left.min(raw.len());
            for b in &mut raw[..n] {
                state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                *b = (state >> 56) as u8;
            }
            h.update(&raw[..n]);
            enc.clear();
            for c in raw[..n].chunks(3) {
                let v = (c[0] as u32) << 16 | (c[1] as u32) << 8 | c[2] as u32;
                enc.extend_from_slice(&[
                    T[(v >> 18) as usize & 63],
                    T[(v >> 12) as usize & 63],
                    T[(v >> 6) as usize & 63],
                    T[v as usize & 63],
                ]);
            }
            w.write_all(&enc).unwrap();
            left -= n;
        }
        w.write_all(b"\"}").unwrap();
        hashes.push(hex::encode(h.finalize()));
    }
    w.write_all(b"]}").unwrap();
    w.flush().unwrap();
    std::fs::write(format!("{}.hashes.json", path.display()), serde_json::to_vec(&hashes).unwrap()).unwrap();
}
