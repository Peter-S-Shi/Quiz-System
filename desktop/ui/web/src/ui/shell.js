// The product shell: the approved information architecture (Today, Calendar, Library, History, Review, Exchange, Settings,
// plus the Focused Practice surface) over the product services. It owns navigation, the chrome (sidebar badges, domain
// list, language/theme preferences, notices) and the door into Focused Practice. It holds no domain logic.
import './strings-common.js';
import { defineStrings, getLocale, t } from '../i18n.js';
import { newId } from '../ids.js';
import { createProduct } from '../product/index.js';
import { createMediaPresenter } from '../practice/media-presenter.js';
import { StartError } from '../product/learning.js';
import { createPrefs } from './prefs.js';
import { createSfx } from './sfx.js';
import { createPracticeEntry } from './practice-entry.js';
import { createToaster, fill, h } from './kit.js';
import { renderToday } from './views/today.js';
import { renderCalendar } from './views/calendar.js';
import { renderLibrary } from './views/library.js';
import { renderHistory } from './views/history.js';
import { renderReview } from './views/review.js';
import { renderExchange } from './views/exchange.js';
import { renderSettings } from './views/settings.js';

defineStrings({
  'shell.loadFailed': ['This view could not be loaded: {message}', '无法载入这个视图：{message}'],
  'shell.retry': ['Try again', '重试'],
  'shell.skip': ['Skip to content', '跳到正文'],
});

const NAV = [['today', '1'], ['calendar', '2'], ['library', '3'], ['history', '4'], ['review', '5'], ['exchange', '6']];
const VIEWS = { today: renderToday, calendar: renderCalendar, library: renderLibrary, history: renderHistory, review: renderReview, exchange: renderExchange, settings: renderSettings };
const isTyping = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * @param {object} args
 * @param {object} args.port Store Port
 * @param {object} args.native native flows (Rust-owned dialogs): `{ pickMedia, exportText, importText, backup..., migration... }`
 * @param {{version?: string, info?: object}} [args.about]
 */
export async function startProduct({ port, native, about = {}, clock, now, doc = document, onHealth = () => {} }) {
  const media = createMediaPresenter(port);
  const product = await createProduct({ port, clock, now, media });
  const prefs = createPrefs(port);
  await prefs.load();

  const main = doc.getElementById('main');
  const toast = createToaster(doc.getElementById('toast'));
  const sfx = createSfx({ enabled: () => prefs.all().sound, reduced: () => prefs.all().motion === 'reduced' });
  const state = { view: 'today', params: {}, token: 0 };

  const app = {
    port, product, prefs, main, toast, native, sfx, about, ids: newId, onHealth,
    get view() { return state.view; },

    navigate(view, params = {}) { return show(view, params); },
    refresh() { return show(state.view, state.params, { keepFocus: true }); },
    refreshChrome,

    /** Start a session (Selection x Intent x Domain) and open Focused Practice. Failures are explained, never silent. */
    async startSession(opts) {
      try {
        const started = await product.learning.start(opts);
        entry.open(started, { returnTo: { view: state.view, params: state.params } });
      } catch (e) {
        if (e instanceof StartError && e.code === 'MEDIA_UNAVAILABLE') toast(t('start.mediaUnavailable', { reasons: e.detail.problems.map((p) => p.reason).join('; ') }), { kind: 'error', ms: 0 });
        else if (e instanceof StartError && e.code === 'MATERIAL_GONE') toast(t('start.gone'), { kind: 'error', ms: 0 });
        else if (e instanceof StartError && e.code === 'NOT_READY') toast(t('start.notReady'), { kind: 'error', ms: 0 });
        else toast(t('start.failed', { message: String(e?.message ?? e).replace(/^[A-Z_]+: /, '') }), { kind: 'error', ms: 0 });
      }
    },

    openRestored(started) { entry.open(started, { returnTo: { view: state.view, params: state.params } }); },

    /** Focused Practice closed: say what happened and return to where the learner came from. */
    afterPractice(outcome, returnTo, message) {
      if (outcome === 'left') toast(t('practice.left'));
      else if (outcome === 'discarded') toast(t('practice.discarded'));
      else if (outcome === 'retry-failed') toast(t('practice.retryFailed', { message }), { kind: 'error', ms: 0 });
      const back = returnTo ?? { view: 'today', params: {} };
      return show(back.view, back.params, { keepFocus: false });
    },
  };
  const entry = createPracticeEntry({ app });
  app.practice = entry;

  // ------------------------------------------------------------------------------------------------- chrome
  const nav = doc.getElementById('nav');
  const domains = doc.getElementById('domains');
  const footNav = doc.getElementById('footNav');
  let chrome = { due: 0, awaitingDecision: 0, counts: { objective: 0, translation: 0, typing: 0 } };

  function paintChrome() {
    doc.getElementById('domainsHead').textContent = t('nav.domains');
    nav.setAttribute('aria-label', t('nav.views'));
    const badge = (n, label) => (n > 0 ? h('span', { class: 'badge', title: label, 'aria-label': label }, String(n)) : null);
    fill(nav,
      h('span', { class: 'axis', 'aria-hidden': 'true' }), h('span', { class: 'ink', id: 'navInk', 'aria-hidden': 'true' }),
      NAV.map(([name, key]) => h('button', { type: 'button', 'data-view': name, 'aria-current': name === state.view ? 'page' : null, onclick: () => show(name) },
        h('i', { class: 'node', 'aria-hidden': 'true' }), t(`nav.${name}`),
        name === 'today' ? badge(chrome.due, t('nav.dueBadge', { n: chrome.due })) : name === 'calendar' ? badge(chrome.awaitingDecision, t('nav.decideBadge', { n: chrome.awaitingDecision })) : null,
        h('kbd', { 'aria-hidden': 'true' }, key))));
    fill(domains, ['objective', 'translation', 'typing'].map((d) => h('button', { type: 'button', 'data-domain': d, onclick: () => show('library', { domain: d }) },
      h('span', { class: `dot ${{ objective: 'obj', translation: 'tr', typing: 'ty' }[d]}`, 'aria-hidden': 'true' }), t(`domain.${d}`), h('span', { class: 'n' }, String(chrome.counts[d])))));
    fill(footNav, h('button', { type: 'button', class: 'util', 'data-view': 'settings', 'aria-current': state.view === 'settings' ? 'page' : null, onclick: () => show('settings') }, h('span', { 'aria-hidden': 'true' }, '⚙'), t('nav.settings'), h('kbd', { 'aria-hidden': 'true' }, ',')),
      h('div', { class: 'local' }, h('i', { 'aria-hidden': 'true' }), t('nav.offline')));
    moveInk();
  }

  function moveInk() {
    const ink = doc.getElementById('navInk');
    const active = nav.querySelector('button[aria-current="page"]');
    if (!ink) return;
    if (!active) { ink.style.setProperty('opacity', '0'); return; }
    ink.style.setProperty('opacity', '1');
    ink.style.setProperty('top', `${active.offsetTop + (active.offsetHeight - 18) / 2}px`);
  }

  async function refreshChrome() {
    try {
      chrome = await product.chrome();
    } catch {
      /* the chrome is decoration; a failed count never blocks a view */
    }
    paintChrome();
  }

  // ------------------------------------------------------------------------------------------------ routing
  async function show(view, params = {}, { keepFocus = false } = {}) {
    if (!VIEWS[view]) view = 'today';
    const token = ++state.token;
    state.view = view;
    state.params = params;
    doc.getElementById('app')?.removeAttribute('data-focus');
    paintChrome();
    main.dataset.view = view;
    fill(main, h('p', { class: 'muted loading', role: 'status' }, t('common.loading')));
    try {
      const rendered = await VIEWS[view](app, main, params);
      if (token !== state.token) return;
      await refreshChrome();
      if (!keepFocus) (rendered?.focus ? rendered.focus() : main.querySelector('#view-title, h1')?.focus?.());
    } catch (e) {
      if (token !== state.token) return;
      fill(main, h('h1', { tabindex: '-1', id: 'view-title' }, t(`nav.${view}`)),
        h('div', { class: 'error-box', role: 'alert' }, t('shell.loadFailed', { message: String(e?.message ?? e).replace(/^[A-Z_]+: /, '') })),
        h('button', { class: 'btn', type: 'button', onclick: () => show(view, params) }, t('shell.retry')));
      main.querySelector('#view-title')?.focus();
    }
  }

  // language / theme changes repaint the chrome and the current view
  prefs.onChange((name) => { if (name === 'language') { doc.title = 'Quiz Studio'; refreshChrome().then(() => show(state.view, state.params, { keepFocus: true })); } });

  doc.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || isTyping(e.target) || doc.getElementById('app')?.dataset.focus === 'on' || doc.querySelector('dialog[open]')) return;
    const hit = NAV.find(([, key]) => key === e.key);
    if (hit) { e.preventDefault(); show(hit[0]); } else if (e.key === ',') { e.preventDefault(); show('settings'); }
  });

  await refreshChrome();
  try {
    await product.learning.sweep();
  } catch {
    /* a failed planning sweep never blocks the app; the next one recomputes from scratch */
  }
  await show('today');
  return { app, show, locale: getLocale };
}
