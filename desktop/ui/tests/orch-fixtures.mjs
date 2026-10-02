// Synthetic evidence builders shared by the Learning Orchestration tests (V1 record shapes, no real data).
export const TODAY = '2026-10-02';
export const T = (day, h = 10) => `2026-${day}T${String(h).padStart(2, '0')}:00:00.000Z`;
export function objResp(id, paper, results, { time = T('09-01'), provenance = { purpose: 'practice' } } = {}) {
  return {
    id,
    rev: 1,
    payload: {
      schemaVersion: 1, documentType: 'quiz-studio.learner-response', id, status: 'finalized', finalizedAt: time,
      material: { type: 'quiz-paper', id: paper }, session: { id: `s-${id}`, startedAt: time, completedAt: time },
      responses: Object.entries(results).map(([itemId, correct]) => ({ itemId, answer: 'x', result: { questionId: itemId, correct } })),
      summary: {}, provenance,
    },
  };
}
export function trResp(id, doc, { annotations = [], marks = [], items = ['ti-1'], time = T('09-01'), provenance = { purpose: 'practice' } } = {}) {
  return {
    id,
    rev: 1,
    payload: {
      schemaVersion: 1, documentType: 'quiz-studio.learner-response', id, status: 'finalized', finalizedAt: time,
      material: { type: 'translation-document', id: doc }, session: { id: `s-${id}`, startedAt: time, completedAt: time },
      responses: items.map((itemId) => ({ itemId, answer: 'text' })), summary: {}, provenance,
      learnerAnnotations: annotations.map(([itemId, kind], i) => ({ itemId, id: `an-${id}-${i}`, kind, start: 0, end: 1, text: 't', createdAt: time })),
      learnerItemMarks: marks.map(([itemId, kind]) => ({ itemId, kind })),
    },
  };
}
export const review = (id, responseId, { judgments = {}, remediation = [], comment = '' } = {}) => ({
  id, rev: 1,
  payload: {
    schemaVersion: 1, documentType: 'quiz-studio.teacher-review', id, responseId, createdAt: T('09-02'), reviewer: { type: 'human' },
    summary: comment, itemReviews: Object.entries(judgments).map(([itemId, judgment]) => ({ itemId, judgment, comment, tags: ['t'] })),
    remediationRecommendations: remediation,
  },
});
export const history = (id, role, paperId, { missed = [], results } = {}) => ({
  id, rev: 1,
  payload: { role, entry: { id: `e-${id}`, paperId, completedAt: T('08-01'), missedQuestionIds: missed, ...(results ? { results } : {}) } },
});
export function snap(parts = {}) {
  return {
    responses: parts.responses ?? [], reviews: parts.reviews ?? [], history: parts.history ?? [],
    origins: new Map((parts.migrated ?? []).map(([collection, id, gaps = []]) => [`${collection}:${id}`, { collection, recordId: id, gaps }])),
    materials: { 'quiz-paper': new Set(parts.papers ?? ['paper-a', 'paper-b']), 'translation-document': new Set(parts.docs ?? ['doc-1', 'doc-2']) },
    schedules: parts.schedules ?? [],
  };
}
export const schedRec = (id, material, { owner = 'user', anchor = TODAY, status = 'active', cadence = { kind: 'once' }, exceptions = [], fulfillments = [], engineBasis = [] } = {}) => ({
  rev: 1,
  payload: {
    schemaVersion: 1, id, slot: { domain: material.type === 'quiz-paper' ? 'objective' : 'translation', material, intent: 'practice' },
    owner, status, cadence, segments: [{ anchor }], createdAt: T('09-01'), updatedAt: T('09-01'),
    ...(owner === 'engine' ? { engine: { reasons: [], algorithmVersion: 'v1', basis: engineBasis } } : {}),
  },
  exceptions, fulfillments, suggestions: [],
});
