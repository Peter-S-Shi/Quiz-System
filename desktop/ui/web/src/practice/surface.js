// The Focused Practice surface (Scope Freeze Rev.1 section 13; UI Architecture Freeze): ONE shared frame for the three
// domains - not a canonical mode and not a new Evidence semantic. While a session is active the sidebar, navigation and
// administration chrome are removed (`#app[data-focus=on]`); what stays is what the learning task needs: the domain's own
// interaction, progress, a safe exit and session recovery. Each domain view owns its body; this module owns the frame,
// the exit/resume semantics, the live region and the commit/recovery plumbing. It never decides what is revealed -
// that is the domain engines' job (the views render only what `engine.view()` returns).
import { focusEl, h, uid } from './dom.js';
import { mountObjective } from './objective-view.js';
import { mountTranslation } from './translation-view.js';
import { mountTyping } from './typing-view.js';

const DOMAIN_LABEL = { objective: 'Objective', translation: 'Translation', typing: 'Typing' };

/**
 * @param {object} args
 * @param {HTMLElement} args.root the element the surface fills (the app's main region)
 * @param {'objective'|'translation'|'typing'} args.domain
 * @param {object} args.engine the domain session engine (already started or restored)
 * @param {object} args.services `{ save(state), commit({payload, selection?, scheduleRef?}), clear(sessionId), now(), newId?, startRetry?(kind, args) }`
 * @param {(outcome: 'left'|'discarded'|'done') => void} args.onClose
 */
export function mountPractice({ root, domain, engine, services, onClose, material }) {
  const app = document.getElementById('app');
  const previousFocus = document.activeElement;
  if (app) app.dataset.focus = 'on';

  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const notice = h('div', { class: 'practice-notice', role: 'status', 'aria-live': 'polite', hidden: true });
  const progressText = h('span', { class: 'practice-progress-text' });
  const bar = h('i');
  const progressId = uid('progress');
  const progress = h('div', { class: 'practice-progress', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': '0', 'aria-valuemax': '1', 'aria-valuenow': '0', id: progressId }, bar);
  const exitBtn = h('button', { class: 'btn', type: 'button', id: uid('exit') }, 'Exit');
  const titleEl = h('h1', { class: 'practice-title', tabindex: '-1' }, '');
  const tagEl = h('span', { class: 'practice-tag' }, '');
  const body = h('div', { class: 'practice-body' });
  let finished = false;
  let closed = false;
  let noticeTimer = null;

  const section = h('section', { class: 'practice', 'aria-label': 'Focused practice' },
    h('header', { class: 'practice-head' }, exitBtn, h('div', { class: 'practice-heading' }, titleEl, tagEl), h('div', { class: 'practice-progress-wrap' }, progressText, progress)),
    notice, body, live);
  root.replaceChildren(section);

  const ctx = {
    now: () => services.now(),
    newId: () => services.newId?.() ?? globalThis.crypto.randomUUID(),
    announce(msg) {
      live.textContent = '';
      requestAnimationFrame(() => { live.textContent = msg; });
    },
    notify(msg, { kind = 'info', ms = 4000 } = {}) {
      notice.textContent = msg;
      notice.dataset.kind = kind;
      notice.hidden = false;
      clearTimeout(noticeTimer);
      noticeTimer = ms ? setTimeout(() => { notice.hidden = true; }, ms) : null;
    },
    setHeader({ title, tag }) {
      titleEl.textContent = title;
      tagEl.textContent = tag;
    },
    setProgress({ text, done, total }) {
      progressText.textContent = text;
      progress.setAttribute('aria-valuemax', String(Math.max(1, total)));
      progress.setAttribute('aria-valuenow', String(done));
      progress.setAttribute('aria-valuetext', text);
      bar.style.width = `${total ? Math.min(100, (100 * done) / total) : 0}%`;
    },
    /** Persist the recovery state (never evidence). A failed save is reported, never swallowed. */
    async save() {
      if (finished || closed) return;
      try {
        await services.save(engine.snapshot());
      } catch (e) {
        ctx.notify(`Your progress could not be saved: ${e?.message ?? e}`, { kind: 'error', ms: 0 });
      }
    },
    /** Finalize through the one door (SessionFinalizer); the recovery state is cleared only after the evidence is committed. */
    async commit(build) {
      try {
        const built = build();
        const input = built && built.payload ? built : { payload: built };
        const result = await services.commit(input);
        finished = true;
        await services.clear(input.payload.session.id).catch(() => {});
        exitBtn.textContent = 'Done';
        return { ok: true, result, payload: input.payload };
      } catch (e) {
        ctx.notify(`The result could not be saved - ${e?.message ?? e}. Your answers are kept; try again.`, { kind: 'error', ms: 0 });
        return { ok: false, error: e };
      }
    },
    choose,
    requestExit,
    startRetry: services.startRetry ? (kind, args) => { close('done'); return services.startRetry(kind, args); } : null,
    focusTitle: () => focusEl(titleEl),
    material,
  };

  /** A modal choice. Resolves with the chosen value, or 'cancel' for Escape. */
  function choose({ title, body: text, actions }) {
    return new Promise((resolve) => {
      const dlg = h('dialog', { class: 'dialog practice-dialog', 'aria-labelledby': 'dlg-title' },
        h('form', { method: 'dialog' }, h('h2', { id: 'dlg-title' }, title), h('p', {}, text),
          h('menu', {}, actions.map((a) => h('button', { type: 'submit', value: a.value, class: `btn${a.kind ? ` ${a.kind}` : ''}` }, a.label)))));
      dlg.addEventListener('close', () => { const v = dlg.returnValue || 'cancel'; dlg.remove(); resolve(v); });
      section.append(dlg);
      dlg.showModal();
      focusEl(dlg.querySelector('button'));
    });
  }

  async function requestExit() {
    if (closed) return;
    if (finished) return close('done');
    const choice = await choose({
      title: 'Leave this practice?',
      body: 'Your progress is saved. You can resume it later from where you stopped, or discard it - nothing is recorded as a result either way until you finish.',
      actions: [{ value: 'keep', label: 'Keep practicing' }, { value: 'leave', label: 'Save and leave', kind: 'primary' }, { value: 'discard', label: 'Discard session', kind: 'danger' }],
    });
    if (choice === 'leave') { await ctx.save(); close('left'); } else if (choice === 'discard') {
      const sure = await choose({ title: 'Discard this session?', body: 'The saved progress is deleted. No result is recorded.', actions: [{ value: 'no', label: 'Cancel' }, { value: 'yes', label: 'Discard', kind: 'danger' }] });
      if (sure === 'yes') { finished = true; await services.clear(engine.snapshot().session.id).catch(() => {}); close('discarded'); } else focusEl(exitBtn);
    } else focusEl(exitBtn);
  }

  exitBtn.addEventListener('click', requestExit);
  const onKey = (e) => {
    if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
    if (section.querySelector('dialog[open]')) return;
    e.preventDefault();
    requestExit();
  };
  const onHide = () => { if (document.visibilityState === 'hidden') ctx.save(); };
  section.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHide);

  let view;
  function close(outcome) {
    if (closed) return;
    closed = true;
    clearTimeout(noticeTimer);
    document.removeEventListener('visibilitychange', onHide);
    view?.dispose?.();
    if (app) delete app.dataset.focus;
    root.replaceChildren();
    onClose(outcome);
    if (previousFocus && document.contains(previousFocus)) focusEl(previousFocus);
  }

  const mount = { objective: mountObjective, translation: mountTranslation, typing: mountTyping }[domain];
  ctx.setHeader({ title: '', tag: DOMAIN_LABEL[domain] });
  view = mount({ session: engine, ctx, host: body, material });
  return { close: () => close('left'), el: section, requestExit };
}
