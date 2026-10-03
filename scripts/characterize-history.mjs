import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import {
  buildHistoryEntry,
  buildHistoryIndex,
  filterHistoryEntries,
} from "../src/core/translation-history.js";
import { createHistoryPerformanceDataset } from "./lib/history-performance-fixtures.mjs";

const TIERS = [100, 500, 1000, 2500];
const RUNS = 5;
const results = [];

for (const responseCount of TIERS) {
  const dataset = createHistoryPerformanceDataset(responseCount);
  const serializedBytes = Buffer.byteLength(JSON.stringify(dataset), "utf8");
  buildHistoryIndex(dataset.learnerResponses, dataset.teacherReviews);

  const indexTimings = measureFive(() => buildHistoryIndex(dataset.learnerResponses, dataset.teacherReviews));
  const index = buildHistoryIndex(dataset.learnerResponses, dataset.teacherReviews);
  const filterTimings = measureFive(() => filterHistoryEntries(index, {
    purpose: "retry",
    status: "needs-work",
    sort: "oldest",
  }));
  const detailResponse = dataset.learnerResponses[Math.floor(responseCount / 2)];
  const detailTimings = measureFive(() => buildHistoryEntry(detailResponse, {
    learnerResponses: dataset.learnerResponses,
    teacherReviews: dataset.teacherReviews,
  }));
  const projectionTimings = measureFive(() => index.map((entry) => [
    entry.responseId,
    entry.materialTitle,
    entry.reviewCount,
    entry.needsWorkCount,
    entry.purpose,
  ].join("|")).join("\n"));

  assert.equal(index.length, responseCount);
  assert.equal(new Set(index.map((entry) => entry.responseId)).size, responseCount);
  assert.equal(index.some((entry) => entry.purpose === "retry"), responseCount >= 100);
  assert.equal(index.some((entry) => entry.purpose === "remediation"), responseCount >= 100);
  assert.equal(index.every((entry) => entry.needsWorkCount >= 2), true);

  results.push({
    responses: responseCount,
    reviews: dataset.teacherReviews.length,
    serializedMiB: round(serializedBytes / 1024 / 1024),
    heapUsedMiB: round(process.memoryUsage().heapUsed / 1024 / 1024),
    indexMs: summarize(indexTimings),
    filterSortMs: summarize(filterTimings),
    detailMs: summarize(detailTimings),
    htmlProjectionMs: summarize(projectionTimings),
  });
}

process.stdout.write(`${JSON.stringify({ runs: RUNS, results }, null, 2)}\n`);

function measureFive(operation) {
  const timings = [];
  for (let run = 0; run < RUNS; run += 1) {
    const startedAt = performance.now();
    operation();
    timings.push(performance.now() - startedAt);
  }
  return timings;
}

function summarize(timings) {
  const sorted = timings.slice().sort((left, right) => left - right);
  return {
    median: round(sorted[Math.floor(sorted.length / 2)]),
    worst: round(sorted[sorted.length - 1]),
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
