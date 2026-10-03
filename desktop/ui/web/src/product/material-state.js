// The factual learning state of a piece of material, DERIVED from existing canonical facts - never stored, never a
// mastery or proficiency judgment:
//   in-progress  an active saved (recoverable) session exists for that material
//   practiced    at least one canonical completed attempt (Evidence) exists
//   not-started  neither
// In-progress wins over practiced because it is the state a learner can act on right now (resume).
export const MATERIAL_STATES = Object.freeze(['not-started', 'in-progress', 'practiced']);

const TYPE_OF_DOMAIN = { objective: 'quiz-paper', translation: 'translation-document', typing: 'typing-text' };
const keyOf = (type, id) => `${type}|${id}`;

/**
 * @param {object} facts
 * @param {{payload: object}[]} facts.responses canonical `learner_response` rows (Objective and Translation attempts)
 * @param {{payload: object}[]} facts.typingAttempts canonical `typing_attempt` rows
 * @param {object[]} facts.resumable recovery states (each carries `domain` and `material.id`)
 * @returns {Map<string, {state: string, attempts: number}>} keyed by `<material type>|<material id>`
 */
export function deriveMaterialStates({ responses = [], typingAttempts = [], resumable = [] }) {
  const attempts = new Map();
  const bump = (type, id) => { if (typeof type === 'string' && typeof id === 'string') attempts.set(keyOf(type, id), (attempts.get(keyOf(type, id)) ?? 0) + 1); };
  for (const r of responses) bump(r.payload?.material?.type, r.payload?.material?.id);
  for (const a of typingAttempts) bump(a.payload?.material?.type ?? 'typing-text', a.payload?.material?.id);
  const active = new Set();
  for (const s of resumable) if (TYPE_OF_DOMAIN[s?.domain] && typeof s.material?.id === 'string') active.add(keyOf(TYPE_OF_DOMAIN[s.domain], s.material.id));
  const out = new Map();
  for (const key of new Set([...attempts.keys(), ...active])) {
    const n = attempts.get(key) ?? 0;
    out.set(key, { state: active.has(key) ? 'in-progress' : 'practiced', attempts: n });
  }
  return out;
}

/** The state of one material (anything with no fact is `not-started`). */
export function materialStateOf(states, type, id) {
  return states.get(keyOf(type, id)) ?? { state: 'not-started', attempts: 0 };
}
