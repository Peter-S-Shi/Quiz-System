// Developer aid (not part of CI): serve the real product over a throwaway real store with sample data, for looking at it in
// a browser. Usage: node ui/selftest/dev-server.mjs [port]  ->  http://127.0.0.1:<port>/selftest/product-harness.html
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openBridge } from '../tests/integration/bridge.mjs';
import { serve } from './serve.mjs';
import { seedSample } from './sample-data.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-dev-'));
const bridge = openBridge(path.join(dir, 'qs-data'));
await seedSample(bridge.port);
const onPort = async (command, args) => {
  try { return { ok: true, result: await bridge.port.call(command, args) }; } catch (e) { return { ok: false, error: { code: e.code ?? 'TRANSPORT', message: String(e.message) } }; }
};
const { port } = await serve(Number(process.argv[2] ?? 8123), { onPort });
console.log(`http://127.0.0.1:${port}/selftest/product-harness.html`);
process.on('SIGINT', async () => { await bridge.close(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(0); });
