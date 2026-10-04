// Product Hardening, lane 6 (bounded resources): the product's read paths over a realistically LARGE history stay
// correct and inside a generous absolute ceiling. Ordinary supported workload = a few years of daily practice; the
// default is 400 completed Objective sessions (QS_PH_RECORDS raises it for a manual stress run).
//
// Measured on the debug store behind the stdio bridge: about 0.4-0.8 ms per session record, linear (100 -> 800 records
// doubles the cost per doubling). A shape assertion (growth ratio) was tried and REMOVED: above ~1 MB per read the
// test bridge's line reader itself roughly doubles the per-byte cost, so a ratio measures the harness, not the product.
// The Rust read is a single linear SELECT; this test therefore pins correctness at scale plus a ceiling that catches a
// gross blow-up, and does not claim to prove asymptotics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary } from '../../web/src/product/library.js';
import { createLearning } from '../../web/src/product/learning.js';
import { createPracticeRuntime } from '../../web/src/practice/runtime.js';
import { correctAnswerForView, paperWithExplanations } from '../objective-fixtures.mjs';
import { withEnv } from './env.mjs';

const N = Number(process.env.QS_PH_RECORDS || 400);
let tick = 0;
const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + (tick++) * 60_000).toISOString();

async function play(runtime, paper) {
  const started = await runtime.begin(runtime.startObjective({ paper, intent: 'practice', feedbackTiming: 'instant' }));
  for (let i = 0; i < started.engine.view().total; i += 1) {
    started.engine.go(i);
    started.engine.answer(correctAnswerForView(started.engine.view(), paper));
    if (started.engine.view().canSubmitItem) started.engine.submitItem();
  }
  await runtime.services.commit({ payload: await started.engine.finalize({ now: now() }) });
}

/** Best of three: the minimum is the cost of the work itself, not of a garbage-collection pause. */
async function ms(fn) {
  let best = Infinity;
  for (let k = 0; k < 3; k += 1) {
    const t = performance.now();
    await fn();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

test(`read paths stay correct and bounded over ${N} completed sessions`, withEnv(async (e) => {
  const library = await createLibrary({ port: e.port, now });
  const runtime = await createPracticeRuntime(e.port, { store: e.store, now });
  const learning = createLearning({ port: e.port, store: e.store, clock: e.clock, runtime, library });
  const paper = { ...paperWithExplanations({ id: 'paper-scale' }), title: 'Scale paper' };
  await library.savePaper(paper);

  const half = Math.floor(N / 2);
  for (let i = 0; i < half; i += 1) await play(runtime, paper);
  const small = {
    states: await ms(() => learning.materialStates()),
    today: await ms(() => learning.today('en')),
    history: await ms(() => e.port.read('learner_response')),
  };
  for (let i = half; i < N; i += 1) await play(runtime, paper);
  const large = {
    states: await ms(() => learning.materialStates()),
    today: await ms(() => learning.today('en')),
    history: await ms(() => e.port.read('learner_response')),
  };
  console.log(`# ${half} -> ${N} sessions (ms):`, JSON.stringify({ small, large }));

  const states = await learning.materialStates();
  assert.equal([...states.values()][0].attempts, N);
  for (const k of Object.keys(large)) {
    assert.ok(large[k] < 8000, `${k} over ${N} sessions took ${large[k].toFixed(0)} ms (ceiling 8000)`);
  }
}));
