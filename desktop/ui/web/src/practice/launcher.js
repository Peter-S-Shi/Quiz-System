// A deliberately minimal practice launcher: just enough to reach the three Focused Practice surfaces from materials in the
// store (and to resume an unfinished session). It is NOT the Library, Today or Calendar - those product views arrive with
// their own milestone - and it makes no scheduling or recommendation decisions.
import { h, uid } from './dom.js';
import { mountPractice } from './surface.js';

const select = (label, options, value) => {
  const id = uid('sel');
  const el = h('select', { id }, options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
  return { el, row: h('label', { class: 'inline-field', for: id }, h('span', {}, `${label} `), el) };
};

/**
 * @param {HTMLElement} main the app's main region
 * @param {Awaited<ReturnType<import('./runtime.js').createPracticeRuntime>>} rt
 */
export async function renderLauncher(main, rt) {
  const say = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const body = h('div', { class: 'launcher' });
  main.replaceChildren(h('h1', {}, 'Start a practice'), h('p', { class: 'lede' }, 'A minimal launcher for the Focused Practice surface. The Library, Today and Calendar views arrive with later milestones.'), say, body);

  const run = (started) => {
    const startRetry = (kind, args) => {
      let next;
      if (kind === 'objective') {
        const paper = papersById.get(args.paperId);
        if (!paper) { say.textContent = 'The source paper is no longer available, so it cannot be retried.'; return; }
        next = rt.startObjective({ paper, intent: args.intent, feedbackTiming: args.feedbackTiming, questionIds: args.questionIds, provenance: { purpose: 'retry', sourceResponseId: args.sourceResponseId, sourceMaterialId: args.paperId } });
      } else if (kind === 'translation') next = rt.startTranslation({ document: args.document });
      else next = rt.startTyping({ text: textsById.get(args.textId) ?? args.text, intent: args.intent, provenance: { purpose: 'retry', sourceAttemptId: args.sourceAttemptId, sourceMaterialId: args.textId } });
      return rt.begin(next).then((s) => run(s));
    };
    return mountPractice({
      root: main, domain: started.domain, engine: started.engine,
      services: { ...rt.services, startRetry },
      onClose: (outcome) => { if (outcome !== 'retry') renderLauncher(main, rt).then(() => main.focus({ preventScroll: true })); },
    });
  };

  let papersById = new Map();
  let textsById = new Map();
  async function load() {
    const [m, resumable] = await Promise.all([rt.materials(), rt.resumable()]);
    papersById = new Map(m.papers.map((p) => [p.id, p.paper]));
    textsById = new Map(m.texts.map((t) => [t.id, t.text]));
    const sections = [];

    if (resumable.length) {
      sections.push(h('section', { class: 'card' }, h('h2', {}, 'Unfinished'),
        h('ul', { class: 'plain' }, resumable.map((s) => h('li', { class: 'row' },
          h('span', {}, `${s.domain === 'objective' ? 'Objective' : s.domain === 'translation' ? 'Translation' : 'Typing'}: ${s.material?.title || s.material?.id || 'session'} `, h('span', { class: 'muted' }, `(started ${s.session?.startedAt ?? ''})`)),
          h('button', { class: 'btn primary', type: 'button', onclick: async () => { try { run(rt.restore(s)); } catch (e) { say.textContent = `This session cannot be resumed (${e.message}). You can discard it.`; } } }, 'Resume'),
          h('button', { class: 'btn', type: 'button', onclick: async () => { await rt.discard(s.session.id); say.textContent = 'Session discarded; nothing was recorded.'; load(); } }, 'Discard'))))));
    }

    const timing = select('Feedback', [['instant', 'Instant, after each question'], ['submit-at-end', 'At the end, when I submit']], 'instant');
    const intent = select('Intent', [['practice', 'Practice'], ['test', 'Test']], 'practice');
    sections.push(h('section', { class: 'card' }, h('h2', {}, 'Objective papers'),
      m.papers.length ? [h('div', { class: 'row' }, intent.row, timing.row),
        h('ul', { class: 'plain' }, m.papers.map((p) => h('li', { class: 'row' }, h('span', {}, `${p.title} `, h('span', { class: 'muted' }, `(${p.questions} questions)`)),
          h('button', { class: 'btn primary', type: 'button', disabled: !p.ready, title: p.ready ? '' : 'This paper has questions that are not ready', onclick: async () => run(await rt.begin(rt.startObjective({ paper: p.paper, intent: intent.el.value, feedbackTiming: timing.el.value }))) }, 'Start'))))]
        : h('p', { class: 'muted' }, 'No papers yet. Import a V1 backup in Settings.')));

    sections.push(h('section', { class: 'card' }, h('h2', {}, 'Translation documents'),
      m.documents.length ? h('ul', { class: 'plain' }, m.documents.map((d) => h('li', { class: 'row' }, h('span', {}, `${d.title} `, h('span', { class: 'muted' }, `(${d.items} sentences)`)),
        h('button', { class: 'btn primary', type: 'button', disabled: !d.ready, onclick: async () => run(await rt.begin(rt.startTranslation({ document: d.document }))) }, 'Start'))))
        : h('p', { class: 'muted' }, 'No translation documents yet. Import a V1 backup in Settings.')));

    const title = h('input', { type: 'text', id: 'tt-title', autocomplete: 'off' });
    const text = h('textarea', { id: 'tt-text', rows: '5', spellcheck: 'false' });
    sections.push(h('section', { class: 'card' }, h('h2', {}, 'Typing texts'),
      m.texts.length ? h('ul', { class: 'plain' }, m.texts.map((t) => h('li', { class: 'row' }, h('span', {}, `${t.title} `, h('span', { class: 'muted' }, `(${t.characters} characters)`)),
        h('button', { class: 'btn primary', type: 'button', disabled: !t.ready, onclick: async () => run(await rt.begin(rt.startTyping({ text: t.text, intent: 'practice' }))) }, 'Practice'),
        h('button', { class: 'btn', type: 'button', disabled: !t.ready, onclick: async () => run(await rt.begin(rt.startTyping({ text: t.text, intent: 'test' }))) }, 'Test')))) : h('p', { class: 'muted' }, 'No typing texts yet. Add one below.'),
      h('details', {}, h('summary', {}, 'Add a typing text'),
        h('div', { class: 'stack' }, h('label', { for: 'tt-title', class: 'field-label' }, 'Title'), title, h('label', { for: 'tt-text', class: 'field-label' }, 'Text to copy'), text,
          h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: async () => {
            try { await rt.addTypingText({ title: title.value, text: text.value }); say.textContent = 'Typing text added.'; load(); } catch (e) { say.textContent = `Could not add the text: ${e.message}`; }
          } }, 'Add text'))))));
    body.replaceChildren(...sections);
  }
  await load();
}
