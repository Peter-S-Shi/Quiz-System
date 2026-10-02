// Quiz Studio V2 desktop shell - just enough formal UI to prove the Desktop Foundation works:
// canonical data lives behind the Rust Store Port (never in browser-origin storage), native file flows are
// Rust-owned, and everything runs offline. Product views arrive with later milestones.
import { createStorePort, tauriTransport, StorePortError } from './store-port.js';

const tauri = globalThis.__TAURI__;
const invoke = (name, args = {}) => tauri.core.invoke(name, args);
const $ = (sel) => document.querySelector(sel);

/** Build DOM with text nodes only (file names and stored values are untrusted). */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

const fmtBytes = (n) => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(2)} GiB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MiB` : n >= 1 << 10 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`);
const describe = (e) => (e instanceof StorePortError ? `${e.code}: ${e.message.replace(/^[A-Z_]+: /, '')}` : String(e?.message ?? e));

let port;
let info;

// ----------------------------------------------------------------------------- settings (Rust-owned)
async function readSetting(key) {
  const rec = (await port.read('setting', { id: key }))[0];
  return rec ? { value: rec.payload.value, rev: rec.rev } : null;
}
async function writeSetting(key, value) {
  const cur = await readSetting(key);
  await port.commit({
    preconditions: [cur ? { kind: 'rev', collection: 'setting', id: key, equals: cur.rev } : { kind: 'absent', collection: 'setting', id: key }],
    ops: [{ op: 'put', collection: 'setting', id: key, payload: { key, value } }],
  });
}

// ------------------------------------------------------------------------------------------- shell
const PLACEHOLDERS = {
  today: 'Today',
  calendar: 'Calendar',
  library: 'Library',
  history: 'History',
  review: 'Review',
  exchange: 'Exchange',
};

function showView(name) {
  for (const b of document.querySelectorAll('#nav button')) b.toggleAttribute('aria-current', b.dataset.view === name);
  const main = $('#main');
  main.replaceChildren();
  if (name === 'settings') return renderSystem(main);
  main.append(
    h('h1', {}, PLACEHOLDERS[name]),
    h('p', { class: 'lede' }, 'This view arrives with a later V2 milestone. The Desktop Foundation milestone only establishes the runtime, the data boundary and the shell.'),
    h('div', { class: 'card placeholder' }, 'Not part of the Desktop Foundation scope.'),
  );
}

function setHealth(ok, text) {
  const chip = $('#healthChip');
  chip.textContent = text;
  chip.className = `chip ${ok ? 'ok' : 'bad'}`;
}

function confirmDialog(title, body, okLabel) {
  const dlg = $('#confirmDialog');
  $('#confirmTitle').textContent = title;
  $('#confirmBody').textContent = body;
  $('#confirmOk').textContent = okLabel;
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.returnValue = 'cancel';
    dlg.showModal();
  });
}

// ----------------------------------------------------------------------------------- system view
function renderSystem(main) {
  const out = h('div', { class: 'log', role: 'log', 'aria-live': 'polite' }, 'Ready.');
  const say = (line) => {
    out.textContent = `${line}\n${out.textContent === 'Ready.' ? '' : out.textContent}`;
  };
  const bar = h('i');
  const progress = h('div', { class: 'progress', hidden: true, role: 'progressbar' }, bar);
  const preview = h('img', { class: 'preview', hidden: true, alt: 'Stored media preview' });
  const drop = h('div', { class: 'drop', id: 'dropzone' }, 'Drop a file here to store it (streamed, bounded memory) - or use the button.');
  const guarded = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      say(`${label} failed - ${describe(e)}`);
    }
  };

  const showStored = (r) => {
    say(`Stored "${r.name}" (${fmtBytes(r.size)}) as ${r.hash.slice(0, 12)}...${r.deduplicated ? ' [already present]' : ''}`);
    if (r.mimeType.startsWith('image/') && tauri?.core?.convertFileSrc) {
      preview.src = tauri.core.convertFileSrc(r.absolutePath);
      preview.hidden = false;
    }
  };

  const launch = h('dd', {}, '...');
  const sidebar = h('dd', {}, '...');
  const health = h('dd', {}, '...');
  const snaps = h('dd', {}, '...');
  const refresh = async () => {
    info = await port.schemaInfo();
    health.textContent = info.startup.healthy ? 'Healthy: integrity check and projection consistency passed' : `NOT HEALTHY (${info.startup.consistencyProblems} consistency problem(s)); writes are disabled`;
    setHealth(info.startup.healthy, info.startup.healthy ? 'Store healthy' : 'Store needs attention');
    const list = await port.listSnapshots();
    snaps.textContent = list.length ? `${list.length} snapshot(s); newest: ${list[0].name}` : 'none yet';
    const l = await readSetting('app.launchCount');
    launch.textContent = l ? String(l.value) : '0';
    const w = await readSetting('ui.sidebarWidth');
    sidebar.textContent = w ? `${w.value}px` : 'default';
  };
  refresh().catch((e) => say(describe(e)));

  main.append(
    h('h1', {}, 'Settings - System'),
    h('p', { class: 'lede' }, 'Desktop Foundation. Your data lives in a database owned by the application, outside the web view; nothing canonical is kept in browser storage and nothing here needs the network.'),
    h('section', { class: 'card' }, h('h2', {}, 'Identity'), h('dl', { class: 'kv' },
      h('dt', {}, 'Product'), h('dd', {}, `${info.product} ${info.appVersion}`),
      h('dt', {}, 'Identifier'), h('dd', { class: 'mono' }, info.identifier),
      h('dt', {}, 'Data folder'), h('dd', { class: 'mono' }, info.dataRoot),
      h('dt', {}, 'Store schema'), h('dd', {}, `v${info.store.userVersion} (build supports v${info.store.catalogVersion})`),
      h('dt', {}, 'Collections'), h('dd', {}, info.collections.map((c) => c.name).join(', ')))),
    h('section', { class: 'card' }, h('h2', {}, 'Store health'), h('dl', { class: 'kv' }, h('dt', {}, 'Startup'), health, h('dt', {}, 'Snapshots'), snaps),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => guarded('Consistency check', async () => {
        const r = await port.checkConsistency();
        say(r.quickCheckOk && r.problems.length === 0 ? 'Consistency check: clean (quick_check ok, 0 projection problems).' : `Consistency check: ${r.problems.length} problem(s).`);
      }) }, 'Run consistency check'))),
    h('section', { class: 'card' }, h('h2', {}, 'Preferences (stored in the Rust-owned database)'), h('dl', { class: 'kv' },
      h('dt', {}, 'Launch count'), launch, h('dt', {}, 'Saved sidebar width'), sidebar)),
    h('section', { class: 'card' }, h('h2', {}, 'Media'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => guarded('Add file', async () => {
        const r = await invoke('native_pick_media');
        if (r.ok && r.result) showStored(r.result);
        else if (!r.ok) say(`Add file failed - ${r.error.code}: ${r.error.message}`);
      }) }, 'Add a file...')),
      drop, progress, preview),
    h('section', { class: 'card' }, h('h2', {}, 'Backup and restore'), h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => guarded('Backup', async () => {
        const r = await invoke('native_backup_save');
        if (r.ok && r.result) say(`Backup written: ${fmtBytes(r.result.bytes)}, ${r.result.mediaCount} media file(s), sha256 ${r.result.sha256.slice(0, 12)}...`);
        else if (!r.ok) say(`Backup failed - ${r.error.code}: ${r.error.message}`);
      }) }, 'Create backup...'),
      h('button', { class: 'btn', type: 'button', onclick: () => guarded('Restore', async () => {
        const picked = await invoke('native_backup_pick');
        if (!picked.ok) return say(`Backup refused - ${picked.error.code}: ${picked.error.message}`);
        if (!picked.result) return;
        say(`Verified "${picked.result.name}": ${picked.result.verified.entries} file(s), store schema v${picked.result.verified.storeSchemaVersion}.`);
        const yes = await confirmDialog('Replace current data?', 'Restoring replaces everything in the library with the backup. A snapshot of your current data is kept so this can be undone.', 'Restore');
        if (!yes) return say('Restore cancelled; nothing was changed.');
        const r = await invoke('native_backup_restore_pending');
        say(r.ok ? `Restored. Media added: ${r.result.mediaAdded}. Snapshot kept for rollback.` : `Restore failed - ${r.error.code}: ${r.error.message}`);
        await refresh();
      }) }, 'Restore from backup...'))),
    h('section', { class: 'card' }, h('h2', {}, 'Activity'), out),
  );

  // native events: progress + drag-and-drop (paths never reach JavaScript)
  const listen = tauri.event.listen;
  listen('qs://progress', (e) => {
    const { done, total } = e.payload;
    progress.hidden = false;
    bar.style.width = total ? `${Math.min(100, (100 * done) / total).toFixed(1)}%` : '100%';
    progress.setAttribute('aria-valuenow', total ? String(Math.round((100 * done) / total)) : '100');
  });
  listen('qs://drag', (e) => drop.classList.toggle('over', e.payload.over));
  listen('qs://ingested', (e) => {
    progress.hidden = true;
    const r = e.payload;
    if (r.ok) showStored(r.result);
    else say(`Drop failed - ${r.error.code}: ${r.error.message}`);
  });
}

// ------------------------------------------------------------------------------------- recovery
function renderRecovery(status) {
  setHealth(false, 'Store unavailable');
  const main = $('#main');
  main.replaceChildren(
    h('h1', {}, 'The data store could not be opened'),
    h('p', { class: 'lede' }, 'Nothing was changed or deleted. You can restore a snapshot; the damaged file is kept aside so it can be inspected later.'),
    h('div', { class: 'error-box', role: 'alert' }, status.error ? `${status.error.code}: ${status.error.message}` : 'Unknown error'),
    h('section', { class: 'card' }, h('h2', {}, 'Snapshots'),
      status.snapshots.length === 0 ? h('p', {}, 'No snapshots are available.') : h('div', { class: 'row' },
        status.snapshots.map((s) => h('button', { class: 'btn', type: 'button', disabled: !s.looksValid, onclick: async () => {
          if (!(await confirmDialog('Restore this snapshot?', `Use ${s.name} as the current database. The damaged file is preserved in the recovery-artifacts folder.`, 'Restore'))) return;
          const r = await invoke('recovery_restore_snapshot', { name: s.name });
          if (r.ok && r.result.status.status === 'ready') location.reload();
          else main.append(h('div', { class: 'error-box', role: 'alert' }, r.ok ? 'Restored, but the store still failed to open.' : `${r.error.code}: ${r.error.message}`));
        } }, s.name)))),
  );
}

// ---------------------------------------------------------------------------------------- resize
function setupResizer() {
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
        await writeSetting('ui.sidebarWidth', width);
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
    if (e.key === 'Enter') writeSetting('ui.sidebarWidth', width).catch(() => {});
  });
  return apply;
}

// ------------------------------------------------------------------------------------------- boot
async function boot() {
  const status = await invoke('app_status');
  $('#brandVersion').textContent = `v${status.identity.appVersion}`;
  for (const b of document.querySelectorAll('#nav button')) b.addEventListener('click', () => showView(b.dataset.view));
  if (status.status !== 'ready') return renderRecovery(status);

  port = createStorePort(tauriTransport(tauri));
  info = await port.schemaInfo();
  const applyWidth = setupResizer();
  const w = await readSetting('ui.sidebarWidth');
  if (w) applyWidth(w.value);
  const launches = (await readSetting('app.launchCount'))?.value ?? 0;
  await writeSetting('app.launchCount', launches + 1);
  setHealth(info.startup.healthy, info.startup.healthy ? 'Store healthy' : 'Store needs attention');
  showView('settings');
  await invoke('ui_ready', { info: { healthy: info.startup.healthy, collections: info.collections.length, launchCount: launches + 1, storeSchema: info.store.userVersion } });
}

boot().catch((e) => {
  $('#main').replaceChildren(h('h1', {}, 'Quiz Studio could not start'), h('div', { class: 'error-box', role: 'alert' }, describe(e)));
  setHealth(false, 'Error');
});
