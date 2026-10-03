// Evidence History: what was actually recorded, shown as recorded. A list and a detail pane (no page jumps). Evidence is
// immutable: this view offers retry (a NEW session with recorded lineage), review and export of a request, never edit or
// delete. No mastery level, streak or score beyond the one an Objective record itself carries.
import { defineStrings, t } from '../../i18n.js';
import { durationLine } from '../../duration.js';
import { annotatedNodes, projectionNodes } from '../correction-view.js';
import { mediaBlock } from '../../practice/media-presenter.js';
import { reviewCard, scoreHero } from '../../practice/result-view.js';
import { domainDot, domainName, emptyState, fill, formatInstant, guarded, h, intentName, pill, seg } from '../kit.js';
import { exportFile } from '../import-flows.js';

defineStrings({
  'hist.kicker': ['Evidence history', '证据历史'],
  'hist.title': ['Evidence history', '证据历史'],
  'hist.lede': ['Every attempt is recorded as it was. It stays even if the material is deleted.', '每次作答都按当时的样子记录下来。材料删除后，证据仍然保留。'],
  'hist.filter': ['Show', '显示'],
  'hist.search': ['Search by title…', '按标题搜索…'],
  'hist.empty': ['Nothing has been recorded yet.', '还没有任何记录。'],
  'hist.emptyBody': ['Finish a practice and it appears here.', '完成一次练习后，它会出现在这里。'],
  'hist.noMatch': ['No record matches.', '没有符合条件的记录。'],
  'hist.pick': ['Select a record to see it here.', '选择一条记录即可在这里查看。'],
  'hist.row.result': ['{correct} of {total} correct', '答对 {correct} / {total}'],
  'hist.row.noResult': ['{total} items', '{total} 题'],
  'hist.row.translation': ['{answered} of {total} answered', '已作答 {answered} / {total}'],
  'hist.row.typing': ['{errors} difference(s) in {chars} characters', '{chars} 个字符中有 {errors} 处差异'],
  'hist.row.untitled': ['(material without a title)', '（无标题的材料）'],
  'hist.pill.retry': ['Retry', '重做'],
  'hist.pill.remediation': ['Remediation', '补救'],
  'hist.pill.migrated': ['From V1', '来自 V1'],
  'hist.pill.legacy': ['V1 history entry', 'V1 历史记录'],
  'hist.pill.reviews': ['{n} review(s)', '{n} 份批改'],
  'hist.unknownTime': ['Time not recorded', '未记录时间'],
  'hist.detail.recorded': ['Recorded result', '记录的结果'],
  'hist.detail.noScore': ['Translation is not scored; this is what you wrote and marked.', '翻译不评分；这里是你写下的译文和标记。'],
  'hist.detail.legacyNote': ['This is a record from Quiz Studio V1. V1 did not keep your answers or the questions, so only what it recorded is shown.', '这是来自 Quiz Studio V1 的记录。V1 没有保存你的答案和题目原文，所以只显示它当时记录的内容。'],
  'hist.actions.retryWrong': ['Retry the incorrect ones', '重做答错的题'],
  'hist.actions.retryMarked': ['Retry the marked sentences', '重做标记过的句子'],
  'hist.actions.retryAll': ['Retry everything', '全部重做'],
  'hist.actions.typingAgain': ['Try this passage again', '再打一遍这段文字'],
  'hist.actions.review': ['Open in Review', '到批改台查看'],
  'hist.actions.requestExport': ['Export for external review…', '导出给外部批改…'],
  'hist.q.answer': ['Your answer', '你的答案'],
  'hist.q.unanswered': ['(no answer)', '（未作答）'],
  'hist.q.correctAnswer': ['Correct answer', '正确答案'],
  'hist.q.explanation': ['Explanation at that time', '当时的解析'],
  'hist.q.correct': ['Correct', '正确'],
  'hist.q.incorrect': ['Incorrect', '错误'],
  'hist.q.ungraded': ['Not graded', '未评分'],
  'hist.tr.source': ['Source', '原文'],
  'hist.tr.answer': ['Your translation', '你的译文'],
  'hist.tr.reference': ['Reference (shown on request)', '参考译文（按需显示）'],
  'hist.tr.showReference': ['Show the reference', '显示参考译文'],
  'hist.tr.empty': ['(left empty)', '（留空）'],
  'hist.tr.itemMark': ['Marked for the whole sentence: {kind}', '整句标记：{kind}'],
  'hist.tr.judgment.correct': ['correct', '正确'],
  'hist.tr.judgment.incorrect': ['incorrect', '错误'],
  'hist.tr.judgment.partial': ['partially correct', '部分正确'],
  'hist.tr.judgment.needs-review': ['needs a second look', '待复核'],
  'hist.tr.reviewBy': ['Review {id}', '批改 {id}'],
  'hist.tr.suggested': ['Suggested rewrite: {text}', '建议改写：{text}'],
  'hist.ty.counts': ['{ref} characters in the text, {com} typed', '原文 {ref} 个字符，输入了 {com} 个'],
  'hist.ty.corrected': ['{n} mistake(s) corrected while typing', '输入过程中改正了 {n} 处'],
  'hist.ty.noDifferences': ['No differences.', '没有差异。'],
  'hist.ty.kind.omission': ['Missing', '漏打'],
  'hist.ty.kind.insertion': ['Extra', '多打'],
  'hist.ty.kind.substitution': ['Different', '打错'],
  'hist.ty.expected': ['expected', '应为'],
  'hist.ty.typed': ['typed', '实际'],
  'hist.ty.policy': ['{timing}, corrections {corrections}', '{timing}，{corrections}修改'],
  'hist.ty.live': ['live feedback', '实时反馈'],
  'hist.ty.onCompletion': ['feedback at the end', '完成后反馈'],
  'hist.ty.allowed': ['allowed', '允许'],
  'hist.ty.disallowed': ['not allowed', '不允许'],
  'hist.lineage.of': ['A retry of an earlier record', '这是对一条较早记录的重做'],
  'hist.lineage.missing': ['It retries a record that is no longer here.', '它重做的那条记录已不在这里。'],
  'hist.lineage.by': ['Retried later', '之后的重做'],
  'hist.lineage.open': ['Open', '打开'],
  'hist.media.unavailable': ['Its image or audio cannot be shown.', '它的图片或音频无法显示。'],
});

const FILTERS = ['all', 'objective', 'translation', 'typing'];

export async function renderHistory(app, main, params = {}) {
  const { history } = app.product;
  const toast = app.toast;
  const st = { domain: params.domain ?? 'all', query: '', selected: params.select ?? null };
  let loaded = await history.load();

  const rows = h('div', { class: 'list', role: 'listbox', 'aria-label': t('hist.title') });
  const detail = h('div', { class: 'col-c', 'aria-live': 'polite' });
  const search = h('input', { type: 'search', id: 'hist-search', 'aria-label': t('hist.search'), placeholder: t('hist.search'), oninput: (e) => { st.query = e.target.value; paintList(); } });

  const rowFacts = (e) => {
    const f = e.facts;
    if (f.kind === 'objective') return f.correctCount === null ? t('hist.row.noResult', { total: f.itemCount }) : t('hist.row.result', { correct: f.correctCount, total: f.itemCount });
    if (f.kind === 'translation') return t('hist.row.translation', { answered: f.answered, total: f.itemCount });
    if (f.kind === 'typing') return t('hist.row.typing', { errors: f.errorCount, chars: f.referenceGraphemes });
    return '';
  };

  function paintList() {
    const items = history.filter(loaded.entries, { domain: st.domain, query: st.query });
    if (!loaded.entries.length) { fill(rows, emptyState({ title: t('hist.empty'), body: t('hist.emptyBody') })); return; }
    if (!items.length) { fill(rows, emptyState({ title: t('hist.noMatch') })); return; }
    fill(rows, items.map((e) => h('button', { type: 'button', role: 'option', class: `row-item dom-${e.domain}${st.selected === e.key ? ' on' : ''}`, 'aria-selected': String(st.selected === e.key), 'data-key': e.key,
      onclick: () => { st.selected = e.key; paintList(); paintDetail(); detail.querySelector('h2')?.focus(); } },
    domainDot(e.domain),
    h('span', { class: 'grow' }, h('b', {}, e.title || t('hist.row.untitled')), h('span', { class: 'muted small' }, ` ${rowFacts(e)}`), h('br'), h('span', { class: 'mono muted small' }, e.completedAt ? formatInstant(e.completedAt) : t('hist.unknownTime'))),
    e.purpose === 'retry' ? pill(t('hist.pill.retry')) : null, e.purpose === 'remediation' ? pill(t('hist.pill.remediation')) : null, e.legacy ? pill(t('hist.pill.legacy'), 'info') : e.migrated ? pill(t('hist.pill.migrated'), 'info') : null)));
  }

  // ---------------------------------------------------------------------------------------------- detail
  async function mediaFor(items) {
    const refs = items.flatMap((i) => [i.image ? { kind: 'image', id: i.image.id } : null, i.audio ? { kind: 'audio', id: i.audio.id } : null]).filter((r) => r && r.id);
    if (refs.length) await app.product.media.prove(refs);
  }

  function objectiveBody(d) {
    const graded = d.items.filter((i) => i.correct !== null);
    const labels = { answer: t('hist.q.answer'), noAnswer: t('hist.q.unanswered'), correctAnswer: t('hist.q.correctAnswer'), explanation: t('hist.q.explanation') };
    const mediaLabels = { image: t('hist.q.answer'), audio: t('hist.q.answer'), imageUnavailable: t('hist.media.unavailable'), audioUnavailable: t('hist.media.unavailable') };
    return h('div', {},
      graded.length === d.items.length && d.items.length ? scoreHero({ correct: graded.filter((i) => i.correct).length, total: graded.length }) : null,
      h('ol', { class: 'review-list rv-list' }, d.items.map((i, index) => reviewCard({ ...i, index }, labels, mediaBlock(app.product.media, i, mediaLabels)))));
  }

  function translationBody(d) {
    return h('ol', { class: 'review-list' }, d.items.map((i) => h('li', { class: 'ritem' },
      h('div', {}, h('span', { class: 'label' }, `${t('hist.tr.source')}: `), h('span', { class: 'serif' }, i.sourceText)),
      h('div', {}, h('span', { class: 'label' }, `${t('hist.tr.answer')}: `), i.answer ? h('span', { class: 'answer-text' }, annotatedNodes(i.answer, i.annotations)) : h('span', { class: 'muted' }, t('hist.tr.empty'))),
      i.mark ? h('div', { class: 'muted small' }, t('hist.tr.itemMark', { kind: t(`mark.${i.mark}`) })) : null,
      i.referenceTranslation ? h('details', {}, h('summary', {}, t('hist.tr.showReference')), h('p', { class: 'serif' }, i.referenceTranslation)) : null,
      i.review.map((rv) => h('div', { class: 'review-note' },
        h('div', { class: 'row small' }, h('b', {}, t('hist.tr.reviewBy', { id: rv.reviewId.slice(0, 8) })), rv.judgment ? pill(t(`hist.tr.judgment.${rv.judgment}`), rv.judgment === 'correct' ? 'ok' : 'warn') : null),
        rv.corrections.length && i.answer ? h('div', { class: 'answer-text' }, projectionNodes(i.answer, rv.corrections)) : null,
        rv.comment ? h('p', {}, rv.comment) : null,
        rv.suggestedRevision ? h('p', { class: 'muted' }, t('hist.tr.suggested', { text: rv.suggestedRevision })) : null)))));
  }

  function typingBody(d) {
    const timing = d.policy?.feedbackTiming === 'on-completion' ? t('hist.ty.onCompletion') : t('hist.ty.live');
    return h('div', {},
      h('p', {}, t('hist.ty.counts', { ref: d.counts?.referenceGraphemes ?? 0, com: d.counts?.committedGraphemes ?? 0 })),
      h('p', {}, durationLine(d.session)),
      d.policy ? h('p', { class: 'muted small' }, t('hist.ty.policy', { timing, corrections: d.policy.corrections === 'allowed' ? t('hist.ty.allowed') : t('hist.ty.disallowed') })) : null,
      d.correctedErrorCount ? h('p', { class: 'muted small' }, t('hist.ty.corrected', { n: d.correctedErrorCount })) : null,
      d.errors.length
        ? h('ul', { class: 'diffs' }, d.errors.map((e) => h('li', {}, h('b', {}, t(`hist.ty.kind.${e.kind}`)), ' ', e.reference ? h('span', {}, `${t('hist.ty.expected')} `, h('q', {}, e.reference)) : null, e.committed ? h('span', {}, ` ${t('hist.ty.typed')} `, h('q', {}, e.committed)) : null)))
        : h('p', {}, t('hist.ty.noDifferences')));
  }

  function legacyBody(d) {
    return h('div', {}, h('p', { class: 'muted' }, t('hist.detail.legacyNote')),
      h('ol', { class: 'review-list' }, d.items.map((i) => h('li', { class: `ritem ${i.correct === true ? 'good' : i.correct === false ? 'bad' : ''}` }, h('b', {}, i.prompt || i.id), ' ', i.correct === null ? null : pill(i.correct ? t('hist.q.correct') : t('hist.q.incorrect'), i.correct ? 'ok' : 'warn')))));
  }

  async function paintDetail() {
    const entry = loaded.entries.find((e) => e.key === st.selected);
    if (!entry) { fill(detail, emptyState({ title: t('hist.pick') })); return; }
    const d = history.detail(entry, loaded);
    if (!d) { fill(detail, emptyState({ title: t('hist.pick') })); return; }
    if (d.kind === 'objective') await mediaFor(d.items);
    const lineage = entry.collection === 'learner_response' ? history.lineage(entry, loaded) : null;
    const wrongCount = d.kind === 'objective' ? d.items.filter((i) => i.correct === false).length : 0;
    const markedIds = d.kind === 'translation' ? d.items.filter((i) => i.mark || i.annotations.length).map((i) => i.id) : [];
    const actions = h('div', { class: 'row detail-actions' },
      d.kind === 'objective' && wrongCount ? h('button', { class: 'btn primary', type: 'button', onclick: () => app.practice.retryFromRecord(entry, d.payload, { returnTo: { view: 'history', params: { select: entry.key } } }) }, t('hist.actions.retryWrong')) : null,
      d.kind === 'translation' ? [markedIds.length ? h('button', { class: 'btn primary', type: 'button', onclick: () => app.practice.retryFromRecord(entry, d.payload, { returnTo: { view: 'history', params: { select: entry.key } }, itemIds: markedIds }) }, t('hist.actions.retryMarked')) : null,
        h('button', { class: 'btn', type: 'button', onclick: () => app.practice.retryFromRecord(entry, d.payload, { returnTo: { view: 'history', params: { select: entry.key } } }) }, t('hist.actions.retryAll')),
        h('button', { class: 'btn', type: 'button', onclick: () => app.navigate('review', { responseId: entry.id }) }, t('hist.actions.review'))] : null,
      d.kind === 'typing' ? h('button', { class: 'btn primary', type: 'button', onclick: () => app.practice.retryFromRecord(entry, d.payload, { returnTo: { view: 'history', params: { select: entry.key } } }) }, t('hist.actions.typingAgain')) : null,
      entry.collection === 'learner_response' && !entry.legacy ? h('button', { class: 'btn', type: 'button', onclick: guarded(toast, async () => { await exportFile(app, await app.product.reviews.exportReviewRequest(entry.id)); }) }, t('hist.actions.requestExport')) : null);
    const lines = [];
    if (lineage?.source) lines.push(h('p', { class: 'muted small' }, `${t('hist.lineage.of')} `, h('button', { class: 'linkish', type: 'button', onclick: () => { st.selected = `learner_response:${lineage.source}`; paintList(); paintDetail(); } }, t('hist.lineage.open'))));
    if (lineage?.sourceMissing) lines.push(h('p', { class: 'muted small' }, t('hist.lineage.missing')));
    if (lineage?.retries.length) lines.push(h('p', { class: 'muted small' }, `${t('hist.lineage.by')}: `, lineage.retries.map((id) => h('button', { class: 'linkish', type: 'button', onclick: () => { st.selected = `learner_response:${id}`; paintList(); paintDetail(); } }, id.slice(0, 8)))));
    fill(detail,
      h('div', { class: 'row' }, domainDot(entry.domain), h('span', { class: 'kicker' }, domainName(entry.domain)), entry.intent ? pill(intentName(entry.intent)) : null, d.reviews?.length ? pill(t('hist.pill.reviews', { n: d.reviews.length }), 'info') : null),
      h('h2', { tabindex: '-1' }, entry.title || t('hist.row.untitled')),
      h('p', { class: 'muted small' }, `${entry.completedAt ? formatInstant(entry.completedAt) : t('hist.unknownTime')} · ${rowFacts(entry)}`),
      d.kind === 'translation' ? h('p', { class: 'muted small' }, t('hist.detail.noScore')) : null,
      lines, actions,
      d.kind === 'objective' ? objectiveBody(d) : d.kind === 'translation' ? translationBody(d) : d.kind === 'typing' ? typingBody(d) : legacyBody(d));
  }

  const filterSeg = seg({ label: t('hist.filter'), options: FILTERS.map((f) => ({ value: f, label: f === 'all' ? t('domain.all') : domainName(f) })), value: st.domain, onchange: (v) => { st.domain = v; paintList(); } });
  fill(main,
    h('div', { class: 'vhead' }, h('div', {}, h('div', { class: 'kicker' }, t('hist.kicker')), h('h1', { tabindex: '-1', id: 'view-title' }, t('hist.title')), h('p', { class: 'muted' }, t('hist.lede'))), filterSeg.el),
    h('div', { class: 'tri two' }, h('div', { class: 'col-b' }, h('label', { class: 'search' }, h('span', { class: 'muted', 'aria-hidden': 'true' }, '⌕'), search), rows), detail));
  paintList();
  await paintDetail();
  return { focus: () => main.querySelector('#view-title')?.focus() };
}
