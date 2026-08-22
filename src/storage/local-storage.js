export const STORAGE_KEYS = {
  LEGACY_PAPER: "quiz-studio-paper-v1",
  LIBRARY: "quiz-studio-library-v1",
  ACTIVE_PAPER: "quiz-studio-active-paper",
  ACTIVE_SESSION: "quiz-studio-active-session-v1",
  TRANSLATION_ACTIVE_SESSION: "quiz-studio-translation-active-session-v1",
  HISTORY: "quiz-studio-history-v1",
  LEARNER_RESPONSES: "quiz-studio-learner-responses-v1",
  TEACHER_REVIEWS: "quiz-studio-teacher-reviews-v1",
  TRANSLATION_LIBRARY: "quiz-studio-translation-library-v1",
  THEME: "quiz-studio-theme",
  LANGUAGE: "quiz-studio-language",
  UI_PREFERENCES: "quiz_studio_ui_preferences",
};

export function loadJson(key, fallback = null) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeStoredValue(key) {
  localStorage.removeItem(key);
}
