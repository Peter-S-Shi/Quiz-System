// Typed client for the Rust Store Port. The WebView holds no SQL and no file-system capability: it sends
// named commands through one IPC entry point and receives a JSON envelope. Canonical data lives behind
// that boundary - never in localStorage / IndexedDB / any other browser-origin storage.

export class StorePortError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'StorePortError';
    this.code = code;
  }
}

/**
 * @param {(command: string, args: object) => Promise<{ok: boolean, result?: any, error?: {code: string, message: string}}>} transport
 */
export function createStorePort(transport) {
  async function call(command, args = {}) {
    let envelope;
    try {
      envelope = await transport(command, args);
    } catch (e) {
      throw new StorePortError('TRANSPORT', String(e?.message ?? e));
    }
    if (!envelope || envelope.ok !== true) {
      const err = envelope?.error ?? { code: 'TRANSPORT', message: 'malformed response' };
      throw new StorePortError(err.code, err.message);
    }
    return envelope.result;
  }
  return {
    call,
    schemaInfo: () => call('schema.info'),
    read: async (collection, query = {}) => (await call('store.read', { collection, query })).records,
    count: async (collection) => (await call('store.count', { collection })).count,
    /** ONE Unit of Work = one transaction. There is deliberately no multi-call transaction API. */
    commit: (uow) => call('store.commit', { uow }),
    checkConsistency: () => call('store.check_consistency'),
    locateMedia: (id) => call('media.locate', { id }),
    listSnapshots: async () => (await call('snapshots.list')).snapshots,
    // V1 migration (ADR 0002): only the path-free steps; choosing the file is a native Rust flow.
    migrationStatus: () => call('migration.status'),
    migrationConfirm: (reportHash) => call('migration.confirm', { reportHash }),
    migrationCancel: () => call('migration.cancel'),
    migrationUndo: (runOpId) => call('migration.undo', { runOpId }),
  };
}

/** The Tauri transport (the only place that touches the IPC global). */
export function tauriTransport(tauri = globalThis.__TAURI__) {
  if (!tauri?.core?.invoke) throw new Error('Tauri IPC is not available');
  return (command, args) => tauri.core.invoke('port', { command, args });
}
