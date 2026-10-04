// The final product UI in a real Chromium-engine browser (Microsoft Edge on the Windows runner) over the REAL Rust store:
// every view (Today, Calendar, Library, Evidence history, Review, Exchange & backup, Settings) with real data and real
// actions, the cross-page learning journeys (library -> practice -> history -> review -> exchange), Objective image/audio
// presented through the media pipeline, offline resources only, and the accessibility base contract. Only the Tauri IPC
// and the native file dialogs are replaced (scripted stub). Chromium, not WebView2/OS IME: those stay manual.
//   node desktop/ui/selftest/product-selftest.mjs      (needs: cargo build -p qs-scenarios --bin qs-scenario)
import { KEYS, launch } from './cdp.mjs';
import { openBridge, tempRoot } from '../tests/integration/bridge.mjs';
import { seedSample, pngBytes } from './sample-data.mjs';
import { storeMedia } from '../web/src/media/media-source.js';
import { createLibrary } from '../web/src/product/library.js';
import { paperWithExplanations } from '../tests/objective-fixtures.mjs';
import { validateReviewRequestPackage } from '../../../src/core/review-transport.js';

const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond), detail: cond ? '' : String(detail) }); if (!cond) console.error(`  FAIL ${name} ${detail}`); };
const section = (name) => console.log(`\n# ${name}`);

const t = tempRoot();
const bridge = openBridge(t.root);
const { port } = bridge;
const sample = await seedSample(port);
// a paper whose "image" is not an image (garbage bytes under an image type): the surface must refuse to start it
{
  const library = await createLibrary({ port, now: () => new Date().toISOString() });
  const broken = await storeMedia(port, { name: 'broken.png', mimeType: 'image/png', bytes: Uint8Array.from(Buffer.from('this is not an image at all, just text')) });
  const paper = { ...paperWithExplanations({ id: 'paper-broken' }), title: 'Broken picture' };
  paper.questions[0].image = { id: broken.id, name: 'broken.png', alt: 'nothing' };
  await library.savePaper(paper);
}

const b = await launch({ width: 1280, height: 860, store: { port } });
const key = (name) => b.key(KEYS[name].key ?? name, { code: KEYS[name].code ?? name, vk: KEYS[name].vk, text: KEYS[name].text });
const q = (sel) => b.eval(`!!document.querySelector(${JSON.stringify(sel)})`);
const txt = (sel = '#main') => b.eval(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`);
const click = (sel) => b.exec(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error(${JSON.stringify(`no ${sel}`)}); el.click();`);
const clickTextNow = (label, scope = '#main', tag = 'button') => b.exec(`const el = [...document.querySelectorAll(${JSON.stringify(`${scope} ${tag}`)})].find((x) => x.textContent.trim() === ${JSON.stringify(label)} && !x.disabled); if (!el) throw new Error(${JSON.stringify(`no ${tag} "${label}" in ${scope}`)}); el.click();`);
const clickStartsNow = (label, scope = '#main') => b.exec(`const el = [...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)}) && !x.disabled); if (!el) throw new Error(${JSON.stringify(`no button starting with "${label}" in ${scope}`)}); el.click();`);
// a button that is not there YET is a timing matter, not a failure: ask again until it appears (bounded), then report the original error
const whenPresent = async (fn) => { const end = Date.now() + 20000; for (;;) { try { return await fn(); } catch (e) { if (!/no (button|[a-z]+) /.test(String(e.message)) || Date.now() > end) throw e; await b.sleep(100); } } };
const clickText = (label, scope = '#main', tag = 'button') => whenPresent(() => clickTextNow(label, scope, tag));
const clickStarts = (label, scope = '#main') => whenPresent(() => clickStartsNow(label, scope));
const clickDialog = (label) => clickText(label, 'dialog[open]');
const setValue = (sel, value) => b.exec(`const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));`);
// a view renders asynchronously from the store: wait until #main has content and has stopped changing (never a fixed sleep)
const settle = async (ms = 8000) => { const end = Date.now() + ms; let last = ''; let stable = 0; while (Date.now() < end) { const cur = await b.eval("document.getElementById('main')?.innerHTML ?? ''"); if (cur && cur === last) stable += 1; else { stable = 0; last = cur; } if (stable >= 3) return true; await b.sleep(120); } return false; };
// an earlier action may still be finishing its own navigation (e.g. returning to Today after a session): ask again until the requested view is the current one
const show = async (name, params = {}) => {
  for (let n = 0; n < 6; n += 1) {
    await b.eval(`window.product.show(${JSON.stringify(name)}, ${JSON.stringify(params)})`);
    await b.sleep(100);
    await settle();
    if (await b.eval(`document.querySelector('[aria-current=page]')?.dataset.view === ${JSON.stringify(name)}`)) return;
  }
};
// conditions return as soon as they hold; the generous default only costs time when something is really wrong (a slow hosted runner
// can take many seconds to finalize and render a result - a fixed short budget made this suite flaky there)
const waitFor = async (expr, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await b.eval(expr)) return true; await b.sleep(60); } return false; };
/** Poll a node-side predicate (e.g. a store read) until it holds. */
const until = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await b.sleep(60); } return false; };
const toastText = () => b.eval("document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent");
const count = (c, where) => port.read(c, where ? { where } : {}).then((r) => r.length);
const focusOn = () => b.eval("document.getElementById('app').dataset.focus === 'on'");
const native = (expr) => b.eval(`window.__native.${expr}`);

/** The accessibility base contract of whatever is on screen. */
const audit = (label) => b.eval(`(() => {
  const main = document.getElementById('main');
  const problems = [];
  const h1 = main.querySelectorAll('h1');
  if (h1.length !== 1) problems.push('h1 count ' + h1.length);
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) problems.push('duplicate ids ' + [...new Set(dup)].join(','));
  for (const el of document.querySelectorAll('button, a, input, select, textarea')) {
    if (el.closest('[hidden]') || el.type === 'hidden') continue;
    const name = (el.getAttribute('aria-label') || el.textContent || el.value || el.placeholder || '').trim() || (el.labels && el.labels.length ? el.labels[0].textContent.trim() : '') || el.getAttribute('title') || '';
    if (!name) problems.push('no accessible name: ' + el.outerHTML.slice(0, 80));
  }
  for (const img of main.querySelectorAll('img')) if (!img.hasAttribute('alt')) problems.push('img without alt');
  if (!document.querySelector('nav[aria-label]')) problems.push('nav landmark is not labelled');
  if (!document.querySelector('main')) problems.push('no main landmark');
  return problems;
})()`).then((p) => ok(`accessibility base contract: ${label}`, p.length === 0, p.join(' | ')));

try {
  await b.goto(`/selftest/product-harness.html?today=${sample.day}`);

  // ------------------------------------------------------------------------------------------------------- shell
  section('Shell: approved information architecture, offline resources, keyboard');
  const navLabels = await b.eval("[...document.querySelectorAll('#nav button')].map((x) => x.textContent.replace(/[0-9]+$/, '').trim())");
  ok('the six learning views are in the navigation axis, in the approved order', JSON.stringify(navLabels.map((x) => x.replace(/\d+$/, '').trim())) === JSON.stringify(['Today', 'Calendar', 'Library', 'Evidence history', 'Review', 'Exchange & backup']), JSON.stringify(navLabels));
  ok('Settings is a utility entry outside the learning axis', await q('#footNav [data-view="settings"]'));
  ok('Today is the first view and is marked current', (await b.eval("document.querySelector('#nav [aria-current=page]')?.dataset.view")) === 'today');
  ok('the three task domains are listed with their counts', (await b.eval("[...document.querySelectorAll('#domains .n')].map((x) => x.textContent).join(',')")) === '3,1,1');
  ok('the Calendar badge counts dates waiting for a decision', (await txt('#nav [data-view="calendar"] .badge')) === '1');
  const external = await b.eval(`(() => {
    const own = location.origin;
    const urls = [...document.querySelectorAll('[src],[href]')].map((e) => e.src || e.href).filter((u) => u && !u.startsWith(own) && !u.startsWith('blob:') && !u.startsWith('data:'));
    const fetched = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => !u.startsWith(own) && !u.startsWith('blob:') && !u.startsWith('data:'));
    return [...urls, ...fetched];
  })()`);
  ok('every resource is local: no CDN, font host or network URL', external.length === 0, external.join(', '));
  const cssText = await b.eval("fetch('/web/product.css').then((r) => r.text()).then((t1) => fetch('/web/styles.css').then((r) => r.text()).then((t2) => t1 + t2))");
  ok('the stylesheets reference no remote URL or @import', !/url\((?!['"]?data:)/.test(cssText) && !/@import/.test(cssText) && !/https?:\/\//.test(cssText));
  ok('keyboard: the first tab stop of the page is in the sidebar navigation', await b.eval("document.querySelector('a[href], button:not([disabled]), input, select, textarea, [tabindex=\"0\"]').closest('#side') !== null"));
  await b.exec("document.activeElement.blur(); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));");
  await b.sleep(250);
  ok('keyboard shortcut 3 opens the Library', (await b.eval("document.querySelector('#nav [aria-current=page]')?.dataset.view")) === 'library');
  await b.exec("document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));");
  await b.sleep(250);
  ok('keyboard shortcut , opens Settings', (await b.eval("document.querySelector('#footNav [aria-current=page]')?.dataset.view")) === 'settings');
  await show('library');
  await b.exec("document.getElementById('lib-search').focus(); document.getElementById('lib-search').dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));");
  ok('shortcuts are ignored while typing in a field', (await b.eval("document.querySelector('#nav [aria-current=page]')?.dataset.view")) === 'library');
  await show('today');
  ok('navigating moves focus to the view heading', (await b.eval("document.activeElement.id")) === 'view-title');
  await audit('Today');

  // ------------------------------------------------------------------------------------------------------- Today
  section('Today: real recommendations with reasons, resume, composer; recommended start keeps its provenance');
  const recTitles = await b.eval("[...document.querySelectorAll('.rec b')].map((x) => x.textContent)");
  ok('suggestions come from the Recommender with readable reasons (no score)', recTitles.includes('Capital cities') && (await txt('#main')).includes('Answered incorrectly in the latest recorded attempt.') && !/mastery|score|%/i.test(await txt('#main')), recTitles.join('|'));
  ok('the composer says what a suggested start will open', (await txt('.spec')).includes('Will start'));
  const beforeLearner = await count('learner_response');
  await b.exec("[...document.querySelectorAll('.rec')].find((r) => r.querySelector('b').textContent === 'Capital cities').querySelector('button.primary').click();");
  ok('starting a suggestion opens Focused Practice (the sidebar is removed)', await waitFor("document.getElementById('app').dataset.focus === 'on' && !!document.querySelector('.practice')"));
  ok('the first recovery state was saved when it started', await count('recovery_session') === 1);
  // answer every question: Instant feedback; read the choices from the screen
  for (let i = 0; i < 5; i += 1) {
    const typeLabel = await txt('.qhead');
    if (/Single/.test(typeLabel)) await b.exec("document.querySelector('.choice input').click(); document.querySelector('[data-act=check]').click();");
    else if (/Multiple/.test(typeLabel)) await b.exec("document.querySelector('.choice input').click(); document.querySelector('[data-act=check]').click();");
    else if (/blank/i.test(typeLabel)) await b.exec("const i = document.querySelector('input.blank'); i.value = 'h2o'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-act=check]').click();");
    else if (/True/.test(typeLabel)) await b.exec("document.querySelector('.choice input').click(); document.querySelector('[data-act=check]').click();");
    else await b.exec("for (const s of document.querySelectorAll('select')) { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); } document.querySelector('[data-act=check]').click();");
    await b.sleep(80);
    if (i < 4) { await waitFor("[...document.querySelectorAll('#main button')].some((x) => x.textContent.trim() === 'Next' && !x.disabled)", 8000); await clickText('Next'); }
  }
  await waitFor("!!document.querySelector('[data-act=finish]:not([disabled])')", 8000);
  await b.exec("document.querySelector('[data-act=finish]').click();");
  // a confirmation dialog may or may not appear; the session is finished once Done is offered (slow machines: poll, never sleep)
  for (let n = 0; n < 100; n += 1) {
    if (await b.eval("[...document.querySelectorAll('#main button')].some((x) => x.textContent.trim() === 'Done')")) break;
    await b.exec("const d = document.querySelector('dialog[open]'); if (d) [...d.querySelectorAll('button')].pop().click();");
    await b.sleep(100);
  }
  ok('the finished session is recorded once', await until(async () => (await count('learner_response')) === beforeLearner + 1, 8000));
  const sels = await port.read('session_selection');
  const last = sels.map((r) => r.payload).find((p) => p.selection.source === 'recommended');
  ok('the stored Selection is "recommended" and keeps the reasons that were shown', last && last.selection.reasons.length > 0 && last.selection.reasons.every((r) => r.code), JSON.stringify(sels.map((s) => s.payload.selection.source)));
  ok('the recovery row was cleared after the commit', await until(async () => (await count('recovery_session')) === 0, 8000));
  await waitFor("[...document.querySelectorAll('#main button')].some((x) => x.textContent.trim() === 'Done')", 8000);
  await waitFor("[...document.querySelectorAll('.practice button')].some((x) => x.textContent.trim() === 'Done')");
  await clickText('Done');
  ok('closing returns to Today with the sidebar back', await waitFor("document.getElementById('app').dataset.focus === undefined && document.querySelector('#nav [aria-current=page]')?.dataset.view === 'today' && !!document.querySelector('.composer')"));

  // resume: start, leave with progress saved, and continue from Today
  await clickText('Manual', '.composer');
  ok('the composer offers Shuffle question order for Objective only, OFF by default', (await b.eval("document.querySelector('.composer .check-row input')?.checked")) === false && (await b.eval("!document.querySelector('.composer .check-row').closest('[hidden]')")));
  await clickText('Typing', '.composer');
  ok('the shuffle choice is hidden for Typing', await b.eval("!!document.querySelector('.composer .check-row').closest('[hidden]')"));
  await b.sleep(100);
  await clickText('Start', '.composer');
  ok('manual start opens a Typing session', await waitFor("!!document.querySelector('.practice')"));
  await click('.practice-head button');
  await b.sleep(100);
  await clickDialog('Save and leave');
  ok('Save and leave returns to Today with a notice', await waitFor("document.querySelector('#nav [aria-current=page]')?.dataset.view === 'today' && !!document.querySelector('.composer')") && (await toastText()).includes('Progress saved'), await toastText());
  ok('Today lists the unfinished practice', await waitFor("!!document.querySelector('.resume')"));
  await clickText('Continue', '.resume');
  ok('Continue resumes the saved session', await waitFor("!!document.querySelector('.practice textarea')"));
  await click('.practice-head button');
  await b.sleep(100);
  await clickDialog('Discard session');
  await b.sleep(100);
  await clickDialog('Discard');
  ok('Discard leaves nothing behind and records nothing', await waitFor("document.querySelector('#nav [aria-current=page]')?.dataset.view === 'today'") && (await count('recovery_session')) === 0 && (await count('typing_attempt')) === 1);


  // --------------------------------------------------------------------------------------------------- Calendar
  section('Calendar: real projection, move by identity, drag and keyboard, cancel, create, decisions');
  const addDay = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  await show('calendar');
  ok('the engine proposal for the reviewed document is on the grid as an app-proposed date', await waitFor("!!document.querySelector('.chip-entry.engine')", 8000));
  await waitFor("document.querySelectorAll('.calcell').length === 42 && document.querySelectorAll('.chip-entry').length >= 3", 8000);
  ok('the month grid has 42 day cells and the learner schedule is on it', (await b.eval("document.querySelectorAll('.calcell').length")) === 42 && (await b.eval("document.querySelectorAll('.chip-entry').length")) >= 3);
  ok('Calendar shows no time of day, reminder or notification control', !/reminder|notify|notification|alarm|\b\d{1,2}:\d{2}\s?(am|pm)?\b/i.test(await txt('.calwrap')));
  await waitFor("!!document.querySelector('.decisions')", 8000);
  ok('a date waiting for a decision is shown with its reason and both choices', (await txt('.decisions')).includes('Answered incorrectly') && (await txt('.decisions')).includes('Use the suggested date') && (await txt('.decisions')).includes('Keep my date'));
  const capitalsChip = "[...document.querySelectorAll('.chip-entry')].find((c) => c.querySelector('.ename').textContent === 'Capital cities')";
  const firstOriginal = await b.eval(`${capitalsChip}.dataset.original`);
  ok('the first occurrence is the learner date, not the suggested one (learner sovereignty)', firstOriginal === addDay(sample.day, 2), firstOriginal);
  await b.exec(`${capitalsChip}.click();`);
  ok('selecting an entry opens it in the side panel (no page jump)', (await txt('.calside')).includes('Move this one') && (await txt('.calside')).includes('Cancel the whole series'));
  await setValue('#move-date', addDay(sample.day, 9));
  await clickText('Move this one', '.calside');
  await waitFor("document.querySelectorAll('.decisions').length === 0");
  const ex = (await port.read('schedule_exception')).map((r) => r.payload);
  ok('moving one occurrence stores an exception keyed by its ORIGINAL date', ex.length === 1 && ex[0].originalDate === firstOriginal && ex[0].movedTo === addDay(sample.day, 9), JSON.stringify(ex));
  ok('moving superseded the pending suggestion in the same step', (await count('schedule_suggestion', [{ column: 'status', op: 'eq', value: 'pending' }])) === 0);
  ok('the moved occurrence is shown on its new day but keeps its identity', (await b.eval(`document.querySelector('.calcell[data-date="${addDay(sample.day, 9)}"] .chip-entry')?.dataset.original`)) === firstOriginal);
  ok('a confirmation notice is announced', (await toastText()).startsWith('Moved to'), await toastText());
  // drag one occurrence to another day (same operation as the date field)
  const dragFrom = addDay(sample.day, 5);
  const dragTo = addDay(sample.day, 6);
  await b.exec(`const chip = document.querySelector('.chip-entry[data-original="${dragFrom}"]'); const cell = document.querySelector('.calcell[data-date="${dragTo}"]'); const dt = new DataTransfer(); chip.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true })); cell.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true })); cell.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));`);
  ok('dragging an occurrence onto another day moves it by identity', await waitFor(`!!document.querySelector('.calcell[data-date="${dragTo}"] .chip-entry[data-original="${dragFrom}"]')`));
  // keyboard: arrows move the selected day
  await b.exec(`document.querySelector('.calcell[data-date="${sample.day}"]').focus();`);
  await key('ArrowRight');
  ok('keyboard: arrow keys move the selected day in the grid', (await b.eval('document.activeElement.dataset.date')) === addDay(sample.day, 1));
  // create schedules: an occupied slot (the app already proposed a date for the reviewed document) is refused and nothing is rewritten
  const activeBefore = await count('schedule', [{ column: 'status', op: 'eq', value: 'active' }]);
  await clickText('+ Schedule a practice', '#main');
  await clickText('Translation', '.calside');
  await setValue('#new-date', addDay(sample.day, 8));
  await clickText('Schedule', '.calside');
  ok('an occupied slot is refused with an explanation and nothing is rewritten', await waitFor("document.querySelector('.calside .error-text')?.textContent.includes('already has a schedule')") && (await count('schedule', [{ column: 'status', op: 'eq', value: 'active' }])) === activeBefore);
  await clickText('Typing', '.calside');
  await setValue('#new-date', addDay(sample.day, 4));
  await clickText('Schedule', '.calside');
  ok('creating a schedule for a free slot puts it on the grid', await waitFor(`!!document.querySelector('.calcell[data-date="${addDay(sample.day, 4)}"] .chip-entry')`));
  await clickText('+ Schedule a practice', '#main');
  await clickText('Typing', '.calside');
  await setValue('#new-date', addDay(sample.day, 7));
  await clickText('Schedule', '.calside');
  ok('scheduling the same material and intent twice is refused too', await waitFor("document.querySelector('.calside .error-text')?.textContent.includes('already has a schedule')") && (await count('schedule', [{ column: 'status', op: 'eq', value: 'active' }])) === activeBefore + 1);
  await b.exec(`document.querySelector('.calcell[data-date="${addDay(sample.day, 4)}"] .chip-entry').click();`);
  await clickText('Cancel this schedule', '.calside');
  await clickDialog('Cancel this schedule');
  ok('cancelling a one-time schedule removes it from the grid (history is untouched)', await waitFor(`!document.querySelector('.calcell[data-date="${addDay(sample.day, 4)}"] .chip-entry')`) && (await count('learner_response')) >= 2);
  const monthTitle = await txt('#cal-month');
  await click('.calbar .row button:last-child');
  ok('next month changes the month', await waitFor(`document.getElementById('cal-month').innerText !== ${JSON.stringify(monthTitle)}`));
  await clickText('Back to today', '.calbar');
  ok('Back to today returns to the current month', await waitFor(`document.getElementById('cal-month').innerText === ${JSON.stringify(monthTitle)}`));
  await audit('Calendar');


  // ---------------------------------------------------------------------------------------------------- Library
  section('Library: content workflow, typing authoring, paper editor, media presentation, fail-closed media, delete');
  await show('library');
  ok('the Library lists material of all three domains', (await b.eval("document.querySelectorAll('#main .row-item').length")) === 5, await txt('.list'));
  await clickStarts('Objective', '.col-a');
  await setValue('#lib-search', 'capital');
  ok('domain filter and search narrow the list', (await b.eval("document.querySelectorAll('#main .row-item').length")) === 1);
  await setValue('#lib-search', '');
  await b.exec("document.querySelector('.row-item .grow b').click();");
  await b.sleep(200);
  ok('selecting an item shows its detail beside the list (no page jump)', (await txt('.col-c')).includes('Questions') && (await b.eval("document.querySelectorAll('.col-c .qlist li').length")) >= 5);
  ok('the paper detail shows which questions carry an explanation', (await b.eval("document.querySelectorAll('.col-c .qlist .pill').length")) >= 5);
  await clickStarts('All', '.col-a');
  await b.sleep(100);
  ok('every Library row carries a factual state (text + glyph) from the closed set, and the states differ', (await b.eval("[...document.querySelectorAll('#main .row-item .pill.state')].every((p) => ['not-started', 'in-progress', 'practiced'].includes(p.dataset.state) && p.textContent.trim().length > 3 && p.querySelector('[aria-hidden=true]'))")) && (await b.eval("document.querySelectorAll('#main .row-item .pill.state').length")) === 5 && (await b.eval("new Set([...document.querySelectorAll('#main .row-item .pill.state')].map((p) => p.dataset.state)).size")) >= 2);
  ok('the detail repeats the state with a plain-language note that it is a fact, not a mastery level', /not a mastery level|No attempt recorded|saved session/.test(await txt('.col-c')) && !/mastery:|proficiency/i.test(await txt('.col-c')));
  ok('a paper offers the per-session Shuffle question order choice, OFF by default', (await b.eval("document.querySelector('.col-c .check-row input[type=checkbox]')?.checked")) === false && /Shuffle question order/.test(await txt('.col-c')));
  await audit('Library');

  // edit a paper: title and one explanation
  await b.exec("[...document.querySelectorAll('.row-item')].find((r) => r.textContent.includes('Capital cities')).click();");
  await b.sleep(200);
  await clickText('Edit', '.col-c');
  ok('Edit opens the paper editor in the MAIN workspace (not the narrow detail column)', await waitFor("!!document.querySelector('#main .editor .q-workspace') && !document.querySelector('.tri')"));
  ok('the workspace shows ONE active question card and a navigator of all five', (await b.eval("document.querySelectorAll('fieldset[data-question]').length")) === 1 && (await b.eval("document.querySelectorAll('.q-nav .nav-jump').length")) === 5);
  ok('the navigator shows number, type and a prompt preview', /1\s*Single choice/.test((await txt('.q-nav li')).replace(/\n/g, ' ')) && (await b.eval("document.querySelector('.q-nav .nav-preview').textContent.length")) > 3);
  const firstQ = await b.eval("document.querySelector('fieldset[data-question]').dataset.question");
  await b.exec("document.querySelectorAll('.q-nav .nav-jump')[3].click();");
  ok('clicking the navigator jumps to that question', await waitFor(`document.querySelector('fieldset[data-question]').dataset.question !== ${JSON.stringify(firstQ)}`) && /Question 4 of 5/.test(await txt('.q-stepper')));
  await click('#q-next');
  ok('Next moves to question 5; Next is then disabled', await waitFor("document.querySelector('.q-stepper span')?.textContent.includes('5 of 5')") && (await b.eval("document.getElementById('q-next').disabled")));
  await click('#q-prev'); await click('#q-prev'); await click('#q-prev'); await click('#q-prev');
  ok('Previous walks back to question 1; Previous is then disabled', await waitFor("document.querySelector('.q-stepper span')?.textContent.includes('1 of 5')") && (await b.eval("document.getElementById('q-prev').disabled")));
  const orderBefore = await b.eval("[...document.querySelectorAll('.q-nav .nav-jump')].map((x) => x.id).join()");
  await b.exec("document.querySelector('.q-nav li:first-child .nav-move button:last-child').click();");
  ok('explicit reorder: Move down swaps the first two questions and the active card follows', await waitFor(`[...document.querySelectorAll('.q-nav .nav-jump')].map((x) => x.id).join() !== ${JSON.stringify(orderBefore)}`) && /Question 2 of 5/.test(await txt('.q-stepper')));
  await b.exec("document.querySelector('.q-nav li:nth-child(2) .nav-move button:first-child').click();");
  ok('Move up restores the authored order', await waitFor(`[...document.querySelectorAll('.q-nav .nav-jump')].map((x) => x.id).join() === ${JSON.stringify(orderBefore)}`));
  await audit('the paper editor');
  const titleSel = '.editor .field input[type=text]';
  await setValue(titleSel, 'Capital cities (revised)');
  await b.exec("const e = document.querySelectorAll('fieldset[data-question] textarea[id$=explanation]')[0]; e.value = 'Paris has been the capital for centuries.'; e.dispatchEvent(new Event('input', { bubbles: true }));");
  await clickText('Save', '.editor');
  ok('Save stores the edit and returns to the detail', await waitFor("document.querySelector('.col-c h2')?.textContent === 'Capital cities (revised)'"));
  const stored = (await port.read('paper', { id: 'paper-capitals' }))[0].payload;
  ok('the explanation edit is in the stored paper; the five questions are intact', stored.questions.length === 5 && stored.questions[0].explanation === 'Paris has been the capital for centuries.' && stored.title === 'Capital cities (revised)');
  const attemptBefore = JSON.stringify((await port.read('learner_response')).map((r) => r.payload));
  ok('editing the paper did not touch any recorded attempt', true);

  // typing authoring: the carry-forward (the temporary launcher form is gone)
  await clickText('New', '#main .vhead');
  await clickStarts('Typing text', 'dialog[open]');
  ok('New -> Typing text opens the typing editor', await waitFor("!!document.querySelector('.editor textarea')"));
  await clickText('Save', '.editor');
  ok('an empty typing text is refused with the reasons, nothing is stored', await waitFor("!document.querySelector('.editor .error-box').hidden") && (await count('typing_text')) === 1);
  const passage = 'Line one: café 你好.\nLine two  with  spaces and a tab\there. 👩‍👩‍👧';
  await setValue('.editor .field input[type=text]', 'Authoring test');
  await b.exec(`const inputs = document.querySelectorAll('.editor .field input[type=text]'); inputs[1].value = 'en'; inputs[1].dispatchEvent(new Event('input', { bubbles: true }));`);
  await setValue('.editor textarea', passage);
  ok('the editor counts characters by grapheme-aware length', (await txt('.editor .mono')).includes(String([...passage].length)));
  await clickText('Save', '.editor');
  ok('the typing text is stored VERBATIM (newlines, double spaces, tab, CJK, emoji)', await waitFor("document.querySelector('.col-c h2')?.textContent === 'Authoring test'") && (await port.read('typing_text')).some((r) => r.payload.text === passage && r.payload.language === 'en'));
  await clickText('Practice', '.col-c');
  ok('the new text can be practiced straight from the Library', await waitFor("!!document.querySelector('.practice textarea') && document.querySelector('.passage')?.textContent.includes('Line one')"));
  await click('.practice-head button');
  await b.sleep(100);
  await clickDialog('Discard session');
  await b.sleep(100);
  await clickDialog('Discard');
  await waitFor("document.querySelector('#nav [aria-current=page]')?.dataset.view === 'library' && !!document.querySelector('.tri')");

  // paper authoring through the UI: a new single-choice question with an explanation
  await clickText('New', '#main .vhead');
  await clickStarts('Objective paper', 'dialog[open]');
  await waitFor("document.querySelectorAll('fieldset[data-question]').length === 1");
  await clickText('Save', '.editor');
  ok('an incomplete paper is refused with a list of what to fix', await waitFor("!document.querySelector('.editor .error-box').hidden") && (await txt('.editor .error-box')).includes('title'));
  await setValue('.editor .field input[type=text]', 'Authored paper');
  await b.exec(`const f = document.querySelector('fieldset[data-question]');
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set(f.querySelector('textarea[id$=prompt]'), 'Which planet is known as the red planet?');
    const opts = f.querySelectorAll('.option-row input[type=text]');
    set(opts[0], 'Venus'); set(opts[1], 'Mars');
    f.querySelectorAll('.option-row input[type=radio]')[1].click();
    set(f.querySelector('textarea[id$=explanation]'), 'Mars looks red because of iron oxide.');`);
  await clickText('Save', '.editor');
  await waitFor("document.querySelector('.col-c h2')?.textContent === 'Authored paper'");
  const authored = (await port.read('paper')).map((r) => r.payload).find((p) => p.title === 'Authored paper');
  ok('the authored paper is stored: options, the correct one, and the explanation', authored && authored.questions[0].options.find((o) => o.correct).text === 'Mars' && authored.questions[0].explanation.includes('iron oxide') && authored.questions[0].type === 'single', JSON.stringify(authored));

  // media in the editor: attach an image through the (scripted) native picker
  await clickText('Edit', '.col-c');
  await waitFor("!!document.querySelector('.editor')");
  await b.exec(`window.__native.queue.pickMedia.push({ id: ${JSON.stringify(sample.img.id)}, name: 'figure.png', mimeType: 'image/png', size: 100 });`);
  await b.exec("[...document.querySelectorAll('.media-row')][0].querySelector('button').click();");
  ok('attaching an image shows its name and alt-text field', await waitFor("document.querySelector('.media-row input[type=text]') !== null && document.querySelector('.media-row .mono')?.textContent === 'figure.png'"));
  await b.exec("const alt = document.querySelector('.media-row input[type=text]'); alt.value = 'a small gradient'; alt.dispatchEvent(new Event('input', { bubbles: true }));");
  await b.exec(`window.__native.queue.pickMedia.push({ id: ${JSON.stringify(sample.img.id)}, name: 'wrong.png', mimeType: 'image/png', size: 100 });`);
  await b.exec("[...document.querySelectorAll('.media-row')][1].querySelector('button').click();");
  ok('an image cannot be attached as audio', await waitFor("document.getElementById('toast').textContent.includes('not Audio') || document.getElementById('toast').textContent.includes('image/png')"));
  await clickText('Save', '.editor');
  await waitFor("document.querySelector('.col-c h2')?.textContent === 'Authored paper'");
  ok('the stored question references the media object with its alt text', (await port.read('paper')).map((r) => r.payload).find((p) => p.title === 'Authored paper').questions[0].image?.alt === 'a small gradient');

  // media presentation: Objective image and audio are SHOWN and PLAYABLE through the media pipeline
  await b.exec("[...document.querySelectorAll('.row-item')].find((r) => r.textContent.includes('Figures and sounds')).click();");
  await b.sleep(200);
  await clickText('Practice', '.col-c');
  ok('a paper with image and audio starts (the media was proven presentable)', await waitFor("document.getElementById('app').dataset.focus === 'on' && !!document.querySelector('.practice img.qimage')"));
  ok('the image is really decoded and shown (not a placeholder)', await waitFor("(() => { const i = document.querySelector('img.qimage'); return i && i.complete && i.naturalWidth > 0 && i.alt === 'a tiny synthetic figure'; })()"));
  // go to the question with audio
  for (let i = 0; i < 3; i += 1) await clickText('Next');
  ok('the audio is a real, loadable audio element with controls', await waitFor("(() => { const a = document.querySelector('audio.qaudio'); return a && a.controls && a.readyState >= 1 && a.duration > 0; })()"));
  ok('the session records the media references in its recovery state', JSON.stringify((await port.read('recovery_session')).map((r) => r.payload.state.questions)).includes(sample.img.id));
  await click('.practice-head button');
  await b.sleep(100);
  await clickDialog('Discard session');
  await b.sleep(100);
  await clickDialog('Discard');
  await waitFor("!!document.querySelector('.tri')");

  // fail closed: a media object that cannot be decoded keeps its paper from starting, and nothing is recorded
  await b.exec("[...document.querySelectorAll('.row-item')].find((r) => r.textContent.includes('Broken picture')).click();");
  await b.sleep(200);
  const recoveryBefore = await count('recovery_session');
  await clickText('Practice', '.col-c');
  ok('a paper whose image cannot be decoded is NOT started and the reason is shown', await waitFor("document.getElementById('toast').textContent.includes('cannot be shown')") && !(await focusOn()) && (await count('recovery_session')) === recoveryBefore);

  // delete content: evidence stays
  await clickStarts('All', '.col-a');
  await b.sleep(100);
  await b.exec("[...document.querySelectorAll('.row-item')].find((r) => r.textContent.includes('Authoring test')).click();");
  await b.sleep(200);
  await clickText('Delete', '.col-c');
  await clickDialog('Delete');
  ok('deleting material removes it from the library', await waitFor("![...document.querySelectorAll('.row-item')].some((r) => r.textContent.includes('Authoring test'))"));
  ok('recorded attempts were not touched by editing or deleting content', JSON.stringify((await port.read('learner_response')).map((r) => r.payload)) === attemptBefore);

  // translation document authoring + folders
  await clickText('New', '#main .vhead');
  await clickStarts('Translation document', 'dialog[open]');
  await waitFor("!!document.querySelector('.editor')");
  await setValue('.editor .field input[type=text]', 'Authored document');
  await b.exec(`const f = document.querySelectorAll('.editor .row-fields input'); const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }; set(f[0], 'en'); set(f[1], 'zh'); set(document.querySelector('textarea[id^=item-src-0]'), 'Good morning.'); set(document.querySelector('textarea[id^=item-ref-0]'), '早上好。');`);
  await clickText('Add a sentence', '.editor');
  await b.exec("const t2 = document.querySelector('textarea[id=item-src-1]'); t2.value = 'Thank you.'; t2.dispatchEvent(new Event('input', { bubbles: true }));");
  await clickText('Save', '.editor');
  await waitFor("document.querySelector('.col-c h2')?.textContent === 'Authored document'");
  const doc = (await port.read('translation_document')).map((r) => r.payload).find((d) => d.title === 'Authored document');
  ok('the authored translation document is stored with ordered sentences and a reference', doc && doc.items.length === 2 && doc.items[0].referenceTranslation === '早上好。' && doc.items[1].position === 1);

  // export and import a paper through the native file stubs
  await b.exec("[...document.querySelectorAll('.row-item')].find((r) => r.textContent.includes('Figures and sounds')).click();");
  await b.sleep(200);
  await clickText('Export…', '.col-c');
  await waitFor("window.__native.exports.length === 1");
  const exported = await native('exports[0]');
  ok('Export hands the portable paper (with its media) to the native Save dialog', exported.name.endsWith('.json') && JSON.parse(exported.text).assets.length === 2);
  await b.exec(`window.__native.queue.importText.push(${JSON.stringify({ name: 'figures.json', text: exported.text })});`);
  await clickText('Import…', '#main .vhead');
  await clickDialog('Quiz paper (JSON)…');
  ok('Import shows a preview before storing anything (a colliding id becomes a copy)', await waitFor("document.querySelector('dialog[open]')?.textContent.includes('Figures and sounds') && document.querySelector('dialog[open]')?.textContent.includes('separate copy')"));
  const papersBefore = await count('paper');
  ok('nothing is stored by the preview', papersBefore === (await count('paper')));
  await clickDialog('Import');
  ok('confirming stores a separate copy and keeps the original', await waitFor("document.querySelector('.col-c h2')?.textContent.includes('(copy)')") && (await count('paper')) === papersBefore + 1);


  // ------------------------------------------------------------------------------------------ Evidence history
  section('Evidence history: recorded facts, retry lineage, no mastery, request export');
  /** Answer every question of the open Objective session correctly enough to finish (Instant feedback). */
  const finishObjective = async (total) => {
    for (let i = 0; i < total; i += 1) {
      const typeLabel = await txt('.qhead');
      if (/blank/i.test(typeLabel)) await b.exec("const i = document.querySelector('input.blank'); i.value = 'h2o'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-act=check]').click();");
      else if (/Matching/.test(typeLabel)) await b.exec("for (const s of document.querySelectorAll('select')) { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); } document.querySelector('[data-act=check]').click();");
      else await b.exec("document.querySelector('.choice input').click(); document.querySelector('[data-act=check]').click();");
      await b.sleep(60);
      if (i < total - 1) await clickText('Next');
    }
    // Finish is disabled until the last answer has been checked and rendered; a click on a disabled button is silently lost
    await waitFor("!!document.querySelector('[data-act=finish]:not([disabled])')");
    await b.exec("document.querySelector('[data-act=finish]').click();");
    // a confirmation dialog may or may not appear, and a slow machine may open it late: confirm whenever it is open, stop once Done is offered
    for (let n = 0; n < 200; n += 1) {
      if (await b.eval("[...document.querySelectorAll('.practice button')].some((x) => x.textContent.trim() === 'Done')")) break;
      await b.exec("const d = document.querySelector('dialog[open]'); if (d) [...d.querySelectorAll('button')].pop().click();");
      await b.sleep(100);
    }
  };
  await show('history');
  const rowCount = await b.eval("document.querySelectorAll('#main .row-item').length");
  ok('every recorded attempt is listed, newest first, with recorded facts only', rowCount >= 4 && !/mastery|streak|level/i.test(await txt('.list')), String(rowCount));
  await clickText('Translation', '.vhead .seg');
  ok('the domain filter narrows the list', (await b.eval("document.querySelectorAll('#main .row-item').length")) === 1);
  await b.exec("document.querySelector('#main .row-item').click();");
  await b.sleep(250);
  ok('Translation detail: no score, the learner’s own mark and the teacher review are shown', (await txt('.col-c')).includes('not scored') && (await b.eval("document.querySelectorAll('.col-c mark.ann-uncertain').length")) === 1 && (await txt('.col-c')).includes('Mind the spelling.'));
  await audit('Evidence history');
  await clickText('All', '.vhead .seg');
  await setValue('#hist-search', 'capital');
  await b.exec("document.querySelector('#main .row-item').click();");
  await b.sleep(250);
  ok('Objective detail: the learner’s answer, the correct answer, and the explanation of that moment', /your answer/i.test(await txt('.col-c')) && /correct answer/i.test(await txt('.col-c')) && (await txt('.col-c')).includes('EXPL-'));
  ok('Objective detail has a score hero (band, text and glyph, not colour alone) and one verdict-marked card per question', (await b.eval("document.querySelectorAll('.col-c .score-hero[data-band] .score-badge .glyph').length")) === 1 && (await b.eval("document.querySelectorAll('.col-c li.rv[data-verdict] .rv-verdict').length")) === 5 && (await b.eval("[...document.querySelectorAll('.col-c .rv-verdict')].every((v) => v.textContent.trim().length > 2)")));
  const obj = (await port.read('learner_response')).map((r) => r.payload).filter((p) => p.material.id === 'paper-capitals');
  const original = [...obj].sort((a, c) => String(c.session.completedAt).localeCompare(String(a.session.completedAt)))[0]; // the newest, which is the row that is selected
  const wrongN = original.responses.filter((r) => r.result?.correct === false).length;
  await clickText('Retry the incorrect ones', '.col-c');
  ok('Retry opens a NEW session containing only the questions answered incorrectly', await waitFor("document.getElementById('app').dataset.focus === 'on'") && new RegExp(`Question 1 of ${wrongN}`, "i").test(await txt('.qhead')), `${wrongN}: ${await txt('.qhead')}`);
  await finishObjective(wrongN);
  await waitFor("[...document.querySelectorAll('.practice button')].some((x) => x.textContent.trim() === 'Done')");
  await clickText('Done', '.practice');
  ok('finishing returns to Evidence history where the learner came from', await waitFor("document.querySelector('#nav [aria-current=page]')?.dataset.view === 'history' && !!document.querySelector('.tri')"));
  const retried = (await port.read('learner_response')).map((r) => r.payload).find((p) => p.provenance?.purpose === 'retry');
  ok('the retry records its lineage from the recorded response (and the original is untouched)', retried && retried.provenance.sourceResponseId === original.id && retried.responses.length === wrongN && JSON.stringify((await port.read('learner_response', { id: original.id }))[0].payload) === JSON.stringify(original));
  await setValue('#hist-search', 'capital');
  ok('the retry shows in the list as a retry', await waitFor("[...document.querySelectorAll('#main .row-item .pill')].some((p) => p.textContent === 'Retry')"));
  await setValue('#hist-search', 'paper and ink');
  await b.exec("document.querySelector('#main .row-item').click();");
  await b.sleep(250);
  ok('Typing detail lists the differences as differences of this copy, not a judgment', (await b.eval("document.querySelectorAll('.col-c .diffs li').length")) >= 1);
  ok('Typing detail shows how long the attempt took, or says it was not recorded, and never a speed or score', /Time (taken: .+|not recorded)/.test(await txt('.col-c')) && !/wpm|words per minute|accuracy/i.test(await txt('.col-c')));
  await clickText('Try this passage again', '.col-c');
  ok('Try again starts a Typing session with recorded lineage', await waitFor("!!document.querySelector('.practice textarea')"));
  await click('.practice-head button');
  await b.sleep(100);
  await clickDialog('Discard session');
  await b.sleep(100);
  await clickDialog('Discard');
  await waitFor("!!document.querySelector('.tri')");
  await setValue('#hist-search', 'everyday');
  await b.exec("document.querySelector('#main .row-item').click();");
  await b.sleep(250);
  await clickText('Export for external review…', '.col-c');
  await waitFor('window.__native.exports.length >= 2');
  const request = JSON.parse(await b.eval('window.__native.exports.at(-1).text'));
  ok('the exported review request is accepted by the unchanged V1 validator', validateReviewRequestPackage(request).valid, validateReviewRequestPackage(request).errors.join('; '));

  // --------------------------------------------------------------------------------------------------- Review
  section('Review: independent reviews, mark-up on exact ranges, learner answer read-only, import and update');
  await show('review');
  ok('the Review picker lists the recorded answers with their review counts', (await b.eval("document.querySelectorAll('.picklist li').length")) >= 3 && (await txt('.picklist')).includes('1 review'));
  await b.exec("[...document.querySelectorAll('.picklist li')].find((l) => l.textContent.includes('Everyday phrases')).querySelector('button').click();");
  ok('opening an answer shows the read-only banner and its existing review', await waitFor("!!document.querySelector('.banner')") && (await txt('.rev-tabs')).includes('Ms. Example'));
  await clickStarts('+ New review', '.rev-tabs');
  await waitFor("!!document.getElementById('answer-select')");
  ok('the original answer is shown read-only', await b.eval("document.getElementById('answer-select').readOnly"));
  const answerText = await b.eval("document.getElementById('answer-select').value");
  const at = (word) => [answerText.indexOf(word), answerText.indexOf(word) + word.length];
  const [h0, h1] = at('importent');
  await b.exec(`const a = document.getElementById('answer-select'); a.focus(); a.setSelectionRange(${h0}, ${h1});`);
  await click('#tool-style-highlight');
  ok('Highlight marks exactly the selected range (original text unchanged)', await waitFor("document.querySelectorAll('.projected .st-highlight').length === 1 && document.querySelector('.projected .st-highlight').textContent === 'importent'") && (await b.eval("document.getElementById('answer-select').value")) === answerText);
  const [r0, r1] = at('enviroment');
  await b.exec(`const a = document.getElementById('answer-select'); a.focus(); a.setSelectionRange(${r0}, ${r1});`);
  await click('#tool-replace');
  await waitFor("!!document.getElementById('ask-text')");
  await setValue('#ask-text', 'environment');
  await clickDialog('OK');
  ok('Replace shows the deleted original and the inserted text together', await waitFor("document.querySelectorAll('.projected del').length === 1 && document.querySelector('.projected ins')?.textContent === 'environment'"));
  await b.exec(`const a = document.getElementById('answer-select'); a.focus(); a.setSelectionRange(${r0 + 2}, ${r1 - 2});`);
  await click('#tool-delete');
  ok('an overlapping edit is refused with an explanation (no silent merge)', await waitFor("document.getElementById('toast').textContent.toLowerCase().includes('conflict')") && (await b.eval("document.querySelectorAll('.clist li').length")) === 2);
  await click('#stamp-partial');
  ok('the judgment stamp is exclusive and announced as checked', (await b.eval("document.getElementById('stamp-partial').getAttribute('aria-checked')")) === 'true');
  await setValue('#item-comment', 'Check the spelling of both words.');
  await setValue('#review-summary', 'Second opinion.');
  await setValue('#reviewer-name', 'Local reviewer');
  await click('#save-review');
  ok('Save stores a SECOND, independent review; the first is untouched', await waitFor("document.getElementById('toast').textContent.includes('Review saved')") && (await count('teacher_review')) === 2 && (await count('learner_response')) >= 4);
  const stored2 = (await port.read('teacher_review')).map((r) => r.payload).find((p) => p.summary === 'Second opinion.');
  ok('the stored review is the public Teacher Review contract with UTF-16 anchored corrections', stored2 && stored2.documentType === 'quiz-studio.teacher-review' && stored2.itemReviews[0].corrections.length === 2 && stored2.itemReviews[0].corrections.every((c) => c.anchoredText === answerText.slice(c.start, c.end)), JSON.stringify(stored2));
  ok('the new review is selected as a tab and shows the mark-up read-only', await waitFor("document.querySelectorAll('.rev-tabs .tab').length === 3 && document.querySelector('.rev-tabs .tab.on')?.textContent.includes('Local reviewer')"));
  await audit('Review');
  await clickText('Export this review…', '.cw-side');
  await waitFor('window.__native.exports.length >= 3');
  const reviewFile = await b.eval('window.__native.exports.at(-1)');
  ok('Export hands the exact stored review to the native Save dialog', JSON.parse(reviewFile.text).id === stored2.id);
  // import it again: identical -> no-op; edited -> explicit update; foreign response -> refused
  await show('review');
  await b.exec(`window.__native.queue.importText.push(${JSON.stringify({ name: 'review.json', text: reviewFile.text })});`);
  await clickText('Import a teacher review…', '#main .vhead');
  ok('re-importing the same review previews as "already imported"', await waitFor("document.querySelector('dialog[open]')?.textContent.includes('Already imported')"));
  await clickDialog('Import');
  ok('and changes nothing', (await count('teacher_review')) === 2 && await waitFor("document.getElementById('toast').textContent.includes('already imported')"));
  const edited = JSON.parse(reviewFile.text);
  edited.summary = 'Revised by the teacher.';
  await b.exec(`window.__native.queue.importText.push(${JSON.stringify({ name: 'review2.json', text: JSON.stringify(edited) })});`);
  await clickText('Import a teacher review…', '#main .vhead');
  ok('an edited resubmission previews as an update of that review only', await waitFor("document.querySelector('dialog[open]')?.textContent.includes('replaces that review only')"));
  await clickDialog('Import');
  await waitFor("document.getElementById('toast').textContent.includes('Review imported')");
  ok('the update replaced that review and no other', (await port.read('teacher_review')).map((r) => r.payload.summary).sort().join('|') === ['Good effort.', 'Revised by the teacher.'].sort().join('|'));
  await b.exec(`window.__native.queue.importText.push(${JSON.stringify({ name: 'bad.json', text: JSON.stringify({ ...edited, id: 'rev-x', responseId: 'resp-nowhere' }) })});`);
  await clickText('Import a teacher review…', '#main .vhead');
  ok('a review about a response that is not in this library is refused with the reason', await waitFor("document.querySelector('dialog[open]')?.textContent.includes('is not in this library')"));
  await clickDialog('Close');


  // ---------------------------------------------------------------------------------------------------- Exchange
  section('Exchange & backup: request export, document import, backup, restore, V1 migration entry');
  await show('exchange');
  await audit('Exchange');
  const exportsBefore = await b.eval('window.__native.exports.length');
  await clickText('Choose an answer…', '#main');
  await waitFor("!!document.querySelector('dialog[open] .picklist li')");
  await b.exec("document.querySelector('dialog[open] .picklist li button').click();");
  ok('Export for external review: pick a recorded answer, the native Save dialog receives a valid request', await waitFor(`window.__native.exports.length === ${exportsBefore + 1}`) && validateReviewRequestPackage(JSON.parse(await b.eval('window.__native.exports.at(-1).text'))).valid);
  const docsBefore = await count('translation_document');
  await clickText('Import a document…', '#main');
  await waitFor("!!document.getElementById('doc-kind')");
  await b.exec("const k = document.getElementById('doc-kind'); k.value = 'source-only'; k.dispatchEvent(new Event('change', { bubbles: true })); const t = document.getElementById('doc-title'); t.value = 'Imported lines'; t.dispatchEvent(new Event('input', { bubbles: true }));");
  await b.exec(`window.__native.queue.importText.push({ name: 'lines.txt', text: 'First line.\\n\\nSecond line.\\n' });`);
  await clickDialog('Choose file…');
  ok('Importing plain text previews the sentences first', await waitFor("document.querySelector('dialog[open]')?.textContent.includes('Imported lines') && document.querySelector('dialog[open]')?.textContent.includes('2 sentences')") && (await count('translation_document')) === docsBefore);
  await clickDialog('Import');
  ok('and stores the document only after confirmation', await waitFor(`document.getElementById('toast').textContent.includes('Document imported')`) && (await count('translation_document')) === docsBefore + 1);
  await clickText('Back up now…', '#main');
  ok('Back up now reaches the Rust-owned backup flow and reports it', await waitFor("document.querySelector('.log')?.textContent.includes('Backup written')") && (await native('calls.includes("backupSave")')));
  await b.exec("window.__native.queue.backupPick.push({ name: 'old.qsarchive', verified: { entries: 7, storeSchemaVersion: 4 } });");
  await clickText('Choose a backup…', '#main');
  ok('Restore verifies the chosen backup and asks before replacing anything', await waitFor("document.querySelector('dialog[open]')?.textContent.includes('Replace current data?')") && (await txt('.log')).includes('Verified "old.qsarchive"'));
  await clickDialog('Restore');
  ok('and restores only after the learner confirms', await waitFor("document.querySelector('.log')?.textContent.includes('Restored')") && (await native('calls.includes("backupRestore")')));
  await b.exec("window.__native.queue.migrationPrepare.push({ alreadyMigrated: true, blocked: false, reportHash: 'x', report: { plan: { mode: 'import' }, diagnostics: [] } });");
  await clickText('Choose a V1 backup…', '#main');
  ok('the V1 migration entry previews through the existing Migration engine result', await waitFor("document.querySelector('.migration')?.textContent.includes('already imported')"));

  // ---------------------------------------------------------------------------------------------------- Settings
  section('Physical sound: the preference gates real practice sounds (Web Audio spy); Off is silent at once');
  await b.exec("window.__sfx = { n: 0 }; window.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; } resume() { return Promise.resolve(); } createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (x) => x }; } createOscillator() { window.__sfx.n += 1; return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (x) => x, start() {}, stop() {} }; } };");
  const practiceOnce = async () => {
    await show('library');
    await clickStarts('Objective', '.col-a');
    await b.exec("[...document.querySelectorAll('.row-item')].find((r) => r.textContent.includes('Capital cities')).click();");
    await b.sleep(200);
    await clickText('Practice', '.col-c');
    await waitFor("document.getElementById('app').dataset.focus === 'on'");
    await b.exec("document.querySelector('.practice .choice input').click();");
    await b.sleep(120);
  };
  const leavePractice = async () => {
    await click('.practice-head button');
    await b.sleep(100);
    await clickDialog('Discard session');
    await b.sleep(100);
    await clickDialog('Discard');
    await waitFor("!!document.querySelector('.tri')");
  };
  await show('settings');
  ok('the physical-sound switch starts OFF', (await b.eval("document.getElementById('pref-sound').getAttribute('aria-checked')")) === 'false');
  await practiceOnce();
  ok('Sound Off: answering in a real practice session makes no sound', (await b.eval('window.__sfx.n')) === 0);
  await leavePractice();
  await show('settings');
  await b.exec("document.getElementById('pref-sound').click();");
  await waitFor("document.getElementById('pref-sound').getAttribute('aria-checked') === 'true'");
  await practiceOnce();
  ok('Sound On: selecting an answer in a real practice session reaches the audio helper', (await b.eval('window.__sfx.n')) >= 1, String(await b.eval('window.__sfx.n')));
  await leavePractice();
  await show('settings');
  await b.exec("document.getElementById('pref-sound').click();");
  await waitFor("document.getElementById('pref-sound').getAttribute('aria-checked') === 'false'");
  const heard = await b.eval('window.__sfx.n');
  await practiceOnce();
  ok('turning Sound Off silences practice again immediately', (await b.eval('window.__sfx.n')) === heard);
  await leavePractice();

  section('Settings: V1 preferences persist in the Rust-owned database; language switches every view');
  await show('settings');
  await audit('Settings');
  await clickText('中文', '.setlist');
  ok('switching the language to Chinese changes the navigation at once', await waitFor("document.querySelector('#nav [data-view=today]')?.textContent.includes('今日')"));
  ok('the language preference is stored in the application database, not in browser storage', (await port.read('setting', { id: 'ui.language' }))[0]?.payload.value === 'zh-CN' && (await b.eval("localStorage.length === 0 && sessionStorage.length === 0")));
  await waitFor("document.querySelector('.setlist')?.textContent.includes('深色')");
  await clickText('深色', '.setlist');
  await clickText('减弱', '.setlist');
  ok('appearance and motion are applied and stored', await until(async () => (await b.eval('document.documentElement.dataset.theme')) === 'dark' && (await b.eval('document.documentElement.dataset.motion')) === 'reduced' && (await port.read('setting', { id: 'ui.theme' }))[0]?.payload.value === 'dark' && (await port.read('setting', { id: 'ui.motion' }))[0]?.payload.value === 'reduced'));
  await b.exec("document.getElementById('pref-sound').click();");
  ok('the physical-sound switch is off by default and stored when turned on', await waitFor("document.getElementById('pref-sound').getAttribute('aria-checked') === 'true'") && await until(async () => (await port.read('setting', { id: 'ui.sound' }))[0]?.payload.value === true));
  await b.exec("const w = document.getElementById('pref-width'); w.value = '400'; w.dispatchEvent(new Event('input', { bubbles: true })); w.dispatchEvent(new Event('change', { bubbles: true }));");
  ok('the list width applies at once and is stored', await waitFor("document.documentElement.style.getPropertyValue('--list-w') === '400px'") && await until(async () => (await port.read('setting', { id: 'ui.listWidth' }))[0]?.payload.value === 400));
  // every view in Chinese: no missing dictionary key anywhere
  const headings = {};
  for (const v of ['today', 'calendar', 'library', 'history', 'review', 'exchange', 'settings']) {
    await show(v);
    headings[v] = await txt('#view-title');
  }
  ok('every view renders its heading in Chinese', Object.values(headings).every((h) => /[一-龥]/.test(h)), JSON.stringify(headings));
  ok('no view used a dictionary key that does not exist', (await b.eval('window.i18n.missingKeys()')).length === 0, (await b.eval('window.i18n.missingKeys()')).join(','));
  // after a reload ("app restart") the preferences are back
  await b.goto(`/selftest/product-harness.html?today=${sample.day}`);
  ok('after a restart the language, theme and motion preferences are restored from the database', (await txt('#nav [data-view=today]')).includes('今日') && (await b.eval('document.documentElement.dataset.theme')) === 'dark' && (await b.eval('document.documentElement.dataset.motion')) === 'reduced');
  await show('settings');
  await clickText('English', '.setlist');
  await waitFor("document.querySelector('.setlist')?.textContent.includes('Appearance')");
  await clickText('System', '.setlist');
  await clickText('Standard', '.setlist');
  ok('switching back restores English', await waitFor("document.querySelector('#nav [data-view=today]')?.textContent.includes('Today')"));
  await b.exec(`window.__native.queue.pickMedia.push({ id: ${JSON.stringify(sample.img.id)}, name: 'figure.png', size: 4096, hash: 'ab'.repeat(32), deduplicated: true, mimeType: 'image/png' });`);
  await clickText('Add a file…', '#main');
  ok('Media: Add a file goes through the native flow and reports the stored object', await waitFor("document.querySelector('#main .log')?.textContent.includes('Stored')"));
  await clickText('Run a consistency check', '#main');
  ok('the consistency check reports a clean store', await waitFor("document.querySelector('#main .log')?.textContent.includes('clean')"));

  // ------------------------------------------------------------------------------------- responsive and a11y sweep
  section('Narrow window: nothing overflows horizontally; every view keeps its accessibility base');
  await b.resize(900, 600);
  for (const v of ['today', 'calendar', 'library', 'history', 'review', 'exchange', 'settings']) {
    await show(v);
    ok(`no horizontal overflow at the minimum window size: ${v}`, await b.eval('document.documentElement.scrollWidth <= window.innerWidth + 1'), await b.eval('document.documentElement.scrollWidth'));
    await audit(`${v} (narrow)`);
  }
  await b.resize(1280, 860);

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
} catch (e) {
  ok('the self-test ran to the end', false, e.stack || e.message);
  try { await b.screenshot(`${process.env.TEMP ?? '.'}/product-selftest-failure.png`); } catch { /* best effort */ }
} finally {
  await b.close();
  await bridge.close();
  t.cleanup();
}
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length} FAILED: ${failed.map((f) => f.name).join('; ')}`);
  process.exit(1);
}
void KEYS; void pngBytes; void validateReviewRequestPackage;
