// Content editors of the Library: Objective papers (five question types, optional explanation, image/audio), Translation
// documents (sentences with optional reference) and Typing texts. They edit a DRAFT; nothing is stored until Save, which
// goes through the Library service (strict validation, revision-guarded). Text edits update the draft in place; structural
// edits (add, remove, reorder, change type) re-render the form from the draft and move focus to the new control.
import { defineStrings, t } from '../../i18n.js';
import { LibraryError, validateDocument, validatePaper, validateTypingText } from '../../product/library.js';
import { QUESTION_TYPES } from '../../objective/questions.js';
import { confirmDialog, field, fill, h, modal, uid } from '../kit.js';

defineStrings({
  'ed.save': ['Save', '保存'],
  'ed.cancel': ['Cancel', '取消'],
  'ed.saved': ['Saved.', '已保存。'],
  'ed.discardTitle': ['Discard your changes?', '放弃修改？'],
  'ed.discardBody': ['Edits that were not saved will be lost.', '尚未保存的修改将丢失。'],
  'ed.discard': ['Discard changes', '放弃修改'],
  'ed.keep': ['Keep editing', '继续编辑'],
  'ed.problems': ['Fix these before saving:', '保存前请先修正：'],
  'ed.stale': ['This item was changed elsewhere since you opened it. Close the editor and open it again.', '这项内容在你打开之后被改动过。请关闭编辑器后重新打开。'],
  'ed.gone': ['This item no longer exists.', '这项内容已不存在。'],
  'ed.title': ['Title', '标题'],
  'ed.description': ['Description (optional)', '说明（可选）'],
  'ed.category': ['Category (optional)', '分类（可选）'],
  'ed.tags': ['Tags, separated by commas (optional)', '标签，用逗号分隔（可选）'],
  'ed.paper.new': ['New paper', '新建试卷'],
  'ed.paper.edit': ['Edit paper', '编辑试卷'],
  'ed.q.heading': ['Question {n}', '第 {n} 题'],
  'ed.q.type': ['Type', '题型'],
  'ed.q.prompt': ['Question text', '题干'],
  'ed.q.explanation': ['Explanation (optional) — shown only after the answer is revealed', '解析（可选）——仅在揭晓答案后显示'],
  'ed.nav.title': ['Questions', '题目'],
  'ed.nav.empty': ['(no text yet)', '（尚无内容）'],
  'ed.nav.prev': ['Previous question', '上一题'],
  'ed.nav.next': ['Next question', '下一题'],
  'ed.nav.position': ['Question {n} of {total}', '第 {n} 题 / 共 {total} 题'],
  'ed.nav.details': ['Paper details', '试卷信息'],
  'ed.nav.jump': ['Question {n}, {type}: {preview}', '第 {n} 题，{type}：{preview}'],
  'ed.nav.up': ['Move question {n} up', '把第 {n} 题上移'],
  'ed.nav.down': ['Move question {n} down', '把第 {n} 题下移'],
  'ed.q.add': ['Add a question', '添加题目'],
  'ed.q.remove': ['Remove question', '删除本题'],
  'ed.q.up': ['Move up', '上移'],
  'ed.q.down': ['Move down', '下移'],
  'ed.q.type.single': ['Single choice', '单选题'],
  'ed.q.type.multiple': ['Multiple choice', '多选题'],
  'ed.q.type.blank': ['Fill in the blank', '填空题'],
  'ed.q.type.truefalse': ['True or false', '判断题'],
  'ed.q.type.matching': ['Matching', '匹配题'],
  'ed.opt.text': ['Option {n}', '选项 {n}'],
  'ed.opt.correct': ['Correct', '正确'],
  'ed.opt.add': ['Add an option', '添加选项'],
  'ed.opt.remove': ['Remove option {n}', '删除选项 {n}'],
  'ed.blank.answers': ['Accepted answers, one per line', '可接受的答案，每行一个'],
  'ed.blank.case': ['Match upper and lower case exactly', '区分大小写'],
  'ed.tf.true': ['True', '正确'],
  'ed.tf.false': ['False', '错误'],
  'ed.tf.legend': ['The statement is', '这个说法是'],
  'ed.pair.left': ['Left {n}', '左项 {n}'],
  'ed.pair.right': ['Right {n}', '右项 {n}'],
  'ed.pair.add': ['Add a pair', '添加一对'],
  'ed.pair.remove': ['Remove pair {n}', '删除第 {n} 对'],
  'ed.media.image': ['Image', '图片'],
  'ed.media.audio': ['Audio', '音频'],
  'ed.media.attach': ['Attach…', '添加…'],
  'ed.media.remove': ['Remove', '移除'],
  'ed.media.alt': ['Describe the image (alt text)', '图片描述（替代文字）'],
  'ed.media.picked': ['Attached: {name}', '已添加：{name}'],
  'ed.media.wrongKind': ['That file is {mime}, not {kind}.', '该文件是 {mime}，不是{kind}。'],
  'ed.doc.new': ['New translation document', '新建翻译文档'],
  'ed.doc.edit': ['Edit translation document', '编辑翻译文档'],
  'ed.doc.source': ['Source language (e.g. en)', '原文语言（如 en）'],
  'ed.doc.target': ['Target language (e.g. zh)', '译文语言（如 zh）'],
  'ed.doc.folder': ['Folder', '文件夹'],
  'ed.doc.newFolder': ['New folder…', '新建文件夹…'],
  'ed.doc.folderName': ['Folder name', '文件夹名称'],
  'ed.doc.item': ['Sentence {n}', '第 {n} 句'],
  'ed.doc.sourceText': ['Source text', '原文'],
  'ed.doc.reference': ['Reference translation (optional, shown only on request)', '参考译文（可选，仅在你要求时显示）'],
  'ed.doc.addItem': ['Add a sentence', '添加一句'],
  'ed.doc.removeItem': ['Remove sentence {n}', '删除第 {n} 句'],
  'ed.text.new': ['New typing text', '新建跟打文本'],
  'ed.text.edit': ['Edit typing text', '编辑跟打文本'],
  'ed.text.language': ['Language (optional, e.g. en)', '语言（可选，如 en）'],
  'ed.text.body': ['Text to copy', '要跟打的文本'],
  'ed.text.count': ['{n} characters', '{n} 个字符'],
  'ed.text.hint': ['The characters are stored exactly as written, including line breaks and spaces.', '文本会逐字符原样保存，包括换行与空格。'],
});

const blankQuestion = (type, ids) => {
  const base = { id: ids(), type, prompt: '', explanation: '' };
  if (type === 'single' || type === 'multiple') return { ...base, options: [0, 1].map(() => ({ id: ids(), text: '', correct: false })) };
  if (type === 'blank') return { ...base, answers: [''], caseSensitive: false };
  if (type === 'truefalse') return { ...base, answer: true };
  return { ...base, pairs: [0, 1].map(() => ({ id: ids(), left: '', right: '' })) };
};

/** Drop empty optional fields the learner left blank, so the stored question stays clean. */
function cleanQuestion(q) {
  const c = structuredClone(q);
  if (typeof c.explanation === 'string' && !c.explanation.trim()) delete c.explanation;
  if (c.type === 'blank') c.answers = String(c._answersText ?? c.answers.join('\n')).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  delete c._answersText;
  return c;
}

/** A small modal asking for one line of text (never window.prompt: it is not reliable in an embedded WebView). */
function askName(label) {
  return modal({
    title: label,
    build: (close) => {
      const input = h('input', { type: 'text', id: uid('n'), 'aria-label': label });
      return h('form', { class: 'stack', onsubmit: (ev) => { ev.preventDefault(); close(input.value); } }, input,
        h('menu', {}, h('button', { class: 'btn', type: 'button', onclick: () => close('') }, t('ed.cancel')), h('button', { class: 'btn primary', type: 'submit' }, t('ed.save'))));
    },
  }).then((v) => (typeof v === 'string' ? v : ''));
}

const message = (e) => String(e?.message ?? e).replace(/^[A-Z_]+: /, '');

function shell(app, { heading, body, errors, onSave, onCancel, dirty, page = false }) {
  const err = h('div', { class: 'error-box', role: 'alert', hidden: true });
  const save = h('button', { class: 'btn primary', type: 'submit' }, t('ed.save'));
  const form = h('form', { class: 'editor', novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault();
    save.disabled = true;
    try {
      const problems = errors();
      if (problems.length) {
        fill(err, h('b', {}, t('ed.problems')), h('ul', {}, problems.map((p) => h('li', {}, p))));
        err.hidden = false;
        err.scrollIntoView?.({ block: 'nearest' });
        return;
      }
      err.hidden = true;
      await onSave();
    } catch (e) {
      const text = e instanceof LibraryError && e.code === 'STALE' ? t('ed.stale') : e instanceof LibraryError && e.code === 'GONE' ? t('ed.gone') : message(e);
      fill(err, h('p', {}, text));
      err.hidden = false;
    } finally {
      save.disabled = false;
    }
  } },
  h(page ? 'h1' : 'h2', { tabindex: '-1', id: 'editor-heading' }, heading), err, body,
  h('div', { class: 'row editor-actions' }, save, h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (dirty() && !(await confirmDialog({ title: t('ed.discardTitle'), body: t('ed.discardBody'), okLabel: t('ed.discard'), cancelLabel: t('ed.keep'), danger: true }))) return;
    onCancel();
  } }, t('ed.cancel'))));
  return form;
}

// ---------------------------------------------------------------------------------------------- Typing text
export async function editTypingText(app, container, { id = null, onDone }) {
  const { library } = app.product;
  const loaded = id ? await library.get('text', id) : null;
  if (id && !loaded) throw new LibraryError('GONE', 'gone');
  const draft = loaded ? structuredClone(loaded.payload) : library.newTypingText();
  const original = JSON.stringify(draft);
  const title = h('input', { type: 'text', id: uid('t'), value: draft.title ?? '' });
  const language = h('input', { type: 'text', id: uid('l'), value: draft.language ?? '', placeholder: 'en' });
  const body = h('textarea', { id: uid('b'), rows: '12', spellcheck: 'false' }, draft.text ?? '');
  const count = h('div', { class: 'hint mono', role: 'status' });
  const sync = () => { draft.title = title.value; draft.language = language.value; draft.text = body.value; count.textContent = t('ed.text.count', { n: [...body.value].length }); };
  for (const el of [title, language, body]) el.addEventListener('input', sync);
  sync();
  fill(container, shell(app, {
    heading: loaded ? t('ed.text.edit') : t('ed.text.new'),
    body: [field(t('ed.title'), title), field(t('ed.text.language'), language), field(t('ed.text.body'), body, t('ed.text.hint')), count],
    errors: () => validateTypingText(draft).map((p) => p.message),
    dirty: () => JSON.stringify(draft) !== original,
    onSave: async () => { const saved = await library.saveTypingText(draft, loaded?.rev ?? null); app.toast(t('ed.saved')); await onDone({ kind: 'text', id: saved.payload.id }); },
    onCancel: () => onDone(null),
  }));
  container.querySelector('#editor-heading')?.focus();
}

// ------------------------------------------------------------------------------------ Translation document
export async function editDocument(app, container, { id = null, onDone }) {
  const { library } = app.product;
  const loaded = id ? await library.get('document', id) : null;
  if (id && !loaded) throw new LibraryError('GONE', 'gone');
  const folders = (await library.list()).folders;
  const draft = loaded ? structuredClone(loaded.payload) : library.newDocument(folders[0]?.id ?? '');
  draft.items = (draft.items ?? []).map((i) => ({ ...i }));
  if (!draft.items.length) draft.items.push({ id: app.ids(), sourceText: '' });
  const original = JSON.stringify(draft);
  let focus = null;

  const render = () => {
    const title = h('input', { type: 'text', id: uid('t'), value: draft.title ?? '', oninput: (e) => { draft.title = e.target.value; } });
    const src = h('input', { type: 'text', id: uid('s'), value: draft.sourceLanguage ?? '', placeholder: 'en', oninput: (e) => { draft.sourceLanguage = e.target.value; } });
    const dst = h('input', { type: 'text', id: uid('d'), value: draft.targetLanguage ?? '', placeholder: 'zh', oninput: (e) => { draft.targetLanguage = e.target.value; } });
    const folder = h('select', { id: uid('f'), onchange: async (e) => {
      if (e.target.value !== '__new') { draft.folderId = e.target.value; return; }
      const name = await askName(t('ed.doc.folderName'));
      if (!name.trim()) { e.target.value = draft.folderId; return; }
      const f = await library.createFolder(name);
      folders.push({ id: f.id, name: f.name });
      draft.folderId = f.id;
      render();
    } }, [...folders.map((f) => h('option', { value: f.id, selected: f.id === draft.folderId }, f.name)), h('option', { value: '__new' }, t('ed.doc.newFolder'))]);
    const rows = draft.items.map((it, i) => h('fieldset', { class: 'block' },
      h('legend', {}, t('ed.doc.item', { n: i + 1 })),
      field(t('ed.doc.sourceText'), h('textarea', { id: `item-src-${i}`, rows: '2', oninput: (e) => { it.sourceText = e.target.value; } }, it.sourceText ?? '')),
      field(t('ed.doc.reference'), h('textarea', { id: `item-ref-${i}`, rows: '2', oninput: (e) => { if (e.target.value) it.referenceTranslation = e.target.value; else delete it.referenceTranslation; } }, it.referenceTranslation ?? '')),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', disabled: i === 0, onclick: () => { [draft.items[i - 1], draft.items[i]] = [draft.items[i], draft.items[i - 1]]; focus = `item-src-${i - 1}`; render(); } }, t('ed.q.up')),
        h('button', { class: 'btn small', type: 'button', disabled: i === draft.items.length - 1, onclick: () => { [draft.items[i + 1], draft.items[i]] = [draft.items[i], draft.items[i + 1]]; focus = `item-src-${i + 1}`; render(); } }, t('ed.q.down')),
        h('button', { class: 'btn small danger', type: 'button', disabled: draft.items.length === 1, onclick: () => { draft.items.splice(i, 1); focus = `item-src-${Math.max(0, i - 1)}`; render(); } }, t('ed.doc.removeItem', { n: i + 1 })))));
    fill(container, shell(app, {
      heading: loaded ? t('ed.doc.edit') : t('ed.doc.new'),
      body: [field(t('ed.title'), title), h('div', { class: 'row-fields' }, field(t('ed.doc.source'), src), field(t('ed.doc.target'), dst)), field(t('ed.doc.folder'), folder), rows,
        h('button', { class: 'btn', type: 'button', onclick: () => { draft.items.push({ id: app.ids(), sourceText: '' }); focus = `item-src-${draft.items.length - 1}`; render(); } }, t('ed.doc.addItem'))],
      errors: () => validateDocument({ ...draft, folderId: draft.folderId || 'pending' }).map((p) => p.message),
      dirty: () => JSON.stringify(draft) !== original,
      onSave: async () => { const saved = await library.saveDocument(draft, loaded?.rev ?? null); app.toast(t('ed.saved')); await onDone({ kind: 'document', id: saved.payload.id }); },
      onCancel: () => onDone(null),
    }));
    container.querySelector(focus ? `#${focus}` : '#editor-heading')?.focus();
    focus = null;
  };
  render();
}

// ------------------------------------------------------------------------------------------ Objective paper
export async function editPaper(app, container, { id = null, onDone }) {
  const { library } = app.product;
  const loaded = id ? await library.get('paper', id) : null;
  if (id && !loaded) throw new LibraryError('GONE', 'gone');
  const draft = loaded ? structuredClone(loaded.payload) : library.newPaper();
  draft.questions = (draft.questions ?? []).map((q) => ({ ...q, explanation: q.explanation ?? '' }));
  if (!draft.questions.length) draft.questions.push(blankQuestion('single', app.ids));
  const original = JSON.stringify(draft);
  let focus = null;
  let active = 0;
  let metaOpen = !loaded;
  let previewEls = [];
  const preview = (q) => (q.prompt ?? '').replace(/\s+/g, ' ').trim().slice(0, 56) || t('ed.nav.empty');

  const answersText = (q) => (q._answersText ?? q.answers.join('\n'));
  const toSave = () => ({ ...draft, tags: Array.isArray(draft.tags) ? draft.tags : String(draft.tags ?? '').split(','), questions: draft.questions.map(cleanQuestion) });
  const problemsList = () => validatePaper(toSave(), { strict: true }).map((p) => {
    const n = p.questionId ? draft.questions.findIndex((q) => q.id === p.questionId) + 1 : 0;
    return n ? `${t('ed.q.heading', { n })}: ${p.message}` : p.message;
  });

  async function attach(q, kind) {
    const picked = await app.native.pickMedia();
    if (!picked) return;
    const mime = String(picked.mimeType || '');
    if (!mime.startsWith(`${kind}/`)) { app.toast(t('ed.media.wrongKind', { mime, kind: t(`ed.media.${kind}`) }), { kind: 'error' }); return; }
    q[kind] = { id: picked.id, name: picked.name, mimeType: mime, ...(kind === 'image' ? { alt: q.image?.alt ?? '' } : {}) };
    app.toast(t('ed.media.picked', { name: picked.name }));
    focus = `q-${q.id}-${kind}`;
    render();
  }

  function questionBlock(q, i) {
    const qid = q.id;
    const typeSel = h('select', { id: `q-${qid}-type`, onchange: (e) => {
      const fresh = blankQuestion(e.target.value, app.ids);
      const keep = { id: q.id, prompt: q.prompt, explanation: q.explanation, ...(q.image ? { image: q.image } : {}), ...(q.audio ? { audio: q.audio } : {}) };
      draft.questions[i] = { ...fresh, ...keep };
      focus = `q-${qid}-type`;
      render();
    } }, QUESTION_TYPES.map((x) => h('option', { value: x, selected: x === q.type }, t(`ed.q.type.${x}`))));
    const prompt = h('textarea', { id: `q-${qid}-prompt`, rows: '4', oninput: (e) => { q.prompt = e.target.value; if (previewEls[i]) previewEls[i].textContent = preview(q); } }, q.prompt ?? '');
    const explanation = h('textarea', { id: `q-${qid}-explanation`, rows: '3', oninput: (e) => { q.explanation = e.target.value; } }, q.explanation ?? '');

    let specific = null;
    if (q.type === 'single' || q.type === 'multiple') {
      specific = h('div', {}, q.options.map((o, k) => h('div', { class: 'row option-row' },
        h('input', { type: q.type === 'single' ? 'radio' : 'checkbox', name: `correct-${qid}`, id: `q-${qid}-c${k}`, checked: Boolean(o.correct), 'aria-label': `${t('ed.opt.correct')} ${k + 1}`, onchange: (e) => {
          if (q.type === 'single') q.options.forEach((x) => { x.correct = x === o; }); else o.correct = e.target.checked;
        } }),
        h('input', { type: 'text', class: 'grow', id: `q-${qid}-o${k}`, value: o.text ?? '', 'aria-label': t('ed.opt.text', { n: k + 1 }), placeholder: t('ed.opt.text', { n: k + 1 }), oninput: (e) => { o.text = e.target.value; } }),
        h('button', { class: 'btn small', type: 'button', disabled: q.options.length <= 2, 'aria-label': t('ed.opt.remove', { n: k + 1 }), onclick: () => { q.options.splice(k, 1); focus = `q-${qid}-o${Math.max(0, k - 1)}`; render(); } }, '×'))),
      h('button', { class: 'btn small', type: 'button', onclick: () => { q.options.push({ id: app.ids(), text: '', correct: false }); focus = `q-${qid}-o${q.options.length - 1}`; render(); } }, t('ed.opt.add')));
    } else if (q.type === 'blank') {
      specific = h('div', {}, field(t('ed.blank.answers'), h('textarea', { id: `q-${qid}-answers`, rows: '3', oninput: (e) => { q._answersText = e.target.value; q.answers = e.target.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); } }, answersText(q))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: Boolean(q.caseSensitive), onchange: (e) => { q.caseSensitive = e.target.checked; } }), ` ${t('ed.blank.case')}`));
    } else if (q.type === 'truefalse') {
      specific = h('fieldset', { class: 'plain-fieldset' }, h('legend', {}, t('ed.tf.legend')),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: `tf-${qid}`, checked: q.answer === true, onchange: () => { q.answer = true; } }), ` ${t('ed.tf.true')}`),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: `tf-${qid}`, checked: q.answer === false, onchange: () => { q.answer = false; } }), ` ${t('ed.tf.false')}`));
    } else {
      specific = h('div', {}, q.pairs.map((p, k) => h('div', { class: 'row option-row' },
        h('input', { type: 'text', class: 'grow', id: `q-${qid}-l${k}`, value: p.left ?? '', 'aria-label': t('ed.pair.left', { n: k + 1 }), placeholder: t('ed.pair.left', { n: k + 1 }), oninput: (e) => { p.left = e.target.value; } }),
        h('input', { type: 'text', class: 'grow', id: `q-${qid}-r${k}`, value: p.right ?? '', 'aria-label': t('ed.pair.right', { n: k + 1 }), placeholder: t('ed.pair.right', { n: k + 1 }), oninput: (e) => { p.right = e.target.value; } }),
        h('button', { class: 'btn small', type: 'button', disabled: q.pairs.length <= 2, 'aria-label': t('ed.pair.remove', { n: k + 1 }), onclick: () => { q.pairs.splice(k, 1); focus = `q-${qid}-l${Math.max(0, k - 1)}`; render(); } }, '×'))),
      h('button', { class: 'btn small', type: 'button', onclick: () => { q.pairs.push({ id: app.ids(), left: '', right: '' }); focus = `q-${qid}-l${q.pairs.length - 1}`; render(); } }, t('ed.pair.add')));
    }

    const mediaRow = (kind) => h('div', { class: 'row media-row' },
      h('span', { class: 'muted' }, t(`ed.media.${kind}`)),
      q[kind] ? h('span', { class: 'mono' }, q[kind].name || q[kind].id) : null,
      kind === 'image' && q.image ? h('input', { type: 'text', class: 'grow', id: `q-${qid}-alt`, value: q.image.alt ?? '', placeholder: t('ed.media.alt'), 'aria-label': t('ed.media.alt'), oninput: (e) => { q.image.alt = e.target.value; } }) : null,
      h('button', { class: 'btn small', type: 'button', id: `q-${qid}-${kind}`, onclick: () => attach(q, kind) }, t('ed.media.attach')),
      q[kind] ? h('button', { class: 'btn small', type: 'button', onclick: () => { delete q[kind]; focus = `q-${qid}-${kind}`; render(); } }, t('ed.media.remove')) : null);

    return h('fieldset', { class: 'block', 'data-question': qid },
      h('legend', {}, t('ed.q.heading', { n: i + 1 })),
      field(t('ed.q.type'), typeSel), field(t('ed.q.prompt'), prompt), mediaRow('image'), mediaRow('audio'), specific, field(t('ed.q.explanation'), explanation),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', disabled: i === 0, onclick: () => { [draft.questions[i - 1], draft.questions[i]] = [draft.questions[i], draft.questions[i - 1]]; active = i - 1; focus = `q-${qid}-type`; render(); } }, t('ed.q.up')),
        h('button', { class: 'btn small', type: 'button', disabled: i === draft.questions.length - 1, onclick: () => { [draft.questions[i + 1], draft.questions[i]] = [draft.questions[i], draft.questions[i + 1]]; active = i + 1; focus = `q-${qid}-type`; render(); } }, t('ed.q.down')),
        h('button', { class: 'btn small danger', type: 'button', disabled: draft.questions.length === 1, onclick: () => { draft.questions.splice(i, 1); active = Math.max(0, Math.min(i, draft.questions.length - 1)); focus = `q-${draft.questions[active].id}-type`; render(); } }, t('ed.q.remove'))));
  }

  function navigator() {
    previewEls = [];
    const go = (n, id) => { active = n; focus = id ?? `q-${draft.questions[n].id}-prompt`; render(); };
    const rows = draft.questions.map((q, i) => {
      const pv = h('span', { class: 'nav-preview' }, preview(q));
      previewEls.push(pv);
      const jump = h('button', { type: 'button', class: 'nav-jump', id: `nav-${q.id}`, 'aria-current': i === active ? 'true' : null,
        'aria-label': t('ed.nav.jump', { n: i + 1, type: t(`ed.q.type.${q.type}`), preview: preview(q) }), onclick: () => go(i, `nav-${q.id}`) },
      h('span', { class: 'nav-n mono' }, String(i + 1)), h('span', { class: 'nav-body' }, h('span', { class: 'nav-type' }, t(`ed.q.type.${q.type}`)), pv));
      const move = (to) => { [draft.questions[i], draft.questions[to]] = [draft.questions[to], draft.questions[i]]; active = to; focus = null; render(); };
      return h('li', { class: i === active ? 'on' : '' }, jump,
        h('span', { class: 'nav-move' },
          h('button', { class: 'btn small', type: 'button', id: `nav-up-${q.id}`, disabled: i === 0, 'aria-label': t('ed.nav.up', { n: i + 1 }), onclick: () => { move(i - 1); container.querySelector(`#nav-up-${q.id}`)?.focus(); } }, '↑'),
          h('button', { class: 'btn small', type: 'button', id: `nav-down-${q.id}`, disabled: i === draft.questions.length - 1, 'aria-label': t('ed.nav.down', { n: i + 1 }), onclick: () => { move(i + 1); container.querySelector(`#nav-down-${q.id}`)?.focus(); } }, '↓')));
    });
    return h('nav', { class: 'q-nav', 'aria-label': t('ed.nav.title') },
      h('h3', { class: 'side-h' }, t('ed.nav.title'), h('span', { class: 'count mono' }, String(draft.questions.length))),
      h('ol', {}, rows),
      h('button', { class: 'btn', type: 'button', onclick: () => { draft.questions.push(blankQuestion('single', app.ids)); active = draft.questions.length - 1; focus = `q-${draft.questions[active].id}-type`; render(); } }, t('ed.q.add')));
  }

  function render() {
    active = Math.max(0, Math.min(active, draft.questions.length - 1));
    const title = h('input', { type: 'text', id: uid('t'), value: draft.title ?? '', oninput: (e) => { draft.title = e.target.value; } });
    const category = h('input', { type: 'text', id: uid('c'), value: draft.category ?? '', oninput: (e) => { draft.category = e.target.value; } });
    const tags = h('input', { type: 'text', id: uid('g'), value: Array.isArray(draft.tags) ? draft.tags.join(', ') : '', oninput: (e) => { draft.tags = e.target.value.split(','); } });
    const description = h('textarea', { id: uid('d'), rows: '2', oninput: (e) => { draft.description = e.target.value; } }, draft.description ?? '');
    const nav = navigator();
    const n = draft.questions.length;
    const step = (to) => { active = to; focus = `q-${draft.questions[to].id}-prompt`; render(); };
    const stepper = h('div', { class: 'row q-stepper' },
      h('button', { class: 'btn', type: 'button', id: 'q-prev', disabled: active === 0, onclick: () => step(active - 1) }, t('ed.nav.prev')),
      h('span', { class: 'muted', role: 'status' }, t('ed.nav.position', { n: active + 1, total: n })),
      h('button', { class: 'btn', type: 'button', id: 'q-next', disabled: active === n - 1, onclick: () => step(active + 1) }, t('ed.nav.next')));
    fill(container, shell(app, {
      heading: loaded ? t('ed.paper.edit') : t('ed.paper.new'),
      page: true,
      body: [h('details', { class: 'paper-meta', open: metaOpen, ontoggle: (ev) => { metaOpen = ev.target.open; } }, h('summary', {}, t('ed.nav.details')),
        field(t('ed.title'), title), field(t('ed.description'), description), h('div', { class: 'row-fields' }, field(t('ed.category'), category), field(t('ed.tags'), tags))),
      h('div', { class: 'q-workspace' }, nav, h('div', { class: 'q-card' }, stepper, questionBlock(draft.questions[active], active)))],
      errors: problemsList,
      dirty: () => JSON.stringify(draft) !== original,
      onSave: async () => { const saved = await library.savePaper(toSave(), loaded?.rev ?? null); app.toast(t('ed.saved')); await onDone({ kind: 'paper', id: saved.payload.id }); },
      onCancel: () => onDone(null),
    }));
    container.querySelector(focus ? `#${CSS.escape(focus)}` : '#editor-heading')?.focus();
    focus = null;
  }
  render();
}
