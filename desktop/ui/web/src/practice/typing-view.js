// Typing in the Focused Practice surface (Scope Freeze Rev.1 section 12). Two layers, deliberately separate:
//  - the TYPING INPUT is a plain textarea that is never rebuilt while a session runs, so the browser's own caret, IME and
//    focus handling stay intact (no caret loss, no focus loss). Everything the learner commits reaches the engine through
//    the ONE committed-text path of the DOM adapter (no keydown / compositionend dependence);
//  - the REFERENCE PASSAGE is a read-only scroll region of grapheme cells. Cell statuses change in place (colour and
//    underline only - never width), and the region follows the active position with hysteresis, so completed text drifts
//    upward out of the viewport while the layout stays still.
// In a Test session the passage carries position only - the engine gives the view no correctness to render.
import { bindTypingInput } from '../task-domains/typing/dom-adapter.js';
import { focusEl, h, sr, uid } from './dom.js';
import { t as tr } from '../i18n.js';
import { durationLine } from '../duration.js';
import { STATUS, followScroll, passageCells, passageStatuses } from './typing-passage.js';

const CLS = { [STATUS.PENDING]: 'c', [STATUS.OK]: 'c ok', [STATUS.ERROR]: 'c err', [STATUS.CURRENT]: 'c cur', [STATUS.TYPED]: 'c typed' };
const kindWord = (k) => tr({ substitution: 'pr.ty.different', omission: 'pr.ty.missed', insertion: 'pr.ty.extra' }[k]);
const clip = (s, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function mountTyping({ session, ctx, host }) {
  const snap = session.snapshot();
  const ref = snap.material.text;
  const cells = passageCells(ref);
  const intent = snap.intent;
  const root = h('div', { class: 'typing' });
  host.replaceChildren(root);
  ctx.setHeader({ title: snap.material.title || tr('pr.domain.typing'), tag: tr('pr.ty.tag', { intent: tr(intent === 'test' ? 'pr.obj.intent.test' : 'pr.obj.intent.practice'), note: intent === 'test' ? tr('pr.ty.noteTest') : snap.policy.feedbackTiming === 'live' ? tr('pr.ty.noteLive') : '' }) });

  let stage = 'run';
  let saveTimer = null;
  let manualScroll = false;
  let lastCommitted = null;
  let lastStatuses = null;
  let followRaf = 0;
  let activeIndex = 0;

  const spans = cells.map((c) => h('span', { class: 'c' }, ref.slice(c.start, c.end)));
  const passage = h('div', { class: 'passage', role: 'region', 'aria-label': tr('pr.ty.reference'), tabindex: '0' }, spans);
  const taId = uid('type');
  const ta = h('textarea', { id: taId, class: 'type-input', rows: '4', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', 'aria-describedby': 'typing-count' });
  const count = h('span', { id: 'typing-count', class: 'muted small' });
  const finishBtn = h('button', { class: 'btn primary', type: 'button', onclick: finish }, tr('pr.finish'));
  root.append(
    passage,
    h('div', { class: 'type-wrap' }, h('label', { for: taId, class: 'field-label' }, tr('pr.ty.typeHere')), ta),
    h('div', { class: 'row type-foot' }, count, h('span', { class: 'grow' }), finishBtn));

  ta.value = session.committedText;
  ta.setSelectionRange(ta.value.length, ta.value.length);
  const unbind = bindTypingInput(ta, session);

  function updateCount(v) {
    const { typedGraphemes: typed, referenceGraphemes: total } = v.progress;
    count.textContent = tr('pr.ty.count', { typed, total });
    ctx.setProgress({ text: tr('pr.ty.progress', { typed, total }), done: Math.min(typed, total), total });
  }

  function follow(force = false) {
    if (manualScroll && !force) return;
    cancelAnimationFrame(followRaf);
    followRaf = requestAnimationFrame(() => {
      const target = spans[Math.min(activeIndex, spans.length - 1)];
      if (!target || passage.clientHeight === 0) return;
      const lineHeight = parseFloat(getComputedStyle(passage).lineHeight) || 28;
      const next = followScroll({ scrollTop: passage.scrollTop, viewportHeight: passage.clientHeight, lineHeight, contentHeight: passage.scrollHeight, activeTop: target.offsetTop });
      if (Math.abs(next - passage.scrollTop) >= 1) passage.scrollTop = next;
    });
  }

  function refresh(force = false) {
    const v = session.view();
    if (!force && v.committedText === lastCommitted) return;
    if (v.committedText !== lastCommitted) manualScroll = false;
    lastCommitted = v.committedText;
    const out = passageStatuses({ cells, live: v.live ?? null, intent, typedGraphemes: v.progress.typedGraphemes });
    activeIndex = out.activeIndex;
    for (let i = 0; i < spans.length; i += 1) if (!lastStatuses || lastStatuses[i] !== out.statuses[i]) spans[i].className = CLS[out.statuses[i]];
    lastStatuses = out.statuses;
    updateCount(v);
    follow();
  }

  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => ctx.save(), 600); };
  const afterChange = () => { refresh(); saveSoon(); };
  ta.addEventListener('input', afterChange);
  ta.addEventListener('compositionend', afterChange);
  ta.addEventListener('blur', () => { clearTimeout(saveTimer); ctx.save(); });
  for (const evt of ['paste', 'drop']) ta.addEventListener(evt, () => { ctx.notify(tr('pr.ty.noPaste'), { kind: 'info' }); ctx.announce(tr('pr.ty.noPasteShort')); });
  for (const evt of ['wheel', 'touchmove']) passage.addEventListener(evt, () => { manualScroll = true; }, { passive: true });
  passage.addEventListener('keydown', (e) => { if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key)) manualScroll = true; });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => follow(true)) : null;
  ro?.observe(passage);

  let finishing = false;
  async function finish() {
    if (finishing) return;
    finishing = true;
    try { await finishNow(); } finally { finishing = false; }
  }
  async function finishNow() {
    const v = session.view();
    if (v.progress.typedGraphemes < v.progress.referenceGraphemes) {
      const c = await ctx.choose({ title: tr('pr.ty.early.title'), body: tr('pr.ty.early.body', { typed: v.progress.typedGraphemes, total: v.progress.referenceGraphemes }), actions: [{ value: 'no', label: tr('pr.ty.early.keep') }, { value: 'yes', label: tr('pr.finish'), kind: 'primary' }] });
      if (c !== 'yes') { focusEl(ta); return; }
    }
    clearTimeout(saveTimer);
    const res = await ctx.commit(() => session.finalize({ completedAt: ctx.now() }));
    if (!res.ok) return;
    ctx.sfx('stamp');
    stage = 'result';
    showResult(res.payload);
  }

  function showResult(p) {
    unbind();
    ro?.disconnect();
    ctx.setProgress({ text: tr('pr.saved'), done: 1, total: 1 });
    const n = p.errors.length;
    ctx.announce(n ? tr('pr.ty.savedFound', { n }) : tr('pr.ty.savedPerfect'));
    root.replaceChildren(h('div', { class: 'result' },
      h('h2', { tabindex: '-1', id: 'result-head' }, tr('pr.ty.savedTitle')),
      h('p', { class: 'duration' }, durationLine(p.session)),
      h('p', {}, n ? tr('pr.ty.diffs', { n }) : tr('pr.ty.none')),
      h('p', { class: 'muted small' }, tr('pr.ty.disclaimer')),
      n ? h('ol', { class: 'diffs' }, p.errors.slice(0, 50).map((e) => h('li', {},
        h('b', {}, kindWord(e.kind)), ' ',
        e.reference.end > e.reference.start ? h('span', {}, tr('pr.ty.passage'), h('q', {}, clip(ref.slice(e.reference.start, e.reference.end)))) : null,
        e.committed.end > e.committed.start ? h('span', {}, tr('pr.ty.typed'), h('q', {}, clip(p.committed.text.slice(e.committed.start, e.committed.end)))) : null,
        sr(tr('pr.ty.kindIs', { kind: kindWord(e.kind) }))))) : null,
      n > 50 ? h('p', { class: 'muted small' }, tr('pr.ty.more', { n: n - 50 })) : null,
      h('div', { class: 'row actions' },
        ctx.startRetry ? h('button', { class: 'btn', type: 'button', onclick: () => ctx.startRetry('typing', { sourceAttemptId: p.id, textId: p.material.id, intent: p.intent }) }, tr('pr.ty.again')) : null,
        h('button', { class: 'btn primary', type: 'button', onclick: () => ctx.requestExit() }, tr('pr.done')))));
    focusEl(root.querySelector('#result-head'));
  }

  refresh(true);
  focusEl(ta);
  return {
    dispose() { clearTimeout(saveTimer); cancelAnimationFrame(followRaf); unbind(); ro?.disconnect(); },
    focus: () => focusEl(ta),
    get stage() { return stage; },
  };
}
