// Task-Domain Integration (ADR 0004): the Domain Evidence Adapter registry, the SessionFinalizer, session recovery, and
// the Typing domain (pinned comparison, immutable attempt, session engine). Pure JS over the Store Port.
export * from './adapters.js';
export { SessionFinalizer } from './finalizer.js';
export { SessionRecovery } from './recovery.js';
export { COMPARISON, TypingCompareError, applyErrors, compare } from './typing/compare.js';
export { buildTypingAttempt, validateTypingAttempt } from './typing/attempt.js';
export { TypingSession, TypingSessionError, restoreTypingSession } from './typing/session.js';
