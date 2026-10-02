// Generates the synthetic V1 backup fixtures used by the Migration milestone (ADR 0002 section 16.1).
//
// "Producer-faithful": every backup is produced by V1's own `createLibraryBackup` and interchange builders
// (imported read-only from the repository root), so the format is exactly what V1 writes - and the same V1
// code is the differential oracle in the tests. All data is synthetic: no real names, e-mails or paths.
//
//   node desktop/scripts/gen-v1-fixtures.mjs            (writes desktop/core/migrate_v1/tests/fixtures/*.json)

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLibraryBackup } from '../../src/core/backup.js';
import { createQuizLearnerResponse, createTranslationLearnerResponse } from '../../src/core/interchange.js';
import { gradeQuestion } from '../../src/core/grading.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'core', 'migrate_v1', 'tests', 'fixtures');
mkdirSync(out, { recursive: true });

const LABELS = {
  correctAnswer: 'Correct answer',
  acceptedAnswers: 'Accepted answers',
  separator: ', ',
  trueLabel: 'True',
  falseLabel: 'False',
  pairSeparator: '; ',
  correctPairs: 'Correct pairs',
};

const T0 = '2025-03-01T09:00:00.000Z';
const T1 = '2025-03-01T09:10:00.000Z';
const T2 = '2025-03-02T10:00:00.000Z';

// 1x1 PNG, a tiny WAV header, distinct synthetic bytes
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const WAV = Buffer.concat([Buffer.from('RIFF$\0\0\0WAVEfmt ', 'binary'), Buffer.alloc(24, 7)]);

function asset(id, mimeType, name, bytes) {
  return { id, mimeType, name, size: bytes.length, data: bytes.toString('base64') };
}

function paperA() {
  return {
    schemaVersion: 1,
    id: 'paper-a',
    title: 'Sample Paper A',
    description: 'Synthetic paper with every question type',
    category: 'Cat A',
    tags: ['demo', 'synthetic'],
    createdAt: T0,
    updatedAt: T1,
    lastOpenedAt: T2,
    questions: [
      { id: 'q-single', type: 'single', prompt: 'Pick the right one', image: { id: 'img-1', mimeType: 'image/png', name: 'one.png', size: PNG.length, alt: 'a pixel' },
        options: [{ id: 'o1', text: 'Right', correct: true }, { id: 'o2', text: 'Wrong', correct: false }] },
      { id: 'q-multi', type: 'multiple', prompt: 'Pick all that apply', audio: { id: 'aud-1', mimeType: 'audio/wav', name: 'tone.wav', size: WAV.length, duration: 1 },
        options: [{ id: 'm1', text: 'A', correct: true }, { id: 'm2', text: 'B', correct: true }, { id: 'm3', text: 'C', correct: false }] },
      { id: 'q-blank', type: 'blank', prompt: 'Fill in: ___', answers: ['answer', 'reply'], caseSensitive: false },
      { id: 'q-tf', type: 'truefalse', prompt: 'The sky is blue', answer: true },
      { id: 'q-match', type: 'matching', prompt: 'Match them', pairs: [{ id: 'p1', left: 'cat', right: 'meow' }, { id: 'p2', left: 'dog', right: 'woof' }] },
    ],
  };
}

function paperB() {
  // legal cross-paper duplicate question id (D-11): "q-single" also exists in paper A
  return {
    schemaVersion: 1,
    id: 'paper-b',
    title: 'Sample Paper B',
    description: '',
    category: 'Cat A',
    tags: [],
    createdAt: T0,
    updatedAt: T0,
    lastOpenedAt: T0,
    questions: [
      { id: 'q-single', type: 'single', prompt: 'Same id, other paper', options: [{ id: 'b1', text: 'Yes', correct: true }, { id: 'b2', text: 'No', correct: false }] },
      { id: 'q-tf-b', type: 'truefalse', prompt: 'Water is dry', answer: false },
    ],
  };
}

function snapshot(question) {
  const c = structuredClone(question);
  c.sourceId = question.id;
  if (c.type === 'single' || c.type === 'multiple') c.options = [...c.options].reverse();
  if (c.type === 'matching') {
    c.pairs = c.pairs.map((p) => ({ id: p.id, left: p.left, right: p.right, rightId: p.id }));
    c.rightOptions = [...c.pairs].reverse().map((p) => ({ id: p.id, text: p.right }));
  }
  return c;
}

function objectiveResponse(id, sessionId, paper, answers, startedAt, completedAt) {
  const questions = paper.questions.map(snapshot);
  const results = questions.map((q) => gradeQuestion(q, answers[q.sourceId], LABELS));
  const correctCount = results.filter((r) => r.correct).length;
  const session = {
    id: sessionId, paperId: paper.id, paperTitle: paper.title, startedAt, completedAt,
    questions, answers, results, correctCount, percent: (correctCount / questions.length) * 100,
  };
  return { response: createQuizLearnerResponse({ id, session }), session };
}

const ANSWER = 'I think 猫 is a cat 😀 and 犬 is a dog — réponse ça va';

function translationResponse(id, sessionId, docId, provenance) {
  const items = [
    { id: 'ti-1', sourceText: 'The cat sleeps.', position: 0, referenceTranslation: '猫は眠る。' },
    { id: 'ti-2', sourceText: 'The dog runs.', position: 1 },
  ];
  const i = ANSWER.indexOf('猫');
  const j = ANSWER.indexOf('😀');
  const session = {
    id: sessionId, documentId: docId, documentTitle: 'Animals', startedAt: T0, completedAt: T1,
    sourceLanguage: 'en', targetLanguage: 'zh', items,
    answers: { 'ti-1': ANSWER, 'ti-2': 'plain ascii answer' },
    annotations: {
      'ti-1': [
        { id: 'an-1', kind: 'unknown', start: i, end: i + 1, text: '猫', createdAt: T1 },
        { id: 'an-2', kind: 'uncertain', start: j, end: j + 2, text: '😀', createdAt: T1 },
        { id: 'an-3', kind: 'should_know', start: ANSWER.indexOf('réponse'), end: ANSWER.indexOf('réponse') + 7, text: 'réponse', createdAt: T1 },
      ],
    },
    itemMarks: { 'ti-2': 'uncertain' },
    materialProvenance: provenance,
  };
  return createTranslationLearnerResponse({ id, session });
}

function review(id, responseId, itemId, corrections, comment) {
  return {
    schemaVersion: 1,
    documentType: 'quiz-studio.teacher-review',
    id,
    responseId,
    createdAt: T2,
    reviewer: { type: 'human', displayLabel: 'Reviewer A' },
    summary: 'Synthetic review',
    itemReviews: [{ itemId, judgment: 'partial', comment, tags: ['grammar'], suggestedRevision: 'a revision', corrections }],
    remediationRecommendations: [{ focus: 'articles' }],
  };
}

function build({ papers, categories, history = [], learnerResponses = [], teacherReviews = [], translationLibrary, mediaAssets = [] }) {
  return createLibraryBackup({
    library: { schemaVersion: 1, papers, categories },
    history,
    learnerResponses,
    teacherReviews,
    translationLibrary,
    mediaAssets,
    exportedAt: '2025-04-01T12:00:00.000Z',
  });
}

function write(name, value) {
  writeFileSync(join(out, name), JSON.stringify(value, null, 2) + '\n');
  console.log('wrote', name);
}

// ---------------------------------------------------------------- R-min
write('r-min.json', build({
  papers: [{ schemaVersion: 1, id: 'paper-min', title: 'Minimal', description: '', category: '', tags: [], createdAt: T0, updatedAt: T0, lastOpenedAt: T0,
    questions: [{ id: 'q1', type: 'truefalse', prompt: 'Minimal question', answer: true }] }],
  categories: [],
  translationLibrary: { schemaVersion: 1, folders: [], documents: [] },
}));

// ---------------------------------------------------------------- R-full
const a = paperA();
const b = paperB();
const obj1 = objectiveResponse('lr-obj-1', 'sess-1', a, { 'q-single': 'o1', 'q-multi': ['m1', 'm2'], 'q-blank': 'answer', 'q-tf': true, 'q-match': { p1: 'p1', p2: 'p2' } }, T0, T1);
const obj2 = objectiveResponse('lr-obj-2', 'sess-2', b, { 'q-single': 'b2', 'q-tf-b': false }, T1, T2);
const trans1 = translationResponse('lr-tr-1', 'sess-t1', 'doc-1', undefined);
const retry = translationResponse('lr-tr-retry', 'sess-t2', 'doc-1-retry', { purpose: 'retry', sourceResponseId: 'lr-gone', sourceMaterialId: 'doc-1', createdAt: T2 });
const corr = (id, start, end, anchoredText, operation, text) => ({ id, operation, start, end, anchoredText, ...(text !== undefined ? { text } : {}), createdAt: T2 });
const i1 = ANSWER.indexOf('猫');
const reviews = [
  review('tr-1', 'lr-tr-1', 'ti-1', [corr('c-1', i1, i1 + 1, '猫', 'replace', '猫咪'), corr('c-2', 0, 0, '', 'insert', 'Well, ')], 'First review'),
  review('tr-2', 'lr-tr-1', 'ti-2', [], 'Second review of the same response'),
  review('tr-3', 'lr-tr-retry', 'ti-1', [], 'Review of the retry'),
];
const remediation = {
  schemaVersion: 1, documentType: 'quiz-studio.translation-document', id: 'doc-remed', title: 'Remediation', folderId: 'folder-1', sourceLanguage: 'en', targetLanguage: 'zh',
  createdAt: T2, updatedAt: T2,
  items: [{ id: 'ri-1', sourceText: 'Practice again.', position: 0 }],
  provenance: { purpose: 'remediation', sourceResponseId: 'lr-tr-1', sourceReviewId: 'tr-1', sourceMaterialId: 'doc-1', createdAt: T2, author: { type: 'external-ai', toolName: 'synthetic-tool' } },
};
const doc1 = {
  schemaVersion: 1, documentType: 'quiz-studio.translation-document', id: 'doc-1', title: 'Animals', folderId: 'folder-1', sourceLanguage: 'en', targetLanguage: 'zh',
  createdAt: T0, updatedAt: T1,
  items: [{ id: 'ti-1', sourceText: 'The cat sleeps.', position: 0, referenceTranslation: '猫は眠る。' }, { id: 'ti-2', sourceText: 'The dog runs.', position: 1, notes: 'a note' }],
};
const histEntry = (session, response, extra = {}) => ({
  id: session.id, paperId: session.paperId, paperTitle: session.paperTitle, completedAt: session.completedAt,
  questionCount: session.questions.length, correctCount: session.correctCount, percent: session.percent,
  responseId: response.id, missedQuestionIds: session.results.filter((r) => !r.correct).map((r) => r.questionId), results: session.results, ...extra,
});
const history = [
  histEntry(obj2.session, obj2.response),
  histEntry(obj1.session, obj1.response, { percent: 12.5 }), // divergent: the entry disagrees with its Learner Response
  { id: 'sess-old', paperId: 'paper-gone', paperTitle: 'An older paper', completedAt: T0, questionCount: 3, correctCount: 1, percent: 33.333333333333336, missedQuestionIds: ['x', 'y'], results: [] }, // legacy-only (no responseId)
];
const mediaAssets = [asset('img-1', 'image/png', 'one.png', PNG), asset('aud-1', 'audio/wav', 'tone.wav', WAV), asset('img-1-copy', 'image/png', 'copy.png', PNG)];
a.questions[0].image.id = 'img-1';
b.questions[0].image = { id: 'img-1-copy', mimeType: 'image/png', name: 'copy.png', size: PNG.length };
write('r-full.json', build({
  papers: [a, b],
  categories: ['Cat A', 'Empty Cat'],
  history,
  learnerResponses: [obj1.response, obj2.response, trans1, retry],
  teacherReviews: reviews,
  translationLibrary: { schemaVersion: 1, folders: [{ id: 'folder-1', name: 'Folder One', createdAt: T0, updatedAt: T0 }], documents: [doc1, remediation] },
  mediaAssets,
}));

// ---------------------------------------------------------------- R-hist100: exactly 100 history entries
write('r-hist100.json', build({
  papers: [{ schemaVersion: 1, id: 'paper-h', title: 'History paper', description: '', category: '', tags: [], createdAt: T0, updatedAt: T0, lastOpenedAt: T0,
    questions: [{ id: 'q1', type: 'truefalse', prompt: 'Q', answer: true }] }],
  categories: [],
  history: Array.from({ length: 100 }, (_, i) => ({ id: `h-${i}`, paperId: 'paper-h', paperTitle: 'History paper', completedAt: T0, questionCount: 1, correctCount: 1, percent: 100, missedQuestionIds: [], results: [] })),
  translationLibrary: { schemaVersion: 1, folders: [], documents: [] },
}));

console.log('done');
