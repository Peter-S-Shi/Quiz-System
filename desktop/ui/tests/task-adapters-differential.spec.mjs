// Differential proof (ADR 0004 section 5.3, T-1): for Objective and Translation, the set of payloads the adapters accept
// is a SUBSET of what the UNCHANGED V1 validator accepts AND what the public learner-response JSON Schema accepts.
// The adapters may only be stricter (V2 domain constraints), never looser. Every leaf and container of several valid
// native payloads is mutated systematically (deleted, or replaced by each value of a type-confusion pool); the
// property is asserted on every mutant, and the pool is checked to actually exercise adapter rejections.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { validateLearnerResponse } from '../../../src/core/interchange.js';
import { ADAPTERS } from '../web/src/task-domains/adapters.js';
import { nativeObjective, nativeTranslation } from './task-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(fs.readFileSync(path.join(here, '..', '..', '..', 'schemas', 'learner-response.schema.json'), 'utf8'));
const validateSchema = new Ajv2020({ strict: false }).compile(schema);
const clone = (v) => JSON.parse(JSON.stringify(v));

const POOL = [null, 0, -1, 1.5, 101, '', ' ', '\t\n', 'x', true, false, [], {}, [1], { type: 'x' }, { type: '' }];

/** Every path (array of keys) in `v`, depth first, excluding the root. */
function paths(v, prefix = [], out = []) {
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) { const p = [...prefix, Array.isArray(v) ? Number(k) : k]; out.push(p); paths(v[k], p, out); }
  }
  return out;
}
function at(root, p) { return p.slice(0, -1).reduce((o, k) => o[k], root); }

function mutants(base) {
  const out = [];
  for (const p of paths(base)) {
    const del = clone(base); const holder = at(del, p); const key = p[p.length - 1];
    if (Array.isArray(holder)) holder.splice(key, 1); else delete holder[key];
    out.push({ why: `delete ${p.join('.')}`, value: del });
    POOL.forEach((x, i) => { const m = clone(base); at(m, p)[key] = x; out.push({ why: `set ${p.join('.')} = pool[${i}] ${JSON.stringify(x)}`, value: m }); });
    // add an unknown sibling key to every object
    const target = p.reduce((o, k) => o[k], base);
    if (target !== null && typeof target === 'object' && !Array.isArray(target)) { const m = clone(base); p.reduce((o, k) => o[k], m).zzUnknown = 1; out.push({ why: `unknown key under ${p.join('.')}`, value: m }); }
  }
  const top = clone(base); top.zzUnknown = 1; out.push({ why: 'unknown top-level key', value: top });
  return out;
}

const withFull = (p) => {
  p.provenance = { purpose: 'practice', sourceResponseId: 'r', sourceReviewId: 'rv', sourceMaterialId: 'm', createdAt: '2026-10-02T09:00:00.000Z', author: { type: 'human', displayLabel: 'L' }, extensions: { a: 1 } };
  return p;
};
const BASES = {
  objective: [
    nativeObjective('o1', 'paper-a', { wrong: ['q1'] }),
    withFull(nativeObjective('o2', 'paper-a', { wrong: [], items: ['q1'], intent: 'test', feedbackTiming: 'submit-at-end' })),
    nativeObjective('o3', 'paper-a', { wrong: [], items: ['q1'], provenance: { purpose: 'retry', sourceResponseId: 'r', sourceMaterialId: 'paper-a' } }),
  ],
  translation: [
    nativeTranslation('t1', 'doc-1', { annotations: [['ti-1', 'unknown', 4, 15]], marks: [['ti-1', 'uncertain']] }),
    withFull(nativeTranslation('t2', 'doc-1', { items: ['a', 'b'], marks: [['a', 'should_know']] })),
    nativeTranslation('t3', 'doc-9', { provenance: { purpose: 'retry', sourceResponseId: 'r', sourceMaterialId: 'doc-1' } }),
  ],
};
// an optional field the fixtures do not carry: a mark with its optional createdAt
BASES.translation[0].learnerItemMarks[0].createdAt = '2026-10-02T09:00:00.000Z';

for (const [domain, bases] of Object.entries(BASES)) {
  test(`${domain}: every base payload is accepted by the adapter, V1 and the public schema`, () => {
    for (const b of bases) {
      assert.deepEqual(ADAPTERS[domain].validate(b), [], b.id);
      assert.equal(validateLearnerResponse(b).valid, true, b.id);
      assert.equal(validateSchema(b), true, JSON.stringify(validateSchema.errors));
    }
  });

  test(`${domain}: adapter-accepted set is a subset of V1-validator + public-schema accepted set (systematic mutation)`, () => {
    let total = 0; let adapterRejected = 0; const violations = [];
    for (const b of bases) {
      for (const { why, value } of mutants(b)) {
        total += 1;
        if (ADAPTERS[domain].validate(value).length !== 0) { adapterRejected += 1; continue; }
        const v1 = validateLearnerResponse(value);
        const ok = validateSchema(value);
        if (!v1.valid || !ok) violations.push(`${b.id} ${why}: V1=${v1.valid} schema=${ok}`);
      }
    }
    assert.deepEqual([...new Set(violations.map((x) => x.replace(/pool[d+] .*:/, ":").replace(/.d+./g, ".N.")))].slice(0, 40), [], `${violations.length} of ${total} mutants accepted by the adapter but rejected by V1 or the schema`);
    assert.ok(total > 500 && adapterRejected > total / 3, `the pool exercises the boundary (${adapterRejected}/${total} rejected)`);
  });
}

test('named schema conditions: quiz-paper snapshot items carry `type`; whitespace-only identities are V1-invalid', () => {
  const o = nativeObjective('o', 'paper-a'); delete o.material.snapshot.items[0].type;
  assert.equal(validateSchema(o), false, 'precondition: the schema requires item.type for quiz-paper');
  assert.notEqual(ADAPTERS.objective.validate(o).length, 0);
  const ws = nativeObjective('o', 'paper-a'); ws.id = '   ';
  assert.equal(validateLearnerResponse(ws).valid, false, 'precondition: V1 trims');
  assert.notEqual(ADAPTERS.objective.validate(ws).length, 0);
  const p = nativeTranslation('t', 'doc-1'); p.provenance = { purpose: 'practice', sourceResponseId: 7 };
  assert.equal(validateSchema(p), false);
  assert.notEqual(ADAPTERS.translation.validate(p).length, 0, 'optional provenance fields keep their schema types');
  const mk = nativeTranslation('t', 'doc-1', { marks: [['ti-1', 'unknown']] }); mk.learnerItemMarks[0].createdAt = 5;
  assert.equal(validateSchema(mk), false);
  assert.notEqual(ADAPTERS.translation.validate(mk).length, 0, 'an optional mark createdAt keeps its schema type');
});
