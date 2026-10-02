// The engine planner (ADR 0003 section 11). Deterministic, versioned, pure. It reads NATIVE V2 evidence only (records
// without a `migration_origin`): migration never mints debt (M-1). It proposes Practice, `once` revisit dates on a fixed
// interval ladder measured from the PLANNING date - a provisional, versioned, lightweight heuristic (algorithmVersion
// v1), not a memory model and not claimed to be scientifically optimal. No FSRS, no stored mastery or state.

import { addDays } from './dates.js';
import { ALGORITHM_VERSION } from './recommend.js';
import { isNative, materialKey, recordTime, domainOfMaterialType, ACTIONABLE_JUDGMENTS } from './readers.js';

export const LADDER_DAYS = [1, 3, 7, 14, 30];

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function nativeSessions(snapshot) {
  const out = [];
  for (const r of snapshot.responses) {
    const m = r.payload.material;
    if (!m || !domainOfMaterialType(m.type) || !isNative(snapshot, 'learner_response', r.id)) continue;
    out.push({ id: r.id, material: { type: m.type, id: m.id }, time: recordTime(r.payload), payload: r.payload });
  }
  return out;
}

/** Does a session carry a recorded difficulty fact? (incorrect result, learner flag, actionable teacher review.) */
export function sessionDifficulty(snapshot, session) {
  const reasons = new Set();
  const p = session.payload;
  if (session.material.type === 'quiz-paper') {
    for (const it of Array.isArray(p.responses) ? p.responses : []) if (it?.result?.correct === false) reasons.add('OBJECTIVE_INCORRECT_LATEST');
  } else {
    for (const f of [...(p.learnerAnnotations ?? []), ...(p.learnerItemMarks ?? [])]) {
      if (f?.kind === 'unknown') reasons.add('LEARNER_UNKNOWN');
      if (f?.kind === 'uncertain') reasons.add('LEARNER_UNCERTAIN');
      if (f?.kind === 'should_know') reasons.add('LEARNER_SHOULD_KNOW');
    }
  }
  const basis = [{ collection: 'learner_response', id: session.id }];
  for (const rv of snapshot.reviews) {
    if (rv.payload.responseId !== session.id || !isNative(snapshot, 'teacher_review', rv.id)) continue;
    const actionable = (rv.payload.itemReviews ?? []).some((i) => ACTIONABLE_JUDGMENTS.includes(i?.judgment));
    const remediation = Array.isArray(rv.payload.remediationRecommendations) && rv.payload.remediationRecommendations.length > 0;
    if (actionable) reasons.add('TEACHER_ACTIONABLE_REVIEW');
    if (remediation) reasons.add('REMEDIATION_UNRESOLVED');
    if (actionable || remediation) basis.push({ collection: 'teacher_review', id: rv.id });
  }
  return { difficult: reasons.size > 0, reasons: [...reasons].sort(), basis: basis.sort((a, b) => cmp(`${a.collection}|${a.id}`, `${b.collection}|${b.id}`)) };
}

/**
 * Proposals for the whole snapshot. `today` is the planning date. Each proposal is
 * `{ slot, date, reasons, basis, algorithmVersion }` and is applied by the ScheduleStore (never written directly).
 */
export function plan(snapshot, today) {
  const sessions = nativeSessions(snapshot);
  const byMaterial = new Map();
  for (const s of sessions) {
    const k = materialKey(s.material);
    if (!byMaterial.has(k)) byMaterial.set(k, []);
    byMaterial.get(k).push(s);
  }
  // fulfilling sessions of engine-owned revisits, per slot
  const engineFulfilments = new Map(); // sessionId -> { slotKey, fulfilledOn, scheduleId }
  for (const sc of snapshot.schedules) {
    if (sc.payload.owner !== 'engine') continue;
    for (const f of sc.fulfillments) engineFulfilments.set(f.session.id, { scheduleId: sc.payload.id, fulfilledOn: f.fulfilledOn, material: sc.payload.slot.material });
  }
  const proposals = [];
  for (const list of [...byMaterial.entries()].sort((a, b) => cmp(a[0], b[0])).map((e) => e[1])) {
    if (list.some((s) => s.time === null)) continue; // ordering unknown: no proposal (ADR 0003 section 12.2 rule 3)
    const sorted = [...list].sort((a, b) => a.time - b.time || cmp(a.id, b.id));
    const latest = sorted[sorted.length - 1];
    const d = sessionDifficulty(snapshot, latest);
    const slot = { domain: domainOfMaterialType(latest.material.type), material: latest.material, intent: 'practice' };
    if (d.difficult) {
      proposals.push({ slot, date: addDays(today, LADDER_DAYS[0]), reasons: d.reasons.map((code) => ({ code, params: {} })), basis: d.basis, algorithmVersion: ALGORITHM_VERSION });
      continue;
    }
    if (!engineFulfilments.has(latest.id)) continue; // a clean session that was not a revisit proposes nothing
    // consecutive clean engine-revisit fulfilments of this material, counted back from the latest session
    let c = 0;
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const s = sorted[i];
      if (!engineFulfilments.has(s.id) || sessionDifficulty(snapshot, s).difficult) break;
      c += 1;
    }
    if (c < LADDER_DAYS.length) {
      proposals.push({ slot, date: addDays(today, LADDER_DAYS[c]), reasons: [{ code: 'SUCCESSFUL_RECOVERY', params: {} }], basis: [{ collection: 'learner_response', id: latest.id }], algorithmVersion: ALGORITHM_VERSION });
    }
  }
  return proposals;
}

