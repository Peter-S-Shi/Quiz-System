// The real practice stack in a real Chromium-engine browser over the REAL Rust store: launcher -> runtime -> surface ->
// SessionFinalizer -> SQLite (through `qs-scenario port-serve`). Only the Tauri IPC is replaced by a POST. Checks that a
// learner can start each domain from materials in the store, that results land in the store exactly as the contracts
// say (the explanation inside the stored snapshot, no recovery rows left behind), that an interrupted session is
// resumable after a page reload (an "app restart"), and that retry lineage is recorded.
//   node desktop/ui/selftest/app-selftest.mjs      (needs the qs-scenario binary: cargo build -p qs-scenarios --bin qs-scenario)
import { KEYS, launch } from './cdp.mjs';
import { openBridge, tempRoot } from '../tests/integration/bridge.mjs';
import { putOp } from '../web/src/projection.js';
import { paperWithExplanations } from '../tests/objective-fixtures.mjs';

const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond), detail: cond ? '' : String(detail) }); if (!cond) console.error(`  FAIL ${name} ${detail}`); };
const section = (name) => console.log(`\n# ${name}`);

const t = tempRoot();
const bridge = openBridge(t.root);
const { port } = bridge;
const info = await port.schemaInfo();
const spec = (n) => info.collections.find((c) => c.name === n);
const paper = paperWithExplanations({ id: 'paper-exp' });
const mediaPaper = { ...paperWithExplanations({ id: 'paper-media' }), title: 'Figure paper' };
mediaPaper.questions[0].image = { name: 'figure.png', alt: 'synthetic figure', mediaId: 'media-1' };
const at = '2026-09-01T00:00:00.000Z';
const typingText = 'The environment matters. 学习是一种习惯。 Careful copying builds attention.';
await port.commit({ ops: [
  putOp(spec('paper'), paper.id, paper),
  putOp(spec('paper'), mediaPaper.id, mediaPaper),
  putOp(spec('translation_folder'), 'f-1', { schemaVersion: 1, id: 'f-1', name: 'Folder', createdAt: at, updatedAt: at }),
  putOp(spec('translation_document'), 'doc-1', { schemaVersion: 1, id: 'doc-1', title: 'Synthetic document', folderId: 'f-1', sourceLanguage: 'en', targetLanguage: 'zh', createdAt: at, updatedAt: at,
    items: [{ id: 'it-1', position: 0, sourceText: 'The environment matters.', referenceTranslation: '环境很重要。' }, { id: 'it-2', position: 1, sourceText: 'Learning is a habit.' }] }),
  putOp(spec('typing_text'), 'tt-1', { schemaVersion: 1, id: 'tt-1', title: 'Copy text', text: typingText, createdAt: at, updatedAt: at }),
] });

const b = await launch({ store: { port } });
const key = (name) => b.key(KEYS[name].key ?? name, { code: KEYS[name].code ?? name, vk: KEYS[name].vk, text: KEYS[name].text });
const text = () => b.eval("document.getElementById('main').innerText");
const clickText = (label, within = "document.getElementById('main')") => b.exec(`const el = [...${within}.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)} && !x.disabled); if (!el) throw new Error(${JSON.stringify('no button ' + label)}); el.click();`);
const clickInRow = (rowText, label) => b.exec(`const li = [...document.querySelectorAll('#main li')].find((x) => x.textContent.includes(${JSON.stringify(rowText)})); if (!li) throw new Error('no row'); const el = [...li.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!el) throw new Error('no button'); el.click();`);
const rows = (c) => port.read(c);

try {
  section('Launcher lists the store\'s materials');
  await b.goto('/selftest/app-harness.html');
  await b.sleep(200);
  const home = await text();
  ok('papers, documents and typing texts are listed', home.includes('Synthetic paper') && home.includes('Synthetic document') && home.includes('Copy text'), home.slice(0, 300));
  ok('a media-bearing paper is listed with a clear reason and its Start is disabled', home.includes('Figure paper') && /image or audio/i.test(home) && (await b.eval("(() => { const li = [...document.querySelectorAll('#main li')].find((x) => x.textContent.includes('Figure paper')); return li.querySelector('button').disabled; })()")) === true);
  ok('no session was started or saved for it', (await rows('learner_response')).length === 0);
  ok('nothing is listed as unfinished', !home.toLowerCase().includes('unfinished'));

  section('Objective (Submit-at-End) from the launcher to the store');
  await b.exec("const sel = [...document.querySelectorAll('.launcher select')].find((x) => [...x.options].some((o) => o.value === 'submit-at-end')); sel.value = 'submit-at-end'; sel.dispatchEvent(new Event('change'));");
  await clickInRow('Synthetic paper', 'Start');
  await b.sleep(250);
  ok('the surface opens and the launcher chrome is gone', (await b.eval("document.getElementById('app').dataset.focus")) === 'on' && (await text()).includes('QUESTION 1 OF 5'));
  ok('a session is resumable the moment it starts (recovery row exists)', (await rows('recovery_session')).length === 1);
  ok('Submit-at-End shows no explanation before submission', !(await text()).includes('EXPL-'));
  for (let i = 0; i < 5; i += 1) {
    await b.exec(`document.querySelectorAll('.qnav .chipbtn')[${i}].click();`);
    await b.exec(`const c = document.querySelector('#main input[type=radio], #main input[type=checkbox]'); if (c) c.click(); const t = document.querySelector('input.blank'); if (t) { t.value = 'H2O'; t.dispatchEvent(new Event('input', { bubbles: true })); } document.querySelectorAll('#main .pair select').forEach((sel) => { sel.selectedIndex = 1; sel.dispatchEvent(new Event('change', { bubbles: true })); });`);
  }
  await clickText('Submit paper');
  await b.sleep(80);
  await clickText('Submit paper', "document.querySelector('dialog')");
  await b.sleep(400);
  ok('the result is stored once', (await rows('learner_response')).length === 1);
  const stored = (await rows('learner_response'))[0]?.payload;
  ok('the stored snapshot keeps every explanation', stored && stored.material.snapshot.items.map((i) => i.explanation).join('|') === paper.questions.map((q) => q.explanation).join('|'));
  for (let i = 0; i < 40 && (await rows('recovery_session')).length > 0; i += 1) await b.sleep(100); // the cleanup follows the commit
  ok('the stored record carries the V2 session facts and no recovery row is left', stored?.extensions?.['quiz-studio.v2.session']?.feedbackTiming === 'submit-at-end' && (await rows('recovery_session')).length === 0);
  const resultText = await text();
  ok('the review lists every explanation after submission', ['single', 'multi', 'blank', 'tf', 'match'].every((k) => resultText.includes(`EXPL-${k}`)));
  const wrongCount = stored.responses.filter((r) => !r.result.correct).length;
  if (wrongCount) {
    await clickText(`Retry the ${wrongCount} incorrect question(s)`);
    await b.sleep(300);
    ok('Retry opens a new session over only the incorrect questions', (await text()).includes(`OF ${wrongCount}`) || (await text()).toLowerCase().includes(`question 1 of ${wrongCount}`));
    await key('Escape');
    await clickText('Discard session', "document.querySelector('dialog')");
    await b.sleep(50);
    await clickText('Discard', "document.querySelector('dialog')");
    await b.sleep(300);
  } else {
    await clickText('Done');
    await b.sleep(300);
  }
  ok('leaving returns to the launcher with the sidebar back', (await b.eval("document.getElementById('app').dataset.focus")) === undefined && (await text()).includes('Start a practice'));

  section('Typing: interrupt (page reload = app restart), resume, finish');
  await clickInRow('Copy text', 'Practice');
  await b.sleep(250);
  await b.exec("document.querySelector('textarea.type-input').focus();");
  await b.insertText('The environ');
  await b.sleep(900); // the debounced autosave
  await b.goto('/selftest/app-harness.html'); // "restart"
  await b.sleep(250);
  const afterRestart = await text();
  ok('the launcher offers the unfinished session', afterRestart.toLowerCase().includes('unfinished') && afterRestart.includes('Resume'), afterRestart.slice(0, 200));
  await clickText('Resume');
  await b.sleep(250);
  ok('resuming restores the typed text, the caret and the focus', (await b.eval("(() => { const t = document.querySelector('textarea.type-input'); return t.value === 'The environ' && t.selectionStart === t.value.length && document.activeElement === t; })()")));
  await b.insertText(typingText.slice('The environ'.length));
  await b.sleep(150);
  await clickText('Finish');
  await b.sleep(400);
  const attempts = await rows('typing_attempt');
  ok('one valid typing attempt with no differences is stored, and the session left no recovery row', attempts.length === 1 && attempts[0].payload.errors.length === 0 && (await rows('recovery_session')).length === 0, JSON.stringify(attempts.map((a) => a.payload.errors)));
  ok('the attempt keeps the committed text verbatim', attempts[0]?.payload.committed.text === typingText);
  await clickText('Try this passage again');
  await b.sleep(300);
  ok('Try again starts a new typing session', (await b.eval("!!document.querySelector('textarea.type-input')")));
  await b.insertText('The environment matters.');
  await clickText('Finish');
  await b.sleep(80);
  await clickText('Finish', "document.querySelector('dialog')");
  await b.sleep(400);
  const attempts2 = await rows('typing_attempt');
  const retry = attempts2.find((a) => a.payload.provenance.purpose === 'retry');
  ok('the retry attempt records its lineage and counts the untyped rest as missed', attempts2.length === 2 && retry && retry.payload.provenance.sourceAttemptId === attempts[0].id && retry.payload.errors.some((e) => e.kind === 'omission'), JSON.stringify(retry?.payload.provenance));
  await clickText('Done');
  await b.sleep(300);

  section('Translation: marks, finish with an empty sentence, retry the marked sentences');
  await clickInRow('Synthetic document', 'Start');
  await b.sleep(250);
  await b.exec("document.querySelector('textarea.answer').focus();");
  await b.insertText('环境很重要。');
  await b.exec("const t = document.querySelector('textarea.answer'); t.setSelectionRange(0, 2); t.dispatchEvent(new Event('select', { bubbles: true }));");
  await clickText("I'm not sure");
  await b.sleep(80);
  await clickText('Finish');
  await b.sleep(80);
  await clickText('Finish', "document.querySelector('dialog')");
  await b.sleep(400);
  const trn = (await rows('learner_response')).map((r) => r.payload).find((p) => p.material.type === 'translation-document');
  ok('the Translation record is stored natively (no grading fields, marks recorded)', trn && !('result' in trn.responses[0]) && trn.learnerAnnotations?.length === 1 && trn.responses[1].answer === '');
  await clickText('Retry the 1 marked sentence(s)');
  await b.sleep(300);
  ok('Retry opens an ephemeral material with the marked sentence only', (await text()).includes('SENTENCE 1 OF 1') || (await text()).toLowerCase().includes('sentence 1 of 1'));
  await b.exec("document.querySelector('textarea.answer').focus();");
  await b.insertText('再试一次');
  await clickText('Finish');
  await b.sleep(400);
  const trn2 = (await rows('learner_response')).map((r) => r.payload).filter((p) => p.material.type === 'translation-document');
  const rr = trn2.find((p) => p.provenance.purpose === 'retry');
  ok('the retry is stored with by-value lineage to the source document', trn2.length === 2 && rr && rr.provenance.sourceMaterialId === 'doc-1' && rr.provenance.sourceResponseId === trn.id, JSON.stringify(rr?.provenance));
  ok('no recovery rows remain at the end', (await rows('recovery_session')).length === 0);
} finally {
  await b.close();
  await bridge.close();
  t.cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.error(failed.map((f) => `FAIL ${f.name} ${f.detail}`).join('\n')); process.exit(1); }
