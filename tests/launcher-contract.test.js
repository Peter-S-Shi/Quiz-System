import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const launcherUrl = new URL("../start-local.bat", import.meta.url);

test("Windows launcher delegates runtime ownership to the canonical Python server", async () => {
  const launcher = await readFile(launcherUrl, "utf8");
  assert.match(launcher, /scripts[\\/]dev-server\.py/i);
  assert.doesNotMatch(launcher, /http\.server/i);
  assert.doesNotMatch(launcher, /find_port|PORT_FINDER|SERVER_VERIFIER|127\.0\.0\.1/i);
  assert.doesNotMatch(launcher, /start\s+"Quiz Studio Server"/i);
  assert.match(launcher, /未找到 Python 3/);
});

test("Windows launcher uses CRLF line endings required by cmd.exe", async () => {
  const launcher = await readFile(launcherUrl);
  const withoutCrLf = launcher.toString("binary").replaceAll("\r\n", "");
  assert.doesNotMatch(withoutCrLf, /\n/);
});

test(
  "Windows launcher reports a bilingual error when Python is unavailable",
  { skip: process.platform !== "win32" },
  () => {
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    const environmentWithoutPath = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"),
    );
    const result = spawnSync(process.env.ComSpec ?? `${systemRoot}\\System32\\cmd.exe`, [
      "/d",
      "/c",
      fileURLToPath(launcherUrl),
    ], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: { ...environmentWithoutPath, Path: `${systemRoot}\\System32` },
      encoding: "utf8",
      input: "\n",
      timeout: 5_000,
    });

    const output = `${result.stdout}${result.stderr}`;
    assert.equal(result.status, 1, output);
    assert.match(output, /Python 3 was not found/);
    assert.match(output, /未找到 Python 3/);
    assert.doesNotMatch(output, /not recognized|can't open file|syntax of the command is incorrect/i);
  },
);
