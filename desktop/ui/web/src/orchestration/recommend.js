// The Recommendation contract (ADR 0003 section 12). `recommend(snapshot, today)` is a PURE function: record order is
// irrelevant, no clock or randomness is read inside, lists have a total order, and the output serializes
// byte-identically for identical inputs (R-4). The output carries NO numeric score, percentage or rank (R-2): targets
// are grouped by the tier of their best live reason - a presentation grouping of reason KINDS, not a ranking between
// them - then ordered by a stable key. Recommendations are derived and replaceable (R-1): they are never stored as
// canonical; only the snapshot of what the learner SAW is stored later, as selection provenance.

import { domainOfMaterialType, materialKey, readObjective, readRecovery, readScheduling, readTeacherReview, readTranslation, readTyping } from './readers.js';

/** `v2` activates the Typing Reader (ADR 0004 section 9.3); output for a snapshot without Typing rows equals `v1` modulo this label. */
export const ALGORITHM_VERSION = 'v2';

/** The closed reason registry (v2). `unknown`, `uncertain` and `should_know` stay three codes, never merged. */
export const REASON_CODES = [
  'SCHEDULED_REVIEW_OVERDUE',
  'LEARNER_SCHEDULED_OVERDUE',
  'REMEDIATION_UNRESOLVED',
  'SCHEDULED_REVIEW_DUE',
  'LEARNER_SCHEDULED_DUE',
  'OBJECTIVE_INCORRECT_REPEATED',
  'LEARNER_UNKNOWN',
  'LEARNER_UNCERTAIN',
  'LEARNER_SHOULD_KNOW',
  'OBJECTIVE_INCORRECT_LATEST',
  'TEACHER_ACTIONABLE_REVIEW',
  'SUCCESSFUL_RECOVERY',
  // produced only by the Typing Reader, only from typing_attempt (ADR 0004 section 9); TYPING_REVISIT_DUE is deliberately not introduced
  'TYPING_ERRORS_REMAIN',
];

/** Presentation groups (ADR 0003 section 12.3 tiers 1-3), named rather than numbered. */
export const GROUPS = ['overdue-or-remediation', 'due-or-learner-flagged', 'incorrect-or-teacher-flagged'];
const GROUP_OF = {
  SCHEDULED_REVIEW_OVERDUE: 0,
  LEARNER_SCHEDULED_OVERDUE: 0,
  REMEDIATION_UNRESOLVED: 0,
  SCHEDULED_REVIEW_DUE: 1,
  LEARNER_SCHEDULED_DUE: 1,
  OBJECTIVE_INCORRECT_REPEATED: 1,
  LEARNER_UNKNOWN: 1,
  LEARNER_UNCERTAIN: 1,
  LEARNER_SHOULD_KNOW: 1,
  OBJECTIVE_INCORRECT_LATEST: 2,
  TYPING_ERRORS_REMAIN: 2,
  TEACHER_ACTIONABLE_REVIEW: 2,
};
const ITEM_CODES = new Set(['OBJECTIVE_INCORRECT_REPEATED', 'OBJECTIVE_INCORRECT_LATEST', 'LEARNER_UNKNOWN', 'LEARNER_UNCERTAIN', 'LEARNER_SHOULD_KNOW', 'TEACHER_ACTIONABLE_REVIEW']);

const refKey = (r) => `${r.collection}|${r.id}|${r.itemId ?? ''}`;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function matches(sel, ref) {
  return sel.collection === ref.collection && sel.id === ref.id && (sel.itemId === undefined || sel.itemId === ref.itemId);
}

/** A signal is superseded (urgency only) iff EVERY provenance entry is covered by a recorded successful recovery. */
function superseded(signal, recoveries) {
  return signal.provenance.length > 0 && signal.provenance.every((p) => recoveries.some((r) => r.supersedes.some((s) => matches(s, p))));
}

function mergeReasons(signals) {
  const byCode = new Map();
  for (const s of signals) {
    if (!byCode.has(s.code)) byCode.set(s.code, []);
    byCode.get(s.code).push(s);
  }
  const out = [];
  for (const code of REASON_CODES) {
    const list = byCode.get(code);
    if (!list) continue;
    const prov = [...new Map(list.flatMap((s) => s.provenance).map((p) => [refKey(p), p])).values()].sort((a, b) => cmp(refKey(a), refKey(b)));
    out.push({ code, params: {}, provenance: prov });
  }
  return out;
}

function focusOf(reasons) {
  const items = new Set();
  for (const r of reasons) if (ITEM_CODES.has(r.code)) for (const p of r.provenance) if (p.itemId !== undefined) items.add(p.itemId);
  return [...items].sort().map((itemId) => ({ itemId }));
}

/**
 * @param snapshot as built by `loadSnapshot` (or by hand in tests)
 * @param today local calendar date from the injected clock
 */
export function recommend(snapshot, today) {
  const recoveries = readRecovery(snapshot);
  const scheduling = readScheduling(snapshot, today);
  const all = [
    ...readObjective(snapshot),
    ...readTranslation(snapshot),
    ...readTeacherReview(snapshot),
    ...recoveries.map((r) => r.signal),
    ...scheduling.signals,
    ...readTyping(snapshot),
  ];
  const byTarget = new Map();
  for (const s of all) {
    const key = materialKey(s.material);
    if (!byTarget.has(key)) byTarget.set(key, { material: s.material, signals: [] });
    byTarget.get(key).signals.push(s);
  }
  const out = [];
  for (const { material, signals } of byTarget.values()) {
    const domain = domainOfMaterialType(material.type);
    if (!domain) continue;
    const live = signals.filter((s) => s.code === 'SUCCESSFUL_RECOVERY' || !superseded(s, recoveries));
    const history = signals.filter((s) => s.code !== 'SUCCESSFUL_RECOVERY' && superseded(s, recoveries));
    const urgent = live.filter((s) => s.code !== 'SUCCESSFUL_RECOVERY');
    if (urgent.length === 0) continue; // a recovered target has no live reason: it is not recommended
    const reasons = mergeReasons(urgent);
    const group = Math.min(...reasons.map((r) => GROUP_OF[r.code]));
    const context = mergeReasons([...live.filter((s) => s.code === 'SUCCESSFUL_RECOVERY'), ...history]);
    const focus = focusOf(reasons);
    const note = scheduling.notes.get(materialKey(material));
    const unavailable = !snapshot.materials?.[material.type]?.has(material.id);
    out.push({
      target: { domain, material: { type: material.type, id: material.id }, ...(focus.length ? { focus } : {}) },
      group: GROUPS[group],
      reasons,
      ...(context.length ? { context } : {}),
      ...(note ? { scheduling: note } : {}),
      ...(unavailable ? { unavailable: true } : {}),
      algorithmVersion: ALGORITHM_VERSION,
    });
  }
  out.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || cmp(a.target.domain, b.target.domain) || cmp(a.target.material.type, b.target.material.type) || cmp(a.target.material.id, b.target.material.id));
  return out;
}

// ------------------------------------------------------------------------------------------------ explanation
const TEXT = {
  en: {
    SCHEDULED_REVIEW_OVERDUE: 'A scheduled revisit is overdue.',
    LEARNER_SCHEDULED_OVERDUE: 'A session you scheduled is overdue.',
    REMEDIATION_UNRESOLVED: 'A teacher recommended remediation and no retry has been recorded.',
    SCHEDULED_REVIEW_DUE: 'A scheduled revisit is due today.',
    LEARNER_SCHEDULED_DUE: 'A session you scheduled is due today.',
    OBJECTIVE_INCORRECT_REPEATED: 'Answered incorrectly in more than one recorded attempt.',
    LEARNER_UNKNOWN: 'You marked part of this as unknown.',
    LEARNER_UNCERTAIN: 'You marked part of this as uncertain.',
    LEARNER_SHOULD_KNOW: 'You marked part of this as something you should know.',
    OBJECTIVE_INCORRECT_LATEST: 'Answered incorrectly in the latest recorded attempt.',
    TEACHER_ACTIONABLE_REVIEW: 'A teacher review judged part of this incorrect, partial or in need of review.',
    SUCCESSFUL_RECOVERY: 'A later retry recorded a successful recovery.',
    TYPING_ERRORS_REMAIN: 'The latest copy of this text still had typing differences.',
  },
  'zh-CN': {
    SCHEDULED_REVIEW_OVERDUE: '已排定的复习已逾期。',
    LEARNER_SCHEDULED_OVERDUE: '你安排的练习已逾期。',
    REMEDIATION_UNRESOLVED: '老师建议了补救练习，尚未记录重做。',
    SCHEDULED_REVIEW_DUE: '已排定的复习今天到期。',
    LEARNER_SCHEDULED_DUE: '你安排的练习今天到期。',
    OBJECTIVE_INCORRECT_REPEATED: '在不止一次已记录的作答中答错。',
    LEARNER_UNKNOWN: '你把其中一部分标记为“不知道”。',
    LEARNER_UNCERTAIN: '你把其中一部分标记为“不确定”。',
    LEARNER_SHOULD_KNOW: '你把其中一部分标记为“应该会”。',
    OBJECTIVE_INCORRECT_LATEST: '最近一次已记录的作答中答错。',
    TEACHER_ACTIONABLE_REVIEW: '老师的评阅认为其中一部分错误、部分正确或需要复查。',
    SUCCESSFUL_RECOVERY: '之后的重做记录了成功恢复。',
    TYPING_ERRORS_REMAIN: '这段文字最近一次抄写仍有打字差异。',
  },
};

/** Human-readable text rendered from `(code, params)` outside the algorithm; stable across runs and locales of the code layer. */
export function explain(reason, locale = 'en') {
  const t = TEXT[locale] ?? TEXT.en;
  if (!(reason.code in t)) throw new RangeError(`unknown reason code ${reason.code}`);
  return t[reason.code];
}

/** The selection-provenance snapshot of what the learner was shown (stored with the session, ADR 0003 section 13). */
export function selectionProvenance(recommendation) {
  return {
    source: 'recommended',
    reasons: recommendation.reasons.map((r) => ({ code: r.code, params: r.params, provenance: r.provenance })),
    algorithmVersion: recommendation.algorithmVersion,
  };
}
