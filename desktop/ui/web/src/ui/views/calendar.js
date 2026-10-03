// Calendar: the date-level scheduling surface for Quiz Studio's own learning sessions (no external events, no times of day,
// no reminders). A month grid of occurrences from the accepted projection; one side panel for a day, an entry, a new
// schedule, or the dates waiting for the learner's decision. Every change is a ScheduleStore operation; the grid is
// re-read from the projection afterwards, never patched locally. Drag-and-drop and the date field do the same thing.
import { defineStrings, getLocale, t } from '../../i18n.js';
import { addDays } from '../../orchestration/dates.js';
import { confirmDialog, domainDot, domainName, field, fill, formatDate, guarded, h, intentName, pill, seg } from '../kit.js';

defineStrings({
  'cal.kicker': ['Calendar · learning schedules', '日历 · 学习安排'],
  'cal.title': ['Calendar', '日历'],
  'cal.lede': ['Only Quiz Studio practice sessions, by date. No time of day, no reminders.', '只安排 Quiz Studio 自己的练习，按日期，不设具体时间，也不发提醒。'],
  'cal.new': ['+ Schedule a practice', '+ 安排练习'],
  'cal.prev': ['Previous month', '上个月'],
  'cal.next': ['Next month', '下个月'],
  'cal.today': ['Back to today', '回到今天'],
  'cal.grid': ['Calendar of {month}', '{month} 的日历'],
  'cal.strip.due': ['Due today: {n}', '今天到期：{n}'],
  'cal.strip.overdue': ['Overdue: {n}', '已逾期：{n}'],
  'cal.strip.decide': ['Dates waiting for you: {n}', '日期待你决定：{n}'],
  'cal.strip.truncated': ['Only the most recent overdue sessions are listed.', '只列出最近的逾期练习。'],
  'cal.legend.user': ['Date set by you', '你安排的日期'],
  'cal.legend.engine': ['Date proposed by the app', '应用安排的日期'],
  'cal.legend.repeat': ['↻ repeats', '↻ 重复'],
  'cal.legend.test': ['T = test intent', '测 = 测试意图'],
  'cal.legend.over': ['overdue', '逾期'],
  'cal.legend.decide': ['◆ waiting for your decision', '◆ 待你决定'],
  'cal.legend.domain': ['left bar = task domain', '左侧色条 = 任务域'],
  'cal.test.short': ['T', '测'],
  'cal.entry.aria': ['{title}, {domain}, {state}', '{title}，{domain}，{state}'],
  'cal.more': ['+{n} more', '另有 {n} 项'],
  'cal.day.title': ['{date}', '{date}'],
  'cal.day.empty': ['Nothing is scheduled for this day.', '这一天没有安排。'],
  'cal.day.add': ['Schedule a practice on this day', '在这一天安排练习'],
  'cal.entry.title': ['Scheduled practice', '已安排的练习'],
  'cal.entry.repeats': ['Repeats every {n} {unit}', '每 {n} {unit}重复'],
  'cal.unit.day': ['day(s)', '天'],
  'cal.unit.week': ['week(s)', '周'],
  'cal.entry.until': ['until {date}', '直到 {date}'],
  'cal.entry.once': ['One time', '仅一次'],
  'cal.entry.movedFrom': ['Originally on {date}', '原定于 {date}'],
  'cal.entry.startNow': ['Start now', '现在开始'],
  'cal.entry.moveTo': ['Move to', '改到'],
  'cal.entry.moveThis': ['Move this one', '只改这一次'],
  'cal.entry.moveFuture': ['Move this and the following', '这一次及之后都改'],
  'cal.entry.cancelThis': ['Cancel this one', '取消这一次'],
  'cal.entry.cancelSeries': ['Cancel the whole series', '取消整个系列'],
  'cal.entry.cancelOnce': ['Cancel this schedule', '取消这个安排'],
  'cal.entry.cancelConfirm': ['Cancel this?', '确定取消？'],
  'cal.entry.cancelBody': ['The practice stays in your history; only the plan is removed. You can schedule it again later.', '已有的练习记录不受影响，只是不再安排。以后可以重新安排。'],
  'cal.entry.back': ['Back to the day', '返回当天'],
  'cal.moved': ['Moved to {date}.', '已改到 {date}。'],
  'cal.cancelled': ['Cancelled.', '已取消。'],
  'cal.created': ['Scheduled for {date}.', '已安排在 {date}。'],
  'cal.form.title': ['Schedule a practice', '安排练习'],
  'cal.form.domain': ['Domain', '任务域'],
  'cal.form.material': ['Material', '材料'],
  'cal.form.intent': ['Intent', '意图'],
  'cal.form.date': ['Date', '日期'],
  'cal.form.repeat': ['Repeat', '重复'],
  'cal.form.never': ['Does not repeat', '不重复'],
  'cal.form.every': ['Every', '每'],
  'cal.form.until': ['Until (optional)', '直到（可选）'],
  'cal.form.save': ['Schedule', '安排'],
  'cal.form.noMaterial': ['There is no material in this domain yet.', '这个任务域里还没有材料。'],
  'cal.form.occupied': ['This material and intent already has a schedule. Move or cancel it instead.', '这份材料和意图已有安排，请改期或取消它。'],
  'cal.form.openExisting': ['Show the existing one', '查看已有的安排'],
  'cal.dec.title': ['Dates waiting for your decision', '待你决定的日期'],
  'cal.dec.lede': ['New evidence suggests a different date. Your date stays unless you accept.', '新的练习记录建议了另一个日期。你不接受，日期就保持不变。'],
  'cal.dec.current': ['Your date', '你的日期'],
  'cal.dec.suggested': ['Suggested', '建议的日期'],
  'cal.dec.accept': ['Use the suggested date', '采用建议的日期'],
  'cal.dec.keep': ['Keep my date', '保留我的日期'],
  'cal.dec.done': ['Decision saved.', '已记录你的决定。'],
  'cal.err.SLOT_OCCUPIED': ['This material and intent already has a schedule. Move or cancel it instead.', '这份材料和意图已有安排，请改期或取消它。'],
  'cal.err.DATE_IN_PAST': ['Pick today or a later date.', '请选择今天或之后的日期。'],
  'cal.err.BAD_DATE': ['Pick a valid date.', '请选择有效的日期。'],
  'cal.err.DATE_TAKEN': ['Another occurrence of this series is already on that date.', '这个系列的另一次练习已在那天。'],
  'cal.err.NO_CHANGE': ['It is already on that date.', '已经在那一天了。'],
  'cal.err.REANCHOR_OVERLAP': ['That date would overlap the next occurrence.', '那个日期会与下一次练习重叠。'],
  'cal.err.BEYOND_UNTIL': ['That date is after the end of the series.', '那个日期超出了系列的结束日期。'],
  'cal.err.FUTURE_HAS_FULFILLMENT': ['Later occurrences were already practiced, so the series cannot be re-anchored.', '之后的练习已经完成，无法整体改期。'],
  'cal.err.OCCURRENCE_RESOLVED': ['That occurrence is already done or cancelled.', '那一次练习已经完成或被取消。'],
  'cal.err.STALE': ['The schedule changed meanwhile. The Calendar was reloaded; try again.', '安排刚刚发生了变化，日历已刷新，请再试一次。'],
  'cal.err.STALE_SUGGESTION': ['That suggestion is out of date because the schedule changed.', '安排已经变化，这条建议已过期。'],
  'cal.err.NOT_ACTIVE': ['This schedule is no longer active.', '这个安排已不再生效。'],
});

const WEEKDAYS = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']; // Mon..Sun, any week
const MAX_PER_CELL = 3;

const errorText = (e) => {
  const key = `cal.err.${e?.code}`;
  const text = t(key);
  return text === key ? String(e?.message ?? e).replace(/^[A-Z_]+: /, '') : text;
};

export async function renderCalendar(app, main, params = {}) {
  const { learning, library } = app.product;
  const toast = app.toast;
  const view = { month: params.month ?? null, selected: params.date ?? null, entry: params.entry ?? null, mode: params.mode ?? 'day', preset: params.materialId ? { domain: params.domain, materialId: params.materialId } : null };
  let cal = await learning.calendar(view.month ? `${view.month}-01` : undefined);
  view.month = cal.month;
  view.selected ??= cal.today;
  const lib = await library.list();

  const grid = h('div', { class: 'calgrid', role: 'grid', 'aria-label': '' });
  const title = h('h3', { id: 'cal-month', 'aria-live': 'polite' });
  const strip = h('div', { class: 'calstrip', role: 'status' });
  const side = h('aside', { class: 'card calside', 'aria-label': t('cal.title') });

  const reload = async (keep = {}) => {
    cal = await learning.calendar(`${view.month}-01`);
    Object.assign(view, keep);
    await app.refreshChrome();
    paint();
  };
  const act = (fn, okMessage) => guarded(toast, async (...args) => {
    try {
      const out = await fn(...args);
      if (okMessage) toast(okMessage(out));
      await reload();
      return out;
    } catch (e) {
      toast(errorText(e), { kind: 'error', ms: 0 });
      await reload();
      return undefined;
    }
  });

  const entriesOf = (date) => cal.days.get(date) ?? [];
  const findEntry = (id, original) => [...cal.days.values()].flat().find((e) => e.scheduleId === id && e.originalDate === original) ?? null;
  const dayLabel = (d) => formatDate(d, { weekday: 'long', month: 'long', day: 'numeric' });

  // --------------------------------------------------------------------------------------------- grid
  function entryChip(e) {
    const over = e.state === 'overdue';
    const sched = cal.schedules.get(e.scheduleId);
    const chip = h('button', {
      type: 'button', class: `chip-entry dom-${e.slot.domain}${over ? ' over' : ''}${e.owner === 'engine' ? ' engine' : ' user'}${e.hasPendingSuggestion ? ' conf' : ''}`, draggable: 'true',
      'aria-label': t('cal.entry.aria', { title: e.title ?? '', domain: domainName(e.slot.domain), state: t(`state.${e.state}`) }),
      'data-schedule': e.scheduleId, 'data-original': e.originalDate,
      onclick: (ev) => { ev.stopPropagation(); view.selected = e.displayDate; view.entry = { id: e.scheduleId, original: e.originalDate }; view.mode = 'entry'; paint(); side.querySelector('h2')?.focus(); },
      ondragstart: (ev) => { ev.dataTransfer.setData('text/plain', `${e.scheduleId}|${e.originalDate}`); ev.dataTransfer.effectAllowed = 'move'; },
    },
    h('span', { class: 'ename' }, e.title ?? t('today.scheduled.gone')),
    sched?.cadence.kind === 'every' ? h('span', { class: 'emark', 'aria-hidden': 'true' }, '↻') : null,
    e.slot.intent === 'test' ? h('span', { class: 'emark mono', 'aria-hidden': 'true' }, t('cal.test.short')) : null,
    e.hasPendingSuggestion ? h('span', { class: 'emark', 'aria-hidden': 'true' }, '◆') : null);
    return chip;
  }

  function paintGrid() {
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const date = addDays(cal.from, i);
      const entries = entriesOf(date);
      const inMonth = date.slice(0, 7) === cal.month;
      const cell = h('div', {
        class: `calcell${inMonth ? '' : ' out'}${date === cal.today ? ' today' : ''}${date === view.selected ? ' sel' : ''}`, role: 'gridcell', 'data-date': date, 'aria-selected': String(date === view.selected),
        tabindex: date === view.selected ? '0' : '-1',
        onclick: () => { view.selected = date; view.mode = 'day'; view.entry = null; paint(); },
        onkeydown: (ev) => cellKey(ev, date),
        ondragover: (ev) => { ev.preventDefault(); cell.classList.add('drop'); },
        ondragleave: () => cell.classList.remove('drop'),
        ondrop: (ev) => { ev.preventDefault(); cell.classList.remove('drop'); dropOn(ev.dataTransfer.getData('text/plain'), date); },
      },
      h('span', { class: 'dnum' }, String(Number(date.slice(8)))),
      entries.slice(0, MAX_PER_CELL).map(entryChip),
      entries.length > MAX_PER_CELL ? h('span', { class: 'more mono' }, t('cal.more', { n: entries.length - MAX_PER_CELL })) : null);
      cells.push(cell);
    }
    fill(grid, h('div', { class: 'calhead mono', role: 'row' }, WEEKDAYS.map((d) => h('span', { role: 'columnheader' }, formatDate(d, { weekday: 'short' })))), cells);
    grid.setAttribute('aria-label', t('cal.grid', { month: formatDate(cal.first, { month: 'long', year: 'numeric' }) }));
  }

  function cellKey(ev, date) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
    if (step === undefined) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); view.selected = date; view.mode = 'day'; view.entry = null; paint(); }
      return;
    }
    ev.preventDefault();
    const next = addDays(date, step);
    if (next.slice(0, 7) !== cal.month) { view.month = next.slice(0, 7); view.selected = next; reload(); return; }
    view.selected = next;
    paintGrid();
    grid.querySelector(`[data-date="${next}"]`)?.focus();
  }

  const dropOn = act(async (payload, date) => {
    const [scheduleId, original] = payload.split('|');
    if (!scheduleId || !original) return undefined;
    const sched = cal.schedules.get(scheduleId);
    if (sched?.cadence.kind === 'once') await learning.moveOnce(scheduleId, date);
    else await learning.moveOccurrence(scheduleId, original, date);
    return date;
  }, (d) => t('cal.moved', { date: formatDate(d) }));

  // -------------------------------------------------------------------------------------- side panel
  function sideDay() {
    const entries = entriesOf(view.selected);
    return [
      h('h2', { tabindex: '-1' }, dayLabel(view.selected)),
      entries.length
        ? h('ul', { class: 'plain daylist' }, entries.map((e) => h('li', { class: `row dom-${e.slot.domain}` }, domainDot(e.slot.domain),
          h('button', { class: 'linkish grow', type: 'button', onclick: () => { view.entry = { id: e.scheduleId, original: e.originalDate }; view.mode = 'entry'; paint(); side.querySelector('h2')?.focus(); } }, e.title ?? t('today.scheduled.gone')),
          pill(intentName(e.slot.intent)), pill(t(`state.${e.state}`), e.state === 'overdue' ? 'warn' : 'neutral'))))
        : h('p', { class: 'muted' }, t('cal.day.empty')),
      h('button', { class: 'btn', type: 'button', onclick: () => { view.mode = 'new'; paint(); side.querySelector('h2')?.focus(); } }, t('cal.day.add')),
    ];
  }

  function sideEntry() {
    const e = findEntry(view.entry.id, view.entry.original);
    if (!e) { view.mode = 'day'; return sideDay(); }
    const sched = cal.schedules.get(e.scheduleId);
    const recurring = sched?.cadence.kind === 'every';
    const date = h('input', { type: 'date', id: 'move-date', value: e.displayDate, min: cal.today });
    const doMove = (scope) => act(async () => {
      const d = date.value;
      if (!d) throw Object.assign(new Error('x'), { code: 'BAD_DATE' });
      if (!recurring) await learning.moveOnce(e.scheduleId, d);
      else if (scope === 'future') await learning.moveFuture(e.scheduleId, e.originalDate, d);
      else await learning.moveOccurrence(e.scheduleId, e.originalDate, d);
      view.selected = d;
      view.entry = null;
      view.mode = 'day';
      return d;
    }, (d) => t('cal.moved', { date: formatDate(d) }));
    const doCancel = (series) => async () => {
      if (!(await confirmDialog({ title: t('cal.entry.cancelConfirm'), body: t('cal.entry.cancelBody'), okLabel: series || !recurring ? (recurring ? t('cal.entry.cancelSeries') : t('cal.entry.cancelOnce')) : t('cal.entry.cancelThis'), danger: true }))) return;
      await act(async () => { await learning.cancel(e.scheduleId, series || !recurring ? undefined : e.originalDate); view.entry = null; view.mode = 'day'; }, () => t('cal.cancelled'))();
    };
    return [
      h('button', { class: 'linkish', type: 'button', onclick: () => { view.mode = 'day'; view.entry = null; paint(); } }, `← ${t('cal.entry.back')}`),
      h('h2', { tabindex: '-1' }, e.title ?? t('today.scheduled.gone')),
      h('div', { class: 'row' }, domainDot(e.slot.domain), h('span', {}, domainName(e.slot.domain)), pill(intentName(e.slot.intent)), pill(t(`state.${e.state}`), e.state === 'overdue' ? 'warn' : 'neutral')),
      h('p', { class: 'muted small' }, `${t(`owner.${e.owner}`)} · ${formatDate(e.displayDate, { weekday: 'long', month: 'long', day: 'numeric' })}`),
      e.displayDate !== e.originalDate ? h('p', { class: 'muted small' }, t('cal.entry.movedFrom', { date: formatDate(e.originalDate) })) : null,
      h('p', { class: 'muted small' }, recurring
        ? `${t('cal.entry.repeats', { n: sched.cadence.interval, unit: t(`cal.unit.${sched.cadence.unit}`) })}${sched.cadence.until ? ` · ${t('cal.entry.until', { date: formatDate(sched.cadence.until) })}` : ''}`
        : t('cal.entry.once')),
      e.missing ? null : h('button', { class: 'btn primary', type: 'button', onclick: () => app.startSession({ domain: e.slot.domain, materialId: e.slot.material.id, intent: e.slot.intent, feedbackTiming: e.slot.intent === 'test' ? 'submit-at-end' : 'instant', scheduleRef: { scheduleId: e.scheduleId, originalDate: e.originalDate } }) }, t('cal.entry.startNow')),
      e.state === 'fulfilled' || e.state === 'cancelled' ? null : [
        field(t('cal.entry.moveTo'), date),
        h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: doMove('this') }, recurring ? t('cal.entry.moveThis') : t('cal.entry.moveTo')), recurring ? h('button', { class: 'btn', type: 'button', onclick: doMove('future') }, t('cal.entry.moveFuture')) : null),
        h('div', { class: 'row' }, recurring ? h('button', { class: 'btn danger', type: 'button', onclick: doCancel(false) }, t('cal.entry.cancelThis')) : null, h('button', { class: 'btn danger', type: 'button', onclick: doCancel(true) }, recurring ? t('cal.entry.cancelSeries') : t('cal.entry.cancelOnce'))),
      ],
    ];
  }

  function sideNew() {
    const mats = { objective: lib.papers, translation: lib.documents, typing: lib.texts };
    const st = { domain: view.preset?.domain ?? 'objective', material: '', intent: 'practice', repeat: 'never' };
    const materialSel = h('select', { id: 'new-material' });
    const dateIn = h('input', { type: 'date', id: 'new-date', value: view.selected >= cal.today ? view.selected : cal.today, min: cal.today });
    const interval = h('input', { type: 'number', id: 'new-interval', min: '1', max: '365', value: '1', 'aria-label': t('cal.form.every') });
    const unitSel = h('select', { id: 'new-unit', 'aria-label': t('cal.form.every') }, ['day', 'week'].map((u) => h('option', { value: u }, t(`cal.unit.${u}`))));
    const until = h('input', { type: 'date', id: 'new-until', min: cal.today });
    const repeatBox = h('div', { class: 'row' }, h('span', {}, t('cal.form.every')), interval, unitSel);
    const note = h('p', { class: 'muted small', role: 'status' });
    const submit = h('button', { class: 'btn primary', type: 'submit' }, t('cal.form.save'));
    const paintMaterials = () => {
      const list = mats[st.domain].filter((m) => m.ready);
      fill(materialSel, list.map((m) => h('option', { value: m.id }, m.title || t('common.untitled'))));
      st.material = list.find((m) => m.id === view.preset?.materialId)?.id ?? list[0]?.id ?? '';
      materialSel.value = st.material;
      note.textContent = list.length ? '' : t('cal.form.noMaterial');
      submit.disabled = list.length === 0;
    };
    const paintRepeat = () => { repeatBox.hidden = st.repeat === 'never'; until.closest('.field').hidden = st.repeat === 'never'; };
    materialSel.addEventListener('change', () => { st.material = materialSel.value; });
    const repeatSeg = seg({ label: t('cal.form.repeat'), options: [{ value: 'never', label: t('cal.form.never') }, { value: 'every', label: t('cal.form.every') }], value: 'never', onchange: (v) => { st.repeat = v; paintRepeat(); } });
    const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault();
      const cadence = st.repeat === 'never' ? { kind: 'once' } : { kind: 'every', unit: unitSel.value, interval: Number(interval.value), ...(until.value ? { until: until.value } : {}) };
      try {
        await learning.createSchedule({ domain: st.domain, materialId: st.material, intent: st.intent, date: dateIn.value, cadence });
        toast(t('cal.created', { date: formatDate(dateIn.value) }));
        view.selected = dateIn.value;
        view.month = dateIn.value.slice(0, 7);
        view.mode = 'day';
        await reload();
      } catch (e) {
        note.textContent = errorText(e);
        note.className = 'error-text';
      }
    } },
    field(t('cal.form.domain'), seg({ label: t('cal.form.domain'), options: ['objective', 'translation', 'typing'].map((d) => ({ value: d, label: domainName(d) })), value: st.domain, onchange: (v) => { st.domain = v; view.preset = null; paintMaterials(); } }).el),
    field(t('cal.form.material'), materialSel),
    field(t('cal.form.intent'), seg({ label: t('cal.form.intent'), options: ['practice', 'test'].map((i) => ({ value: i, label: intentName(i) })), value: 'practice', onchange: (v) => { st.intent = v; } }).el),
    field(t('cal.form.date'), dateIn),
    field(t('cal.form.repeat'), repeatSeg.el), repeatBox,
    field(t('cal.form.until'), until),
    note, submit);
    paintMaterials();
    paintRepeat();
    return [h('button', { class: 'linkish', type: 'button', onclick: () => { view.mode = 'day'; paint(); } }, `← ${t('cal.entry.back')}`), h('h2', { tabindex: '-1' }, t('cal.form.title')), form];
  }

  function sideDecisions() {
    if (!cal.suggestions.length) return null;
    const zh = getLocale() === 'zh-CN';
    return h('section', { class: 'decisions', 'aria-labelledby': 'dec-h' },
      h('h3', { id: 'dec-h' }, t('cal.dec.title')),
      h('p', { class: 'muted small' }, t('cal.dec.lede')),
      h('ul', { class: 'plain' }, cal.suggestions.map((s) => h('li', { class: 'decision' },
        h('div', {}, s.slot ? domainDot(s.slot.domain) : null, h('b', {}, s.title ?? t('today.scheduled.gone'))),
        h('ul', { class: 'reasons' }, s.reasons.map((r) => h('li', {}, zh ? r.textZh : r.text))),
        h('div', { class: 'row small' }, h('span', {}, `${t('cal.dec.current')}: ${formatDate(s.currentDate)}`), h('span', {}, `${t('cal.dec.suggested')}: ${formatDate(s.suggestedDate)}`)),
        h('div', { class: 'row' },
          h('button', { class: 'btn small primary', type: 'button', onclick: act(() => learning.decide(s.id, 'accept'), () => t('cal.dec.done')) }, t('cal.dec.accept')),
          h('button', { class: 'btn small', type: 'button', onclick: act(() => learning.decide(s.id, 'keep'), () => t('cal.dec.done')) }, t('cal.dec.keep')))))));
  }

  function paintSide() {
    const body = view.mode === 'new' ? sideNew() : view.mode === 'entry' && view.entry ? sideEntry() : sideDay();
    fill(side, body, sideDecisions());
  }

  function paintStrip() {
    const all = [...cal.days.values()].flat();
    const n = (state) => all.filter((e) => e.state === state && e.displayDate <= cal.today).length;
    fill(strip, h('span', {}, t('cal.strip.due', { n: n('due') })), h('span', { class: n('overdue') ? 'over' : '' }, t('cal.strip.overdue', { n: n('overdue') })), h('span', {}, t('cal.strip.decide', { n: cal.suggestions.length })), cal.overdueTruncated ? h('span', { class: 'muted' }, t('cal.strip.truncated')) : null);
  }

  function paint() {
    title.textContent = formatDate(cal.first, { month: 'long', year: 'numeric' });
    paintStrip();
    paintGrid();
    paintSide();
  }

  const go = (month) => { view.month = month; view.selected = `${month}-01`; view.mode = 'day'; view.entry = null; reload(); };
  const shiftMonth = (n) => { const d = new Date(`${cal.first}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };

  fill(main,
    h('div', { class: 'vhead' },
      h('div', {}, h('div', { class: 'kicker' }, t('cal.kicker')), h('h1', { tabindex: '-1', id: 'view-title' }, t('cal.title')), h('p', { class: 'muted' }, t('cal.lede'))),
      h('button', { class: 'btn primary', type: 'button', onclick: () => { view.mode = 'new'; paint(); side.querySelector('h2')?.focus(); } }, t('cal.new'))),
    strip,
    h('div', { class: 'calwrap' },
      h('div', { class: 'card calmain' },
        h('div', { class: 'calbar' }, h('div', { class: 'row' }, h('button', { class: 'btn small ghost', type: 'button', 'aria-label': t('cal.prev'), onclick: () => go(shiftMonth(-1)) }, '‹'), title, h('button', { class: 'btn small ghost', type: 'button', 'aria-label': t('cal.next'), onclick: () => go(shiftMonth(1)) }, '›')), h('button', { class: 'btn small', type: 'button', onclick: () => go(cal.today.slice(0, 7)) }, t('cal.today'))),
        grid,
        h('div', { class: 'legend small muted' }, h('span', {}, h('i', { class: 'lg user', 'aria-hidden': 'true' }), t('cal.legend.user')), h('span', {}, h('i', { class: 'lg engine', 'aria-hidden': 'true' }), t('cal.legend.engine')), h('span', {}, t('cal.legend.repeat')), h('span', {}, t('cal.legend.test')), h('span', {}, h('i', { class: 'lg over', 'aria-hidden': 'true' }), t('cal.legend.over')), h('span', {}, t('cal.legend.decide')), h('span', {}, t('cal.legend.domain')))),
      side));
  paint();
  return { focus: () => main.querySelector('#view-title')?.focus() };
}
