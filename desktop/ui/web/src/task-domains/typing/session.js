// The Typing session engine (ADR 0004 section 8.4, 8.5, 10.2). It speaks to the DOM through an event-model adapter:
// the host forwards user-agent events as plain `{type, isTrusted, inputType?, isComposing?, value}` records, where
// `value` is what the typing input holds after the event.
//
// ONE committed-text path (section 8.5): committed text is what a TRUSTED user-agent event reports as committed. It is
// never reconstructed from keydown or compositionend, so input that arrives with neither (a third-party IME that emits
// only an `input` event) is committed like any other, and nothing is ever dropped for lacking them. Two narrow
// exclusions: recognizable paste/drop (rejected; the element is told to revert) and untrusted (script-dispatched or
// app-owned) events, which never enter the channel. Recovery restores state through `restoreTypingSession`, not by
// simulating input.
import { buildTypingAttempt } from './attempt.js';
import { compare } from './compare.js';
import { graphemeBoundaries } from '../unicode/graphemes.js';

const PASTE_DROP_TYPES = ['paste', 'drop'];
const PASTE_DROP_INPUT_TYPES = ['insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop'];

export class TypingSessionError extends Error {
  constructor(message) {
    super(`TYPING_SESSION_INVALID: ${message}`);
    this.name = 'TypingSessionError';
    this.code = 'TYPING_SESSION_INVALID';
  }
}

const countGraphemes = (text) => graphemeBoundaries(text).length - 1;

export class TypingSession {
  #committed = '';
  #composing = false;
  #cfg;

  /**
   * @param {{evidenceId: string, sessionId: string, startedAt: string, material: {id: string, title: string, text: string},
   *   intent: 'practice'|'test', policy: {feedbackTiming: 'live'|'on-completion', corrections: 'allowed'|'disallowed'},
   *   selection?: object, scheduleRef?: {scheduleId: string, originalDate: string}, provenance?: object, committedText?: string}} cfg
   */
  constructor(cfg) {
    if (!cfg || typeof cfg.evidenceId !== 'string' || !cfg.evidenceId) throw new TypingSessionError('an evidence id is allocated at session start');
    if (!['practice', 'test'].includes(cfg.intent)) throw new TypingSessionError('intent must be practice or test');
    if (cfg.intent === 'test' && cfg.policy?.feedbackTiming !== 'on-completion') throw new TypingSessionError('a test session cannot give live feedback');
    if (typeof cfg.material?.text !== 'string' || !cfg.material.text) throw new TypingSessionError('a reference text is required');
    this.#cfg = {
      evidenceId: cfg.evidenceId, sessionId: cfg.sessionId, startedAt: cfg.startedAt,
      material: { id: cfg.material.id, title: cfg.material.title, text: cfg.material.text },
      intent: cfg.intent, policy: { feedbackTiming: cfg.policy.feedbackTiming, corrections: cfg.policy.corrections },
      selection: cfg.selection ?? { source: 'manual' },
      ...(cfg.scheduleRef ? { scheduleRef: cfg.scheduleRef } : {}),
      provenance: cfg.provenance ?? { purpose: 'practice' },
    };
    this.#committed = cfg.committedText ?? '';
  }

  get committedText() { return this.#committed; }

  /** Feed one user-agent event. Returns `{accepted, reason?, revertTo?}`. */
  input(event) {
    if (!event || event.isTrusted !== true) return { accepted: false, reason: 'untrusted' };
    const type = event.type;
    if (PASTE_DROP_TYPES.includes(type) || PASTE_DROP_INPUT_TYPES.includes(event.inputType)) {
      return { accepted: false, reason: 'paste-drop', revertTo: this.#committed };
    }
    if (type === 'compositionstart') { this.#composing = true; return { accepted: true, committedChanged: false }; }
    if (type === 'compositionupdate') { this.#composing = true; return { accepted: true, committedChanged: false }; }
    if (type === 'input' && event.isComposing === true) { this.#composing = true; return { accepted: true, committedChanged: false }; }
    if (type === 'compositionend' || type === 'input') {
      if (typeof event.value !== 'string') return { accepted: false, reason: 'no-value', revertTo: this.#committed };
      this.#composing = false;
      return this.#commit(event.value);
    }
    return { accepted: false, reason: 'unsupported-event', revertTo: this.#committed };
  }

  #commit(value) {
    if (this.#cfg.policy.corrections === 'disallowed' && !value.startsWith(this.#committed)) {
      return { accepted: false, reason: 'corrections-disallowed', revertTo: this.#committed };
    }
    const changed = value !== this.#committed;
    this.#committed = value;
    return { accepted: true, committedChanged: changed };
  }

  /** What the surface may show while typing. Test (and any on-completion session) carries NO correctness. */
  view() {
    const progress = { typedGraphemes: countGraphemes(this.#committed), referenceGraphemes: countGraphemes(this.#cfg.material.text) };
    const base = { committedText: this.#committed, progress };
    if (this.#cfg.intent === 'practice' && this.#cfg.policy.feedbackTiming === 'live') {
      return { ...base, live: compare(this.#cfg.material.text, this.#committed) };
    }
    return base;
  }

  /** Recovery-only state: committed text only (never a composition), no results. */
  snapshot() {
    return {
      schemaVersion: 1, domain: 'typing',
      evidenceId: this.#cfg.evidenceId,
      session: { id: this.#cfg.sessionId, startedAt: this.#cfg.startedAt },
      material: { ...this.#cfg.material },
      intent: this.#cfg.intent,
      policy: { ...this.#cfg.policy },
      selection: JSON.parse(JSON.stringify(this.#cfg.selection)),
      ...(this.#cfg.scheduleRef ? { scheduleRef: { ...this.#cfg.scheduleRef } } : {}),
      provenance: { ...this.#cfg.provenance },
      domainState: { committedText: this.#committed },
    };
  }

  /** The finalization input: the evidence payload (built once, with the id allocated at start) plus the sidecar facts. */
  finalize({ completedAt }) {
    const prov = this.#cfg.provenance;
    const payload = buildTypingAttempt({
      id: this.#cfg.evidenceId,
      material: this.#cfg.material,
      session: { id: this.#cfg.sessionId, startedAt: this.#cfg.startedAt, completedAt },
      intent: this.#cfg.intent,
      policy: this.#cfg.policy,
      committedText: this.#committed,
      provenance: { ...prov, createdAt: prov.createdAt ?? completedAt },
    });
    return {
      payload,
      session: { collection: 'typing_attempt', id: this.#cfg.evidenceId },
      selection: this.#cfg.selection,
      ...(this.#cfg.scheduleRef ? { scheduleRef: this.#cfg.scheduleRef } : {}),
    };
  }
}

/** The explicit recovery path (the only way recovered state re-enters a session). */
export function restoreTypingSession(snap) {
  if (!snap || snap.domain !== 'typing' || snap.schemaVersion !== 1) throw new TypingSessionError('not a typing recovery state');
  return new TypingSession({
    evidenceId: snap.evidenceId, sessionId: snap.session.id, startedAt: snap.session.startedAt,
    material: snap.material, intent: snap.intent, policy: snap.policy, selection: snap.selection,
    scheduleRef: snap.scheduleRef, provenance: snap.provenance, committedText: snap.domainState.committedText,
  });
}
