//! Native file flows: Open/Save dialogs, drag-and-drop, streaming media ingest with progress, backup
//! create / verify / restore. Heavy work runs off the UI thread and reports progress as events, so the
//! window stays responsive; paths stay in Rust.

use crate::state::AppState;
use qs_platform::Error;
use serde_json::{json, Value};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, Window, WindowEvent};
use tauri_plugin_dialog::DialogExt;

fn err(e: &Error) -> Value {
    json!({"ok": false, "error": {"code": e.code.as_str(), "message": e.message}})
}
fn err_msg(code: &str, message: &str) -> Value {
    json!({"ok": false, "error": {"code": code, "message": message}})
}

struct ProgressReader<R> {
    inner: R,
    done: u64,
    total: u64,
    app: AppHandle,
    label: String,
    last: Instant,
}
impl<R: Read> Read for ProgressReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.done += n as u64;
        if self.last.elapsed() >= Duration::from_millis(100) || n == 0 {
            self.last = Instant::now();
            let _ = self.app.emit("qs://progress", json!({"label": self.label, "done": self.done, "total": self.total}));
        }
        Ok(n)
    }
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") | Some("oga") => "audio/ogg",
        Some("m4a") => "audio/mp4",
        Some("flac") => "audio/flac",
        _ => "application/octet-stream",
    }
}

/// Stream a user-chosen file into the content-addressed store, then register it in ONE Unit of Work.
fn ingest(app: &AppHandle, state: &AppState, path: &Path) -> Value {
    let Some(core) = state.core() else { return err_msg("STORE_UNAVAILABLE", "the data store is not open") };
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) => return err_msg("IO", &e.to_string()),
    };
    let total = file.metadata().map(|m| m.len()).unwrap_or(0);
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let reader = ProgressReader { inner: file, done: 0, total, app: app.clone(), label: name.clone(), last: Instant::now() };
    let media = qs_media::MediaStore::new(core.root().media_dir());
    let stored = match media.put_reader(reader) {
        Ok(s) => s,
        Err(e) => return err(&e),
    };
    let id = format!("media-{}", &stored.hash[..16]);
    let mime = mime_for(path);
    let uow = json!({"ops": [{"op": "put", "collection": "media_object", "id": id,
        "payload": {"id": id, "contentHash": stored.hash, "size": stored.size, "mimeType": mime, "name": name},
        "proj": {"columns": {"content_hash": stored.hash, "size": stored.size, "mime": mime, "name": name}, "relations": {}}}]});
    let commit = core.dispatch("store.commit", &json!({"uow": uow}));
    if commit["ok"] != true {
        return commit;
    }
    state.log(&format!("media ingested id={id} size={} dedup={}", stored.size, stored.deduplicated));
    qs_port::webview::media_ingest_result(&id, &stored.hash, stored.size, &name, mime, stored.deduplicated)
}

#[tauri::command]
pub async fn native_pick_media(app: AppHandle, state: State<'_, AppState>) -> Result<Value, ()> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Images and audio", &["png", "jpg", "jpeg", "gif", "webp", "svg", "mp3", "wav", "ogg", "m4a", "flac"])
        .add_filter("All files", &["*"])
        .blocking_pick_file();
    let Some(p) = picked.and_then(|f| f.into_path().ok()) else { return Ok(json!({"ok": true, "result": null})) };
    Ok(state.sanitized(ingest(&app, &state, &p)))
}

fn default_backup_name() -> String {
    // civil date from the Unix epoch (no calendar dependency)
    let days = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() / 86_400).unwrap_or(0) as i64;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let (y, doy) = (yoe + era * 400, doe - (365 * yoe + yoe / 4 - yoe / 100));
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    format!("quiz-studio-backup-{:04}{:02}{:02}.qsarchive", if m <= 2 { y + 1 } else { y }, m, d)
}

#[tauri::command]
pub async fn native_backup_save(app: AppHandle, state: State<'_, AppState>) -> Result<Value, ()> {
    let Some(core) = state.core() else { return Ok(err_msg("STORE_UNAVAILABLE", "the data store is not open")) };
    let picked =
        app.dialog().file().set_file_name(default_backup_name()).add_filter("Quiz Studio backup", &["qsarchive"]).blocking_save_file();
    let Some(dest) = picked.and_then(|f| f.into_path().ok()) else { return Ok(json!({"ok": true, "result": null})) };
    let r = core.dispatch("backup.create", &json!({"dest": dest.display().to_string()}));
    state.log(&format!("backup.create ok={}", r["ok"]));
    Ok(state.sanitized(r))
}

/// Step 1 of restore: choose and fully verify the archive (nothing is changed). The UI asks for
/// confirmation, then calls `native_backup_restore_pending`.
#[tauri::command]
pub async fn native_backup_pick(app: AppHandle, state: State<'_, AppState>) -> Result<Value, ()> {
    let Some(core) = state.core() else { return Ok(err_msg("STORE_UNAVAILABLE", "the data store is not open")) };
    let picked = app.dialog().file().add_filter("Quiz Studio backup", &["qsarchive", "zip"]).blocking_pick_file();
    let Some(path) = picked.and_then(|f| f.into_path().ok()) else { return Ok(json!({"ok": true, "result": null})) };
    let v = core.dispatch("backup.verify", &json!({"path": path.display().to_string()}));
    if v["ok"] == true {
        *state.pending_backup.lock().unwrap() = Some(path.clone());
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned());
        return Ok(state.sanitized(json!({"ok": true, "result": {"name": name, "verified": v["result"]}})));
    }
    Ok(state.sanitized(v))
}

#[tauri::command]
pub async fn native_backup_restore_pending(state: State<'_, AppState>) -> Result<Value, ()> {
    let Some(core) = state.core() else { return Ok(err_msg("STORE_UNAVAILABLE", "the data store is not open")) };
    let Some(path) = state.pending_backup.lock().unwrap().take() else {
        return Ok(err_msg("NOT_FOUND", "no verified backup is waiting to be restored"));
    };
    let r = core.dispatch("backup.restore", &json!({"path": path.display().to_string()}));
    state.log(&format!("backup.restore ok={}", r["ok"]));
    Ok(state.sanitized(r))
}

/// OS drag-and-drop is handled here, in Rust: dropped files are streamed into the media store on a
/// worker thread (UI stays responsive) and the UI is told via events.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::DragDrop(dd) = event else { return };
    match dd {
        DragDropEvent::Enter { .. } => {
            let _ = window.emit("qs://drag", json!({"over": true}));
        }
        DragDropEvent::Leave => {
            let _ = window.emit("qs://drag", json!({"over": false}));
        }
        DragDropEvent::Drop { paths, .. } => {
            let _ = window.emit("qs://drag", json!({"over": false}));
            let paths: Vec<PathBuf> = paths.clone();
            let app = window.app_handle().clone();
            std::thread::spawn(move || {
                let state = app.state::<AppState>();
                for p in paths.iter().filter(|p| p.is_file()) {
                    let r = state.sanitized(ingest(&app, &state, p));
                    let _ = app.emit("qs://ingested", r);
                }
            });
        }
        _ => {}
    }
}
