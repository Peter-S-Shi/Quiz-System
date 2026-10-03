// The final product UI inside the REAL packaged app: the shipped quiz-studio.exe is started with an isolated, seeded data
// root and driven over a loopback DevTools port. Everything below therefore runs in the real WebView2, under the real CSP,
// over the real Tauri IPC and the real Rust store: the product boots, no console error / CSP violation appears, an
// Objective image and sound are decoded and playable, a Typing text is authored and practiced, and a trusted IME-style
// composition + committed text reach the engine. (It is NOT the OS IME: real Microsoft / third-party IME and Narrator stay
// manual - manual-qa/v2-final-product-ui.md.)
//   node desktop/ui/selftest/packaged-product-check.mjs <path to quiz-studio.exe>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchPackaged } from './attach.mjs';
import { openBridge } from '../tests/integration/bridge.mjs';
import { seedSample } from './sample-data.mjs';

const exe = process.argv[2];
if (!exe || !fs.existsSync(exe)) { console.error('usage: node packaged-product-check.mjs <path to quiz-studio.exe>'); process.exit(2); }
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond), detail: cond ? '' : String(detail) }); console.log(`${cond ? 'ok:  ' : 'FAIL:'} ${name}${cond ? '' : ` ${detail}`}`); };

const IDENTIFIER = 'io.github.peter-s-shi.quiz-studio';
const local = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-packaged-'));
const seed = openBridge(path.join(local, IDENTIFIER));
const sample = await seedSample(seed.port);
await seed.close();

let app;
try {
  app = await launchPackaged({ exe, localAppData: local });
} catch (error) {
  // Hosted CI runners: the installed WebView2 runtime (153.x) ignored BOTH the environment variable and the per-app registry policy
  // (its command line carried no debugging flag, runs 37128675961 and 37130299719), so the real-WebView2 product check cannot attach there.
  // That is reported as NOT RUN - never as passed. The packaged app itself is still launched, load-checked and smoke-tested by
  // smoke.ps1 / package-test.ps1, and the product UI runs over the real store in headless Edge; this check is run on a developer machine.
  if (process.env.CI && error?.code === 'DEVTOOLS_UNAVAILABLE') {
    console.log('::warning title=Packaged product check NOT RUN::the hosted runner WebView2 does not accept a debugging port; run packaged-product-check.mjs on a developer machine');
    console.log('SKIPPED (not run, not passed): ' + error.message.slice(0, 400));
    process.exit(0);
  }
  throw error;
}
const waitFor = async (expr, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await app.eval(expr)) return true; } catch { /* the page is still loading */ } await app.sleep(100); } return false; };
const clickText = (label, scope = '#main') => app.exec(`const el = [...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find((x) => x.textContent.trim() === ${JSON.stringify(label)} && !x.disabled); if (!el) throw new Error(${JSON.stringify(`no button "${label}"`)}); el.click();`);
const clickStarts = (label, scope = '#main') => app.exec(`const el = [...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)}) && !x.disabled); if (!el) throw new Error(${JSON.stringify(`no button starting "${label}"`)}); el.click();`);
const setValue = (sel, value) => app.exec(`const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true }));`);
const nav = (view) => app.exec(`document.querySelector('#nav [data-view=${view}], #footNav [data-view=${view}]').click();`);

try {
  ok('the real app exposes the Tauri IPC to the page', await waitFor("typeof window.__TAURI__?.core?.invoke === 'function'"), app.url);
  ok('the product shell boots: Today with its navigation', await waitFor("document.querySelectorAll('#nav button').length === 6 && !!document.querySelector('#main .composer')"));
  ok('suggestions with readable reasons come from the real store', await waitFor("[...document.querySelectorAll('.rec b')].some((b) => b.textContent === 'Capital cities')"));
  ok('the app reported a healthy store to the chrome', await waitFor("document.getElementById('healthChip').textContent.includes('healthy')"));

  await nav('library');
  ok('the Library lists the seeded material', await waitFor("document.querySelectorAll('#main .row-item').length >= 4"));
  await app.exec("[...document.querySelectorAll('#main .row-item')].find((r) => r.textContent.includes('Figures and sounds')).click();");
  await waitFor("!!document.querySelector('.col-c .detail-actions')");
  await clickText('Practice', '.col-c');
  ok('Objective image: decoded and shown inside the real WebView2 under the real CSP', await waitFor("(() => { const i = document.querySelector('img.qimage'); return i && i.complete && i.naturalWidth > 0; })()"));
  for (let i = 0; i < 3; i += 1) await clickText('Next', '.practice');
  ok('Objective sound: a real audio element with a duration', await waitFor("(() => { const a = document.querySelector('audio.qaudio'); return a && a.readyState >= 1 && a.duration > 0; })()"));
  await app.exec("document.querySelector('.practice-head button').click();");
  await app.sleep(150);
  await clickText('Discard session', 'dialog[open]');
  await app.sleep(100);
  await clickText('Discard', 'dialog[open]');
  await waitFor("!!document.querySelector('.tri')");

  // Typing authoring in the real app, then a practice with trusted text insertion and a trusted IME-style composition
  await clickText('New', '#main .vhead');
  await clickStarts('Typing text', 'dialog[open]');
  await waitFor("!!document.querySelector('.editor textarea')");
  await setValue('.editor .field input[type=text]', 'Packaged authoring');
  const passage = 'The quick brown fox. 你好，世界。';
  await setValue('.editor textarea', passage);
  await clickText('Save', '.editor');
  ok('a Typing text authored in the real app is shown in the Library', await waitFor("document.querySelector('.col-c h2')?.textContent === 'Packaged authoring'"));
  await clickText('Practice', '.col-c');
  ok('and can be practiced', await waitFor("!!document.querySelector('.practice textarea')"));
  await app.exec("document.querySelector('textarea.type-input').focus();");
  await app.insertText('The quick ');
  await app.setComposition('brown');
  await app.sleep(150);
  const midComposition = await app.eval("document.querySelectorAll('.passage .c.err').length");
  ok('a composition in progress is not scored (no error cells while composing)', midComposition === 0, String(midComposition));
  await app.insertText('brown fox. ');
  await app.sleep(200);
  const typed = await app.eval("document.querySelector('textarea.type-input').value");
  ok('committed text reaches the input and the engine counts it (real WebView2, no keydown / compositionend needed)', typed === 'The quick brown fox. ' && (await app.eval("document.querySelector('.practice-progress-text').textContent")).startsWith('21'), JSON.stringify(typed));
  await app.exec("document.querySelector('.practice-head button').click();");
  await app.sleep(150);
  await clickText('Discard session', 'dialog[open]');
  await app.sleep(100);
  await clickText('Discard', 'dialog[open]');
  await waitFor("!!document.querySelector('.tri')");

  // the other views render from the real store with no script error
  for (const v of ['calendar', 'history', 'review', 'exchange', 'settings', 'today']) {
    await nav(v);
    ok(`the ${v} view renders in the real WebView2`, await waitFor("!!document.querySelector('#main h1') && !document.querySelector('#main .error-box')"), v);
  }
  await nav('settings');
  await waitFor("!!document.getElementById('pref-sound')");
  await clickText('中文', '.setlist');
  ok('switching the interface language works in the real app', await waitFor("document.querySelector('#nav [data-view=today]')?.textContent.includes('今日')"));
  await clickText('English', '.setlist');
  const problems = app.problems();
  ok('no console error, uncaught exception or CSP violation occurred in the whole session', problems.length === 0, problems.slice(0, 5).join(' | '));
} catch (e) {
  ok('the packaged check ran to the end', false, e.stack || e.message);
  try { await app.screenshot(path.join(os.tmpdir(), 'packaged-product-failure.png')); } catch { /* best effort */ }
} finally {
  await app.close();
  try { fs.rmSync(local, { recursive: true, force: true }); } catch { /* a WebView2 process may still hold it briefly */ }
}
void sample;
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} packaged-app checks passed`);
if (failed.length) process.exit(1);
