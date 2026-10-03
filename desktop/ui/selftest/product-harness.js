// The REAL product (shell + every view + services) over the REAL Rust store, in a browser engine. Only the Tauri IPC and
// the native dialogs are replaced: the Store Port transport posts to the self-test server (-> qs-scenario port-serve), and
// the native flows are a scripted stub (`window.__native`) so a test can "choose a file" and read what was "saved".
import { createStorePort } from '../web/src/store-port.js';
import { startProduct } from '../web/src/ui/shell.js';
import { fixedClock, systemClock } from '../web/src/orchestration/dates.js';
import { setLocale, missingKeys, definedKeys } from '../web/src/i18n.js';

const transport = async (command, args) => (await fetch('/port', { method: 'POST', body: JSON.stringify({ command, args }) })).json();
const port = createStorePort(transport);
const q = new URLSearchParams(location.search);
const today = q.get('today');
const clock = today ? fixedClock(today) : systemClock();
if (q.get('lang')) setLocale(q.get('lang'));

const stub = { queue: { importText: [], pickMedia: [], backupPick: [], migrationPrepare: [] }, exports: [], calls: [], listeners: {} };
const next = (name) => { stub.calls.push(name); return stub.queue[name]?.length ? stub.queue[name].shift() : null; };
const native = {
  pickMedia: async () => next('pickMedia'),
  exportText: async (name, text) => { stub.exports.push({ name, text }); return { name, bytes: text.length }; },
  importText: async () => next('importText'),
  backupSave: async () => { stub.calls.push('backupSave'); return { bytes: 1234, mediaCount: 0, sha256: 'ab'.repeat(32) }; },
  backupPick: async () => next('backupPick'),
  backupRestore: async () => { stub.calls.push('backupRestore'); return { mediaAdded: 0 }; },
  migrationArtifact: async () => next('migrationArtifact'),
  migrationPrepare: async () => next('migrationPrepare'),
  onProgress: (fn) => { stub.listeners.progress = fn; return () => {}; },
  onDrag: (fn) => { stub.listeners.drag = fn; return () => {}; },
  onIngested: (fn) => { stub.listeners.ingested = fn; return () => {}; },
};
window.__native = stub;
const chip = (ok, text) => { const c = document.getElementById('healthChip'); c.textContent = text; c.className = `chip ${ok ? 'ok' : 'bad'}`; };
chip(true, 'Store healthy');
const started = await startProduct({ port, native, clock, onHealth: chip });
window.product = started;
window.i18n = { missingKeys, definedKeys };
document.title = 'product-ready';
