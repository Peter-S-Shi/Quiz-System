//! Quiz Studio V2 desktop shell: Tauri 2 + WebView2 around the Rust durability boundary.
//!
//! The WebView holds no canonical state and no capability beyond core IPC. It talks to the Rust core
//! through ONE command, `port`, restricted to an allowlist of Store Port commands that carry no file-system
//! path. Everything that touches a file the user picked (native Open/Save dialogs, drag-and-drop, media
//! streaming, backup/restore) is done here in Rust, so a raw path never needs to cross into JavaScript.

mod native;
mod state;

use qs_platform::identity::{APP_IDENTIFIER, APP_VERSION};
use serde_json::{json, Value};
use state::AppState;
use tauri::{Manager, State};

/// The ONLY WebView entry into the core: the allowlist, dispatch and diagnostic sanitization live in
/// `qs_port::webview` so the boundary is unit-tested without Tauri.
#[tauri::command]
fn port(state: State<'_, AppState>, command: String, args: Value) -> Value {
    match state.core() {
        Some(core) => qs_port::webview::dispatch(&core, &command, &args),
        None => json!({"ok": false, "error": {"code": "STORE_UNAVAILABLE", "message": "the data store is not open"}}),
    }
}

/// Boot status for the UI: ready, or failed with the reason and the snapshots that could restore it.
#[tauri::command]
fn app_status(state: State<'_, AppState>) -> Value {
    state.status_json()
}

/// The UI reports that it rendered and talked to the core (diagnostics + CI smoke evidence).
#[tauri::command]
fn ui_ready(state: State<'_, AppState>, info: Value) -> Value {
    state.record_ui_ready(&info);
    json!({"ok": true})
}

/// Offline recovery when the store cannot open: the damaged file is preserved, never deleted.
#[tauri::command]
fn recovery_restore_snapshot(state: State<'_, AppState>, name: String) -> Value {
    let r = state.recover_from_snapshot(&name);
    state.sanitized(r)
}

/// Run the foundation proof against an isolated temp root and write the JSON report. Never touches user data.
fn self_test(out: Option<&str>) -> i32 {
    let dir = std::env::temp_dir().join(format!("quiz-studio-selftest-{}", std::process::id()));
    let result = qs_port::selftest::run(&dir);
    let _ = std::fs::remove_dir_all(&dir);
    let (report, code) = match result {
        Ok(v) => {
            let ok = v["ok"] == true;
            (v, if ok { 0 } else { 1 })
        }
        Err(e) => (json!({"ok": false, "error": {"code": e.code.as_str(), "message": e.message}}), 1),
    };
    let text = serde_json::to_string_pretty(&report).unwrap_or_default();
    match out {
        Some(p) => {
            let _ = std::fs::write(p, text);
        }
        None => println!("{text}"),
    }
    code
}

pub fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--self-test") {
        std::process::exit(self_test(args.get(2).map(String::as_str)));
    }
    if args.get(1).map(String::as_str) == Some("--identity") {
        println!("{}", json!({"identifier": APP_IDENTIFIER, "version": APP_VERSION}));
        return;
    }
    run();
}

fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // a second launch focuses the first window and never opens the database
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::open_default())
        .invoke_handler(tauri::generate_handler![
            port,
            app_status,
            ui_ready,
            recovery_restore_snapshot,
            native::native_pick_media,
            native::native_backup_save,
            native::native_backup_pick,
            native::native_backup_restore_pending,
            native::native_migration_artifact,
            native::native_migration_prepare,
            native::native_export_text,
            native::native_import_text,
        ])
        .on_window_event(native::on_window_event)
        .run(tauri::generate_context!())
        .expect("error while running Quiz Studio");
}
