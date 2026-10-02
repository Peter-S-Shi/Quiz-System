//! Test-only fault injection: hard-terminate the process (no destructors, no flush) at a named
//! checkpoint when `QS_FAULT_AT=<name>` is set. Compiled to a no-op unless the `fault-injection`
//! feature is on, so the shipped binary carries no kill switch.

/// Named checkpoints the activation / media / store code exposes.
pub const CHECKPOINTS: &[&str] = &[
    "before-snapshot",
    "after-snapshot",
    "mid-copy",
    "before-commit",
    "after-commit",
    "after-journal-done",
    "during-rollback",
    "during-media-gc",
    "media-mid-write",
    "uow-before-commit",
    // V1 migration (ADR 0002 section 15.5)
    "mig-after-intake",
    "mig-mid-staging",
    "mig-after-staging",
    "mig-after-report",
    "mig-mid-media-publish",
    "mig-after-media-publish",
    "mig-after-artifact-publish",
    "mig-before-undo-commit",
    // Learning Orchestration (ADR 0003 section 15): the Unit-of-Work boundary of each scheduling operation. A
    // Unit of Work carrying `"tag": "<op>"` exposes `sched-before-commit:<op>` (all writes done, not committed)
    // and `sched-after-commit:<op>` (committed).
    "sched-before-commit:create",
    "sched-before-commit:move-once",
    "sched-before-commit:move-occurrence",
    "sched-before-commit:move-future",
    "sched-before-commit:cancel",
    "sched-before-commit:apply-plan",
    "sched-before-commit:decide-accept",
    "sched-before-commit:decide-keep",
    "sched-before-commit:session-complete",
    "sched-after-commit:create",
    "sched-after-commit:move-once",
    "sched-after-commit:move-occurrence",
    "sched-after-commit:move-future",
    "sched-after-commit:cancel",
    "sched-after-commit:apply-plan",
    "sched-after-commit:decide-accept",
    "sched-after-commit:decide-keep",
    "sched-after-commit:session-complete",
];

#[cfg(feature = "fault-injection")]
pub fn point(name: &str) {
    if std::env::var("QS_FAULT_AT").ok().as_deref() == Some(name) {
        eprintln!("FAULT: terminating at checkpoint {name}");
        terminate();
    }
}

#[cfg(feature = "fault-injection")]
fn terminate() -> ! {
    #[cfg(windows)]
    // SAFETY: terminates the current process immediately; that is the intent.
    unsafe {
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, TerminateProcess};
        TerminateProcess(GetCurrentProcess(), 99);
    }
    std::process::exit(99)
}

#[cfg(not(feature = "fault-injection"))]
#[inline(always)]
pub fn point(_name: &str) {}

/// True when this build can inject faults (lets tests skip loudly rather than silently pass).
pub const ENABLED: bool = cfg!(feature = "fault-injection");
