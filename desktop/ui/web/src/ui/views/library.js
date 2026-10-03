// Library: the formal content entry for the three domains. Three columns (domains and folders | list | detail), search and
// filters, create/import/edit/export/delete, and the doors into practice and scheduling. Evidence is NOT here (it lives in
// History); deleting content never touches a recorded attempt.
import { defineStrings, t } from '../../i18n.js';
import { LIST_WIDTH } from '../prefs.js';
import '../../practice/strings.js';
import { checkRow, confirmDialog, domainDot, domainName, emptyState, field, fill, formatDate, guarded, h, modal, pill, textInput } from '../kit.js';
import { materialStateOf } from '../../product/material-state.js';
import { editDocument, editPaper, editTypingText } from './editors.js';
import { exportFile, importDocumentFlow, importPaperFlow } from '../import-flows.js';

defineStrings({
  'lib.kicker': ['Library', '资料库'],
  'lib.title': ['Library', '资料库'],
  'lib.lede': ['Learning material for the three domains. Recorded attempts are not here; they are in Evidence history.', '三个任务域的学习材料。作答证据不在这里，在“证据历史”。'],
  'lib.import': ['Import…', '导入…'],
  'lib.new': ['New', '新建'],
  'lib.new.title': ['New material', '新建材料'],
  'lib.new.paper': ['Objective paper', '客观题试卷'],
  'lib.new.paperHint': ['Single, multiple choice, blanks, true/false and matching, with optional explanations.', '单选、多选、填空、判断、匹配，可附解析。'],
  'lib.new.document': ['Translation document', '翻译文档'],
  'lib.new.documentHint': ['Sentences to translate, each with an optional reference.', '要翻译的句子，每句可附参考译文。'],
  'lib.new.text': ['Typing text', '跟打文本'],
  'lib.new.textHint': ['A passage to copy, stored exactly as written.', '要跟着打的一段文字，逐字符原样保存。'],
  'lib.import.title': ['Import material', '导入材料'],
  'lib.import.paper': ['Quiz paper (JSON)…', '试卷（JSON）…'],
  'lib.import.document': ['Translation document (JSON or text)…', '翻译文档（JSON 或文本）…'],
  'lib.nav.all': ['All material', '全部材料'],
  'lib.nav.categories': ['Categories', '分类'],
  'lib.nav.folders': ['Folders', '文件夹'],
  'lib.nav.uncategorized': ['Uncategorized', '未分类'],
  'lib.folder.new': ['New folder', '新建文件夹'],
  'lib.folder.rename': ['Rename folder', '重命名文件夹'],
  'lib.folder.delete': ['Delete folder', '删除文件夹'],
  'lib.folder.name': ['Folder name', '文件夹名称'],
  'lib.folder.notEmpty': ['Move or delete the documents in this folder first.', '请先移走或删除此文件夹里的文档。'],
  'lib.folder.deleteBody': ['The folder is empty and will be removed.', '这个文件夹是空的，将被移除。'],
  'lib.search': ['Search titles and tags…', '搜索标题、标签…'],
  'lib.search.label': ['Search the library', '搜索资料库'],
  'lib.resize': ['Resize the list', '调整列表宽度'],
  'lib.list.empty': ['Nothing here yet.', '这里还没有内容。'],
  'lib.list.emptyBody': ['Create material with New, or import a file.', '用“新建”创建材料，或导入文件。'],
  'lib.list.noMatch': ['No material matches.', '没有符合条件的材料。'],
  'lib.row.media': ['has media', '含媒体'],
  'lib.row.notReady': ['not ready', '尚未完成'],
  'lib.detail.none': ['Select an item to see it here.', '选择一项即可在这里查看。'],
  'lib.detail.practice': ['Practice', '练习'],
  'lib.detail.test': ['Test', '测试'],
  'lib.detail.schedule': ['Schedule…', '安排…'],
  'lib.detail.edit': ['Edit', '编辑'],
  'lib.detail.export': ['Export…', '导出…'],
  'lib.detail.delete': ['Delete', '删除'],
  'lib.detail.updated': ['Updated {date}', '更新于 {date}'],
  'lib.detail.questions': ['Questions', '题目'],
  'lib.detail.sentences': ['Sentences', '句子'],
  'lib.detail.text': ['Text', '文本'],
  'lib.detail.hasExplanation': ['explanation', '有解析'],
  'lib.detail.image': ['image', '图片'],
  'lib.detail.audio': ['audio', '音频'],
  'lib.detail.reference': ['reference', '有参考译文'],
  'lib.detail.notReadyBody': ['This item is not ready to practice. Edit it to complete it.', '这项内容还不能用来练习，请编辑补全。'],
  'lib.delete.title': ['Delete "{title}"?', '删除“{title}”？'],
  'lib.delete.body': ['The material is removed from the library. Attempts you already recorded stay in Evidence history, with their own copy of the content.', '材料会从资料库中移除。已经记录的作答仍保留在“证据历史”中，并带有它们自己的内容副本。'],
  'lib.deleted': ['Deleted.', '已删除。'],
  'lib.state.notStarted': ['Not started', '未开始'],
  'lib.state.inProgress': ['In progress', '进行中'],
  'lib.state.practiced': ['Practiced', '已练习'],
  'lib.state.practicedN': ['Practiced · {n}×', '已练习 · {n} 次'],
  'lib.state.hintInProgress': ['A saved session is waiting; resume it from Today.', '有一次已保存的练习，可在“今日”继续。'],
  'lib.state.hintPracticed': ['{n} completed attempt(s) are recorded. This is a fact, not a mastery level.', '已记录 {n} 次完成的作答。这只是事实，并非掌握程度。'],
  'lib.state.hintNotStarted': ['No attempt recorded and no session in progress.', '尚无作答记录，也没有进行中的练习。'],
  'lib.gone': ['This item no longer exists.', '这项内容已不存在。'],
});

const EDITORS = { paper: editPaper, document: editDocument, text: editTypingText };
const NEW_LABEL = { paper: 'lib.new.paper', document: 'lib.new.document', text: 'lib.new.text' };

export async function renderLibrary(app, main, params = {}) {
  const { library } = app.product;
  const toast = app.toast;
  const st = { domain: params.domain ?? 'all', group: params.group ?? null, query: '', selected: params.select ?? null, mode: params.edit ? 'edit' : 'view', editKind: null };
  let list = await library.list();
  let states = await app.product.learning.materialStates();
  const stateOf = (it) => materialStateOf(states, app.product.learning.typeOfDomain(it.domain), it.id);
  const STATE_UI = { 'not-started': ['○', 'lib.state.notStarted', 'neutral'], 'in-progress': ['◐', 'lib.state.inProgress', 'warn'], practiced: ['●', 'lib.state.practiced', 'ok'] };
  const statePill = (it, { long = false } = {}) => {
    const s = stateOf(it);
    const [glyph, key, kind] = STATE_UI[s.state];
    const text = long && s.state === 'practiced' ? t('lib.state.practicedN', { n: s.attempts }) : t(key);
    return h('span', { class: `pill state ${kind}`, 'data-state': s.state }, h('span', { 'aria-hidden': 'true' }, `${glyph} `), text);
  };

  const colA = h('div', { class: 'col-a', role: 'navigation', 'aria-label': t('lib.title') });
  const search = h('input', { type: 'search', id: 'lib-search', 'aria-label': t('lib.search.label'), placeholder: t('lib.search'), oninput: (e) => { st.query = e.target.value; paintList(); } });
  const rows = h('div', { class: 'list', role: 'listbox', 'aria-label': t('lib.title') });
  const colB = h('div', { class: 'col-b' }, h('div', { class: 'resizer', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': t('lib.resize'), tabindex: '0' }),
    h('label', { class: 'search' }, h('span', { class: 'muted', 'aria-hidden': 'true' }, '⌕'), search, h('span', { class: 'mono muted', 'aria-hidden': 'true' }, '/')), rows);
  const colC = h('div', { class: 'col-c', 'aria-live': 'polite' });

  const all = () => [...list.papers, ...list.documents, ...list.texts];
  const matches = (it) => {
    if (st.domain !== 'all' && it.domain !== st.domain) return false;
    if (st.group !== null) {
      if (it.kind === 'paper' && st.domain === 'objective' && (it.category || '') !== st.group) return false;
      if (it.kind === 'document' && st.domain === 'translation' && it.folderId !== st.group) return false;
    }
    const q = st.query.trim().toLowerCase();
    return !q || it.title.toLowerCase().includes(q) || (it.tags ?? []).some((x) => x.toLowerCase().includes(q)) || (it.category ?? '').toLowerCase().includes(q);
  };
  const find = (sel) => (sel ? all().find((x) => x.kind === sel.kind && x.id === sel.id) ?? null : null);

  const reload = async (select) => {
    list = await library.list();
    states = await app.product.learning.materialStates();
    if (select !== undefined) st.selected = select;
    await app.refreshChrome();
    paint();
  };

  // -------------------------------------------------------------------------------------------- column A
  function paintNav() {
    const pick = (domain, group = null) => () => { st.domain = domain; st.group = group; paint(); };
    const item = (label, count, on, handler, extra) => h('button', { type: 'button', class: `navitem${on ? ' on' : ''}`, 'aria-current': on ? 'true' : null, onclick: handler }, label, h('span', { class: 'n mono' }, String(count)), extra ?? null);
    const categories = [...new Set(list.papers.map((p) => p.category || ''))].sort((a, b) => (a || '￿').localeCompare(b || '￿'));
    fill(colA,
      item(t('lib.nav.all'), all().length, st.domain === 'all', pick('all')),
      h('h3', { class: 'side-h' }, t('domain.objective')),
      item(domainName('objective'), list.papers.length, st.domain === 'objective' && st.group === null, pick('objective')),
      st.domain === 'objective' ? categories.map((c) => item(c || t('lib.nav.uncategorized'), list.papers.filter((p) => (p.category || '') === c).length, st.group === c, pick('objective', c))) : null,
      h('h3', { class: 'side-h' }, t('domain.translation')),
      item(domainName('translation'), list.documents.length, st.domain === 'translation' && st.group === null, pick('translation')),
      st.domain === 'translation' ? [list.folders.map((f) => item(f.name, list.documents.filter((d) => d.folderId === f.id).length, st.group === f.id, pick('translation', f.id))),
        h('div', { class: 'row small' },
          h('button', { class: 'linkish', type: 'button', onclick: guarded(toast, async () => { const name = await askFolderName(t('lib.folder.new'), ''); if (name) { await library.createFolder(name); await reload(); } }) }, t('lib.folder.new')),
          st.group ? [h('button', { class: 'linkish', type: 'button', onclick: guarded(toast, async () => { const cur = list.folders.find((f) => f.id === st.group); const name = await askFolderName(t('lib.folder.rename'), cur?.name ?? ''); if (name) { await library.renameFolder(st.group, name); await reload(); } }) }, t('lib.folder.rename')),
            h('button', { class: 'linkish', type: 'button', onclick: guarded(toast, async () => {
              try { await library.deleteFolder(st.group); st.group = null; await reload(); } catch (e) { toast(e.code === 'NOT_EMPTY' ? t('lib.folder.notEmpty') : String(e.message), { kind: 'error' }); }
            }) }, t('lib.folder.delete'))] : null)] : null,
      h('h3', { class: 'side-h' }, t('domain.typing')),
      item(domainName('typing'), list.texts.length, st.domain === 'typing', pick('typing')));
  }

  function askFolderName(title, value) {
    return modal({ title, build: (close) => {
      const input = textInput({ id: 'folder-name', value, 'aria-label': t('lib.folder.name') });
      return h('form', { class: 'stack', onsubmit: (ev) => { ev.preventDefault(); close(input.value); } }, field(t('lib.folder.name'), input),
        h('menu', {}, h('button', { class: 'btn', type: 'button', onclick: () => close('') }, t('common.cancel')), h('button', { class: 'btn primary', type: 'submit' }, t('common.save'))));
    } }).then((v) => (typeof v === 'string' ? v.trim() : ''));
  }

  // -------------------------------------------------------------------------------------------- column B
  function paintList() {
    const items = all().filter(matches).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.title.localeCompare(b.title));
    if (!all().length) { fill(rows, emptyState({ title: t('lib.list.empty'), body: t('lib.list.emptyBody') })); return; }
    if (!items.length) { fill(rows, emptyState({ title: t('lib.list.noMatch') })); return; }
    fill(rows, items.map((it) => {
      const on = st.selected && st.selected.kind === it.kind && st.selected.id === it.id;
      return h('button', { type: 'button', role: 'option', class: `row-item dom-${it.domain}${on ? ' on' : ''}`, 'aria-selected': String(Boolean(on)), 'data-id': it.id, onclick: () => { st.selected = { kind: it.kind, id: it.id }; st.mode = 'view'; paint(); colC.querySelector('h2')?.focus(); } },
        domainDot(it.domain),
        h('span', { class: 'grow' }, h('b', {}, it.title || t('common.untitled')), h('span', { class: 'muted small' }, ` ${metaOf(it)}`)),
        statePill(it), it.hasMedia ? pill(t('lib.row.media'), 'info') : null, it.ready ? null : pill(t('lib.row.notReady'), 'warn'));
    }));
  }

  const metaOf = (it) => (it.kind === 'paper' ? `${t('common.questions', { n: it.count })}${it.category ? ` · ${it.category}` : ''}` : it.kind === 'document' ? `${t('common.sentences', { n: it.count })} · ${it.sourceLanguage}→${it.targetLanguage}` : t('common.characters', { n: it.count }));

  // -------------------------------------------------------------------------------------------- column C
  async function paintDetail() {
    const sel = find(st.selected);
    if (st.mode === 'edit') return;
    if (!sel) { fill(colC, emptyState({ title: t('lib.detail.none') })); return; }
    const row = await library.get(sel.kind, sel.id);
    if (!row) { fill(colC, emptyState({ title: t('lib.gone') })); return; }
    const p = row.payload;
    const shuffle = sel.kind === 'paper' && p.questions.length > 1 ? checkRow({ label: t('pr.obj.shuffle'), hint: t('pr.obj.shuffleHint') }) : null;
    const go = (intent) => app.startSession({ domain: sel.domain, materialId: sel.id, intent, feedbackTiming: intent === 'test' ? 'submit-at-end' : 'instant', ...(shuffle?.get() ? { shuffleQuestions: true } : {}) });
    const actions = h('div', { class: 'row detail-actions' },
      sel.ready ? [h('button', { class: 'btn primary', type: 'button', onclick: () => go('practice') }, t('lib.detail.practice')), h('button', { class: 'btn', type: 'button', onclick: () => go('test') }, t('lib.detail.test')),
        h('button', { class: 'btn', type: 'button', onclick: () => app.navigate('calendar', { mode: 'new', domain: sel.domain, materialId: sel.id }) }, t('lib.detail.schedule'))] : null,
      h('button', { class: 'btn', type: 'button', onclick: () => openEditor(sel.kind, sel.id) }, t('lib.detail.edit')),
      sel.kind !== 'text' ? h('button', { class: 'btn', type: 'button', onclick: guarded(toast, async () => { await exportFile(app, sel.kind === 'paper' ? await app.product.exchange.exportPaper(sel.id) : await app.product.exchange.exportDocument(sel.id)); }) }, t('lib.detail.export')) : null,
      h('button', { class: 'btn danger', type: 'button', onclick: guarded(toast, async () => {
        if (!(await confirmDialog({ title: t('lib.delete.title', { title: sel.title }), body: t('lib.delete.body'), okLabel: t('lib.detail.delete'), danger: true }))) return;
        await library.remove(sel.kind, sel.id);
        toast(t('lib.deleted'));
        await reload(null);
      }) }, t('lib.detail.delete')));
    const head = [
      h('div', { class: 'row' }, domainDot(sel.domain), h('span', { class: 'kicker' }, domainName(sel.domain))),
      h('h2', { tabindex: '-1' }, sel.title || t('common.untitled')),
      h('p', { class: 'muted small' }, `${metaOf(sel)} · ${t('lib.detail.updated', { date: formatDate((sel.updatedAt || '').slice(0, 10)) })}`),
      h('p', { class: 'row small' }, statePill(sel, { long: true }), h('span', { class: 'muted small' }, t(`lib.state.hint${{ 'not-started': 'NotStarted', 'in-progress': 'InProgress', practiced: 'Practiced' }[stateOf(sel).state]}`, { n: stateOf(sel).attempts }))),
      sel.ready ? null : h('p', { class: 'error-text' }, t('lib.detail.notReadyBody')),
      actions,
      sel.ready && shuffle ? shuffle.el : null,
    ];
    let body;
    if (sel.kind === 'paper') {
      body = h('section', {}, h('h3', { class: 'sec' }, t('lib.detail.questions')), p.description ? h('p', {}, p.description) : null,
        h('ol', { class: 'qlist' }, p.questions.map((q) => h('li', {}, h('span', { class: 'mono muted' }, `${t(`ed.q.type.${q.type}`)} `), h('span', {}, (q.prompt || '').slice(0, 140)),
          typeof q.explanation === 'string' ? pill(t('lib.detail.hasExplanation')) : null, q.image ? pill(t('lib.detail.image'), 'info') : null, q.audio ? pill(t('lib.detail.audio'), 'info') : null))));
    } else if (sel.kind === 'document') {
      body = h('section', {}, h('h3', { class: 'sec' }, t('lib.detail.sentences')), h('ol', { class: 'qlist' }, p.items.map((i) => h('li', {}, h('span', {}, i.sourceText), typeof i.referenceTranslation === 'string' ? pill(t('lib.detail.reference')) : null))));
    } else {
      body = h('section', {}, h('h3', { class: 'sec' }, t('lib.detail.text')), h('div', { class: 'textpreview' }, p.text.length > 1200 ? `${[...p.text].slice(0, 1200).join('')}…` : p.text));
    }
    fill(colC, head, body);
  }

  async function openEditor(kind, id) {
    st.mode = 'edit';
    // A paper is authored in the MAIN workspace (a spacious editor with a question navigator), not squeezed into the
    // detail column; leaving it returns to the Library on the paper that was edited.
    const workspace = kind === 'paper';
    const host = workspace ? main : colC;
    const back = (sel) => app.navigate('library', { domain: st.domain, group: st.group, ...(sel ? { select: sel } : {}) });
    fill(host, h('p', { class: 'muted' }, t('common.loading')));
    try {
      await EDITORS[kind](app, host, {
        id,
        onDone: async (saved) => {
          st.mode = 'view';
          const sel = saved ? { kind: saved.kind, id: saved.id } : st.selected;
          if (workspace) { await back(sel); return; }
          await reload(sel);
        },
      });
    } catch (e) {
      st.mode = 'view';
      toast(e?.code === 'GONE' ? t('lib.gone') : String(e?.message ?? e), { kind: 'error', ms: 0 });
      if (workspace) { await back(null); return; }
      await reload(null);
    }
  }

  function paint() {
    paintNav();
    paintList();
    paintDetail();
  }

  // ---------------------------------------------------------------------------------------------- header
  const chooseNew = () => modal({ title: t('lib.new.title'), build: (close) => [
    h('div', { class: 'choices-grid' }, ['paper', 'document', 'text'].map((k) => h('button', { class: 'ticket', type: 'button', onclick: () => close(k) }, h('h4', {}, t(NEW_LABEL[k])), h('p', { class: 'muted' }, t(`${NEW_LABEL[k]}Hint`))))),
    h('menu', {}, h('button', { class: 'btn', type: 'button', onclick: () => close('cancel') }, t('common.cancel')))] });
  const chooseImport = () => modal({ title: t('lib.import.title'), build: (close) => [
    h('div', { class: 'stack' }, h('button', { class: 'btn', type: 'button', onclick: () => close('paper') }, t('lib.import.paper')), h('button', { class: 'btn', type: 'button', onclick: () => close('document') }, t('lib.import.document'))),
    h('menu', {}, h('button', { class: 'btn', type: 'button', onclick: () => close('cancel') }, t('common.cancel')))] });

  fill(main,
    h('div', { class: 'vhead' },
      h('div', {}, h('div', { class: 'kicker' }, t('lib.kicker')), h('h1', { tabindex: '-1', id: 'view-title' }, t('lib.title')), h('p', { class: 'muted' }, t('lib.lede'))),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: guarded(toast, async () => {
          const which = await chooseImport();
          if (which === 'cancel') return;
          const done = which === 'paper' ? await importPaperFlow(app) : await importDocumentFlow(app);
          if (done) { st.domain = 'all'; st.group = null; await reload({ kind: done.kind, id: done.id }); }
        }) }, t('lib.import')),
        h('button', { class: 'btn primary', type: 'button', id: 'lib-new', onclick: async () => { const k = await chooseNew(); if (k !== 'cancel') openEditor(k, null); } }, t('lib.new')))),
    h('div', { class: 'tri' }, colA, colB, colC));
  wireResizer(app, main.querySelector('.resizer'));
  document.addEventListener('keydown', slash);
  function slash(e) {
    if (!main.isConnected) { document.removeEventListener('keydown', slash); return; }
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.querySelector('dialog[open]')) { e.preventDefault(); search.focus(); }
  }
  paint();
  if (params.create) openEditor(params.create, null);
  return { focus: () => main.querySelector('#view-title')?.focus() };
}

/** The list column width is a preference (saved in the Rust-owned settings); arrow keys and dragging both adjust it. */
function wireResizer(app, handle) {
  if (!handle) return;
  const root = document.documentElement;
  let width = app.prefs.all().listWidth;
  const apply = (w) => { width = Math.max(LIST_WIDTH.min, Math.min(LIST_WIDTH.max, Math.round(w / LIST_WIDTH.step) * LIST_WIDTH.step)); root.style.setProperty('--list-w', `${width}px`); };
  const save = () => app.prefs.set('listWidth', width).catch(() => {});
  handle.addEventListener('pointerdown', (e) => {
    handle.setPointerCapture(e.pointerId);
    const left = handle.parentElement.getBoundingClientRect().left;
    const move = (ev) => apply(ev.clientX - left);
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); save(); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); apply(width - LIST_WIDTH.step); save(); } else if (e.key === 'ArrowRight') { e.preventDefault(); apply(width + LIST_WIDTH.step); save(); }
  });
}
