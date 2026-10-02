//! ADR 0001 H2(c) method as a permanent suite: forced termination (`TerminateProcess`, no destructors)
//! at random points during a loop of multi-record Units of Work, with commits acknowledged out-of-band.
//! After EVERY kill: `quick_check` clean, every acked Unit of Work fully present, no partial Unit of Work.
//!
//! Kill count: `QS_KILLS` (default 40 locally; CI sets 500 - the ADR threshold).

use qs_platform::DataRoot;
use qs_scenarios::*;
use qs_store::{OpenOptions, Store};
use qs_testkit::*;
use std::io::Read;

fn present(s: &Store, n: u64) -> usize {
    let q = |sql: &str, id: String| -> i64 { s.conn().query_row(sql, [id], |r| r.get(0)).unwrap() };
    (q("SELECT count(*) FROM learner_response WHERE id=?1", format!("resp-{n}"))
        + q("SELECT count(*) FROM teacher_review WHERE id=?1", format!("rev-{n}"))
        + q("SELECT count(*) FROM history_entry WHERE id=?1", format!("hist-{n}"))
        + q("SELECT count(*) FROM uow_marker WHERE id=?1", format!("m-{n}"))) as usize
}

#[test]
fn forced_kills_never_corrupt_or_tear_a_unit_of_work() {
    let kills = env_usize("QS_KILLS", 40);
    let t = temp_root();
    let root: &DataRoot = &t.root;
    let ack = t.dir.path().join("ack.log");
    let (root_s, ack_s) = (root_str(root), ack.display().to_string());
    let mut rng = fastrand::Rng::with_seed(0xC0FFEE);
    let mut verified_upto = 0u64;
    let mut total_acked = 0u64;

    for round in 0..kills {
        let mut child = spawn(&["writer", &root_s, &ack_s]);
        // wait for the child to report it is open, then let it run for a random slice of time
        let mut ready = [0u8; 5];
        child.stdout.as_mut().unwrap().read_exact(&mut ready).expect("writer did not start");
        std::thread::sleep(std::time::Duration::from_millis(rng.u64(5..220)));
        child.kill().unwrap(); // TerminateProcess
        child.wait().unwrap();

        let acked: Vec<u64> = std::fs::read_to_string(&ack).unwrap_or_default().lines().filter_map(|l| l.trim().parse().ok()).collect();
        total_acked = acked.last().copied().unwrap_or(0);

        let store = Store::open(root, arc(evidence_catalog()), &OpenOptions::default()).expect("reopen after kill");
        assert!(store.quick_check().unwrap(), "round {round}: quick_check failed");
        // every acked Unit of Work is fully present; nothing beyond is partial
        let upper = total_acked + 2;
        for n in (verified_upto + 1)..=upper {
            let p = present(&store, n);
            if n <= total_acked {
                assert_eq!(p, 4, "round {round}: acked UoW {n} is missing rows ({p}/4)");
            } else {
                assert!(p == 0 || p == 4, "round {round}: UoW {n} is partial ({p}/4)");
            }
        }
        verified_upto = total_acked;
        if round % 20 == 19 || round + 1 == kills {
            assert!(store.check_consistency().unwrap().is_empty(), "round {round}: projections drifted");
        }
    }
    eprintln!("H2 crash loop: {kills} forced kills, {total_acked} acked Units of Work, 0 violations");
    assert!(total_acked > 0, "the writer never committed anything - the test proved nothing");
}
