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
        other => {
            eprintln!("unknown scenario '{other}'");
            std::process::exit(2);
        }
    }
}
