// Shared UI building blocks of the product views: segmented controls, dialogs, notices, dates, domain chips. Everything
// renders text through text nodes (stored values and file names are untrusted); nothing here knows about the store.
import { fill, focusEl, h, uid } from '../dom.js';
import { getLocale, t } from '../i18n.js';

export { h, fill, focusEl, uid };

/** A segmented single-choice control (radio semantics, arrow keys). `onchange(value)` fires on user changes only. */
export function seg({ label, options, value, onchange }) {
  let current = value;
  const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((o) => h('button', { type: 'button', role: 'radio', 'data-v': o.value, 'aria-checked': String(o.value === current), tabindex: o.value === current ? '0' : '-1', onclick: () => choose(o.value, true), onkeydown: (e) => key(e, o.value) }, o.label));
  fill(group, buttons);
  function paint() {
    for (const b of buttons) {
      const on = b.dataset.v === current;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }
  function choose(v, user) {
    if (v === current) return;
    current = v;
    paint();
    if (user) onchange?.(v);
  }
  function key(e, v) {
    const i = options.findIndex((o) => o.value === v);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = options[(i + 1) % options.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = options[(i - 1 + options.length) % options.length];
    if (!next) return;
    e.preventDefault();
    choose(next.value, true);
    buttons.find((b) => b.dataset.v === next.value).focus();
  }
  return { el: group, get: () => current, set: (v) => choose(v, false) };
}

/** `YYYY-MM-DD` as a short, locale-aware label (a date, never an instant: the zone must not shift it). */
export function formatDate(date, opts = { month: 'short', day: 'numeric' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return date ?? '';
  return new Intl.DateTimeFormat(getLocale(), { ...opts, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

/** An ISO instant as a short local date and time. */
export function formatInstant(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(getLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export const DOMAIN_CLASS = { objective: 'obj', translation: 'tr', typing: 'ty' };
export const domainName = (domain) => t(`domain.${domain}`);
export const domainDot = (domain) => h('span', { class: `dot ${DOMAIN_CLASS[domain] ?? ''}`, 'aria-hidden': 'true' });
export const intentName = (intent) => t(`intent.${intent}`);

export function emptyState({ title, body, action }) {
  return h('div', { class: 'empty' }, h('h3', {}, title), body ? h('p', { class: 'muted' }, body) : null, action ?? null);
}

export const field = (label, control, hint) => {
  const id = control.id || uid('f');
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
};

export function textInput(props = {}) { return h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', ...props }); }

/**
 * A modal dialog. `build(close)` returns the body node; resolves with the value passed to `close` (default 'cancel'). The
 * first control is focused and focus returns to where it was.
 */
export function modal({ title, build, wide = false }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const dlg = h('dialog', { class: `dialog${wide ? ' wide' : ''}`, 'aria-labelledby': 'modal-title' });
    const body = h('div', { class: 'dialog-body' });
    let result = 'cancel';
    const close = (v) => { result = v; dlg.close(); };
    fill(dlg, h('h2', { id: 'modal-title' }, title), body);
    fill(body, build(close));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); if (previous && document.contains(previous)) focusEl(previous); });
    document.body.append(dlg);
    dlg.showModal();
    focusEl(dlg.querySelector('input, textarea, select, button.primary, button'));
  });
}

export function confirmDialog({ title, body, okLabel, danger = false, cancelLabel }) {
  return modal({
    title,
    build: (close) => [
      h('p', {}, body),
      h('menu', {}, h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, cancelLabel ?? t('common.cancel')), h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => close(true) }, okLabel ?? t('common.ok'))),
    ],
  }).then((v) => v === true);
}

/** A polite, non-modal notice region owned by the shell. */
export function createToaster(region) {
  let timer = null;
  return (message, { kind = 'info', ms = 5000 } = {}) => {
    region.textContent = message;
    region.dataset.kind = kind;
    region.hidden = false;
    clearTimeout(timer);
    if (ms) timer = setTimeout(() => { region.hidden = true; }, ms);
  };
}

/** Run an async action; report a failure as a notice instead of an unhandled rejection. */
export function guarded(toast, fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      toast(String(e?.message ?? e).replace(/^[A-Z_]+: /, ''), { kind: 'error', ms: 0 });
      return undefined;
    }
  };
}

export function sectionTitle(text, count) {
  return h('h2', { class: 'sec' }, text, count === undefined ? null : h('span', { class: 'count mono' }, String(count)));
}

export const pill = (text, kind = 'neutral') => h('span', { class: `pill ${kind}` }, text);
