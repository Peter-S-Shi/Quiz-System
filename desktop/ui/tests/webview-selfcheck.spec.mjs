// The WebView self-check (reported through ui_ready; asserted by the packaged-app smoke) must itself pass in Node, and
// it must be able to fail: a wrong implementation is detected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runWebviewSelfCheck } from '../web/src/practice/webview-selfcheck.js';

test('the pinned-comparison self-check passes on the pinned implementation', () => {
  const r = runWebviewSelfCheck();
  assert.deepEqual(r.failed, []);
  assert.equal(r.ok, true);
  assert.ok(r.cases >= 9);
});

test('the self-check is independent of the host Unicode behavior (a broken Intl.Segmenter and normalize change nothing)', () => {
  const seg = Intl.Segmenter;
  const norm = String.prototype.normalize;
  Intl.Segmenter = class { segment(s) { return [...s].map((c, index) => ({ segment: c, index })); } };
  String.prototype.normalize = function broken() { return String(this).toUpperCase(); };
  try {
    assert.equal(runWebviewSelfCheck().ok, true);
  } finally {
    Intl.Segmenter = seg;
    String.prototype.normalize = norm;
  }
});

test('the self-check can fail: an implementation that normalizes with the host or ignores clusters is detected', () => {
  const hostish = (a, b) => ({ errors: a.normalize('NFC') === b.normalize('NFC') ? [] : [{ kind: 'substitution', reference: { start: 0, end: a.length }, committed: { start: 0, end: b.length } }] });
  const r = runWebviewSelfCheck({ compare: hostish });
  assert.equal(r.ok, false);
  assert.ok(r.failed.length > 3);
});
