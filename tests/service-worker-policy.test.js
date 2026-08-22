import test from "node:test";
import assert from "node:assert/strict";

import { shouldRegisterProductionServiceWorker } from "../src/core/service-worker-policy.js";

test("loopback development origins never register the production Service Worker", () => {
  for (const url of [
    "http://localhost:8000/",
    "http://127.0.0.1:8000/",
    "http://[::1]:8000/",
  ]) {
    assert.equal(shouldRegisterProductionServiceWorker(new URL(url)), false, url);
  }
});

test("hosted HTTP applications retain production PWA registration", () => {
  assert.equal(
    shouldRegisterProductionServiceWorker(new URL("https://example.test/quiz-studio/")),
    true
  );
});
