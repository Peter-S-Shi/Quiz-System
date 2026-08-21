import test from "node:test";
import assert from "node:assert/strict";

import {
  CORRECTION_COLORS,
  STYLE_TYPES,
  addCorrection,
  correctionsConflict,
  createCorrection,
  removeCorrection,
  renderCorrectionProjection,
  validateColor,
  validateCorrection,
} from "../src/core/corrections.js";

const ANSWER = "The quick brown fox jumps";

test("every style type validates against a matching answer span", () => {
  STYLE_TYPES.filter((type) => type !== "color").forEach((styleType) => {
    const correction = createCorrection({ operation: "style", styleType, start: 4, end: 9, anchoredText: "quick", createdAt: "t" });
    assert.deepEqual(validateCorrection(correction, ANSWER), { valid: true, errors: [] });
  });
});

test("color style corrections require a validated color", () => {
  const valid = createCorrection({ operation: "style", styleType: "color", color: "purple", start: 4, end: 9, anchoredText: "quick", createdAt: "t" });
  assert.equal(validateCorrection(valid, ANSWER).valid, true);

  const invalid = createCorrection({ operation: "style", styleType: "color", color: "not-a-color", start: 4, end: 9, anchoredText: "quick", createdAt: "t" });
  const result = validateCorrection(invalid, ANSWER);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Invalid correction color/);
  CORRECTION_COLORS.forEach((color) => assert.equal(validateColor(color), true));
  assert.equal(validateColor("javascript:alert(1)"), false);
});

test("insert corrections anchor to a caret position and require inserted text", () => {
  const validInsert = createCorrection({ operation: "insert", start: 9, end: 9, anchoredText: "", text: "-ly", createdAt: "t" });
  assert.deepEqual(validateCorrection(validInsert, ANSWER), { valid: true, errors: [] });

  const wrongRange = createCorrection({ operation: "insert", start: 4, end: 9, anchoredText: "quick", text: "-ly", createdAt: "t" });
  assert.equal(validateCorrection(wrongRange, ANSWER).valid, false);

  const missingText = createCorrection({ operation: "insert", start: 9, end: 9, anchoredText: "", createdAt: "t" });
  assert.equal(validateCorrection(missingText, ANSWER).valid, false);
});

test("replace corrections require a real span and replacement text", () => {
  const valid = createCorrection({ operation: "replace", start: 4, end: 9, anchoredText: "quick", text: "swift", createdAt: "t" });
  assert.deepEqual(validateCorrection(valid, ANSWER), { valid: true, errors: [] });

  const zeroLength = createCorrection({ operation: "replace", start: 4, end: 4, anchoredText: "", text: "swift", createdAt: "t" });
  assert.equal(validateCorrection(zeroLength, ANSWER).valid, false);

  const missingText = createCorrection({ operation: "replace", start: 4, end: 9, anchoredText: "quick", createdAt: "t" });
  assert.equal(validateCorrection(missingText, ANSWER).valid, false);
});

test("delete corrections mark a real span as struck without requiring inserted text", () => {
  const correction = createCorrection({ operation: "delete", start: 4, end: 9, anchoredText: "quick", createdAt: "t" });
  assert.deepEqual(validateCorrection(correction, ANSWER), { valid: true, errors: [] });
});

test("comment corrections require comment text anchored to a span", () => {
  const valid = createCorrection({ operation: "comment", start: 10, end: 15, anchoredText: "brown", text: "Wrong shade.", createdAt: "t" });
  assert.deepEqual(validateCorrection(valid, ANSWER), { valid: true, errors: [] });

  const missingText = createCorrection({ operation: "comment", start: 10, end: 15, anchoredText: "brown", createdAt: "t" });
  assert.equal(validateCorrection(missingText, ANSWER).valid, false);
});

test("validateCorrection rejects anchored text mismatch and out-of-range spans", () => {
  const mismatched = createCorrection({ operation: "delete", start: 4, end: 9, anchoredText: "WRONG", createdAt: "t" });
  const mismatchResult = validateCorrection(mismatched, ANSWER);
  assert.equal(mismatchResult.valid, false);
  assert.match(mismatchResult.errors.join(" "), /does not match the anchored answer span/);

  const outOfRange = createCorrection({ operation: "delete", start: 4, end: 999, anchoredText: "quick", createdAt: "t" });
  assert.equal(validateCorrection(outOfRange, ANSWER).valid, false);
});

test("validateCorrection rejects unknown operations and invalid style types", () => {
  const unknownOp = createCorrection({ operation: "rewrite-everything", start: 4, end: 9, anchoredText: "quick", createdAt: "t" });
  assert.equal(validateCorrection(unknownOp, ANSWER).valid, false);

  const unknownStyle = createCorrection({ operation: "style", styleType: "sparkle", start: 4, end: 9, anchoredText: "quick", createdAt: "t" });
  assert.equal(validateCorrection(unknownStyle, ANSWER).valid, false);
});

test("addCorrection allows orthogonal presentation styles to overlap the same span", () => {
  let list = addCorrection([], { operation: "style", styleType: "bold", start: 4, end: 19, anchoredText: "quick brown fox" }, ANSWER);
  list = addCorrection(list, { operation: "style", styleType: "underline", start: 4, end: 19, anchoredText: "quick brown fox" }, ANSWER);
  list = addCorrection(list, { operation: "style", styleType: "highlight", start: 10, end: 15, anchoredText: "brown" }, ANSWER);
  assert.equal(list.length, 3);
});

test("addCorrection rejects conflicting content-changing operations over overlapping spans", () => {
  const list = addCorrection([], { operation: "replace", start: 4, end: 19, anchoredText: "quick brown fox", text: "swift animal" }, ANSWER);
  assert.throws(
    () => addCorrection(list, { operation: "delete", start: 10, end: 15, anchoredText: "brown" }, ANSWER),
    /conflicts with an existing content-changing correction/,
  );
});

test("addCorrection allows a style to overlap a content-changing operation on the same span", () => {
  let list = addCorrection([], { operation: "replace", start: 4, end: 19, anchoredText: "quick brown fox", text: "swift animal" }, ANSWER);
  list = addCorrection(list, { operation: "style", styleType: "highlight", start: 4, end: 19, anchoredText: "quick brown fox" }, ANSWER);
  assert.equal(list.length, 2);
});

test("addCorrection rejects two inserts at the same caret position", () => {
  const list = addCorrection([], { operation: "insert", start: 9, end: 9, anchoredText: "", text: "-ly" }, ANSWER);
  assert.throws(() => addCorrection(list, { operation: "insert", start: 9, end: 9, anchoredText: "", text: "-est" }, ANSWER), /conflicts/);
});

test("addCorrection rejects a duplicate correction id", () => {
  const list = addCorrection([], { id: "c1", operation: "style", styleType: "bold", start: 0, end: 3, anchoredText: "The" }, ANSWER);
  assert.throws(() => addCorrection(list, { id: "c1", operation: "style", styleType: "italic", start: 20, end: 25, anchoredText: "jumps" }, ANSWER), /Duplicate correction id/);
});

test("removeCorrection removes only the targeted entry", () => {
  let list = addCorrection([], { id: "c1", operation: "style", styleType: "bold", start: 0, end: 3, anchoredText: "The" }, ANSWER);
  list = addCorrection(list, { id: "c2", operation: "style", styleType: "italic", start: 20, end: 25, anchoredText: "jumps" }, ANSWER);
  const removed = removeCorrection(list, "c1");
  assert.equal(removed.length, 1);
  assert.equal(removed[0].id, "c2");
});

test("correctionsConflict never flags style or comment operations against each other", () => {
  const style = createCorrection({ operation: "style", styleType: "bold", start: 0, end: 5, anchoredText: "Hello", createdAt: "t" });
  const comment = createCorrection({ operation: "comment", start: 0, end: 5, anchoredText: "Hello", text: "note", createdAt: "t" });
  assert.equal(correctionsConflict(style, comment), false);
});

test("HTML-like reviewer text is preserved verbatim as plain data, never escaped or executed at the data layer", () => {
  const dangerous = "<script>alert('x')</script> & \" '";
  const list = addCorrection([], { operation: "comment", start: 0, end: 3, anchoredText: "The", text: dangerous }, ANSWER);
  assert.equal(list[0].text, dangerous);
});

test("renderCorrectionProjection produces deterministic segments for style, insert, replace, and delete", () => {
  const corrections = [
    createCorrection({ id: "s1", operation: "style", styleType: "bold", start: 0, end: 3, anchoredText: "The", createdAt: "t" }),
    createCorrection({ id: "i1", operation: "insert", start: 9, end: 9, anchoredText: "", text: "-ly", color: "blue", createdAt: "t" }),
    createCorrection({ id: "r1", operation: "replace", start: 10, end: 15, anchoredText: "brown", text: "auburn", color: "red", createdAt: "t" }),
    createCorrection({ id: "d1", operation: "delete", start: 20, end: 25, anchoredText: "jumps", createdAt: "t" }),
  ];
  const segments = renderCorrectionProjection(ANSWER, corrections);

  assert.deepEqual(segments[0], { type: "text", text: "The", styles: [{ styleType: "bold" }], comments: [] });
  const insertSegment = segments.find((segment) => segment.type === "inserted" && segment.text === "-ly");
  assert.equal(insertSegment.color, "blue");
  const deletedOriginal = segments.find((segment) => segment.type === "replaced-original");
  assert.equal(deletedOriginal.text, "brown");
  const replacement = segments.find((segment) => segment.type === "inserted" && segment.text === "auburn");
  assert.equal(replacement.color, "red");
  const deletedSegment = segments.find((segment) => segment.type === "deleted");
  assert.equal(deletedSegment.text, "jumps");
});

test("renderCorrectionProjection returns the full unmodified text when there are no corrections", () => {
  const segments = renderCorrectionProjection(ANSWER, []);
  assert.equal(segments.map((segment) => segment.text).join(""), ANSWER);
});

test("bracket correction emits one pair across internal style and historical comment segments", () => {
  const answer = "hello world example";
  const corrections = [
    createCorrection({ id: "b1", operation: "style", styleType: "bracket", start: 0, end: 11, anchoredText: "hello world", createdAt: "t" }),
    createCorrection({ id: "s1", operation: "style", styleType: "bold", start: 0, end: 5, anchoredText: "hello", createdAt: "t" }),
    createCorrection({ id: "c1", operation: "comment", start: 6, end: 11, anchoredText: "world", text: "Historical note", createdAt: "t" }),
  ];

  const segments = renderCorrectionProjection(answer, corrections);

  assert.equal(segments.map((segment) => segment.bracketsBefore || 0).reduce((sum, count) => sum + count, 0), 1);
  assert.equal(segments.map((segment) => segment.bracketsAfter || 0).reduce((sum, count) => sum + count, 0), 1);
  assert.equal(segments[0].bracketsBefore, 1);
  assert.equal(segments.find((segment) => segment.text === "world").bracketsAfter, 1);
  assert.deepEqual(segments.find((segment) => segment.text === "world").comments, ["Historical note"]);
});
