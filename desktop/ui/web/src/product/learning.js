// Learning Orchestration for the product: Today and Calendar read the ACCEPTED projections (todayView / calendarView over
// the ScheduleStore models) and the deterministic Recommender, and start sessions through the Focused Practice runtime
// with the right provenance. This module decides nothing new: Due / Overdue are derived by the projection, schedule
// changes go through ScheduleStore (the only writer of Scheduling Context), a recommendation is a suggestion with a readable
// reason, and the learner chooses (Scope Freeze Rev.1 sections 6-8).
import { deriveMaterialStates } from './material-state.js';
import { addDays, calendarView, explain, loadSnapshot, recommend, selectionProvenance, todayView } from '../orchestration/index.js';

export class StartError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'StartError';
    this.code = code;
    this.detail = detail;
  }
}

const TYPE_OF_DOMAIN = { objective: 'quiz-paper', translation: 'translation-document', typing: 'typing-text' };
const DOMAIN_OF_TYPE = { 'quiz-paper': 'objective', 'translation-document': 'translation', 'typing-text': 'typing' };

/** First day (Monday-first grid) and last day of the 6-week window that shows the month containing `date`. */
export function monthWindow(date) {
  const first = `${date.slice(0, 7)}-01`;
  const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const from = addDays(first, -dow);
  return { month: first.slice(0, 7), first, from, to: addDays(from, 41) };
}

/**
 * @param {object} deps
 * @param {object} deps.port
 * @param {import('../orchestration/schedule-store.js').ScheduleStore} deps.store the shared writer of Scheduling Context
 * @param {{today(): string}} deps.clock
 * @param {object} deps.runtime the Focused Practice runtime
 * @param {object} deps.library
 */
export function createLearning({ port, store, clock, runtime, library }) {
  /** Content titles by `type|id`, so entries read as "Capital cities", not as ids. */
  async function titles() {
    const l = await library.list();
    const map = new Map();
    for (const p of l.papers) map.set(`quiz-paper|${p.id}`, p.title);
    for (const d of l.documents) map.set(`translation-document|${d.id}`, d.title);
    for (const t of l.texts) map.set(`typing-text|${t.id}`, t.title);
    return map;
  }
  const titleOf = (map, material) => map.get(`${material.type}|${material.id}`) ?? null;

  const decorateEntry = (map, e) => ({ ...e, title: titleOf(map, e.slot.material), missing: titleOf(map, e.slot.material) === null });

  const learning = {
    domainOfType: (type) => DOMAIN_OF_TYPE[type] ?? null,
    typeOfDomain: (domain) => TYPE_OF_DOMAIN[domain],

    /** Factual learning state per material (not started / in progress / practiced), derived from Evidence and recovery state. */
    async materialStates() {
      const [responses, typingAttempts, resumable] = await Promise.all([port.read('learner_response'), port.read('typing_attempt'), runtime.resumable()]);
      return deriveMaterialStates({ responses, typingAttempts, resumable });
    },

    /** One planning sweep (idempotent): engine schedules for what the evidence says, suggestions where the learner owns the date. */
    sweep: () => store.sweep(),

    /** The few numbers the chrome shows (due or overdue, dates awaiting a decision) without computing recommendations. */
    async chromeCounts() {
      const today = clock.today();
      const [models, pending] = await Promise.all([store.models(), store.pendingSuggestions()]);
      const view = todayView(models, today);
      return { due: view.entries.length, awaitingDecision: pending.length };
    },

    /**
     * Everything Today shows, from one consistent read. Nothing here writes. `recommendations` are suggestions the
     * learner may ignore; each carries its readable reasons in the requested locale.
     */
    async today(locale = 'en') {
      const today = clock.today();
      const [models, snapshot, map, resumable, pending] = await Promise.all([store.models(), loadSnapshot(port), titles(), runtime.resumable(), store.pendingSuggestions()]);
      const available = await store.materialAvailable();
      const view = todayView(models, today, { materialAvailable: available });
      const entries = view.entries.map((e) => decorateEntry(map, e));
      const recs = recommend(snapshot, today).map((r) => ({
        ...r,
        title: titleOf(map, r.target.material),
        domain: r.target.domain,
        reasonTexts: r.reasons.map((x) => ({ code: x.code, text: explain(x, locale) })),
        contextTexts: (r.context ?? []).map((x) => ({ code: x.code, text: explain(x, locale) })),
      }));
      return {
        today,
        facts: { due: entries.filter((e) => e.state === 'due').length, overdue: entries.filter((e) => e.state === 'overdue').length, awaitingDecision: pending.length },
        entries,
        overdueTruncated: view.overdueTruncated,
        recommendations: recs,
        resumable: resumable.map((s) => ({ domain: s.domain, id: s.session?.id, title: s.material?.title ?? '', startedAt: s.session?.startedAt ?? '', state: s })),
      };
    },

    /** The month grid plus the dates awaiting the learner's decision. */
    async calendar(date) {
      const today = clock.today();
      const win = monthWindow(date ?? today);
      const [models, map, suggestions] = await Promise.all([store.models(), titles(), store.pendingSuggestions()]);
      const available = await store.materialAvailable();
      const view = calendarView(models, { from: win.from, to: win.to }, today, { materialAvailable: available });
      const days = new Map(view.days.map((d) => [d.date, d.entries.map((e) => decorateEntry(map, e))]));
      const owner = new Map(models.map((m) => [m.schedule.id, m.schedule]));
      return {
        today, ...win, days, overdueTruncated: view.overdueTruncated,
        schedules: new Map(models.map((m) => [m.schedule.id, { id: m.schedule.id, owner: m.schedule.owner, cadence: m.schedule.cadence, slot: m.schedule.slot, hasPendingSuggestion: m.hasPendingSuggestion }])),
        suggestions: suggestions.map((s) => ({
          id: s.id, scheduleId: s.payload.scheduleId, currentDate: s.payload.currentDate, suggestedDate: s.payload.suggestedDate, targetOriginalDate: s.payload.targetOriginalDate,
          reasons: s.payload.reasons.map((r) => ({ code: r.code, text: explain(r, 'en'), textZh: explain(r, 'zh-CN') })),
          title: titleOf(map, owner.get(s.payload.scheduleId)?.slot.material ?? { type: '', id: '' }), slot: owner.get(s.payload.scheduleId)?.slot ?? null,
        })),
      };
    },

    // ------------------------------------------------------------------------------------ schedule changes (the learner's)
    createSchedule: ({ domain, materialId, intent, date, cadence }) => store.create({ slot: { domain, material: { type: TYPE_OF_DOMAIN[domain], id: materialId }, intent }, date, cadence }),
    moveOnce: (scheduleId, date) => store.moveOnce(scheduleId, date),
    moveOccurrence: (scheduleId, originalDate, date) => store.moveOccurrence(scheduleId, originalDate, date),
    moveFuture: (scheduleId, originalDate, date) => store.moveFuture(scheduleId, originalDate, date),
    cancel: (scheduleId, originalDate) => store.cancel(scheduleId, originalDate ? { originalDate } : {}),
    decide: (suggestionId, decision) => store.decideSuggestion(suggestionId, decision),
    scheduleOf: (scheduleId) => store.load(scheduleId),

    // ------------------------------------------------------------------------------------------------ starting sessions
    /** The material (full record) of a domain, or throws StartError(MATERIAL_GONE). */
    async material(domain, id) {
      const kind = { objective: 'paper', translation: 'document', typing: 'text' }[domain];
      const row = await library.get(kind, id);
      if (!row) throw new StartError('MATERIAL_GONE', 'this material no longer exists');
      return row.payload;
    },

    /**
     * Start a session. `selection` is how the learner chose it ('recommended' with the reasons they were shown, or
     * 'manual'); `scheduleRef` links a due occurrence. Objective media is proven presentable first (fail closed).
     * @returns {Promise<object>} `{ domain, engine, launch }`, with the first recovery state already saved
     */
    async start({ domain, materialId, intent = 'practice', feedbackTiming = 'instant', source = 'manual', recommendation = null, scheduleRef = null, questionIds = null, provenance = null, shuffleQuestions = false }) {
      const selection = source === 'recommended' && recommendation ? selectionProvenance(recommendation) : { source: 'manual' };
      const material = await learning.material(domain, materialId);
      let started;
      if (domain === 'objective') {
        if (!material.questions?.length) throw new StartError('NOT_READY', 'this paper has no questions');
        const proof = await runtime.objectiveMedia(material, questionIds);
        if (proof.problems.length) throw new StartError('MEDIA_UNAVAILABLE', 'the image or audio of this paper cannot be shown', { problems: proof.problems });
        started = runtime.startObjective({ paper: material, intent, feedbackTiming, questionIds: questionIds ?? undefined, presentableMedia: proof.presentable, shuffleQuestions: shuffleQuestions === true, selection, scheduleRef: scheduleRef ?? undefined, ...(provenance ? { provenance } : {}) });
      } else if (domain === 'translation') {
        if (!material.items?.length) throw new StartError('NOT_READY', 'this document has no sentences');
        started = runtime.startTranslation({ document: material, intent, selection, scheduleRef: scheduleRef ?? undefined });
      } else {
        if (!material.text?.trim()) throw new StartError('NOT_READY', 'this text is empty');
        started = runtime.startTyping({ text: material, intent, selection, scheduleRef: scheduleRef ?? undefined, ...(provenance ? { provenance } : {}) });
      }
      return runtime.begin(started);
    },

    /** The recommendation of a domain the composer would start (the first of its group order), or null. */
    topRecommendation(recs, domain) {
      return recs.find((r) => r.domain === domain && !r.unavailable) ?? null;
    },
  };
  return learning;
}
