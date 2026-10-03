// Translation in the Focused Practice surface: the learner PRODUCES a translation, may reveal the reference, and may
// mark spans of their own answer and whole items (three distinct metacognitive kinds). There is no grading anywhere
// here; the marks are the learner's own signals. Retry is offered from the finalized snapshot.
import { KIND_LABEL, fill, focusEl, h, uid } from './dom.js';
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
    ctx.setHeader({ title: v.title || 'Translation', tag: `Translation · ${v.intent === 'test' ? 'Test' : 'Practice'}${v.sourceLanguage || v.targetLanguage ? ` · ${v.sourceLanguage || '?'} → ${v.targetLanguage || '?'}` : ''}` });
    ctx.setProgress({ text: `${v.progress.answered} of ${v.total} translated`, done: v.progress.answered, total: v.total });
  }

  function annotationList(v) {
    if (!v.annotations.length) return h('p', { class: 'muted small' }, 'No marked spans yet. Select part of your translation, then choose how you feel about it.');
    return h('ul', { class: 'marks' }, v.annotations.map((a) => {
      const sel = h('select', { 'aria-label': `Kind for the mark "${a.text}"` }, KINDS.map((k) => h('option', { value: k, selected: k === a.kind }, KIND_LABEL[k])));
      sel.addEventListener('change', () => { session.changeAnnotationKind(a.id, sel.value); ctx.save(); render(); });
      return h('li', {}, h('q', { class: 'mark-text' }, a.text), sel,
        h('button', { class: 'btn small', type: 'button', 'aria-label': `Remove the mark "${a.text}"`, onclick: () => { session.removeAnnotation(a.id); ctx.save(); render({ focus: 'answer' }); } }, 'Remove'));
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
        ctx.save();
        render({ focus: 'answer' });
        ctx.announce(`Marked as: ${KIND_LABEL[kind]}.`);
      } catch (e) { ctx.notify(e.message.replace(/^[A-Z_]+: /, ''), { kind: 'error' }); }
    };
    const markBtns = KINDS.map((k) => h('button', { class: 'btn small', type: 'button', disabled: true, onclick: () => mark(k) }, KIND_LABEL[k]));
    const itemMark = h('select', { id: uid('im'), 'aria-label': 'Mark the whole sentence' }, h('option', { value: '' }, 'No mark'), KINDS.map((k) => h('option', { value: k, selected: v.mark === k }, KIND_LABEL[k])));
    itemMark.addEventListener('change', () => { session.setMark(itemMark.value || null); ctx.save(); });
    const marksHost = h('div', { class: 'marks-host' }, annotationList(v));
    const last = v.index === v.total - 1;
    fill(root, 
      h('nav', { class: 'qnav', 'aria-label': 'Sentences' }, v.items.map((it, i) => h('button', { type: 'button', class: `chipbtn${it.answered ? ' answered' : ''}${i === v.index ? ' current' : ''}`, 'aria-current': i === v.index ? 'step' : null, 'aria-label': `Sentence ${i + 1}, ${it.answered ? 'translated' : 'not translated'}${it.marked ? ', marked' : ''}`, onclick: () => { session.go(i); ctx.save(); render({ focus: 'head' }); } }, String(i + 1)))),
      h('h2', { class: 'qhead', tabindex: '-1', id: 'qhead' }, `Sentence ${v.index + 1} of ${v.total}`),
      h('blockquote', { class: 'source', lang: v.sourceLanguage || null }, v.item.sourceText),
      v.item.notes ? h('p', { class: 'muted small' }, `Note: ${v.item.notes}`) : null,
      h('label', { for: answerId, class: 'field-label' }, 'Your translation'), ta,
      h('div', { class: 'marker-bar', role: 'group', 'aria-label': 'Mark the selected part of your translation' }, h('span', { class: 'muted small' }, 'Mark selection:'), markBtns),
      marksHost,
      h('div', { class: 'row' }, h('label', { class: 'field-label inline' }, 'Whole sentence: '), itemMark),
      v.hasReference ? h('div', { class: 'reference' }, v.revealed
        ? [h('h3', {}, 'Reference translation'), h('p', { class: 'reference-text', lang: v.targetLanguage || null }, v.reference), h('button', { class: 'btn small', type: 'button', onclick: () => { session.reveal(false); ctx.save(); render({ focus: 'answer' }); } }, 'Hide reference')]
        : h('button', { class: 'btn', type: 'button', onclick: () => { session.reveal(true); ctx.save(); render({ focus: 'reveal' }); } }, 'Show reference translation')) : null,
      h('div', { class: 'row actions' },
        h('button', { class: 'btn', type: 'button', disabled: v.index === 0, onclick: () => { session.go(v.index - 1); ctx.save(); render({ focus: 'head' }); } }, 'Previous'),
        h('button', { class: 'btn', type: 'button', disabled: last, onclick: () => { session.go(v.index + 1); ctx.save(); render({ focus: 'head' }); } }, 'Next'),
        h('button', { class: 'btn primary', type: 'button', 'data-act': 'finish', onclick: finish }, 'Finish')));
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
      const c = await ctx.choose({ title: 'Finish this practice?', body: `${empty} sentence(s) have no translation yet; they are recorded as left empty.`, actions: [{ value: 'no', label: 'Keep working' }, { value: 'yes', label: 'Finish', kind: 'primary' }] });
      if (c !== 'yes') return;
    }
    const res = await ctx.commit(() => session.finalize({ now: ctx.now() }));
    if (!res.ok) return;
    outcome = { payload: res.payload };
    stage = 'result';
    render({ focus: 'result' });
  }

  function renderResult(focus) {
    const { payload } = outcome;
    ctx.setHeader({ title: payload.material.title || 'Translation', tag: 'Translation · saved' });
    ctx.setProgress({ text: 'Saved', done: 1, total: 1 });
    ctx.announce('Practice saved.');
    const flagged = [...new Set([...(payload.learnerItemMarks ?? []).map((m) => m.itemId), ...(payload.learnerAnnotations ?? []).map((a) => a.itemId)])];
    const startRetry = (itemIds) => {
      const retry = buildRetryMaterial({ response: payload, itemIds, createdAt: ctx.now(), ids: () => ctx.newId() });
      ctx.startRetry('translation', { document: retry });
    };
    fill(root, h('div', { class: 'result' },
      h('h2', { tabindex: '-1', id: 'result-head' }, 'Practice saved'),
      h('p', {}, `${payload.summary.itemCount} sentence(s) recorded. Translation is never graded - your marks stay yours.`),
      h('div', { class: 'row actions' },
        flagged.length && ctx.startRetry ? h('button', { class: 'btn', type: 'button', onclick: () => startRetry(flagged) }, `Retry the ${flagged.length} marked sentence(s)`) : null,
        ctx.startRetry ? h('button', { class: 'btn', type: 'button', onclick: () => startRetry(undefined) }, 'Retry everything') : null,
        h('button', { class: 'btn primary', type: 'button', onclick: () => ctx.requestExit() }, 'Done'))));
    if (focus) focusEl(root.querySelector('#result-head'));
  }

  render({ focus: 'head' });
  return { dispose() { clearTimeout(saveTimer); }, focus: () => focusEl(root.querySelector('#qhead')) };
}
