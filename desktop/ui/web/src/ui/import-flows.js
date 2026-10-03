// The exchange flows shared by the Library and the Exchange view: choose a file (Rust-owned dialog), PREVIEW what it
// contains (nothing is stored), and only on the learner's confirmation store it. Exports ask Rust to show the Save dialog;
// the chosen location never reaches the WebView. Every failure is explained in plain words.
import { defineStrings, t } from '../i18n.js';
import { field, h, modal } from './kit.js';

defineStrings({
  'ex.cancelled': ['Nothing was imported.', '没有导入任何内容。'],
  'ex.exported': ['Saved {name}.', '已保存 {name}。'],
  'ex.exportFailed': ['Could not save the file: {message}', '无法保存文件：{message}'],
  'ex.importFailed': ['Could not read the file: {message}', '无法读取文件：{message}'],
  'ex.preview.title': ['Preview: {name}', '预览：{name}'],
  'ex.preview.problems': ['This file cannot be imported', '这个文件无法导入'],
  'ex.preview.problemsHint': ['Nothing was changed. Fix the file and try again.', '没有任何改动。请修正文件后重试。'],
  'ex.preview.confirm': ['Import', '导入'],
  'ex.preview.collision': ['An item with this id already exists. It will be imported as a separate copy; the existing one is not touched.', '已存在相同 id 的内容。将作为独立的副本导入，现有内容不会被改动。'],
  'ex.paper.summary': ['Paper "{title}": {questions} questions, {media} media file(s).', '试卷“{title}”：{questions} 题，{media} 个媒体文件。'],
  'ex.doc.summary': ['Translation document "{title}": {items} sentences.', '翻译文档“{title}”：{items} 句。'],
  'ex.doc.kind': ['File type', '文件类型'],
  'ex.doc.kindJson': ['Translation document (JSON)', '翻译文档（JSON）'],
  'ex.doc.kindSource': ['Plain text: one sentence per line', '纯文本：每行一句'],
  'ex.doc.kindBilingual': ['Plain text: source ⇥ reference per line', '纯文本：每行 原文 ⇥ 参考译文'],
  'ex.doc.titleField': ['Title', '标题'],
  'ex.doc.source': ['Source language (e.g. en)', '原文语言（如 en）'],
  'ex.doc.target': ['Target language (e.g. zh)', '译文语言（如 zh）'],
  'ex.doc.next': ['Choose file…', '选择文件…'],
  'ex.review.summary': ['Teacher review {id} for "{title}": {items} item(s), {corrections} correction(s), reviewer {reviewer}.', '针对“{title}”的批改 {id}：{items} 个条目，{corrections} 处修改，批改人 {reviewer}。'],
  'ex.review.kind.new': ['A new review. It will be added; the original answer is not changed.', '这是一份新批改，将被添加；原始作答不会被改动。'],
  'ex.review.kind.idempotent': ['Already imported, identical. Nothing will change.', '已经导入过，内容完全相同，不会有任何改动。'],
  'ex.review.kind.update': ['A review with this id exists and this file differs. Importing replaces that review only.', '已存在相同 id 的批改且内容不同。导入只会替换那份批改。'],
  'ex.review.imported': ['Review imported.', '批改已导入。'],
  'ex.review.noop': ['This review was already imported.', '这份批改此前已经导入。'],
  'ex.reviewer.anonymous': ['anonymous', '匿名'],
  'ex.remed.summary': ['Remediation material "{title}": {items} sentences, from response {response} and review {review}.', '补救材料“{title}”：{items} 句，来自作答 {response} 与批改 {review}。'],
  'ex.remed.imported': ['Remediation material imported.', '补救材料已导入。'],
  'ex.imported.paper': ['Paper imported.', '试卷已导入。'],
  'ex.imported.doc': ['Document imported.', '文档已导入。'],
});

const message = (e) => String(e?.message ?? e).replace(/^[A-Z_]+: /, '');

/** Ask Rust to save a text document through the Save dialog. Resolves true when a file was written. */
export async function exportFile(app, file) {
  try {
    const out = await app.native.exportText(file.name, file.text);
    if (!out) return false;
    app.toast(t('ex.exported', { name: out.name }));
    return true;
  } catch (e) {
    app.toast(t('ex.exportFailed', { message: message(e) }), { kind: 'error', ms: 0 });
    return false;
  }
}

/** Choose a JSON/text file through the Rust-owned dialog. Resolves `{ name, text }` or null. */
export async function chooseFile(app) {
  try {
    return await app.native.importText();
  } catch (e) {
    app.toast(t('ex.importFailed', { message: message(e) }), { kind: 'error', ms: 0 });
    return null;
  }
}

/**
 * Show a preview and resolve true if the learner confirms. `preview.ok === false` shows the problems (nothing can be
 * stored); otherwise `lines` summarize the content and `notes` carry warnings (e.g. a collision becomes a copy).
 */
export function previewDialog({ name, preview, lines = [], notes = [] }) {
  return modal({
    title: t('ex.preview.title', { name }),
    wide: true,
    build: (close) => (preview.ok
      ? [
        ...lines.map((l) => h('p', {}, l)),
        ...notes.map((n) => h('p', { class: 'muted' }, n)),
        h('menu', {}, h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, t('common.cancel')), h('button', { class: 'btn primary', type: 'button', onclick: () => close(true) }, t('ex.preview.confirm'))),
      ]
      : [
        h('div', { class: 'error-box', role: 'alert' }, h('b', {}, t('ex.preview.problems')), h('p', {}, t('ex.preview.problemsHint'))),
        h('ul', { class: 'diag' }, preview.errors.map((e) => h('li', {}, e))),
        h('menu', {}, h('button', { class: 'btn primary', type: 'button', onclick: () => close(false) }, t('common.close'))),
      ]),
  }).then((v) => v === true);
}

export async function importPaperFlow(app) {
  const file = await chooseFile(app);
  if (!file) return null;
  const { exchange } = app.product;
  const preview = await exchange.previewPaperImport(file.text);
  const ok = await previewDialog({
    name: file.name, preview,
    lines: preview.ok ? [t('ex.paper.summary', { title: preview.summary.title, questions: preview.summary.questionCount, media: preview.summary.mediaCount })] : [],
    notes: preview.ok && preview.collision ? [t('ex.preview.collision')] : [],
  });
  if (!ok) return null;
  const saved = await exchange.commitPaperImport(preview);
  app.toast(t('ex.imported.paper'));
  return { kind: 'paper', id: saved.payload.id };
}

export async function importDocumentFlow(app) {
  const { exchange } = app.product;
  const choice = await modal({
    title: t('ex.doc.kind'),
    build: (close) => {
      const kind = h('select', { id: 'doc-kind' }, [['json', t('ex.doc.kindJson')], ['source-only', t('ex.doc.kindSource')], ['bilingual', t('ex.doc.kindBilingual')]].map(([v, l]) => h('option', { value: v }, l)));
      const title = h('input', { type: 'text', id: 'doc-title' });
      const src = h('input', { type: 'text', id: 'doc-src', value: 'en' });
      const dst = h('input', { type: 'text', id: 'doc-dst', value: 'zh' });
      const meta = h('div', { class: 'stack' }, field(t('ex.doc.titleField'), title), field(t('ex.doc.source'), src), field(t('ex.doc.target'), dst));
      const sync = () => { meta.hidden = kind.value === 'json'; };
      kind.addEventListener('change', sync);
      sync();
      return [field(t('ex.doc.kind'), kind), meta, h('menu', {}, h('button', { class: 'btn', type: 'button', onclick: () => close('cancel') }, t('common.cancel')), h('button', { class: 'btn primary', type: 'button', onclick: () => close({ kind: kind.value, title: title.value, sourceLanguage: src.value, targetLanguage: dst.value }) }, t('ex.doc.next')))];
    },
  });
  if (choice === 'cancel') return null;
  const file = await chooseFile(app);
  if (!file) return null;
  const preview = await exchange.previewDocumentImport(file.text, choice.kind, choice);
  const ok = await previewDialog({
    name: file.name, preview,
    lines: preview.ok ? [t('ex.doc.summary', { title: preview.summary.title, items: preview.summary.itemCount })] : [],
    notes: preview.ok && preview.collision ? [t('ex.preview.collision')] : [],
  });
  if (!ok) return null;
  const saved = await exchange.commitDocumentImport(preview);
  app.toast(t('ex.imported.doc'));
  return { kind: 'document', id: saved.payload.id };
}

export async function importReviewFlow(app) {
  const file = await chooseFile(app);
  if (!file) return null;
  const { reviews } = app.product;
  const preview = await reviews.previewReviewImport(file.text);
  const reviewer = preview.summary?.reviewer;
  const ok = await previewDialog({
    name: file.name, preview,
    lines: preview.ok ? [t('ex.review.summary', { id: preview.summary.reviewId, title: preview.summary.responseTitle, items: preview.summary.itemCount, corrections: preview.summary.correctionCount, reviewer: reviewer?.displayLabel || reviewer?.toolName || (reviewer?.type && reviewer.type !== 'anonymous' ? reviewer.type : t('ex.reviewer.anonymous')) })] : [],
    notes: preview.ok ? [t(`ex.review.kind.${preview.kind}`)] : [],
  });
  if (!ok) return null;
  const out = await reviews.commitReviewImport(preview);
  app.toast(out.stored ? t('ex.review.imported') : t('ex.review.noop'));
  return { kind: 'review', id: out.review.id };
}

export async function importRemediationFlow(app) {
  const file = await chooseFile(app);
  if (!file) return null;
  const { reviews } = app.product;
  const preview = await reviews.previewRemediationImport(file.text);
  const ok = await previewDialog({
    name: file.name, preview,
    lines: preview.ok ? [t('ex.remed.summary', { title: preview.summary.title, items: preview.summary.itemCount, response: preview.summary.sourceResponseId, review: preview.summary.sourceReviewId })] : [],
    notes: preview.ok && preview.collision ? [t('ex.preview.collision')] : [],
  });
  if (!ok) return null;
  const saved = await reviews.commitRemediationImport(preview);
  app.toast(t('ex.remed.imported'));
  return { kind: 'document', id: saved.payload.id };
}

