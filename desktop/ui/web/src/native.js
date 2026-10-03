// The Rust-owned native flows as plain async functions: file dialogs, streaming media ingest, backup / restore and the V1
// migration source choice. Paths stay in Rust; this adapter only unwraps the `{ok, result, error}` envelope (a dialog the
// learner cancelled resolves `null`) and subscribes to the native progress / drag / ingest events.
export function tauriNative(tauri = globalThis.__TAURI__) {
  const invoke = (name, args = {}) => tauri.core.invoke(name, args);
  const call = async (name, args) => {
    const r = await invoke(name, args);
    if (!r.ok) throw Object.assign(new Error(`${r.error.code}: ${r.error.message}`), { code: r.error.code });
    return r.result ?? null;
  };
  const listen = (event, fn) => {
    let off = null;
    let dead = false;
    Promise.resolve(tauri.event.listen(event, (e) => fn(e.payload))).then((u) => { if (dead) u(); else off = u; });
    return () => { dead = true; off?.(); };
  };
  return {
    pickMedia: () => call('native_pick_media'),
    exportText: (suggestedName, text) => call('native_export_text', { suggestedName, text }),
    importText: () => call('native_import_text'),
    backupSave: () => call('native_backup_save'),
    backupPick: () => call('native_backup_pick'),
    backupRestore: () => call('native_backup_restore_pending'),
    migrationArtifact: () => call('native_migration_artifact'),
    migrationPrepare: () => call('native_migration_prepare'),
    onProgress: (fn) => listen('qs://progress', fn),
    onDrag: (fn) => listen('qs://drag', fn),
    onIngested: (fn) => listen('qs://ingested', fn),
  };
}
