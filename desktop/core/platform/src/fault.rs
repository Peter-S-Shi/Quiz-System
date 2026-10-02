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
