// ScheduleStore: the ONLY mutator of Scheduling Context (ADR 0003 section 4). A deep module with a small interface
// (create, moveOnce, moveOccurrence, moveFuture, cancel, decideSuggestion, applyPlan, completeSession) hiding
// validation, segmentation, revision preconditions and constraint handling. Every operation is exactly ONE Store Port
// Unit of Work (one transaction, `tag` names its fault checkpoint) and carries revision preconditions on every row it
// read to decide, so a stale decision aborts with no change and the learner wins every race (L-1, L-3).

import { addDays, isDate } from './dates.js';
import {
  expandOccurrences,
  isExhausted,
  isUnresolved,
  occurrenceAt,
  previousOriginalBefore,
  segmentOf,
  suggestionTarget,
} from './occurrences.js';
import { COLLECTIONS, assertValid, checkSlot, occurrenceId } from './schema.js';
import { evidenceIdsForMaterial, loadSnapshot, materialAvailability } from './readers.js';
import { plan } from './planner.js';
import { assertSlotMatches, validateSessionEvidenceOps } from './session-finalization.js';
import { putOp, deleteOp } from '../projection.js';

export class ScheduleError extends Error {
  constructor(code, message, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'ScheduleError';
    this.code = code;
    this.detail = detail;
  }
}

const C = COLLECTIONS;
const slotQuery = (slot) => [
  { column: 'domain', op: 'eq', value: slot.domain },
  { column: 'material_type', op: 'eq', value: slot.material.type },
  { column: 'material_id', op: 'eq', value: slot.material.id },
  { column: 'intent', op: 'eq', value: slot.intent },
];
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const refKey = (r) => `${r.collection}|${r.id}`;

/** Is every id of `inner` contained in `outer`? */
export const basisCovers = (outer, inner) => {
  const set = new Set((outer ?? []).map(refKey));
  return (inner ?? []).every((r) => set.has(refKey(r)));
};

const modelOf = (l) => ({ schedule: l.payload, exceptions: l.exceptions.map((e) => e.payload), fulfillments: l.fulfillments.map((f) => f.payload) });

/** Decide what the engine does with one proposal (ADR 0003 section 11.4). Pure; `state = { active, tombstone }`. */
export function decideProposal(state, proposal, today) {
  const { active, tombstone } = state;
  if (!active) {
    if (tombstone?.cancellation?.by === 'user' && basisCovers(tombstone.cancellation.considered, proposal.basis)) return { action: 'none', why: 'cancelled-basis-covered' };
    return { action: 'create-engine' };
  }
  const S = active.payload;
  const model = modelOf(active);
  const target = suggestionTarget(model, today);
  const overdue = S.owner === 'engine' && target !== null && target.displayDate < today;
  if (S.owner === 'engine' && !overdue) {
    if (basisCovers(S.engine.basis, proposal.basis)) return { action: 'none', why: 'same-basis' };
    return { action: 'update-engine' };
  }
  if (target === null) return { action: 'none', why: 'no-target' };
  let date = proposal.date;
  if (S.cadence.kind === 'every') {
    const prev = previousOriginalBefore(S, target.originalDate);
    if (prev !== null && date <= prev) date = addDays(prev, 1);
    if (S.cadence.until !== undefined && date > S.cadence.until) return { action: 'none', why: 'beyond-until' };
  }
  // any DIFFERENT date is a conflict that needs the learner's choice; only an equal date is a no-op (no minimum difference)
  if (date === target.displayDate) return { action: 'none', why: 'equal-date' };
  const covered = [
    ...active.suggestions.filter((g) => g.payload.status !== 'pending').flatMap((g) => g.payload.basis),
    ...(S.owner === 'engine' ? S.engine.basis : []),
  ];
  if (basisCovers(covered, proposal.basis)) return { action: 'none', why: 'basis-covered' };
  const pending = active.suggestions.find((g) => g.payload.status === 'pending');
  if (pending) {
    if (pending.payload.scheduleRev !== active.rev) return { action: 'replace-stale-pending', date, target };
    if (basisCovers(pending.payload.basis, proposal.basis)) return { action: 'none', why: 'pending-covers' };
    return { action: 'update-pending', date, target };
  }
  return { action: 'create-suggestion', date, target };
}

export class ScheduleStore {
  #port;
  #specs;
  #clock;
  #newId;
  #evidenceIdsFor;

  constructor(port, specs, { clock, newId, evidenceIdsFor }) {
    this.#port = port;
    this.#specs = specs;
    this.#clock = clock;
    this.#newId = newId;
    this.#evidenceIdsFor = evidenceIdsFor;
  }

  static async open(port, { clock, newId, evidenceIdsFor } = {}) {
    const info = await port.schemaInfo();
    const specs = new Map(info.collections.map((c) => [c.name, c]));
    for (const name of Object.values(C)) if (!specs.has(name)) throw new ScheduleError('SCHEMA', `the store has no '${name}' collection (store schema 3 required)`);
    let n = 0;
    const defaultId = () => `sch-${Date.now().toString(36)}-${(n += 1).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return new ScheduleStore(port, specs, {
      clock,
      newId: newId ?? defaultId,
      evidenceIdsFor: evidenceIdsFor ?? (async (material) => evidenceIdsForMaterial(await loadSnapshot(port), material)),
    });
  }

  // ------------------------------------------------------------------------------------------ plumbing
  #put(collection, payload) {
    assertValid(collection, payload);
    return putOp(this.#specs.get(collection), payload.id, payload);
  }

  async #commit(uow) {
    try {
      return await this.#port.commit(uow);
    } catch (e) {
      if (e?.code === 'REJECT_PRECONDITION') throw new ScheduleError('STALE', 'the data changed since it was read; reload and decide again', { cause: e.message });
      throw e;
    }
  }

  async #read(collection, where = [], extra = {}) {
    return (await this.#port.read(collection, { where, ...extra })).map((r) => ({ id: r.id, rev: r.rev, payload: r.payload }));
  }

  async load(scheduleId) {
    const [s] = await this.#read(C.schedule, [], { id: scheduleId });
    if (!s) return null;
    const by = [{ column: 'schedule_id', op: 'eq', value: scheduleId }];
    const [exceptions, fulfillments, suggestions] = await Promise.all([this.#read(C.exception, by), this.#read(C.fulfillment, by), this.#read(C.suggestion, by)]);
    return { id: s.id, rev: s.rev, payload: s.payload, exceptions, fulfillments, suggestions };
  }

  async activeInSlot(slot) {
    const [s] = await this.#read(C.schedule, [...slotQuery(slot), { column: 'status', op: 'eq', value: 'active' }]);
    return s ? this.load(s.id) : null;
  }

  async #tombstone(slot) {
    const cancelled = await this.#read(C.schedule, [...slotQuery(slot), { column: 'status', op: 'eq', value: 'cancelled' }]);
    cancelled.sort((a, b) => cmp(b.payload.updatedAt, a.payload.updatedAt) || cmp(b.id, a.id));
    return cancelled[0]?.payload ?? null;
  }

  #now() {
    return this.#clock.nowIso();
  }

  #today() {
    return this.#clock.today();
  }

  #pendingOf(l) {
    return l.suggestions.find((g) => g.payload.status === 'pending') ?? null;
  }

  /** Closing the pending suggestion as superseded (same Unit of Work as the change that invalidates it). */
  #supersede(l, pre, ops) {
    const g = this.#pendingOf(l);
    if (!g) return;
    pre.push({ kind: 'rev', collection: C.suggestion, id: g.id, equals: g.rev });
    ops.push(this.#put(C.suggestion, { ...g.payload, status: 'superseded', decidedAt: this.#now() }));
  }

  #requireActive(l, scheduleId) {
    if (!l) throw new ScheduleError('NOT_FOUND', `no schedule ${scheduleId}`);
    if (l.payload.status !== 'active') throw new ScheduleError('NOT_ACTIVE', 'the schedule is not active');
  }

  #futureDate(date, what) {
    if (!isDate(date)) throw new ScheduleError('BAD_DATE', `${what} must be a calendar date (YYYY-MM-DD)`);
    if (date < this.#today()) throw new ScheduleError('DATE_IN_PAST', `${what} must not be in the past`);
  }

  #owned(payload) {
    const { engine, ...rest } = payload; // a learner change makes the schedule user-owned in place
    return { ...rest, owner: 'user', updatedAt: this.#now() };
  }

  // ----------------------------------------------------------------------------------------------- O-1 create
  /** Only for a slot with no active schedule; an occupied slot is refused and nothing is touched (S-1, amendment A-1). */
  async create({ slot, date, cadence = { kind: 'once' } }) {
    const errs = [];
    checkSlot(slot, 'slot', errs);
    if (errs.length) throw new ScheduleError('BAD_SLOT', errs.join('; '));
    this.#futureDate(date, 'the date');
    const existing = await this.activeInSlot(slot);
    if (existing) throw new ScheduleError('SLOT_OCCUPIED', 'this slot already has an active schedule; move, re-anchor or cancel it instead', { existing });
    const id = this.#newId();
    const now = this.#now();
    const payload = { schemaVersion: 1, id, slot, owner: 'user', status: 'active', cadence, segments: [{ anchor: date }], createdAt: now, updatedAt: now };
    try {
      const r = await this.#commit({ tag: 'create', preconditions: [{ kind: 'absent', collection: C.schedule, id }], ops: [this.#put(C.schedule, payload)] });
      return { id, rev: r.writes[0].rev };
    } catch (e) {
      if (e?.code === 'REJECT_CONSTRAINT') {
        const now2 = await this.activeInSlot(slot);
        if (now2) throw new ScheduleError('SLOT_OCCUPIED', 'this slot was just taken; reload', { existing: now2 });
      }
      throw e;
    }
  }

  // --------------------------------------------------------------------------------------------- O-2 move once
  async moveOnce(scheduleId, newDate) {
    const l = await this.load(scheduleId);
    this.#requireActive(l, scheduleId);
    if (l.payload.cadence.kind !== 'once') throw new ScheduleError('NOT_ONCE', 'use moveOccurrence or moveFuture for a recurring schedule');
    this.#futureDate(newDate, 'the new date');
    if (newDate === l.payload.segments[0].anchor) throw new ScheduleError('NO_CHANGE', 'the schedule is already on that date');
    const next = { ...this.#owned(l.payload), segments: [{ anchor: newDate }] };
    const pre = [{ kind: 'rev', collection: C.schedule, id: scheduleId, equals: l.rev }];
    const ops = [this.#put(C.schedule, next)];
    this.#supersede(l, pre, ops);
    return this.#commit({ tag: 'move-once', preconditions: pre, ops });
  }

  // ---------------------------------------------------------------------------------- O-3 move one occurrence
  async moveOccurrence(scheduleId, originalDate, movedTo) {
    const l = await this.load(scheduleId);
    this.#requireActive(l, scheduleId);
    if (l.payload.cadence.kind !== 'every') throw new ScheduleError('NOT_RECURRING', 'a once schedule is moved with moveOnce');
    const model = modelOf(l);
    const today = this.#today();
    const occ = occurrenceAt(model, originalDate, today);
    if (!occ) throw new ScheduleError('NOT_AN_OCCURRENCE', `${originalDate} is not an occurrence of this schedule`);
    if (!isUnresolved(occ.state)) throw new ScheduleError('OCCURRENCE_RESOLVED', `this occurrence is ${occ.state}`);
    const existing = l.exceptions.find((e) => e.payload.originalDate === originalDate);
    const pre = [{ kind: 'rev', collection: C.schedule, id: scheduleId, equals: l.rev }];
    const ops = [];
    if (movedTo === originalDate) {
      // moving an occurrence back to its original date removes its exception (an exception never has movedTo = originalDate)
      if (!existing || existing.payload.kind !== 'moved') throw new ScheduleError('NO_CHANGE', 'the occurrence is already on that date');
      pre.push({ kind: 'rev', collection: C.exception, id: existing.id, equals: existing.rev });
      ops.push(deleteOp(C.exception, existing.id));
    } else {
      this.#futureDate(movedTo, 'the new date');
      const clash = expandOccurrences(model, { from: movedTo, to: movedTo }, today).occurrences.some((o) => o.originalDate !== originalDate && isUnresolved(o.state) && o.displayDate === movedTo);
      if (clash) throw new ScheduleError('DATE_TAKEN', 'another occurrence of this schedule is already shown on that date');
      const ex = { schemaVersion: 1, id: occurrenceId(scheduleId, originalDate), scheduleId, originalDate, kind: 'moved', movedTo };
      pre.push(existing ? { kind: 'rev', collection: C.exception, id: existing.id, equals: existing.rev } : { kind: 'absent', collection: C.exception, id: ex.id });
      ops.push(this.#put(C.exception, ex));
    }
    ops.push(this.#put(C.schedule, this.#owned(l.payload)));
    this.#supersede(l, pre, ops);
    return this.#commit({ tag: 'move-occurrence', preconditions: pre, ops });
  }

  // ------------------------------------------------------------------------------ O-4 move this and future
  /** Plan a re-anchor at occurrence X: the new date becomes the anchor and the future is recalculated from it. */
  #planMoveFuture(l, originalDate, newAnchor) {
    const S = l.payload;
    const model = modelOf(l);
    const today = this.#today();
    const occ = occurrenceAt(model, originalDate, today);
    if (!occ) throw new ScheduleError('NOT_AN_OCCURRENCE', `${originalDate} is not an occurrence of this schedule`);
    if (!isUnresolved(occ.state)) throw new ScheduleError('OCCURRENCE_RESOLVED', `this occurrence is ${occ.state}`);
    this.#futureDate(newAnchor, 'the new anchor');
    const j = segmentOf(S, originalDate);
    if (newAnchor === originalDate && j === S.segments.length - 1) throw new ScheduleError('NO_CHANGE', 'the occurrence is already on that anchor');
    const prev = previousOriginalBefore(S, originalDate);
    if (prev !== null && newAnchor <= prev) throw new ScheduleError('REANCHOR_OVERLAP', 'the new anchor must come after the previous occurrence', { previous: prev });
    if (S.cadence.until !== undefined && newAnchor > S.cadence.until) throw new ScheduleError('BEYOND_UNTIL', 'the new anchor is after the end of the series');
    if (l.fulfillments.some((f) => f.payload.originalDate >= originalDate)) throw new ScheduleError('FUTURE_HAS_FULFILLMENT', 'a later occurrence was already fulfilled; choose an occurrence after it');
    const keep = S.segments.filter((s, i) => i === 0 || s.takesOverAt < originalDate);
    const segments = [...keep, { anchor: newAnchor, takesOverAt: originalDate }];
    const drop = l.exceptions.filter((e) => e.payload.originalDate >= originalDate);
    return { payload: { ...this.#owned(S), segments }, drop };
  }

  async moveFuture(scheduleId, originalDate, newAnchor) {
    const l = await this.load(scheduleId);
    this.#requireActive(l, scheduleId);
    if (l.payload.cadence.kind !== 'every') throw new ScheduleError('NOT_RECURRING', 'a once schedule is moved with moveOnce');
    const { payload, drop } = this.#planMoveFuture(l, originalDate, newAnchor);
    const pre = [{ kind: 'rev', collection: C.schedule, id: scheduleId, equals: l.rev }];
    const ops = [this.#put(C.schedule, payload)];
    for (const e of drop) {
      pre.push({ kind: 'rev', collection: C.exception, id: e.id, equals: e.rev });
      ops.push(deleteOp(C.exception, e.id));
    }
    this.#supersede(l, pre, ops);
    return this.#commit({ tag: 'move-future', preconditions: pre, ops });
  }

  // ------------------------------------------------------------------------------------------------ O-5 cancel
  async cancel(scheduleId, { originalDate } = {}) {
    const l = await this.load(scheduleId);
    this.#requireActive(l, scheduleId);
    const S = l.payload;
    const pre = [{ kind: 'rev', collection: C.schedule, id: scheduleId, equals: l.rev }];
    const ops = [];
    if (originalDate !== undefined && S.cadence.kind === 'every') {
      const model = modelOf(l);
      const today = this.#today();
      const occ = occurrenceAt(model, originalDate, today);
      if (!occ) throw new ScheduleError('NOT_AN_OCCURRENCE', `${originalDate} is not an occurrence of this schedule`);
      if (!isUnresolved(occ.state)) throw new ScheduleError('OCCURRENCE_RESOLVED', `this occurrence is ${occ.state}`);
      const existing = l.exceptions.find((e) => e.payload.originalDate === originalDate);
      const ex = { schemaVersion: 1, id: occurrenceId(scheduleId, originalDate), scheduleId, originalDate, kind: 'cancelled' };
      pre.push(existing ? { kind: 'rev', collection: C.exception, id: existing.id, equals: existing.rev } : { kind: 'absent', collection: C.exception, id: ex.id });
      ops.push(this.#put(C.exception, ex));
      const after = { ...model, exceptions: [...model.exceptions.filter((e) => e.originalDate !== originalDate), ex] };
      const base = this.#owned(S);
      ops.push(this.#put(C.schedule, isExhausted(after, today) ? { ...base, status: 'completed' } : base));
    } else {
      const considered = await this.#evidenceIdsFor(S.slot.material);
      ops.push(this.#put(C.schedule, { ...this.#owned(S), status: 'cancelled', cancellation: { by: 'user', considered } }));
    }
    this.#supersede(l, pre, ops);
    return this.#commit({ tag: 'cancel', preconditions: pre, ops });
  }

  // ------------------------------------------------------------------------------- O-7 / O-8 decide suggestion
  async decideSuggestion(suggestionId, decision) {
    if (decision !== 'accept' && decision !== 'keep') throw new ScheduleError('BAD_DECISION', 'decision must be accept or keep');
    const [g] = await this.#read(C.suggestion, [], { id: suggestionId });
    if (!g) throw new ScheduleError('NOT_FOUND', `no suggestion ${suggestionId}`);
    if (g.payload.status !== 'pending') throw new ScheduleError('STALE_SUGGESTION', `the suggestion is already ${g.payload.status}`);
    const l = await this.load(g.payload.scheduleId);
    // bound to the revision it was computed against: an old suggestion never applies to a changed schedule (L-3)
    if (!l || l.payload.status !== 'active' || l.rev !== g.payload.scheduleRev) {
      throw new ScheduleError('STALE_SUGGESTION', 'the schedule changed after this suggestion was made', { scheduleRev: g.payload.scheduleRev, currentRev: l?.rev ?? null });
    }
    const pre = [
      { kind: 'rev', collection: C.suggestion, id: g.id, equals: g.rev },
      { kind: 'rev', collection: C.schedule, id: l.id, equals: l.rev },
    ];
    const decidedAt = this.#now();
    if (decision === 'keep') {
      return this.#commit({ tag: 'decide-keep', preconditions: pre, ops: [this.#put(C.suggestion, { ...g.payload, status: 'kept', decidedAt })] });
    }
    const ops = [];
    const S = l.payload;
    if (S.cadence.kind === 'once') {
      this.#futureDate(g.payload.suggestedDate, 'the suggested date');
      ops.push(this.#put(C.schedule, { ...this.#owned(S), segments: [{ anchor: g.payload.suggestedDate }] }));
    } else {
      const { payload, drop } = this.#planMoveFuture(l, g.payload.targetOriginalDate, g.payload.suggestedDate);
      ops.push(this.#put(C.schedule, payload));
      for (const e of drop) {
        pre.push({ kind: 'rev', collection: C.exception, id: e.id, equals: e.rev });
        ops.push(deleteOp(C.exception, e.id));
      }
    }
    ops.push(this.#put(C.suggestion, { ...g.payload, status: 'accepted', decidedAt }));
    return this.#commit({ tag: 'decide-accept', preconditions: pre, ops });
  }

  // ------------------------------------------------------------------------------------------ O-6 engine apply
  async #slotState(slot) {
    return { active: await this.activeInSlot(slot), tombstone: await this.#tombstone(slot) };
  }

  /** Apply the planner's proposals one slot at a time; a lost race with the learner drops that slot's write. */
  async applyPlan(proposals) {
    const today = this.#today();
    const results = [];
    for (const p of proposals) {
      const state = await this.#slotState(p.slot);
      const d = decideProposal(state, p, today);
      const slotId = `${p.slot.domain}|${p.slot.material.type}|${p.slot.material.id}|${p.slot.intent}`;
      if (d.action === 'none') {
        results.push({ slot: slotId, action: 'none', why: d.why });
        continue;
      }
      try {
        await this.#applyAction(d, state, p);
        results.push({ slot: slotId, action: d.action, result: 'applied' });
      } catch (e) {
        if (e instanceof ScheduleError && e.code === 'STALE') results.push({ slot: slotId, action: d.action, result: 'lost-race' });
        else if (e?.code === 'REJECT_CONSTRAINT') results.push({ slot: slotId, action: d.action, result: 'lost-race' });
        else throw e;
      }
    }
    return results;
  }

  async #applyAction(d, state, p) {
    const now = this.#now();
    const engine = { reasons: p.reasons, algorithmVersion: p.algorithmVersion, basis: p.basis };
    const l = state.active;
    if (d.action === 'create-engine') {
      const id = this.#newId();
      const payload = { schemaVersion: 1, id, slot: p.slot, owner: 'engine', status: 'active', cadence: { kind: 'once' }, segments: [{ anchor: p.date }], engine, createdAt: now, updatedAt: now };
      return this.#commit({ tag: 'apply-plan', preconditions: [{ kind: 'absent', collection: C.schedule, id }], ops: [this.#put(C.schedule, payload)] });
    }
    const pre = [{ kind: 'rev', collection: C.schedule, id: l.id, equals: l.rev }];
    if (d.action === 'update-engine') {
      const ops = [this.#put(C.schedule, { ...l.payload, segments: [{ anchor: p.date }], engine, updatedAt: now })];
      this.#supersede(l, pre, ops);
      return this.#commit({ tag: 'apply-plan', preconditions: pre, ops });
    }
    const suggestion = (id) => ({
      schemaVersion: 1,
      id,
      scheduleId: l.id,
      scheduleRev: l.rev,
      targetOriginalDate: d.target.originalDate,
      currentDate: d.target.displayDate,
      suggestedDate: d.date,
      reasons: p.reasons,
      algorithmVersion: p.algorithmVersion,
      basis: p.basis,
      status: 'pending',
      createdAt: now,
    });
    const pending = this.#pendingOf(l);
    if (d.action === 'create-suggestion') {
      return this.#commit({ tag: 'apply-plan', preconditions: pre, ops: [this.#put(C.suggestion, suggestion(this.#newId()))] });
    }
    if (d.action === 'update-pending') {
      pre.push({ kind: 'rev', collection: C.suggestion, id: pending.id, equals: pending.rev });
      return this.#commit({ tag: 'apply-plan', preconditions: pre, ops: [this.#put(C.suggestion, { ...suggestion(pending.id), createdAt: pending.payload.createdAt })] });
    }
    // replace-stale-pending: close the stale one first (the pending index admits one), then raise the new one
    pre.push({ kind: 'rev', collection: C.suggestion, id: pending.id, equals: pending.rev });
    return this.#commit({
      tag: 'apply-plan',
      preconditions: pre,
      ops: [this.#put(C.suggestion, { ...pending.payload, status: 'superseded', decidedAt: now }), this.#put(C.suggestion, suggestion(this.#newId()))],
    });
  }

  /**
   * One planning sweep: load the snapshot, retire engine-owned schedules whose material no longer exists (section 9.4;
   * a user-owned one is never retired automatically), plan against today and apply. Idempotent, recomputed from scratch.
   */
  async sweep() {
    const snapshot = await loadSnapshot(this.#port);
    const retired = await this.#retireUnavailable(snapshot);
    const rest = await this.applyPlan(plan(snapshot, this.#today()));
    return [...retired, ...rest];
  }

  async #retireUnavailable(snapshot) {
    const available = materialAvailability(snapshot);
    const out = [];
    for (const s of snapshot.schedules) {
      if (s.payload.status !== 'active' || s.payload.owner !== 'engine' || available(s.payload.slot)) continue;
      const l = await this.load(s.payload.id);
      if (!l || l.payload.status !== 'active' || l.payload.owner !== 'engine') continue;
      const considered = evidenceIdsForMaterial(snapshot, s.payload.slot.material);
      const pre = [{ kind: 'rev', collection: C.schedule, id: l.id, equals: l.rev }];
      const ops = [this.#put(C.schedule, { ...l.payload, status: 'cancelled', cancellation: { by: 'engine', considered }, updatedAt: this.#now() })];
      this.#supersede(l, pre, ops);
      try {
        await this.#commit({ tag: 'apply-plan', preconditions: pre, ops });
        out.push({ slot: s.payload.id, action: 'retire-unavailable', result: 'applied' });
      } catch (e) {
        if (e instanceof ScheduleError && e.code === 'STALE') out.push({ slot: s.payload.id, action: 'retire-unavailable', result: 'lost-race' });
        else throw e;
      }
    }
    return out;
  }

  // ------------------------------------------------------------------------- O-9 session completion / fulfillment
  /**
   * The session-finalization Unit of Work seam: the caller supplies the evidence write (`evidenceOps`, owned by the
   * domain integration milestone); this commits it TOGETHER with the selection provenance and the fulfillment, so
   * evidence and fulfillment can never be separated (S-6).
   * @param {{evidenceOps?: object[], session: {collection: string, id: string}, slot?: object, selection?: object, scheduleRef?: {scheduleId: string, originalDate: string}}} input
   */
  async completeSession({ evidenceOps = [], session, slot, selection, scheduleRef }) {
    // closed write contract: create-only, adapter collections, validated by the domain adapter before any Store Port access
    const creates = validateSessionEvidenceOps(evidenceOps);
    if (creates.length !== 1) throw new ScheduleError('BAD_EVIDENCE_OPS', 'a session finalization writes exactly one evidence record');
    if (!session || session.collection !== creates[0].collection || session.id !== creates[0].id) throw new ScheduleError('BAD_EVIDENCE_OPS', 'session must reference the evidence record being created');
    // the fulfilled slot is derived from the validated evidence; a caller-supplied slot must agree (ADR 0004 section 5.4)
    assertSlotMatches(slot, creates[0].slot);
    slot = creates[0].slot;
    // finalization CREATES evidence: a finalized record is never rewritten (E-1), so every evidence put must be new
    const evidenceNew = [];
    for (const { collection, id } of creates) {
      const [existing] = await this.#read(collection, [], { id });
      if (existing) throw new ScheduleError('SESSION_ALREADY_RECORDED', `${collection}/${id} already exists; finalized evidence is never rewritten`);
      evidenceNew.push({ kind: 'absent', collection, id });
    }
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const today = this.#today();
      const now = this.#now();
      const pre = [...evidenceNew];
      const ops = [...evidenceOps];
      let fulfilled = null;
      if (selection || scheduleRef) {
        const payload = { schemaVersion: 1, id: `${session.collection}:${session.id}`, session, selection: selection ?? { source: 'manual' }, ...(scheduleRef ? { scheduleRef } : {}), createdAt: now };
        ops.push(this.#put(C.selection, payload));
      }
      const target = await this.#fulfillmentTarget({ slot, scheduleRef, today });
      if (target) {
        const { l, occ, via } = target;
        const f = { schemaVersion: 1, id: occurrenceId(l.id, occ.originalDate), scheduleId: l.id, originalDate: occ.originalDate, session, fulfilledOn: today, via };
        const model = { ...modelOf(l), fulfillments: [...modelOf(l).fulfillments, f] };
        const base = { ...l.payload, updatedAt: now };
        const done = l.payload.cadence.kind === 'once' || isExhausted(model, today);
        pre.push({ kind: 'rev', collection: C.schedule, id: l.id, equals: l.rev });
        ops.push(this.#put(C.fulfillment, f), this.#put(C.schedule, done ? { ...base, status: 'completed' } : base));
        this.#supersede(l, pre, ops);
        fulfilled = { scheduleId: l.id, originalDate: occ.originalDate, via };
      }
      try {
        await this.#commit({ tag: 'session-complete', preconditions: pre, ops });
        return { fulfilled };
      } catch (e) {
        if (e instanceof ScheduleError && e.code === 'STALE') {
          lastError = e;
          continue; // the learner changed the schedule meanwhile: recompute against the new revision
        }
        throw e;
      }
    }
    throw lastError;
  }

  async #fulfillmentTarget({ slot, scheduleRef, today }) {
    const key = (s) => `${s.domain}|${s.material.type}|${s.material.id}|${s.intent}`;
    if (scheduleRef) {
      const l = await this.load(scheduleRef.scheduleId);
      if (!l || l.payload.status !== 'active' || key(l.payload.slot) !== key(slot)) return null; // wrong slot / ended: fulfills nothing
      const occ = occurrenceAt(modelOf(l), scheduleRef.originalDate, today);
      if (!occ || !isUnresolved(occ.state)) return null;
      return { l, occ, via: 'linked' };
    }
    const l = await this.activeInSlot(slot);
    if (!l) return null;
    const open = expandOccurrences(modelOf(l), { from: today, to: today }, today).occurrences.filter((o) => isUnresolved(o.state) && o.displayDate <= today);
    return open.length ? { l, occ: open[0], via: 'slot-match' } : null;
  }

  // -------------------------------------------------------------------------------------------------- views
  /** Models of every active schedule (payloads), for the pure projections. */
  async models() {
    const [scheds, exs, fuls, sugs] = await Promise.all([
      this.#read(C.schedule, [{ column: 'status', op: 'eq', value: 'active' }]),
      this.#read(C.exception),
      this.#read(C.fulfillment),
      this.#read(C.suggestion, [{ column: 'status', op: 'eq', value: 'pending' }]),
    ]);
    return scheds.map((s) => ({
      schedule: s.payload,
      exceptions: exs.filter((e) => e.payload.scheduleId === s.id).map((e) => e.payload),
      fulfillments: fuls.filter((f) => f.payload.scheduleId === s.id).map((f) => f.payload),
      hasPendingSuggestion: sugs.some((g) => g.payload.scheduleId === s.id),
    }));
  }

  /** A predicate telling the projections which schedules refer to a material that no longer exists. */
  async materialAvailable() {
    return materialAvailability(await loadSnapshot(this.#port));
  }

  async pendingSuggestions() {
    return this.#read(C.suggestion, [{ column: 'status', op: 'eq', value: 'pending' }]);
  }
}
