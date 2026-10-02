//! Helpers shared by the fault/crash acceptance tests in `tests/`.

use qs_platform::DataRoot;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};

pub fn scenario_bin() -> PathBuf {
    if let Some(p) = std::env::var_os("CARGO_BIN_EXE_qs-scenario") {
        return PathBuf::from(p);
    }
    // test executables live in target/<profile>/deps; the scenario binary one level up
    let exe = std::env::current_exe().expect("current_exe");
    exe.parent().and_then(Path::parent).expect("target dir").join(format!("qs-scenario{}", std::env::consts::EXE_SUFFIX))
}

pub fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

pub fn run(args: &[&str], fault_at: Option<&str>) -> Output {
    let mut c = Command::new(scenario_bin());
    c.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(f) = fault_at {
        c.env("QS_FAULT_AT", f);
    }
    c.output().expect("spawn scenario")
}

pub fn spawn(args: &[&str]) -> Child {
    Command::new(scenario_bin()).args(args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().expect("spawn scenario")
}

pub fn copy_dir(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for e in std::fs::read_dir(from).unwrap() {
        let e = e.unwrap();
        let dest = to.join(e.file_name());
        if e.file_type().unwrap().is_dir() {
            copy_dir(&e.path(), &dest);
        } else {
            std::fs::copy(e.path(), dest).unwrap();
        }
    }
}

pub fn root_str(r: &DataRoot) -> String {
    r.path().display().to_string()
}
