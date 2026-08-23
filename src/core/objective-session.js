export function normalizeObjectiveSession(value, activePaperId) {
  if (!isPlainObject(value) || value.completed === true) return null;
  if (!nonEmptyString(value.id) || !nonEmptyString(value.paperId) || value.paperId !== activePaperId) return null;
  if (!nonEmptyString(value.startedAt) || !Array.isArray(value.questions) || !value.questions.length) return null;
  if (value.questions.some((question) => !isPlainObject(question) || !nonEmptyString(question.id))) return null;
  if (!isPlainObject(value.answers) || !Array.isArray(value.results)) return null;

  const index = Number.isInteger(value.index) && value.index >= 0 && value.index < value.questions.length
    ? value.index
    : 0;
  const feedbackMode = value.feedbackMode === "submitAtEnd" ? "submitAtEnd" : "instant";

  return {
    ...value,
    index,
    feedbackMode,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
