// Static architecture contracts of the Focused Practice milestone (Scope Freeze Rev.1 sections 10, 13; UI Architecture
// Freeze): the domain engines are DOM-free and own every reveal decision; the views render only what an engine's view()
// returns and can neither grade nor read an answer key; canonical data reaches the store only through the runtime; no
// browser-origin storage and no HTML parsing of untrusted text anywhere in the practice code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'web', 'src');
const read = (rel) => fs.readFileSync(path.join(src, rel), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const files = (dir) => fs.readdirSync(path.join(src, dir)).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`);
const imports = (code) => [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);

test('the domain engines (objective, translation) are DOM-free and know nothing of the UI', () => {
  for (const f of [...files('objective'), ...files('translation')]) {
    const code = read(f);
    assert.ok(!/\bdocument\.(getElementById|querySelector|createElement|body|addEventListener|activeElement)|\bwindow\.|\bglobalThis\.(document|window)|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bfetch\(/.test(code), `${f} touches the DOM or browser storage`);
    assert.ok(!imports(code).some((i) => i.includes('practice/') || i.includes('/ui/')), `${f} imports UI code`);
  }
});

test('views render engine output only: they cannot import the grading / answer-key modules or the Store Port', () => {
  for (const f of ['practice/objective-view.js', 'practice/translation-view.js', 'practice/typing-view.js', 'practice/surface.js']) {
    const imp = imports(read(f));
    assert.ok(!imp.some((i) => i.includes('objective/questions') || i.includes('objective/session') || i.includes('store-port') || i.includes('projection') || i.includes('finalizer')), `${f} imports ${imp.join(', ')}`);
  }
  const code = read('practice/objective-view.js');
  assert.ok(!/gradeQuestion|rightId|sourceId|\.answers\b/.test(code), 'the Objective view never touches grading internals or the answer key');
});

test('only the runtime talks to the store; the surface receives services', () => {
  for (const f of files('practice')) {
    const code = read(f);
    const talks = /\bport\.(read|commit|call|count|schemaInfo)\b/.test(code);
    assert.equal(talks, f === 'practice/runtime.js', `${f}: store access ${talks ? 'found' : 'missing'}`);
  }
});

test('no browser-origin storage and no HTML parsing of untrusted text in the practice code', () => {
  for (const f of [...files('practice'), ...files('objective'), ...files('translation')]) {
    const code = read(f);
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(code), `${f} uses browser storage`);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(code), `${f} parses HTML or evaluates code`);
  }
});

test('finalization has one door: nothing in practice/ writes evidence collections directly', () => {
  for (const f of files('practice')) {
    const code = read(f);
    assert.ok(!/learner_response|typing_attempt|teacher_review/.test(code), `${f} names an evidence collection`);
  }
});
