// A minimal Chrome DevTools Protocol client for the Focused Practice self-test: launches a headless Chromium-family
// browser (Microsoft Edge on the Windows runner - the same engine WebView2 embeds), serves desktop/ui, and exposes
// trusted-input primitives (Input.insertText, Input.imeSetComposition, Input.dispatchKeyEvent). No dependencies: Node's
// built-in WebSocket and fetch.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve } from './serve.mjs';

const CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);

export function findBrowser() {
  const found = CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error('no Chromium-family browser found (set EDGE_PATH)');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ width = 1100, height = 800, store = null } = {}) {
  // `store`: { port } - a Store Port client (see tests/integration/bridge.mjs) exposed to the page at POST /port
  const onPort = store ? async (command, args) => {
    try { return { ok: true, result: await store.port.call(command, args) }; } catch (e) { return { ok: false, error: { code: e.code ?? 'TRANSPORT', message: String(e.message) } }; }
  } : undefined;
  const { server, port } = await serve(0, { onPort });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-selftest-'));
  const exe = findBrowser();
  const child = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  let dev = null;
  for (let i = 0; i < 100 && !dev; i += 1) {
    await sleep(100);
    const f = path.join(profile, 'DevToolsActivePort');
    // the browser may still hold the file open while writing it (EBUSY on Windows): retry on the next tick
    try { if (fs.existsSync(f)) dev = fs.readFileSync(f, 'utf8').split('\n')[0].trim() || null; } catch { dev = null; }
  }
  if (!dev) { child.kill(); throw new Error('the browser did not expose a DevTools port'); }
  const targets = await (await fetch(`http://127.0.0.1:${dev}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); if (msg.error) reject(new Error(`${msg.error.message}`)); else resolve(msg.result); } else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  // robustness aid: QS_CPU_THROTTLE=4 runs the page 4x slower, to expose timing assumptions a slow CI runner would hit
  if (Number(process.env.QS_CPU_THROTTLE) > 1) await send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.QS_CPU_THROTTLE) });

  const api = {
    base: `http://127.0.0.1:${port}`,
    send,
    events,
    async goto(rel) {
      await send('Page.navigate', { url: `http://127.0.0.1:${port}${rel}` });
      for (let i = 0; i < 100; i += 1) { await sleep(50); if ((await api.eval('document.readyState')) === 'complete' && String(await api.eval('document.title')).endsWith('-ready')) return; }
      throw new Error('page did not become ready');
    },
    /** Evaluate in the page (top-level await allowed); returns the JSON-serializable value. */
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression: `(async () => (${expression}))()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
    async exec(statements) {
      const r = await send('Runtime.evaluate', { expression: `(async () => { ${statements} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
    /** TRUSTED text insertion: the user agent reports a committed insertion with no keydown and no composition events. */
    insertText: (text) => send('Input.insertText', { text }),
    /** TRUSTED IME composition (compositionstart/update; commit it with insertText or `commitComposition`). */
    setComposition: (text) => send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length }),
    async key(key, { code = key, vk = 0, modifiers = 0, text } = {}) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
    },
    /** Save a PNG screenshot of the page (developer aid and failure evidence). */
    async screenshot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    resize: (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }),
    sleep,
    async close() {
      try { ws.close(); } catch { /* ignore */ }
      child.kill();
      server.close();
      await sleep(200);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold the profile */ }
    },
  };
  return api;
}

export const KEYS = {
  Tab: { vk: 9 }, Enter: { vk: 13, text: '\r' }, Escape: { vk: 27 }, Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  ArrowDown: { vk: 40 }, ArrowUp: { vk: 38 }, ArrowRight: { vk: 39 }, ArrowLeft: { vk: 37 },
};
