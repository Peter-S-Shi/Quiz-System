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
  assert.deepEqual([...SESSION_EVIDENCE_WRITABLE], ['learner_response'], 'only the formal session evidence collection is creatable');
  assert.ok(Object.isFrozen(SESSION_EVIDENCE_WRITABLE));
  assert.notStrictEqual(SESSION_EVIDENCE_WRITABLE, EVIDENCE_SOURCES);
  assert.ok(EVIDENCE_SOURCES.length > SESSION_EVIDENCE_WRITABLE.length, 'readers read more than finalization may write');
  for (const c of ['teacher_review', 'legacy_history_entry']) assert.ok(EVIDENCE_SOURCES.includes(c) && !SESSION_EVIDENCE_WRITABLE.includes(c), `${c} is readable, not writable`);
  const store = read(path.join(orch, 'schedule-store.js'));
  assert.ok(!/EVIDENCE_SOURCES/.test(store), 'ScheduleStore never derives its write permission from the Reader registry');
  assert.ok(/validateSessionEvidenceOps\(evidenceOps\)/.test(store), 'completeSession validates evidenceOps through the closed contract');
  assert.ok(!/typing/i.test(read(path.join(orch, 'session-finalization.js'))), 'no Typing schema is pre-created');
});
