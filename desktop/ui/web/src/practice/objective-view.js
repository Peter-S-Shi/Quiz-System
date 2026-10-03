// Objective in the Focused Practice surface. Renders ONLY what `ObjectiveSession.view()` returns: in Submit-at-End there is
// no grading, correct answer or explanation anywhere in the DOM before the paper is submitted, because the engine never
// hands them to the view (Scope Freeze Rev.1 section 10). Instant reveals the correct answer and the explanation of an
// item only after that item was graded.
import { mediaBlock } from './media-presenter.js';
import { TYPE_LABEL, fill, focusEl, h, sr, uid } from './dom.js';

const MEDIA_LABELS = { image: 'Image', audio: 'Audio', imageUnavailable: 'The image for this question cannot be shown.', audioUnavailable: 'The audio for this question cannot be played.' };

export function mountObjective({ session, ctx, host }) {
  let stage = 'run';
  let outcome = null;
  const root = h('div', { class: 'obj' });
  host.replaceChildren(root);

  const timing = () => session.view().feedbackTiming;
  const tagFor = (v) => `Objective · ${v.intent === 'test' ? 'Test' : 'Practice'} · ${v.feedbackTiming === 'instant' ? 'instant feedback' : 'feedback at the end'}`;

  function header(v) {
    ctx.setHeader({ title: v.title || 'Paper', tag: tagFor(v) });
    const answered = v.progress.answered;
    ctx.setProgress({ text: `${answered} of ${v.total} answered`, done: answered, total: v.total });
  }

  function choicesFor(v) {
    const q = v.question;
    const locked = v.locked;
    const fb = v.feedback;
    const legendId = uid('q');
    const mark = (correct, chosen) => (fb ? [correct ? h('span', { class: 'mark ok', 'aria-hidden': 'true' }, '✓') : null, correct ? sr('Correct answer. ') : null, chosen && !correct ? h('span', { class: 'mark bad', 'aria-hidden': 'true' }, '✗') : null, chosen && !correct ? sr('Your answer, incorrect. ') : null, chosen && correct ? sr('Your answer. ') : null] : []);
    const body = [];
    if (q.type === 'single' || q.type === 'multiple') {
      const multi = q.type === 'multiple';
      const name = uid('opt');
      const picked = new Set(multi ? (v.answer ?? []) : v.answer ? [v.answer] : []);
      q.options.forEach((o) => {
        const correct = fb ? fb.correctOptionIds.includes(o.id) : false;
        const input = h('input', { type: multi ? 'checkbox' : 'radio', name, value: o.id, checked: picked.has(o.id), disabled: locked });
        input.addEventListener('change', () => {
          const next = multi ? [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value) : input.value;
          answer(multi && !next.length ? null : next);
        });
        body.push(h('label', { class: `choice${fb && correct ? ' is-correct' : ''}${fb && picked.has(o.id) && !correct ? ' is-wrong' : ''}` }, input, h('span', { class: 'choice-text' }, o.text), mark(correct, picked.has(o.id))));
      });
      return h('fieldset', { class: 'choices', 'aria-labelledby': legendId }, h('legend', { id: legendId, class: 'prompt' }, q.prompt), multi ? h('p', { class: 'hint' }, 'Select all that apply.') : null, body);
    }
    if (q.type === 'truefalse') {
      const name = uid('tf');
      return h('fieldset', { class: 'choices', 'aria-labelledby': legendId }, h('legend', { id: legendId, class: 'prompt' }, q.prompt),
        [['True', true], ['False', false]].map(([label, val]) => {
          const input = h('input', { type: 'radio', name, value: String(val), checked: v.answer === val, disabled: locked });
          input.addEventListener('change', () => answer(val));
          return h('label', { class: 'choice' }, input, h('span', { class: 'choice-text' }, label));
        }));
    }
    if (q.type === 'blank') {
      const id = uid('blank');
      const input = h('input', { type: 'text', id, class: 'blank', value: v.answer ?? '', disabled: locked, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': legendId });
      input.addEventListener('input', () => { session.answer(input.value === '' ? null : input.value); ctx.save(); refreshControls(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && session.view().canSubmitItem) { e.preventDefault(); check(); } });
      return h('div', { class: 'choices' }, h('p', { id: legendId, class: 'prompt' }, q.prompt), h('label', { for: id, class: 'field-label' }, 'Your answer'), input);
    }
    // matching: one labelled select per left item; tokens in the view are opaque (they do not reveal the pairing)
    return h('div', { class: 'choices', role: 'group', 'aria-labelledby': legendId }, h('p', { id: legendId, class: 'prompt' }, q.prompt),
      q.pairs.map((p) => {
        const id = uid('pair');
        const current = v.answer?.[p.id] ?? '';
        const sel = h('select', { id, disabled: locked }, h('option', { value: '' }, 'Choose…'), q.rightOptions.map((r) => h('option', { value: r.id, selected: r.id === current }, r.text)));
        sel.addEventListener('change', () => {
          const next = { ...(session.view().answer ?? {}) };
          if (sel.value) next[p.id] = sel.value; else delete next[p.id];
          answer(Object.keys(next).length ? next : null);
        });
        const right = fb ? q.rightOptions.find((r) => r.id === fb.correctPairs[p.id])?.text : null;
        const ok = fb ? fb.correctPairs[p.id] === current : null;
        return h('div', { class: `pair${fb ? (ok ? ' is-correct' : ' is-wrong') : ''}` }, h('label', { for: id, class: 'pair-left' }, p.left), sel,
          fb ? h('span', { class: 'pair-verdict' }, ok ? [h('span', { 'aria-hidden': 'true' }, '✓'), sr('Correct')] : [h('span', { 'aria-hidden': 'true' }, '✗'), ` ${right}`, sr(`Incorrect. Correct match: ${right}`)]) : null);
      }));
  }

  function feedbackPanel(v) {
    const fb = v.feedback;
    if (!fb) return null;
    const headId = uid('fb');
    return h('div', { class: `feedback ${fb.correct ? 'correct' : 'wrong'}`, role: 'group', 'aria-labelledby': headId, tabindex: '-1', id: 'feedback' },
      h('h3', { id: headId }, fb.correct ? 'Correct' : 'Not quite'),
      h('p', {}, h('span', { class: 'label' }, `${fb.correctLabel}: `), fb.correctAnswer),
      typeof fb.explanation === 'string' ? h('div', { class: 'explanation' }, h('h4', {}, 'Explanation'), h('p', { class: 'explanation-text' }, fb.explanation)) : null);
  }

  function navChips(v) {
    return h('nav', { class: 'qnav', 'aria-label': 'Questions' }, v.items.map((it, i) => {
      const b = h('button', { type: 'button', class: `chipbtn${it.answered ? ' answered' : ''}${it.graded ? (it.correct ? ' good' : ' bad') : ''}${i === v.index ? ' current' : ''}`, 'aria-current': i === v.index ? 'step' : null,
        'aria-label': `Question ${i + 1}, ${it.answered ? 'answered' : 'not answered'}${it.graded ? (it.correct ? ', correct' : ', incorrect') : ''}` }, String(i + 1));
      b.addEventListener('click', () => { session.go(i); ctx.save(); render({ focus: 'question' }); });
      return b;
    }));
  }

  function answer(value) {
    try { session.answer(value); } catch (e) { ctx.notify(e.message, { kind: 'error' }); return; }
    ctx.save();
    refreshControls();
  }

  async function check() {
    try { session.submitItem(); } catch (e) { ctx.notify(e.message, { kind: 'error' }); return; }
    await ctx.save();
    const fb = session.view().feedback;
    ctx.announce(`${fb.correct ? 'Correct' : 'Not quite'}. ${fb.correctLabel}: ${fb.correctAnswer}.${fb.explanation ? ` Explanation: ${fb.explanation}` : ''}`);
    render({ focus: 'feedback' });
  }

  let finishing = false;
  async function finish() {
    if (finishing) return;
    finishing = true;
    try { await finishNow(); } finally { finishing = false; }
  }
  async function finishNow() {
    const v = session.view();
    const unanswered = v.total - v.progress.answered;
    if (v.feedbackTiming === 'submit-at-end') {
      const c = await ctx.choose({ title: 'Submit the paper?', body: unanswered ? `${unanswered} question(s) are unanswered and will count as incorrect. Answers cannot be changed after you submit.` : 'Answers cannot be changed after you submit.', actions: [{ value: 'no', label: 'Keep working' }, { value: 'yes', label: 'Submit paper', kind: 'primary' }] });
      if (c !== 'yes') return render({ focus: 'finish' });
    }
    const res = await ctx.commit(() => session.finalize({ now: ctx.now() }));
    if (!res.ok) return;
    outcome = { payload: res.payload, review: session.review() };
    stage = 'result';
    render({ focus: 'result' });
  }

  function refreshControls() {
    const v = session.view();
    header(v);
    const checkBtn = root.querySelector('[data-act="check"]');
    if (checkBtn) checkBtn.disabled = !v.canSubmitItem;
    const chip = root.querySelectorAll('.qnav .chipbtn')[v.index];
    if (chip) chip.classList.toggle('answered', v.items[v.index].answered);
  }

  function resultView() {
    const { payload, review } = outcome;
    const wrongIds = payload.responses.filter((r) => !r.result.correct).map((r) => r.itemId);
    ctx.setHeader({ title: payload.material.title || 'Paper', tag: `Objective · ${payload.extensions['quiz-studio.v2.session'].intent === 'test' ? 'Test' : 'Practice'} · submitted` });
    ctx.setProgress({ text: 'Submitted', done: 1, total: 1 });
    ctx.announce(`Paper submitted. ${payload.summary.correctCount} of ${payload.summary.itemCount} correct.`);
    return h('div', { class: 'result' },
      h('h2', { tabindex: '-1', id: 'result-head' }, 'Result'),
      h('p', { class: 'score' }, h('b', {}, `${payload.summary.correctCount} of ${payload.summary.itemCount}`), ` correct (${payload.summary.percent}%)`),
      h('p', { class: 'muted' }, 'Saved as a learning record.'),
      h('ol', { class: 'review' }, review.map((r) => h('li', { class: r.correct ? 'correct' : 'wrong' },
        h('p', { class: 'prompt' }, r.prompt),
        h('p', {}, h('span', { class: 'label' }, 'Your answer: '), r.learnerAnswer || h('em', {}, 'no answer'), ' ', r.correct ? [h('span', { 'aria-hidden': 'true' }, '✓'), sr('Correct')] : [h('span', { 'aria-hidden': 'true' }, '✗'), sr('Incorrect')]),
        r.correct ? null : h('p', {}, h('span', { class: 'label' }, `${r.correctLabel}: `), r.correctAnswer),
        typeof r.explanation === 'string' ? h('div', { class: 'explanation' }, h('h4', {}, 'Explanation'), h('p', { class: 'explanation-text' }, r.explanation)) : null))),
      h('div', { class: 'row actions' },
        wrongIds.length && ctx.startRetry ? h('button', { class: 'btn', type: 'button', onclick: () => ctx.startRetry('objective', { questionIds: wrongIds, sourceResponseId: payload.id, paperId: payload.material.id, intent: payload.extensions['quiz-studio.v2.session'].intent, feedbackTiming: payload.extensions['quiz-studio.v2.session'].feedbackTiming }) }, `Retry the ${wrongIds.length} incorrect question(s)`) : null,
        h('button', { class: 'btn primary', type: 'button', onclick: () => ctx.requestExit() }, 'Done')));
  }

  function render({ focus } = {}) {
    if (stage === 'result') { fill(root, resultView()); if (focus) focusEl(root.querySelector('#result-head')); return; }
    const v = session.view();
    header(v);
    const last = v.index === v.total - 1;
    const instant = v.feedbackTiming === 'instant';
    const checkBtn = instant ? h('button', { class: 'btn primary', type: 'button', 'data-act': 'check', disabled: !v.canSubmitItem, onclick: check }, 'Check answer') : null;
    const finishBtn = h('button', { class: `btn${last || v.canFinish ? ' primary' : ''}`, type: 'button', 'data-act': 'finish', disabled: !v.canFinish, onclick: finish }, instant ? 'Finish' : 'Submit paper');
    const prev = h('button', { class: 'btn', type: 'button', disabled: v.index === 0, onclick: () => { session.go(v.index - 1); ctx.save(); render({ focus: 'question' }); } }, 'Previous');
    const next = h('button', { class: 'btn', type: 'button', disabled: last, onclick: () => { session.go(v.index + 1); ctx.save(); render({ focus: 'question' }); } }, 'Next');
    const qhead = h('h2', { class: 'qhead', tabindex: '-1', id: 'qhead' }, `Question ${v.index + 1} of ${v.total}`, h('span', { class: 'qtype' }, ` · ${TYPE_LABEL[v.question.type]}`));
    const media = mediaBlock(ctx.media, v.question, MEDIA_LABELS);
    fill(root, 
      navChips(v), qhead, media, choicesFor(v), feedbackPanel(v),
      h('div', { class: 'row actions' }, prev, next, checkBtn, finishBtn));
    if (focus === 'feedback') focusEl(root.querySelector('#feedback'));
    else if (focus === 'finish') focusEl(root.querySelector('[data-act="finish"]'));
    else if (focus === 'question') focusEl(root.querySelector('#qhead'));
  }

  render({ focus: 'question' });
  return { dispose() {}, focus: () => focusEl(root.querySelector('#qhead')) };
}

