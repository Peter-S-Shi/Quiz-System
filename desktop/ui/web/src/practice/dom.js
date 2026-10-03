// Re-exports the shared DOM helpers; the practice-specific labels live here.
import './strings.js';
import { t } from '../i18n.js';

export { h, fill, uid, focusEl, sr } from '../dom.js';

/** The learner's three metacognitive marks and the five question types, in the current interface language. */
export const kindLabel = (kind) => t(`pr.kind.${kind}`);
export const typeLabel = (type) => t(`pr.type.${type}`);
