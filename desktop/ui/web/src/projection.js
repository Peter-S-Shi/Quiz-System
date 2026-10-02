// Projection builder: the JS domain layer derives the indexed columns / relationship rows for a payload
// from the declarative collection spec the Rust core publishes in `schema.info`. Rust recomputes the same
// thing and rejects a Unit of Work whose projection disagrees (ADR 0001 sections 5.2 and 5.3), so a bug
// here can never silently persist drift - it is rejected as a whole.

export class ProjectionError extends Error {}

function pointer(doc, ptr) {
  if (ptr === '') return doc;
  let cur = doc;
  for (const raw of ptr.split('/').slice(1)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    cur = Array.isArray(cur) ? cur[/^\d+$/.test(key) ? Number(key) : -1] : cur[key];
    if (cur === undefined) return undefined;
  }
  return cur;
}

function valueFor(col, doc, what) {
  const v = pointer(doc, col.pointer);
  if (v === undefined || v === null) {
    if (col.required) throw new ProjectionError(`${what}: required field '${col.pointer}' is missing`);
    return null;
  }
  const ok =
    (col.kind === 'text' && typeof v === 'string') ||
    (col.kind === 'integer' && Number.isSafeInteger(v)) ||
    (col.kind === 'real' && typeof v === 'number' && Number.isFinite(v)) ||
    (col.kind === 'bool' && typeof v === 'boolean');
  if (!ok) throw new ProjectionError(`${what}: field '${col.pointer}' is not a valid ${col.kind}`);
  return v;
}

export function projectionFor(spec, id, payload) {
  const what = `${spec.name}/${id}`;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ProjectionError(`${what}: payload must be a JSON object`);
  }
  if (spec.idPointer && pointer(payload, spec.idPointer) !== id) {
    throw new ProjectionError(`${what}: payload identity at '${spec.idPointer}' does not match the record id`);
  }
  const columns = {};
  for (const c of spec.columns) columns[c.name] = valueFor(c, payload, what);
  const relations = {};
  for (const r of spec.relations) {
    const arr = pointer(payload, r.pointer);
    if (arr !== undefined && arr !== null && !Array.isArray(arr)) throw new ProjectionError(`${what}: '${r.pointer}' must be an array`);
    const rows = [];
    const seen = new Set();
    for (const el of arr ?? []) {
      const row = {};
      for (const c of r.columns) row[c.name] = valueFor(c, el, `${what} ${r.table}`);
      if (r.dedupe) {
        const key = JSON.stringify(Object.values(row));
        if (seen.has(key)) continue;
        seen.add(key);
      }
      rows.push(row);
    }
    relations[r.table] = rows;
  }
  return { columns, relations };
}

/** A `put` operation with its projection computed from the spec. */
export function putOp(spec, id, payload) {
  return { op: 'put', collection: spec.name, id, payload, proj: projectionFor(spec, id, payload) };
}

export function deleteOp(collection, id) {
  return { op: 'delete', collection, id };
}
