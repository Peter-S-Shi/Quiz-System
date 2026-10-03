// The UI dictionary. English and Simplified Chinese are defined TOGETHER, one entry per key, so a key can never exist in
// one language only. The locale is a UI preference (Settings); it never changes a material's own language or any stored
// data. `t()` is pure apart from the current locale and never throws: an unknown key renders as the key and is recorded
// (a test asserts that no used key is missing).

export const LOCALES = Object.freeze(['en', 'zh-CN']);

/** @type {Record<string, [string, string]>} */
const table = Object.create(null);
const missing = new Set();
let locale = 'en';

/** Register entries: `{ 'today.title': ['Today', '今日'] }`. A duplicate key with a different text is a programming error. */
export function defineStrings(entries) {
  for (const [key, pair] of Object.entries(entries)) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some((s) => typeof s !== 'string')) throw new TypeError(`string ${key} needs [en, zh-CN]`);
    if (key in table && (table[key][0] !== pair[0] || table[key][1] !== pair[1])) throw new Error(`string ${key} is defined twice with different text`);
    table[key] = pair;
  }
}

export function setLocale(next) {
  if (!LOCALES.includes(next)) throw new RangeError(`unknown locale ${next}`);
  locale = next;
}
export const getLocale = () => locale;

/** Map a system language tag (navigator.language) to a supported locale. */
export function detectLocale(tag) {
  return typeof tag === 'string' && tag.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

/** Translate `key`; `{name}` placeholders are replaced from `params`. */
export function t(key, params) {
  const pair = table[key];
  if (!pair) {
    missing.add(key);
    return key;
  }
  const text = pair[locale === 'zh-CN' ? 1 : 0];
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : text;
}

export const missingKeys = () => [...missing];
export const definedKeys = () => Object.keys(table);
/** Both texts of a key (tests and the parity check). */
export const entry = (key) => table[key];
