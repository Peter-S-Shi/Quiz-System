import { isAnswerComplete } from "./question-registry.js";
import { normalizeText } from "./utils.js";

export function gradeQuestion(question, answer, labels) {
  if (question.type === "single") {
    const correctId = question.options.find((option) => option.correct)?.id;
    const correctText = question.options.find((option) => option.id === correctId)?.text || "";
    return makeResult(question, answer === correctId, labels.correctAnswer, correctText);
  }

  if (question.type === "multiple") {
    const correctIds = question.options.filter((option) => option.correct).map((option) => option.id).sort();
    const answerIds = Array.isArray(answer) ? [...answer].sort() : [];
    const correct = JSON.stringify(correctIds) === JSON.stringify(answerIds);
    const correctText = question.options.filter((option) => option.correct).map((option) => option.text).join(labels.separator);
    return makeResult(question, correct, labels.correctAnswer, correctText);
  }

  if (question.type === "blank") {
    const normalizedAnswer = normalizeText(answer || "", question.caseSensitive);
    const accepted = question.answers.map((item) => normalizeText(item, question.caseSensitive));
    return makeResult(question, accepted.includes(normalizedAnswer), labels.acceptedAnswers, question.answers.join(labels.separator));
  }

  if (question.type === "truefalse") {
    return makeResult(question, answer === question.answer, labels.correctAnswer, question.answer ? labels.trueLabel : labels.falseLabel);
  }

  const answerMap = answer || {};
  const correct = question.pairs.every((pair) => answerMap[pair.id] === pair.rightId);
  const correctPairs = question.pairs.map((pair) => `${pair.left} = ${pair.right}`).join(labels.pairSeparator);
  return makeResult(question, correct, labels.correctPairs, correctPairs);
}

export function formatAnswer(question, answer, labels) {
  if (!isAnswerComplete(question, answer)) return "";
  if (question.type === "single") return question.options.find((option) => option.id === answer)?.text || "";
  if (question.type === "multiple") return question.options.filter((option) => answer.includes(option.id)).map((option) => option.text).join(labels.separator);
  if (question.type === "blank") return answer;
  if (question.type === "truefalse") return answer ? labels.trueLabel : labels.falseLabel;
  return question.pairs.map((pair) => {
    const selected = question.rightOptions.find((option) => option.id === answer[pair.id])?.text || "";
    return `${pair.left} = ${selected}`;
  }).join(labels.pairSeparator);
}

function makeResult(question, correct, correctLabel, correctAnswer) {
  return {
    questionId: question.sourceId || question.id,
    sessionQuestionId: question.id,
    type: question.type,
    prompt: question.prompt,
    correct,
    correctLabel,
    correctAnswer,
  };
}
