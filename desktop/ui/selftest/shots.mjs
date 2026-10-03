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
  console.log('saved', out, sample.ids.capitals);
} finally {
  await b.close();
  await bridge.close();
  t.cleanup();
}
