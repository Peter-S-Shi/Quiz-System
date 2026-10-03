// Objective in the Focused Practice surface. Renders ONLY what `ObjectiveSession.view()` returns: in Submit-at-End there is
// no grading, correct answer or explanation anywhere in the DOM before the paper is submitted, because the engine never
// hands them to the view (Scope Freeze Rev.1 section 10). Instant reveals the correct answer and the explanation of an
// item only after that item was graded.
import { mediaBlock } from './media-presenter.js';
import { typeLabel, fill, focusEl, h, sr, uid } from './dom.js';
import { checkRow } from './check-row.js';
import { reviewCard, scoreHero } from './result-view.js';
import { t } from '../i18n.js';

const mediaLabels = () => ({ image: t('pr.obj.image'), audio: t('pr.obj.audio'), imageUnavailable: t('pr.obj.imageGone'), audioUnavailable: t('pr.obj.audioGone') });

export function mountObjective({ session, ctx, host }) {
  let stage = 'run';
  let outcome = null;
  const root = h('div', { class: 'obj' });
  host.replaceChildren(root);

  const timing = () => session.view().feedbackTiming;
  const tagFor = (v) => t('pr.obj.tag', { intent: t(v.intent === 'test' ? 'pr.obj.intent.test' : 'pr.obj.intent.practice'), timing: t(v.feedbackTiming === 'instant' ? 'pr.obj.timing.instant' : 'pr.obj.timing.end') });

  function header(v) {
    ctx.setHeader({ title: v.title || t('pr.obj.paper'), tag: tagFor(v) });
    const answered = v.progress.answered;
    ctx.setProgress({ text: t('pr.obj.progress', { n: answered, total: v.total }), done: answered, total: v.total });
  }

  function choicesFor(v) {
    const q = v.question;
    const locked = v.locked;
    const fb = v.feedback;
    const legendId = uid('q');
    const mark = (correct, chosen) => (fb ? [correct ? h('span', { class: 'mark ok', 'aria-hidden': 'true' }, '✓') : null, correct ? sr(t('pr.obj.srCorrect')) : null, chosen && !correct ? h('span', { class: 'mark bad', 'aria-hidden': 'true' }, '✗') : null, chosen && !correct ? sr(t('pr.obj.srWrong')) : null, chosen && correct ? sr(t('pr.obj.srAnswer')) : null] : []);
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
          ctx.sfx('pen');
          answer(multi && !next.length ? null : next);
        });
        body.push(h('label', { class: `choice${fb && correct ? ' is-correct' : ''}${fb && picked.has(o.id) && !correct ? ' is-wrong' : ''}` }, input, h('span', { class: 'choice-text' }, o.text), mark(correct, picked.has(o.id))));
      });
      return h('fieldset', { class: 'choices', 'aria-labelledby': legendId }, h('legend', { id: legendId, class: 'prompt' }, q.prompt), multi ? h('p', { class: 'hint' }, t('pr.obj.selectAll')) : null, body);
    }
    if (q.type === 'truefalse') {
      const name = uid('tf');
      return h('fieldset', { class: 'choices', 'aria-labelledby': legendId }, h('legend', { id: legendId, class: 'prompt' }, q.prompt),
        [[t('pr.obj.true'), true], [t('pr.obj.false'), false]].map(([label, val]) => {
          const input = h('input', { type: 'radio', name, value: String(val), checked: v.answer === val, disabled: locked });
          input.addEventListener('change', () => { ctx.sfx('pen'); answer(val); });
          return h('label', { class: 'choice' }, input, h('span', { class: 'choice-text' }, label));
        }));
    }
    if (q.type === 'blank') {
      const id = uid('blank');
      const input = h('input', { type: 'text', id, class: 'blank', value: v.answer ?? '', disabled: locked, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': legendId });
      input.addEventListener('input', () => { session.answer(input.value === '' ? null : input.value); ctx.save(); refreshControls(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && session.view().canSubmitItem) { e.preventDefault(); check(); } });
      return h('div', { class: 'choices' }, h('p', { id: legendId, class: 'prompt' }, q.prompt), h('label', { for: id, class: 'field-label' }, t('pr.obj.yourAnswer')), input);
    }
    // matching: one labelled select per left item; tokens in the view are opaque (they do not reveal the pairing)
    return h('div', { class: 'choices', role: 'group', 'aria-labelledby': legendId }, h('p', { id: legendId, class: 'prompt' }, q.prompt),
      q.pairs.map((p) => {
        const id = uid('pair');
        const current = v.answer?.[p.id] ?? '';
        const sel = h('select', { id, disabled: locked }, h('option', { value: '' }, t('pr.obj.choose')), q.rightOptions.map((r) => h('option', { value: r.id, selected: r.id === current }, r.text)));
        sel.addEventListener('change', () => {
          ctx.sfx('pen');
          const next = { ...(session.view().answer ?? {}) };
          if (sel.value) next[p.id] = sel.value; else delete next[p.id];
          answer(Object.keys(next).length ? next : null);
        });
        const right = fb ? q.rightOptions.find((r) => r.id === fb.correctPairs[p.id])?.text : null;
        const ok = fb ? fb.correctPairs[p.id] === current : null;
        return h('div', { class: `pair${fb ? (ok ? ' is-correct' : ' is-wrong') : ''}` }, h('label', { for: id, class: 'pair-left' }, p.left), sel,
          fb ? h('span', { class: 'pair-verdict' }, ok ? [h('span', { 'aria-hidden': 'true' }, '✓'), sr(t('pr.obj.correct'))] : [h('span', { 'aria-hidden': 'true' }, '✗'), ` ${right}`, sr(t('pr.obj.incorrectMatch', { right }))]) : null);
      }));
  }

  function feedbackPanel(v) {
    const fb = v.feedback;
    if (!fb) return null;
    const headId = uid('fb');
    return h('div', { class: `feedback ${fb.correct ? 'correct' : 'wrong'}`, role: 'group', 'aria-labelledby': headId, tabindex: '-1', id: 'feedback' },
      h('h3', { id: headId }, fb.correct ? t('pr.obj.correct') : t('pr.obj.notQuite')),
      h('p', {}, h('span', { class: 'label' }, `${fb.correctLabel}: `), fb.correctAnswer),
      typeof fb.explanation === 'string' ? h('div', { class: 'explanation' }, h('h4', {}, t('pr.obj.explanation')), h('p', { class: 'explanation-text' }, fb.explanation)) : null);
  }

  function navChips(v) {
    return h('nav', { class: 'qnav', 'aria-label': t('pr.obj.questions') }, v.items.map((it, i) => {
      const b = h('button', { type: 'button', class: `chipbtn${it.answered ? ' answered' : ''}${it.graded ? (it.correct ? ' good' : ' bad') : ''}${i === v.index ? ' current' : ''}`, 'aria-current': i === v.index ? 'step' : null,
        'aria-label': t('pr.obj.chip', { n: i + 1, answered: t(it.answered ? 'pr.obj.chip.answered' : 'pr.obj.chip.notAnswered'), graded: it.graded ? t(it.correct ? 'pr.obj.chip.correct' : 'pr.obj.chip.incorrect') : '' }) }, String(i + 1));
      b.addEventListener('click', () => { ctx.sfx('page'); session.go(i); ctx.save(); render({ focus: 'question' }); });
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
    ctx.sfx('stamp');
    await ctx.save();
    const fb = session.view().feedback;
    ctx.announce(t('pr.obj.announce', { verdict: fb.correct ? t('pr.obj.correct') : t('pr.obj.notQuite'), label: fb.correctLabel, answer: fb.correctAnswer, explanation: fb.explanation ? t('pr.obj.announceExpl', { text: fb.explanation }) : '' }));
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
      const c = await ctx.choose({ title: t('pr.obj.submit.title'), body: unanswered ? t('pr.obj.unanswered', { n: unanswered }) : t('pr.obj.submit.body'), actions: [{ value: 'no', label: t('pr.obj.submit.keep') }, { value: 'yes', label: t('pr.obj.submit.confirm'), kind: 'primary' }] });
      if (c !== 'yes') return render({ focus: 'finish' });
    }
    const res = await ctx.commit(() => session.finalize({ now: ctx.now() }));
    if (!res.ok) return;
    ctx.sfx('stamp');
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
    const retryShuffle = checkRow({ label: t('pr.obj.shuffle') });
    ctx.setHeader({ title: payload.material.title || t('pr.obj.paper'), tag: t('pr.obj.tagDone', { intent: t(payload.extensions['quiz-studio.v2.session'].intent === 'test' ? 'pr.obj.intent.test' : 'pr.obj.intent.practice') }) });
    ctx.setProgress({ text: t('pr.obj.submitted'), done: 1, total: 1 });
    ctx.announce(t('pr.obj.summary', { correct: payload.summary.correctCount, total: payload.summary.itemCount }));
    return h('div', { class: 'result' },
      h('h2', { tabindex: '-1', id: 'result-head' }, t('pr.obj.result')),
      scoreHero({ correct: payload.summary.correctCount, total: payload.summary.itemCount }),
      h('p', { class: 'muted' }, t('pr.obj.saved')),
      h('ol', { class: 'review rv-list' }, review.map((r) => reviewCard({ index: r.index, prompt: r.prompt, answered: Boolean(r.learnerAnswer), answer: r.learnerAnswer, correct: r.correct, correctLabel: r.correctLabel, correctAnswer: r.correctAnswer, explanation: r.explanation },
        { answer: t('pr.obj.yourAnswerColon').replace(/[:：]\s*$/, ''), noAnswer: t('pr.obj.noAnswer'), correctAnswer: t('pr.obj.correctAnswer'), explanation: t('pr.obj.explanation') }))),
      wrongIds.length > 1 && ctx.startRetry ? h('div', { class: 'row' }, retryShuffle.el) : null,
      h('div', { class: 'row actions' },
        wrongIds.length && ctx.startRetry ? h('button', { class: 'btn', type: 'button', onclick: () => ctx.startRetry('objective', { shuffleQuestions: retryShuffle.get(), questionIds: wrongIds, sourceResponseId: payload.id, paperId: payload.material.id, intent: payload.extensions['quiz-studio.v2.session'].intent, feedbackTiming: payload.extensions['quiz-studio.v2.session'].feedbackTiming }) }, t('pr.obj.retry', { n: wrongIds.length })) : null,
        h('button', { class: 'btn primary', type: 'button', onclick: () => ctx.requestExit() }, t('pr.done'))));
  }

  function render({ focus } = {}) {
    if (stage === 'result') { fill(root, resultView()); if (focus) focusEl(root.querySelector('#result-head')); return; }
    const v = session.view();
    header(v);
    const last = v.index === v.total - 1;
    const instant = v.feedbackTiming === 'instant';
    const checkBtn = instant ? h('button', { class: 'btn primary', type: 'button', 'data-act': 'check', disabled: !v.canSubmitItem, onclick: check }, t('pr.obj.check')) : null;
    const finishBtn = h('button', { class: `btn${last || v.canFinish ? ' primary' : ''}`, type: 'button', 'data-act': 'finish', disabled: !v.canFinish, onclick: finish }, instant ? t('pr.finish') : t('pr.obj.submitPaper'));
    const prev = h('button', { class: 'btn', type: 'button', disabled: v.index === 0, onclick: () => { ctx.sfx('page'); session.go(v.index - 1); ctx.save(); render({ focus: 'question' }); } }, t('pr.previous'));
    const next = h('button', { class: 'btn', type: 'button', disabled: last, onclick: () => { ctx.sfx('page'); session.go(v.index + 1); ctx.save(); render({ focus: 'question' }); } }, t('pr.next'));
    const qhead = h('h2', { class: 'qhead', tabindex: '-1', id: 'qhead' }, t('pr.obj.questionOf', { n: v.index + 1, total: v.total }), h('span', { class: 'qtype' }, ` · ${typeLabel(v.question.type)}`));
    const media = mediaBlock(ctx.media, v.question, mediaLabels());
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

