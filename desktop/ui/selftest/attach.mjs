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
  const udf = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-wv2-'));
  const env = { ...process.env, LOCALAPPDATA: localAppData, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort} --remote-allow-origins=*`, WEBVIEW2_USER_DATA_FOLDER: udf };
  // on a CI runner only: a stray instance from an earlier step would make this launch exit through the single-instance guard
  if (process.env.CI) { spawnSync('taskkill', ['/F', '/IM', 'quiz-studio.exe'], { stdio: 'ignore' }); await sleep(1000); }
  // WebView2 also reads the per-app AdditionalBrowserArguments policy; the runner's runtime ignored the environment variable
  // (its command line showed no debugging flag), so the policy is the reliable route. HKCU only, removed again on close.
  const policyKey = ['HKCU', 'Software', 'Policies', 'Microsoft', 'Edge', 'WebView2', 'AdditionalBrowserArguments'].join('\\');
  const exeName = path.basename(exe);
  const useRegistry = Boolean(process.env.CI) || process.env.QS_ATTACH_REGISTRY === '1';
  if (useRegistry) spawnSync('reg', ['add', policyKey, '/v', exeName, '/t', 'REG_SZ', '/d', `--remote-debugging-port=${debugPort} --remote-allow-origins=*`, '/f'], { stdio: 'ignore' });
  if (process.env.QS_ATTACH_REGISTRY === '1') delete env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
  const dropPolicy = () => { if (useRegistry) spawnSync('reg', ['delete', policyKey, '/v', exeName, '/f'], { stdio: 'ignore' }); };
  const child = spawn(exe, [], { env, stdio: 'ignore', detached: false });
  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });
  // Chromium records the port it really listens on in DevToolsActivePort inside the profile; find it wherever the runtime put the profile
  const findActivePort = (dir, depth = 0) => {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isFile() && e.name === 'DevToolsActivePort') { const n = Number(fs.readFileSync(path.join(dir, e.name), 'utf8').split(/\r?\n/)[0]); if (n > 0) return n; }
        if (e.isDirectory() && depth < 3) { const n = findActivePort(path.join(dir, e.name), depth + 1); if (n) return n; }
      }
    } catch { /* not there yet */ }
    return 0;
  };
  let page = null;
  let lastError = '';
  let usedBase = '';
  const deadline = Date.now() + timeoutMs;
  while (!page && Date.now() < deadline && !exited) {
    await sleep(250);
    const ports = [...new Set([debugPort, findActivePort(udf), findActivePort(localAppData)].filter(Boolean))];
    for (const port of ports) {
      for (const host of ['127.0.0.1', '[::1]', 'localhost']) {
        try {
          const list = await (await fetch(`http://${host}:${port}/json/list`)).json();
          page = list.find((t) => t.type === 'page' && /tauri|localhost|127\.0\.0\.1/.test(t.url)) ?? list.find((t) => t.type === 'page') ?? null;
          if (page) { usedBase = `${host}:${port}`; break; }
          lastError = `DevTools answered on ${host}:${port} but lists no page: ${JSON.stringify(list.map((t) => [t.type, t.url]))}`;
        } catch (e) { lastError = `${host}:${port} ${String(e?.cause?.code ?? e?.message ?? e)}`; /* the app is still starting */ }
      }
      if (page) break;
    }
  }
  if (!page) {
    const boot = path.join(localAppData, 'io.github.peter-s-shi.quiz-studio', 'logs', 'boot-status.json');
    const bootText = fs.existsSync(boot) ? fs.readFileSync(boot, 'utf8').slice(0, 300) : '(no boot-status.json)';
    const net = spawnSync('powershell', ['-NoProfile', '-Command', "Get-Process quiz-studio,msedgewebview2 -ErrorAction SilentlyContinue | ForEach-Object { $p = $_; (Get-NetTCPConnection -OwningProcess $p.Id -State Listen -ErrorAction SilentlyContinue | ForEach-Object { \"$($p.ProcessName):$($_.LocalAddress):$($_.LocalPort)\" }) }; Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Select-Object -First 2 | ForEach-Object { $_.CommandLine.Substring(0, [Math]::Min(700, $_.CommandLine.Length)) }"], { encoding: 'utf8', timeout: 20000 });
    const detail = `port ${debugPort}; app exited: ${exited ? JSON.stringify(exited) : 'no (still running)'}; last probe: ${lastError || '(none)'}; active-port file: ${findActivePort(udf) || findActivePort(localAppData) || 'none'}; listeners/webview command lines: ${(net.stdout || net.stderr || '').replace(/\s+/g, ' ').slice(0, 1600)}; boot status: ${bootText}`;
    child.kill();
    dropPolicy();
    throw new Error(`the packaged app did not expose a DevTools page - ${detail}`);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, `ws://${usedBase}`));
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
      dropPolicy();
      await sleep(400);
      // WebView2 child processes exit with the host; make sure none keeps the isolated profile busy
      spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
      await sleep(300);
    },
  };
  return api;
}
