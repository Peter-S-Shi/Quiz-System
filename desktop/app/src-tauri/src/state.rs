//! Application state: the open core (or the reason it could not open), pending native operations, and
//! the diagnostic log under the data root.

use qs_platform::identity::{APP_IDENTIFIER, APP_VERSION, PRODUCT_NAME};
use qs_platform::{DataRoot, Error};
use qs_port::{offline, selftest, Core};
use qs_store::OpenOptions;
use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

pub struct AppState {
    root: Option<DataRoot>,
    core: RwLock<Option<Arc<Core>>>,
    open_error: Mutex<Option<Error>>,
    pub pending_backup: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn open_default() -> AppState {
        let root = DataRoot::default_for_user().ok();
        let st = AppState { root: root.clone(), core: RwLock::new(None), open_error: Mutex::new(None), pending_backup: Mutex::new(None) };
        match &root {
            Some(r) => st.try_open(r),
            None => *st.open_error.lock().unwrap() = Some(Error::new(qs_platform::Code::Internal, "LOCALAPPDATA is not set")),
        }
        st
    }

    fn try_open(&self, root: &DataRoot) {
        match Core::open(root, selftest::product_catalog(), &OpenOptions::default()) {
            Ok(core) => {
                self.log(&format!("store opened; healthy={} upgrade={:?}", core.startup().healthy(), core.startup().upgrade));
                *self.core.write().unwrap() = Some(Arc::new(core));
                *self.open_error.lock().unwrap() = None;
            }
            Err(e) => {
                self.log(&format!("store failed to open: {e}"));
                *self.open_error.lock().unwrap() = Some(e);
            }
        }
    }

    pub fn core(&self) -> Option<Arc<Core>> {
        self.core.read().unwrap().clone()
    }

    pub fn log(&self, line: &str) {
        if let Some(r) = &self.root {
            let _ = std::fs::create_dir_all(r.logs_dir());
            if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(r.logs_dir().join("app.log")) {
                let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
                let _ = writeln!(f, "{secs} {line}");
            }
        }
    }

    fn root_str(&self) -> String {
        self.root.as_ref().map(|r| r.path().display().to_string()).unwrap_or_default()
    }

    /// Failure envelopes returned to the WebView get their diagnostic (`error.message`) sanitized; results are
    /// path-free by construction and are never rewritten.
    pub fn sanitized(&self, mut v: Value) -> Value {
        qs_port::webview::sanitize_envelope(&mut v, &self.root_str());
        v
    }

    fn error_json(&self, e: &Error) -> Value {
        json!({"code": e.code.as_str(), "message": qs_port::webview::sanitize_message(&e.message, &self.root_str())})
    }

    pub fn status_json(&self) -> Value {
        let identity = json!({"product": PRODUCT_NAME, "identifier": APP_IDENTIFIER, "appVersion": APP_VERSION});
        match (self.core(), self.open_error.lock().unwrap().clone()) {
            (Some(_), _) => json!({"status": "ready", "identity": identity}),
            (None, err) => {
                let snapshots = self.root.as_ref().and_then(|r| offline::list_snapshots(r).ok()).unwrap_or_default();
                json!({"status": "failed", "identity": identity,
                       "error": err.map(|e| self.error_json(&e)),
                       "snapshots": snapshots})
            }
        }
    }

    pub fn record_ui_ready(&self, info: &Value) {
        self.log(&format!("ui ready: {info}"));
        if let Some(r) = &self.root {
            let body = json!({"uiLoaded": true, "appVersion": APP_VERSION, "info": info});
            let _ = std::fs::write(r.logs_dir().join("boot-status.json"), body.to_string());
        }
    }

    pub fn recover_from_snapshot(&self, name: &str) -> Value {
        let Some(root) = self.root.clone() else { return json!({"ok": false, "error": {"code": "INTERNAL", "message": "no data root"}}) };
        if self.core().is_some() {
            return json!({"ok": false, "error": {"code": "REJECT_SHAPE", "message": "the store is open; use snapshots.restore instead"}});
        }
        match offline::restore_snapshot_offline(&root, name) {
            Ok(preserved) => {
                self.log(&format!("offline recovery from {name}; damaged file preserved in recovery-artifacts"));
                self.try_open(&root);
                json!({"ok": true, "result": {"preservedDamaged": preserved.file_name().map(|n| n.to_string_lossy().into_owned()), "status": self.status_json()}})
            }
            Err(e) => json!({"ok": false, "error": self.error_json(&e)}),
        }
    }
}
