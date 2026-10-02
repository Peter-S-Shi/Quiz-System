// Synthetic, V1-valid native session records for the Task-Domain Integration tests (no real data).
import { buildTypingAttempt } from '../web/src/task-domains/typing/attempt.js';

export const SESSION_EXT_KEY = 'quiz-studio.v2.session';
export const T0 = '2026-10-02T09:00:00.000Z';
export const T1 = '2026-10-02T09:05:00.000Z';

const ext = (extra) => ({ [SESSION_EXT_KEY]: { schemaVersion: 1, intent: 'practice', ...extra } });

/** A V1-valid Objective Learner Response: items q1..qN, `wrong` lists the item ids answered incorrectly. */
export function nativeObjective(id, paper = 'paper-a', { wrong = ['q1'], items = ['q1', 'q2'], intent = 'practice', feedbackTiming = 'instant', time = T1, provenance = { purpose: 'practice' }, paperTitle = 'Paper' } = {}) {
  const responses = items.map((itemId) => ({ itemId, answer: 'x', result: { questionId: itemId, correct: !wrong.includes(itemId) } }));
  return {
    schemaVersion: 1, documentType: 'quiz-studio.learner-response', id, status: 'finalized', finalizedAt: time,
    material: { type: 'quiz-paper', id: paper, title: paperTitle, snapshot: { items: items.map((itemId) => ({ id: itemId, type: 'single-choice', prompt: `Q ${itemId}` })) } },
    session: { id: `sess-${id}`, startedAt: time, completedAt: time },
    responses,
    summary: { itemCount: items.length, correctCount: responses.filter((r) => r.result.correct).length, percent: Math.round((100 * responses.filter((r) => r.result.correct).length) / items.length) },
    provenance,
    extensions: ext({ intent, feedbackTiming }),
  };
}

/** A V1-valid Translation Learner Response (never result/correctCount/percent). */
export function nativeTranslation(id, doc = 'doc-1', { items = ['ti-1'], annotations = [], marks = [], intent = 'practice', time = T1, provenance = { purpose: 'practice' }, answer = 'The environment matters.' } = {}) {
  const r = {
    schemaVersion: 1, documentType: 'quiz-studio.learner-response', id, status: 'finalized', finalizedAt: time,
    material: { type: 'translation-document', id: doc, title: 'Doc', snapshot: { items: items.map((itemId) => ({ id: itemId, source: `src ${itemId}` })) } },
    session: { id: `sess-${id}`, startedAt: time, completedAt: time },
    responses: items.map((itemId) => ({ itemId, answer })),
    summary: { itemCount: items.length },
    provenance,
  };
  if (annotations.length) r.learnerAnnotations = annotations.map(([itemId, kind, start, end], i) => ({ itemId, id: `an-${id}-${i}`, kind, start, end, text: answer.slice(start, end), createdAt: time }));
  if (marks.length) r.learnerItemMarks = marks.map(([itemId, kind]) => ({ itemId, kind }));
  r.extensions = ext({ ...(annotations.length ? { offsetEncoding: 'utf16-code-unit' } : {}) , intent });
  return r;
}

/** A finalized typing attempt built through the real builder. */
export function nativeTyping(id, { text = 'environment', typed = 'environment', material = 'typing-1', intent = 'practice', feedbackTiming, corrections = 'allowed', time = T1, provenance } = {}) {
  return buildTypingAttempt({
    id,
    material: { id: material, title: 'Copy text', text },
    session: { id: `sess-${id}`, startedAt: T0, completedAt: time },
    intent,
    policy: { feedbackTiming: feedbackTiming ?? (intent === 'test' ? 'on-completion' : 'live'), corrections },
    committedText: typed,
    provenance: provenance ?? { purpose: 'practice', createdAt: time },
  });
}
