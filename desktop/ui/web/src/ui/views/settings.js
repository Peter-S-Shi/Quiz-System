// Settings: V1's interface preferences (language, appearance, motion, physical sound, list width), stored on this computer
// in the application's own database, plus read-only system facts. Data, backup and migration live in Exchange & backup.
// Preferences never change any data.
import { defineStrings, t } from '../../i18n.js';
import { LIST_WIDTH, PREF_DEFAULTS } from '../prefs.js';
import { fill, guarded, h, seg } from '../kit.js';

defineStrings({
  'set.kicker': ['Settings · Preferences', '设置 · 偏好'],
  'set.title': ['Settings', '设置'],
  'set.lede': ['Interface preferences, kept on this computer. Data, backup and migration are in Exchange & backup.', '界面偏好保存在本机。数据、备份与迁移在“交换与备份”。'],
  'set.language': ['Interface language', '界面语言'],
  'set.languageBody': ['Switches menus, buttons and messages. It does not change the language of your material.', '切换菜单、按钮与提示的语言，不影响材料本身的语言。'],
  'set.theme': ['Appearance', '外观'],
  'set.themeBody': ['Follow the system, or choose a light or dark paper.', '跟随系统，或选择浅色、深色纸面。'],
  'set.theme.system': ['System', '跟随系统'],
  'set.theme.light': ['Light', '浅色'],
  'set.theme.dark': ['Dark', '深色'],
  'set.motion': ['Motion', '动效'],
  'set.motionBody': ['Reduce page, ink and stamp motion. The system "reduce motion" setting is always honored.', '减弱翻页、墨线与盖章动效。系统的“减少动态效果”设置始终有效。'],
  'set.motion.standard': ['Standard', '标准'],
  'set.motion.reduced': ['Reduced', '减弱'],
  'set.sound': ['Physical sound', '物理音效'],
  'set.soundBody': ['Soft page, pen and stamp sounds. Off by default; never the only feedback.', '轻柔的翻页、笔触与印章声。默认关闭，且不会成为唯一的反馈。'],
  'set.soundTry': ['Try:', '试听：'],
  'set.sound.page': ['page', '翻页'],
  'set.sound.pen': ['pen', '笔触'],
  'set.sound.stamp': ['stamp', '印章'],
  'set.width': ['List width', '列表宽度'],
  'set.widthBody': ['The list column in the Library and History. You can also drag its edge.', '资料库与证据历史中列表栏的宽度，也可以直接拖动列表栏的边缘调整。'],
  'set.widthReset': ['Reset', '恢复默认'],
  'set.on': ['On', '开'],
  'set.off': ['Off', '关'],
  'set.saveFailed': ['The preference could not be saved: {message}', '无法保存偏好：{message}'],
  'sys.title': ['This computer', '本机'],
  'sys.product': ['Product', '产品'],
  'sys.identifier': ['Identifier', '标识'],
  'sys.location': ['Data location', '数据位置'],
  'sys.locationValue': ['Application data folder of the current Windows user (managed by the application)', '当前 Windows 用户的应用数据目录（由应用管理）'],
  'sys.schema': ['Store schema', '存储 schema'],
  'sys.schemaValue': ['v{v} (this build supports v{c})', 'v{v}（本版本支持 v{c}）'],
  'sys.health': ['Store health', '存储状态'],
  'sys.healthy': ['Healthy: integrity check and projection consistency passed', '正常：完整性检查与投影一致性均已通过'],
  'sys.unhealthy': ['NOT HEALTHY ({n} consistency problem(s)); writes are disabled until the store is restored.', '状态异常（{n} 个一致性问题）；在恢复存储之前，写入已被禁用。'],
  'sys.snapshots': ['Snapshots', '快照'],
  'sys.snapshotsValue': ['{n} snapshot(s); newest: {name}', '{n} 个快照；最新：{name}'],
  'sys.snapshotsNone': ['none yet', '暂无'],
  'sys.check': ['Run a consistency check', '运行一致性检查'],
  'sys.checkClean': ['Consistency check: clean (quick_check ok, 0 projection problems).', '一致性检查：干净（quick_check 通过，0 个投影问题）。'],
  'sys.checkProblems': ['Consistency check: {n} problem(s).', '一致性检查：{n} 个问题。'],
  'media.title': ['Media files', '媒体文件'],
  'media.body': ['Add images or audio to the application. They are stored once (by content) and can then be attached to questions.', '把图片或音频添加到应用中。它们按内容只存一份，之后可以挂到题目上。'],
  'media.add': ['Add a file…', '添加文件…'],
  'media.drop': ['Drop a file here to store it (streamed, bounded memory) - or use the button.', '把文件拖到这里即可存入（流式写入，内存占用有上限），也可以用按钮。'],
  'media.stored': ['Stored "{name}" ({size}) as {hash}…{dup}', '已存入“{name}”（{size}），编号 {hash}…{dup}'],
  'media.dup': [' [already present]', '（已存在）'],
  'media.failed': ['Adding the file failed: {message}', '添加文件失败：{message}'],
  'media.log': ['Activity', '活动'],
});

const fmtBytes = (n) => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(2)} GiB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MiB` : n >= 1 << 10 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`);

const row = (title, body, control) => h('div', { class: 'setrow' }, h('div', {}, h('h4', {}, title), h('p', { class: 'muted' }, body)), control);

export async function renderSettings(app, main) {
  const { prefs, port, native, toast } = app;
  const save = async (name, value) => {
    try {
      await prefs.set(name, value);
    } catch (e) {
      toast(t('set.saveFailed', { message: String(e?.message ?? e) }), { kind: 'error', ms: 0 });
    }
  };
  const p = prefs.all();

  const langSeg = seg({ label: t('set.language'), options: [{ value: 'zh-CN', label: '中文' }, { value: 'en', label: 'English' }], value: p.language, onchange: (v) => save('language', v) });
  const themeSeg = seg({ label: t('set.theme'), options: ['system', 'light', 'dark'].map((v) => ({ value: v, label: t(`set.theme.${v}`) })), value: p.theme, onchange: (v) => save('theme', v) });
  const motionSeg = seg({ label: t('set.motion'), options: ['standard', 'reduced'].map((v) => ({ value: v, label: t(`set.motion.${v}`) })), value: p.motion, onchange: (v) => save('motion', v) });
  const sound = h('button', { type: 'button', class: 'toggle big', id: 'pref-sound', role: 'switch', 'aria-checked': String(p.sound), 'aria-label': t('set.sound'), onclick: async () => {
    const next = sound.getAttribute('aria-checked') !== 'true';
    sound.setAttribute('aria-checked', String(next));
    await save('sound', next);
    if (next) app.sfx('page');
  } }, h('span', { class: 'sw', 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, t('set.on')));
  const widthVal = h('span', { class: 'mono', id: 'pref-width-val' }, `${p.listWidth} px`);
  const width = h('input', { type: 'range', id: 'pref-width', min: String(LIST_WIDTH.min), max: String(LIST_WIDTH.max), step: String(LIST_WIDTH.step), value: String(p.listWidth), 'aria-label': t('set.width'),
    oninput: () => { widthVal.textContent = `${width.value} px`; document.documentElement.style.setProperty('--list-w', `${width.value}px`); },
    onchange: () => save('listWidth', Number(width.value)) });
  const prefsCard = h('div', { class: 'card setlist' },
    row(t('set.language'), t('set.languageBody'), langSeg.el),
    row(t('set.theme'), t('set.themeBody'), themeSeg.el),
    row(t('set.motion'), t('set.motionBody'), motionSeg.el),
    row(t('set.sound'), h('span', {}, t('set.soundBody'), ' ', t('set.soundTry'), ' ', ['page', 'pen', 'stamp'].map((s) => h('button', { class: 'linkish sfx-try', type: 'button', onclick: () => { app.sfx(s); } }, t(`set.sound.${s}`)))), sound),
    row(t('set.width'), t('set.widthBody'), h('div', { class: 'widthctl' }, width, widthVal, h('button', { class: 'btn small ghost', type: 'button', onclick: () => { width.value = String(PREF_DEFAULTS.listWidth); width.dispatchEvent(new Event('input')); save('listWidth', PREF_DEFAULTS.listWidth); } }, t('set.widthReset')))));

  // ---- system facts (read-only) and the media store
  const info = await port.schemaInfo();
  const snapshots = await port.listSnapshots();
  const healthText = info.startup.healthy ? t('sys.healthy') : t('sys.unhealthy', { n: info.startup.consistencyProblems });
  app.onHealth(info.startup.healthy, info.startup.healthy ? t('nav.storeHealthy') : t('nav.storeAttention'));
  const out = h('div', { class: 'log', role: 'log', 'aria-live': 'polite' }, '');
  const say = (line) => { out.textContent = `${line}\n${out.textContent}`; };
  const system = h('section', { class: 'card', 'aria-labelledby': 'sys-h' }, h('h2', { id: 'sys-h', class: 'sec' }, t('sys.title')),
    h('dl', { class: 'kv' },
      h('dt', {}, t('sys.product')), h('dd', {}, `${info.product} ${info.appVersion}`),
      h('dt', {}, t('sys.identifier')), h('dd', { class: 'mono' }, info.identifier),
      h('dt', {}, t('sys.location')), h('dd', {}, t('sys.locationValue')),
      h('dt', {}, t('sys.schema')), h('dd', {}, t('sys.schemaValue', { v: info.store.userVersion, c: info.store.catalogVersion })),
      h('dt', {}, t('sys.health')), h('dd', {}, healthText),
      h('dt', {}, t('sys.snapshots')), h('dd', {}, snapshots.length ? t('sys.snapshotsValue', { n: snapshots.length, name: snapshots[0].name }) : t('sys.snapshotsNone'))),
    h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: guarded(toast, async () => {
      const r = await port.checkConsistency();
      say(r.quickCheckOk && r.problems.length === 0 ? t('sys.checkClean') : t('sys.checkProblems', { n: r.problems.length }));
    }) }, t('sys.check'))));

  const bar = h('i');
  const progress = h('div', { class: 'progress', hidden: true, role: 'progressbar', 'aria-label': t('media.title') }, bar);
  const drop = h('div', { class: 'drop', id: 'dropzone' }, t('media.drop'));
  const showStored = (r) => say(t('media.stored', { name: r.name, size: fmtBytes(r.size), hash: r.hash.slice(0, 12), dup: r.deduplicated ? t('media.dup') : '' }));
  const media = h('section', { class: 'card', 'aria-labelledby': 'media-h' }, h('h2', { id: 'media-h', class: 'sec' }, t('media.title')), h('p', { class: 'muted' }, t('media.body')),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', id: 'media-add', onclick: guarded(toast, async () => { const r = await native.pickMedia(); if (r) showStored(r); }) }, t('media.add'))),
    drop, progress, h('h3', { class: 'sec' }, t('media.log')), out);

  const unsubs = [
    native.onProgress?.(({ done, total }) => { progress.hidden = false; bar.style.width = total ? `${Math.min(100, (100 * done) / total).toFixed(1)}%` : '100%'; progress.setAttribute('aria-valuenow', total ? String(Math.round((100 * done) / total)) : '100'); }),
    native.onDrag?.(({ over }) => drop.classList.toggle('over', over)),
    native.onIngested?.((r) => { progress.hidden = true; if (r.ok) showStored(r.result); else say(t('media.failed', { message: `${r.error.code}: ${r.error.message}` })); }),
  ].filter(Boolean);
  // listeners are released when this view is replaced
  const observer = new MutationObserver(() => { if (!main.contains(system)) { unsubs.forEach((u) => u()); observer.disconnect(); } });
  observer.observe(main, { childList: true });

  fill(main,
    h('div', { class: 'vhead' }, h('div', {}, h('div', { class: 'kicker' }, t('set.kicker')), h('h1', { tabindex: '-1', id: 'view-title' }, t('set.title')), h('p', { class: 'muted' }, t('set.lede')))),
    prefsCard, system, media);
  return { focus: () => main.querySelector('#view-title')?.focus() };
}
