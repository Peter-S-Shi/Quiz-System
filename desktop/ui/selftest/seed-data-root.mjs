// Manual-QA aid: create a THROWAWAY application data root with synthetic sample content (papers incl. one with an image and
// a sound, a translation document, typing texts, a few recorded attempts, a review and a schedule), so the real packaged
// app can be looked at without touching real data.
//   node desktop/ui/selftest/seed-data-root.mjs <empty-folder>
// then:  $env:LOCALAPPDATA = "<empty-folder>"; & "<path to>\quiz-studio.exe"
import fs from 'node:fs';
import path from 'node:path';
import { openBridge } from '../tests/integration/bridge.mjs';
import { seedSample } from './sample-data.mjs';

const IDENTIFIER = 'io.github.peter-s-shi.quiz-studio';
const dir = process.argv[2];
if (!dir) { console.error('usage: node seed-data-root.mjs <empty-folder>'); process.exit(2); }
fs.mkdirSync(dir, { recursive: true });
if (fs.readdirSync(dir).length) { console.error('refusing to seed a folder that is not empty'); process.exit(2); }
const bridge = openBridge(path.join(dir, IDENTIFIER));
try {
  const s = await seedSample(bridge.port);
  console.log(`seeded ${path.join(dir, IDENTIFIER)} (today = ${s.day})`);
} finally {
  await bridge.close();
}
