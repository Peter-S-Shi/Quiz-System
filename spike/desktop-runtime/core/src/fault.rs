//! Fault injection: hard-terminate the process (no destructors, no flush) at a named checkpoint.
//! Enabled by env SPIKE_KILL_AT=<name>. Used by H3.
use windows_sys::Win32::System::Threading::{GetCurrentProcess, TerminateProcess};

pub fn point(name: &str) {
    if std::env::var("SPIKE_KILL_AT").ok().as_deref() == Some(name) {
        eprintln!("FAULT: terminating at checkpoint {name}");
        unsafe {
            TerminateProcess(GetCurrentProcess(), 99);
        }
    }
}

pub const CHECKPOINTS: &[&str] = &[
    "before-snapshot",
    "after-snapshot",
    "mid-copy",
    "before-commit",
    "after-commit",
    "after-journal-done",
    "during-rollback",
    "during-media-gc",
];
