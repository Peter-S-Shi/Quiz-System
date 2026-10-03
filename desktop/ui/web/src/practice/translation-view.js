// Translation in the Focused Practice surface: the learner PRODUCES a translation, may reveal the reference, and may
// mark spans of their own answer and whole items (three distinct metacognitive kinds). There is no grading anywhere
// here; the marks are the learner's own signals. Retry is offered from the finalized snapshot.
import { kindLabel, fill, focusEl, h, uid } from './dom.js';
import { t } from '../i18n.js';
import { buildRetryMaterial } from '../translation/session.js';

const KINDS = ['unknown', 'uncertain', 'should_know'];

export function mountTranslation({ session, ctx, host }) {
  let stage = 'run';
  let outcome = null;
  const root = h('div', { class: 'trn' });
  host.replaceChildren(root);
  let saveTimer = null;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => ctx.save(), 400); };

  function header(v) {
    ctx.setHeader({ title: v.title || t('pr.domain.translation'), tag: t('pr.tr.tag', { intent: t(v.intent === 'test' ? 'pr.obj.intent.test' : 'pr.obj.intent.practice'), langs: v.sourceLanguage || v.targetLanguage ? ` · ${v.sourceLanguage || '?'} → ${v.targetLanguage || '?'}` : '' }) });
    ctx.setProgress({ text: t('pr.tr.progress', { n: v.progress.answered, total: v.total }), done: v.progress.answered, total: v.total });
  }

  function annotationList(v) {
    if (!v.annotations.length) return h('p', { class: 'muted small' }, t('pr.tr.noMarks'));
    return h('ul', { class: 'marks' }, v.annotations.map((a) => {
      const sel = h('select', { 'aria-label': t('pr.tr.kindFor', { text: a.text }) }, KINDS.map((k) => h('option', { value: k, selected: k === a.kind }, kindLabel(k))));
      sel.addEventListener('change', () => { session.changeAnnotationKind(a.id, sel.value); ctx.save(); render(); });
      return h('li', {}, h('q', { class: 'mark-text' }, a.text), sel,
        h('button', { class: 'btn small', type: 'button', 'aria-label': t('pr.tr.removeMark', { text: a.text }), onclick: () => { session.removeAnnotation(a.id); ctx.save(); render({ focus: 'answer' }); } }, t('pr.remove')));
    }));
  }

  function render({ focus } = {}) {
    if (stage === 'result') return renderResult(focus);
    const v = session.view();
    header(v);
    const answerId = uid('ans');
    const ta = h('textarea', { id: answerId, class: 'answer', rows: '5', lang: v.targetLanguage || null, spellcheck: 'false', autocomplete: 'off' });
    ta.value = v.answer;
    ta.addEventListener('input', () => {
      session.setAnswer(ta.value);
      saveSoon();
      const cur = session.view();
      header(cur);
      marksHost.replaceChildren(annotationList(cur)); // an edit may have invalidated a mark; the textarea itself is never rebuilt
      markBtns.forEach((b) => { b.disabled = ta.selectionStart === ta.selectionEnd; });
    });
    ta.addEventListener('select', () => markBtns.forEach((b) => { b.disabled = ta.selectionStart === ta.selectionEnd; }));
    ta.addEventListener('keyup', () => markBtns.forEach((b) => { b.disabled = ta.selectionStart === ta.selectionEnd; }));
    ta.addEventListener('mouseup', () => markBtns.forEach((b) => { b.disabled = ta.selectionStart === ta.selectionEnd; }));
    const mark = (kind) => {
      try {
        session.addAnnotation({ start: ta.selectionStart, end: ta.selectionEnd, kind }, { now: ctx.now() });
        ctx.sfx('pen');
        ctx.save();
        render({ focus: 'answer' });
        ctx.announce(t('pr.tr.markedAs', { kind: kindLabel(kind) }));
      } catch (e) { ctx.notify(e.message.replace(/^[A-Z_]+: /, ''), { kind: 'error' }); }
    };
    const markBtns = KINDS.map((k) => h('button', { class: 'btn small', type: 'button', disabled: true, onclick: () => mark(k) }, kindLabel(k)));
    const itemMark = h('select', { id: uid('im'), 'aria-label': t('pr.tr.wholeSentence') }, h('option', { value: '' }, t('pr.tr.noMark')), KINDS.map((k) => h('option', { value: k, selected: v.mark === k }, kindLabel(k))));
    itemMark.addEventListener('change', () => { session.setMark(itemMark.value || null); ctx.sfx('pen'); ctx.save(); });
    const marksHost = h('div', { class: 'marks-host' }, annotationList(v));
    const last = v.index === v.total - 1;
    fill(root, 
      h('nav', { class: 'qnav', 'aria-label': t('pr.tr.sentences') }, v.items.map((it, i) => h('button', { type: 'button', class: `chipbtn${it.answered ? ' answered' : ''}${i === v.index ? ' current' : ''}`, 'aria-current': i === v.index ? 'step' : null, 'aria-label': t('pr.tr.chip', { n: i + 1, state: t(it.answered ? 'pr.tr.chip.translated' : 'pr.tr.chip.notTranslated'), marked: it.marked ? t('pr.tr.chip.marked') : '' }), onclick: () => { ctx.sfx('page'); session.go(i); ctx.save(); render({ focus: 'head' }); } }, String(i + 1)))),
      h('h2', { class: 'qhead', tabindex: '-1', id: 'qhead' }, t('pr.tr.sentenceOf', { n: v.index + 1, total: v.total })),
      h('blockquote', { class: 'source', lang: v.sourceLanguage || null }, v.item.sourceText),
      v.item.notes ? h('p', { class: 'muted small' }, t('pr.tr.note', { text: v.item.notes })) : null,
      h('label', { for: answerId, class: 'field-label' }, t('pr.tr.yours')), ta,
      h('div', { class: 'marker-bar', role: 'group', 'aria-label': t('pr.tr.markSelected') }, h('span', { class: 'muted small' }, t('pr.tr.markSelection')), markBtns),
      marksHost,
      h('div', { class: 'row' }, h('label', { class: 'field-label inline' }, t('pr.tr.wholeSentenceColon')), itemMark),
      v.hasReference ? h('div', { class: 'reference' }, v.revealed
        ? [h('h3', {}, t('pr.tr.reference')), h('p', { class: 'reference-text', lang: v.targetLanguage || null }, v.reference), h('button', { class: 'btn small', type: 'button', onclick: () => { session.reveal(false); ctx.save(); render({ focus: 'answer' }); } }, t('pr.tr.hideReference'))]
        : h('button', { class: 'btn', type: 'button', onclick: () => { session.reveal(true); ctx.sfx('stamp'); ctx.save(); render({ focus: 'reveal' }); } }, t('pr.tr.showReference'))) : null,
      h('div', { class: 'row actions' },
        h('button', { class: 'btn', type: 'button', disabled: v.index === 0, onclick: () => { ctx.sfx('page'); session.go(v.index - 1); ctx.save(); render({ focus: 'head' }); } }, t('pr.previous')),
        h('button', { class: 'btn', type: 'button', disabled: last, onclick: () => { ctx.sfx('page'); session.go(v.index + 1); ctx.save(); render({ focus: 'head' }); } }, t('pr.next')),
        h('button', { class: 'btn primary', type: 'button', 'data-act': 'finish', onclick: finish }, t('pr.finish'))));
    if (focus === 'answer') { focusEl(ta); ta.setSelectionRange(ta.value.length, ta.value.length); } else if (focus === 'head') focusEl(root.querySelector('#qhead'));
    else if (focus === 'reveal') focusEl(root.querySelector('.reference-text') ?? root.querySelector('#qhead'));
  }

  let finishing = false;
  async function finish() {
    if (finishing) return;
    finishing = true;
    try { await finishNow(); } finally { finishing = false; }
  }
  async function finishNow() {
    const v = session.view();
    const empty = v.total - v.progress.answered;
    if (empty) {
      const c = await ctx.choose({ title: t('pr.tr.finish.title'), body: t('pr.tr.emptyWarn', { n: empty }), actions: [{ value: 'no', label: t('pr.tr.finish.keep') }, { value: 'yes', label: t('pr.finish'), kind: 'primary' }] });
      if (c !== 'yes') return;
    }
    const res = await ctx.commit(() => session.finalize({ now: ctx.now() }));
    if (!res.ok) return;
    ctx.sfx('stamp');
    outcome = { payload: res.payload };
    stage = 'result';
    render({ focus: 'result' });
  }

  function renderResult(focus) {
    const { payload } = outcome;
    ctx.setHeader({ title: payload.material.title || t('pr.domain.translation'), tag: t('pr.tr.tagSaved') });
    ctx.setProgress({ text: t('pr.saved'), done: 1, total: 1 });
    ctx.announce(t('pr.tr.saved'));
    const flagged = [...new Set([...(payload.learnerItemMarks ?? []).map((m) => m.itemId), ...(payload.learnerAnnotations ?? []).map((a) => a.itemId)])];
    const startRetry = (itemIds) => {
      const retry = buildRetryMaterial({ response: payload, itemIds, createdAt: ctx.now(), ids: () => ctx.newId() });
      ctx.startRetry('translation', { document: retry });
    };
    fill(root, h('div', { class: 'result' },
      h('h2', { tabindex: '-1', id: 'result-head' }, t('pr.tr.savedTitle')),
      h('p', {}, t('pr.tr.recorded', { n: payload.summary.itemCount })),
      h('div', { class: 'row actions' },
        flagged.length && ctx.startRetry ? h('button', { class: 'btn', type: 'button', onclick: () => startRetry(flagged) }, t('pr.tr.retryMarked', { n: flagged.length })) : null,
        ctx.startRetry ? h('button', { class: 'btn', type: 'button', onclick: () => startRetry(undefined) }, t('pr.tr.retryAll')) : null,
        h('button', { class: 'btn primary', type: 'button', onclick: () => ctx.requestExit() }, t('pr.done')))));
    if (focus) focusEl(root.querySelector('#result-head'));
  }

  render({ focus: 'head' });
  return { dispose() { clearTimeout(saveTimer); }, focus: () => focusEl(root.querySelector('#qhead')) };
}
