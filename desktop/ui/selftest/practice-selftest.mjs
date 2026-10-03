// Focused Practice self-test: drives the REAL surface in a real Chromium-engine browser with TRUSTED input (CDP), checking
// the contracts that unit tests cannot: DOM leakage, keyboard operation, focus, basic accessibility, long-text following,
// the committed-text path without keydown / compositionend (Input.insertText), IME composition not being scored, and
// resize. This is Chromium (the engine WebView2 embeds) - NOT the real WebView2/OS IME; those stay manual (manual-qa).
//   node desktop/ui/selftest/practice-selftest.mjs        exit code 0 = every check passed
import { KEYS, launch } from './cdp.mjs';

const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond), detail: cond ? '' : String(detail) }); if (!cond) console.error(`  FAIL ${name} ${detail}`); };
const section = (name) => console.log(`\n# ${name}`);

const b = await launch();
const key = (name) => b.key(KEYS[name].key ?? name, { code: KEYS[name].code ?? name, vk: KEYS[name].vk, text: KEYS[name].text });
const text = () => b.eval("document.getElementById('main').innerText");
const html = () => b.eval("document.getElementById('main').innerHTML");
const clickText = (label, within = "document.getElementById('main')") => b.exec(`const el = [...${within}.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)} && !x.disabled); if (!el) throw new Error(${JSON.stringify('no button ' + label)}); el.click();`);
const active = () => b.eval("(() => { const a = document.activeElement; return { tag: a.tagName, id: a.id, type: a.type || '', act: a.dataset?.act || '', text: (a.textContent || '').slice(0, 30) }; })()");
const tabUntil = async (pred, max = 20) => { for (let i = 0; i < max; i += 1) { await key('Tab'); if (pred(await active())) return true; } return false; };
const commits = () => b.eval('window.harness.state.commits.length');

try {
  // ------------------------------------------------------------------------------------------------ chrome
  section('Focused Practice removes unrelated chrome and restores it on exit');
  await b.goto('/selftest/harness.html');
  ok('the sidebar is visible before a session', (await b.eval("getComputedStyle(document.querySelector('.side')).display")) !== 'none');
  await b.eval("(window.harness.objective({ feedbackTiming: 'instant' }), 1)");
  ok('the app is marked focused', (await b.eval("document.getElementById('app').dataset.focus")) === 'on');
  ok('the sidebar / navigation is gone', (await b.eval("getComputedStyle(document.querySelector('.side')).display")) === 'none');
  ok('only the practice region is in the main area', (await b.eval("document.getElementById('main').children.length")) === 1);
  await key('Escape');
  ok('Escape opens the exit dialog', await b.eval("!!document.querySelector('dialog[open]')"));
  ok('focus moves into the dialog', await b.eval("document.activeElement.closest('dialog') !== null"));
  await clickText('Keep practicing', "document.querySelector('dialog')");
  await b.sleep(50);
  ok('Keep practicing closes the dialog and returns focus to Exit', (await b.eval("!document.querySelector('dialog[open]')")) && (await active()).text === 'Exit');
  await b.exec("document.querySelector('.practice').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }));");
  ok('Escape during an IME composition does not open the dialog', await b.eval("!document.querySelector('dialog[open]')"));
  await key('Escape');
  await clickText('Save and leave', "document.querySelector('dialog')");
  await b.sleep(100);
  ok('Save and leave saves recovery state and closes', (await b.eval('window.harness.state.closed')) === 'left' && (await b.eval('window.harness.state.saves.length')) >= 1);
  ok('chrome is restored after leaving', (await b.eval("document.getElementById('app').dataset.focus")) === undefined);
  await b.eval("(window.harness.objective({ feedbackTiming: 'instant' }), 1)");
  await key('Escape');
  await clickText('Discard session', "document.querySelector('dialog')");
  await b.sleep(50);
  await clickText('Discard', "document.querySelector('dialog')");
  await b.sleep(100);
  ok('Discard clears the recovery state and records nothing', (await b.eval('window.harness.state.closed')) === 'discarded' && (await b.eval('window.harness.state.clears.length')) >= 1 && (await commits()) === 0);

  // ------------------------------------------------------------------------------------ explicit exit durability (fault injection)
  section('Explicit exit actions are required actions: a failed save / clear never closes the surface');
  const noticeText = () => b.eval("(document.querySelector('.practice [data-kind=error]')?.textContent ?? '')");
  const closedNow = () => b.eval('window.harness.state.closed');
  await b.goto('/selftest/harness.html');
  await b.eval("(window.harness.objective({ feedbackTiming: 'instant' }), 1)");
  await b.eval("window.harness.state.fail.save = true");
  await key('Escape');
  await clickText('Save and leave', "document.querySelector('dialog')");
  await b.sleep(150);
  ok('Save and leave with a failing save keeps the surface open', (await closedNow()) === null && (await b.eval("!!document.querySelector('.practice')")) && (await b.eval("document.getElementById('app').dataset.focus")) === 'on');
  ok('a persistent error says the progress was not saved', /could not be saved/i.test(await noticeText()) && (await b.eval("document.querySelector('.practice [data-kind=error]').hidden")) === false);
  await b.sleep(4500);
  ok('the error stays until the problem is resolved (no auto-dismiss)', /could not be saved/i.test(await noticeText()) && (await b.eval("document.querySelector('.practice [data-kind=error]').hidden")) === false);
  ok('no recovery state was written by the failed save', (await b.eval('window.harness.state.row')) === null);
  await b.eval("window.harness.state.fail.save = false");
  await key('Escape');
  await clickText('Save and leave', "document.querySelector('dialog')");
  await b.sleep(150);
  ok('retrying Save and leave succeeds once the store works, and then closes', (await closedNow()) === 'left' && (await b.eval('window.harness.state.row !== null')));

  await b.goto('/selftest/harness.html');
  await b.eval("(window.harness.objective({ feedbackTiming: 'instant' }), 1)");
  await b.exec("document.querySelector('.practice').dispatchEvent(new Event('focusout', { bubbles: true }));");
  await b.eval("window.harness.services.save(window.harness.state.engine.snapshot()).then(() => 1)");
  await b.eval("window.harness.state.fail.clear = true");
  await key('Escape');
  await clickText('Discard session', "document.querySelector('dialog')");
  await b.sleep(50);
  await clickText('Discard', "document.querySelector('dialog')");
  await b.sleep(150);
  ok('Discard with a failing clear keeps the surface open and reports nothing as discarded', (await closedNow()) === null && (await b.eval("!!document.querySelector('.practice')")));
  ok('the failed discard says the session was not discarded and the recovery row is untouched', /could not be discarded/i.test(await noticeText()) && (await b.eval('window.harness.state.row !== null')));
  ok('nothing was recorded as a result', (await commits()) === 0);
  await b.eval("window.harness.state.fail.clear = false");
  await key('Escape');
  await clickText('Discard session', "document.querySelector('dialog')");
  await b.sleep(50);
  await clickText('Discard', "document.querySelector('dialog')");
  await b.sleep(150);
  ok('retrying Discard succeeds once the store works: row gone, closed as discarded', (await closedNow()) === 'discarded' && (await b.eval('window.harness.state.row')) === null);

  await b.goto('/selftest/harness.html');
  const broke = await b.eval("(() => { try { window.harness.broken(); return 'mounted'; } catch (e) { return 'threw'; } })()");
  ok('a session that cannot render fails cleanly and does not leave the app in focus mode', broke === 'threw' && (await b.eval("document.getElementById('app').dataset.focus")) === undefined);

  // ------------------------------------------------------------------------------------------------ accessibility contract
  section('Basic accessibility contract on every Objective question type');
  for (const timing of ['instant', 'submit-at-end']) {
    await b.eval(`(window.harness.objective({ feedbackTiming: ${JSON.stringify(timing)} }), 1)`);
    for (let i = 0; i < 5; i += 1) {
      await b.exec(`document.querySelectorAll('.qnav .chipbtn')[${i}].click();`);
      const audit = await b.eval(`(() => {
        const bad = [];
        const named = (el) => (el.labels && el.labels.length) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        document.querySelectorAll('#main input, #main select, #main textarea').forEach((el) => { if (!named(el)) bad.push('unnamed ' + el.tagName + ' ' + el.type); });
        document.querySelectorAll('#main fieldset').forEach((f) => { if (!f.querySelector('legend')) bad.push('fieldset without legend'); });
        document.querySelectorAll('#main button').forEach((x) => { if (!(x.textContent.trim() || x.getAttribute('aria-label'))) bad.push('unnamed button'); });
        const pb = document.querySelector('[role=progressbar]');
        if (!pb || !pb.getAttribute('aria-label') || pb.getAttribute('aria-valuenow') === null || !pb.getAttribute('aria-valuemax')) bad.push('progressbar');
        if (!document.querySelector('[aria-live=polite][role=status]')) bad.push('no live region');
        if (document.querySelectorAll('h1').length !== 1) bad.push('h1 count ' + document.querySelectorAll('h1').length);
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id); if (new Set(ids).size !== ids.length) bad.push('duplicate ids');
        const first = document.querySelector('#main button, #main input, #main select, #main textarea');
        if (!first || first.textContent.trim() !== 'Exit') bad.push('Exit is not first in tab order');
        return bad;
      })()`);
      ok(`a11y ${timing} question ${i + 1}`, audit.length === 0, JSON.stringify(audit));
    }
  }

  // ------------------------------------------------------------------------------------------------ keyboard + Instant
  section('Keyboard operation and Instant feedback (reveal only after grading)');
  await b.eval("(window.harness.objective({ feedbackTiming: 'instant' }), 1)");
  ok('no explanation text before grading', !(await text()).includes('EXPL-'));
  ok('Tab reaches the choices from Exit', await tabUntil((a) => a.type === 'radio'));
  await key('ArrowDown');
  ok('a choice can be selected from the keyboard and enables Check', await b.eval("!document.querySelector('[data-act=check]').disabled"));
  ok('Tab reaches Check', await tabUntil((a) => a.act === 'check'));
  await key('Enter');
  await b.sleep(80);
  const fbActive = await active();
  ok('Enter on Check grades the item and moves focus to the feedback', fbActive.id === 'feedback', JSON.stringify(fbActive));
  ok('the correct answer and the explanation are now shown', (await text()).includes('EXPL-single') && (await text()).includes('Correct answer'));
  ok('the graded item is locked', await b.eval("[...document.querySelectorAll('#main input')].every((i) => i.disabled)"));
  ok('feedback is announced in the live region', (await b.eval("document.querySelector('[role=status][aria-live=polite].sr-only').textContent")).includes('Correct answer'));
  ok('the other questions reveal nothing', !(await text()).includes('EXPL-multi'));
  // blank: Enter submits
  await b.exec("document.querySelectorAll('.qnav .chipbtn')[2].click();");
  await b.exec("document.querySelector('input.blank').focus();");
  await b.insertText('H2O');
  await key('Enter');
  await b.sleep(80);
  ok('Enter in the blank field grades it', (await text()).includes('EXPL-blank'));

  // ------------------------------------------------------------------------------------------------ Submit-at-End leakage
  section('Submit-at-End: nothing leaks into the DOM before submission');
  await b.eval("(window.harness.objective({ feedbackTiming: 'submit-at-end' }), 1)");
  let leaks = [];
  for (let i = 0; i < 5; i += 1) {
    await b.exec(`document.querySelectorAll('.qnav .chipbtn')[${i}].click();`);
    const q = await b.eval("document.querySelector('.choices') ? 'ok' : 'none'");
    if (q !== 'ok') leaks.push(`question ${i} not rendered`);
    // answer something
    await b.exec(`const c = document.querySelector('#main input[type=radio], #main input[type=checkbox]'); if (c) c.click(); const t = document.querySelector('input.blank'); if (t) { t.value = 'H2O'; t.dispatchEvent(new Event('input', { bubbles: true })); } const s = document.querySelectorAll('#main .pair select'); s.forEach((sel) => { sel.selectedIndex = 1; sel.dispatchEvent(new Event('change', { bubbles: true })); });`);
    const markup = await html();
    const visible = await text();
    if (visible.includes('EXPL-')) leaks.push(`explanation text on question ${i}`);
    if (/is-correct|is-wrong|class="feedback|aria-label="Question \d+, [^"]*(correct|incorrect)/.test(markup)) leaks.push(`grading markup on question ${i}`);
    if (/Correct answer|Not quite|Accepted answers|Correct pairs/.test(visible)) leaks.push(`answer-key text on question ${i}`);
    if (await b.eval("!!document.querySelector('[data-act=check]')")) leaks.push('a per-item Check exists');
  }
  ok('no explanation, verdict, correct answer or per-item check anywhere before submission', leaks.length === 0, JSON.stringify(leaks));
  ok('the navigator carries no verdict', !/chipbtn[^"]*(good|bad)/.test(await html()));
  await clickText('Submit paper');
  await b.sleep(80);
  ok('Submit asks for confirmation (a modal dialog)', await b.eval("!!document.querySelector('dialog[open]')"));
  await clickText('Submit paper', "document.querySelector('dialog')");
  await b.sleep(200);
  const after = await text();
  ok('after submission every explanation is shown', ['single', 'multi', 'blank', 'tf', 'match'].every((k) => after.includes(`EXPL-${k}`)), after.slice(0, 200));
  ok('the evidence was committed once and is adapter-valid', (await commits()) === 1 && (await b.eval('window.harness.state.invalid.length')) === 0);
  ok('the recovery state was cleared after the commit', (await b.eval('window.harness.state.clears.length')) >= 1);
  ok('the surface now offers Done', (await active()).text !== undefined && (await text()).includes('Done'));

  // ------------------------------------------------------------------------------------------------ Translation
  section('Translation: production, marks (UTF-16, grapheme-safe), reference only on request');
  await b.eval('(window.harness.translation(), 1)');
  ok('the reference is hidden until revealed', !(await text()).includes('环境很重要'));
  await b.exec("document.querySelector('textarea.answer').focus();");
  await b.insertText('环境很重要 and é ok');
  await b.exec("const t = document.querySelector('textarea.answer'); t.setSelectionRange(0, 4);");
  await b.exec("document.querySelector('textarea.answer').dispatchEvent(new Event('select', { bubbles: true }));");
  await clickText("I'm not sure");
  await b.sleep(50);
  ok('a span of the learner\'s own answer is marked', (await b.eval("document.querySelectorAll('.marks li').length")) === 1);
  ok('marking returns focus to the answer field', (await active()).tag === 'TEXTAREA');
  await clickText('Show reference translation');
  ok('the reference is shown after the learner asks', (await text()).includes('环境很重要。'));
  await clickText('Finish');
  await b.sleep(100);
  ok('finishing with an empty sentence asks first', await b.eval("!!document.querySelector('dialog[open]')"));
  await clickText('Finish', "document.querySelector('dialog')");
  await b.sleep(200);
  const trn = await b.eval('window.harness.state.commits[window.harness.state.commits.length - 1]');
  ok('a native Translation record was committed (no grading fields)', trn.material.type === 'translation-document' && !('result' in trn.responses[0]) && trn.learnerAnnotations.length === 1, JSON.stringify(trn).slice(0, 200));
  ok('offsets are declared UTF-16', trn.extensions['quiz-studio.v2.session'].offsetEncoding === 'utf16-code-unit');

  // ------------------------------------------------------------------------------------------------ Typing
  section('Typing: committed-text path without keydown/compositionend, IME composition not scored');
  await b.eval("(window.harness.typing({ text: '你好世界，欢迎', intent: 'practice' }), 1)");
  ok('the typing input has focus when the surface opens', (await active()).tag === 'TEXTAREA');
  await b.setComposition('你');
  await b.sleep(50);
  ok('an IME composition in progress is NOT committed or scored', (await b.eval('window.harness.state.engine.committedText')) === '' && (await b.eval("document.querySelectorAll('.passage .c.ok, .passage .c.err').length")) === 0);
  await b.insertText('你');
  await b.sleep(50);
  ok('the composition result is committed exactly once', (await b.eval('window.harness.state.engine.committedText')) === '你', await b.eval('window.harness.state.engine.committedText'));
  await b.insertText('好');
  await b.sleep(50);
  ok('input that arrives with no keydown and no compositionend (insertText) is committed like any other', (await b.eval('window.harness.state.engine.committedText')) === '你好');
  ok('typed cells are marked in the passage', (await b.eval("document.querySelectorAll('.passage .c.ok').length")) === 2 && (await b.eval("document.querySelectorAll('.passage .c.cur').length")) === 1);
  ok('focus stays in the input', (await active()).tag === 'TEXTAREA');

  section('Typing: long passage - wrapping, following, stable layout, no focus/caret loss');
  await b.eval("(window.harness.typing({ intent: 'practice', length: 7500 }), 1)");
  const ref = await b.eval('window.harness.state.engine.snapshot().material.text');
  const geometry = await b.eval("(() => { const p = document.querySelector('.passage'); return { scrollHeight: p.scrollHeight, clientHeight: p.clientHeight, lineHeight: parseFloat(getComputedStyle(p).lineHeight), wraps: p.scrollHeight > p.clientHeight * 5 }; })()");
  ok('a 7500-character passage wraps into a tall scroll region', geometry.wraps, JSON.stringify(geometry));
  let lastTop = 0; let monotone = true; let visibleAlways = true; let focusAlways = true; let singleCur = true; let worst = 0;
  const chars = [...ref];
  for (let i = 0; i < chars.length; i += 150) {
    const chunk = chars.slice(i, i + 150).join('');
    const t0 = Date.now();
    await b.insertText(chunk);
    await b.sleep(30);
    worst = Math.max(worst, Date.now() - t0 - 30);
    const st = await b.eval("(() => { const p = document.querySelector('.passage'); const c = p.querySelector('.c.cur'); const r = c ? c.offsetTop - p.scrollTop : null; return { top: p.scrollTop, offset: r, h: p.clientHeight, cur: p.querySelectorAll('.c.cur').length, focus: document.activeElement.tagName, sh: p.scrollHeight }; })()");
    if (st.top < lastTop) monotone = false;
    lastTop = st.top;
    if (st.cur === 1 && !(st.offset >= 0 && st.offset <= st.h)) visibleAlways = false;
    if (st.focus !== 'TEXTAREA') focusAlways = false;
    if (st.cur > 1) singleCur = false;
    if (st.sh !== geometry.scrollHeight) { geometry.scrollHeight = st.sh; }
  }
  ok('the scroll position only ever moves forward while typing forward', monotone);
  ok('the active position is always inside the visible passage', visibleAlways);
  ok('focus never leaves the typing input', focusAlways);
  ok('there is at most one current cell', singleCur);
  ok('the passage followed the learner far down the text', lastTop > geometry.clientHeight * 3, `scrollTop ${lastTop}`);
  ok('each 150-character input is processed quickly (worst round trip excess < 4 s)', worst < 4000, `${worst} ms`);
  ok('a perfect copy shows no error cells', (await b.eval("document.querySelectorAll('.passage .c.err').length")) === 0);
  ok('the engine holds the full typed text', (await b.eval('window.harness.state.engine.committedText.length')) === ref.length);
  ok('the caret is at the end of the typed text', await b.eval("(() => { const t = document.querySelector('textarea.type-input'); return t.selectionStart === t.value.length; })()"));
  await clickText('Finish');
  await b.sleep(300);
  const att = await b.eval('window.harness.state.commits[window.harness.state.commits.length - 1]');
  ok('finishing commits a valid typing attempt with no differences', att.material.type === 'typing-text' && att.errors.length === 0 && (await b.eval('window.harness.state.invalid.length')) === 0);

  section('Typing: errors are shown live in Practice; a Test shows position only');
  await b.eval("(window.harness.typing({ text: 'abcdefghij', intent: 'practice' }), 1)");
  await b.insertText('abXde');
  await b.sleep(60);
  ok('Practice marks the differing cell', (await b.eval("document.querySelectorAll('.passage .c.err').length")) === 1);
  await b.eval("(window.harness.typing({ text: 'abcdefghij', intent: 'test' }), 1)");
  await b.insertText('abXde');
  await b.sleep(60);
  ok('Test marks nothing as right or wrong', (await b.eval("document.querySelectorAll('.passage .c.err, .passage .c.ok').length")) === 0 && (await b.eval("document.querySelectorAll('.passage .c.typed').length")) === 5);
  ok('Test exposes no correctness anywhere in the DOM', !/err|ok\b/.test(await b.eval("[...document.querySelectorAll('.passage .c')].map((c) => c.className).join(' ')")));

  section('Typing: resize and resume keep the learner\'s place');
  await b.eval("(window.harness.typing({ intent: 'practice', length: 3000 }), 1)");
  const ref3 = await b.eval('window.harness.state.engine.snapshot().material.text');
  await b.insertText([...ref3].slice(0, 1200).join(''));
  await b.sleep(80);
  await b.resize(700, 500);
  await b.sleep(250);
  const rs = await b.eval("(() => { const p = document.querySelector('.passage'); const c = p.querySelector('.c.cur'); return { off: c.offsetTop - p.scrollTop, h: p.clientHeight, focus: document.activeElement.tagName, typed: window.harness.state.engine.committedText.length }; })()");
  ok('after a resize the active position is still visible', rs.off >= 0 && rs.off <= rs.h, JSON.stringify(rs));
  ok('after a resize focus and typed text are intact', rs.focus === 'TEXTAREA' && rs.typed === 1200);
  await b.resize(1100, 800);
  const snap = await b.eval('window.harness.state.saves[window.harness.state.saves.length - 1]');
  await b.eval(`(window.harness.restoreTyping(${JSON.stringify(snap)}), 1)`);
  await b.sleep(150);
  const rr = await b.eval("(() => { const t = document.querySelector('textarea.type-input'); return { len: t.value.length, caret: t.selectionStart, cur: document.querySelectorAll('.passage .c.cur').length, focus: document.activeElement.tagName }; })()");
  ok('a resumed session restores the typed text with the caret at the end and focus in the input', rr.len > 0 && rr.caret === rr.len && rr.cur === 1 && rr.focus === 'TEXTAREA', JSON.stringify(rr));

  // ------------------------------------------------------------------------------------------------- Chinese interface
  section('The same surface in Simplified Chinese: every string is translated, nothing is lost');
  await b.goto('/selftest/harness.html');
  await b.eval("(window.harness.setLocale('zh-CN'), 1)");
  await b.eval("(window.harness.objective({ feedbackTiming: 'instant' }), 1)");
  const zhObj = await text();
  ok('Objective: heading, progress and controls are in Chinese', /第 1 题/.test(zhObj) && zhObj.includes('检查答案') && zhObj.includes('退出'), zhObj.slice(0, 200));
  await b.exec("document.querySelector('.choice input').click(); document.querySelector('[data-act=check]').click();");
  await b.sleep(120);
  ok('Objective: the feedback and the explanation heading are in Chinese', /解析/.test(await text()) && /正确|不太对/.test(await text()));
  await key('Escape');
  ok('the exit dialog is in Chinese', (await b.eval("document.querySelector('dialog[open]')?.innerText ?? ''")).includes('保存并离开'));
  await clickText('继续练习', "document.querySelector('dialog')");
  await b.sleep(50);
  await b.eval("(window.harness.translation(), 1)");
  const zhTr = await text();
  ok('Translation: sentence, marks and reference controls are in Chinese', zhTr.includes('你的译文') && zhTr.includes('标记所选') && zhTr.includes('显示参考译文'), zhTr.slice(0, 200));
  await b.eval("(window.harness.typing({ length: 300 }), 1)");
  const zhTy = await text();
  ok('Typing: tag, label and counter are in Chinese', zhTy.includes('跟打') && zhTy.includes('在这里输入这段文字') && /已输入 0 \/ \d+ 个字符/.test(zhTy), zhTy.slice(0, 200));
  ok('no practice string was missing from the dictionary in either language', (await b.eval('window.harness.missingKeys()')).length === 0, (await b.eval('window.harness.missingKeys()')).join(','));
  await b.eval("(window.harness.setLocale('en'), 1)");
} finally {
  await b.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.error(failed.map((f) => `FAIL ${f.name} ${f.detail}`).join('\n')); process.exit(1); }
