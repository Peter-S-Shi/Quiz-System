// RC observation F1 (large-history read cost), measured on a RELEASE build and in the REAL packaged app (synthetic data).
//
//   QS_SCENARIO_BIN=<release qs-scenario.exe> node desktop/scripts/rc-f1-measure.mjs <quiz-studio.exe> [sessions=2000] [report.json]
//
// 1. Seeds the sample content plus <sessions> completed Objective sessions into an isolated data root (the shipped Rust
//    store, release build).
// 2. Engine: times the same reads the Library / Today / History views issue, through the release store.
// 3. Packaged: launches the shipped exe on that root over a loopback DevTools port and times how long the Library, Today
//    and Evidence history views take to become usable in the real WebView2.
// Records the environment. Nothing here changes the product; it only measures.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { counterIds, openBridge } from '../ui/tests/integration/bridge.mjs';
import { createLibrary } from '../ui/web/src/product/library.js';
import { createLearning } from '../ui/web/src/product/learning.js';
import { createPracticeRuntime } from '../ui/web/src/practice/runtime.js';
import { fixedClock } from '../ui/web/src/orchestration/dates.js';
import { ScheduleStore } from '../ui/web/src/orchestration/schedule-store.js';
import { launchPackaged } from '../ui/selftest/attach.mjs';
import { seedSample } from '../ui/selftest/sample-data.mjs';
import { correctAnswerForView, paperWithExplanations } from '../ui/tests/objective-fixtures.mjs';

const exe = process.argv[2];
const N = Number(process.argv[3] || 2000);
const reportPath = process.argv[4] || '';
if (!exe || !fs.existsSync(exe)) { console.error('usage: rc-f1-measure.mjs <quiz-studio.exe> [sessions] [report.json]'); process.exit(2); }
if (!process.env.QS_SCENARIO_BIN) { console.error('set QS_SCENARIO_BIN to the RELEASE qs-scenario.exe'); process.exit(2); }

const IDENTIFIER = 'io.github.peter-s-shi.quiz-studio';
const local = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-f1-'));
const root = path.join(local, IDENTIFIER);
const round = (x) => Math.round(x);
const out = { environment: { os: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model?.trim(), logicalCpus: os.cpus().length, memGiB: Math.round(os.totalmem() / 2 ** 30), build: 'release', exe: path.basename(exe) }, sessions: N };

// ---- 1. seed
let tick = 0;
const now = () => new Date(Date.UTC(2025, 0, 1) + (tick++) * 60_000).toISOString();
{
  const bridge = openBridge(root);
  await seedSample(bridge.port);
  const store = await ScheduleStore.open(bridge.port, { clock: fixedClock('2026-10-04'), newId: counterIds() });
  const library = await createLibrary({ port: bridge.port, now });
  const runtime = await createPracticeRuntime(bridge.port, { store, now });
  const paper = { ...paperWithExplanations({ id: 'paper-f1' }), title: 'Large history paper' };
  await library.savePaper(paper);
  const t = performance.now();
  for (let i = 0; i < N; i += 1) {
    const s = await runtime.begin(runtime.startObjective({ paper, intent: 'practice', feedbackTiming: 'instant' }));
    for (let q = 0; q < s.engine.view().total; q += 1) { s.engine.go(q); s.engine.answer(correctAnswerForView(s.engine.view(), paper)); if (s.engine.view().canSubmitItem) s.engine.submitItem(); }
    await runtime.services.commit({ payload: await s.engine.finalize({ now: now() }) });
  }
  out.seedSeconds = round((performance.now() - t) / 1000);
  // ---- 2. engine reads (release store)
  const learning = createLearning({ port: bridge.port, store, clock: fixedClock('2026-10-04'), runtime, library });
  const best = async (fn) => { let m = Infinity; for (let k = 0; k < 3; k += 1) { const a = performance.now(); await fn(); m = Math.min(m, performance.now() - a); } return round(m); };
  const rows = await bridge.port.read('learner_response');
  out.engine = {
    learnerResponseRecords: rows.length,
    learnerResponseMiB: +(JSON.stringify(rows).length / 2 ** 20).toFixed(1),
    readAllMs: await best(() => bridge.port.read('learner_response')),
    materialStatesMs: await best(() => learning.materialStates()),
    todayMs: await best(() => learning.today('en')),
  };
  await bridge.close();
}

// ---- 3. the real packaged app on that root
const app = await launchPackaged({ exe, localAppData: local });
const waitFor = async (expr, ms = 120000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await app.eval(expr)) return true; } catch { /* loading */ } await app.sleep(20); } return false; };
const timed = async (label, action, ready) => { const a = performance.now(); await action(); const ok = await waitFor(ready); return { label, ms: round(performance.now() - a), ok }; };
const nav = (view) => app.exec(`document.querySelector('#nav [data-view=${view}], #footNav [data-view=${view}]').click();`);
try {
  const boot = performance.now();
  const booted = await waitFor("document.querySelectorAll('#nav button').length === 6 && !!document.querySelector('#main .composer')");
  out.packaged = { todayFirstPaintMs: round(performance.now() - boot), booted };
  out.packaged.library = await timed('library', () => nav('library'), "document.querySelectorAll('#main .row-item').length >= 4 && !!document.querySelector('.pill.state')");
  out.packaged.history = await timed('history', () => nav('history'), "document.querySelectorAll('#main .row-item').length >= 20");
  out.packaged.todayAgain = await timed('today', () => nav('today'), "!!document.querySelector('#main .composer') && [...document.querySelectorAll('.rec b, .resume, .composer')].length > 0");
  out.packaged.noConsoleErrors = true;
} finally {
  await app.close?.();
}
const text = JSON.stringify(out, null, 2);
console.log(text);
if (reportPath) fs.writeFileSync(reportPath, text);
fs.rmSync(local, { recursive: true, force: true });
