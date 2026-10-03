// The Focused Practice surface (Scope Freeze Rev.1 section 13; UI Architecture Freeze): ONE shared frame for the three
// domains - not a canonical mode and not a new Evidence semantic. While a session is active the sidebar, navigation and
// administration chrome are removed (`#app[data-focus=on]`); what stays is what the learning task needs: the domain's own
// interaction, progress, a safe exit and session recovery. Each domain view owns its body; this module owns the frame,
// the exit/resume semantics, the live region and the commit/recovery plumbing. It never decides what is revealed -
// that is the domain engines' job (the views render only what `engine.view()` returns).
import { focusEl, h, uid } from './dom.js';
import { newId } from '../ids.js';
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
 * @param {(outcome: 'left'|'discarded'|'done'|'retry') => void} args.onClose
 */
export function mountPractice({ root, domain, engine, services, onClose }) {
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
    media: services.media ?? null,
    now: () => services.now(),
    newId: () => services.newId?.() ?? newId(),
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
    /** Best-effort recovery save (automatic: per change, blur, hidden). A failure is reported persistently, never swallowed. */
    save() {
      if (finished || closed) return Promise.resolve(false);
      return persist();
    },
    /** Finalize through the one door (SessionFinalizer); the recovery state is cleared only after the evidence is committed. */
    async commit(build) {
      try {
        const built = build();
        const input = built && built.payload ? built : { payload: built };
        const result = await services.commit(input);
        finished = true;
        await queue; // a save already in flight must not land after the cleanup
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
    startRetry: services.startRetry ? (kind, args) => { close('retry'); return services.startRetry(kind, args); } : null,
  };

  // Saves are serialized so a discard can never be undone by a save that was already in flight.
  let queue = Promise.resolve();
  function persist() {
    const run = queue.then(async () => {
      try {
        await services.save(engine.snapshot());
        return true;
      } catch (e) {
        ctx.notify(`Your progress could not be saved: ${e?.message ?? e}`, { kind: 'error', ms: 0 });
        return false;
      }
    });
    queue = run;
    return run;
  }

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
    if (choice === 'leave') {
      // a required action: the surface closes only once the recovery state is really stored
      if (await persist()) close('left'); else focusEl(exitBtn);
    } else if (choice === 'discard') {
      const sure = await choose({ title: 'Discard this session?', body: 'The saved progress is deleted. No result is recorded.', actions: [{ value: 'no', label: 'Cancel' }, { value: 'yes', label: 'Discard', kind: 'danger' }] });
      if (sure === 'yes') {
        await queue; // let any in-flight save settle first
        try {
          await services.clear(engine.snapshot().session.id);
        } catch (e) {
          // a required action: the saved row still exists, so nothing is closed, discarded or reported as discarded
          ctx.notify(`The session could not be discarded: ${e?.message ?? e}. Your progress is unchanged; try again.`, { kind: 'error', ms: 0 });
          focusEl(exitBtn);
          return;
        }
        finished = true;
        close('discarded');
      } else focusEl(exitBtn);
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
  try {
    view = mount({ session: engine, ctx, host: body });
  } catch (e) {
    // a session that cannot render (e.g. a corrupt recovery state) must not leave the app stuck in focus mode
    closed = true;
    document.removeEventListener('visibilitychange', onHide);
    if (app) delete app.dataset.focus;
    root.replaceChildren();
    throw e;
  }
  return { close: () => close('left'), el: section, requestExit };
}
