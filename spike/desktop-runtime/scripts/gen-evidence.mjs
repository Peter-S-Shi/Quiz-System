// Generates D-Evidence tiers (NDJSON) from the repository's existing synthetic fixture generator.
// usage: node gen-evidence.mjs <count> <out.ndjson> [out.hashes.ndjson]
import { createWriteStream } from "node:fs";
import { createHistoryPerformanceDataset } from "../../../scripts/lib/history-performance-fixtures.mjs";
import { hashValue } from "./lib/canon.mjs";

const [count, out, hashesOut] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
if (!count || !out) throw new Error("usage: gen-evidence.mjs <count> <out> [hashes]");
const { learnerResponses, teacherReviews } = createHistoryPerformanceDataset(count);
const w = createWriteStream(out);
const h = hashesOut ? createWriteStream(hashesOut) : null;
let bytes = 0;
for (const [collection, list] of [["learner_response", learnerResponses], ["teacher_review", teacherReviews]]) {
  for (const payload of list) {
    const line = JSON.stringify({ collection, id: payload.id, payload }) + "\n";
    bytes += Buffer.byteLength(line);
    w.write(line);
    if (h) h.write(JSON.stringify({ collection, id: payload.id, hash: hashValue(payload) }) + "\n");
  }
}
w.end();
h?.end();
console.log(JSON.stringify({ responses: learnerResponses.length, reviews: teacherReviews.length, serializedMiB: +(bytes / 1048576).toFixed(2) }));
