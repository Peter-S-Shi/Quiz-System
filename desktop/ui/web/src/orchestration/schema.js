// Closed schemas of the five Scheduling Context records (ADR 0003 sections 7 and 16 CAL-1). A schedule has
// exactly: slot, owner, status, cadence, segments, optional engine / cancellation metadata and operational
// timestamps. There is deliberately no field for time of day, title, note, reminder, duration, budget, deadline,
// goal, exam or any external reference, so out-of-scope content is unrepresentable (Scope section 7.10).

import { isDate } from './dates.js';

export const DOMAINS = ['objective', 'translation', 'typing'];
export const INTENTS = ['practice', 'test'];
export const OWNERS = ['engine', 'user'];
export const STATUSES = ['active', 'cancelled', 'completed'];
export const SUGGESTION_STATUSES = ['pending', 'accepted', 'kept', 'superseded'];
export const SOURCES = ['manual', 'recommended'];

export const COLLECTIONS = {
  schedule: 'schedule',
  exception: 'schedule_exception',
  fulfillment: 'schedule_fulfillment',
  suggestion: 'schedule_suggestion',
  selection: 'session_selection',
};

export class SchemaError extends Error {
  constructor(errors) {
    super(`invalid scheduling record: ${errors.join('; ')}`);
    this.name = 'SchemaError';
    this.errors = errors;
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;

function closed(obj, allowed, where, errs) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errs.push(`${where}: field '${k}' is not part of the closed schema`);
}

const REF = ['collection', 'id'];
function checkRefs(list, where, errs) {
  if (!Array.isArray(list)) return errs.push(`${where} must be an array`);
  list.forEach((r, i) => {
    if (!isObj(r) || !isStr(r.collection) || !isStr(r.id)) errs.push(`${where}[${i}] must be {collection, id}`);
    else closed(r, [...REF, 'itemId'], `${where}[${i}]`, errs);
  });
}

function checkReasons(list, where, errs) {
  if (!Array.isArray(list)) return errs.push(`${where} must be an array`);
  list.forEach((r, i) => {
    if (!isObj(r) || !isStr(r.code)) return errs.push(`${where}[${i}] needs a code`);
    closed(r, ['code', 'params', 'provenance'], `${where}[${i}]`, errs);
  });
}

export function slotKey(slot) {
  return `${slot.domain}|${slot.material.type}|${slot.material.id}|${slot.intent}`;
}

export function checkSlot(slot, where, errs) {
  if (!isObj(slot)) return errs.push(`${where} must be an object`);
  closed(slot, ['domain', 'material', 'intent'], where, errs);
  if (!DOMAINS.includes(slot.domain)) errs.push(`${where}.domain must be one of ${DOMAINS.join('|')}`);
  if (!INTENTS.includes(slot.intent)) errs.push(`${where}.intent must be one of ${INTENTS.join('|')}`);
  if (!isObj(slot.material) || !isStr(slot.material.type) || !isStr(slot.material.id)) errs.push(`${where}.material must be {type, id}`);
  else closed(slot.material, ['type', 'id'], `${where}.material`, errs);
}

export function validateSchedule(p) {
  const errs = [];
  if (!isObj(p)) return ['schedule must be an object'];
  closed(p, ['schemaVersion', 'id', 'slot', 'owner', 'status', 'cadence', 'segments', 'engine', 'cancellation', 'createdAt', 'updatedAt'], 'schedule', errs);
  if (p.schemaVersion !== 1) errs.push('schemaVersion must be 1');
  if (!isStr(p.id)) errs.push('id must be a non-empty string');
  checkSlot(p.slot, 'slot', errs);
  if (!OWNERS.includes(p.owner)) errs.push('owner must be engine|user');
  if (!STATUSES.includes(p.status)) errs.push('status must be active|cancelled|completed');
  const c = p.cadence;
  if (!isObj(c)) errs.push('cadence must be an object');
  else if (c.kind === 'once') closed(c, ['kind'], 'cadence', errs);
  else if (c.kind === 'every') {
    closed(c, ['kind', 'unit', 'interval', 'until'], 'cadence', errs);
    if (c.unit !== 'day' && c.unit !== 'week') errs.push('cadence.unit must be day|week');
    const max = c.unit === 'week' ? 52 : 365;
    if (!Number.isInteger(c.interval) || c.interval < 1 || c.interval > max) errs.push(`cadence.interval must be an integer 1..${max}`);
    if (c.until !== undefined && !isDate(c.until)) errs.push('cadence.until must be a calendar date');
  } else errs.push('cadence.kind must be once|every');
  if (!Array.isArray(p.segments) || p.segments.length === 0) errs.push('segments must be a non-empty array');
  else {
    if (c?.kind === 'once' && p.segments.length !== 1) errs.push('a once schedule has exactly one segment');
    p.segments.forEach((s, i) => {
      if (!isObj(s) || !isDate(s.anchor)) return errs.push(`segments[${i}].anchor must be a calendar date`);
      closed(s, ['anchor', 'takesOverAt'], `segments[${i}]`, errs);
      if (i === 0 && s.takesOverAt !== undefined) errs.push('the first segment has no takesOverAt');
      if (i > 0) {
        if (!isDate(s.takesOverAt)) errs.push(`segments[${i}].takesOverAt must be a calendar date`);
        else if (i > 1 && !(s.takesOverAt > p.segments[i - 1].takesOverAt)) errs.push('takesOverAt must strictly increase');
      }
    });
    if (c?.kind === 'every' && c.until !== undefined && isDate(c.until) && isDate(p.segments[0]?.anchor) && c.until < p.segments[0].anchor) {
      errs.push('cadence.until precedes the first anchor');
    }
  }
  if (p.owner === 'engine') {
    if (!isObj(p.engine)) errs.push('an engine-owned schedule carries engine metadata');
    else {
      closed(p.engine, ['reasons', 'algorithmVersion', 'basis'], 'engine', errs);
      checkReasons(p.engine.reasons, 'engine.reasons', errs);
      if (!isStr(p.engine.algorithmVersion)) errs.push('engine.algorithmVersion is required');
      checkRefs(p.engine.basis, 'engine.basis', errs);
    }
    if (c?.kind === 'every') errs.push('the engine never creates recurrence');
    if (p.slot?.intent === 'test') errs.push('the engine never creates a Test schedule');
  } else if (p.engine !== undefined) errs.push('only an engine-owned schedule carries engine metadata');
  if (p.status === 'cancelled') {
    if (!isObj(p.cancellation) || (p.cancellation.by !== 'user' && p.cancellation.by !== 'engine')) errs.push('a cancelled schedule records cancellation.by');
    else {
      closed(p.cancellation, ['by', 'considered'], 'cancellation', errs);
      checkRefs(p.cancellation.considered, 'cancellation.considered', errs);
    }
  } else if (p.cancellation !== undefined) errs.push('only a cancelled schedule carries cancellation');
  for (const k of ['createdAt', 'updatedAt']) if (!isStr(p[k])) errs.push(`${k} must be a string`);
  return errs;
}

export function validateException(p) {
  const errs = [];
  if (!isObj(p)) return ['exception must be an object'];
  closed(p, ['schemaVersion', 'id', 'scheduleId', 'originalDate', 'kind', 'movedTo'], 'exception', errs);
  if (p.schemaVersion !== 1) errs.push('schemaVersion must be 1');
  if (!isStr(p.scheduleId) || !isDate(p.originalDate)) errs.push('scheduleId and originalDate are required');
  else if (p.id !== `${p.scheduleId}#${p.originalDate}`) errs.push('id must be <scheduleId>#<originalDate> (the occurrence identity)');
  if (p.kind === 'moved') {
    if (!isDate(p.movedTo)) errs.push('a moved exception needs movedTo');
    else if (p.movedTo === p.originalDate) errs.push('movedTo must differ from originalDate');
  } else if (p.kind === 'cancelled') {
    if (p.movedTo !== undefined) errs.push('a cancelled exception has no movedTo');
  } else errs.push('kind must be moved|cancelled');
  return errs;
}

export function validateFulfillment(p) {
  const errs = [];
  if (!isObj(p)) return ['fulfillment must be an object'];
  closed(p, ['schemaVersion', 'id', 'scheduleId', 'originalDate', 'session', 'fulfilledOn', 'via'], 'fulfillment', errs);
  if (p.schemaVersion !== 1) errs.push('schemaVersion must be 1');
  if (!isStr(p.scheduleId) || !isDate(p.originalDate)) errs.push('scheduleId and originalDate are required');
  else if (p.id !== `${p.scheduleId}#${p.originalDate}`) errs.push('id must be <scheduleId>#<originalDate> (the occurrence identity)');
  if (!isObj(p.session) || !isStr(p.session.collection) || !isStr(p.session.id)) errs.push('session must be {collection, id}');
  else closed(p.session, REF, 'session', errs);
  if (!isDate(p.fulfilledOn)) errs.push('fulfilledOn must be a calendar date');
  if (p.via !== 'linked' && p.via !== 'slot-match') errs.push('via must be linked|slot-match');
  return errs;
}

export function validateSuggestion(p) {
  const errs = [];
  if (!isObj(p)) return ['suggestion must be an object'];
  closed(p, ['schemaVersion', 'id', 'scheduleId', 'scheduleRev', 'targetOriginalDate', 'currentDate', 'suggestedDate', 'reasons', 'algorithmVersion', 'basis', 'status', 'createdAt', 'decidedAt'], 'suggestion', errs);
  if (p.schemaVersion !== 1) errs.push('schemaVersion must be 1');
  if (!isStr(p.id) || !isStr(p.scheduleId)) errs.push('id and scheduleId are required');
  if (!Number.isInteger(p.scheduleRev) || p.scheduleRev < 1) errs.push('scheduleRev must be a positive integer (the bound schedule revision)');
  for (const k of ['targetOriginalDate', 'currentDate', 'suggestedDate']) if (!isDate(p[k])) errs.push(`${k} must be a calendar date`);
  if (isDate(p.currentDate) && p.currentDate === p.suggestedDate) errs.push('a suggestion carries a date that differs from the current one');
  checkReasons(p.reasons, 'reasons', errs);
  checkRefs(p.basis, 'basis', errs);
  if (!isStr(p.algorithmVersion)) errs.push('algorithmVersion is required');
  if (!SUGGESTION_STATUSES.includes(p.status)) errs.push('status must be pending|accepted|kept|superseded');
  if (p.status !== 'pending' && !isStr(p.decidedAt)) errs.push('a decided suggestion records decidedAt');
  return errs;
}

export function validateSelection(p) {
  const errs = [];
  if (!isObj(p)) return ['selection must be an object'];
  closed(p, ['schemaVersion', 'id', 'session', 'selection', 'scheduleRef', 'createdAt'], 'selection', errs);
  if (p.schemaVersion !== 1) errs.push('schemaVersion must be 1');
  if (!isObj(p.session) || !isStr(p.session.collection) || !isStr(p.session.id)) errs.push('session must be {collection, id}');
  else {
    closed(p.session, REF, 'session', errs);
    if (p.id !== `${p.session.collection}:${p.session.id}`) errs.push('id must be <collection>:<sessionId>');
  }
  if (!isObj(p.selection) || !SOURCES.includes(p.selection.source)) errs.push('selection.source must be manual|recommended');
  else {
    closed(p.selection, ['source', 'reasons', 'algorithmVersion'], 'selection', errs);
    if (p.selection.source === 'recommended') {
      checkReasons(p.selection.reasons ?? null, 'selection.reasons', errs);
      if (!isStr(p.selection.algorithmVersion)) errs.push('a recommended selection records algorithmVersion');
    } else if (p.selection.reasons !== undefined) errs.push('a manual selection has no reasons');
  }
  if (p.scheduleRef !== undefined) {
    if (!isObj(p.scheduleRef) || !isStr(p.scheduleRef.scheduleId) || !isDate(p.scheduleRef.originalDate)) errs.push('scheduleRef must be {scheduleId, originalDate}');
    else closed(p.scheduleRef, ['scheduleId', 'originalDate'], 'scheduleRef', errs);
  }
  if (!isStr(p.createdAt)) errs.push('createdAt must be a string');
  return errs;
}

const VALIDATORS = {
  [COLLECTIONS.schedule]: validateSchedule,
  [COLLECTIONS.exception]: validateException,
  [COLLECTIONS.fulfillment]: validateFulfillment,
  [COLLECTIONS.suggestion]: validateSuggestion,
  [COLLECTIONS.selection]: validateSelection,
};

export function assertValid(collection, payload) {
  const errs = VALIDATORS[collection](payload);
  if (errs.length) throw new SchemaError(errs);
  return payload;
}

export const occurrenceId = (scheduleId, originalDate) => `${scheduleId}#${originalDate}`;
