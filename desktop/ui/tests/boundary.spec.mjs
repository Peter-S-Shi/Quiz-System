import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../web', import.meta.url));
function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'tests' || n === 'node_modules') return [];
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
// comments may legitimately *name* the forbidden APIs while explaining the rule
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const shipped = files(root).filter((p) => /\.(js|mjs|html|css)$/.test(p));

test('there is shipped UI to inspect', () => {
  assert.ok(shipped.length >= 4, `found ${shipped.length} files`);
});

test('canonical data never touches browser-origin storage (Scope Freeze 5.1)', () => {
  for (const p of shipped) {
    assert.doesNotMatch(stripComments(readFileSync(p, 'utf8')), /localStorage|sessionStorage|indexedDB|document\.cookie|caches\./, p);
  }
});

test('no raw filesystem path or asset-URL conversion is used by the shell (raw paths never cross into JS)', () => {
  for (const p of shipped) {
    assert.doesNotMatch(stripComments(readFileSync(p, 'utf8')), /convertFileSrc|absolutePath|dataRoot|asset:|asset\.localhost/, p);
  }
});

test('the shell works offline: no remote URLs, CDNs or web fonts are referenced', () => {
  for (const p of shipped) {
    const text = readFileSync(p, 'utf8').replace(/xmlns(:\w+)?="[^"]*"/g, '');
    assert.doesNotMatch(text, /https?:\/\//, p);
    assert.doesNotMatch(text, /@import\s+url|fonts\.googleapis/, p);
  }
});
