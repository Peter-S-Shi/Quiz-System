// Independent oracles for the Migration milestone tests (ADR 0002 section 16.2-2 and 14.2).
//
//   node desktop/scripts/migration-oracle.mjs <v1-backup.json>
//
// Prints one JSON object:
//   v1     - the verdict of V1's own `parseLibraryBackup` ("would V1 accept this backup?"), the differential oracle;
//   hashes - canonical hashes of every source entity computed with the JS canonicalizer (`canonical.js`, whose
//            vectors are shared with the Rust one), keyed by RFC 6901 pointer. The Rust tests compare these with
//            the hashes recorded in `migration_origin` - an independent check of "source value == stored payload".

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseLibraryBackup } from '../../src/core/backup.js';
import { canonical } from '../ui/web/src/canonical.js';

const text = readFileSync(process.argv[2], 'utf8').replace(/^﻿/, '');
const value = JSON.parse(text);

let v1;
try {
  parseLibraryBackup(structuredClone(value));
  v1 = { accepted: true };
} catch (e) {
  v1 = { accepted: false, error: String(e && e.message ? e.message : e) };
}

const hash = (v) => createHash('sha256').update(canonical(v)).digest('hex');
const hashes = {};
const walk = (arr, base, f = (x) => x) => {
  if (!Array.isArray(arr)) return;
  arr.forEach((x, i) => {
    hashes[`${base}/${i}`] = hash(f(x));
  });
};
walk(value?.library?.papers, '/library/papers');
walk(value?.learnerResponses, '/learnerResponses');
walk(value?.teacherReviews, '/teacherReviews');
walk(value?.translationLibrary?.folders, '/translationLibrary/folders');
walk(value?.translationLibrary?.documents, '/translationLibrary/documents');
walk(value?.history, '/history', (e) => e);
const assetKey = Array.isArray(value?.mediaAssets) ? 'mediaAssets' : 'assets';
walk(value?.[assetKey], `/${assetKey}`, (a) => {
  const { data, ...meta } = a;
  return meta;
});
if (Array.isArray(value?.library?.categories)) hashes['/library/categories'] = hash({ categories: value.library.categories });

console.log(JSON.stringify({ v1, hashes }));
