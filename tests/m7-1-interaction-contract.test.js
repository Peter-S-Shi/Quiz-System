import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");

function functionBody(name) {
  const start = appSource.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextFunction = appSource.indexOf("\nfunction ", start + 1);
  return appSource.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

test("M7.1 retains only the two explicitly accepted native confirmation calls", () => {
  const nativeCalls = [...appSource.matchAll(/window\.(alert|confirm|prompt)\s*\(/g)];
  assert.equal(nativeCalls.length, 2);
  assert.match(functionBody("submitQuizAtEnd"), /window\.confirm\s*\(/);
  assert.match(functionBody("startRetryNeedsWork"), /window\.confirm\s*\(/);
  assert.doesNotMatch(appSource, /window\.(alert|prompt)\s*\(/);
});

test("M7.1 exposes one reusable Study Desk dialog contract", () => {
  assert.match(indexSource, /<dialog[^>]+id="studyDeskDialog"/);
  assert.match(indexSource, /id="studyDeskDialogForm"/);
  assert.match(indexSource, /id="studyDeskDialogInput"/);
  assert.match(appSource, /function openStudyDeskDialog\s*\(/);
  assert.match(appSource, /function confirmStudyDeskAction\s*\(/);
});

test("high-content question and Translation Item deletion wait for Study Desk confirmation", () => {
  const questionDeletion = functionBody("deleteQuestion");
  const translationItemDeletion = functionBody("deleteTranslationItem");
  assert.match(questionDeletion, /await confirmStudyDeskAction\s*\(/);
  assert.ok(questionDeletion.indexOf("await confirmStudyDeskAction") < questionDeletion.indexOf("paper.questions ="));
  assert.match(translationItemDeletion, /await confirmStudyDeskAction\s*\(/);
  assert.ok(translationItemDeletion.indexOf("await confirmStudyDeskAction") < translationItemDeletion.indexOf("saveTranslationLibrary"));
});

test("whole-item marking controls expose their toggle state", () => {
  assert.match(appSource, /data-item-mark-kind="unknown"[^>]+aria-pressed=/);
  assert.match(appSource, /data-item-mark-kind="uncertain"[^>]+aria-pressed=/);
  assert.match(appSource, /data-item-mark-kind="should_know"[^>]+aria-pressed=/);
});

test("Correction Workspace restores focus after in-task rerenders", () => {
  const applyCorrection = functionBody("applyWorkspaceCorrection");
  const removeCorrection = functionBody("removeWorkspaceCorrection");
  const saveReview = functionBody("saveCorrectionReview");
  assert.match(appSource, /dataset\.switchReview[\s\S]{0,300}focusAfterRerender/);
  assert.match(appSource, /getElementById\("startNewReviewInline"\)[\s\S]{0,300}focusAfterRerender\("#startNewReviewInline"\)/);
  assert.match(appSource, /getElementById\("correctionJudgment"\)[\s\S]{0,400}focusAfterRerender\("#correctionJudgment"\)/);
  assert.match(appSource, /getElementById\("previousCorrectionItem"\)[\s\S]{0,300}focusAfterRerender/);
  assert.match(appSource, /getElementById\("nextCorrectionItem"\)[\s\S]{0,300}focusAfterRerender/);
  assert.match(applyCorrection, /focusAfterRerender\(focusSelector\)/);
  assert.match(removeCorrection, /focusAfterRerender\(focusSelector\)/);
  assert.match(saveReview, /focusAfterRerender\("#saveCorrectionReview"\)/);
});
