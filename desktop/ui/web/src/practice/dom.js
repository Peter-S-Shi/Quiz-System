// Re-exports the shared DOM helpers; the practice-specific labels live here.
export { h, fill, uid, focusEl, sr } from '../dom.js';

export const KIND_LABEL = Object.freeze({ unknown: "I don't know this", uncertain: "I'm not sure", should_know: 'I should know this' });
export const TYPE_LABEL = Object.freeze({ single: 'Single choice', multiple: 'Multiple choice', blank: 'Fill in the blank', truefalse: 'True or false', matching: 'Matching' });
