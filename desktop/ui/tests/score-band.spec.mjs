// Objective result presentation bands (Product Owner): derived display only, never stored, no mastery levels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreBand } from '../web/src/objective/score-band.js';

const band = (correct, total) => scoreBand({ correct, total }).band;

test('the four Product Owner bands and their tones', () => {
  assert.deepEqual(scoreBand({ correct: 10, total: 10 }), { band: 'perfect', tone: 'green', percent: 100 });
  assert.deepEqual(scoreBand({ correct: 9, total: 10 }), { band: 'high', tone: 'green', percent: 90 });
  assert.deepEqual(scoreBand({ correct: 7, total: 10 }), { band: 'mid', tone: 'amber', percent: 70 });
  assert.deepEqual(scoreBand({ correct: 8, total: 10 }), { band: 'mid', tone: 'amber', percent: 80 });
  assert.deepEqual(scoreBand({ correct: 6, total: 10 }), { band: 'low', tone: 'red', percent: 60 });
  assert.deepEqual(scoreBand({ correct: 0, total: 5 }), { band: 'low', tone: 'red', percent: 0 });
});

test('boundaries: 89 / 90 and 69 / 70', () => {
  assert.equal(band(89, 100), 'mid');
  assert.equal(band(90, 100), 'high');
  assert.equal(band(69, 100), 'low');
  assert.equal(band(70, 100), 'mid');
  assert.equal(band(99, 100), 'high');
});

test('only all-correct is perfect: 199 of 200 rounds to 100% but is shown as 99%, never as a full score', () => {
  assert.deepEqual(scoreBand({ correct: 199, total: 200 }), { band: 'high', tone: 'green', percent: 99 });
  assert.equal(band(1, 1), 'perfect');
});

test('invalid facts degrade to the low band without throwing', () => {
  for (const [c, t] of [[0, 0], [-1, 5], [6, 5], [1.5, 3], [NaN, 3]]) assert.equal(band(c, t), 'low');
});
