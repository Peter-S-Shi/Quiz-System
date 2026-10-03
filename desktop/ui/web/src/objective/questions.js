// Objective question content (Scope Freeze Rev.1 section 10): the five V1 question types, their readiness rules, the
// V1-compatible grading, and the OPTIONAL textual explanation.
//
// An explanation is learning CONTENT that lives on the question (Scope 4.7). It is never an input to grading, never part
// of a result, and never reaches the Readers; it only travels inside the question snapshot of a finalized attempt, so a
// later edit of the source question cannot rewrite history (Scope 10.3). Everything here mirrors the V1 behavior
// (src/core/question-registry.js, grading.js) - the shipped UI cannot import files outside desktop/ui/web, and a
// differential test pins the grading to the unchanged V1 module.

export const QUESTION_TYPES = Object.freeze(['single', 'multiple', 'blank', 'truefalse', 'matching']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
import { newId as makeId } from '../ids.js';
export { makeId };

/** The explanation of an authored question: a string with visible content, kept verbatim; anything else is "none". */
export function normalizeExplanation(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** V1's question normalization, plus the optional explanation (unknown fields are preserved, as V1 does). */
export function normalizeQuestion(question = {}) {
  const type = QUESTION_TYPES.includes(question.type) ? question.type : 'single';
  const n = { ...question, id: question.id || makeId(), type, prompt: question.prompt || '' };
  const explanation = normalizeExplanation(question.explanation);
  if (explanation === undefined) delete n.explanation; else n.explanation = explanation;
  if (type === 'single' || type === 'multiple') {
    n.options = (Array.isArray(question.options) ? question.options : []).map((o) => ({ id: o.id || makeId(), text: o.text || '', correct: Boolean(o.correct) }));
    if (type === 'single' && n.options.length) {
      const first = n.options.find((o) => o.correct);
      n.options.forEach((o, i) => { o.correct = first ? o.id === first.id : i === 0; });
    }
  }
  if (type === 'blank') { n.answers = Array.isArray(question.answers) ? question.answers : []; n.caseSensitive = Boolean(question.caseSensitive); }
  if (type === 'truefalse') n.answer = Boolean(question.answer);
  if (type === 'matching') n.pairs = (Array.isArray(question.pairs) ? question.pairs : []).map((p) => ({ id: p.id || makeId(), left: p.left || '', right: p.right || '' }));
  return n;
}

/** Authoring validation: the V1 readiness rules, and a present explanation must be a string (never silently dropped). */
export function validateQuestion(q) {
  const errs = [];
  if (!isObj(q)) return ['question must be an object'];
  if (!nonEmpty(q.id)) errs.push('question id is required');
  if (!QUESTION_TYPES.includes(q.type)) errs.push(`unknown question type ${JSON.stringify(q.type)}`);
  if (!nonEmpty(q.prompt)) errs.push('prompt is required');
  if ('explanation' in q && q.explanation !== undefined && typeof q.explanation !== 'string') errs.push('explanation must be a string');
  if (q.type === 'single') {
    if (!Array.isArray(q.options) || q.options.length < 2) errs.push('a single-choice question needs at least two options');
    else if (!q.options.some((o) => o.correct && nonEmpty(o.text))) errs.push('a single-choice question needs a correct option with text');
  } else if (q.type === 'multiple') {
    if (!Array.isArray(q.options) || q.options.length < 2) errs.push('a multiple-choice question needs at least two options');
    else if (!q.options.some((o) => o.correct && nonEmpty(o.text))) errs.push('a multiple-choice question needs a correct option with text');
  } else if (q.type === 'blank') {
    if (!Array.isArray(q.answers) || !q.answers.some(Boolean)) errs.push('a fill-in-the-blank question needs an accepted answer');
  } else if (q.type === 'truefalse') {
    if (typeof q.answer !== 'boolean') errs.push('a true/false question needs a boolean answer');
  } else if (q.type === 'matching') {
    if (!Array.isArray(q.pairs) || q.pairs.length < 2 || !q.pairs.every((p) => nonEmpty(p.left) && nonEmpty(p.right))) errs.push('a matching question needs at least two complete pairs');
  }
  return errs;
}

/** V1's completeness rule, on the stored answer format. */
export function isAnswerComplete(question, answer) {
  if (question.type === 'single') return Boolean(answer);
  if (question.type === 'multiple') return Array.isArray(answer) && answer.length > 0;
  if (question.type === 'blank') return Boolean(String(answer || '').trim());
  if (question.type === 'truefalse') return typeof answer === 'boolean';
  if (question.type === 'matching') return question.pairs.every((p) => answer?.[p.id]);
  return false;
}

function shuffle(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** V1's quiz-question preparation (the snapshot form): `sourceId`, shuffled options, matching `rightOptions`. */
export function prepareQuizQuestion(question, rng = Math.random) {
  const c = structuredClone(question);
  c.sourceId = question.id;
  if (c.type === 'single' || c.type === 'multiple') c.options = shuffle(c.options, rng);
  if (c.type === 'matching') {
    c.pairs = c.pairs.map((p) => ({ id: p.id, left: p.left, right: p.right, rightId: p.id }));
    c.rightOptions = shuffle(c.pairs.map((p) => ({ id: p.id, text: p.right })), rng);
  }
  return c;
}

export const DEFAULT_LABELS = Object.freeze({
  correctAnswer: 'Correct answer', acceptedAnswers: 'Accepted answers', correctPairs: 'Correct pairs',
  separator: ', ', pairSeparator: '; ', trueLabel: 'True', falseLabel: 'False',
});

const normText = (v, caseSensitive) => { const t = String(v).trim(); return caseSensitive ? t : t.toLowerCase(); };

function makeResult(q, correct, correctLabel, correctAnswer) {
  return { questionId: q.sourceId || q.id, sessionQuestionId: q.id, type: q.type, prompt: q.prompt, correct, correctLabel, correctAnswer };
}

/** V1's grading, label-injected. The result never includes the explanation. */
export function gradeQuestion(q, answer, labels = DEFAULT_LABELS) {
  if (q.type === 'single') {
    const correct = q.options.find((o) => o.correct);
    return makeResult(q, answer === correct?.id, labels.correctAnswer, correct?.text || '');
  }
  if (q.type === 'multiple') {
    const want = q.options.filter((o) => o.correct).map((o) => o.id).sort();
    const got = Array.isArray(answer) ? [...answer].sort() : [];
    return makeResult(q, JSON.stringify(want) === JSON.stringify(got), labels.correctAnswer, q.options.filter((o) => o.correct).map((o) => o.text).join(labels.separator));
  }
  if (q.type === 'blank') {
    const given = normText(answer || '', q.caseSensitive);
    return makeResult(q, q.answers.map((a) => normText(a, q.caseSensitive)).includes(given), labels.acceptedAnswers, q.answers.join(labels.separator));
  }
  if (q.type === 'truefalse') return makeResult(q, answer === q.answer, labels.correctAnswer, q.answer ? labels.trueLabel : labels.falseLabel);
  const map = answer || {};
  return makeResult(q, q.pairs.every((p) => map[p.id] === p.rightId), labels.correctPairs, q.pairs.map((p) => `${p.left} = ${p.right}`).join(labels.pairSeparator));
}
