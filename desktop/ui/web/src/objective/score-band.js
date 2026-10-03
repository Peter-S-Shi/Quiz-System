// Presentation bands of an Objective result (Product Owner bands). A band is a DISPLAY choice derived from the facts
// `correct / total`; it is never stored, never a mastery level, and never used by scheduling or recommendation.
//   all correct  -> 'perfect' (green, restrained celebration mark)      90-99% -> 'high' (green)
//   70-89%       -> 'mid' (amber)                                        < 70%  -> 'low' (red)
// "Perfect" means every question correct: 199 of 200 is 99.5%, which rounds to 100 but is not a full score.

/** @returns {{ band: 'perfect'|'high'|'mid'|'low', tone: 'green'|'amber'|'red', percent: number }} */
export function scoreBand({ correct, total }) {
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total <= 0 || correct < 0 || correct > total) return { band: 'low', tone: 'red', percent: 0 };
  if (correct === total) return { band: 'perfect', tone: 'green', percent: 100 };
  const percent = Math.min(99, Math.round((100 * correct) / total));
  if (percent >= 90) return { band: 'high', tone: 'green', percent };
  if (percent >= 70) return { band: 'mid', tone: 'amber', percent };
  return { band: 'low', tone: 'red', percent };
}
