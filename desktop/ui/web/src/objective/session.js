// The Objective practice session engine (Scope Freeze Rev.1 sections 10, 13; ADR 0004 sections 6, 10).
//
// The engine owns every rule about WHEN a learner may see grading, the correct answer and the explanation; the UI only
// renders what `view()` returns. `view()` is built from an explicit allow-list, so the answer key cannot leak by
// accident: in Submit-at-End nothing about correctness exists in any view before `finalize()`, and in Instant only the
// item that was just graded reveals its correct answer and explanation (Scope 10.1, 10.2: "no explanation leakage").
//
// Finalization produces a V1-valid native Learner Response (the question snapshot taken at session start, with the
// explanation of that moment; V2 session facts in the namespaced extension). It never writes anything itself.
import { withSessionFacts } from '../task-domains/adapters.js';
import { DEFAULT_LABELS, gradeQuestion, isAnswerComplete, normalizeQuestion, prepareQuizQuestion, validateQuestion } from './questions.js';

export const FEEDBACK_TIMINGS = Object.freeze(['instant', 'submit-at-end']);
export const INTENTS = Object.freeze(['practice', 'test']);
const SCHEMA_VERSION = 1;

export class ObjectiveSessionError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'ObjectiveSessionError';
    this.code = code;
  }
}
const fail = (code, message) => { throw new ObjectiveSessionError(code, message); };
const clone = (v) => structuredClone(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The right-option token the UI sees: opaque, positional, and unrelated to the pair it belongs to. */
const tokenOf = (index) => `r${index}`;

function toStored(q, value) {
  if (q.type === 'matching') {
    const out = {};
    for (const [pairId, token] of Object.entries(value)) {
      const i = q.rightOptions.findIndex((_, k) => tokenOf(k) === token);
      out[pairId] = q.rightOptions[i].id;
    }
    return out;
  }
  return value;
}
function toView(q, stored) {
  if (stored === undefined) return null;
  if (q.type === 'matching') {
    return Object.fromEntries(Object.entries(stored).map(([pairId, rightId]) => [pairId, tokenOf(q.rightOptions.findIndex((r) => r.id === rightId))]));
  }
  return clone(stored);
}

function checkAnswerShape(q, value) {
  if (q.type === 'single') { if (!q.options.some((o) => o.id === value)) fail('BAD_ANSWER', 'not an option of this question'); return; }
  if (q.type === 'multiple') {
    if (!Array.isArray(value) || new Set(value).size !== value.length || !value.every((id) => q.options.some((o) => o.id === id))) fail('BAD_ANSWER', 'not a set of options of this question');
    return;
  }
  if (q.type === 'blank') { if (typeof value !== 'string') fail('BAD_ANSWER', 'a blank answer is text'); return; }
  if (q.type === 'truefalse') { if (typeof value !== 'boolean') fail('BAD_ANSWER', 'a true/false answer is a boolean'); return; }
  if (!isObj(value) || !Object.entries(value).every(([pairId, token]) => q.pairs.some((p) => p.id === pairId) && q.rightOptions.some((_, k) => tokenOf(k) === token))) fail('BAD_ANSWER', 'not a pairing of this question');
}

export class ObjectiveSession {
  #s;

  constructor(state) {
    this.#s = state;
  }

  /**
   * @param {object} args
   * @param {object} args.paper the source paper (read once; later edits of it never reach this session)
   * @param {string[]} [args.questionIds] a subset of the paper's questions (retry), in paper order
   * @param {string} args.sessionId @param {string} args.evidenceId the Learner Response id, allocated at session start
   * @param {string} args.startedAt @param {'instant'|'submit-at-end'} args.feedbackTiming @param {'practice'|'test'} args.intent
   */
  static start({ paper, questionIds, sessionId, evidenceId, startedAt, feedbackTiming, intent, provenance = { purpose: 'practice' }, rng = Math.random }) {
    if (!FEEDBACK_TIMINGS.includes(feedbackTiming)) fail('BAD_INPUT', `feedback timing must be one of ${FEEDBACK_TIMINGS.join(', ')}`);
    if (!INTENTS.includes(intent)) fail('BAD_INPUT', `intent must be one of ${INTENTS.join(', ')}`);
    if (!isObj(paper) || !Array.isArray(paper.questions) || !paper.questions.length) fail('BAD_INPUT', 'a paper with at least one question is required');
    if (typeof sessionId !== 'string' || !sessionId || typeof evidenceId !== 'string' || !evidenceId || typeof startedAt !== 'string' || !startedAt) fail('BAD_INPUT', 'session id, evidence id and start time are required');
    let source = paper.questions;
    if (questionIds) {
      const known = new Set(source.map((q) => q.id));
      for (const id of questionIds) if (!known.has(id)) fail('BAD_INPUT', `unknown question id ${JSON.stringify(id)}`);
      source = source.filter((q) => questionIds.includes(q.id));
      if (!source.length) fail('BAD_INPUT', 'a retry needs at least one question');
    }
    const questions = source.map((raw) => {
      const q = normalizeQuestion(raw);
      const errs = validateQuestion(q);
      if (errs.length) fail('BAD_INPUT', `question ${JSON.stringify(q.id)} is not ready: ${errs.join('; ')}`);
      return prepareQuizQuestion(q, rng);
    });
    if (new Set(questions.map((q) => q.id)).size !== questions.length) fail('BAD_INPUT', 'question ids must be unique within a paper');
    return new ObjectiveSession({
      schemaVersion: SCHEMA_VERSION, domain: 'objective', evidenceId,
      session: { id: sessionId, startedAt }, material: { id: String(paper.id), title: typeof paper.title === 'string' ? paper.title : '' },
      intent, feedbackTiming, provenance: clone(provenance), questions,
      index: 0, answers: {}, results: {}, finished: false,
    });
  }

  static restore(snap) {
    if (!isObj(snap) || snap.domain !== 'objective' || snap.schemaVersion !== SCHEMA_VERSION || !Array.isArray(snap.questions) || !snap.questions.length || !isObj(snap.answers) || !isObj(snap.results)) fail('BAD_SNAPSHOT', 'not an Objective session snapshot');
    if (!FEEDBACK_TIMINGS.includes(snap.feedbackTiming) || !INTENTS.includes(snap.intent)) fail('BAD_SNAPSHOT', 'unknown timing or intent');
    const state = clone(snap);
    if (!Number.isInteger(state.index) || state.index < 0 || state.index >= state.questions.length) state.index = 0;
    return new ObjectiveSession(state);
  }

  /** The recovery state (recovery-only data: it restores state, never results). */
  snapshot() {
    return clone(this.#s);
  }

  get #q() {
    return this.#s.questions[this.#s.index];
  }

  #answered(q) {
    return isAnswerComplete(q, this.#s.answers[q.id]);
  }

  #revealed(q) {
    // the ONLY places where correctness may be shown: an item graded in Instant, or anything once the paper is submitted
    return this.#s.finished || (this.#s.feedbackTiming === 'instant' && q.id in this.#s.results);
  }

  #feedback(q) {
    if (!this.#revealed(q)) return null;
    const r = this.#s.results[q.id];
    const fb = { correct: r.correct, correctLabel: r.correctLabel, correctAnswer: r.correctAnswer };
    if (typeof q.explanation === 'string') fb.explanation = q.explanation;
    if (q.type === 'single' || q.type === 'multiple') fb.correctOptionIds = q.options.filter((o) => o.correct).map((o) => o.id);
    if (q.type === 'matching') fb.correctPairs = Object.fromEntries(q.pairs.map((p) => [p.id, tokenOf(q.rightOptions.findIndex((x) => x.id === p.rightId))]));
    return fb;
  }

  #presentable(q) {
    const out = { id: q.id, type: q.type, prompt: q.prompt };
    if (q.image) out.image = clone(q.image);
    if (q.audio) out.audio = clone(q.audio);
    if (q.type === 'single' || q.type === 'multiple') out.options = q.options.map((o) => ({ id: o.id, text: o.text }));
    if (q.type === 'matching') {
      out.pairs = q.pairs.map((p) => ({ id: p.id, left: p.left }));
      out.rightOptions = q.rightOptions.map((r, k) => ({ id: tokenOf(k), text: r.text }));
    }
    return out;
  }

  view() {
    const s = this.#s;
    const q = this.#q;
    const instant = s.feedbackTiming === 'instant';
    const graded = s.finished || (instant && q.id in s.results);
    return {
      phase: s.finished ? 'finished' : graded ? 'graded' : 'answering',
      sessionId: s.session.id, intent: s.intent, feedbackTiming: s.feedbackTiming,
      title: s.material.title,
      index: s.index,
      total: s.questions.length,
      progress: { answered: s.questions.filter((x) => this.#answered(x)).length, total: s.questions.length },
      items: s.questions.map((x) => {
        const item = { id: x.id, answered: this.#answered(x) };
        if (this.#revealed(x)) { item.graded = true; item.correct = s.results[x.id].correct; }
        return item;
      }),
      question: this.#presentable(q),
      answer: toView(q, s.answers[q.id]),
      locked: graded,
      canSubmitItem: instant && !graded && this.#answered(q),
      canFinish: !s.finished && (instant ? s.questions.every((x) => x.id in s.results) : true),
      feedback: this.#feedback(q),
    };
  }

  /** Sets (or with `null` clears) the answer of the current question, in the view vocabulary. */
  answer(value) {
    const s = this.#s;
    const q = this.#q;
    if (s.finished) fail('LOCKED', 'the paper is already submitted');
    if (s.feedbackTiming === 'instant' && q.id in s.results) fail('LOCKED', 'a graded item can no longer be changed');
    if (value === null || value === undefined) { delete s.answers[q.id]; return; }
    checkAnswerShape(q, value);
    s.answers[q.id] = toStored(q, value);
  }

  go(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.#s.questions.length) throw new RangeError(`no question at index ${index}`);
    this.#s.index = index;
  }

  /** Instant only: grades the current item; its correct answer and explanation become visible. */
  submitItem() {
    const s = this.#s;
    const q = this.#q;
    if (s.feedbackTiming !== 'instant') fail('NOT_INSTANT', 'there is no per-item grading in submit-at-end; submit the paper');
    if (s.finished) fail('LOCKED', 'the paper is already submitted');
    if (q.id in s.results) fail('LOCKED', 'this item is already graded');
    if (!this.#answered(q)) fail('INCOMPLETE', 'answer the question first');
    s.results[q.id] = gradeQuestion(q, s.answers[q.id]);
    return this.view().feedback;
  }

  /** Submits the paper. Idempotent: the completion time is fixed by the first call. */
  finalize({ now }) {
    const s = this.#s;
    if (!s.finished) {
      if (s.feedbackTiming === 'instant' && !s.questions.every((x) => x.id in s.results)) fail('NOT_GRADED', 'every item must be graded before the paper can be finished');
      if (typeof now !== 'string' || !now) fail('BAD_INPUT', 'a completion time is required');
      for (const q of s.questions) if (!(q.id in s.results)) s.results[q.id] = gradeQuestion(q, s.answers[q.id]);
      s.finished = true;
      s.completedAt = now;
    }
    return this.#payload();
  }

  #payload() {
    const s = this.#s;
    const results = s.questions.map((q) => s.results[q.id]);
    const correctCount = results.filter((r) => r.correct).length;
    const response = {
      schemaVersion: 1,
      documentType: 'quiz-studio.learner-response',
      id: s.evidenceId,
      status: 'finalized',
      finalizedAt: s.completedAt,
      material: { type: 'quiz-paper', id: s.material.id, title: s.material.title, snapshot: { items: clone(s.questions) } },
      session: { id: s.session.id, startedAt: s.session.startedAt, completedAt: s.completedAt },
      responses: s.questions.map((q) => ({ itemId: q.id, answer: s.answers[q.id] === undefined ? null : clone(s.answers[q.id]), result: clone(s.results[q.id]) })),
      summary: { itemCount: s.questions.length, correctCount, percent: Math.round((100 * correctCount) / s.questions.length) },
      provenance: clone(s.provenance),
    };
    return withSessionFacts(response, { intent: s.intent, feedbackTiming: s.feedbackTiming });
  }

  /** The post-submission review: every item with the learner's answer, the verdict, the correct answer and the explanation. */
  review() {
    const s = this.#s;
    if (!s.finished) fail('NOT_FINISHED', 'the review is available once the paper is submitted');
    return s.questions.map((q, i) => {
      const r = s.results[q.id];
      const entry = { id: q.id, index: i, type: q.type, prompt: q.prompt, learnerAnswer: formatAnswer(q, s.answers[q.id]), correct: r.correct, correctLabel: r.correctLabel, correctAnswer: r.correctAnswer };
      if (typeof q.explanation === 'string') entry.explanation = q.explanation;
      return entry;
    });
  }
}

/** The learner's stored answer as readable text (V1's `formatAnswer`); empty when there is none. */
export function formatAnswer(q, answer, labels = DEFAULT_LABELS) {
  if (!isAnswerComplete(q, answer)) return '';
  if (q.type === 'single') return q.options.find((o) => o.id === answer)?.text || '';
  if (q.type === 'multiple') return q.options.filter((o) => answer.includes(o.id)).map((o) => o.text).join(labels.separator);
  if (q.type === 'blank') return answer;
  if (q.type === 'truefalse') return answer ? labels.trueLabel : labels.falseLabel;
  return q.pairs.map((p) => `${p.left} = ${q.rightOptions.find((r) => r.id === answer[p.id])?.text || ''}`).join(labels.pairSeparator);
}
