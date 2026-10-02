//! Disposable spike shell. Rust owns the Store; the WebView only calls named commands.
use anyhow::Result;
use serde_json::{json, Value};
use spike_core::store::{OpenOpts, Store};
use spike_core::{activation, archive, canon, media};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

const IDENTIFIER: &str = "io.github.peter-s-shi.quiz-studio";

pub struct AppState {
    store: Mutex<Option<Store>>,
    root: PathBuf,
    startup_error: Option<String>,
    args: Vec<String>,
    result_dir: Option<PathBuf>,
}

fn s<T: ToString>(e: T) -> String {
    e.to_string()
}

fn with_store<R>(st: &State<AppState>, f: impl FnOnce(&mut Store) -> Result<R>) -> Result<R, String> {
    let mut g = st.store.lock().map_err(s)?;
    let store = g.as_mut().ok_or_else(|| st.startup_error.clone().unwrap_or_else(|| "store not open".into()))?;
    f(store).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn app_info(st: State<AppState>) -> String {
    let (schema, notice) = match st.store.lock().unwrap().as_ref() {
        Some(x) => (Some(x.schema_version), x.notice.clone()),
        None => (None, None),
    };
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    json!({
        "identifier": IDENTIFIER,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "pid": std::process::id(),
        "storeSchemaVersion": schema,
        "notice": notice,
        "startupError": st.startup_error,
        "dataRootUnderLocalAppData": !local.is_empty() && st.root.starts_with(&local),
        "dataRootInsideOneDrive": st.root.to_string_lossy().to_lowercase().contains("onedrive"),
        "dataRootRedacted": format!("%LOCALAPPDATA%/{IDENTIFIER}"),
        "args": st.args,
    })
    .to_string()
}

#[tauri::command]
fn store_commit(st: State<AppState>, uow: String) -> Result<String, String> {
    with_store(&st, |s| {
        let v: Value = serde_json::from_str(&uow)?;
        Ok(s.commit(&v)?.to_string())
    })
}

#[tauri::command]
fn history_list(st: State<AppState>, limit: usize) -> Result<String, String> {
    with_store(&st, |s| Ok(serde_json::to_string(&s.list_history(limit)?)?))
}

#[tauri::command]
fn store_get_payload(st: State<AppState>, collection: String, id: String) -> Result<String, String> {
    if !["learner_response", "teacher_review", "remediation_doc", "history_entry"].contains(&collection.as_str()) {
        return Err("bad collection".into());
    }
    with_store(&st, |s| Ok(s.conn.query_row(&format!("SELECT payload FROM {collection} WHERE id=?1"), [&id], |r| r.get::<_, String>(0))?))
}

#[tauri::command]
fn store_info(st: State<AppState>, deep: bool) -> Result<String, String> {
    with_store(&st, |s| {
        let mut v = json!({
            "counts": {"learner_response": s.count("learner_response")?, "teacher_review": s.count("teacher_review")?, "media_object": s.count("media_object")?, "uow_marker": s.count("uow_marker")?},
            "storeSchemaVersion": s.schema_version,
        });
        if deep {
            v["quickCheck"] = json!(s.quick_check()?);
            v["consistencyProblems"] = json!(s.check_consistency()?.len());
            v["stateHash"] = json!(s.state_hash()?);
            v["recovery"] = json!(activation::recover(s)?);
        }
        Ok(v.to_string())
    })
}

/// Harness-only: read a fixture file chosen by the test runner (the product WebView would have no such capability).
#[tauri::command]
fn harness_read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(s)
}

#[tauri::command]
fn media_make_samples(st: State<AppState>) -> Result<String, String> {
    let root = st.root.clone();
    with_store(&st, |store| {
        // WAV: 60 s mono 44.1 kHz 16-bit tone (~5 MB, seekable)
        let sr = 44100u32;
        let n = sr * 60;
        let mut wav = Vec::with_capacity(44 + n as usize * 2);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + n * 2).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&sr.to_le_bytes());
        wav.extend_from_slice(&(sr * 2).to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&(n * 2).to_le_bytes());
        for i in 0..n {
            let t = i as f32 / sr as f32;
            let v = ((t * 440.0 * std::f32::consts::TAU).sin() * 8000.0) as i16;
            wav.extend_from_slice(&v.to_le_bytes());
        }
        // PNG: 64x64 gradient
        let mut png_bytes = vec![];
        {
            let mut enc = png::Encoder::new(&mut png_bytes, 64, 64);
            enc.set_color(png::ColorType::Rgb);
            enc.set_depth(png::BitDepth::Eight);
            let mut w = enc.write_header().map_err(|e| anyhow::anyhow!("{e}"))?;
            let mut px = vec![];
            for y in 0..64u8 {
                for x in 0..64u8 {
                    px.extend_from_slice(&[x * 4, y * 4, 128]);
                }
            }
            w.write_image_data(&px).map_err(|e| anyhow::anyhow!("{e}"))?;
        }
        let mut metas = vec![];
        for (id, mime, name, bytes) in [("aud-sample", "audio/wav", "tone.wav", wav), ("img-sample", "image/png", "gradient.png", png_bytes)] {
            let hash = canon::sha256_hex(&bytes);
            let p = media::path_for(&root, &hash);
            fs::create_dir_all(p.parent().unwrap())?;
            if !p.exists() {
                let tmp = p.with_extension("tmp");
                let mut f = File::create(&tmp)?;
                f.write_all(&bytes)?;
                f.sync_all()?;
                fs::rename(&tmp, &p)?;
            }
            metas.push(media::MediaMeta { id: id.into(), mime: Some(mime.into()), name: Some(name.into()), declared_size: None, hash, size: bytes.len() as u64 });
        }
        media::register(&store.conn, &metas)?;
        Ok(json!({"ids": ["aud-sample", "img-sample"]}).to_string())
    })
}

/// Returns an absolute path inside the media scope for convertFileSrc (asset protocol is scope-restricted).
#[tauri::command]
fn media_asset_path(st: State<AppState>, id: String) -> Result<String, String> {
    let root = st.root.clone();
    with_store(&st, |s| {
        let h: String = s.conn.query_row("SELECT content_hash FROM media_object WHERE id=?1", [&id], |r| r.get(0))?;
        Ok(media::path_for(&root, &h).to_string_lossy().to_string())
    })
}

/// Path of the DB file (for the out-of-scope asset probe; harness only).
#[tauri::command]
fn harness_db_path(st: State<AppState>) -> String {
    spike_core::store::db_path(&st.root).to_string_lossy().to_string()
}

#[tauri::command]
async fn media_ingest_envelope(st: State<'_, AppState>, path: String) -> Result<String, String> {
    let root = st.root.clone();
    let stats = tauri::async_runtime::spawn_blocking(move || media::ingest_envelope(&root, std::path::Path::new(&path)).map_err(|e| format!("{e:#}")))
        .await
        .map_err(s)??;
    with_store(&st, |store| {
        media::register(&store.conn, &stats.metas)?;
        Ok(json!({"assets": stats.assets, "bytes": stats.bytes, "dedupedFiles": stats.deduped_files, "peakWorkingSetMiB": stats.peak_mib}).to_string())
    })
}

#[tauri::command]
async fn make_big_file(path: String, mib: u64) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let mut f = std::io::BufWriter::with_capacity(1 << 20, File::create(&path).map_err(s)?);
        let mut buf = vec![0u8; 1 << 20];
        let mut rng = fastrand::Rng::with_seed(42);
        let mut h = <sha2::Sha256 as sha2::Digest>::new();
        for _ in 0..mib {
            rng.fill(&mut buf);
            sha2::Digest::update(&mut h, &buf);
            f.write_all(&buf).map_err(s)?;
        }
        f.flush().map_err(s)?;
        Ok(json!({"sha256": hex::encode(sha2::Digest::finalize(h)), "bytes": mib << 20}).to_string())
    })
    .await
    .map_err(s)?
}

/// Streamed copy with progress events (native-file-flow stand-in); runs off the UI thread.
#[tauri::command]
async fn stream_copy(app: tauri::AppHandle, src: String, dest: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let t = std::time::Instant::now();
        let mut r = File::open(&src).map_err(s)?;
        let mut w = std::io::BufWriter::with_capacity(1 << 20, File::create(&dest).map_err(s)?);
        let mut buf = vec![0u8; 1 << 20];
        let mut h = <sha2::Sha256 as sha2::Digest>::new();
        let mut total = 0u64;
        let mut last = std::time::Instant::now();
        loop {
            let n = r.read(&mut buf).map_err(s)?;
            if n == 0 {
                break;
            }
            sha2::Digest::update(&mut h, &buf[..n]);
            w.write_all(&buf[..n]).map_err(s)?;
            total += n as u64;
            if last.elapsed().as_millis() >= 100 {
                let _ = app.emit("copy-progress", total);
                last = std::time::Instant::now();
            }
        }
        w.flush().map_err(s)?;
        Ok(json!({"bytes": total, "sha256": hex::encode(sha2::Digest::finalize(h)), "ms": t.elapsed().as_millis() as u64}).to_string())
    })
    .await
    .map_err(s)?
}

#[tauri::command]
fn window_op(app: tauri::AppHandle, op: String, w: Option<u32>, h: Option<u32>, on: Option<bool>) -> Result<String, String> {
    let win = app.get_webview_window("main").ok_or("no window")?;
    match op.as_str() {
        "size" => win.set_size(tauri::LogicalSize::new(w.unwrap_or(900) as f64, h.unwrap_or(650) as f64)).map_err(s)?,
        "fullscreen" => win.set_fullscreen(on.unwrap_or(false)).map_err(s)?,
        "focus" => { let _ = win.show(); let _ = win.unminimize(); win.set_focus().map_err(s)?; }
        "scale" => return Ok(json!({"scaleFactor": win.scale_factor().map_err(s)?}).to_string()),
        _ => return Err("bad op".into()),
    }
    Ok("{}".into())
}

#[tauri::command]
fn report_result(app: tauri::AppHandle, st: State<AppState>, name: String, body: String, exit: bool) -> Result<(), String> {
    if let Some(d) = &st.result_dir {
        fs::create_dir_all(d).map_err(s)?;
        fs::write(d.join(format!("{name}.json")), body).map_err(s)?;
    }
    if exit {
        app.exit(0);
    }
    Ok(())
}

#[tauri::command]
fn archive_create_cmd(st: State<AppState>, out: String) -> Result<String, String> {
    Ok(archive::create(&st.root, std::path::Path::new(&out)).map_err(|e| format!("{e:#}"))?.to_string())
}

pub fn run() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let arg = |k: &str| args.iter().position(|x| x == k).and_then(|i| args.get(i + 1)).cloned();
    let result_dir = arg("--result-dir").map(PathBuf::from).or_else(|| std::env::var("QS_SPIKE_RESULT_DIR").ok().map(PathBuf::from));
    let override_root = std::env::var("QS_SPIKE_DATA_ROOT").ok().map(PathBuf::from);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let root = match override_root.clone() {
                Some(r) => r,
                None => app.path().app_local_data_dir()?,
            };
            let (store, err) = match Store::open(&root, &OpenOpts { synchronous: "FULL".into(), lock: true }) {
                Ok(mut st) => {
                    let _ = activation::recover(&st);
                    let _ = &mut st;
                    (Some(st), None)
                }
                Err(e) => (None, Some(format!("{e:#}"))),
            };
            app.manage(AppState { store: Mutex::new(store), root, startup_error: err, args: args.clone(), result_dir: result_dir.clone() });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info, store_commit, history_list, store_get_payload, store_info, harness_read_text, media_make_samples, media_asset_path,
            harness_db_path, media_ingest_envelope, make_big_file, stream_copy, window_op, report_result, archive_create_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
