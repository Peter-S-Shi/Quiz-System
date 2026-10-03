// The glue between the Focused Practice surface and the store: materials in, sessions started or restored, results out
// through the ONE finalization door (SessionFinalizer) and recovery state through SessionRecovery. Nothing here decides
// domain semantics; it allocates ids at session start (so finalization is idempotent across a crash), reads Content, and
// hands finished sessions to the finalizer.
import { putOp } from '../projection.js';
import { newId } from '../ids.js';
import { ScheduleStore } from '../orchestration/schedule-store.js';
import { systemClock } from '../orchestration/dates.js';
import { SessionFinalizer } from '../task-domains/finalizer.js';
import { SessionRecovery } from '../task-domains/recovery.js';
import { TypingSession, restoreTypingSession } from '../task-domains/typing/session.js';
import { ObjectiveSession } from '../objective/session.js';
import { TranslationSession } from '../translation/session.js';
import { validateQuestion, normalizeQuestion, unsupportedMedia, MEDIA_UNAVAILABLE_REASON } from '../objective/questions.js';

const nowIso = () => new Date().toISOString();

export async function createPracticeRuntime(port, { now = nowIso, ids = newId } = {}) {
  const store = await ScheduleStore.open(port, { clock: systemClock() });
  const finalizer = new SessionFinalizer({ port, store });
  const recovery = new SessionRecovery(port);
  const info = await port.schemaInfo();
  const spec = (name) => info.collections.find((c) => c.name === name);

  const services = {
    now,
    newId: ids,
    save: (state) => recovery.save(state),
    commit: ({ payload, selection, scheduleRef }) => finalizer.finalize({ payload, selection, scheduleRef }),
    clear: (sessionId) => recovery.clear(sessionId),
  };

  const rt = {
    services,

    /** Materials of the three domains, newest first is the caller's concern. Only ready content is startable. */
    async materials() {
      const [papers, docs, texts] = await Promise.all([port.read('paper'), port.read('translation_document'), port.read('typing_text')]);
      return {
        papers: papers.map((r) => r.payload).map((p) => {
          const questions = Array.isArray(p.questions) ? p.questions : [];
          const wellFormed = questions.length > 0 && questions.every((q) => validateQuestion(normalizeQuestion(q)).length === 0);
          // fail closed: a paper with image / audio is listed but not startable until the surface can present media
          const media = questions.some((q) => unsupportedMedia(q));
          return { id: p.id, title: p.title || '(untitled paper)', paper: p, ready: wellFormed && !media, unavailable: wellFormed && media ? MEDIA_UNAVAILABLE_REASON : null, questions: questions.length };
        }),
        documents: docs.map((r) => r.payload).map((d) => ({ id: d.id, title: d.title || '(untitled document)', document: d, ready: Array.isArray(d.items) && d.items.length > 0, items: d.items?.length ?? 0 })),
        texts: texts.map((r) => r.payload).map((t) => ({ id: t.id, title: t.title || '(untitled text)', text: t, ready: typeof t.text === 'string' && t.text.length > 0, characters: t.text?.length ?? 0 })),
      };
    },

    /** Minimal Content creation for Typing (no authoring UI yet): a learner-supplied reference text. */
    async addTypingText({ title, text }) {
      const id = ids();
      const at = now();
      const payload = { schemaVersion: 1, id, title: String(title || '').trim() || 'Untitled text', text: String(text), createdAt: at, updatedAt: at };
      if (!payload.text.trim()) throw new Error('the text is empty');
      await port.commit({ preconditions: [{ kind: 'absent', collection: 'typing_text', id }], ops: [putOp(spec('typing_text'), id, payload)] });
      return payload;
    },

    startObjective({ paper, intent, feedbackTiming, questionIds, provenance }) {
      const engine = ObjectiveSession.start({ paper, questionIds, sessionId: ids(), evidenceId: ids(), startedAt: now(), intent, feedbackTiming, provenance });
      return { domain: 'objective', engine };
    },

    startTranslation({ document, intent = 'practice' }) {
      return { domain: 'translation', engine: TranslationSession.start({ document, sessionId: ids(), evidenceId: ids(), startedAt: now(), intent, ids }) };
    },

    startTyping({ text, intent, provenance }) {
      const policy = { feedbackTiming: intent === 'test' ? 'on-completion' : 'live', corrections: 'allowed' };
      const engine = new TypingSession({ evidenceId: ids(), sessionId: ids(), startedAt: now(), material: { id: text.id, title: text.title, text: text.text }, intent, policy, provenance });
      return { domain: 'typing', engine };
    },

    /** Persist the very first recovery state so a crash right after start is resumable. */
    async begin(started) {
      await recovery.save(started.engine.snapshot());
      return started;
    },

    async resumable() {
      return (await recovery.resumable()).filter((s) => ['objective', 'translation', 'typing'].includes(s?.domain));
    },

    restore(state) {
      if (state.domain === 'objective') return { domain: 'objective', engine: ObjectiveSession.restore(state) };
      if (state.domain === 'translation') return { domain: 'translation', engine: TranslationSession.restore(state, ids) };
      if (state.domain === 'typing') return { domain: 'typing', engine: restoreTypingSession(state) };
      throw new Error(`unknown session domain ${JSON.stringify(state.domain)}`);
    },

    discard: (sessionId) => recovery.clear(sessionId),
  };
  return rt;
}
