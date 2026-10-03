// Developer aid: render every product view of the real product over a seeded real store and save PNGs.
// Usage: node ui/selftest/shots.mjs <outDir> [lang] [theme]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './cdp.mjs';
import { openBridge, tempRoot } from '../tests/integration/bridge.mjs';
import { seedSample } from './sample-data.mjs';

const out = path.resolve(process.argv[2] ?? 'shots');
const lang = process.argv[3] ?? 'en';
const theme = process.argv[4] ?? 'light';
fs.mkdirSync(out, { recursive: true });
const t = tempRoot();
const bridge = openBridge(t.root);
const sample = await seedSample(bridge.port);
const b = await launch({ width: 1280, height: 860, store: { port: bridge.port } });
try {
  await b.goto(`/selftest/product-harness.html?lang=${lang}`);
  if (theme === 'dark') await b.eval("(document.documentElement.dataset.theme = 'dark', 1)");
  for (const view of ['today', 'calendar', 'library', 'history', 'review', 'exchange', 'settings']) {
    await b.eval(`window.product.show('${view}')`);
    await b.sleep(400);
    await b.screenshot(path.join(out, `${view}-${lang}-${theme}.png`));
  }
  const click = (expr) => b.exec(expr);
  const snap = async (name) => { await b.sleep(450); await b.screenshot(path.join(out, `${name}-${lang}-${theme}.png`)); };
  // states: library detail, paper editor, history detail, review workspace, calendar entry, practice with media
  await b.eval("window.product.show('library')"); await b.sleep(200);
  await click("[...document.querySelectorAll('.row-item')].find((r) => r.textContent.includes('Capital')).click();"); await snap('library-detail');
  await click("[...document.querySelectorAll('.col-c button')].find((x) => x.textContent === 'Edit' || x.textContent === '编辑').click();"); await snap('library-editor');
  await b.eval("window.product.show('history')"); await b.sleep(200);
  await click("[...document.querySelectorAll('.row-item')].find((r) => r.textContent.includes('Everyday') || r.textContent.includes('phrases')).click();"); await snap('history-detail');
  await b.eval("window.product.show('review', { responseId: " + JSON.stringify(sample.translation.id) + " })"); await b.sleep(300); await snap('review-workspace');
  await b.eval("window.product.show('calendar')"); await b.sleep(200);
  await click("[...document.querySelectorAll('.chip-entry')].find((c) => c.textContent.includes('Capital')).click();"); await snap('calendar-entry');
  await b.eval("window.product.show('library')"); await b.sleep(200);
  await click("[...document.querySelectorAll('.row-item')].find((r) => r.textContent.includes('Figures')).click();"); await b.sleep(200);
  await click("[...document.querySelectorAll('.col-c button')].find((x) => x.textContent === 'Practice' || x.textContent === '练习').click();"); await snap('practice-media');
  console.log('saved', out, sample.ids.capitals);
} finally {
  await b.close();
  await bridge.close();
  t.cleanup();
}
