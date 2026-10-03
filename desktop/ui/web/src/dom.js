// Tiny DOM helpers shared by the whole UI. Text nodes only: material text (prompts, explanations, passages, learner
// answers, file names) is untrusted data and is never parsed as HTML. The page CSP forbids inline style attributes, so a
// `style` prop is an object applied through the CSSOM.

/** Build an element. Props: `class`, `style` (object), `on<event>` handlers, booleans, attributes. Children: nodes, strings, arrays. */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && v && typeof v === 'object') { for (const [name, value] of Object.entries(v)) el.style.setProperty(name, String(value)); }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/** replaceChildren that skips null / undefined / false (a bare `replaceChildren(null)` would insert the text "null"). */
export function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
  return el;
}

let counter = 0;
export const uid = (prefix = 'p') => `${prefix}-${++counter}`;

/** Move focus without scrolling the page away from the user's context. */
export function focusEl(el) {
  if (el && typeof el.focus === 'function') el.focus({ preventScroll: false });
}

/** A visually hidden span for screen-reader-only text (state that color or an icon would otherwise carry alone). */
export const sr = (text) => h('span', { class: 'sr-only' }, text);
