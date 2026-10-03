// The physical sound helper: the preference gates every call, motion-reduced and missing / suspended Web Audio are handled
// quietly, and there is no network or audio asset (synthesized oscillators only).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSfx, resetSfxForTest } from '../web/src/ui/sfx.js';

function installFakeAudio({ state = 'running' } = {}) {
  const log = { created: 0, oscillators: 0, resumed: 0 };
  class FakeContext {
    constructor() { log.created += 1; this.state = state; this.currentTime = 0; this.destination = {}; }
    resume() { log.resumed += 1; this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n }; }
    createOscillator() {
      log.oscillators += 1;
      return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n, start() {}, stop() {} };
    }
  }
  globalThis.AudioContext = FakeContext;
  resetSfxForTest();
  return log;
}
const restore = () => { delete globalThis.AudioContext; resetSfxForTest(); };

test('Sound Off: no AudioContext is created and nothing plays', () => {
  const log = installFakeAudio();
  const sfx = createSfx({ enabled: () => false });
  for (const n of ['page', 'pen', 'stamp']) sfx(n);
  assert.deepEqual(log, { created: 0, oscillators: 0, resumed: 0 });
  restore();
});

test('Sound On: each semantic sound plays through the helper; unknown names are ignored', () => {
  const log = installFakeAudio();
  const sfx = createSfx({ enabled: () => true });
  sfx('page'); sfx('pen'); sfx('stamp'); sfx('nonsense');
  assert.equal(log.oscillators, 3);
  restore();
});

test('the preference is read on every call: turning it off silences immediately', () => {
  const log = installFakeAudio();
  let on = true;
  const sfx = createSfx({ enabled: () => on });
  sfx('pen');
  on = false;
  sfx('pen'); sfx('stamp');
  assert.equal(log.oscillators, 1);
  restore();
});

test('reduced motion silences sound; a missing Web Audio and a throwing context never throw', () => {
  const log = installFakeAudio();
  createSfx({ enabled: () => true, reduced: () => true })('page');
  assert.equal(log.oscillators, 0);
  restore();
  assert.doesNotThrow(() => createSfx({ enabled: () => true })('page'));
  globalThis.AudioContext = class { constructor() { throw new Error('blocked'); } };
  resetSfxForTest();
  assert.doesNotThrow(() => createSfx({ enabled: () => true })('stamp'));
  restore();
});

test('a suspended context (autoplay policy) is resumed and the sound plays afterwards', async () => {
  const log = installFakeAudio({ state: 'suspended' });
  createSfx({ enabled: () => true })('stamp');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(log.resumed, 1);
  assert.equal(log.oscillators, 1);
  restore();
});

test('the helper carries no network or asset reference', () => {
  const src = fs.readFileSync(new URL('../web/src/ui/sfx.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|new Audio\(|https?:\/\/|\.(mp3|wav|ogg)\b/);
});
