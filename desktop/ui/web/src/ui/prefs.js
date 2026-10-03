// UI preferences (V1's set: language, theme, motion, physical sound, list width). Stored in the Rust-owned `setting`
// collection - never in browser-origin storage - and applied to the document. A preference never changes any data.
import { detectLocale, setLocale } from '../i18n.js';

export const PREF_DEFAULTS = Object.freeze({ language: null, theme: 'system', motion: 'standard', sound: false, listWidth: 320 });
export const LIST_WIDTH = Object.freeze({ min: 240, max: 500, step: 10 });
const KEY = (name) => `ui.${name}`;
const VALID = {
  language: (v) => v === 'en' || v === 'zh-CN',
  theme: (v) => v === 'system' || v === 'light' || v === 'dark',
  motion: (v) => v === 'standard' || v === 'reduced',
  sound: (v) => typeof v === 'boolean',
  listWidth: (v) => Number.isInteger(v) && v >= LIST_WIDTH.min && v <= LIST_WIDTH.max,
};

export function createPrefs(port, { systemLanguage = globalThis.navigator?.language } = {}) {
  const values = { ...PREF_DEFAULTS };
  const subscribers = new Set();

  async function read(name) {
    const rec = (await port.read('setting', { id: KEY(name) }))[0];
    return rec ? { value: rec.payload.value, rev: rec.rev } : null;
  }

  const prefs = {
    get: (name) => (name === 'language' ? values.language ?? detectLocale(systemLanguage) : values[name]),
    all: () => ({ language: prefs.get('language'), theme: values.theme, motion: values.motion, sound: values.sound, listWidth: values.listWidth }),
    onChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },

    async load() {
      for (const name of Object.keys(PREF_DEFAULTS)) {
        const stored = await read(name);
        if (stored && VALID[name](stored.value)) values[name] = stored.value;
      }
      prefs.apply();
      return prefs.all();
    },

    async set(name, value) {
      if (!VALID[name]?.(value)) throw new RangeError(`invalid value for ${name}`);
      const cur = await read(name);
      await port.commit({
        preconditions: [cur ? { kind: 'rev', collection: 'setting', id: KEY(name), equals: cur.rev } : { kind: 'absent', collection: 'setting', id: KEY(name) }],
        ops: [{ op: 'put', collection: 'setting', id: KEY(name), payload: { key: KEY(name), value } }],
      });
      values[name] = value;
      prefs.apply();
      for (const fn of subscribers) fn(name, value);
    },

    /** Reflect the preferences on the document: language, theme, motion, list width. */
    apply(doc = globalThis.document) {
      const lang = prefs.get('language');
      setLocale(lang);
      if (!doc) return;
      const root = doc.documentElement;
      root.lang = lang === 'zh-CN' ? 'zh-CN' : 'en';
      if (values.theme === 'system') delete root.dataset.theme; else root.dataset.theme = values.theme;
      root.dataset.motion = values.motion;
      root.style.setProperty('--list-w', `${values.listWidth}px`);
    },
  };
  return prefs;
}
