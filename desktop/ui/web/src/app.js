// Quiz Studio V2 desktop entry (Tauri + WebView2). Canonical data lives behind the Rust Store Port - never in browser-origin
// storage - native file flows are Rust-owned, and everything runs offline. This file only binds the host (status, recovery
// screen, native adapters, the ui_ready report); every product view lives in ui/ and runs over the product services.
import { createStorePort, tauriTransport, StorePortError } from './store-port.js';
import { startProduct } from './ui/shell.js';
import { tauriNative } from './native.js';
import { runWebviewSelfCheck } from './practice/webview-selfcheck.js';
import { defineStrings, detectLocale, setLocale, t } from './i18n.js';
import { confirmDialog, fill, h } from './ui/kit.js';

defineStrings({
  'boot.failedTitle': ['Quiz Studio could not start', 'Quiz Studio 无法启动'],
  'boot.recoveryTitle': ['The data store could not be opened', '无法打开数据存储'],
  'boot.recoveryLede': ['Nothing was changed or deleted. You can restore a snapshot; the damaged file is kept aside so it can be inspected later.', '没有任何内容被改动或删除。你可以恢复一个快照；损坏的文件会被单独保留，以便之后检查。'],
  'boot.snapshots': ['Snapshots', '快照'],
  'boot.noSnapshots': ['No snapshots are available.', '没有可用的快照。'],
  'boot.restoreTitle': ['Restore this snapshot?', '恢复这个快照？'],
  'boot.restoreBody': ['Use {name} as the current database. The damaged file is preserved in the recovery-artifacts folder.', '把 {name} 作为当前数据库。损坏的文件会保留在 recovery-artifacts 文件夹中。'],
  'boot.restore': ['Restore', '恢复'],
  'boot.restoredStill': ['Restored, but the store still failed to open.', '已恢复，但数据存储仍然无法打开。'],
  'boot.unavailable': ['Store unavailable', '数据存储不可用'],
  'boot.error': ['Error', '错误'],
});

const tauri = globalThis.__TAURI__;
const invoke = (name, args = {}) => tauri.core.invoke(name, args);
const $ = (sel) => document.querySelector(sel);
const describe = (e) => (e instanceof StorePortError ? `${e.code}: ${e.message.replace(/^[A-Z_]+: /, '')}` : String(e?.message ?? e));

function setHealth(ok, text) {
  const chip = $('#healthChip');
  chip.textContent = text;
  chip.className = `chip ${ok ? 'ok' : 'bad'}`;
}

// ------------------------------------------------------------------------------------- sidebar width (Desktop Foundation)
async function readSetting(port, key) {
  const rec = (await port.read('setting', { id: key }))[0];
  return rec ? { value: rec.payload.value, rev: rec.rev } : null;
}
async function writeSetting(port, key, value) {
  const cur = await readSetting(port, key);
  await port.commit({
    preconditions: [cur ? { kind: 'rev', collection: 'setting', id: key, equals: cur.rev } : { kind: 'absent', collection: 'setting', id: key }],
    ops: [{ op: 'put', collection: 'setting', id: key, payload: { key, value } }],
  });
}

function setupResizer(port) {
  const handle = $('#resizer');
  const root = document.documentElement;
  const clamp = (w) => Math.max(200, Math.min(420, w));
  let width = 252;
  const apply = (w) => {
    width = clamp(w);
    root.style.setProperty('--side-w', `${width}px`);
  };
  handle.addEventListener('pointerdown', (e) => {
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('active');
    const move = (ev) => apply(ev.clientX + 4);
    const up = async () => {
      handle.classList.remove('active');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      try {
        await writeSetting(port, 'ui.sidebarWidth', width);
      } catch {
        /* a failed preference write must never disturb the UI */
      }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') apply(width - 12);
    if (e.key === 'ArrowRight') apply(width + 12);
    if (e.key === 'Enter') writeSetting(port, 'ui.sidebarWidth', width).catch(() => {});
  });
  return apply;
}

// ---------------------------------------------------------------------------------------------------------- recovery
function renderRecovery(status) {
  setHealth(false, t('boot.unavailable'));
  const main = $('#main');
  fill(main,
    h('h1', {}, t('boot.recoveryTitle')),
    h('p', { class: 'lede' }, t('boot.recoveryLede')),
    h('div', { class: 'error-box', role: 'alert' }, status.error ? `${status.error.code}: ${status.error.message}` : 'Unknown error'),
    h('section', { class: 'card' }, h('h2', {}, t('boot.snapshots')),
      status.snapshots.length === 0 ? h('p', {}, t('boot.noSnapshots')) : h('div', { class: 'row' },
        status.snapshots.map((s) => h('button', { class: 'btn', type: 'button', disabled: !s.looksValid, onclick: async () => {
          if (!(await confirmDialog({ title: t('boot.restoreTitle'), body: t('boot.restoreBody', { name: s.name }), okLabel: t('boot.restore') }))) return;
          const r = await invoke('recovery_restore_snapshot', { name: s.name });
          if (r.ok && r.result.status.status === 'ready') location.reload();
          else main.append(h('div', { class: 'error-box', role: 'alert' }, r.ok ? t('boot.restoredStill') : `${r.error.code}: ${r.error.message}`));
        } }, s.name)))));
}

// -------------------------------------------------------------------------------------------------------------- boot
async function boot() {
  setLocale(detectLocale(globalThis.navigator?.language));
  const status = await invoke('app_status');
  $('#brandVersion').textContent = `v${status.identity.appVersion}`;
  if (status.status !== 'ready') return renderRecovery(status);

  const port = createStorePort(tauriTransport(tauri));
  const info = await port.schemaInfo();
  setupResizer(port)((await readSetting(port, 'ui.sidebarWidth'))?.value ?? 252);
  const launches = (await readSetting(port, 'app.launchCount'))?.value ?? 0;
  await writeSetting(port, 'app.launchCount', launches + 1);
  setHealth(info.startup.healthy, info.startup.healthy ? t('nav.storeHealthy') : t('nav.storeAttention'));

  await startProduct({ port, native: tauriNative(tauri), about: { version: status.identity.appVersion }, onHealth: setHealth });
  await invoke('ui_ready', { info: { healthy: info.startup.healthy, collections: info.collections.length, launchCount: launches + 1, storeSchema: info.store.userVersion, selfCheck: runWebviewSelfCheck() } });
}

boot().catch((e) => {
  fill($('#main'), h('h1', {}, t('boot.failedTitle')), h('div', { class: 'error-box', role: 'alert' }, describe(e)));
  setHealth(false, t('boot.error'));
});
