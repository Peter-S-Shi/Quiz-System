// H7 control: type the same Pinyin keystrokes into the SAME harness textarea in Edge (CDP-attached), to tell
// "WebView2 drops composition events" apart from "this IME inserts without composition events".
// usage: node h7-ime-edge.mjs <out.json> [phrases=20] [edgePath]
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const out = process.argv[2];
const n = Number(process.argv[3] || 20);
const edge = process.argv[4] || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const uiDir = fileURLToPath(new URL("../app/ui/", import.meta.url));
const psHelper = fileURLToPath(new URL("./h7-ime-sendkeys.ps1", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };
const srv = createServer((req, res) => {
  const f = join(uiDir, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[extname(f)] || "text/plain" }); res.end(body);
}).listen(0, "127.0.0.1");
await new Promise((r) => srv.once("listening", r));
const port = srv.address().port;
const prof = mkdtempSync(join(tmpdir(), "qs-imebase-"));
const dbg = 9445;
const proc = spawn(edge, [`--remote-debugging-port=${dbg}`, `--user-data-dir=${prof}`, "--no-first-run", "--no-default-browser-check", "--window-size=1000,720", `http://127.0.0.1:${port}/index.html`], { stdio: "ignore" });
let tab;
for (let i = 0; i < 60 && !tab; i++) { await new Promise((r) => setTimeout(r, 500)); try { tab = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === "page" && t.url.includes(`:${port}`)); } catch {} }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0;
const call = (method, params = {}) => new Promise((resolve) => { const i = ++id; const h = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", h); resolve(d); } }; ws.addEventListener("message", h); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.result.value; };
await call("Page.bringToFront");
for (let i = 0; i < 40 && !(await evalJs("!!window.__scenarios")); i++) await new Promise((r) => setTimeout(r, 250));
await evalJs(`document.getElementById("imebox").value=""; document.getElementById("imebox").focus(); window.__imeLog.length=0; 1`);
const ps = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psHelper, "-ProcessId", String(proc.pid), "-Phrases", String(n)], { encoding: "utf8" });
const sendInfo = ps.stdout.trim();
await new Promise((r) => setTimeout(r, 1500));
const res = await evalJs(`(() => { const l = window.__imeLog; return { phrasesRequested: ${n}, compositionStarts: l.filter(e=>e.t==="compositionstart").length, compositionUpdates: l.filter(e=>e.t==="compositionupdate").length, compositionEnds: l.filter(e=>e.t==="compositionend").length, inputEvents: l.filter(e=>e.t==="input").length, composingInputEvents: l.filter(e=>e.t==="input" && e.isComposing).length, textareaLength: document.getElementById("imebox").value.length, sample: l.slice(0,6) }; })()`);
const browser = (await (await fetch(`http://127.0.0.1:${dbg}/json/version`)).json()).Browser;
writeFileSync(out, JSON.stringify({ browser, send: sendInfo, ...res }, null, 1));
console.log(JSON.stringify({ browser, send: sendInfo, ...res, sample: undefined }));
try { ws.close(); } catch {}
spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"]);
srv.close();
