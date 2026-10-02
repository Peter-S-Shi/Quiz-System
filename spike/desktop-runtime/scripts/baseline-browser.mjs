// H7 reference baseline: run the SAME harness scenarios in Edge (same Chromium major as the WebView2 runtime) via CDP.
// usage: node baseline-browser.mjs <out.json> [edgePath]
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

const out = process.argv[2];
const edge = process.argv[3] || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
import { fileURLToPath } from "node:url";
const uiDir = fileURLToPath(new URL("../app/ui/", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };
const srv = createServer((req, res) => {
  const f = join(uiDir, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[extname(f)] || "text/plain" }); res.end(body);
}).listen(0, "127.0.0.1");
await new Promise((r) => srv.once("listening", r));
const port = srv.address().port;
const prof = mkdtempSync(join(tmpdir(), "qs-baseline-"));
const dbg = 9444;
const proc = spawn(edge, [`--remote-debugging-port=${dbg}`, `--user-data-dir=${prof}`, "--no-first-run", "--no-default-browser-check", "--window-size=1000,720", `http://127.0.0.1:${port}/index.html`], { stdio: "ignore" });
let tab;
for (let i = 0; i < 60 && !tab; i++) { await new Promise((r) => setTimeout(r, 500)); try { tab = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === "page" && t.url.includes(`:${port}`)); } catch {} }
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0;
const call = (method, params = {}) => new Promise((resolve) => { const i = ++id; const h = (e) => { const d = JSON.parse(e.data); if (d.id === i) { ws.removeEventListener("message", h); resolve(d); } }; ws.addEventListener("message", h); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
await call("Page.bringToFront");
for (let i = 0; i < 40 && !(await evalJs("!!window.__scenarios")); i++) await new Promise((r) => setTimeout(r, 250));
const result = { browser: (await (await fetch(`http://127.0.0.1:${dbg}/json/version`)).json()).Browser };
result.h7unicode = await evalJs("window.__scenarios.h7unicode()");
result.h7long = await evalJs("window.__scenarios.h7long({chars:20000})");
// resize/fullscreen baseline via CDP window bounds (same cycle plan as the Tauri harness)
const { windowId } = (await call("Browser.getWindowForTarget")).result;
const sizes = [[800, 600], [1100, 780], [640, 480], [1000, 720]];
await evalJs(`(() => { window.__st = { counter: 0, typed: "", blur: 0, resize: 0 }; const t = document.getElementById("typebox"); t.focus(); t.addEventListener("blur", () => window.__st.blur++); addEventListener("resize", () => window.__st.resize++); return 1; })()`);
let breaks = 0, fsToggles = 0, onFs = false;
for (let i = 0; i < 200; i++) {
  await evalJs(`(() => { const s = window.__st; s.counter++; s.typed += String.fromCodePoint(0x4e00 + (${i} % 50)); document.getElementById("typebox").value = s.typed; return 1; })()`);
  if (i % 5 === 4) { onFs = !onFs; fsToggles++; await call("Browser.setWindowBounds", { windowId, bounds: { windowState: onFs ? "fullscreen" : "normal" } }); }
  else { const [w, h] = sizes[i % sizes.length]; await call("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } }); await call("Browser.setWindowBounds", { windowId, bounds: { width: w, height: h } }); }
  await new Promise((r) => setTimeout(r, 40));
  const ok = await evalJs(`(() => { const s = window.__st; return document.getElementById("typebox").value === s.typed && s.counter === ${i + 1}; })()`);
  if (!ok) breaks++;
}
await call("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
result.h7resize = { cycles: 200, fullscreenToggles: fsToggles, stateBreaks: breaks, ...(await evalJs("window.__st")) };
writeFileSync(out, JSON.stringify(result, null, 1));
proc.kill(); srv.close();
console.log("baseline done");
process.exit(0);
