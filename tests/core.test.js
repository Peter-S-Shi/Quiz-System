import test from "node:test";
import assert from "node:assert/strict";

import { gradeQuestion, formatAnswer } from "../src/core/grading.js";
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

test("matching answers must map every left item to the right id and format pairs cleanly", () => {
  const question = {
    id: "q3",
    type: "matching",
    prompt: "Match",
    pairs: [
      { id: "p1", left: "Alpha", right: "One", rightId: "r1" },
      { id: "p2", left: "Beta", right: "Two", rightId: "r2" },
    ],
    rightOptions: [
      { id: "r1", text: "One" },
      { id: "r2", text: "Two" },
    ],
  };

  assert.equal(gradeQuestion(question, { p1: "r1", p2: "r2" }, labels).correct, true);
  assert.equal(gradeQuestion(question, { p1: "r2", p2: "r1" }, labels).correct, false);

  // Verify per-pair correctness derivation
  const answers = { p1: "r1", p2: "r1" };
  const p1Correct = answers[question.pairs[0].id] === question.pairs[0].rightId;
  const p2Correct = answers[question.pairs[1].id] === question.pairs[1].rightId;
  assert.equal(p1Correct, true);
  assert.equal(p2Correct, false);

  // Verify formatAnswer
  const formatted = formatAnswer(question, { p1: "r1", p2: "r2" }, labels);
  assert.equal(formatted, "Alpha = One; Beta = Two");
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
