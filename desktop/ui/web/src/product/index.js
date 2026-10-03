// The product services: ONE composition root over the Store Port for every view. There is exactly one ScheduleStore (the
// only writer of Scheduling Context) and one Focused Practice runtime (the only door to Evidence); views get these, never
// the port's write side directly (a static test pins that).
import { ScheduleStore } from '../orchestration/schedule-store.js';
import { loadSnapshot } from '../orchestration/readers.js';
import { systemClock } from '../orchestration/dates.js';
import { createPracticeRuntime } from '../practice/runtime.js';
import { createLibrary } from './library.js';
import { createReviews } from './reviews.js';
import { createExchange } from './exchange.js';
import { createLearning } from './learning.js';
import { buildHistory, entryDetail, filterHistory, lineageOf } from './history.js';

/**
 * @param {object} args
 * @param {object} args.port the Store Port
 * @param {{today(): string}} [args.clock]
 * @param {() => string} [args.now]
 * @param {object|null} [args.media] the media presenter (DOM); without it media papers stay fail-closed
 */
export async function createProduct({ port, clock = systemClock(), now = () => new Date().toISOString(), media = null }) {
  const store = await ScheduleStore.open(port, { clock });
  const library = await createLibrary({ port, now });
  const runtime = await createPracticeRuntime(port, { store, now, media });
  const learning = createLearning({ port, store, clock, runtime, library });
  const reviews = await createReviews({ port, now, library });
  const exchange = createExchange({ port, now, library });

  return {
    port, clock, now, media, store, library, runtime, learning, reviews, exchange,
    /** Evidence History: every recorded attempt (read-only). */
    history: {
      async load() {
        const snapshot = await loadSnapshot(port);
        return { snapshot, ...buildHistory(snapshot) };
      },
      filter: filterHistory,
      detail: (entry, loaded) => entryDetail(entry, loaded.snapshot, loaded.reviews),
      lineage: (entry, loaded) => lineageOf(entry, loaded.snapshot),
    },
    /** Counts for the chrome (sidebar badges and domain list). */
    async chrome() {
      const [today, list] = await Promise.all([learning.today('en'), library.list()]);
      return {
        due: today.facts.due + today.facts.overdue,
        awaitingDecision: today.facts.awaitingDecision,
        counts: { objective: list.papers.length, translation: list.documents.length, typing: list.texts.length },
      };
    },
  };
}
