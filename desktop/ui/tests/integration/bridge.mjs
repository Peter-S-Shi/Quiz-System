// Test bridge: drive the JS domain layer against the REAL Rust store. `qs-scenario port-serve` exposes the same
// WebView dispatch (allowlist included) over stdin/stdout, so constraints, revisions, archives and the fault checkpoints
// under test are the shipped ones. Synthetic data only.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createStorePort, StorePortError } from '../../web/src/store-port.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..', '..', '..');

export function scenarioBinary() {
  const exe = process.platform === 'win32' ? 'qs-scenario.exe' : 'qs-scenario';
  const p = process.env.QS_SCENARIO_BIN || path.join(desktop, 'target', 'debug', exe);
  if (!fs.existsSync(p)) throw new Error(`qs-scenario binary not found at ${p}; build it with: cargo build -p qs-scenarios --bin qs-scenario`);
  return p;
}

export const fixturePath = (name) => path.join(desktop, 'core', 'migrate_v1', 'tests', 'fixtures', name);

export function tempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-orch-'));
  return { dir, root: path.join(dir, 'qs-data'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Run a one-shot scenario command; returns { status, stdout, stderr }. */
export function scenario(args, { env = {} } = {}) {
  const r = spawnSync(scenarioBinary(), args, { env: { ...process.env, ...env }, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Open the product store behind a JSON-lines pipe and return a Store Port client plus lifecycle helpers. */
export function openBridge(root, { env = {} } = {}) {
  const child = spawn(scenarioBinary(), ['port-serve', root], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = [];
  let exited = null;
  const done = new Promise((resolve) => child.on('exit', (code) => { exited = code ?? -1; for (const p of pending.splice(0)) p.reject(new Error('process exited')); resolve(code); }));
  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    const p = pending.shift();
    if (p) p.resolve(JSON.parse(line));
  });
  child.stderr.on('data', () => {});
  const transport = (command, args) => new Promise((resolve, reject) => {
    if (exited !== null) return reject(new Error('process exited'));
    pending.push({ resolve, reject });
    child.stdin.write(`${JSON.stringify({ command, args })}\n`, (err) => err && reject(err));
  });
  const port = createStorePort(transport);
  return {
    port,
    child,
    exited: () => exited,
    waitExit: () => done,
    async close() {
      if (exited === null) child.stdin.end();
      await done;
      return exited;
    },
  };
}

export { StorePortError };

/** Deterministic id source for readable assertions. */
export function counterIds(prefix = 'sch') {
  let n = 0;
  return () => `${prefix}-${String((n += 1)).padStart(3, '0')}`;
}

/** Hash of the physical content of the given collections (Evidence immutability checks). */
export async function collectionsDigest(port, names) {
  const out = {};
  for (const n of names) out[n] = (await port.read(n)).map((r) => [r.id, r.rev, JSON.stringify(r.payload)]);
  return JSON.stringify(out);
}
