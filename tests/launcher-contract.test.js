import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const launcherUrl = new URL("../start-local.bat", import.meta.url);

test("Windows launcher delegates runtime ownership to the canonical Python server", async () => {
  const launcher = await readFile(launcherUrl, "utf8");
  assert.match(launcher, /scripts[\\/]dev-server\.py/i);
  assert.doesNotMatch(launcher, /http\.server/i);
  assert.doesNotMatch(launcher, /find_port|PORT_FINDER|SERVER_VERIFIER|127\.0\.0\.1/i);
  assert.doesNotMatch(launcher, /start\s+"Quiz Studio Server"/i);
  assert.match(launcher, /未找到 Python 3/);
});
