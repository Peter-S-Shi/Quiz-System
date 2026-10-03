// A labelled checkbox row for a per-session learner choice (practice-layer twin of the product kit's helper; the practice
// layer must not import from ui/).
import { h } from './dom.js';

export function checkRow({ label, hint, checked = false, onchange }) {
  const input = h('input', { type: 'checkbox', checked });
  if (onchange) input.addEventListener('change', () => onchange(input.checked));
  const el = h('label', { class: 'check-row' }, input, h('span', {}, label, hint ? h('span', { class: 'hint small' }, ` ${hint}`) : null));
  return { el, get: () => input.checked };
}
