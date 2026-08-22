/**
 * UI Preferences Module
 * Manages persisted user interface settings: Theme, Sound Effects, and Motion.
 */

export const STORAGE_KEY_UI_PREFERENCES = "quiz-studio-ui-preferences-v1";
export const LEGACY_STORAGE_KEY_UI_PREFERENCES = "quiz_studio_ui_preferences";

export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 500;
export const DEFAULT_SIDEBAR_WIDTH = 320;

export const DEFAULT_UI_PREFERENCES = {
  theme: "light",
  soundEnabled: true,
  motionPreference: "standard",
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
};

/**
 * Clamps sidebar width within accepted range [240, 500].
 * @param {any} width
 * @returns {number}
 */
export function clampSidebarWidth(width) {
  if (width === null || width === undefined || width === "") return DEFAULT_SIDEBAR_WIDTH;
  const num = Number(width);
  if (!Number.isFinite(num)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(Math.max(Math.round(num), MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
}

/**
 * Normalizes input object into valid UI preferences.
 * @param {any} input
 * @returns {{ theme: "light"|"dark", soundEnabled: boolean, motionPreference: "standard"|"reduced", sidebarWidth: number }}
 */
export function normalizeUiPreferences(input) {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_UI_PREFERENCES };
  }

  const theme = input.theme === "dark" ? "dark" : "light";
  const soundEnabled = typeof input.soundEnabled === "boolean" ? input.soundEnabled : DEFAULT_UI_PREFERENCES.soundEnabled;
  const motionPreference = input.motionPreference === "reduced" ? "reduced" : "standard";
  const sidebarWidth = clampSidebarWidth(input.sidebarWidth);

  return {
    theme,
    soundEnabled,
    motionPreference,
    sidebarWidth,
  };
}

/**
 * Loads UI preferences from storage with safe fallback to defaults.
 * @param {Storage} [storage]
 * @returns {{ theme: "light"|"dark", soundEnabled: boolean, motionPreference: "standard"|"reduced", sidebarWidth: number }}
 */
export function loadUiPreferences(storage = (typeof window !== "undefined" ? window.localStorage : null)) {
  if (!storage) {
    return { ...DEFAULT_UI_PREFERENCES };
  }

  try {
    const raw = storage.getItem(STORAGE_KEY_UI_PREFERENCES) || storage.getItem(LEGACY_STORAGE_KEY_UI_PREFERENCES);
    if (!raw) {
      // Legacy theme and sound key fallback if present
      const legacyTheme = storage.getItem("quiz-studio-theme") || storage.getItem("quiz_system_theme");
      const legacySound = storage.getItem("quiz_studio_sound_enabled");
      const fallback = {};
      if (legacyTheme === "dark" || legacyTheme === "light") {
        fallback.theme = legacyTheme;
      }
      if (legacySound === "true" || legacySound === "false") {
        fallback.soundEnabled = legacySound === "true";
      }
      return normalizeUiPreferences(fallback);
    }
    const parsed = JSON.parse(raw);
    return normalizeUiPreferences(parsed);
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

/**
 * Persists UI preferences to storage.
 * @param {{ theme?: string, soundEnabled?: boolean, motionPreference?: string }} preferences
 * @param {Storage} [storage]
 */
export function saveUiPreferences(preferences, storage = (typeof window !== "undefined" ? window.localStorage : null)) {
  if (!storage) return;

  const current = loadUiPreferences(storage);
  const normalized = normalizeUiPreferences({ ...current, ...preferences });

  try {
    storage.setItem(STORAGE_KEY_UI_PREFERENCES, JSON.stringify(normalized));
    // Keep standalone/legacy keys synchronized for backwards compatibility
    storage.setItem("quiz-studio-theme", normalized.theme);
    storage.setItem("quiz_system_theme", normalized.theme);
    storage.setItem("quiz_studio_sound_enabled", String(normalized.soundEnabled));
  } catch (err) {
    console.warn("Failed to persist UI preferences:", err);
  }
}
