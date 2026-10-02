use windows_sys::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
use windows_sys::Win32::System::Threading::GetCurrentProcess;

/// (current working set, peak working set) in bytes for this process.
pub fn working_set() -> (u64, u64) {
    unsafe {
        let mut c: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
        c.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        GetProcessMemoryInfo(GetCurrentProcess(), &mut c, c.cb);
        (c.WorkingSetSize as u64, c.PeakWorkingSetSize as u64)
    }
}
pub fn peak_mib() -> f64 {
    working_set().1 as f64 / 1048576.0
}
