// Disposable spike harness (no product UI). Runs scripted scenarios inside the packaged WebView and
// reports JSON results through the Rust `report_result` command. Synthetic data only.
"use strict";
const T = window.__TAURI__;
const inTauri = !!(T && T.core);
const invoke = inTauri ? T.core.invoke : async () => { throw new Error("not in Tauri"); };
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => { let d = false; const f = () => { if (!d) { d = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); });
const logEl = $("log");
function log(...a) { logEl.textContent += a.join(" ") + "\n"; logEl.scrollTop = logEl.scrollHeight; }
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * p) - 1))] : 0; };

// ---- canonical hash (mirror of core/src/canon.rs) -------------------------------------------------
function canonical(v) {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" || typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
}
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const hashValue = (v) => sha256Hex(canonical(v));

// ---- JS-owned projection extractors (domain semantics live in JS; Rust verifies agreement) -----------
function extract(coll, p) {
  switch (coll) {
    case "learner_response": {
      const items = p.responses.map((r) => (r.itemId === undefined ? null : r.itemId));
      return { paperId: p.material.id, title: p.material.title ?? null, finalizedAt: p.finalizedAt ?? null, itemCount: items.length, items, mediaRefs: p.mediaRefs ?? [] };
    }
    case "teacher_review": return { responseId: p.responseId };
    case "remediation_doc": return { sourceResponseId: p.sourceResponseId, sourceReviewId: p.sourceReviewId ?? null };
    case "history_entry": return { responseId: p.responseId ?? null };
    default: return {};
  }
}
const putOp = (coll, payload) => ({ op: "put", collection: coll, id: payload.id, payload, proj: extract(coll, payload) });

// ---- scenarios ----------------------------------------------------------------------------------------
const results = {};

async function scenarioH1() {
  const info = JSON.parse(await invoke("app_info"));
  const violations = [];
  document.addEventListener("securitypolicyviolation", (e) => violations.push(`${e.violatedDirective}:${e.blockedURI}`));
  const probes = {};
  for (const [name, fn] of Object.entries({
    fetchExternal: () => fetch("https://example.com/", { mode: "no-cors" }),
    fetchHttpLocal: () => fetch("http://127.0.0.1:9/", { mode: "no-cors" }),
    websocket: () => new Promise((res, rej) => { const w = new WebSocket("ws://127.0.0.1:9/"); w.onerror = () => rej(new Error("ws error")); w.onopen = () => res(); }),
    imgExternal: () => new Promise((res, rej) => { const i = new Image(); i.onload = res; i.onerror = () => rej(new Error("img error")); i.src = "https://example.com/x.png"; }),
  })) {
    try { await Promise.race([fn(), sleep(3000).then(() => { throw new Error("TIMEOUT"); })]); probes[name] = "NOT BLOCKED"; } catch (e) { probes[name] = String(e.message).includes("TIMEOUT") ? "timeout(no CSP block, no connection)" : "blocked"; }
  }
  await sleep(50);
  return { info, locationOrigin: location.origin, locationProtocol: location.protocol, outboundProbes: probes, cspViolationsSeen: violations.length, cspViolations: violations.slice(0, 8) };
}

async function readNdjson(path) {
  const text = await invoke("harness_read_text", { path });
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function scenarioH2(args) {
  const recs = await readNdjson(args.ndjson);
  const reviewsByResp = new Map();
  for (const r of recs) if (r.collection === "teacher_review") (reviewsByResp.get(r.payload.responseId) ?? reviewsByResp.set(r.payload.responseId, []).get(r.payload.responseId)).push(r.payload);
  const responses = recs.filter((r) => r.collection === "learner_response");
  const lat = [];
  const t0 = performance.now();
  for (const r of responses) {
    const ops = [putOp("learner_response", r.payload), ...(reviewsByResp.get(r.id) ?? []).map((p) => putOp("teacher_review", p))];
    const t = performance.now();
    await invoke("store_commit", { uow: JSON.stringify({ ops }) });
    lat.push(performance.now() - t);
  }
  const ingestSec = (performance.now() - t0) / 1000;
  // fidelity via IPC round trip, JS canonical hash
  let equal = 0, total = 0; const diffs = [];
  const chunk = 64;
  for (let i = 0; i < recs.length; i += chunk) {
    await Promise.all(recs.slice(i, i + chunk).map(async (r) => {
      const back = JSON.parse(await invoke("store_get_payload", { collection: r.collection, id: r.id }));
      total++;
      if ((await hashValue(back)) === (await hashValue(r.payload))) equal++; else diffs.push(r.id);
    }));
  }
  // History list end-to-end incl. IPC
  const hist = [];
  let rows = 0;
  for (let i = 0; i < 60; i++) {
    const t = performance.now();
    const out = JSON.parse(await invoke("history_list", { limit: 100000 }));
    hist.push(performance.now() - t); rows = out.length;
  }
  const page = [];
  for (let i = 0; i < 100; i++) { const t = performance.now(); JSON.parse(await invoke("history_list", { limit: 50 })); page.push(performance.now() - t); }
  const info = JSON.parse(await invoke("store_info", { deep: true }));
  return {
    responses: responses.length, uowCommits: lat.length, ingestSeconds: ingestSec,
    commitIpc: { p50ms: pct(lat, 0.5), p95ms: pct(lat, 0.95), p99ms: pct(lat, 0.99), maxMs: Math.max(...lat) },
    fidelityViaIpc: { records: total, jsHashEqual: equal, diffs: diffs.slice(0, 5) },
    historyFullList: { rows, iters: hist.length, p50ms: pct(hist, 0.5), p95ms: pct(hist, 0.95), maxMs: Math.max(...hist) },
    historyPage50: { p50ms: pct(page, 0.5), p95ms: pct(page, 0.95) },
    store: info,
  };
}

async function scenarioH4(args) {
  const out = {};
  if (args.envelope) {
    const t = performance.now();
    out.ingest = JSON.parse(await invoke("media_ingest_envelope", { path: args.envelope }));
    out.ingestWallMs = performance.now() - t;
    out.jsHeapMiBAfterIngest = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
  }
  await invoke("media_make_samples");
  const cs = T.core.convertFileSrc;
  const imgPath = await invoke("media_asset_path", { id: "img-sample" });
  const audPath = await invoke("media_asset_path", { id: "aud-sample" });
  const img = $("img"); const aud = $("aud");
  out.imageUrl = cs(imgPath).replace(/[A-Za-z]:.*$/, "<path>");
  out.fetchImage = await fetch(cs(imgPath)).then(async (r) => ({ status: r.status, type: r.headers.get("content-type"), bytes: (await r.arrayBuffer()).byteLength })).catch((e) => ({ error: String(e) }));
  out.imageRender = await new Promise((res) => { img.onload = () => res({ ok: true, w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => res({ ok: false }); img.src = cs(imgPath); });
  aud.src = cs(audPath);
  out.audio = await new Promise((res) => {
    const r = { ok: false };
    aud.onerror = () => res({ ok: false, error: aud.error && aud.error.code });
    aud.onloadedmetadata = async () => {
      r.duration = aud.duration;
      aud.currentTime = 45;
      await sleep(300);
      r.seekTo = 45; r.currentTimeAfterSeek = aud.currentTime; r.seekable = aud.seekable.length ? aud.seekable.end(0) : 0;
      aud.currentTime = 10; await sleep(200); r.currentTimeAfterSecondSeek = aud.currentTime;
      r.ok = Math.abs(r.currentTimeAfterSeek - 45) < 1 && r.duration > 59;
      res(r);
    };
  });
  // out-of-scope read through the asset protocol must fail (DB file lives outside the media scope)
  const dbp = await invoke("harness_db_path");
  out.outOfScopeAsset = await fetch(cs(dbp)).then((r) => ({ status: r.status, blocked: !r.ok })).catch(() => ({ status: 0, blocked: true }));
  out.traversalAsset = await fetch(cs(audPath + "/../../quiz-studio.db")).then((r) => ({ status: r.status, blocked: !r.ok })).catch(() => ({ status: 0, blocked: true }));
  return out;
}

async function scenarioH7Unicode() {
  const fx = await (await fetch("unicode-fixtures.json")).json();
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const rows = fx.map((f) => { const got = [...seg.segment(f.s)].length; return { name: f.name, expected: f.g, got, ok: got === f.g, nfcLen: f.s.normalize("NFC").length, nfdLen: f.s.normalize("NFD").length, nfcGraphemes: [...seg.segment(f.s.normalize("NFC"))].length }; });
  return { ua: navigator.userAgent, fixtures: rows.length, pass: rows.filter((r) => r.ok).length, failures: rows.filter((r) => !r.ok), rows };
}

function buildPassage(n) {
  // CJK words are written as escapes so the file stays ASCII-safe
  const words = ["quiet", "morning", "learning", "语言", "练习", "reading", "careful", "ink", "paper", "日本語", "memory", "slow", "steady", "写作", "garden", "echo"];
  let s = "", i = 0;
  while (s.length < n) { s += words[i % words.length] + (i % 11 === 10 ? ".\n" : " "); i++; }
  return s.slice(0, n);
}

async function scenarioH7Long(args) {
  const N = args.chars || 20000;
  const pane = $("pane"), typebox = $("typebox");
  const text = buildPassage(N);
  pane.textContent = "";
  const frag = document.createDocumentFragment();
  const words = [];
  for (const m of text.matchAll(/[^\s]+\s*/g)) { const sp = document.createElement("span"); sp.textContent = m[0]; frag.appendChild(sp); words.push({ sp, len: m[0].length }); }
  pane.appendChild(frag);
  typebox.focus();
  let focusLoss = 0; typebox.addEventListener("blur", () => focusLoss++);
  const lineH = parseFloat(getComputedStyle(pane).lineHeight);
  let notVisible = 0, jumps = 0, maxDelta = 0, prevTop = pane.scrollTop, steps = 0, notFocused = 0, scrolls = 0;
  const frames = []; let last = performance.now(); const range = document.createRange(); let prevWord = null;
  for (const w of words) {
    const node = w.sp.firstChild;
    if (prevWord) prevWord.classList.remove("cur");
    w.sp.classList.add("cur"); prevWord = w.sp;
    for (let c = 0; c < w.len; c++) { // caret advances one UTF-16 unit at a time (programmatic typing)
      range.setStart(node, c); range.setEnd(node, Math.min(c + 1, w.len));
      let r = range.getBoundingClientRect(); let pr = pane.getBoundingClientRect();
      if (r.bottom > pr.bottom - lineH * 0.5 || r.top < pr.top + lineH * 0.5) { pane.scrollTop += r.bottom - (pr.bottom - lineH * 1.0); scrolls++; r = range.getBoundingClientRect(); pr = pane.getBoundingClientRect(); }
      if (!(r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1)) notVisible++;
      const delta = Math.abs(pane.scrollTop - prevTop); maxDelta = Math.max(maxDelta, delta);
      if (delta > lineH * 1.6) jumps++;
      prevTop = pane.scrollTop;
      if (document.activeElement !== typebox) notFocused++;
      steps++;
    }
    if (steps % 200 < w.len) { await raf(); const now = performance.now(); frames.push(now - last); last = now; }
  }
  return { chars: N, steps, words: words.length, lineHeightPx: lineH, scrollAdjustments: scrolls, activeNotVisible: notVisible, layoutJumps: jumps, maxScrollDeltaPx: maxDelta, inputBlurEvents: focusLoss, stepsWithoutFocusedInput: notFocused,
    documentHasFocusEnd: document.hasFocus(), finalScrollTop: pane.scrollTop, scrollHeight: pane.scrollHeight, frameGapMsP95: pct(frames, 0.95) };
}

async function scenarioH7Resize(args) {
  const n = args.cycles || 200;
  const typebox = $("typebox"); typebox.focus();
  // session state that must survive: typed buffer + counter + pane position
  const state = { counter: 0, typed: "", marker: crypto.randomUUID() };
  let blur = 0, resizeEvents = 0, errors = 0, stateBreaks = 0, fsToggles = 0, onFs = false;
  typebox.addEventListener("blur", () => blur++);
  window.addEventListener("resize", () => resizeEvents++);
  const sizes = [[800, 600], [1100, 780], [640, 480], [1000, 720]];
  const t0 = performance.now(); const widths = new Set();
  for (let i = 0; i < n; i++) {
    try {
      state.counter++; state.typed += String.fromCodePoint(0x4e00 + (i % 50)); typebox.value = state.typed;
      const snap = JSON.stringify(state);
      if (i % 5 === 4) { onFs = !onFs; fsToggles++; await invoke("window_op", { op: "fullscreen", on: onFs }); }
      else { const [w, h] = sizes[i % sizes.length]; await invoke("window_op", { op: "size", w, h }); }
      await sleep(40); await raf();
      widths.add(innerWidth);
      if (JSON.stringify(state) !== snap || typebox.value !== state.typed || typebox.selectionEnd !== typebox.value.length && false) stateBreaks++;
    } catch (e) { errors++; }
  }
  if (onFs) await invoke("window_op", { op: "fullscreen", on: false });
  const scale = JSON.parse(await invoke("window_op", { op: "scale" }));
  return { cycles: n, fullscreenToggles: fsToggles, resizeEventsSeen: resizeEvents, distinctInnerWidths: widths.size, errors, stateBreaks, inputBlurEvents: blur, devicePixelRatio: devicePixelRatio, windowScaleFactor: scale.scaleFactor, seconds: (performance.now() - t0) / 1000, typedLength: state.typed.length };
}

async function scenarioH8Stream(args) {
  // large streamed copy while a frame-time probe runs in the WebView
  const gaps = []; let stop = false; let prev = performance.now();
  const probe = () => { const now = performance.now(); gaps.push(now - prev); prev = now; if (!stop) requestAnimationFrame(probe); };
  requestAnimationFrame(probe);
  let progressEvents = 0; const un = await T.event.listen("copy-progress", () => progressEvents++);
  const made = JSON.parse(await invoke("make_big_file", { path: args.src, mib: args.mib || 1024 }));
  const copied = JSON.parse(await invoke("stream_copy", { src: args.src, dest: args.dest }));
  stop = true; un();
  const maxGap = Math.max(...gaps);
  return { bytes: copied.bytes, srcSha: made.sha256, copySha: copied.sha256, identical: made.sha256 === copied.sha256, copyMs: copied.ms, progressEvents, frames: gaps.length, maxFrameGapMs: maxGap, p99FrameGapMs: pct(gaps, 0.99), p50FrameGapMs: pct(gaps, 0.5) };
}

async function scenarioIme(args) {
  const box = $("imebox"); box.focus(); box.value = "";
  const log = window.__imeLog; const want = args.imeN || 20; const t0 = performance.now();
  while (performance.now() - t0 < (args.imeTimeout || 120) * 1000) { if (log.filter((e) => e.t === "compositionend").length >= want) break; await sleep(200); }
  await sleep(500);
  const starts = log.filter((e) => e.t === "compositionstart").length, ends = log.filter((e) => e.t === "compositionend");
  const updates = log.filter((e) => e.t === "compositionupdate").length;
  // replay: committed text may ONLY come from compositionend.data; flag any non-composing insert of non-ASCII text while a composition is open
  let open = false, premature = 0, orderViolations = 0;
  for (const e of log) {
    if (e.t === "compositionstart") { if (open) orderViolations++; open = true; }
    else if (e.t === "compositionend") { if (!open) orderViolations++; open = false; }
    else if (e.t === "input" && open && e.isComposing === false && /[^ -]/.test(e.data || "")) premature++;
  }
  const committed = ends.map((e) => e.data).join("");
  return { phrasesRequested: want, compositionStarts: starts, compositionUpdates: updates, compositionEnds: ends.length, orderViolations, prematureCommitEvents: premature,
           committedFromCompositionEnd: committed, textareaValue: box.value, committedEqualsValue: committed === box.value, blurEvents: log.filter((e) => e.t === "blur").length, sampleEvents: log.slice(0, 12) };
}

async function scenarioH8Dialogs(args) {
  // Each case: native Save dialog -> Rust writes a file -> native Open dialog -> Rust streams a copy -> sha compare.
  const cases = [];
  const n = args.h8Count || 1;
  const gaps = []; let stop = false; let prev = performance.now();
  const probe = () => { const now = performance.now(); gaps.push(now - prev); prev = now; if (!stop) requestAnimationFrame(probe); };
  requestAnimationFrame(probe);
  for (let i = 0; i < n; i++) {
    const saved = await invoke("plugin:dialog|save", { options: { title: `spike save ${i}`, defaultPath: "spike-case.bin" } });
    if (!saved) { cases.push({ i, error: "save cancelled" }); continue; }
    const made = JSON.parse(await invoke("make_big_file", { path: saved, mib: args.mib || 64 }));
    const picked = await invoke("plugin:dialog|open", { options: { title: `spike open ${i}`, multiple: false } });
    if (!picked) { cases.push({ i, error: "open cancelled" }); continue; }
    const copied = JSON.parse(await invoke("stream_copy", { src: picked, dest: saved + ".copy" }));
    cases.push({ i, bytes: copied.bytes, identical: made.sha256 === copied.sha256, copyMs: copied.ms, pathChars: saved.length });
  }
  stop = true;
  return { cases, maxFrameGapMs: Math.max(...gaps), p99FrameGapMs: pct(gaps, 0.99) };
}

async function scenarioH8Long(args) {
  const made = JSON.parse(await invoke("make_big_file", { path: args.src, mib: 8 }));
  const copied = JSON.parse(await invoke("stream_copy", { src: args.src, dest: args.dest }));
  return { srcChars: args.src.length, destChars: args.dest.length, identical: made.sha256 === copied.sha256, bytes: copied.bytes };
}

const SCENARIOS = { h8dialogs: scenarioH8Dialogs, h8long: scenarioH8Long, ime: scenarioIme, h1: scenarioH1, h2: scenarioH2, h4: scenarioH4, h7unicode: scenarioH7Unicode, h7long: scenarioH7Long, h7resize: scenarioH7Resize, h8stream: scenarioH8Stream };

async function runAuto() {
  const info = JSON.parse(await invoke("app_info"));
  const args = info.args;
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const list = (get("--auto") || "").split(",").filter(Boolean);
  const opts = { ndjson: get("--ndjson"), envelope: get("--envelope"), src: get("--big-src"), dest: get("--big-dest"), mib: Number(get("--big-mib") || 1024), cycles: Number(get("--cycles") || 200), chars: Number(get("--chars") || 20000), imeN: Number(get("--ime-n") || 20), h8Count: Number(get("--h8-count") || 1), imeTimeout: Number(get("--ime-timeout") || 120) };
  const tag = get("--tag") || "";
  try { await invoke("window_op", { op: "focus" }); await sleep(300); } catch (e) {}
  for (const name of list) {
    $("status").textContent = `running ${name}â€¦`;
    let body;
    try { body = await SCENARIOS[name](opts); } catch (e) { body = { error: String(e && e.message || e) }; }
    results[name] = body;
    await invoke("report_result", { name: `${name}${tag}`, body: JSON.stringify(body, null, 1), exit: false });
  }
  await invoke("report_result", { name: `done${tag}`, body: JSON.stringify({ ran: list }), exit: list.length > 0 });
}

// ---- manual buttons / IME logging ---------------------------------------------------------------------
if (inTauri) {
  $("btnInfo").onclick = async () => log(await invoke("app_info"));
  $("btnUnicode").onclick = async () => log(JSON.stringify(await scenarioH7Unicode()).slice(0, 600));
  $("btnLong").onclick = async () => log(JSON.stringify(await scenarioH7Long({})));
  $("btnResize").onclick = async () => log(JSON.stringify(await scenarioH7Resize({})));
}
const ime = $("imebox"); const imeLog = [];
for (const ev of ["compositionstart", "compositionupdate", "compositionend"]) ime.addEventListener(ev, (e) => imeLog.push({ t: ev, data: e.data, value: ime.value }));
ime.addEventListener("input", (e) => imeLog.push({ t: "input", inputType: e.inputType, isComposing: e.isComposing, data: e.data, value: ime.value }));
ime.addEventListener("blur", () => imeLog.push({ t: "blur" }));
window.__imeLog = imeLog; window.__scenarios = SCENARIOS;
(async () => {
  if (!inTauri) { $("status").textContent = "browser mode (reference baseline): Tauri APIs unavailable"; return; }
  const info = JSON.parse(await invoke("app_info"));
  $("status").textContent = `ready â€” schema v${info.storeSchemaVersion} app ${info.appVersion}` + (info.startupError ? ` â€” STARTUP ERROR: ${info.startupError}` : "") + (info.notice ? ` â€” ${info.notice}` : "");
  if (info.args.includes("--auto")) runAuto();
})();
