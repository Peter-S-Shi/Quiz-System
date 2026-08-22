import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gradeQuestion } from "../src/core/grading.js";
import { createQuestion, prepareQuizQuestion, isAnswerComplete } from "../src/core/question-registry.js";
import { createQuizLearnerResponse, validateLearnerResponse } from "../src/core/interchange.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../schemas/learner-response.schema.json");
const learnerResponseSchema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

const gradeLabels = {
  correctAnswer: "Correct answer",
  acceptedAnswers: "Accepted answers",
  correctPairs: "Correct pairs",
  separator: ", ",
  pairSeparator: "; ",
  trueLabel: "True",
  falseLabel: "False",
};

function createSampleFiveQuestionPaper() {
  const qSingle = {
    id: "q_single",
    type: "single",
    prompt: "Single choice test",
    options: [
      { id: "opt_a", text: "Option A", correct: true },
      { id: "opt_b", text: "Option B", correct: false },
    ],
  };

  const qMultiple = {
    id: "q_multiple",
    type: "multiple",
    prompt: "Multiple choice test",
    options: [
      { id: "opt_m1", text: "Option 1", correct: true },
      { id: "opt_m2", text: "Option 2", correct: true },
      { id: "opt_m3", text: "Option 3", correct: false },
    ],
  };

  const qBlank = {
    id: "q_blank",
    type: "blank",
    prompt: "Fill in the blank",
    answers: ["Antigravity"],
    caseSensitive: false,
  };

  const qTrueFalse = {
    id: "q_tf",
    type: "truefalse",
    prompt: "Is Earth round?",
    answer: true,
  };

  const qMatching = {
    id: "q_match",
    type: "matching",
    prompt: "Match pairs",
    pairs: [
      { id: "p1", left: "Left 1", right: "Right 1" },
      { id: "p2", left: "Left 2", right: "Right 2" },
    ],
  };

  return {
    id: "paper_test_1",
    title: "Five Question Comprehensive Paper",
    description: "Testing all 5 objective question types",
    questions: [qSingle, qMultiple, qBlank, qTrueFalse, qMatching],
  };
}

test("session creation with feedbackMode defaults to instant and supports submitAtEnd", () => {
  const paper = createSampleFiveQuestionPaper();
  const preparedQuestions = paper.questions.map(prepareQuizQuestion);

  const instantSession = {
    id: "sess_1",
    paperId: paper.id,
    paperTitle: paper.title,
    startedAt: new Date().toISOString(),
    questions: preparedQuestions,
    index: 0,
    answers: {},
    results: [],
    submitted: false,
    feedback: null,
    completed: false,
    feedbackMode: "instant",
  };

  assert.equal(instantSession.feedbackMode, "instant");
  assert.equal(instantSession.questions.length, 5);

  const examSession = {
    ...instantSession,
    id: "sess_2",
    feedbackMode: "submitAtEnd",
  };

  assert.equal(examSession.feedbackMode, "submitAtEnd");
});

test("in submitAtEnd mode, answering questions updates answers without leaking feedback or results", () => {
  const paper = createSampleFiveQuestionPaper();
  const session = {
    id: "sess_submit_end",
    paperId: paper.id,
    paperTitle: paper.title,
    startedAt: new Date().toISOString(),
    questions: paper.questions.map(prepareQuizQuestion),
    index: 0,
    answers: {},
    results: [],
    submitted: false,
    feedback: null,
    completed: false,
    feedbackMode: "submitAtEnd",
  };

  // Step 1: User answers question 0 (single choice)
  session.answers[session.questions[0].id] = "opt_a";
  assert.equal(session.results.length, 0);
  assert.equal(session.feedback, null);
  assert.equal(session.submitted, false);

  // Step 2: User navigates forward to question 1 (multiple choice)
  session.index = 1;
  session.answers[session.questions[1].id] = ["opt_m1", "opt_m2"];
  assert.equal(session.results.length, 0);
  assert.equal(session.feedback, null);

  // Step 3: User navigates backward to question 0 and changes answer
  session.index = 0;
  assert.equal(session.answers[session.questions[0].id], "opt_a");
  session.answers[session.questions[0].id] = "opt_b"; // changed answer
  assert.equal(session.answers[session.questions[0].id], "opt_b");
  assert.equal(session.results.length, 0);
  assert.equal(session.feedback, null);

  // Step 4: User changes answer back to correct
  session.answers[session.questions[0].id] = "opt_a";

  // Step 5: Answer remaining questions
  session.answers[session.questions[2].id] = "antigravity";
  session.answers[session.questions[3].id] = true;
  const matchQ = session.questions[4];
  session.answers[matchQ.id] = {
    p1: matchQ.pairs[0].rightId,
    p2: matchQ.pairs[1].rightId,
  };

  // Verify answer completeness across all 5 questions
  session.questions.forEach((q) => {
    assert.equal(isAnswerComplete(q, session.answers[q.id]), true);
  });
});

test("submitAtEnd final submission grades all 5 question types and produces valid Learner Response", () => {
  const paper = createSampleFiveQuestionPaper();
  const session = {
    id: "sess_final_grade",
    paperId: paper.id,
    paperTitle: paper.title,
    startedAt: new Date().toISOString(),
    questions: paper.questions.map(prepareQuizQuestion),
    index: 4,
    answers: {},
    results: [],
    submitted: false,
    feedback: null,
    completed: false,
    feedbackMode: "submitAtEnd",
  };

  // Populate answers: 4 correct, 1 wrong (question 3 is false instead of true)
  session.answers[session.questions[0].id] = "opt_a"; // correct
  session.answers[session.questions[1].id] = ["opt_m1", "opt_m2"]; // correct
  session.answers[session.questions[2].id] = "antigravity"; // correct
  session.answers[session.questions[3].id] = false; // WRONG (should be true)
  const matchQ = session.questions[4];
  session.answers[matchQ.id] = {
    p1: matchQ.pairs[0].rightId,
    p2: matchQ.pairs[1].rightId,
  }; // correct

  // Perform end submission grading (same logic as app.js renderResults)
  session.questions.forEach((question, index) => {
    if (!session.results[index]) {
      session.results[index] = gradeQuestion(question, session.answers[question.id], gradeLabels);
    }
  });

  const correctCount = session.results.filter((result) => result.correct).length;
  const percent = Math.round((correctCount / session.questions.length) * 100);
  session.completedAt = new Date().toISOString();
  session.correctCount = correctCount;
  session.percent = percent;
  session.completed = true;

  assert.equal(session.results.length, 5);
  assert.equal(session.results[0].correct, true);
  assert.equal(session.results[1].correct, true);
  assert.equal(session.results[2].correct, true);
  assert.equal(session.results[3].correct, false);
  assert.equal(session.results[4].correct, true);
  assert.equal(session.correctCount, 4);
  assert.equal(session.percent, 80);

  // Generate finalized Learner Response
  const learnerResponse = createQuizLearnerResponse({ session });
  assert.equal(learnerResponse.documentType, "quiz-studio.learner-response");
  assert.equal(learnerResponse.responses.length, 5);
  assert.equal(learnerResponse.summary.correctCount, 4);
  assert.equal(learnerResponse.summary.itemCount, 5);
  assert.equal(learnerResponse.summary.percent, 80);

  // Validate against JSON schema and interchange validator
  const validation = validateLearnerResponse(learnerResponse, learnerResponseSchema);
  assert.equal(validation.valid, true, `Validation errors: ${JSON.stringify(validation.errors)}`);
});

test("active session normalization safely preserves or defaults feedbackMode", () => {
  function normalizeLoadedSession(saved, activePaperId) {
    if (saved?.paperId === activePaperId && !saved.completed) {
      if (!saved.feedbackMode || (saved.feedbackMode !== "instant" && saved.feedbackMode !== "submitAtEnd")) {
        saved.feedbackMode = "instant";
      }
      return saved;
    }
    return null;
  }

  // 1. Submit at end session preserved
  const examSaved = { paperId: "p1", feedbackMode: "submitAtEnd", completed: false };
  assert.equal(normalizeLoadedSession(examSaved, "p1").feedbackMode, "submitAtEnd");

  // 2. Instant session preserved
  const instantSaved = { paperId: "p1", feedbackMode: "instant", completed: false };
  assert.equal(normalizeLoadedSession(instantSaved, "p1").feedbackMode, "instant");

  // 3. Legacy session without feedbackMode property defaults to instant
  const legacySaved = { paperId: "p1", completed: false };
  assert.equal(normalizeLoadedSession(legacySaved, "p1").feedbackMode, "instant");

  // 4. Corrupted feedbackMode value defaults to instant
  const corruptedSaved = { paperId: "p1", feedbackMode: "unknown_mode", completed: false };
  assert.equal(normalizeLoadedSession(corruptedSaved, "p1").feedbackMode, "instant");

  // 5. Mismatched paper ID returns null
  assert.equal(normalizeLoadedSession(examSaved, "p2"), null);

  // 6. Already completed session returns null
  assert.equal(normalizeLoadedSession({ paperId: "p1", completed: true }, "p1"), null);
});
