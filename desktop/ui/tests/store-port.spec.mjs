import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorePort, StorePortError, tauriTransport } from '../web/src/store-port.js';

test('commit is exactly one transport call carrying the whole Unit of Work', async () => {
  const calls = [];
  const port = createStorePort(async (command, args) => {
    calls.push([command, args]);
    return { ok: true, result: { ops: 2 } };
  });
  const uow = { ops: [{ op: 'delete', collection: 'setting', id: 'a' }, { op: 'delete', collection: 'setting', id: 'b' }] };
  assert.deepEqual(await port.commit(uow), { ops: 2 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['store.commit', { uow }]);
});

test('error envelopes become StorePortError with the stable code', async () => {
  const port = createStorePort(async () => ({ ok: false, error: { code: 'REJECT_PROJECTION', message: 'drift' } }));
  await assert.rejects(port.commit({ ops: [] }), (e) => e instanceof StorePortError && e.code === 'REJECT_PROJECTION');
});

test('transport failures and malformed responses are reported, not swallowed', async () => {
  await assert.rejects(createStorePort(async () => { throw new Error('ipc down'); }).schemaInfo(), (e) => e.code === 'TRANSPORT');
  await assert.rejects(createStorePort(async () => null).schemaInfo(), (e) => e.code === 'TRANSPORT');
});

test('the Store Port surface carries no path and matches the WebView allowlist', async () => {
  const seen = [];
  const port = createStorePort(async (command, args) => { seen.push([command, args]); return { ok: true, result: { records: [], count: 0, snapshots: [] } }; });
  assert.equal(port.verifyBackup, undefined);
  await port.schemaInfo(); await port.read('setting'); await port.count('setting'); await port.commit({ ops: [] });
  await port.checkConsistency(); await port.locateMedia('m'); await port.listSnapshots();
  const hasPathArg = (v) => v && typeof v === 'object' && Object.entries(v).some(([k, x]) => /path|dest/i.test(k) || hasPathArg(x));
  for (const [command, args] of seen) assert.equal(hasPathArg(args), false, command);
  assert.equal(seen.some(([c]) => c === 'media.gc' || c.startsWith('backup.')), false);
});

test('read unwraps records; the tauri transport requires the IPC global', async () => {
  const port = createStorePort(async () => ({ ok: true, result: { records: [{ id: 'x', rev: 1, payload: {} }] } }));
  assert.equal((await port.read('setting'))[0].id, 'x');
  assert.throws(() => tauriTransport({}), /not available/);
  const seen = [];
  const t = tauriTransport({ core: { invoke: async (name, a) => { seen.push([name, a]); return { ok: true, result: 1 }; } } });
  await t('store.count', { collection: 'setting' });
  assert.deepEqual(seen, [['port', { command: 'store.count', args: { collection: 'setting' } }]]);
});
