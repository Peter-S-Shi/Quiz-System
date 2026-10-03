// The single door from the product views into Focused Practice. A view never mounts a session itself: it asks the entry to
// open an already-started session, or to start one (Selection x Intent x Domain), and the entry wires the per-session
// services (recovery state, finalization with its Selection / schedule link, media) and the retry path. Focused Practice
// stays ONE shared surface (not a mode); when it closes the app returns to where the learner came from.
import { mountPractice } from '../practice/surface.js';
import { buildRetryMaterial } from '../translation/session.js';
import { t } from '../i18n.js';

export function createPracticeEntry({ app }) {
  const { product } = app;

  /** Mount a started (or restored) session in the main region. */
  function open(started, { returnTo } = {}) {
    const services = {
      ...product.runtime.servicesFor(started),
      media: product.media,
      startRetry: (kind, args) => retry(kind, args, { returnTo }),
    };
    return mountPractice({
      root: app.main, domain: started.domain, engine: started.engine, services,
      onClose: (outcome) => { if (outcome !== 'retry') app.afterPractice(outcome, returnTo); },
    });
  }

  /** Start a retry (Objective wrong questions, Translation marked sentences, Typing passage) as a NEW session with lineage. */
  async function retry(kind, args, { returnTo } = {}) {
    try {
      let started;
      if (kind === 'objective') {
        started = await product.learning.start({
          domain: 'objective', materialId: args.paperId, intent: args.intent, feedbackTiming: args.feedbackTiming, questionIds: args.questionIds,
          provenance: { purpose: 'retry', sourceResponseId: args.sourceResponseId, sourceMaterialId: args.paperId },
        });
      } else if (kind === 'translation') {
        started = await product.runtime.begin(product.runtime.startTranslation({ document: args.document, selection: { source: 'manual' } }));
      } else {
        const stored = (await product.library.get('text', args.textId))?.payload;
        const text = stored ?? args.text;
        if (!text) throw new Error(t('practice.retryGone'));
        started = await product.runtime.begin(product.runtime.startTyping({
          text, intent: args.intent, selection: { source: 'manual' }, provenance: { purpose: 'retry', sourceAttemptId: args.sourceAttemptId, sourceMaterialId: args.textId },
        }));
      }
      open(started, { returnTo });
    } catch (e) {
      app.afterPractice('retry-failed', returnTo, String(e?.message ?? e).replace(/^[A-Z_]+: /, ''));
    }
  }

  /** Retry from a RECORDED response (History): lineage comes from the recorded provenance only. */
  async function retryFromRecord(entry, payload, { returnTo, itemIds } = {}) {
    if (entry.domain === 'objective') {
      const wrong = (payload.responses ?? []).filter((r) => r.result?.correct === false).map((r) => r.itemId);
      if (!wrong.length) return;
      await retry('objective', { questionIds: wrong, sourceResponseId: payload.id, paperId: payload.material.id, intent: payload.extensions?.['quiz-studio.v2.session']?.intent ?? 'practice', feedbackTiming: payload.extensions?.['quiz-studio.v2.session']?.feedbackTiming ?? 'instant' }, { returnTo });
    } else if (entry.domain === 'translation') {
      const material = buildRetryMaterial({ response: payload, itemIds, createdAt: product.now(), ids: app.ids });
      await retry('translation', { document: material }, { returnTo });
    } else {
      await retry('typing', { sourceAttemptId: payload.id, textId: payload.material.id, text: { id: payload.material.id, title: payload.material.title, text: payload.material.snapshot.text }, intent: payload.intent }, { returnTo });
    }
  }

  return { open, retry, retryFromRecord };
}
