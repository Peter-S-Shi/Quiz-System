// Synthetic Objective papers for the Answer Explanation / Focused Practice tests (no real data).

/** A deterministic rng (LCG) so shuffles are reproducible in tests. */
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** One question of each of the five Objective types; every one carries an explanation with a unique marker. */
export function paperWithExplanations({ id = 'paper-x', explain = true } = {}) {
  const e = (k) => (explain ? { explanation: `EXPL-${k}: because of reason ${k}` } : {});
  return {
    schemaVersion: 2, id, title: 'Synthetic paper', category: '', tags: [],
    questions: [
      { id: 'q-single', type: 'single', prompt: 'Pick the capital of France', options: [
        { id: 'o1', text: 'Paris', correct: true }, { id: 'o2', text: 'Rome', correct: false }, { id: 'o3', text: 'Oslo', correct: false }], ...e('single') },
      { id: 'q-multi', type: 'multiple', prompt: 'Pick the primes', options: [
        { id: 'm1', text: '2', correct: true }, { id: 'm2', text: '4', correct: false }, { id: 'm3', text: '7', correct: true }, { id: 'm4', text: '9', correct: false }], ...e('multi') },
      { id: 'q-blank', type: 'blank', prompt: 'The chemical symbol for water is ___', answers: ['H2O', 'hydrogen oxide'], caseSensitive: false, ...e('blank') },
      { id: 'q-tf', type: 'truefalse', prompt: 'The sun is a star', answer: true, ...e('tf') },
      { id: 'q-match', type: 'matching', prompt: 'Match the pairs', pairs: [
        { id: 'p1', left: 'cat', right: 'meow' }, { id: 'p2', left: 'dog', right: 'woof' }, { id: 'p3', left: 'cow', right: 'moo' }], ...e('match') },
    ],
  };
}

/** What a learner who reads the screen would answer correctly: computed from the VIEW's visible texts only. */
export function correctAnswerForView(view, source) {
  const q = source.questions.find((x) => x.id === view.question.id);
  const optionByText = (text) => view.question.options.find((o) => o.text === text).id;
  if (q.type === 'single') return optionByText(q.options.find((o) => o.correct).text);
  if (q.type === 'multiple') return q.options.filter((o) => o.correct).map((o) => optionByText(o.text));
  if (q.type === 'blank') return q.answers[0];
  if (q.type === 'truefalse') return q.answer;
  return Object.fromEntries(q.pairs.map((p) => [p.id, view.question.rightOptions.find((r) => r.text === p.right).id]));
}

/** A deliberately wrong answer for the same question. */
export function wrongAnswerForView(view, source) {
  const q = source.questions.find((x) => x.id === view.question.id);
  if (q.type === 'single') return view.question.options.find((o) => o.text !== q.options.find((x) => x.correct).text).id;
  if (q.type === 'multiple') return [view.question.options.find((o) => !q.options.find((x) => x.text === o.text).correct).id];
  if (q.type === 'blank') return 'definitely wrong';
  if (q.type === 'truefalse') return !q.answer;
  const [a, b] = q.pairs;
  return Object.fromEntries(q.pairs.map((p) => [p.id, view.question.rightOptions.find((r) => r.text === (p === a ? b.right : p === b ? a.right : p.right)).id]));
}
