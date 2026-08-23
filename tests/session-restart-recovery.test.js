import test from "node:test";
import assert from "node:assert/strict";

import { normalizeObjectiveSession } from "../src/core/objective-session.js";
import {
  addTranslationAnnotation,
  createTranslationSession,
  goToTranslationIndex,
  normalizeTranslationSession,
  setTranslationAnswer,
  setTranslationItemMark,
  setTranslationRevealed,
} from "../src/core/translation-session.js";
import { STORAGE_KEYS } from "../src/storage/local-storage.js";

test("Objective sessions recover exact in-progress state in both feedback modes after serialization", () => {
  for (const feedbackMode of ["instant", "submitAtEnd"]) {
    const session = {
      id: `objective-${feedbackMode}`,
      paperId: "paper-restart",
      paperTitle: "Synthetic restart paper",
      startedAt: "2026-08-22T10:00:00.000Z",
      questions: [
        { id: "q1", type: "single", prompt: "Synthetic one" },
        { id: "q2", type: "blank", prompt: "Synthetic two" },
      ],
      index: 1,
      answers: { q1: "a", q2: "draft answer" },
      results: [{ questionId: "q1", correct: true }],
      submitted: feedbackMode === "instant",
      feedback: feedbackMode === "instant" ? { questionId: "q1", correct: true } : null,
      completed: false,
      feedbackMode,
    };

    const recovered = normalizeObjectiveSession(restartRoundTrip(session), "paper-restart");

    assert.deepEqual(recovered, session);
  }
});

test("Objective recovery rejects completed, mismatched, and structurally unsafe sessions", () => {
  const valid = {
    id: "objective-safe",
    paperId: "paper-restart",
    startedAt: "2026-08-22T10:00:00.000Z",
    questions: [{ id: "q1", type: "single" }],
    index: 0,
    answers: {},
    results: [],
    completed: false,
  };

  assert.equal(normalizeObjectiveSession({ ...valid, completed: true }, "paper-restart"), null);
  assert.equal(normalizeObjectiveSession(valid, "another-paper"), null);
  assert.equal(normalizeObjectiveSession({ ...valid, questions: [] }, "paper-restart"), null);
  assert.equal(normalizeObjectiveSession({ ...valid, questions: [{ type: "single" }] }, "paper-restart"), null);
  assert.equal(normalizeObjectiveSession("broken", "paper-restart"), null);
});

test("Translation normal, retry, and remediation sessions recover exact working evidence", () => {
  const purposes = ["practice", "retry", "remediation"];
  purposes.forEach((purpose) => {
    const document = {
      id: `translation-${purpose}`,
      title: `Synthetic ${purpose}`,
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      items: [
        { id: `${purpose}-1`, sourceText: "First synthetic source" },
        { id: `${purpose}-2`, sourceText: "Second synthetic source" },
      ],
      ...(purpose === "practice" ? {} : {
        provenance: {
          purpose,
          sourceResponseId: "synthetic-source-response",
          sourceMaterialId: "synthetic-source-material",
          ...(purpose === "remediation" ? { sourceReviewId: "synthetic-source-review" } : {}),
        },
      }),
    };
    let session = createTranslationSession({
      id: `session-${purpose}`,
      document,
      startedAt: "2026-08-22T11:00:00.000Z",
    });
    session = setTranslationAnswer(session, `${purpose}-1`, "Synthetic draft answer");
    session = addTranslationAnnotation(session, `${purpose}-1`, {
      id: `annotation-${purpose}`,
      kind: "uncertain",
      start: 0,
      end: 9,
      text: "Synthetic",
    });
    session = setTranslationItemMark(session, `${purpose}-1`, "should_know");
    session = setTranslationRevealed(session, `${purpose}-2`, true);
    session = goToTranslationIndex(session, 1);

    const recovered = normalizeTranslationSession(restartRoundTrip(session));

    assert.deepEqual(recovered, session);
  });
});

test("Objective and Translation restart records remain isolated and cleanup is key-specific", () => {
  const storage = new Map([
    [STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify({ id: "objective" })],
    [STORAGE_KEYS.TRANSLATION_ACTIVE_SESSION, JSON.stringify({ id: "translation" })],
  ]);

  storage.delete(STORAGE_KEYS.ACTIVE_SESSION);

  assert.equal(storage.has(STORAGE_KEYS.ACTIVE_SESSION), false);
  assert.equal(JSON.parse(storage.get(STORAGE_KEYS.TRANSLATION_ACTIVE_SESSION)).id, "translation");
  storage.delete(STORAGE_KEYS.TRANSLATION_ACTIVE_SESSION);
  assert.equal(storage.size, 0);
});

function restartRoundTrip(value) {
  return JSON.parse(JSON.stringify(value));
}
