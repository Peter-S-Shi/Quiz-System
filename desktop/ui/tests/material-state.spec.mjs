// Library factual learning state: derived only (never stored, never mastery).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIAL_STATES, deriveMaterialStates, materialStateOf } from '../web/src/product/material-state.js';

const resp = (type, id) => ({ payload: { material: { type, id } } });

test('no facts means not-started', () => {
  const s = deriveMaterialStates({});
  assert.deepEqual(materialStateOf(s, 'quiz-paper', 'p1'), { state: 'not-started', attempts: 0 });
});

test('a canonical completed attempt means practiced, counted per material, for all three domains', () => {
  const s = deriveMaterialStates({
    responses: [resp('quiz-paper', 'p1'), resp('quiz-paper', 'p1'), resp('translation-document', 'd1')],
    typingAttempts: [resp('typing-text', 't1')],
  });
  assert.deepEqual(materialStateOf(s, 'quiz-paper', 'p1'), { state: 'practiced', attempts: 2 });
  assert.deepEqual(materialStateOf(s, 'translation-document', 'd1'), { state: 'practiced', attempts: 1 });
  assert.deepEqual(materialStateOf(s, 'typing-text', 't1'), { state: 'practiced', attempts: 1 });
  assert.equal(materialStateOf(s, 'quiz-paper', 'other').state, 'not-started');
});

test('an active recoverable session means in-progress, and wins over practiced', () => {
  const s = deriveMaterialStates({
    responses: [resp('quiz-paper', 'p1')],
    resumable: [{ domain: 'objective', material: { id: 'p1' } }, { domain: 'typing', material: { id: 't9' } }, { domain: 'weird', material: { id: 'x' } }, { domain: 'objective' }],
  });
  assert.deepEqual(materialStateOf(s, 'quiz-paper', 'p1'), { state: 'in-progress', attempts: 1 });
  assert.deepEqual(materialStateOf(s, 'typing-text', 't9'), { state: 'in-progress', attempts: 0 });
  assert.equal(materialStateOf(s, 'weird', 'x').state, 'not-started');
});

test('malformed rows are ignored and the state set is closed (no mastery vocabulary)', () => {
  const s = deriveMaterialStates({ responses: [{}, { payload: {} }, { payload: { material: { type: 1, id: 2 } } }] });
  assert.equal(s.size, 0);
  assert.deepEqual([...MATERIAL_STATES], ['not-started', 'in-progress', 'practiced']);
});
