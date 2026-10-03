// The visual hierarchy of an Objective result, shared by the post-submit result and Evidence History (so the two read
// alike): a summary hero (score first), then per-question cards that separate the prompt, the learner's answer, the
// verdict, the correct answer and - as secondary learning content - the explanation. Colour is never alone: every tone
// is paired with a glyph and a word. Presentation only: it renders facts it is given and decides nothing.
import { defineStrings, t } from '../i18n.js';
import { scoreBand } from '../objective/score-band.js';
import { h, sr } from './dom.js';

defineStrings({
  'pr.score.band.perfect': ['Full score', '满分'],
  'pr.score.band.high': ['90–99%', '90–99%'],
  'pr.score.band.mid': ['70–89%', '70–89%'],
  'pr.score.band.low': ['Below 70%', '低于 70%'],
  'pr.score.of': ['{correct} / {total}', '{correct} / {total}'],
  'pr.score.flower': ['Every question correct', '全部答对'],
  'pr.rv.q': ['Q{n}', '第 {n} 题'],
  'pr.rv.verdict.correct': ['Correct', '正确'],
  'pr.rv.verdict.incorrect': ['Incorrect', '错误'],
  'pr.rv.verdict.ungraded': ['Not graded', '未评分'],
});

const GLYPH = { perfect: '✿', high: '✓', mid: '◆', low: '▲' };

/** @param {{correct: number, total: number}} s */
export function scoreHero({ correct, total }) {
  const { band, tone, percent } = scoreBand({ correct, total });
  return h('section', { class: `score-hero tone-${tone} band-${band}`, 'aria-label': t(`pr.score.band.${band}`), 'data-band': band },
    h('div', { class: 'score-main' },
      h('span', { class: 'score-num' }, t('pr.score.of', { correct, total })),
      h('span', { class: 'score-pct' }, `${percent}%`)),
    h('div', { class: 'score-badge' }, h('span', { class: 'glyph', 'aria-hidden': 'true' }, GLYPH[band]), h('span', {}, t(`pr.score.band.${band}`)),
      band === 'perfect' ? sr(` — ${t('pr.score.flower')}`) : null));
}

/**
 * One reviewed question.
 * @param {object} q `{ index, prompt, answered, answer, correct (true|false|null), correctLabel, correctAnswer, explanation }`
 * @param {object} labels `{ answer, noAnswer, correctAnswer, explanation }` (History says "Explanation at that time")
 * @param {Node|null} [extra] e.g. the question's media
 */
export function reviewCard(q, labels, extra = null) {
  const verdict = q.correct === true ? 'correct' : q.correct === false ? 'incorrect' : 'ungraded';
  const glyph = { correct: '✓', incorrect: '✗', ungraded: '–' }[verdict];
  return h('li', { class: `rv ${verdict}`, 'data-verdict': verdict },
    h('div', { class: 'rv-head' },
      h('span', { class: 'rv-num' }, t('pr.rv.q', { n: q.index + 1 })),
      h('span', { class: `rv-verdict ${verdict}` }, h('span', { class: 'glyph', 'aria-hidden': 'true' }, glyph), t(`pr.rv.verdict.${verdict}`))),
    h('p', { class: 'rv-prompt' }, q.prompt),
    extra,
    h('div', { class: `rv-answer ${verdict}` }, h('span', { class: 'rv-label' }, labels.answer), q.answered ? h('span', { class: 'rv-value' }, q.answer) : h('em', { class: 'rv-value muted' }, labels.noAnswer)),
    q.correct === false && q.correctAnswer ? h('div', { class: 'rv-correct' }, h('span', { class: 'rv-label' }, q.correctLabel || labels.correctAnswer), h('span', { class: 'rv-value' }, q.correctAnswer)) : null,
    typeof q.explanation === 'string' && q.explanation ? h('aside', { class: 'rv-explain' }, h('h4', {}, labels.explanation), h('p', { class: 'explanation-text' }, q.explanation)) : null);
}
