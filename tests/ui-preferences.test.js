import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_UI_PREFERENCES,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  clampSidebarWidth,
  loadUiPreferences,
  saveUiPreferences,
  normalizeUiPreferences,
} from "../src/core/ui-preferences.js";

test("clampSidebarWidth clamps correctly within [240, 500] and falls back to default on invalid inputs", () => {
  assert.equal(clampSidebarWidth(100), MIN_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(999), MAX_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(350), 350);
  assert.equal(clampSidebarWidth("invalid"), DEFAULT_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(null), DEFAULT_SIDEBAR_WIDTH);
});

test("DEFAULT_UI_PREFERENCES has sound enabled, system/standard motion, default sidebarWidth, and valid default theme", () => {
  assert.equal(DEFAULT_UI_PREFERENCES.soundEnabled, true);
  assert.equal(DEFAULT_UI_PREFERENCES.theme, "light");
  assert.equal(DEFAULT_UI_PREFERENCES.motionPreference, "standard");
  assert.equal(DEFAULT_UI_PREFERENCES.sidebarWidth, 320);
});

test("normalizeUiPreferences enforces valid values and recovers safely from corrupted input", () => {
  assert.deepEqual(normalizeUiPreferences(null), DEFAULT_UI_PREFERENCES);
  assert.deepEqual(normalizeUiPreferences({}), DEFAULT_UI_PREFERENCES);
  assert.deepEqual(normalizeUiPreferences({ theme: "dark", soundEnabled: false, motionPreference: "reduced", sidebarWidth: 380 }), {
    theme: "dark",
    soundEnabled: false,
    motionPreference: "reduced",
    sidebarWidth: 380,
  });
  // Bounds clamping and corrupted values
  assert.deepEqual(normalizeUiPreferences({ sidebarWidth: 100 }), {
    ...DEFAULT_UI_PREFERENCES,
    sidebarWidth: 240,
  });
  assert.deepEqual(normalizeUiPreferences({ sidebarWidth: 999 }), {
    ...DEFAULT_UI_PREFERENCES,
    sidebarWidth: 500,
  });
  assert.deepEqual(normalizeUiPreferences({ theme: "neon", soundEnabled: "yes", motionPreference: "hyper", sidebarWidth: "wide" }), {
    theme: "light",
    soundEnabled: true,
    motionPreference: "standard",
    sidebarWidth: 320,
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
  const updated = { theme: "dark", soundEnabled: false, motionPreference: "reduced", sidebarWidth: 360 };
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
