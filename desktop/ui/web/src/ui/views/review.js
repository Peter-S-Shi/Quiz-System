// Review / Correction workspace. A review is an INDEPENDENT record about a recorded response: judgments, comments,
// corrections (insert / replace / delete / comment / style over exact ranges of the learner's answer) and an optional
// suggested rewrite. The learner's original answer is read-only here and is never modified; a new review never changes an
// earlier one. Reviews come from this device (the learner as reviewer) or from an external teacher or tool via a file.
import { defineStrings, t } from '../../i18n.js';
import { addCorrection, removeCorrection, CORRECTION_COLORS } from '../../exchange/corrections.js';
import { graphemeBoundaries } from '../../task-domains/unicode/graphemes.js';
import { projectionNodes } from '../correction-view.js';
import { domainDot, domainName, emptyState, field, fill, formatInstant, guarded, h, modal, pill, seg, textInput } from '../kit.js';
import { exportFile, importRemediationFlow, importReviewFlow } from '../import-flows.js';

defineStrings({
  'rev.kicker': ['Correction workspace', '批改台'],
  'rev.title': ['Review', '批改台'],
  'rev.lede': ['A review is a separate record. The original answer is never changed.', '批改是一份独立的记录，原始作答永远不会被修改。'],
  'rev.import': ['Import a teacher review…', '导入教师批改…'],
  'rev.importRemediation': ['Import remediation material…', '导入补救材料…'],
  'rev.pick.title': ['Choose a recorded answer to review', '选择要批改的作答'],
  'rev.pick.empty': ['There is nothing to review yet.', '还没有可以批改的作答。'],
  'rev.pick.emptyBody': ['Finish a practice and it can be reviewed here.', '完成一次练习后，就可以在这里批改。'],
  'rev.pick.reviews': ['{n} review(s)', '{n} 份批改'],
  'rev.pick.open': ['Open', '打开'],
  'rev.back': ['← All answers', '← 全部作答'],
  'rev.readonly': ['The learner’s original answer is read-only. Reviews are saved as separate records and never change the original.', '学习者的原始作答是只读的。批改保存为独立记录，永不修改原始作答。'],
  'rev.tab.new': ['New review', '新建批改'],
  'rev.tab.existing': ['Review {id}', '批改 {id}'],
  'rev.tab.byWhom': ['{who}', '{who}'],
  'rev.mode': ['View', '视图'],
  'rev.mode.orig': ['Original', '原始作答'],
  'rev.mode.review': ['Review', '批改'],
  'rev.mode.side': ['Side by side', '并排'],
  'rev.items': ['Items', '条目'],
  'rev.item': ['Item {n}', '第 {n} 项'],
  'rev.source': ['Source', '原文'],
  'rev.answer': ['Answer', '作答'],
  'rev.noAnswerText': ['This answer is not text, so it can be judged and commented but not marked up.', '这个作答不是文字，只能判定和评语，不能标注。'],
  'rev.selectHint': ['Select text in the answer, then choose a mark-up.', '在作答中选中文字，然后选择一种标注。'],
  'rev.tool.highlight': ['Highlight', '高亮'],
  'rev.tool.bold': ['Bold', '加粗'],
  'rev.tool.underline': ['Underline', '下划线'],
  'rev.tool.strikethrough': ['Strike', '删除线'],
  'rev.tool.bracket': ['Bracket', '括号'],
  'rev.tool.color': ['Color', '颜色'],
  'rev.tool.delete': ['Delete', '删除'],
  'rev.tool.replace': ['Replace…', '替换…'],
  'rev.tool.insert': ['Insert…', '插入…'],
  'rev.tool.comment': ['Comment…', '批注…'],
  'rev.ink': ['Ink', '墨色'],
  'rev.ink.red': ['red', '红'],
  'rev.ink.blue': ['blue', '蓝'],
  'rev.ink.green': ['green', '绿'],
  'rev.ink.purple': ['purple', '紫'],
  'rev.ink.orange': ['orange', '橙'],
  'rev.ink.teal': ['teal', '青'],
  'rev.ink.brown': ['brown', '棕'],
  'rev.ask.replace': ['Replace the selection with', '把选中的文字替换为'],
  'rev.ask.insert': ['Insert at the cursor', '在光标处插入'],
  'rev.ask.comment': ['Comment on the selection', '对选中的文字批注'],
  'rev.ask.text': ['Text', '文字'],
  'rev.needSelection': ['Select some text in the answer first.', '请先在作答中选中文字。'],
  'rev.corrections': ['Changes {n}', '修改记录 {n}'],
  'rev.corr.remove': ['Remove', '移除'],
  'rev.corr.op.style': ['Style', '样式'],
  'rev.corr.op.insert': ['Insert', '插入'],
  'rev.corr.op.replace': ['Replace', '替换'],
  'rev.corr.op.delete': ['Delete', '删除'],
  'rev.corr.op.comment': ['Comment', '批注'],
  'rev.judgment': ['Judgment', '判定'],
  'rev.judgment.correct': ['Correct', '正确'],
  'rev.judgment.incorrect': ['Incorrect', '错误'],
  'rev.judgment.partial': ['Partially correct', '部分正确'],
  'rev.judgment.needs-review': ['Needs a second look', '待复核'],
  'rev.judgment.clear': ['Clear', '清除'],
  'rev.comment': ['Comment on this item', '对本项的评语'],
  'rev.tags': ['Tags, separated by commas', '标签，用逗号分隔'],
  'rev.suggested': ['Suggested rewrite of the whole sentence', '建议整句改写'],
  'rev.summary': ['Overall comment', '总评'],
  'rev.reviewer': ['Reviewer name (optional)', '批改人姓名（可选）'],
  'rev.save': ['Save review', '保存批改'],
  'rev.saved': ['Review saved.', '批改已保存。'],
  'rev.exportReview': ['Export this review…', '导出这份批改…'],
  'rev.exportRequest': ['Export for external review…', '导出给外部批改…'],
  'rev.exportRemediation': ['Export a remediation request…', '导出补救请求…'],
  'rev.by.human': ['A person', '真人'],
  'rev.by.external-ai': ['External tool', '外部工具'],
  'rev.by.agent': ['Agent', '代理'],
  'rev.by.system': ['System', '系统'],
  'rev.by.anonymous': ['Anonymous', '匿名'],
  'rev.noReviews': ['No review yet. Start a new one.', '还没有批改，请新建一份。'],
  'rev.itemNoReview': ['This review says nothing about this item.', '这份批改没有提到这一项。'],
  'rev.gone': ['That answer no longer exists.', '那份作答已不存在。'],
});

const JUDGMENTS = ['correct', 'incorrect', 'partial', 'needs-review'];
const STYLE_TOOLS = ['highlight', 'bold', 'underline', 'strikethrough', 'bracket'];

function snapToGraphemes(text, start, end) {
  const b = graphemeBoundaries(text);
  let s = 0;
  for (const x of b) if (x <= start) s = x; else break;
  let e = text.length;
  for (const x of b) if (x >= end) { e = x; break; }
  return [s, e];
}

const reviewerName = (r) => r?.displayLabel || r?.toolName || t(`rev.by.${r?.type ?? 'anonymous'}`);

export async function renderReview(app, main, params = {}) {
  const { reviews } = app.product;
  const toast = app.toast;
  const body = h('div', { class: 'rev-body' });

  fill(main, h('div', { class: 'vhead' },
    h('div', {}, h('div', { class: 'kicker' }, t('rev.kicker')), h('h1', { tabindex: '-1', id: 'view-title' }, t('rev.title')), h('p', { class: 'muted' }, t('rev.lede'))),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: guarded(toast, async () => { const done = await importReviewFlow(app); if (done) open(done.kind === 'review' ? await responseOfReview(done.id) : null); }) }, t('rev.import')),
      h('button', { class: 'btn', type: 'button', onclick: guarded(toast, async () => { if (await importRemediationFlow(app)) app.refreshChrome(); }) }, t('rev.importRemediation')))),
  body);

  async function responseOfReview(reviewId) {
    const [rv] = await app.port.read('teacher_review', { id: reviewId });
    return rv?.payload.responseId ?? null;
  }

  // -------------------------------------------------------------------------------------------- picker
  async function picker() {
    const list = await reviews.list();
    fill(body, h('h2', { class: 'sec' }, t('rev.pick.title'), h('span', { class: 'count mono' }, String(list.length))),
      list.length
        ? h('ul', { class: 'plain picklist' }, list.map((r) => h('li', { class: `row dom-${r.domain}` }, domainDot(r.domain),
          h('span', { class: 'grow' }, h('b', {}, r.title || t('common.untitled')), h('span', { class: 'muted small' }, ` ${domainName(r.domain)} · ${r.completedAt ? formatInstant(r.completedAt) : ''} · ${t('common.items', { n: r.itemCount })}`)),
          r.reviewCount ? pill(t('rev.pick.reviews', { n: r.reviewCount }), 'info') : null,
          h('button', { class: 'btn small primary', type: 'button', onclick: () => open(r.id) }, t('rev.pick.open')))))
        : emptyState({ title: t('rev.pick.empty'), body: t('rev.pick.emptyBody') }));
  }

  // ------------------------------------------------------------------------------------------ workspace
  async function open(responseId) {
    if (!responseId) { await picker(); return; }
    const [row] = await app.port.read('learner_response', { id: responseId });
    if (!row) { toast(t('rev.gone'), { kind: 'error' }); await picker(); return; }
    const response = row.payload;
    const items = reviews.reviewableItems(response);
    let existing = await reviews.reviewsOf(responseId);
    const ws = { tab: existing.length ? existing.at(-1).id : 'new', itemId: items[0]?.itemId ?? null, mode: 'review', ink: 'red', draft: reviews.newDraft(response, { type: 'human', displayLabel: '' }) };
    const surface = h('div', { class: 'rev-surface' });
    const isText = (it) => it.answerText !== null;
    const itemOf = (id) => items.find((x) => x.itemId === id);
    const draftItem = () => ws.draft.items[ws.itemId];

    // ---- pieces
    const tabs = () => h('div', { class: 'rev-tabs', role: 'tablist' },
      existing.map((rv) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(ws.tab === rv.id), class: `tab${ws.tab === rv.id ? ' on' : ''}`, onclick: () => { ws.tab = rv.id; paint(); } }, t('rev.tab.existing', { id: rv.id.slice(0, 6) }), h('span', { class: 'muted small' }, ` ${reviewerName(rv.payload.reviewer)}`))),
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(ws.tab === 'new'), class: `tab${ws.tab === 'new' ? ' on' : ''}`, onclick: () => { ws.tab = 'new'; paint(); } }, `+ ${t('rev.tab.new')}`));

    const itemList = () => h('div', { class: 'cw-items', role: 'listbox', 'aria-label': t('rev.items') }, items.map((it, i) => {
      const j = ws.tab === 'new' ? ws.draft.items[it.itemId]?.judgment : existing.find((r) => r.id === ws.tab)?.payload.itemReviews.find((x) => x.itemId === it.itemId)?.judgment;
      return h('button', { type: 'button', role: 'option', 'aria-selected': String(ws.itemId === it.itemId), class: `cw-item${ws.itemId === it.itemId ? ' on' : ''}${j ? ` j-${j}` : ''}`, onclick: () => { ws.itemId = it.itemId; paint(); },
      }, h('b', {}, t('rev.item', { n: i + 1 })), h('span', { class: 'muted small clip' }, it.prompt), j ? pill(t(`rev.judgment.${j}`), j === 'correct' ? 'ok' : 'warn') : null);
    }));

    function answerPane(it) {
      if (!isText(it)) return h('p', { class: 'muted' }, t('rev.noAnswerText'));
      if (ws.tab !== 'new') {
        const rv = existing.find((r) => r.id === ws.tab)?.payload.itemReviews.find((x) => x.itemId === it.itemId);
        return rv ? readView(it, rv) : h('div', {}, h('p', { class: 'answer-text' }, it.answerText), h('p', { class: 'muted small' }, t('rev.itemNoReview')));
      }
      const di = draftItem();
      const orig = h('p', { class: 'answer-text original' }, it.answerText || '');
      const area = h('textarea', { class: 'answer-select', id: 'answer-select', readonly: true, rows: '4', 'aria-label': t('rev.answer') }, it.answerText);
      const proj = h('p', { class: 'answer-text projected', 'aria-live': 'polite' }, projectionNodes(it.answerText, di.corrections));
      if (ws.mode === 'orig') return orig;
      const selection = () => { const [s, e] = snapToGraphemes(it.answerText, area.selectionStart, area.selectionEnd); return { start: s, end: e, text: it.answerText.slice(s, e), caret: area.selectionStart }; };
      const apply = (draft) => {
        try {
          di.corrections = addCorrection(di.corrections, { id: app.ids(), createdAt: app.product.now(), ...draft }, it.answerText);
          app.sfx('pen');
          paint(`tool-${draft.operation}`);
        } catch (e) {
          toast(String(e.message), { kind: 'error' });
        }
      };
      const needSel = () => { const s = selection(); if (s.end <= s.start) { toast(t('rev.needSelection'), { kind: 'error' }); return null; } return s; };
      const ask = (title) => modal({ title, build: (close) => {
        const input = textInput({ id: 'ask-text', 'aria-label': t('rev.ask.text') });
        return h('form', { class: 'stack', onsubmit: (ev) => { ev.preventDefault(); close(input.value); } }, field(t('rev.ask.text'), input),
          h('menu', {}, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, t('common.cancel')), h('button', { class: 'btn primary', type: 'submit' }, t('common.ok'))));
      } });
      const style = (styleType, extra = {}) => () => { const s = needSel(); if (s) apply({ operation: 'style', styleType, start: s.start, end: s.end, anchoredText: s.text, ...extra }); };
      const tools = h('div', { class: 'row toolbar', role: 'toolbar', 'aria-label': t('rev.selectHint') },
        STYLE_TOOLS.map((x) => h('button', { class: 'btn small', type: 'button', id: `tool-style-${x}`, onclick: style(x) }, t(`rev.tool.${x}`))),
        h('button', { class: 'btn small', type: 'button', id: 'tool-style-color', onclick: style('color', { color: ws.ink }) }, t('rev.tool.color')),
        h('button', { class: 'btn small', type: 'button', id: 'tool-delete', onclick: () => { const s = needSel(); if (s) apply({ operation: 'delete', start: s.start, end: s.end, anchoredText: s.text }); } }, t('rev.tool.delete')),
        h('button', { class: 'btn small', type: 'button', id: 'tool-replace', onclick: async () => { const s = needSel(); if (!s) return; const text = await ask(t('rev.ask.replace')); if (text) apply({ operation: 'replace', start: s.start, end: s.end, anchoredText: s.text, text, color: ws.ink }); } }, t('rev.tool.replace')),
        h('button', { class: 'btn small', type: 'button', id: 'tool-insert', onclick: async () => { const pos = snapToGraphemes(it.answerText, area.selectionStart, area.selectionStart)[0]; const text = await ask(t('rev.ask.insert')); if (text) apply({ operation: 'insert', start: pos, end: pos, anchoredText: '', text, color: ws.ink }); } }, t('rev.tool.insert')),
        h('button', { class: 'btn small', type: 'button', id: 'tool-comment', onclick: async () => { const s = needSel(); if (!s) return; const text = await ask(t('rev.ask.comment')); if (text) apply({ operation: 'comment', start: s.start, end: s.end, anchoredText: s.text, text }); } }, t('rev.tool.comment')),
        h('span', { class: 'inks', role: 'radiogroup', 'aria-label': t('rev.ink') }, CORRECTION_COLORS.map((c) => h('button', { type: 'button', role: 'radio', class: `ink ink-${c}`, 'aria-checked': String(ws.ink === c), 'aria-label': t(`rev.ink.${c}`), title: t(`rev.ink.${c}`), onclick: () => { ws.ink = c; paint(); } }))));
      const hint = h('p', { class: 'muted small' }, t('rev.selectHint'));
      return ws.mode === 'side' ? h('div', { class: 'side-by-side' }, h('div', {}, h('h4', {}, t('rev.mode.orig')), orig), h('div', {}, h('h4', {}, t('rev.mode.review')), area, tools, proj)) : h('div', {}, area, hint, tools, proj);
    }

    function readView(it, rv) {
      return h('div', {},
        rv.judgment ? pill(t(`rev.judgment.${rv.judgment}`), rv.judgment === 'correct' ? 'ok' : 'warn') : null,
        ws.mode === 'orig' ? h('p', { class: 'answer-text' }, it.answerText) : h('p', { class: 'answer-text projected' }, projectionNodes(it.answerText, rv.corrections ?? [])),
        rv.comment ? h('p', {}, rv.comment) : null, rv.suggestedRevision ? h('p', { class: 'muted' }, rv.suggestedRevision) : null);
    }

    function sidePane(it) {
      if (ws.tab !== 'new') {
        const rv = existing.find((r) => r.id === ws.tab);
        return h('div', { class: 'stack' },
          h('div', { class: 'card' }, h('h4', {}, `${reviewerName(rv.payload.reviewer)} · ${formatInstant(rv.payload.createdAt)}`), rv.payload.summary ? h('p', {}, rv.payload.summary) : null),
          h('div', { class: 'row' },
            h('button', { class: 'btn small', type: 'button', onclick: guarded(toast, async () => { await exportFile(app, await reviews.exportReview(rv.id)); }) }, t('rev.exportReview')),
            h('button', { class: 'btn small', type: 'button', onclick: guarded(toast, async () => { await exportFile(app, await reviews.exportRemediationRequest(responseId, rv.id)); }) }, t('rev.exportRemediation'))));
      }
      const di = draftItem();
      const j = h('div', { class: 'stamps', role: 'radiogroup', 'aria-label': t('rev.judgment') }, [...JUDGMENTS.map((x) => h('button', { type: 'button', role: 'radio', class: `stamp s-${x}`, 'aria-checked': String(di.judgment === x), onclick: () => { di.judgment = di.judgment === x ? '' : x; app.sfx('stamp'); paint(`stamp-${x}`); }, id: `stamp-${x}` }, t(`rev.judgment.${x}`)))]);
      const list = isText(it) ? h('div', {}, h('h4', {}, t('rev.corrections', { n: di.corrections.length })), h('ul', { class: 'clist' }, di.corrections.map((c) => h('li', { class: 'row small' },
        h('b', {}, t(`rev.corr.op.${c.operation}`)), h('span', { class: 'grow' }, c.operation === 'insert' ? `“${c.text}”` : `“${c.anchoredText}”${c.text ? ` → “${c.text}”` : ''}`),
        h('button', { class: 'btn small', type: 'button', onclick: () => { di.corrections = removeCorrection(di.corrections, c.id); paint(); } }, t('rev.corr.remove')))))) : null;
      return h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('h4', {}, t('rev.judgment')), j),
        list ? h('div', { class: 'card' }, list) : null,
        h('div', { class: 'card' },
          field(t('rev.comment'), h('textarea', { id: 'item-comment', rows: '3', oninput: (e) => { di.comment = e.target.value; } }, di.comment ?? '')),
          field(t('rev.tags'), textInput({ id: 'item-tags', value: (di.tags ?? []).join(', '), oninput: (e) => { di.tags = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); } })),
          isText(it) ? field(t('rev.suggested'), textInput({ id: 'item-suggested', value: di.suggestedRevision ?? '', oninput: (e) => { di.suggestedRevision = e.target.value; } })) : null),
        h('div', { class: 'card' },
          field(t('rev.summary'), h('textarea', { id: 'review-summary', rows: '3', oninput: (e) => { ws.draft.summary = e.target.value; } }, ws.draft.summary ?? '')),
          field(t('rev.reviewer'), textInput({ id: 'reviewer-name', value: ws.draft.reviewer.displayLabel ?? '', oninput: (e) => { ws.draft.reviewer.displayLabel = e.target.value; } }))),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', id: 'save-review', onclick: guarded(toast, async () => {
          const check = reviews.check(ws.draft, response);
          if (check.errors.length) { toast(check.errors.join(' '), { kind: 'error', ms: 0 }); return; }
          const saved = await reviews.save(ws.draft);
          toast(t('rev.saved'));
          existing = await reviews.reviewsOf(responseId);
          ws.tab = saved.id;
          ws.draft = reviews.newDraft(response, { type: 'human', displayLabel: ws.draft.reviewer.displayLabel });
          await app.refreshChrome();
          paint();
        }) }, t('rev.save')), h('button', { class: 'btn', type: 'button', onclick: guarded(toast, async () => { await exportFile(app, await reviews.exportReviewRequest(responseId)); }) }, t('rev.exportRequest'))));
    }

    function paint(focusId) {
      const it = itemOf(ws.itemId);
      fill(surface,
        h('div', { class: 'banner' }, h('span', { 'aria-hidden': 'true' }, '🔒'), t('rev.readonly')),
        tabs(),
        h('div', { class: 'cw' }, itemList(),
          h('div', { class: 'cw-center' },
            h('div', { class: 'row between' }, h('h3', {}, it ? `${t('rev.item', { n: items.indexOf(it) + 1 })}` : ''), seg({ label: t('rev.mode'), options: ['orig', 'review', 'side'].map((m) => ({ value: m, label: t(`rev.mode.${m}`) })), value: ws.mode, onchange: (v) => { ws.mode = v; paint(); } }).el),
            it ? h('div', { class: 'card sheet' }, it.prompt ? h('p', { class: 'src serif' }, h('span', { class: 'label' }, `${t('rev.source')}: `), it.prompt) : null, answerPane(it)) : null),
          h('div', { class: 'cw-side' }, it ? sidePane(it) : null)));
      if (focusId) surface.querySelector(`#${CSS.escape(focusId)}`)?.focus();
    }

    fill(body, h('div', { class: 'row' }, h('button', { class: 'linkish', type: 'button', onclick: () => picker() }, t('rev.back')), h('h2', { class: 'inline-title' }, response.material?.title ?? '')), surface);
    paint();
  }

  if (params.responseId) await open(params.responseId); else await picker();
  return { focus: () => main.querySelector('#view-title')?.focus() };
}
