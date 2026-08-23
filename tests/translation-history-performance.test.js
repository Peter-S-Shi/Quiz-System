import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHistoryEntry,
  buildHistoryIndex,
  filterHistoryEntries,
  isTranslationLearnerResponse,
  resolveResponseLineage,
} from "../src/core/translation-history.js";
import { createHistoryPerformanceDataset } from "../scripts/lib/history-performance-fixtures.mjs";

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

test("optimized History derivation exactly matches the pre-optimization reference at every locked tier", () => {
  for (const count of [100, 500, 1000, 2500]) {
    const { learnerResponses, teacherReviews } = createHistoryPerformanceDataset(count);
    const referenceIndex = buildReferenceIndex(learnerResponses, teacherReviews);
    const optimizedIndex = buildHistoryIndex(learnerResponses, teacherReviews);

    assert.deepEqual(optimizedIndex, referenceIndex, `full index parity failed at ${count} responses`);

    const filters = [
      { purpose: "all", status: "all", sort: "newest" },
      { purpose: "retry", status: "needs-work", sort: "oldest" },
      { purpose: "remediation", status: "reviewed", sort: "newest" },
      { purpose: "practice", status: "unreviewed", sort: "oldest" },
    ];
    filters.forEach((filter) => {
      assert.deepEqual(
        filterHistoryEntries(optimizedIndex, filter),
        filterHistoryEntries(referenceIndex, filter),
        `filter/sort parity failed at ${count}: ${JSON.stringify(filter)}`,
      );
    });

    const source = learnerResponses[0];
    assert.deepEqual(resolveResponseLineage(source, { learnerResponses, teacherReviews }), {
      ancestors: [],
      descendants: [
        {
          responseId: "perf-response-00001",
          purpose: "retry",
          materialTitle: "Synthetic History 1",
          sourceReviewId: null,
          completedAt: "2026-01-01T00:01:00.000Z",
        },
        {
          responseId: "perf-response-00002",
          purpose: "remediation",
          materialTitle: "Synthetic History 2",
          sourceReviewId: "perf-review-0-0",
          completedAt: "2026-01-01T00:02:00.000Z",
        },
      ],
    }, `lineage parity failed at ${count} responses`);
  }
});

function buildReferenceIndex(learnerResponses, teacherReviews) {
  const translationResponses = learnerResponses.filter(isTranslationLearnerResponse);
  return translationResponses
    .map((response) => buildHistoryEntry(response, {
      teacherReviews,
      learnerResponses: translationResponses,
    }))
    .sort((left, right) => new Date(right.completedAt) - new Date(left.completedAt));
}

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
