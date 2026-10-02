//! Memory probes for the bounded-memory acceptance tests (ADR 0001 H3/H4/H5 thresholds).

/// (current, peak) working set of this process in bytes. (0, 0) where unsupported.
#[cfg(windows)]
pub fn working_set() -> (u64, u64) {
    use windows_sys::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows_sys::Win32::System::Threading::GetCurrentProcess;
    // SAFETY: plain FFI call filling a zeroed POD struct whose size field is set.
    unsafe {
        let mut c: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
        c.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        GetProcessMemoryInfo(GetCurrentProcess(), &mut c, c.cb);
        (c.WorkingSetSize as u64, c.PeakWorkingSetSize as u64)
    }
}
#[cfg(not(windows))]
pub fn working_set() -> (u64, u64) {
    (0, 0)
}

pub fn peak_mib() -> f64 {
    working_set().1 as f64 / 1_048_576.0
}
