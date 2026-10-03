// Rendering of a learner's answer with a reviewer's corrections (the V1 projection) and with the learner's own marks. Text
// only: every string goes through text nodes. Nothing here edits an answer; it only shows layers over the original.
import { renderCorrectionProjection } from '../exchange/corrections.js';
import { h } from '../dom.js';
import { t } from '../i18n.js';

const INK = { red: 'var(--red)', blue: 'var(--blue)', green: 'var(--green)', purple: '#7a4fa3', orange: 'var(--amber)', teal: 'var(--d-ty)', brown: '#8a5a2b' };

/** The answer with the reviewer's edits, styles and comments laid over it (original text stays recoverable by the projection). */
export function projectionNodes(answerText, corrections) {
  const segments = renderCorrectionProjection(answerText, corrections);
  return segments.map((s) => {
    if (s.type === 'deleted' || s.type === 'replaced-original') return h('del', { class: 'corr-del' }, s.text);
    if (s.type === 'inserted') return h('ins', { class: 'corr-ins', style: s.color ? { color: INK[s.color] ?? '' } : {} }, s.text);
    const node = h('span', { class: `corr-run${s.styles.length ? ' styled' : ''}` });
    for (const st of s.styles) {
      node.classList.add(`st-${st.styleType}`);
      if (st.styleType === 'color' && st.color) node.style.setProperty('color', INK[st.color] ?? '');
    }
    if (s.comments.length) { node.classList.add('commented'); node.title = s.comments.join('\n'); }
    node.append(`${'['.repeat(s.bracketsBefore ?? 0)}${s.text}${']'.repeat(s.bracketsAfter ?? 0)}`);
    return node;
  });
}

/** The answer with the learner's own marks (unknown / uncertain / should-know spans) shown as three different underlines. */
export function annotatedNodes(text, annotations) {
  const list = [...annotations].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  let at = 0;
  for (const a of list) {
    if (a.start < at || a.end > text.length) continue; // an inconsistent mark is skipped, never guessed at
    if (a.start > at) out.push(text.slice(at, a.start));
    out.push(h('mark', { class: `ann ann-${a.kind}`, title: t(`mark.${a.kind}`) }, text.slice(a.start, a.end)));
    at = a.end;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
