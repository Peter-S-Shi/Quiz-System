// Static contracts of the final product UI: the layering (views -> product services -> Store Port), the browser-storage and
// HTML-injection bans, the offline rule (no remote resource anywhere), CSP-safe styling, and the two-language dictionary
// (every key in both languages, same placeholders, every used key defined). These fail loudly if someone breaks them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(root);
const rel = (f) => path.relative(root, f).replaceAll('\\', '/');
const read = (f) => fs.readFileSync(f, 'utf8');
const js = files.filter((f) => f.endsWith('.js'));
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const under = (prefix) => js.filter((f) => rel(f).startsWith(prefix));

test('offline: no remote URL, CDN, @import, remote font or network API anywhere in the shipped UI', () => {
  for (const f of files) {
    const src = stripComments(read(f));
    assert.ok(!/https?:\/\//.test(src.replace(/xmlns="[^"]*"/g, '')), `${rel(f)} references a remote URL`);
    if (f.endsWith('.css')) assert.ok(!/@import|url\(\s*['"]?(?!data:)/.test(src), `${rel(f)} imports or loads a resource`);
  }
  for (const f of js) {
    const src = stripComments(read(f));
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|importScripts/.test(src), `${rel(f)} uses a network API`);
  }
  const html = read(path.join(root, 'index.html'));
  assert.ok(!/<link[^>]+href="https?:/.test(html) && !/<script[^>]+src="https?:/.test(html));
});

test('no browser-origin storage, no HTML parsing, no dynamic code, no inline style attributes', () => {
  for (const f of js) {
    const src = stripComments(read(f));
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(src), `${rel(f)} uses browser storage`);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment/.test(src), `${rel(f)} parses HTML`);
    assert.ok(!/\beval\s*\(|new Function\s*\(/.test(src), `${rel(f)} runs dynamic code`);
    assert.ok(!/setAttribute\(\s*['"]style['"]/.test(src), `${rel(f)} sets an inline style attribute (blocked by the CSP)`);
    // shuffling options uses an injectable rng (default Math.random, V1 behavior) and the fallback id of ScheduleStore is a creation hint; identities use ids.js (CSPRNG)
    assert.ok(!/Math\.random/.test(src) || ['src/orchestration/schedule-store.js', 'src/objective/questions.js', 'src/objective/session.js'].includes(rel(f)), `${rel(f)} uses Math.random`);
  }
  const html = read(path.join(root, 'index.html'));
  assert.ok(!/\sstyle=/.test(html), 'index.html has an inline style');
});

test('layering: views never write to the store; only the product services and the runtime do', () => {
  for (const f of [...under('src/ui/')]) {
    const src = stripComments(read(f));
    // the preferences service writes the Rust-owned `setting` collection (a UI preference, never Content or Evidence)
    if (rel(f) !== 'src/ui/prefs.js') assert.ok(!/\bport\.commit\(|\.commit\(\s*\{\s*(preconditions|ops)/.test(src), `${rel(f)} commits to the Store Port directly`);
    assert.ok(!/from '\.\.\/projection\.js'|from '\.\.\/\.\.\/projection\.js'/.test(src), `${rel(f)} builds store operations`);
    assert.ok(!/from '\.\.\/(\.\.\/)?orchestration\/schedule-store\.js'/.test(src), `${rel(f)} reaches ScheduleStore around the services`);
  }
  // views only READ the port through the services, except the migration controls that are the accepted Port client surface
  const portUses = under('src/ui/').filter((f) => rel(f) !== 'src/ui/prefs.js').map((f) => [rel(f), (stripComments(read(f)).match(/\bport\.[a-zA-Z]+\(/g) ?? [])]).filter(([, u]) => u.length);
  const allowed = new Set(['port.read(', 'port.schemaInfo(', 'port.count(', 'port.listSnapshots(', 'port.checkConsistency(', 'port.migrationStatus(', 'port.migrationConfirm(', 'port.migrationCancel(', 'port.migrationUndo(']);
  for (const [file, uses] of portUses) for (const u of uses) assert.ok(allowed.has(u), `${file} calls ${u} (a write or an unlisted call)`);
});

test('the product services and exchange modules are DOM-free and testable against the real store', () => {
  for (const f of [...under('src/product/'), ...under('src/exchange/'), ...under('src/objective/'), ...under('src/translation/'), ...under('src/media/media-source.js'), ...under('src/task-domains/')]) {
    if (f.endsWith('dom-adapter.js')) continue;
    const src = stripComments(read(f));
    assert.ok(!/\bdocument\.(getElement|querySelector|createElement|createTextNode|body|documentElement|addEventListener|activeElement|visibilityState)|\bwindow\.|HTMLElement|\bnavigator\./.test(src), `${rel(f)} touches the DOM`);
  }
});

test('Evidence is written through ONE door: nothing under ui/ or product/ names an evidence collection for writing', () => {
  for (const f of [...under('src/ui/'), ...under('src/product/learning.js'), ...under('src/product/history.js')]) {
    const src = stripComments(read(f));
    assert.ok(!/putOp\(\s*[^)]*['"](learner_response|typing_attempt|legacy_history_entry)['"]/.test(src), `${rel(f)} writes evidence`);
  }
  // Teacher Reviews are written only by the Review service
  for (const f of js) {
    if (rel(f) === 'src/product/reviews.js') continue;
    assert.ok(!/putOp\([^)]*['"]teacher_review['"]/.test(stripComments(read(f))), `${rel(f)} writes a teacher review outside the Review service`);
  }
});

test('Focused Practice stays one shared surface: no view mounts a session except through the entry; views are not modes', () => {
  for (const f of under('src/ui/')) {
    if (rel(f) === 'src/ui/practice-entry.js') continue;
    assert.ok(!/mountPractice/.test(stripComments(read(f))), `${rel(f)} mounts Focused Practice itself`);
  }
  assert.ok(!files.some((f) => rel(f).includes('launcher')), 'the interim launcher must be gone');
});

// ------------------------------------------------------------------------------------------------------ dictionary
async function dictionary() {
  const i18n = await import(path.join(root, 'src', 'i18n.js').replaceAll('\\', '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
  // load every module that defines strings (views register theirs at import time)
  for (const f of js) {
    if (/src\/ui\/(shell|views\/|strings-common|import-flows)|src\/practice\/strings/.test(rel(f))) await import(`file:///${f.replaceAll('\\', '/')}`).catch(() => {});
  }
  return i18n;
}

test('the dictionary: every key has both languages with the same placeholders; Chinese is real Chinese', async () => {
  const i18n = await dictionary();
  const keys = i18n.definedKeys();
  assert.ok(keys.length > 500, `expected a full dictionary, found ${keys.length}`);
  const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  const SAME_IN_BOTH = /^(set\.language|nav\.views|mig\.kicker|pr\.ty\.disclaimer)$/;
  for (const key of keys) {
    const [en, zh] = i18n.entry(key);
    assert.ok(en.length > 0 && zh.length > 0, `${key} is empty in a language`);
    assert.equal(params(en), params(zh), `${key}: placeholders differ between languages`);
    if (!SAME_IN_BOTH.test(key) && /[A-Za-z]{4,}/.test(en.replace(/\{\w+\}/g, '')) && !/Quiz Studio|V1|JSON|sha256|Teacher|OTI|schema|\.json|\.qsarchive/.test(en)) {
      assert.ok(/[一-龥]/.test(zh), `${key}: the Chinese text has no Chinese: ${zh}`);
    }
  }
});

test('every dictionary key the code uses exists (literal keys; template keys must match a defined prefix)', async () => {
  const i18n = await dictionary();
  const defined = new Set(i18n.definedKeys());
  const used = new Set();
  const templated = new Set();
  const call = /\b(?:t|tr|tx)\(\s*(['`])([^'`]+?)\1/g;
  for (const f of js) {
    const src = stripComments(read(f));
    for (const m of src.matchAll(call)) {
      if (m[1] === '`' && m[2].includes('${')) templated.add(m[2].slice(0, m[2].indexOf('${')));
      else used.add(m[2]);
    }
  }
  const missing = [...used].filter((k) => !defined.has(k));
  assert.deepEqual(missing, [], `keys used but not defined: ${missing.join(', ')}`);
  for (const prefix of templated) assert.ok([...defined].some((k) => k.startsWith(prefix)), `no defined key under the template prefix ${prefix}`);
});

test('no unused imports and no "void x;" placeholders in the product, exchange, media and practice code', () => {
  const findings = [];
  for (const f of [...under('src/ui/'), ...under('src/product/'), ...under('src/exchange/'), ...under('src/media/'), ...under('src/practice/')]) {
    const src = read(f);
    const body = src.replace(/^import\b[^;]*;/gm, '');
    for (const m of src.matchAll(/^import\b([^;]*?)from\s+['"][^'"]+['"];/gm)) {
      const names = [];
      const brace = m[1].match(/\{([^}]*)\}/);
      if (brace) names.push(...brace[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean));
      const def = m[1].replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
      if (def && !def.startsWith('*')) names.push(def);
      for (const name of names) if (!new RegExp(String.raw`\b${name}\b`).test(body)) findings.push(`${rel(f)}: unused import ${name}`);
    }
    for (const m of src.matchAll(/^\s*void (\w+);/gm)) findings.push(`${rel(f)}: placeholder void ${m[1]}`);
  }
  assert.deepEqual(findings, []);
});
