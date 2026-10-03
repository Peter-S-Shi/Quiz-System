// Attach a DevTools client to the REAL packaged app: WebView2 honors WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, so the shipped
// `quiz-studio.exe` can be started with a remote-debugging port on loopback and driven (evaluate, trusted input, console and
// CSP violations) exactly like the browser self-tests - but now inside the real WebView2, under the real CSP, over the real
// Tauri IPC and the real Rust store. This is a TEST aid; nothing in the shipped app opens a debugging port by itself.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} args
 * @param {string} args.exe path to quiz-studio.exe
 * @param {string} args.localAppData an isolated LOCALAPPDATA (the app's data root lives under it)
 * @param {number} [args.debugPort]
 */
export async function launchPackaged({ exe, localAppData, debugPort = 20000 + Math.floor(Math.random() * 30000), timeoutMs = 180000 }) {
  const env = { ...process.env, LOCALAPPDATA: localAppData, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort} --remote-allow-origins=*`, WEBVIEW2_USER_DATA_FOLDER: fs.mkdtempSync(path.join(os.tmpdir(), 'qs-wv2-')) };
  // on a CI runner only: a stray instance from an earlier step would make this launch exit through the single-instance guard
  if (process.env.CI) { spawnSync('taskkill', ['/F', '/IM', 'quiz-studio.exe'], { stdio: 'ignore' }); await sleep(1000); }
  const child = spawn(exe, [], { env, stdio: 'ignore', detached: false });
  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });
  let page = null;
  let lastError = '';
  const deadline = Date.now() + timeoutMs;
  while (!page && Date.now() < deadline && !exited) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      page = list.find((t) => t.type === 'page' && /tauri|localhost|127\.0\.0\.1/.test(t.url)) ?? list.find((t) => t.type === 'page') ?? null;
      if (!page) lastError = `DevTools answered but lists no page: ${JSON.stringify(list.map((t) => [t.type, t.url]))}`;
    } catch (e) { lastError = String(e?.cause?.code ?? e?.message ?? e); /* the app is still starting */ }
  }
  if (!page) {
    const boot = path.join(localAppData, 'io.github.peter-s-shi.quiz-studio', 'logs', 'boot-status.json');
    const bootText = fs.existsSync(boot) ? fs.readFileSync(boot, 'utf8').slice(0, 600) : '(no boot-status.json)';
    const detail = `port ${debugPort}; app exited: ${exited ? JSON.stringify(exited) : 'no (still running)'}; last probe: ${lastError || '(none)'}; boot status: ${bootText}`;
    child.kill();
    throw new Error(`the packaged app did not expose a DevTools page - ${detail}`);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result); } else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  const api = {
    send, events, child, url: page.url,
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
    insertText: (text) => send('Input.insertText', { text }),
    setComposition: (text) => send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length }),
    async key(key, { code = key, vk = 0, modifiers = 0, text } = {}) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
    },
    /** Console errors, uncaught exceptions and CSP violations seen so far. */
    problems() {
      const out = [];
      for (const e of events) {
        if (e.method === 'Runtime.exceptionThrown') out.push(`exception: ${e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text}`);
        if (e.method === 'Log.entryAdded' && (e.params.entry.level === 'error' || /Content Security Policy|violat/i.test(e.params.entry.text))) out.push(`${e.params.entry.source}: ${e.params.entry.text}`);
        if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') out.push(`console.error: ${(e.params.args ?? []).map((a) => a.value ?? a.description).join(' ')}`);
      }
      return out;
    },
    async screenshot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    sleep,
    async close() {
      try { ws.close(); } catch { /* ignore */ }
      child.kill();
      await sleep(400);
      // WebView2 child processes exit with the host; make sure none keeps the isolated profile busy
      spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
      await sleep(300);
    },
  };
  return api;
}
