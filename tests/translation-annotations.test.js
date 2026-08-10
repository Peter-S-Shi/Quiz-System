import test from "node:test";
import assert from "node:assert/strict";

import {
  ANNOTATION_KINDS,
  addAnnotation,
  changeAnnotationKind,
  createAnnotation,
  normalizeAnnotationList,
  removeAnnotation,
  revalidateAnnotations,
  validateAnnotation,
} from "../src/core/translation-annotations.js";

const ANSWER = "The quick brown fox jumps";

test("all three annotation kinds validate against a matching answer span", () => {
  ANNOTATION_KINDS.forEach((kind) => {
    const annotation = createAnnotation({ id: `a-${kind}`, kind, start: 4, end: 9, text: "quick", createdAt: "2026-04-01T00:00:00.000Z" });
    assert.deepEqual(validateAnnotation(annotation, ANSWER), { valid: true, errors: [] });
  });
});

test("multiword spans are accepted without token-boundary restrictions", () => {
  const annotation = createAnnotation({ id: "a1", kind: "uncertain", start: 4, end: 19, text: "quick brown fox", createdAt: "2026-04-01T00:00:00.000Z" });
  assert.deepEqual(validateAnnotation(annotation, ANSWER), { valid: true, errors: [] });
});

test("zero-length selections are rejected", () => {
  const annotation = createAnnotation({ id: "a1", kind: "unknown", start: 4, end: 4, text: "", createdAt: "2026-04-01T00:00:00.000Z" });
  const result = validateAnnotation(annotation, ANSWER);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /greater than start/);
});

test("invalid ranges are rejected", () => {
  assert.equal(validateAnnotation(createAnnotation({ id: "a1", kind: "unknown", start: 9, end: 4, text: "x", createdAt: "t" }), ANSWER).valid, false);
  assert.equal(validateAnnotation(createAnnotation({ id: "a1", kind: "unknown", start: -1, end: 4, text: "x", createdAt: "t" }), ANSWER).valid, false);
  assert.equal(validateAnnotation(createAnnotation({ id: "a1", kind: "unknown", start: 0, end: 999, text: "x", createdAt: "t" }), ANSWER).valid, false);
});

test("unknown annotation kinds are rejected", () => {
  const annotation = createAnnotation({ id: "a1", kind: "definitely_wrong", start: 0, end: 3, text: "The", createdAt: "t" });
  const result = validateAnnotation(annotation, ANSWER);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Invalid annotation kind/);
});

test("captured text must match the anchored answer span", () => {
  const annotation = createAnnotation({ id: "a1", kind: "unknown", start: 4, end: 9, text: "slow", createdAt: "t" });
  const result = validateAnnotation(annotation, ANSWER);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /does not match the anchored answer span/);
});

test("addAnnotation replaces the category on an exact duplicate span instead of accumulating", () => {
  let list = addAnnotation([], { id: "a1", kind: "unknown", start: 4, end: 9, text: "quick" }, ANSWER);
  list = addAnnotation(list, { id: "a2", kind: "uncertain", start: 4, end: 9, text: "quick" }, ANSWER);
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, "uncertain");
});

test("addAnnotation rejects a span that overlaps a different existing mark", () => {
  const list = addAnnotation([], { id: "a1", kind: "unknown", start: 4, end: 19, text: "quick brown fox" }, ANSWER);
  assert.throws(() => addAnnotation(list, { id: "a2", kind: "uncertain", start: 10, end: 15 + 4, text: ANSWER.slice(10, 19) }, ANSWER), /overlaps/);
});

test("addAnnotation allows non-overlapping spans to coexist", () => {
  let list = addAnnotation([], { id: "a1", kind: "unknown", start: 0, end: 3, text: "The" }, ANSWER);
  list = addAnnotation(list, { id: "a2", kind: "should_know", start: 20, end: 25, text: "jumps" }, ANSWER);
  assert.equal(list.length, 2);
});

test("removeAnnotation and changeAnnotationKind operate on the correct entry only", () => {
  let list = addAnnotation([], { id: "a1", kind: "unknown", start: 0, end: 3, text: "The" }, ANSWER);
  list = addAnnotation(list, { id: "a2", kind: "should_know", start: 20, end: 25, text: "jumps" }, ANSWER);

  const changed = changeAnnotationKind(list, list[0].id, "uncertain");
  assert.equal(changed.find((item) => item.id === list[0].id).kind, "uncertain");
  assert.equal(changed.find((item) => item.id === list[1].id).kind, "should_know");

  const removed = removeAnnotation(list, list[0].id);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].id, list[1].id);

  assert.throws(() => changeAnnotationKind(list, list[0].id, "not-a-kind"), /Invalid annotation kind/);
});

test("revalidateAnnotations drops marks whose anchored text no longer matches an edited answer", () => {
  let list = addAnnotation([], { id: "a1", kind: "unknown", start: 0, end: 3, text: "The" }, ANSWER);
  list = addAnnotation(list, { id: "a2", kind: "should_know", start: 20, end: 25, text: "jumps" }, ANSWER);

  const editedAnswer = "The quick brown fox leaps";
  const survivors = revalidateAnnotations(list, editedAnswer);
  assert.equal(survivors.length, 1);
  assert.equal(survivors[0].id, "a1");
});

test("normalizeAnnotationList safely drops malformed entries without throwing", () => {
  const raw = [
    { id: "a1", kind: "unknown", start: 0, end: 3, text: "The", createdAt: "2026-04-01T00:00:00.000Z" },
    { id: "a2", kind: "not-a-kind", start: 4, end: 9, text: "quick", createdAt: "2026-04-01T00:00:00.000Z" },
    { id: "a3", kind: "uncertain", start: 4, end: 9, text: "WRONG", createdAt: "2026-04-01T00:00:00.000Z" },
    { id: "a1", kind: "should_know", start: 20, end: 25, text: "jumps", createdAt: "2026-04-01T00:00:00.000Z" },
    "not an object",
    null,
  ];
  const result = normalizeAnnotationList(raw, ANSWER);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a1");
  assert.equal(result[0].kind, "unknown");
});

test("normalizeAnnotationList resolves overlapping persisted annotations by keeping the first non-conflicting entry", () => {
  const raw = [
    { id: "a1", kind: "unknown", start: 4, end: 9, text: "quick", createdAt: "2026-04-01T00:00:00.000Z" },
    { id: "a2", kind: "should_know", start: 6, end: 12, text: "ick br", createdAt: "2026-04-01T00:00:01.000Z" },
    { id: "a3", kind: "uncertain", start: 4, end: 9, text: "quick", createdAt: "2026-04-01T00:00:02.000Z" },
    { id: "a4", kind: "should_know", start: 20, end: 25, text: "jumps", createdAt: "2026-04-01T00:00:03.000Z" },
  ];
  const result = normalizeAnnotationList(raw, ANSWER);
  assert.deepEqual(result.map((item) => item.id), ["a1", "a4"]);
});

test("normalizeAnnotationList returns an empty array for non-array input", () => {
  assert.deepEqual(normalizeAnnotationList(null, ANSWER), []);
  assert.deepEqual(normalizeAnnotationList("garbage", ANSWER), []);
  assert.deepEqual(normalizeAnnotationList(undefined, ANSWER), []);
});
