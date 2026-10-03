// The glue between the Focused Practice surface and the store: materials in, sessions started or restored, results out
// through the ONE finalization door (SessionFinalizer) and recovery state through SessionRecovery. Nothing here decides
// domain semantics; it allocates ids at session start (so finalization is idempotent across a crash), reads Content, and
// hands finished sessions to the finalizer.
import { newId } from '../ids.js';
import { ScheduleStore } from '../orchestration/schedule-store.js';
import { systemClock } from '../orchestration/dates.js';
import { SessionFinalizer } from '../task-domains/finalizer.js';
import { SessionRecovery } from '../task-domains/recovery.js';
import { TypingSession, restoreTypingSession } from '../task-domains/typing/session.js';
import { ObjectiveSession } from '../objective/session.js';
import { TranslationSession } from '../translation/session.js';
import { validateQuestion, normalizeQuestion, mediaRefs } from '../objective/questions.js';

const nowIso = () => new Date().toISOString();

/**
 * @param {object} port the Store Port
 * @param {object} [opts]
 * @param {object} [opts.store] a shared ScheduleStore (the product shares ONE writer of Scheduling Context)
 * @param {{prove(refs: {kind: string, id: string}[]): Promise<{presentable: Set<string>, problems: {kind: string, id: string, reason: string}[]}>}} [opts.media]
 *   the surface's media presenter. Without one nothing can be proven presentable and media papers stay fail-closed.
 */
export async function createPracticeRuntime(port, { now = nowIso, ids = newId, store: sharedStore = null, media = null } = {}) {
  const store = sharedStore ?? await ScheduleStore.open(port, { clock: systemClock() });
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

  const launchOf = (selection, scheduleRef) => ({ ...(selection ? { selection } : {}), ...(scheduleRef ? { scheduleRef } : {}) });

  /**
   * The services a mounted surface needs for ONE session. How the session was started (the learner's Selection and the
   * schedule occurrence it was started from) travels with the recovery state, so a resumed session finalizes with the
   * same provenance. Absent means unknown, never guessed.
   */
  const servicesFor = (started) => {
    const launch = started?.launch ?? {};
    const hasLaunch = launch.selection !== undefined || launch.scheduleRef !== undefined;
    return {
      ...services,
      save: (state) => recovery.save(hasLaunch ? { ...state, launch } : state),
      commit: ({ payload, selection, scheduleRef }) => finalizer.finalize({ payload, selection: selection ?? launch.selection, scheduleRef: scheduleRef ?? launch.scheduleRef }),
    };
  };

  const rt = {
    services,
    servicesFor,
    store,

    /** Materials of the three domains, newest first is the caller's concern. Only ready content is startable. */
    async materials() {
      const [papers, docs, texts] = await Promise.all([port.read('paper'), port.read('translation_document'), port.read('typing_text')]);
      return {
        papers: papers.map((r) => r.payload).map((p) => {
          const questions = Array.isArray(p.questions) ? p.questions : [];
          const wellFormed = questions.length > 0 && questions.every((q) => validateQuestion(normalizeQuestion(q)).length === 0);
          // media is proven presentable when a session starts (objectiveMedia); listing a paper is not a promise
          return { id: p.id, title: p.title || '(untitled paper)', paper: p, ready: wellFormed, hasMedia: questions.some((q) => mediaRefs(q).length > 0), questions: questions.length };
        }),
        documents: docs.map((r) => r.payload).map((d) => ({ id: d.id, title: d.title || '(untitled document)', document: d, ready: Array.isArray(d.items) && d.items.length > 0, items: d.items?.length ?? 0 })),
        texts: texts.map((r) => r.payload).map((t) => ({ id: t.id, title: t.title || '(untitled text)', text: t, ready: typeof t.text === 'string' && t.text.length > 0, characters: t.text?.length ?? 0 })),
      };
    },

    /**
     * Prove that every image / audio the questions of this session need can be shown or played. Fail closed: with no
     * presenter, or for any object that cannot be loaded, decoded or matched to its declared kind, the object is a
     * problem and the session must not start (the media metadata is never changed).
     * @returns {Promise<{presentable: Set<string>, problems: {questionId: string|null, kind: string, id: string|null, reason: string}[]}>}
     */
    async objectiveMedia(paper, questionIds = null) {
      const wanted = (paper?.questions ?? []).filter((q) => !questionIds || questionIds.includes(q.id));
      const refs = wanted.flatMap((q) => mediaRefs(q).map((r) => ({ ...r, questionId: q.id })));
      if (!refs.length) return { presentable: new Set(), problems: [] };
      if (!media) return { presentable: new Set(), problems: refs.map((r) => ({ ...r, reason: 'no media presenter is available' })) };
      const usable = refs.filter((r) => r.id !== null);
      const proof = usable.length ? await media.prove(usable.map(({ kind, id }) => ({ kind, id }))) : { presentable: new Set(), problems: [] };
      const problems = [
        ...refs.filter((r) => r.id === null).map((r) => ({ ...r, reason: 'the question references media without an id' })),
        ...proof.problems.map((p) => ({ ...p, questionId: refs.find((r) => r.id === p.id)?.questionId ?? null })),
      ];
      return { presentable: new Set(proof.presentable), problems };
    },

    startObjective({ paper, intent, feedbackTiming, questionIds, provenance, presentableMedia, selection, scheduleRef }) {
      const engine = ObjectiveSession.start({ paper, questionIds, sessionId: ids(), evidenceId: ids(), startedAt: now(), intent, feedbackTiming, provenance, presentableMedia });
      return { domain: 'objective', engine, launch: launchOf(selection, scheduleRef) };
    },

    startTranslation({ document, intent = 'practice', selection, scheduleRef }) {
      return { domain: 'translation', engine: TranslationSession.start({ document, sessionId: ids(), evidenceId: ids(), startedAt: now(), intent, ids }), launch: launchOf(selection, scheduleRef) };
    },

    startTyping({ text, intent, provenance, selection, scheduleRef }) {
      const policy = { feedbackTiming: intent === 'test' ? 'on-completion' : 'live', corrections: 'allowed' };
      const engine = new TypingSession({ evidenceId: ids(), sessionId: ids(), startedAt: now(), material: { id: text.id, title: text.title, text: text.text }, intent, policy, provenance });
      return { domain: 'typing', engine, launch: launchOf(selection, scheduleRef) };
    },

    /** Persist the very first recovery state so a crash right after start is resumable. */
    async begin(started) {
      await servicesFor(started).save(started.engine.snapshot());
      return started;
    },

    async resumable() {
      return (await recovery.resumable()).filter((s) => ['objective', 'translation', 'typing'].includes(s?.domain));
    },

    /** Resume a saved session. An Objective session that needs media proves it again (fail closed). */
    async restore(state) {
      const launch = state.launch ?? {};
      if (state.domain === 'objective') {
        const proof = await rt.objectiveMedia({ questions: state.questions }, null);
        if (proof.problems.length) throw new Error(`this session needs media that cannot be shown: ${proof.problems.map((p) => p.reason).join('; ')}`);
        return { domain: 'objective', engine: ObjectiveSession.restore(state, { presentableMedia: proof.presentable }), launch };
      }
      if (state.domain === 'translation') return { domain: 'translation', engine: TranslationSession.restore(state, ids), launch };
      if (state.domain === 'typing') return { domain: 'typing', engine: restoreTypingSession(state), launch };
      throw new Error(`unknown session domain ${JSON.stringify(state.domain)}`);
    },

    discard: (sessionId) => recovery.clear(sessionId),
  };
  return rt;
}
