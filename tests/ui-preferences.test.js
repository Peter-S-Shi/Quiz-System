import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_UI_PREFERENCES,
  loadUiPreferences,
  saveUiPreferences,
  normalizeUiPreferences,
} from "../src/core/ui-preferences.js";

test("DEFAULT_UI_PREFERENCES has sound enabled, system/standard motion, and valid default theme", () => {
  assert.equal(DEFAULT_UI_PREFERENCES.soundEnabled, true);
  assert.equal(DEFAULT_UI_PREFERENCES.theme, "light");
  assert.equal(DEFAULT_UI_PREFERENCES.motionPreference, "standard");
});

test("normalizeUiPreferences enforces valid values and recovers safely from corrupted input", () => {
  assert.deepEqual(normalizeUiPreferences(null), DEFAULT_UI_PREFERENCES);
  assert.deepEqual(normalizeUiPreferences({}), DEFAULT_UI_PREFERENCES);
  assert.deepEqual(normalizeUiPreferences({ theme: "dark", soundEnabled: false, motionPreference: "reduced" }), {
    theme: "dark",
    soundEnabled: false,
    motionPreference: "reduced",
  });
  // Corrupted strings
  assert.deepEqual(normalizeUiPreferences({ theme: "neon", soundEnabled: "yes", motionPreference: "hyper" }), {
    theme: "light",
    soundEnabled: true,
    motionPreference: "standard",
  });
});

test("loadUiPreferences and saveUiPreferences round-trip cleanly with storage mock", () => {
  const store = {};
  const mockStorage = {
    getItem(key) {
      return store[key] ?? null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
  };

  // Initially loads defaults
  const initial = loadUiPreferences(mockStorage);
  assert.deepEqual(initial, DEFAULT_UI_PREFERENCES);

  // Saves updated preferences
  const updated = { theme: "dark", soundEnabled: false, motionPreference: "reduced" };
  saveUiPreferences(updated, mockStorage);

  // Reloads accurately
  const reloaded = loadUiPreferences(mockStorage);
  assert.deepEqual(reloaded, updated);

  // Synchronizes standalone/legacy keys for backwards compatibility
  assert.equal(store["quiz-studio-theme"], "dark");
  assert.equal(store["quiz_system_theme"], "dark");
  assert.equal(store["quiz_studio_sound_enabled"], "false");
});

test("loadUiPreferences recovers theme and sound settings from legacy keys if unified preferences key is missing", () => {
  const legacyStore = {
    "quiz-studio-theme": "dark",
    "quiz_studio_sound_enabled": "false",
  };
  const mockStorage = {
    getItem(key) {
      return legacyStore[key] ?? null;
    },
    setItem(key, value) {
      legacyStore[key] = String(value);
    },
  };

  const recovered = loadUiPreferences(mockStorage);
  assert.equal(recovered.theme, "dark");
  assert.equal(recovered.soundEnabled, false);
});
