// RC delivery-critical data journeys against the data root of the INSTALLED candidate (synthetic data only).
//
//   node desktop/scripts/rc-data-journeys.mjs snapshot <data-root> <out.json>
//   node desktop/scripts/rc-data-journeys.mjs journeys <data-root> <snapshot.json> <report.json>
//
// <data-root> is the application data folder (…/io.github.peter-s-shi.quiz-studio). The app must NOT be running.
// What this proves, and what it does not: the installed RC upgraded this root; this script then drives the SAME Rust
// store / archive / migration crates the packaged exe links (through `qs-scenario`, built at the same HEAD) against that
// root. It is not the GUI path (native dialogs); that is the Product Owner RC smoke. Reported as such.
//
// journeys: (1) data that existed before the upgrade is byte-for-byte unchanged, (2) a V2 backup is created,
// (3) content added after the backup is gone after the restore and the original data returns, (4) a valid synthetic V1
// backup migrates (history, learner responses, review, media), (5) repeating it is "already migrated", (6) a truncated /
// invalid V1 source fails closed and changes nothing.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBridge, scenarioBinary } from '../ui/tests/integration/bridge.mjs';
import { createLibrary } from '../ui/web/src/product/library.js';
import { paperWithExplanations } from '../ui/tests/objective-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, '..', 'core', 'migrate_v1', 'tests', 'fixtures');
const VOLATILE = new Set(['setting', 'recovery_session']); // the app itself writes these on every launch

/** One digest per collection (id, revision, payload) over everything the learner owns. */
async function digest(root) {
  const bridge = openBridge(root);
  try {
    const info = await bridge.port.schemaInfo();
    const out = {};
    for (const c of info.collections) {
      if (VOLATILE.has(c.name)) continue;
      const rows = await bridge.port.read(c.name);
      out[c.name] = { count: rows.length, sha256: crypto.createHash('sha256').update(JSON.stringify(rows.map((r) => [r.id, r.rev, r.payload]))).digest('hex') };
    }
    return out;
  } finally {
    await bridge.close();
  }
}
/** Every record's identity and content, so "untouched" can be asserted per record, not just by count. */
async function rowHashes(root) {
  const bridge = openBridge(root);
  try {
    const out = new Map();
    for (const c of (await bridge.port.schemaInfo()).collections) {
      if (VOLATILE.has(c.name)) continue;
      for (const r of await bridge.port.read(c.name)) out.set(`${c.name}/${r.id}`, crypto.createHash('sha256').update(JSON.stringify([r.rev, r.payload])).digest('hex'));
    }
    return out;
  } finally {
    await bridge.close();
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const delta = (after, before, name) => (after[name]?.count ?? 0) - (before[name]?.count ?? 0);

function scenario(args) {
  const r = spawnSync(scenarioBinary(), args, { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout.trim().split('\n').filter(Boolean).pop()); } catch { /* not JSON */ }
  return { status: r.status, json, stderr: r.stderr };
}

const [mode, root, a3, a4] = process.argv.slice(2);
if (mode === 'snapshot') {
  const snap = await digest(root);
  fs.writeFileSync(a3, JSON.stringify({ digest: snap, rows: Object.fromEntries(await rowHashes(root)) }, null, 2));
  console.log(`snapshot: ${Object.entries(snap).filter(([, v]) => v.count).map(([k, v]) => `${k}=${v.count}`).join(' ')}`);
} else if (mode === 'journeys') {
  const snapshot = JSON.parse(fs.readFileSync(a3, 'utf8'));
  const before = snapshot.digest;
  const checks = {};
  const check = (name, ok, detail = '') => { checks[name] = { ok: Boolean(ok), detail: String(detail) }; console.log(`${ok ? 'ok:  ' : 'FAIL:'} ${name}${detail ? ` ${detail}` : ''}`); };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-rc-'));
  try {
    // 1. an existing V2 data root survives the upgrade into the RC, unchanged
    const upgraded = await digest(root);
    // every record that existed before the upgrade is still there, byte for byte (identity, revision, content). The app itself may add
    // planning records on launch (the accepted Learning Orchestration sweep: engine schedules / suggestions): reported, not a loss.
    const rowsUpgraded = await rowHashes(root);
    const lost = Object.keys(snapshot.rows).filter((k) => rowsUpgraded.get(k) !== snapshot.rows[k]);
    const added = {};
    for (const k of rowsUpgraded.keys()) if (!(k in snapshot.rows)) added[k.split('/')[0]] = (added[k.split('/')[0]] ?? 0) + 1;
    check('data.survived_upgrade_unchanged', lost.length === 0 && Object.keys(snapshot.rows).length > 0, lost.length ? `LOST OR CHANGED: ${lost.slice(0, 5).join(', ')}` : `${Object.keys(snapshot.rows).length} pre-upgrade records identical; app-created on launch: ${JSON.stringify(added)}`);

    // 2. V2 backup of the RC data root
    const archive = path.join(work, 'rc-backup.qsarchive');
    const made = scenario(['product-archive-create', root, archive]);
    check('backup.created', made.status === 0 && fs.existsSync(archive) && fs.statSync(archive).size > 0, made.status === 0 ? `${fs.statSync(archive).size} bytes, media ${made.json?.mediaCount}` : made.stderr.slice(0, 200));

    // 3. add content, then restore: the addition is gone and the original data is back
    const bridge = openBridge(root);
    try {
      let n = 0;
      const library = await createLibrary({ port: bridge.port, now: () => new Date(Date.UTC(2026, 9, 4, 12, 0, n++)).toISOString() });
      await library.savePaper({ ...paperWithExplanations({ id: 'paper-added-after-backup' }), title: 'Added after the backup' });
    } finally {
      await bridge.close();
    }
    const withExtra = await digest(root);
    check('backup.content_added_after', delta(withExtra, upgraded, 'paper') === 1);
    const restored = scenario(['product-archive-restore', root, archive]);
    check('restore.ran', restored.status === 0, restored.status === 0 ? '' : restored.stderr.slice(0, 200));
    const afterRestore = await digest(root);
    const rowsAfterRestore = await rowHashes(root);
    check('restore.content_added_after_is_gone', delta(afterRestore, upgraded, 'paper') === 0);
    check('restore.original_data_returns', same(afterRestore, upgraded));

    // 4. a valid synthetic V1 backup migrates
    const src = path.join(fixtures, 'r-full.json');
    const migrated = scenario(['migrate-product', root, src]);
    check('migration.valid_v1_backup_done', migrated.status === 0 && migrated.json?.result === 'done', JSON.stringify(migrated.json ?? migrated.stderr.slice(0, 160)));
    const afterMigration = await digest(root);
    const rowsAfterMigration = await rowHashes(root);
    check('migration.history_and_responses_preserved', delta(afterMigration, afterRestore, 'learner_response') >= 2 && delta(afterMigration, afterRestore, 'paper') >= 2 && delta(afterMigration, afterRestore, 'teacher_review') >= 1,
      `paper +${delta(afterMigration, afterRestore, 'paper')}, learner_response +${delta(afterMigration, afterRestore, 'learner_response')}, teacher_review +${delta(afterMigration, afterRestore, 'teacher_review')}, translation_document +${delta(afterMigration, afterRestore, 'translation_document')}`);
    check('migration.media_preserved', delta(afterMigration, afterRestore, 'media_object') >= 2, `media_object +${delta(afterMigration, afterRestore, 'media_object')}`);
    check('migration.existing_v2_records_untouched', [...rowsAfterRestore].every(([k, h]) => rowsAfterMigration.get(k) === h), `${rowsAfterRestore.size} records compared`);

    // 5. repeating the same import is recognised
    const again = scenario(['migrate-product', root, src]);
    check('migration.repeat_is_already_migrated', again.status === 0 && again.json?.result === 'already-migrated', JSON.stringify(again.json ?? ''));
    check('migration.repeat_changes_nothing', same(await digest(root), afterMigration));

    // 6. an invalid V1 source fails closed and changes nothing
    const bad = path.join(work, 'truncated-backup.json');
    const full = fs.readFileSync(src);
    fs.writeFileSync(bad, full.subarray(0, Math.floor(full.length / 2)));
    const blocked = scenario(['migrate-product', root, bad]);
    check('migration.invalid_source_blocked', blocked.status === 3 && blocked.json?.result === 'blocked', `exit ${blocked.status}`);
    check('migration.invalid_source_changes_nothing', same(await digest(root), afterMigration));
  } catch (e) {
    check('journeys.exception', false, e?.stack ?? e);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  const ok = Object.values(checks).every((c) => c.ok);
  fs.writeFileSync(a4, JSON.stringify({ ok, scope: 'exact-head Rust crates against the installed RC data root (not the GUI path)', checks }, null, 2));
  process.exit(ok ? 0 : 1);
} else {
  console.error('usage: rc-data-journeys.mjs snapshot <root> <out> | journeys <root> <snapshot> <report>');
  process.exit(2);
}
