import { makeId } from "./utils.js";

export const CORRECTION_OPERATIONS = ["style", "insert", "replace", "delete", "comment"];
export const STYLE_TYPES = ["bold", "italic", "underline", "strikethrough", "highlight", "bracket", "color"];
export const CORRECTION_COLORS = ["red", "blue", "green", "purple", "orange", "teal", "brown"];
const EDIT_OPERATIONS = new Set(["insert", "replace", "delete"]);

export function validateColor(value) {
  return CORRECTION_COLORS.includes(value);
}

export function createCorrection({
  id = makeId(),
  operation,
  start,
  end,
  anchoredText,
  text,
  styleType,
  color,
  createdAt = new Date().toISOString(),
}) {
  const correction = { id, operation, start, end, anchoredText, createdAt };
  if (typeof text === "string") correction.text = text;
  if (typeof styleType === "string") correction.styleType = styleType;
  if (typeof color === "string") correction.color = color;
  return correction;
}

export function validateCorrection(correction, answerText) {
  const errors = [];
  if (!isPlainObject(correction)) return invalid("Correction must be an object.");
  if (!nonEmptyString(correction.id)) errors.push("Correction id is required.");
  if (!CORRECTION_OPERATIONS.includes(correction.operation)) errors.push(`Invalid correction operation: ${correction.operation}`);
  if (!Number.isInteger(correction.start) || correction.start < 0) errors.push("Correction start must be a non-negative integer.");
  if (!Number.isInteger(correction.end) || correction.end < correction.start) errors.push("Correction end must be an integer no smaller than start.");
  if (!nonEmptyString(correction.createdAt)) errors.push("Correction createdAt is required.");

  const isInsert = correction.operation === "insert";
  if (isInsert && correction.start !== correction.end) errors.push("Insert corrections must anchor to a single caret position (start === end).");
  if (!isInsert && correction.operation !== undefined && correction.end === correction.start
    && CORRECTION_OPERATIONS.includes(correction.operation)) {
    errors.push("Only insert corrections may anchor to a zero-length position.");
  }

  if (typeof correction.anchoredText !== "string") errors.push("Correction anchoredText is required.");
  if (
    typeof answerText === "string"
    && Number.isInteger(correction.start)
    && Number.isInteger(correction.end)
    && typeof correction.anchoredText === "string"
  ) {
    if (correction.end > answerText.length) errors.push("Correction end exceeds the answer length.");
    else if (answerText.slice(correction.start, correction.end) !== correction.anchoredText) {
      errors.push("Correction anchoredText does not match the anchored answer span.");
    }
  }

  if (correction.operation === "style") {
    if (!STYLE_TYPES.includes(correction.styleType)) errors.push(`Invalid correction styleType: ${correction.styleType}`);
    if (correction.styleType === "color" && !validateColor(correction.color)) errors.push(`Invalid correction color: ${correction.color}`);
  } else if (correction.operation === "insert" || correction.operation === "replace") {
    if (typeof correction.text !== "string" || !correction.text.length) errors.push(`Correction text is required for a ${correction.operation} operation.`);
    if (correction.color !== undefined && !validateColor(correction.color)) errors.push(`Invalid correction color: ${correction.color}`);
  } else if (correction.operation === "comment") {
    if (typeof correction.text !== "string" || !correction.text.length) errors.push("Correction text (comment body) is required for a comment operation.");
  }

  return { valid: errors.length === 0, errors };
}

export function correctionsConflict(a, b) {
  if (!EDIT_OPERATIONS.has(a.operation) || !EDIT_OPERATIONS.has(b.operation)) return false;
  const aIsInsert = a.start === a.end;
  const bIsInsert = b.start === b.end;
  if (aIsInsert && bIsInsert) return a.start === b.start;
  if (aIsInsert) return a.start >= b.start && a.start <= b.end;
  if (bIsInsert) return b.start >= a.start && b.start <= a.end;
  return a.start < b.end && b.start < a.end;
}

export function addCorrection(existing, draft, answerText) {
  const correction = createCorrection(draft);
  const validation = validateCorrection(correction, answerText);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));

  const list = Array.isArray(existing) ? existing : [];
  if (list.some((item) => item.id === correction.id)) {
    throw new TypeError(`Duplicate correction id: ${correction.id}`);
  }
  if (EDIT_OPERATIONS.has(correction.operation) && list.some((item) => correctionsConflict(item, correction))) {
    throw new TypeError("This correction conflicts with an existing content-changing correction on an overlapping span. Remove or adjust the existing correction first.");
  }
  return [...list, correction];
}

export function removeCorrection(existing, correctionId) {
  return (Array.isArray(existing) ? existing : []).filter((item) => item.id !== correctionId);
}

export function renderCorrectionProjection(answerText, corrections) {
  const list = Array.isArray(corrections) ? corrections : [];
  const editOps = list
    .filter((item) => EDIT_OPERATIONS.has(item.operation))
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const styleOps = list.filter((item) => item.operation === "style");
  const commentOps = list.filter((item) => item.operation === "comment");

  const segments = [];
  let cursor = 0;

  editOps.forEach((edit) => {
    if (edit.start > cursor) {
      segments.push(...renderPlainRun(answerText, cursor, edit.start, styleOps, commentOps));
    }
    if (edit.operation === "delete") {
      segments.push({ type: "deleted", text: answerText.slice(edit.start, edit.end) });
      cursor = edit.end;
    } else if (edit.operation === "replace") {
      segments.push({ type: "replaced-original", text: answerText.slice(edit.start, edit.end) });
      segments.push({ type: "inserted", text: edit.text, color: edit.color });
      cursor = edit.end;
    } else if (edit.operation === "insert") {
      segments.push({ type: "inserted", text: edit.text, color: edit.color });
      cursor = edit.start;
    }
  });

  if (cursor < answerText.length) {
    segments.push(...renderPlainRun(answerText, cursor, answerText.length, styleOps, commentOps));
  }

  return segments;
}

function renderPlainRun(answerText, from, to, styleOps, commentOps) {
  const breakpoints = new Set([from, to]);
  styleOps.forEach((style) => {
    if (style.start >= from && style.start <= to) breakpoints.add(style.start);
    if (style.end >= from && style.end <= to) breakpoints.add(style.end);
  });
  commentOps.forEach((comment) => {
    if (comment.start >= from && comment.start <= to) breakpoints.add(comment.start);
    if (comment.end >= from && comment.end <= to) breakpoints.add(comment.end);
  });
  const points = Array.from(breakpoints).sort((a, b) => a - b);

  const runs = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p = points[index];
    const q = points[index + 1];
    if (p >= q) continue;
    const styles = styleOps
      .filter((style) => style.start <= p && style.end >= q)
      .map((style) => (style.styleType === "color" ? { styleType: "color", color: style.color } : { styleType: style.styleType }));
    const comments = commentOps
      .filter((comment) => comment.start <= p && comment.end >= q)
      .map((comment) => comment.text);
    runs.push({ type: "text", text: answerText.slice(p, q), styles, comments });
  }
  return runs;
}

function invalid(message) {
  return { valid: false, errors: [message] };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
