// Generates lossless-fidelity fixtures: unknown fields, extensions, deep nesting, order-sensitive arrays,
// awkward numbers/strings/keys. usage: node gen-fidelity.mjs <out.ndjson> <out.hashes.ndjson>
import { writeFileSync } from "node:fs";
import { hashValue } from "./lib/canon.mjs";

const [out, hashesOut] = process.argv.slice(2);
const nasty = [
  "plain", "😀 emoji", "👨‍👩‍👧‍👦 zwj family", "🇯🇵 flag", "é combining", "한글 jamo 한",
  "क्षि indic conjunct", "中文 + Latin mix", "مرحبا RTL", "line sep para", "tab\tnl\ncr\r", "quote\" backslash\\ slash/",
  "ctrl\u0000\u0001\u001f", "astral 𝔘𝔫𝔦", "empty→", "", "   leading/trailing   ",
];
const numbers = [0, -1, 1, 3.14, 0.1 + 0.2, 1e21, 5e-324, 1.7976931348623157e308, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 1e-7, 123456789.123456789];
function deep(n) { let o = { leaf: "end", n }; for (let i = n - 1; i >= 0; i--) o = { [`lvl${i}`]: o, siblings: [i, String(i), null] }; return o; }

const lines = [];
const hashes = [];
for (let i = 0; i < 60; i++) {
  const id = `fid-${String(i).padStart(3, "0")}`;
  const payload = {
    id, documentType: "quiz-studio.learner-response", finalizedAt: "2026-01-01T00:00:00.000Z",
    material: { id: `fm-${i % 7}`, title: nasty[i % nasty.length] },
    responses: Array.from({ length: 4 }, (_, k) => ({ itemId: `${id}-i${(k * 7 + i) % 11}`, answer: nasty[(i + k) % nasty.length] })), // order-sensitive, unsorted ids
    mediaRefs: [],
    extensions: { "x-vendor": { flags: [true, false, null], nested: deep(5 + (i % 5)) }, unknownNumbers: numbers, unknownStrings: nasty },
    unknownTopLevel: { a: [3, 2, 1, { z: 1, a: 2 }], "": "empty key", "😀": "astral key", "～": "bmp-high key" },
    deepTree: deep(60),
    nullField: null, emptyObj: {}, emptyArr: [], bool: [true, false],
  };
  lines.push(JSON.stringify({ collection: "learner_response", id, payload }));
  hashes.push(JSON.stringify({ collection: "learner_response", id, hash: hashValue(payload) }));
}
writeFileSync(out, lines.join("\n") + "\n");
writeFileSync(hashesOut, hashes.join("\n") + "\n");
console.log(JSON.stringify({ records: lines.length }));
