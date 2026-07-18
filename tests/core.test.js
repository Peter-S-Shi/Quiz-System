import test from "node:test";
import assert from "node:assert/strict";

import { gradeQuestion } from "../src/core/grading.js";
import { createQuestion, isAnswerComplete, isQuestionReady, normalizeQuestion } from "../src/core/question-registry.js";
import { normalizeLibrary, normalizePaper } from "../src/core/migrations.js";

const labels = {
  correctAnswer: "Correct answer",
  acceptedAnswers: "Accepted answers",
  correctPairs: "Correct pairs",
  separator: ", ",
  pairSeparator: "; ",
  trueLabel: "True",
  falseLabel: "False",
};

test("single-choice questions grade by correct option id", () => {
  const question = {
    id: "q1",
    type: "single",
    prompt: "Pick one",
    options: [
      { id: "a", text: "A", correct: false },
      { id: "b", text: "B", correct: true },
    ],
  };

  assert.equal(gradeQuestion(question, "b", labels).correct, true);
  assert.equal(gradeQuestion(question, "a", labels).correct, false);
});

test("blank questions respect case-insensitive answers by default", () => {
  const question = {
    id: "q2",
    type: "blank",
    prompt: "Fill",
    answers: ["Quiz"],
    caseSensitive: false,
  };

  assert.equal(gradeQuestion(question, "quiz", labels).correct, true);
});

test("matching answers must map every left item to the right id", () => {
  const question = {
    id: "q3",
    type: "matching",
    prompt: "Match",
    pairs: [
      { id: "p1", left: "A", right: "One", rightId: "p1" },
      { id: "p2", left: "B", right: "Two", rightId: "p2" },
    ],
  };

  assert.equal(gradeQuestion(question, { p1: "p1", p2: "p2" }, labels).correct, true);
  assert.equal(gradeQuestion(question, { p1: "p2", p2: "p1" }, labels).correct, false);
});

test("question readiness and answer completeness are separated", () => {
  const question = createQuestion("single");
  question.prompt = "Ready?";
  question.options[0].text = "Yes";
  question.options[1].text = "No";

  assert.equal(isQuestionReady(question), true);
  assert.equal(isAnswerComplete(question, question.options[0].id), true);
  assert.equal(isAnswerComplete(question, ""), false);
});

test("normalization adds schema version and safe defaults", () => {
  const paper = normalizePaper({ title: "Demo", questions: [{ type: "blank", prompt: "A", answers: ["B"] }] });
  assert.equal(paper.schemaVersion, 1);
  assert.equal(paper.questions[0].type, "blank");

  const library = normalizeLibrary({ papers: [paper] });
  assert.equal(library.schemaVersion, 1);
  assert.equal(library.papers.length, 1);
});

test("invalid question types normalize to single choice", () => {
  const question = normalizeQuestion({ type: "unknown", prompt: "Fallback" });
  assert.equal(question.type, "single");
  assert.equal(question.options.length, 4);
});
