import test from "node:test";
import assert from "node:assert/strict";

import { buildHistoryIndex } from "../src/core/translation-history.js";

test("buildHistoryIndex reads source collections within a linear budget", () => {
  const count = 200;
  let responseReads = 0;
  let reviewReads = 0;
  const responses = countedArray(
    Array.from({ length: count }, (_, index) => createResponse(index)),
    () => { responseReads += 1; },
  );
  const reviews = countedArray(
    Array.from({ length: count }, (_, index) => createReview(index)),
    () => { reviewReads += 1; },
  );

  const index = buildHistoryIndex(responses, reviews);

  assert.equal(index.length, count);
  assert.equal(index.every((entry) => entry.reviewCount === 1), true);
  assert.ok(responseReads <= count * 8, `expected linear response reads, observed ${responseReads}`);
  assert.ok(reviewReads <= count * 6, `expected linear review reads, observed ${reviewReads}`);
});

function countedArray(values, onNumericRead) {
  return new Proxy(values, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) onNumericRead();
      return Reflect.get(target, property, receiver);
    },
  });
}

function createResponse(index) {
  const id = `linear-response-${index}`;
  return {
    id,
    finalizedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    material: {
      type: "translation-document",
      id: `linear-material-${index}`,
      title: `Synthetic ${index}`,
      snapshot: {
        items: [{ id: `${id}-item` }],
      },
    },
    responses: [{ itemId: `${id}-item`, answer: "Synthetic answer" }],
    summary: { itemCount: 1 },
    provenance: index > 0 && index % 10 === 0
      ? { purpose: "retry", sourceResponseId: `linear-response-${index - 1}` }
      : { purpose: "practice" },
  };
}

function createReview(index) {
  return {
    id: `linear-review-${index}`,
    responseId: `linear-response-${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    itemReviews: [],
  };
}
