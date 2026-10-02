// The Typing session engine behind its event-model adapter (ADR 0004 section 8.4, 8.5, 10.2, 13.7, 13.8; T-10, T-11):
// one committed-text path for every trusted user-agent committed input, composition never scored, paste/drop and
// untrusted mutation excluded, Test opaque until finalization, recovery restores state and never composition or results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingSession, restoreTypingSession } from '../web/src/task-domains/typing/session.js';
import { validateTypingAttempt } from '../web/src/task-domains/typing/attempt.js';
import { bindTypingInput, toModelEvent } from '../web/src/task-domains/typing/dom-adapter.js';

const TEXT = 'environment';
const mk = (over = {}) => new TypingSession({
  evidenceId: 'ta-1', sessionId: 'sess-1', startedAt: '2026-10-02T09:00:00.000Z',
  material: { id: 'typing-1', title: 'Copy', text: TEXT },
  intent: 'practice', policy: { feedbackTiming: 'live', corrections: 'allowed' },
  selection: { source: 'manual' }, ...over,
});
const user = (e) => ({ isTrusted: true, ...e });

// -------------------------------------------------------------------------------- the one committed-text path
test('a plain key, a dead-key result and a trusted non-composing insertText all commit through the same path', () => {
  const s = mk();
  for (const [label, value] of [['plain', 'e'], ['dead-key', 'en'], ['insertText', 'env']]) {
    const r = s.input(user({ type: 'input', inputType: 'insertText', isComposing: false, value }));
    assert.equal(r.accepted, true, label);
    assert.equal(s.committedText, value);
  }
  assert.equal(s.committedText, 'env');
});

test('a committed insertion arriving as a LONE trusted input event (no keydown, no composition events) is accepted', () => {
  const s = mk();
  const r = s.input(user({ type: 'input', value: 'enviro' })); // the third-party-IME case: nothing else fires
  assert.deepEqual([r.accepted, s.committedText], [true, 'enviro']);
  const again = s.input(user({ type: 'input', inputType: 'insertReplacementText', value: 'environ' }));
  assert.deepEqual([again.accepted, s.committedText], [true, 'environ']);
});

test('composition: updates never alter committed text; commit adopts exactly the composed text; cancel changes nothing', () => {
  const s = mk();
  s.input(user({ type: 'input', value: 'env' }));
  s.input(user({ type: 'compositionstart' }));
  for (const composing of ['envi', 'enviro']) {
    const r = s.input(user({ type: 'compositionupdate', value: composing }));
    assert.equal(r.accepted, true);
    assert.equal(s.committedText, 'env', 'an in-progress composition is not committed text');
  }
  s.input(user({ type: 'input', isComposing: true, value: 'enviro' }));
  assert.equal(s.committedText, 'env');
  assert.equal(s.snapshot().domainState.committedText, 'env', 'a recovery snapshot taken mid-composition holds no composed text');
  s.input(user({ type: 'compositionend', value: 'environment' }));
  assert.equal(s.committedText, 'environment');
  // cancel: composition starts, text is composed, then abandoned (the element value reverts to the committed text)
  const c = mk();
  c.input(user({ type: 'input', value: 'en' }));
  c.input(user({ type: 'compositionstart' }));
  c.input(user({ type: 'compositionupdate', value: 'enxx' }));
  c.input(user({ type: 'compositionend', value: 'en' }));
  assert.equal(c.committedText, 'en');
});

test('input is never dropped for lacking compositionend: a non-composing input during a composition commits', () => {
  const s = mk();
  s.input(user({ type: 'compositionstart' }));
  s.input(user({ type: 'compositionupdate', value: 'e' }));
  const r = s.input(user({ type: 'input', isComposing: false, value: 'en' })); // the IME never sent compositionend
  assert.deepEqual([r.accepted, s.committedText], [true, 'en']);
});

test('recognizable paste and drop are rejected: committed text unchanged, nothing recorded, the element is told to revert', () => {
  const s = mk();
  s.input(user({ type: 'input', value: 'env' }));
  for (const e of [{ type: 'paste', value: 'environment' }, { type: 'drop', value: 'environment' }, { type: 'input', inputType: 'insertFromPaste', value: 'environment' }, { type: 'input', inputType: 'insertFromDrop', value: 'environment' }, { type: 'input', inputType: 'insertFromPasteAsQuotation', value: 'environment' }]) {
    const r = s.input(user(e));
    assert.equal(r.accepted, false, e.inputType ?? e.type);
    assert.equal(r.reason, 'paste-drop');
    assert.equal(r.revertTo, 'env');
    assert.equal(s.committedText, 'env');
  }
});

test('synthetic / app-owned mutation never enters the committed channel, and is not confused with a real insertText', () => {
  const s = mk();
  s.input(user({ type: 'input', value: 'env' }));
  const synthetic = s.input({ isTrusted: false, type: 'input', inputType: 'insertText', value: 'environment' });
  assert.deepEqual([synthetic.accepted, synthetic.reason, s.committedText], [false, 'untrusted', 'env']);
  assert.equal(s.input({ isTrusted: false, type: 'compositionend', value: 'zzz' }).accepted, false);
  assert.equal(s.committedText, 'env');
  // the same payload from the user agent IS accepted: the boundary keys on trust, not on whether keys or compositions were seen
  assert.equal(s.input(user({ type: 'input', inputType: 'insertText', value: 'environment' })).accepted, true);
  assert.equal(s.committedText, 'environment');
});

test('corrections: disallowed policy keeps committed text append-only; allowed policy accepts deletion', () => {
  const strict = mk({ policy: { feedbackTiming: 'live', corrections: 'disallowed' } });
  strict.input(user({ type: 'input', value: 'envi' }));
  const r = strict.input(user({ type: 'input', inputType: 'deleteContentBackward', value: 'env' }));
  assert.deepEqual([r.accepted, r.revertTo, strict.committedText], [false, 'envi', 'envi']);
  const lax = mk();
  lax.input(user({ type: 'input', value: 'envi' }));
  assert.equal(lax.input(user({ type: 'input', inputType: 'deleteContentBackward', value: 'env' })).accepted, true);
  assert.equal(lax.committedText, 'env');
});

// -------------------------------------------------------------------------------- Practice / Test semantics
test('Practice with live feedback may compare while typing; its view carries the live differences', () => {
  const s = mk();
  s.input(user({ type: 'input', value: 'enviro' }));
  const v = s.view();
  assert.deepEqual(v.progress, { typedGraphemes: 6, referenceGraphemes: 11 });
  assert.ok(v.live, 'live comparison present');
  assert.equal(v.live.errors.length, 1, 'omission of the missing n is visible live');
});

test('Test is opaque: no comparison, diff or correctness is exposed before finalization (view and API)', () => {
  const s = mk({ intent: 'test', policy: { feedbackTiming: 'on-completion', corrections: 'allowed' } });
  s.input(user({ type: 'input', value: 'enviroment' }));
  const v = s.view();
  assert.deepEqual(Object.keys(v).sort(), ['committedText', 'progress']);
  assert.deepEqual(Object.keys(v.progress).sort(), ['referenceGraphemes', 'typedGraphemes']);
  const flat = JSON.stringify(v) + JSON.stringify(s.snapshot());
  assert.ok(!/error|diff|accura|correct|live/i.test(JSON.stringify(v)), 'the view carries no correctness');
  assert.ok(!('compare' in s) && !('live' in v) && !('errors' in v));
  assert.ok(!flat.includes('"errors"'), 'a recovery snapshot restores state, never results');
  // an on-completion Practice session is equally opaque while typing
  const p = mk({ policy: { feedbackTiming: 'on-completion', corrections: 'allowed' } });
  p.input(user({ type: 'input', value: 'enviroment' }));
  assert.deepEqual(Object.keys(p.view()).sort(), ['committedText', 'progress']);
});

test('a Test session that asks for live feedback is refused at construction', () => {
  assert.throws(() => mk({ intent: 'test', policy: { feedbackTiming: 'live', corrections: 'allowed' } }), /TYPING_SESSION_INVALID/);
});

// -------------------------------------------------------------------------------- finalize and recovery
test('finalize produces a valid attempt carrying the id allocated at session start, intent, policy and selection', () => {
  const s = mk({ scheduleRef: { scheduleId: 'sch-1', originalDate: '2026-10-02' }, selection: { source: 'manual' } });
  s.input(user({ type: 'input', value: 'enviroment' }));
  const out = s.finalize({ completedAt: '2026-10-02T09:03:00.000Z' });
  assert.equal(out.payload.id, 'ta-1');
  assert.deepEqual(out.session, { collection: 'typing_attempt', id: 'ta-1' });
  assert.deepEqual(out.scheduleRef, { scheduleId: 'sch-1', originalDate: '2026-10-02' });
  assert.equal(out.payload.intent, 'practice');
  assert.deepEqual(out.payload.session, { id: 'sess-1', startedAt: '2026-10-02T09:00:00.000Z', completedAt: '2026-10-02T09:03:00.000Z' });
  assert.equal(validateTypingAttempt(out.payload, { creating: true }).valid, true);
  assert.deepEqual(out.payload.provenance.purpose, 'practice');
});

test('finalizing a composition in progress records only the committed text (T-10)', () => {
  const s = mk();
  s.input(user({ type: 'input', value: 'env' }));
  s.input(user({ type: 'compositionstart' }));
  s.input(user({ type: 'compositionupdate', value: 'environment' }));
  const out = s.finalize({ completedAt: '2026-10-02T09:03:00.000Z' });
  assert.equal(out.payload.committed.text, 'env');
});

test('recovery restores the same session (same evidence id, same committed text) through the explicit path only', () => {
  const s = mk({ intent: 'test', policy: { feedbackTiming: 'on-completion', corrections: 'allowed' }, selection: { source: 'recommended', reasons: [{ code: 'TYPING_ERRORS_REMAIN', params: {}, provenance: [{ collection: 'typing_attempt', id: 'old' }] }], algorithmVersion: 'v2' } });
  s.input(user({ type: 'input', value: 'envir' }));
  const snap = JSON.parse(JSON.stringify(s.snapshot()));
  const back = restoreTypingSession(snap);
  assert.equal(back.committedText, 'envir');
  assert.equal(back.snapshot().evidenceId, 'ta-1');
  assert.deepEqual(back.snapshot().selection, s.snapshot().selection, 'the selection the learner saw is restored exactly');
  assert.deepEqual(Object.keys(back.view()).sort(), ['committedText', 'progress'], 'restoring a Test session reveals no correctness');
  // app-owned simulated input cannot masquerade as recovery
  assert.equal(back.input({ isTrusted: false, type: 'input', value: 'x' }).accepted, false);
  assert.throws(() => restoreTypingSession({ ...snap, domain: 'objective' }), /TYPING_SESSION_INVALID/);
});

test('a retry re-types the historical snapshot and records lineage', () => {
  const s = mk({ provenance: { purpose: 'retry', sourceAttemptId: 'ta-0', sourceMaterialId: 'typing-1' } });
  s.input(user({ type: 'input', value: 'environment' }));
  const out = s.finalize({ completedAt: '2026-10-02T09:03:00.000Z' });
  assert.deepEqual([out.payload.provenance.purpose, out.payload.provenance.sourceAttemptId, out.payload.provenance.sourceMaterialId], ['retry', 'ta-0', 'typing-1']);
  assert.deepEqual(out.payload.errors, []);
});

// -------------------------------------------------------------------------------- the DOM binding
function fakeElement() {
  const listeners = new Map();
  return {
    value: '',
    addEventListener(t, h) { listeners.set(t, h); },
    removeEventListener(t) { listeners.delete(t); },
    fire(type, props = {}) {
      const e = { type, isTrusted: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...props };
      e.target = this;
      listeners.get(type)?.(e);
      return e;
    },
    listeners,
  };
}

test('the DOM binding maps user-agent events to the model and reverts rejected input', () => {
  const el = fakeElement();
  const s = mk();
  const unbind = bindTypingInput(el, s);
  el.value = 'env'; el.fire('input', { inputType: 'insertText' });
  assert.equal(s.committedText, 'env');
  // a lone trusted input event (no keydown anywhere in this test) commits
  el.value = 'environ'; el.fire('input', { inputType: 'insertReplacementText' });
  assert.equal(s.committedText, 'environ');
  // composition: nothing commits until the user agent commits
  el.fire('compositionstart');
  el.value = 'environxx'; el.fire('compositionupdate');
  el.fire('input', { isComposing: true, inputType: 'insertCompositionText' });
  assert.equal(s.committedText, 'environ');
  el.value = 'environment'; el.fire('compositionend');
  assert.equal(s.committedText, 'environment');
  // paste: cancelled and reverted
  el.value = 'environmentPASTED';
  const pasted = el.fire('input', { inputType: 'insertFromPaste' });
  assert.equal(el.value, 'environment');
  assert.equal(s.committedText, 'environment');
  assert.ok(pasted, 'a real input event is not cancelable; the revert does the work');
  const paste = el.fire('paste');
  assert.equal(paste.defaultPrevented, true, 'the paste event itself is cancelled');
  // an untrusted (script-dispatched / app-owned) event never commits and is not reverted into the model
  el.value = 'FORGED'; el.fire('input', { isTrusted: false, inputType: 'insertText' });
  assert.equal(s.committedText, 'environment');
  unbind();
  assert.equal(el.listeners.size, 0);
});

test('toModelEvent reads only what the user agent reports (never keydown, never the app)', () => {
  const m = toModelEvent({ type: 'input', isTrusted: true, inputType: 'insertText', isComposing: false, target: { value: 'abc' } });
  assert.deepEqual(m, { type: 'input', isTrusted: true, inputType: 'insertText', isComposing: false, value: 'abc' });
  assert.equal(toModelEvent({ type: 'input', target: { value: 'x' } }).isTrusted, false, 'no isTrusted mark means untrusted');
  assert.equal(toModelEvent({ type: 'paste', isTrusted: true }).value, undefined);
});
