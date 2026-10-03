import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

test("current Correction Workspace omits Comment and Strikethrough creation while retaining Delete", () => {
  assert.doesNotMatch(appSource, /id="applyCommentCorrection"/);
  assert.doesNotMatch(appSource, /function applyCommentCorrection/);
  assert.doesNotMatch(appSource, /data-style="strikethrough"/);
  assert.match(appSource, /id="applyDeleteCorrection"/);
});
