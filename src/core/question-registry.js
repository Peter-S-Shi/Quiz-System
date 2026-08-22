import { makeId, shuffle } from "./utils.js";
import { normalizeImageMetadata, normalizeAudioMetadata } from "./media-types.js";

export const QUESTION_TYPES = ["single", "multiple", "blank", "truefalse", "matching"];

export const QUESTION_TYPE_REGISTRY = {
  single: {
    create() {
      return {
        options: [
          { id: makeId(), text: "", correct: true },
          { id: makeId(), text: "", correct: false },
          { id: makeId(), text: "", correct: false },
          { id: makeId(), text: "", correct: false },
        ],
      };
    },
  },
  multiple: {
    create() {
      return {
        options: [
          { id: makeId(), text: "", correct: true },
          { id: makeId(), text: "", correct: true },
          { id: makeId(), text: "", correct: false },
          { id: makeId(), text: "", correct: false },
        ],
      };
    },
  },
  blank: {
    create() {
      return { answers: [""], caseSensitive: false };
    },
  },
  truefalse: {
    create() {
      return { answer: true };
    },
  },
  matching: {
    create() {
      return {
        pairs: [
          { id: makeId(), left: "", right: "" },
          { id: makeId(), left: "", right: "" },
        ],
      };
    },
  },
};

export function createQuestion(type) {
  const safeType = QUESTION_TYPES.includes(type) ? type : "single";
  return {
    id: makeId(),
    type: safeType,
    prompt: "",
    ...QUESTION_TYPE_REGISTRY[safeType].create(),
  };
}

export function convertQuestionType(question, nextType) {
  const savedImage = question.image;
  const savedAudio = question.audio;
  const replacement = createQuestion(nextType);
  question.type = replacement.type;

  delete question.options;
  delete question.answers;
  delete question.caseSensitive;
  delete question.answer;
  delete question.pairs;

  Object.entries(replacement).forEach(([key, value]) => {
    if (key !== "id" && key !== "type" && key !== "prompt") question[key] = value;
  });

  if (savedImage) question.image = savedImage;
  if (savedAudio) question.audio = savedAudio;
}

export function ensureChoiceValidity(question) {
  if (!question.options?.length) return;
  if (question.type === "single") {
    const selected = question.options.filter((option) => option.correct);
    question.options.forEach((option, index) => {
      option.correct = selected.length ? option.id === selected[0].id : index === 0;
    });
  }
}

export function normalizeQuestion(question = {}) {
  const type = QUESTION_TYPES.includes(question.type) ? question.type : "single";
  const normalized = {
    ...question,
    id: question.id || makeId(),
    type,
    prompt: question.prompt || "",
  };

  // Image & Audio normalization
  const image = normalizeImageMetadata(question.image);
  if (image) normalized.image = image;
  else delete normalized.image;

  const audio = normalizeAudioMetadata(question.audio);
  if (audio) normalized.audio = audio;
  else delete normalized.audio;

  if (type === "single" || type === "multiple") {
    normalized.options = Array.isArray(question.options) ? question.options.map((option) => ({
      id: option.id || makeId(),
      text: option.text || "",
      correct: Boolean(option.correct),
    })) : createQuestion(type).options;
    ensureChoiceValidity(normalized);
  }

  if (type === "blank") {
    normalized.answers = Array.isArray(question.answers) ? question.answers : [];
    normalized.caseSensitive = Boolean(question.caseSensitive);
  }

  if (type === "truefalse") normalized.answer = Boolean(question.answer);

  if (type === "matching") {
    normalized.pairs = Array.isArray(question.pairs) ? question.pairs.map((pair) => ({
      id: pair.id || makeId(),
      left: pair.left || "",
      right: pair.right || "",
    })) : createQuestion("matching").pairs;
  }

  return normalized;
}

export function isQuestionReady(question) {
  if (!question?.prompt?.trim()) return false;
  if (question.type === "single") return question.options.length >= 2 && question.options.some((option) => option.correct && option.text.trim());
  if (question.type === "multiple") return question.options.length >= 2 && question.options.filter((option) => option.correct && option.text.trim()).length >= 1;
  if (question.type === "blank") return question.answers?.some(Boolean);
  if (question.type === "truefalse") return typeof question.answer === "boolean";
  if (question.type === "matching") return question.pairs?.length >= 2 && question.pairs.every((pair) => pair.left.trim() && pair.right.trim());
  return false;
}

export function isAnswerComplete(question, answer) {
  if (question.type === "single") return Boolean(answer);
  if (question.type === "multiple") return Array.isArray(answer) && answer.length > 0;
  if (question.type === "blank") return Boolean(String(answer || "").trim());
  if (question.type === "truefalse") return typeof answer === "boolean";
  if (question.type === "matching") return question.pairs.every((pair) => answer?.[pair.id]);
  return false;
}

export function prepareQuizQuestion(question) {
  const cloned = structuredClone(question);
  cloned.sourceId = question.id;

  if (cloned.type === "single" || cloned.type === "multiple") {
    cloned.options = shuffle(cloned.options);
  }

  if (cloned.type === "matching") {
    cloned.pairs = cloned.pairs.map((pair) => ({
      id: pair.id,
      left: pair.left,
      right: pair.right,
      rightId: pair.id,
    }));
    cloned.rightOptions = shuffle(cloned.pairs.map((pair) => ({
      id: pair.id,
      text: pair.right,
    })));
  }

  return cloned;
}

export function cloneQuestion(question) {
  const copy = structuredClone(question);
  copy.id = makeId();
  if (copy.options) copy.options = copy.options.map((option) => ({ ...option, id: makeId() }));
  if (copy.pairs) copy.pairs = copy.pairs.map((pair) => ({ ...pair, id: makeId() }));
  return copy;
}

export function clonePaperForLibrary(source) {
  const now = new Date().toISOString();
  return {
    ...structuredClone(source),
    id: makeId(),
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    questions: source.questions.map(cloneQuestion),
  };
}
