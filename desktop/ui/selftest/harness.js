// The Focused Practice harness: mounts the REAL surface (the shipped modules) with in-memory services so a browser engine
// can be driven without the Tauri runtime. It is a test tool, not part of the app (it lives outside desktop/ui/web).
import { mountPractice } from '../web/src/practice/surface.js';
import { ObjectiveSession } from '../web/src/objective/session.js';
import { TranslationSession } from '../web/src/translation/session.js';
import { TypingSession, restoreTypingSession } from '../web/src/task-domains/typing/session.js';
import { paperWithExplanations } from '../tests/objective-fixtures.mjs';
import { ADAPTERS } from '../web/src/task-domains/adapters.js';

const state = { saves: [], commits: [], clears: [], closed: null, invalid: [], engine: null };
let n = 0;
const ids = () => `h-${++n}`;
const T = () => new Date().toISOString();

const services = {
  now: T,
  newId: ids,
  save: async (s) => { state.saves.push(JSON.parse(JSON.stringify(s))); },
  commit: async ({ payload }) => {
    const adapter = Object.values(ADAPTERS).find((a) => a.materialType === payload.material.type);
    const errs = adapter.validate(payload);
    if (errs.length) { state.invalid.push(errs); throw new Error(`invalid evidence: ${errs.join('; ')}`); }
    state.commits.push(JSON.parse(JSON.stringify(payload)));
    return { alreadyFinalized: false };
  },
  clear: async (id) => { state.clears.push(id); },
};

export function longText(graphemes, seed = 7) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const words = ['the', 'environment', 'matters', 'learning', 'by', 'copying', 'careful', 'text', 'café', '你好', 'and', 'of', 'to', 'practice'];
  let out = '';
  while ([...out].length < graphemes) out += `${words[Math.floor(rnd() * words.length)]}${rnd() < 0.12 ? '.\n' : ' '}`;
  return out;
}

const main = () => document.getElementById('main');
function mount(domain, engine, extra = {}) {
  state.closed = null;
  state.engine = engine;
  return mountPractice({ root: main(), domain, engine, services: { ...services, ...extra }, onClose: (o) => { state.closed = o; main().replaceChildren(Object.assign(document.createElement('p'), { textContent: `closed:${o}` })); } });
}

window.harness = {
  state, services, longText, paperWithExplanations,
  objective({ feedbackTiming = 'instant', intent = 'practice', explain = true } = {}) {
    const paper = paperWithExplanations({ explain });
    const engine = ObjectiveSession.start({ paper, sessionId: ids(), evidenceId: ids(), startedAt: T(), feedbackTiming, intent, rng: () => 0.5 });
    return mount('objective', engine);
  },
  translation() {
    const document = { id: 'doc-1', title: 'Synthetic document', sourceLanguage: 'en', targetLanguage: 'zh', items: [
      { id: 'i1', sourceText: 'The environment matters.', referenceTranslation: '环境很重要。' }, { id: 'i2', sourceText: 'Learning is a habit.' }] };
    const engine = TranslationSession.start({ document, sessionId: ids(), evidenceId: ids(), startedAt: T(), intent: 'practice', ids });
    return mount('translation', engine, { startRetry: async () => {} });
  },
  typing({ intent = 'practice', length = 7500, text, committedText = '' } = {}) {
    const material = { id: 'typing-1', title: 'Long passage', text: text ?? longText(length) };
    const engine = new TypingSession({ evidenceId: ids(), sessionId: ids(), startedAt: T(), material, intent, policy: { feedbackTiming: intent === 'test' ? 'on-completion' : 'live', corrections: 'allowed' }, committedText });
    return mount('typing', engine);
  },
  restoreTyping(snap) { return mount('typing', restoreTypingSession(snap)); },
};
document.title = 'harness-ready';
