// Today: the daily briefing. What is due or overdue, what the engine suggests (with a readable reason, never a score), a
// resumable unfinished session, and a composer for a session of the learner's own choosing. Starting anything goes
// through the Focused Practice entry; nothing here decides what the learner should do.
import { defineStrings, getLocale, t } from '../../i18n.js';
import { domainDot, domainName, emptyState, field, fill, formatDate, formatInstant, guarded, h, intentName, pill, seg } from '../kit.js';
import { confirmDialog } from '../kit.js';

defineStrings({
  'today.kicker': ['Daily briefing', '每日简报'],
  'today.title': ['Today', '今日简报'],
  'today.lede': ['The app suggests and explains; what to practice is up to you.', '应用给出建议并说明理由，练什么由你决定。'],
  'today.fact.due': ['Due today', '今天到期'],
  'today.fact.overdue': ['Overdue', '已逾期'],
  'today.fact.decide': ['Dates waiting for you', '日期待你决定'],
  'today.decideLink': ['Decide in the Calendar →', '到日历中决定 →'],
  'today.resume.title': ['Unfinished practice', '未完成的练习'],
  'today.resume.meta': ['{domain} · started {when}', '{domain} · 开始于 {when}'],
  'today.resume.continue': ['Continue', '继续'],
  'today.resume.discard': ['Discard', '放弃'],
  'today.resume.discardTitle': ['Discard this session?', '放弃这次练习？'],
  'today.resume.discardBody': ['Its saved progress is deleted. Nothing is recorded as a result.', '已保存的进度会被删除，不会记录任何结果。'],
  'today.sec.scheduled': ['Scheduled for today and earlier', '今天及更早安排的练习'],
  'today.scheduled.empty': ['Nothing is due.', '没有到期的练习。'],
  'today.scheduled.emptyBody': ['Dates you set in the Calendar show up here when they come due.', '你在日历里安排的练习到期后会出现在这里。'],
  'today.scheduled.since': ['since {date}', '自 {date} 起'],
  'today.scheduled.gone': ['The material no longer exists', '材料已不存在'],
  'today.openCalendar': ['Open the Calendar →', '打开日历 →'],
  'today.sec.recs': ['Suggested practice', '建议练习'],
  'today.recs.hint': ['Suggestions can be ignored. Hover or read the reasons.', '建议可以忽略，可查看每条的理由。'],
  'today.recs.empty': ['No suggestions right now.', '眼下没有建议。'],
  'today.recs.emptyBody': ['Suggestions appear after you practice, mark something, or receive a teacher review.', '练习、标记，或收到教师批改后，这里会出现建议。'],
  'today.rec.start': ['Start', '开始'],
  'today.rec.test': ['As a test', '作为测试'],
  'today.rec.flagged': ['Only the flagged items', '只练被标出的题目'],
  'today.rec.unavailable': ['The material no longer exists', '材料已不存在'],
  'today.rec.group.overdue-or-remediation': ['Overdue or remediation', '逾期或待补救'],
  'today.rec.group.due-or-learner-flagged': ['Due or marked by you', '到期或你做过标记'],
  'today.rec.group.incorrect-or-teacher-flagged': ['Answered incorrectly or flagged by a teacher', '答错或被老师标出'],
  'today.composer.title': ['Make a session yourself', '自己组一次练习'],
  'today.composer.lede': ['Three independent choices; together they are the session.', '三个维度彼此独立，组合起来就是一次练习。'],
  'today.composer.selection': ['Selection', '选择方式'],
  'today.composer.recommended': ['Suggested', '建议'],
  'today.composer.manual': ['Manual', '手动'],
  'today.composer.intent': ['Intent', '意图'],
  'today.composer.domain': ['Domain', '任务域'],
  'today.composer.material': ['Material', '材料'],
  'today.composer.feedback': ['Feedback', '反馈时机'],
  'today.composer.noMaterial': ['There is no material in this domain yet. Add some in the Library.', '这个任务域里还没有材料，请先到资料库添加。'],
  'today.composer.noSuggestion': ['There is no suggestion for this domain right now.', '这个任务域眼下没有建议。'],
  'today.composer.willStart': ['Will start: {title}', '将开始：{title}'],
  'today.composer.start': ['Start', '开始'],
  'today.composer.goLibrary': ['Go to the Library', '去资料库'],
});

const FEEDBACK = ['instant', 'submit-at-end'];

export async function renderToday(app, main) {
  const { learning, runtime } = app.product;
  const locale = getLocale();
  const data = await learning.today(locale);
  const library = await app.product.library.list();
  const toast = app.toast;
  const go = guarded(toast, (opts) => app.startSession(opts));

  // ------------------------------------------------------------------------------------------------- masthead
  const fact = (n, label, extra) => h('div', { class: 'fact' }, h('b', {}, String(n)), h('span', {}, label), extra ?? null);
  const mast = h('header', { class: 'mast' },
    h('div', { class: 'mast-top mono' }, h('span', {}, formatDate(data.today, { weekday: 'short' }).toUpperCase()), h('span', { class: 'dots', 'aria-hidden': 'true' }), h('span', {}, formatDate(data.today, { day: '2-digit', month: 'short', year: 'numeric' }))),
    h('h1', { tabindex: '-1', id: 'view-title' }, t('today.title')),
    h('p', { class: 'lede' }, t('today.lede')),
    h('div', { class: 'facts' },
      fact(data.facts.due, t('today.fact.due')),
      fact(data.facts.overdue, t('today.fact.overdue')),
      fact(data.facts.awaitingDecision, t('today.fact.decide'), data.facts.awaitingDecision ? h('button', { class: 'linkish', type: 'button', onclick: () => app.navigate('calendar') }, t('today.decideLink')) : null)));

  // ---------------------------------------------------------------------------------------------- resume
  const resumeSession = guarded(toast, async (s) => {
    try {
      app.openRestored(await runtime.restore(s.state));
    } catch (e) {
      toast(t('start.resumeFailed', { message: String(e.message).replace(/^[A-Z_]+: /, '') }), { kind: 'error', ms: 0 });
    }
  });
  const discardSession = guarded(toast, async (s) => {
    if (!(await confirmDialog({ title: t('today.resume.discardTitle'), body: t('today.resume.discardBody'), okLabel: t('today.resume.discard'), danger: true }))) return;
    await runtime.discard(s.id);
    toast(t('practice.discarded'));
    app.refresh();
  });
  const resume = data.resumable.length ? h('section', { class: 'card resume', 'aria-labelledby': 'resume-h' },
    h('h2', { id: 'resume-h', class: 'sec' }, t('today.resume.title')),
    h('ul', { class: 'plain' }, data.resumable.map((s) => h('li', { class: 'row resume-row' },
      domainDot(s.domain),
      h('div', { class: 'grow' }, h('b', {}, s.title || domainName(s.domain)), h('div', { class: 'mono muted' }, t('today.resume.meta', { domain: domainName(s.domain), when: formatInstant(s.startedAt) }))),
      h('button', { class: 'btn small primary', type: 'button', onclick: () => resumeSession(s) }, t('today.resume.continue')),
      h('button', { class: 'btn small', type: 'button', onclick: () => discardSession(s) }, t('today.resume.discard')))))) : null;

  // ------------------------------------------------------------------------------------------- scheduled
  const scheduled = h('section', { 'aria-labelledby': 'sched-h' },
    h('h2', { class: 'sec', id: 'sched-h' }, t('today.sec.scheduled'), h('span', { class: 'count mono' }, String(data.entries.length)), h('button', { class: 'btn small ghost push', type: 'button', onclick: () => app.navigate('calendar') }, t('today.openCalendar'))),
    data.entries.length
      ? h('ol', { class: 'recs' }, data.entries.map((e) => h('li', { class: `rec dom-${e.slot.domain}` },
        h('div', { class: 'rec-main' },
          h('div', { class: 'rec-head' }, domainDot(e.slot.domain), h('b', {}, e.title ?? t('today.scheduled.gone')), pill(intentName(e.slot.intent), 'neutral'), pill(t(`state.${e.state}`), e.state === 'overdue' ? 'warn' : 'info')),
          h('div', { class: 'muted small' }, `${t(`owner.${e.owner}`)} · ${formatDate(e.displayDate)}${e.displayDate !== e.originalDate ? ` (${t('today.scheduled.since', { date: formatDate(e.originalDate) })})` : ''}`)),
        e.missing ? null : h('button', { class: 'btn primary small', type: 'button', onclick: () => go({ domain: e.slot.domain, materialId: e.slot.material.id, intent: e.slot.intent, feedbackTiming: e.slot.intent === 'test' ? 'submit-at-end' : 'instant', scheduleRef: { scheduleId: e.scheduleId, originalDate: e.originalDate } }) }, t('common.start')))))
      : emptyState({ title: t('today.scheduled.empty'), body: t('today.scheduled.emptyBody') }));

  // ------------------------------------------------------------------------------------- recommendations
  const recs = h('section', { 'aria-labelledby': 'recs-h' },
    h('h2', { class: 'sec', id: 'recs-h' }, t('today.sec.recs'), h('span', { class: 'count mono' }, String(data.recommendations.length)), h('span', { class: 'muted hint-inline' }, t('today.recs.hint'))),
    data.recommendations.length
      ? h('ol', { class: 'recs' }, data.recommendations.map((r) => {
        const focusIds = (r.target.focus ?? []).map((f) => f.itemId);
        return h('li', { class: `rec dom-${r.domain}` },
          h('div', { class: 'rec-main' },
            h('div', { class: 'rec-head' }, domainDot(r.domain), h('b', {}, r.title ?? t('today.rec.unavailable')), pill(t(`today.rec.group.${r.group}`), r.group === 'overdue-or-remediation' ? 'warn' : 'neutral')),
            h('ul', { class: 'reasons' }, r.reasonTexts.map((x) => h('li', { 'data-code': x.code }, x.text)))),
          r.unavailable ? null : h('div', { class: 'rec-actions' },
            h('button', { class: 'btn primary small', type: 'button', onclick: () => go({ domain: r.domain, materialId: r.target.material.id, intent: 'practice', feedbackTiming: 'instant', source: 'recommended', recommendation: r }) }, t('today.rec.start')),
            h('button', { class: 'btn small', type: 'button', onclick: () => go({ domain: r.domain, materialId: r.target.material.id, intent: 'test', feedbackTiming: 'submit-at-end', source: 'recommended', recommendation: r }) }, t('today.rec.test')),
            r.domain === 'objective' && focusIds.length ? h('button', { class: 'btn small', type: 'button', onclick: () => go({ domain: 'objective', materialId: r.target.material.id, intent: 'practice', feedbackTiming: 'instant', source: 'recommended', recommendation: r, questionIds: focusIds }) }, t('today.rec.flagged')) : null));
      }))
      : emptyState({ title: t('today.recs.empty'), body: t('today.recs.emptyBody') }));

  // ---------------------------------------------------------------------------------------------- composer
  const state = { selection: 'recommended', intent: 'practice', domain: 'objective', feedback: 'instant', material: '' };
  const materialsOf = (domain) => ({ objective: library.papers, translation: library.documents, typing: library.texts }[domain]).filter((m) => m.ready);
  const spec = h('div', { class: 'spec', 'aria-live': 'polite' });
  const startBtn = h('button', { class: 'btn primary wide', type: 'button' }, t('today.composer.start'));
  const materialSel = h('select', { id: 'composer-material' });
  const materialField = field(t('today.composer.material'), materialSel);
  const feedbackWrap = h('div', {});
  const feedbackSeg = seg({ label: t('today.composer.feedback'), options: FEEDBACK.map((v) => ({ value: v, label: t(`feedback.${v}`) })), value: state.feedback, onchange: (v) => { state.feedback = v; } });
  fill(feedbackWrap, h('span', { class: 'lbl' }, t('today.composer.feedback')), feedbackSeg.el);

  function paint() {
    const mats = materialsOf(state.domain);
    const rec = learning.topRecommendation(data.recommendations, state.domain);
    feedbackWrap.hidden = state.domain !== 'objective';
    materialField.hidden = state.selection !== 'manual';
    fill(materialSel, mats.map((m) => h('option', { value: m.id, selected: m.id === state.material }, m.title || t('common.untitled'))));
    if (!mats.some((m) => m.id === state.material)) state.material = mats[0]?.id ?? '';
    materialSel.value = state.material;
    if (state.selection === 'manual') {
      fill(spec, mats.length ? null : h('span', {}, t('today.composer.noMaterial')));
      startBtn.disabled = mats.length === 0;
    } else {
      fill(spec, rec ? h('span', {}, t('today.composer.willStart', { title: rec.title ?? '' })) : h('span', {}, t('today.composer.noSuggestion')));
      startBtn.disabled = !rec;
    }
  }
  materialSel.addEventListener('change', () => { state.material = materialSel.value; });
  startBtn.addEventListener('click', () => {
    const rec = learning.topRecommendation(data.recommendations, state.domain);
    if (state.selection === 'recommended') {
      if (rec) go({ domain: state.domain, materialId: rec.target.material.id, intent: state.intent, feedbackTiming: state.feedback, source: 'recommended', recommendation: rec });
    } else if (state.material) go({ domain: state.domain, materialId: state.material, intent: state.intent, feedbackTiming: state.feedback, source: 'manual' });
  });
  const selSeg = seg({ label: t('today.composer.selection'), options: [{ value: 'recommended', label: t('today.composer.recommended') }, { value: 'manual', label: t('today.composer.manual') }], value: state.selection, onchange: (v) => { state.selection = v; paint(); } });
  const intentSeg = seg({ label: t('today.composer.intent'), options: ['practice', 'test'].map((v) => ({ value: v, label: intentName(v) })), value: state.intent, onchange: (v) => { state.intent = v; state.feedback = v === 'test' ? 'submit-at-end' : 'instant'; feedbackSeg.set(state.feedback); } });
  const domainSeg = seg({ label: t('today.composer.domain'), options: ['objective', 'translation', 'typing'].map((v) => ({ value: v, label: domainName(v) })), value: state.domain, onchange: (v) => { state.domain = v; state.material = ''; paint(); } });
  const composer = h('aside', { class: 'card composer', 'aria-labelledby': 'composer-h' },
    h('h2', { id: 'composer-h' }, t('today.composer.title')),
    h('p', { class: 'muted small' }, t('today.composer.lede')),
    h('span', { class: 'lbl' }, t('today.composer.selection')), selSeg.el,
    h('span', { class: 'lbl' }, t('today.composer.intent')), intentSeg.el,
    h('span', { class: 'lbl' }, t('today.composer.domain')), domainSeg.el,
    feedbackWrap, materialField, spec, startBtn);
  paint();

  fill(main, mast, resume, h('div', { class: 'today-grid' }, h('div', {}, scheduled, recs), composer));
  return { focus: () => main.querySelector('#view-title')?.focus() };
}
