import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectionFor, putOp, ProjectionError } from '../web/src/projection.js';
import { canonical } from '../web/src/canonical.js';

const fx = JSON.parse(readFileSync(new URL('../../core/store/tests/fixtures/projection-cases.json', import.meta.url), 'utf8'));
const spec = (name) => fx.specs.find((s) => s.name === name);

test('JS projections equal the Rust extractor for every shared case', () => {
  assert.ok(fx.valid.length >= 10);
  for (const c of fx.valid) {
    const got = projectionFor(spec(c.collection), c.id, c.payload);
    assert.equal(canonical(got), canonical(c.expected), `${c.collection}/${c.id}`);
  }
});

test('invalid payloads are rejected by the JS helper as well', () => {
  for (const c of fx.invalid) {
    assert.throws(() => projectionFor(spec(c.collection), c.id, c.payload), ProjectionError, JSON.stringify(c.payload));
  }
});

test('putOp builds a complete Unit-of-Work operation', () => {
  const payload = { id: 'resp-1', paperId: 'p', itemCount: 1, items: ['a'] };
  const op = putOp(spec('learner_response'), 'resp-1', payload);
  assert.equal(op.op, 'put');
  assert.equal(op.collection, 'learner_response');
  assert.deepEqual(op.proj.relations.response_item, [{ item_id: 'a' }]);
});
