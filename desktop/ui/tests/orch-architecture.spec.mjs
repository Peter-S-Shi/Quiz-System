// ADR 0003 E-1 / E-2 / R-2 / CAL-1 as static architecture tests: dependency direction and closed output types.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const orch = path.join(here, '..', 'web', 'src', 'orchestration');
const strip = (t) => t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const read = (p) => strip(fs.readFileSync(p, 'utf8'));

function functionBody(src, name) {
  const start = src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} exists`);
  const next = src.indexOf('\nexport function', start + 10);
  const next2 = src.indexOf('\nfunction ', start + 10);
  const ends = [next, next2].filter((i) => i > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

test('Evidence Readers never read Scheduling Context (E-2); only the Scheduling reader and the snapshot loader do', () => {
  const readers = read(path.join(orch, 'readers.js'));
  for (const fn of ['readObjective', 'readTranslation', 'readTeacherReview', 'readRecovery', 'objectiveAttempts', 'retryOf', 'responseById']) {
    const body = functionBody(readers, fn);
    assert.ok(!/schedules|schedule_|fulfillment|suggestion|session_selection/.test(body), `${fn} must not read Scheduling Context`);
  }
});

test('Evidence-side code knows nothing of scheduling (dependency direction is one-way)', () => {
  const rustSrc = path.join(here, '..', '..', 'core', 'migrate_v1', 'src');
  const files = [
    ...fs.readdirSync(rustSrc).map((f) => path.join(rustSrc, f)),
    ...['canonical.js', 'projection.js', 'store-port.js'].map((f) => path.join(here, '..', 'web', 'src', f)),
  ];
  for (const f of files) {
    assert.ok(!/qs_orchestration|schedule_exception|schedule_fulfillment|schedule_suggestion|session_selection|ScheduleStore/.test(read(f)), `${path.basename(f)} references scheduling`);
    assert.ok(!/typing_attempt|typing_text|typing-text|task-domains|qs_task_domains/.test(read(f)), `${path.basename(f)} references Typing / task domains`);
  }
});

test('the Recommendation output type has no score, rank, weight, percentage, mastery or confidence field (R-2)', () => {
  const rec = read(path.join(orch, 'recommend.js'));
  assert.ok(!/\b(score|percent|rank|weight|mastery|confidence)\w*\s*:/i.test(rec));
  assert.ok(!/\b(score|percent|rank|weight|mastery|confidence)\w*\s*:/i.test(read(path.join(orch, 'readers.js'))));
});

test('the scheduling domain has no clock, reminder, notification, external-event or exact-time vocabulary (CAL-1, frozen boundaries)', () => {
  for (const f of ['schema.js', 'schedule-store.js', 'occurrences.js', 'planner.js']) {
    const src = read(path.join(orch, f));
    for (const bad of ['Notification', 'setTimeout', 'setInterval', 'localStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'googleapis', 'ics', 'caldav']) {
      const re = bad === 'ics' || bad === 'caldav' ? new RegExp(`\\b${bad}\\b`, 'i') : new RegExp(bad.replace(/[()]/g, '\\$&'));
      assert.ok(!re.test(src), `${f} must not use ${bad}`);
    }
  }
});

test('the module is pure JS over the Store Port: it imports no SQL, file-system or network capability', () => {
  for (const f of fs.readdirSync(orch)) {
    const src = read(path.join(orch, f));
    assert.ok(!/from ['"]node:|require\(|from ['"]fs['"]|__TAURI__|invoke\(/.test(src), `${f} must stay capability-free`);
  }
});

test('the Evidence Reader registry and the session-finalization write registry are different, closed interfaces', async () => {
  const { EVIDENCE_SOURCES } = await import('../web/src/orchestration/readers.js');
  const { SESSION_EVIDENCE_WRITABLE } = await import('../web/src/orchestration/session-finalization.js');
  assert.deepEqual([...SESSION_EVIDENCE_WRITABLE], ['learner_response', 'typing_attempt'], 'only the formal session evidence collections are creatable (ADR 0004 section 4.2)');
  assert.ok(Object.isFrozen(SESSION_EVIDENCE_WRITABLE));
  assert.notStrictEqual(SESSION_EVIDENCE_WRITABLE, EVIDENCE_SOURCES);
  assert.ok(EVIDENCE_SOURCES.length > SESSION_EVIDENCE_WRITABLE.length, 'readers read more than finalization may write');
  for (const c of ['teacher_review', 'legacy_history_entry']) assert.ok(EVIDENCE_SOURCES.includes(c) && !SESSION_EVIDENCE_WRITABLE.includes(c), `${c} is readable, not writable`);
  const store = read(path.join(orch, 'schedule-store.js'));
  assert.ok(!/EVIDENCE_SOURCES/.test(store), 'ScheduleStore never derives its write permission from the Reader registry');
  assert.ok(/validateSessionEvidenceOps\(evidenceOps\)/.test(store), 'completeSession validates evidenceOps through the closed contract');
  assert.ok(!/EVIDENCE_SOURCES/.test(read(path.join(orch, 'session-finalization.js'))), 'the write contract never imports the Reader registry');
});

// ------------------------------------------------------------------------------------------------ ADR 0004 T-12
const tdRoot = path.join(here, '..', 'web', 'src', 'task-domains');
const importsOf = (file) => [...fs.readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);

test('Readers and the Recommender never import finalization, session engines or adapters, and never write (T-12)', () => {
  for (const f of ['readers.js', 'recommend.js', 'planner.js', 'occurrences.js']) {
    for (const spec of importsOf(path.join(orch, f))) {
      assert.ok(!/session-finalization|task-domains|schedule-store/.test(spec), `${f} imports ${spec}`);
    }
    assert.ok(!/\.commit\(|putOp|deleteOp/.test(read(path.join(orch, f))), `${f} must not write`);
  }
});

test('the finalization seam knows adapters only through the registry, never a domain session engine (T-12)', () => {
  for (const spec of importsOf(path.join(orch, 'session-finalization.js'))) assert.ok(!/typing\/session|typing\/dom-adapter/.test(spec), spec);
  for (const spec of importsOf(path.join(orch, 'schedule-store.js'))) assert.ok(!/task-domains\/(typing|finalizer|recovery)/.test(spec), spec);
});

test('domains do not import each other: the Typing module knows nothing of Objective/Translation and the adapters meet only in the registry (T-12)', () => {
  for (const f of fs.readdirSync(path.join(tdRoot, 'typing'))) {
    const src = read(path.join(tdRoot, 'typing', f));
    assert.ok(!/learner_response|teacher_review|quiz-paper|translation-document|learnerAnnotations/.test(src), `typing/${f} references another domain`);
    for (const spec of importsOf(path.join(tdRoot, 'typing', f))) assert.ok(!/orchestration|adapters|finalizer|recovery/.test(spec), `typing/${f} imports ${spec}`);
  }
  for (const spec of importsOf(path.join(tdRoot, 'adapters.js'))) assert.ok(!/orchestration|finalizer|recovery|typing\/session|dom-adapter/.test(spec), `adapters.js imports ${spec}`);
  const adapters = read(path.join(tdRoot, 'adapters.js'));
  assert.ok(!/typing_attempt.*typing_attempt.*readers/.test(adapters) && !/EVIDENCE_SOURCES|readers\.js/.test(adapters), 'the write registry is not derived from the Reader registry');
});

test('the Typing Reader reads typing_attempt and nothing else; no other Reader reads it; the planner never does (T-5, T-14)', () => {
  const readers = read(path.join(orch, 'readers.js'));
  const typingBody = functionBody(readers, 'readTyping');
  assert.ok(!/learner_response|teacher_review|legacy_history_entry|schedule|responses|reviews|history/.test(typingBody), 'readTyping reads only typing attempts');
  for (const fn of ['readObjective', 'readTranslation', 'readTeacherReview', 'readRecovery', 'objectiveAttempts', 'retryOf', 'responseById', 'readScheduling']) {
    assert.ok(!/typing/i.test(functionBody(readers, fn)), `${fn} must not read Typing evidence`);
  }
  assert.ok(!/typing/i.test(read(path.join(orch, 'planner.js'))), 'the planner never reads Typing evidence (no automatic Typing scheduling)');
});

test('no stored score, level, speed or mastery field exists in the Typing and finalization code (T-9)', () => {
  for (const f of fs.readdirSync(path.join(tdRoot, 'typing'))) {
    assert.ok(!/accuracy|wpm|cpm|speedGrade|mastery|score|level/i.test(read(path.join(tdRoot, 'typing', f))), `typing/${f}`);
  }
});

test('Test views are structurally opaque: only a live Practice view computes a comparison (T-11)', () => {
  const src = read(path.join(tdRoot, 'typing', 'session.js'));
  const start = src.indexOf('  view() {');
  const end = src.indexOf('  snapshot() {', start);
  const view = src.slice(start, end);
  assert.ok(start > 0 && end > start, 'view() found');
  const gated = view.indexOf("this.#cfg.intent === 'practice' && this.#cfg.policy.feedbackTiming === 'live'");
  assert.ok(gated > 0, 'live comparison is gated on Practice + live');
  assert.equal(view.indexOf('compare('), view.lastIndexOf('compare('), 'compare is called exactly once');
  assert.ok(view.indexOf('compare(') > gated, 'and only inside the gate');
  assert.ok(!/errors/.test(view), 'the view never reads recorded errors');
});
