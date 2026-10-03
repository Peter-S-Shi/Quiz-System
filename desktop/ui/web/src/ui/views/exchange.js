// Exchange & Backup: moving things in and out of Quiz Studio by FILE (no account, no network): Open Teaching Interchange
// documents, portable papers, full backups, restore, and the V1 -> V2 migration. Each flow previews before anything is
// stored. File dialogs and the backup / migration engines are Rust-owned; paths never reach this code.
import { defineStrings, t } from '../../i18n.js';
import { confirmDialog, domainName, fill, formatInstant, guarded, h, modal } from '../kit.js';
import { exportFile, importDocumentFlow, importPaperFlow, importRemediationFlow, importReviewFlow } from '../import-flows.js';
import { StorePortError } from '../../store-port.js';

defineStrings({
  'xch.kicker': ['Open Teaching Interchange · Backup', '开放教学交换 · 备份'],
  'xch.title': ['Exchange & backup', '交换与备份'],
  'xch.lede': ['Exchange with a teacher or any AI tool by file. No account and no network needed.', '与外部老师或任意 AI 工具交换，靠的是文件，不需要账号和网络。'],
  'xch.sec.exchange': ['Exchange', '交换'],
  'xch.sec.backup': ['Backup', '备份'],
  'xch.t.reviewRequest': ['Export for external review', '导出给外部批改'],
  'xch.t.reviewRequestBody': ['The source, your answer and your marks, as review-request.json. Give it to a teacher or an AI tool and ask for a Teacher Review back.', '原文、你的作答与标记，导出为 review-request.json。交给老师或 AI，请对方按 Teacher Review 格式返回。'],
  'xch.t.reviewImport': ['Import a teacher review', '导入教师批改'],
  'xch.t.reviewImportBody': ['The preview shows the target answer, the reviewer, the review id, and whether it is new, a repeat or an update.', '预览会显示目标作答、批改人、批改 ID，以及这是新批改、重复导入还是更新。'],
  'xch.t.remediation': ['Import remediation material', '导入补救材料'],
  'xch.t.remediationBody': ['Checks that its provenance really traces back to an answer and review you exported. If not, it is refused.', '校验它的溯源是否确实追溯到你导出的作答与批改，对不上就拒绝。'],
  'xch.t.paper': ['Quiz papers', '试卷'],
  'xch.t.paperBody': ['The portable format for Objective papers: questions, answers, explanations and media.', '客观题试卷的可移植格式：题目、答案、解析与媒体。'],
  'xch.t.documents': ['Translation documents', '翻译文档'],
  'xch.t.documentsBody': ['Import a document file or plain text; export a document as JSON.', '导入文档文件或纯文本；把文档导出为 JSON。'],
  'xch.btn.choose': ['Choose an answer…', '选择作答…'],
  'xch.btn.chooseFile': ['Choose a file…', '选择文件…'],
  'xch.btn.import': ['Import…', '导入…'],
  'xch.btn.export': ['Export…', '导出…'],
  'xch.btn.importPaper': ['Import a paper…', '导入试卷…'],
  'xch.btn.exportPaper': ['Export a paper…', '导出试卷…'],
  'xch.btn.importDoc': ['Import a document…', '导入文档…'],
  'xch.btn.exportDoc': ['Export a document…', '导出文档…'],
  'xch.pick.answer': ['Which answer?', '导出哪一份作答？'],
  'xch.pick.paper': ['Which paper?', '导出哪份试卷？'],
  'xch.pick.document': ['Which document?', '导出哪份文档？'],
  'xch.pick.none': ['Nothing to choose from yet.', '还没有可选的内容。'],
  'xch.backup.title': ['Full backup', '完整备份'],
  'xch.backup.body': ['Material, evidence, reviews, lineage and media files in one file.', '材料、证据、批改、溯源关系与媒体文件，打包成一个文件。'],
  'xch.backup.now': ['Back up now…', '立即备份…'],
  'xch.backup.written': ['Backup written: {size}, {media} media file(s), sha256 {hash}…', '备份已写入：{size}，{media} 个媒体文件，sha256 {hash}…'],
  'xch.restore.title': ['Restore from a backup', '从备份恢复'],
  'xch.restore.body': ['Preview first, then replace everything. A snapshot of your current data is kept automatically.', '先预览，再整体替换。当前数据会先自动保留一份快照。'],
  'xch.restore.choose': ['Choose a backup…', '选择备份…'],
  'xch.restore.verified': ['Verified "{name}": {entries} file(s), store schema v{schema}.', '已校验“{name}”：{entries} 个文件，存储 schema v{schema}。'],
  'xch.restore.confirmTitle': ['Replace current data?', '用备份替换当前数据？'],
  'xch.restore.confirmBody': ['Restoring replaces everything in the library with the backup. A snapshot of your current data is kept so this can be undone.', '恢复会用备份替换资料库中的全部内容。当前数据的快照会保留下来，以便撤销。'],
  'xch.restore.confirm': ['Restore', '恢复'],
  'xch.restore.cancelled': ['Restore cancelled; nothing was changed.', '已取消恢复，没有任何改动。'],
  'xch.restore.done': ['Restored. Media added: {n}. A snapshot was kept for rollback.', '已恢复。新增媒体：{n}。已保留快照以便回退。'],
  'xch.failed': ['{what} failed: {message}', '{what}失败：{message}'],
  'xch.what.backup': ['Backup', '备份'],
  'xch.what.restore': ['Restore', '恢复'],
  'xch.what.migration': ['V1 import', 'V1 导入'],
  'xch.what.artifact': ['Recovery artifact', '恢复档案'],
  'xch.what.undo': ['Undo', '撤销'],
  'mig.kicker': ['V1 → V2', 'V1 → V2'],
  'mig.title': ['Import from Quiz Studio V1', '从 Quiz Studio V1 迁移'],
  'mig.body': ['Choose a V1 full backup (JSON). You see a preview first; nothing is imported until you confirm. Your V1 file is never modified.', '选择一份 V1 完整备份（JSON）。会先给你预览，确认之后才导入。你的 V1 文件始终保持不变。'],
  'mig.artifact': ['Add a recovery artifact (optional)…', '添加恢复档案（可选）…'],
  'mig.artifactChosen': ['artifact: {name}', '档案：{name}'],
  'mig.choose': ['Choose a V1 backup…', '选择 V1 备份…'],
  'mig.alreadyImported': ['This exact backup was already imported. Nothing was changed.', '这份备份已经导入过，没有任何改动。'],
  'mig.blocked': ['This backup cannot be imported ({n} blocking problem(s)). Nothing was changed and your file was not modified.', '这份备份无法导入（{n} 个阻塞问题）。没有任何改动，你的文件也没有被修改。'],
  'mig.artifactOnly': ['This backup ("{name}") was already imported; none of its library data will change. Only the recovery artifact {hash}… will be preserved byte-for-byte; it is never activated as library data.', '这份备份（“{name}”）已经导入过，其中的资料库数据不会变化。只会逐字节保留恢复档案 {hash}…，它不会被当作资料库数据启用。'],
  'mig.preserve': ['Preserve the artifact', '保留档案'],
  'mig.preserved': ['Recovery artifact preserved. You can undo this below.', '恢复档案已保留，可以在下方撤销。'],
  'mig.preview': ['Preview of "{name}" ({size}). Review it, then confirm. Your file is never modified.', '“{name}”（{size}）的预览。请检查后再确认，你的文件不会被修改。'],
  'mig.col.kind': ['Kind', '类别'],
  'mig.col.source': ['In backup', '备份中'],
  'mig.col.imported': ['Imported', '已导入'],
  'mig.col.present': ['Already present', '已存在'],
  'mig.col.dup': ['Duplicate / not imported', '重复 / 未导入'],
  'mig.media': ['Media: {n} referenced file(s) ({size}); {o} unreferenced file(s) will not be imported.', '媒体：引用 {n} 个文件（{size}）；{o} 个未被引用的文件不会导入。'],
  'mig.unknown': ['What V1 never recorded stays unknown ({gaps})', 'V1 从未记录的内容保持“未知”（{gaps}）'],
  'mig.neverMigrated': ['Never migrated: {list}.', '不迁移：{list}。'],
  'mig.artifactNote': ['Recovery artifact {hash}… will be preserved byte-for-byte; it is never activated as library data.', '恢复档案 {hash}… 会被逐字节保留，不会被当作资料库数据启用。'],
  'mig.notes': ['{n} note(s)', '{n} 条说明'],
  'mig.confirm': ['Confirm import', '确认导入'],
  'mig.cancel': ['Cancel', '取消'],
  'mig.cancelled': ['Cancelled. Nothing was changed.', '已取消，没有任何改动。'],
  'mig.imported': ['Imported. You can undo this import below.', '已导入，可以在下方撤销。'],
  'mig.runs': ['Import history', '导入记录'],
  'mig.run.active': ['Active', '生效中'],
  'mig.run.undone': ['Undone', '已撤销'],
  'mig.run.import': ['import', '导入'],
  'mig.run.artifact': ['recovery artifact', '恢复档案'],
  'mig.undo': ['Undo', '撤销'],
  'mig.undoTitle': ['Undo this import?', '撤销这次导入？'],
  'mig.undoBody': ['Removes exactly the records this import created. It refuses if any of them was edited since or something depends on them.', '只会移除这次导入创建的记录。如果其中任何一条之后被编辑过，或有其他内容依赖它们，就会拒绝撤销。'],
  'mig.undone': ['Import undone ({n} record(s) removed).', '已撤销导入（移除了 {n} 条记录）。'],
  'mig.undoRefused': ['Undo refused: {reasons}', '无法撤销：{reasons}'],
});

const fmtBytes = (n) => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(2)} GiB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MiB` : n >= 1 << 10 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`);
const describe = (e) => (e instanceof StorePortError ? `${e.code}: ${e.message.replace(/^[A-Z_]+: /, '')}` : String(e?.message ?? e));

const ticket = (file, title, body, ...buttons) => h('div', { class: 'ticket' }, h('div', { class: 'file mono' }, file), h('h4', {}, title), h('p', { class: 'muted' }, body), h('div', { class: 'row' }, buttons));

/** Pick one entry of a list in a dialog; resolves its id or null. */
function chooseOne(title, entries) {
  return modal({ title, build: (close) => [
    entries.length
      ? h('ul', { class: 'plain picklist' }, entries.map((e) => h('li', { class: 'row' }, h('span', { class: 'grow' }, h('b', {}, e.label), e.meta ? h('span', { class: 'muted small' }, ` ${e.meta}`) : null), h('button', { class: 'btn small primary', type: 'button', onclick: () => close(e.id) }, t('common.ok')))))
      : h('p', { class: 'muted' }, t('xch.pick.none')),
    h('menu', {}, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, t('common.cancel')))] }).then((v) => (v === 'cancel' ? null : v));
}

export async function renderExchange(app, main) {
  const { native, port, toast } = app;
  const { library, reviews, exchange } = app.product;
  const guard = (what, fn) => guarded((m, o) => toast(t('xch.failed', { what, message: m }), o), fn);
  const log = h('div', { class: 'log', role: 'log', 'aria-live': 'polite', hidden: true });
  const say = (line) => { log.hidden = false; log.textContent = `${line}\n${log.textContent}`; };

  // --------------------------------------------------------------------------------------- exchange
  const answers = async () => (await reviews.list()).map((r) => ({ id: r.id, label: r.title || t('common.untitled'), meta: `${domainName(r.domain)} · ${r.completedAt ? formatInstant(r.completedAt) : ''}` }));
  const tickets = h('div', { class: 'tickets' },
    ticket('review-request.json', t('xch.t.reviewRequest'), t('xch.t.reviewRequestBody'),
      h('button', { class: 'btn small', type: 'button', onclick: guarded(toast, async () => { const id = await chooseOne(t('xch.pick.answer'), await answers()); if (id) await exportFile(app, await reviews.exportReviewRequest(id)); }) }, t('xch.btn.choose'))),
    ticket('teacher-review.json', t('xch.t.reviewImport'), t('xch.t.reviewImportBody'), h('button', { class: 'btn small', type: 'button', onclick: guarded(toast, () => importReviewFlow(app)) }, t('xch.btn.chooseFile'))),
    ticket('translation-document.json', t('xch.t.remediation'), t('xch.t.remediationBody'), h('button', { class: 'btn small', type: 'button', onclick: guarded(toast, () => importRemediationFlow(app)) }, t('xch.btn.chooseFile'))),
    ticket('quiz-paper.json', t('xch.t.paper'), t('xch.t.paperBody'),
      h('button', { class: 'btn small', type: 'button', onclick: guarded(toast, () => importPaperFlow(app)) }, t('xch.btn.importPaper')),
      h('button', { class: 'btn small', type: 'button', onclick: guarded(toast, async () => { const l = await library.list(); const id = await chooseOne(t('xch.pick.paper'), l.papers.map((p) => ({ id: p.id, label: p.title || t('common.untitled'), meta: t('common.questions', { n: p.count }) }))); if (id) await exportFile(app, await exchange.exportPaper(id)); }) }, t('xch.btn.exportPaper'))),
    ticket('translation-document.json', t('xch.t.documents'), t('xch.t.documentsBody'),
      h('button', { class: 'btn small', type: 'button', onclick: guarded(toast, () => importDocumentFlow(app)) }, t('xch.btn.importDoc')),
      h('button', { class: 'btn small', type: 'button', onclick: guarded(toast, async () => { const l = await library.list(); const id = await chooseOne(t('xch.pick.document'), l.documents.map((d) => ({ id: d.id, label: d.title || t('common.untitled'), meta: t('common.sentences', { n: d.count }) }))); if (id) await exportFile(app, await exchange.exportDocument(id)); }) }, t('xch.btn.exportDoc'))));

  // -------------------------------------------------------------------------------------------- backup
  const backups = h('div', { class: 'tickets' },
    ticket('*.qsarchive', t('xch.backup.title'), t('xch.backup.body'), h('button', { class: 'btn small primary', type: 'button', id: 'backup-now', onclick: guard(t('xch.what.backup'), async () => {
      const r = await native.backupSave();
      if (r) say(t('xch.backup.written', { size: fmtBytes(r.bytes), media: r.mediaCount, hash: r.sha256.slice(0, 12) }));
    }) }, t('xch.backup.now'))),
    ticket('*.qsarchive', t('xch.restore.title'), t('xch.restore.body'), h('button', { class: 'btn small', type: 'button', id: 'restore-choose', onclick: guard(t('xch.what.restore'), async () => {
      const picked = await native.backupPick();
      if (!picked) return;
      say(t('xch.restore.verified', { name: picked.name, entries: picked.verified.entries, schema: picked.verified.storeSchemaVersion }));
      if (!(await confirmDialog({ title: t('xch.restore.confirmTitle'), body: t('xch.restore.confirmBody'), okLabel: t('xch.restore.confirm'), danger: true }))) { say(t('xch.restore.cancelled')); return; }
      const r = await native.backupRestore();
      say(t('xch.restore.done', { n: r.mediaAdded }));
      await app.refreshChrome();
    }) }, t('xch.restore.choose'))));

  // ------------------------------------------------------------------------------------- V1 migration
  const box = h('div', { class: 'migration' });
  const runs = h('ul', { class: 'diag' });
  const artifactNote = h('span', { class: 'mono' });
  const refreshRuns = async () => {
    const st = await port.migrationStatus();
    fill(runs, st.runs.map((run) => h('li', {}, `${run.undone ? t('mig.run.undone') : t('mig.run.active')} ${run.kind === 'artifact-attach' ? t('mig.run.artifact') : t('mig.run.import')} ${run.activatedAt ?? ''} `,
      run.undone ? null : h('button', { class: 'btn small', type: 'button', onclick: guard(t('xch.what.undo'), async () => {
        if (!(await confirmDialog({ title: t('mig.undoTitle'), body: t('mig.undoBody'), okLabel: t('mig.undo'), danger: true }))) return;
        const out = await port.migrationUndo(run.opId);
        say(out.result === 'done' ? t('mig.undone', { n: out.recordsDeleted }) : t('mig.undoRefused', { reasons: out.reasons.map((x) => x.reason).join('; ') }));
        await refreshRuns();
        await app.refreshChrome();
      }) }, t('mig.undo')))));
  };
  const diagnosticRow = (d) => {
    const params = d.params && Object.keys(d.params).length ? ` ${JSON.stringify(d.params)}` : '';
    return h('li', { class: d.severity === 'blocking' ? 'bad' : '' }, h('b', {}, d.code), d.pointer ? ` at ${d.pointer}` : '', params.length > 220 ? `${params.slice(0, 220)}...` : params);
  };
  const confirmRow = (result, okMessage) => h('div', { class: 'row' },
    h('button', { class: 'btn primary', type: 'button', id: 'mig-confirm', onclick: guard(t('xch.what.migration'), async () => {
      const out = await port.migrationConfirm(result.reportHash);
      fill(box, h('p', {}, out.result === 'done' ? okMessage : t('mig.alreadyImported')));
      await refreshRuns();
      await app.refreshChrome();
    }) }, result.report.plan.mode === 'artifact-only' ? t('mig.preserve') : t('mig.confirm')),
    h('button', { class: 'btn', type: 'button', onclick: guard(t('xch.what.migration'), async () => { await port.migrationCancel(); fill(box, h('p', {}, t('mig.cancelled'))); }) }, t('mig.cancel')));
  function migrationPreview(result) {
    const r = result.report;
    const blocking = r.diagnostics.filter((d) => d.severity === 'blocking');
    if (result.alreadyMigrated) return fill(box, h('p', {}, t('mig.alreadyImported')));
    if (result.blocked) return fill(box, h('div', { class: 'error-box', role: 'alert' }, t('mig.blocked', { n: blocking.length })), h('ul', { class: 'diag' }, blocking.map(diagnosticRow)));
    if (r.plan.mode === 'artifact-only') return fill(box, h('p', {}, t('mig.artifactOnly', { name: r.sourceName, hash: r.recoveryArtifact.sha256.slice(0, 12) })), confirmRow(result, t('mig.preserved')));
    const rowsEl = Object.entries(r.counts).map(([kind, c]) => h('tr', {}, h('td', {}, kind), h('td', {}, c.source), h('td', {}, c.carried ?? 0), h('td', {}, c.deduplicatedIdentical ?? 0), h('td', {}, (c.collapsed ?? 0) + (c.reportedUnmigrated ?? 0))));
    const gaps = Object.entries(r.loss.gaps).map(([k, n]) => `${k}: ${n}`).join('; ');
    return fill(box,
      h('p', {}, t('mig.preview', { name: r.sourceName, size: fmtBytes(r.sourceBytes) })),
      h('table', { class: 'counts' }, h('thead', {}, h('tr', {}, ['mig.col.kind', 'mig.col.source', 'mig.col.imported', 'mig.col.present', 'mig.col.dup'].map((k) => h('th', {}, t(k))))), h('tbody', {}, rowsEl)),
      h('p', {}, t('mig.media', { n: r.media.referenced, size: fmtBytes(r.media.decodedBytes), o: r.media.unreferencedNotMigrated })),
      h('details', {}, h('summary', {}, t('mig.unknown', { gaps: gaps || t('common.none') })), h('p', {}, t('mig.neverMigrated', { list: r.loss.notMigrated.join(', ') }))),
      r.recoveryArtifact ? h('p', {}, t('mig.artifactNote', { hash: r.recoveryArtifact.sha256.slice(0, 12) })) : null,
      h('details', {}, h('summary', {}, t('mig.notes', { n: r.diagnostics.length })), h('ul', { class: 'diag' }, r.diagnostics.map(diagnosticRow))),
      confirmRow(result, t('mig.imported')));
  }
  const migration = h('section', { class: 'card migr', 'aria-labelledby': 'mig-h' },
    h('div', { class: 'kicker' }, t('mig.kicker')), h('h3', { id: 'mig-h' }, t('mig.title')), h('p', { class: 'muted' }, t('mig.body')),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: guard(t('xch.what.artifact'), async () => { const r = await native.migrationArtifact(); if (r) artifactNote.textContent = t('mig.artifactChosen', { name: r.name }); }) }, t('mig.artifact')),
      artifactNote,
      h('button', { class: 'btn primary', type: 'button', id: 'mig-choose', onclick: guard(t('xch.what.migration'), async () => { const r = await native.migrationPrepare(); if (r) migrationPreview(r); }) }, t('mig.choose'))),
    box, h('h4', {}, t('mig.runs')), runs);

  fill(main,
    h('div', { class: 'vhead' }, h('div', {}, h('div', { class: 'kicker' }, t('xch.kicker')), h('h1', { tabindex: '-1', id: 'view-title' }, t('xch.title')), h('p', { class: 'muted' }, t('xch.lede')))),
    h('h2', { class: 'sec' }, t('xch.sec.exchange')), tickets,
    h('div', { class: 'rule' }),
    h('h2', { class: 'sec' }, t('xch.sec.backup')), backups, migration, log);
  refreshRuns().catch(() => {});
  return { focus: () => main.querySelector('#view-title')?.focus() };
}
