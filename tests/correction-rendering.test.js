import test from "node:test";
import assert from "node:assert/strict";

import { addCorrection, renderCorrectionProjection } from "../src/core/corrections.js";
import { renderCorrectionProjectionHtml } from "../src/core/correction-rendering.js";

test("the real projection renderer exposes a selected span comment and visible badge", () => {
  const answerText = "The train leaves at 9:00.";
  const corrections = addCorrection([], {
    operation: "comment",
    start: 10,
    end: 16,
    anchoredText: "leaves",
    text: "时",
  }, answerText);

  const html = renderCorrectionProjectionHtml(renderCorrectionProjection(answerText, corrections));

  assert.match(html, /class="correction-comment-highlight">leaves<\/span>/);
  assert.match(html, /class="correction-comment-badge" title="时">💬 时<\/span>/);
});

test("projection rendering escapes comment and answer markup", () => {
  const answerText = "<word>";
  const corrections = addCorrection([], {
    operation: "comment",
    start: 0,
    end: answerText.length,
    anchoredText: answerText,
    text: "<script>alert('x')</script>",
  }, answerText);

  const html = renderCorrectionProjectionHtml(renderCorrectionProjection(answerText, corrections));

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;word&gt;/);
  assert.match(html, /&lt;script&gt;/);
});

test("a comment nested inside a replacement keeps its exact highlight and badge", () => {
  const answerText = "abcdefghi";
  let corrections = addCorrection([], {
    operation: "replace",
    start: 2,
    end: 8,
    anchoredText: "cdefgh",
    text: "replacement",
  }, answerText);
  corrections = addCorrection(corrections, {
    operation: "comment",
    start: 3,
    end: 5,
    anchoredText: "de",
    text: "nested note",
  }, answerText);

  const html = renderCorrectionProjectionHtml(renderCorrectionProjection(answerText, corrections));

  assert.match(html, /correction-deleted correction-comment-highlight">de<\/span><span class="correction-comment-badge"[^>]*>💬 nested note<\/span>/);
  assert.doesNotMatch(html, /correction-comment-highlight">cdefgh<\/span>/);
});

test("a bracket nested inside a deletion renders exactly one boundary pair", () => {
  const answerText = "abcdefghi";
  let corrections = addCorrection([], {
    operation: "delete",
    start: 1,
    end: 8,
    anchoredText: "bcdefgh",
  }, answerText);
  corrections = addCorrection(corrections, {
    operation: "style",
    styleType: "bracket",
    start: 3,
    end: 6,
    anchoredText: "def",
  }, answerText);

  const html = renderCorrectionProjectionHtml(renderCorrectionProjection(answerText, corrections));

  assert.equal((html.match(/correction-bracket/g) || []).length, 2);
  assert.match(html, /<span class="correction-bracket">\[<\/span><span class="correction-deleted">def<\/span><span class="correction-bracket">\]<\/span>/);
});
