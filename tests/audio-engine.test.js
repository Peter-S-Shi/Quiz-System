import test from "node:test";
import assert from "node:assert/strict";
import { StudioAudioEngine } from "../src/core/audio-engine.js";

test("StudioAudioEngine instantiates safely in headless Node environment without throwing", () => {
  const engine = new StudioAudioEngine();
  assert.equal(engine.enabled, true);

  // Calling sound triggers when audio context is unavailable should not throw
  assert.doesNotThrow(() => {
    engine.playPageTurn();
    engine.playPencilStroke();
    engine.playStampThud();
  });
});

test("StudioAudioEngine respects enabled flag", () => {
  const engine = new StudioAudioEngine();
  engine.setEnabled(false);
  assert.equal(engine.enabled, false);

  engine.setEnabled(true);
  assert.equal(engine.enabled, true);
});
