// Id allocation never falls back to Math.random: without crypto.randomUUID it builds a v4 UUID from getRandomValues.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newId } from '../web/src/ids.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('newId yields v4 UUIDs, with and without crypto.randomUUID (CSPRNG fallback)', () => {
  assert.match(newId(), V4);
  const real = globalThis.crypto.randomUUID;
  const random = Math.random;
  try {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    Math.random = () => { throw new Error('Math.random must not be used for ids'); };
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    assert.equal(ids.size, 500);
    for (const id of ids) assert.match(id, V4);
  } finally {
    Math.random = random;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: real, configurable: true, writable: true });
  }
});
