// Canonical, deterministic JSON and its SHA-256 (ADR 0001 section 5.3, "lossless structured-JSON fidelity").
//
// This is the JS half of a two-language contract; the Rust half is `desktop/core/store/src/canon.rs`.
// Shared vectors (`desktop/core/store/tests/fixtures/canonical-vectors.json`) prove they agree:
//  * object keys sorted by Unicode code point (== UTF-8 byte order, NOT JS's default UTF-16 order);
//  * arrays keep their order; no insignificant whitespace; strings never normalized;
//  * numbers print with ECMAScript Number::toString (so 1.0, 1 and 1e0 are one value);
//  * integers outside the JS safe range must travel as strings (ADR 0001 A4) - this module refuses them,
//    because JS has already lost precision before any Rust code could see the value.

function compareCodePoints(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i += 1) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

function write(value, path) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`${path}: non-finite numbers are not JSON`);
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        throw new RangeError(`${path}: integer ${value} exceeds the JS safe range; carry it as a string (ADR 0001 A4)`);
      }
      return String(value); // ECMAScript Number::toString; -0 -> "0"
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((v, i) => write(v, `${path}[${i}]`)).join(',')}]`;
      const keys = Object.keys(value).sort(compareCodePoints);
      return `{${keys.map((k) => `${JSON.stringify(k)}:${write(value[k], `${path}.${k}`)}`).join(',')}}`;
    }
    default:
      throw new TypeError(`${path}: ${typeof value} is not JSON`);
  }
}

export function canonical(value) {
  return write(value, '$');
}

export async function hashHex(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
