import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { startQuizStudio } from "../src/local-development-bootstrap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function parseAppShellFromSw() {
  const swContent = fs.readFileSync(path.join(rootDir, "sw.js"), "utf8");
  const match = swContent.match(/const\s+APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
  if (!match) {
    throw new Error("Could not parse APP_SHELL array from sw.js");
  }
  const arrayItems = match[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  return arrayItems;
}

function discoverEsmDependencies(entryFile) {
  const visited = new Set();
  const closure = new Set();

  function trace(file) {
    const normPath = path.normalize(file);
    if (visited.has(normPath)) return;
    visited.add(normPath);

    if (!fs.existsSync(normPath)) {
      throw new Error(`Imported ESM file does not exist on disk: ${normPath}`);
    }

    const relativePath = "./" + path.relative(rootDir, normPath).replace(/\\/g, "/");
    closure.add(relativePath);

    const content = fs.readFileSync(normPath, "utf8");
    const importRegex = /import\s+[^'"]*from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith(".")) {
        const resolved = path.resolve(path.dirname(normPath), importPath);
        trace(resolved);
      }
    }
  }

  trace(entryFile);
  return Array.from(closure).sort();
}

test("Service Worker APP_SHELL contains the complete ESM dependency closure required for offline operation", () => {
  const appShell = parseAppShellFromSw();
  const entryPoint = path.join(rootDir, "src", "app.js");
  const requiredEsmFiles = discoverEsmDependencies(entryPoint);

  for (const esmFile of requiredEsmFiles) {
    assert.ok(
      appShell.includes(esmFile),
      `Missing ESM dependency in sw.js APP_SHELL: ${esmFile}`
    );
  }
});

test("Freshly installed Service Worker APP_SHELL assets all exist on disk for full offline reload", () => {
  const appShell = parseAppShellFromSw();

  for (const assetPath of appShell) {
    if (assetPath === "./") continue;
    const diskPath = path.join(rootDir, assetPath.replace(/^\.\//, ""));
    assert.ok(
      fs.existsSync(diskPath),
      `APP_SHELL asset does not exist on disk: ${assetPath}`
    );
  }
});

test("a legacy cache-first module graph reproduces the pre-bootstrap named-export failure", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quiz-studio-legacy-module-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  fs.copyFileSync(
    path.join(rootDir, "src", "core", "correction-rendering.js"),
    path.join(tempDir, "correction-rendering.js"),
  );
  fs.writeFileSync(path.join(tempDir, "utils.js"), `
    export function makeId() { return "legacy-id"; }
    export function safeFileName(value) { return String(value || "quiz-paper"); }
  `);

  await assert.rejects(
    import(`${pathToFileURL(path.join(tempDir, "correction-rendering.js")).href}?legacy=${Date.now()}`),
    /does not provide an export named ['"]escapeHtml['"]|does not provide an export named 'escapeHtml'/,
  );
});

test("the localhost launcher bypasses legacy navigation caches", () => {
  const serverSource = fs.readFileSync(path.join(rootDir, "scripts", "local-server.mjs"), "utf8");
  assert.match(serverSource, /devBoot=/, "Launcher must open a unique localhost URL that misses legacy cache-first navigation entries.");
});

test("local boot unregisters legacy control, navigates once, then starts without touching storage", async () => {
  let unregisterCount = 0;
  let importCount = 0;
  let replacementUrl = null;
  let visibleUrl = null;
  const forbiddenStorage = new Proxy({}, {
    get() {
      throw new Error("Bootstrap must not inspect or mutate persisted application data.");
    },
  });

  const firstWindow = {
    indexedDB: forbiddenStorage,
    localStorage: forbiddenStorage,
    location: {
      hash: "",
      hostname: "localhost",
      origin: "http://localhost:8000",
      pathname: "/",
      replace(url) { replacementUrl = String(url); },
      search: "?devBoot=123",
    },
    history: { replaceState() { throw new Error("First controlled boot must navigate before changing history."); } },
  };
  const controlledNavigator = {
    serviceWorker: {
      controller: {},
      async getRegistrations() {
        return [{ async unregister() { unregisterCount += 1; return true; } }];
      },
    },
  };

  const firstResult = await startQuizStudio({
    windowObject: firstWindow,
    navigatorObject: controlledNavigator,
    importApp: async () => { importCount += 1; },
    now: () => 456,
  });

  assert.deepEqual(firstResult, { navigated: true, started: false });
  assert.equal(unregisterCount, 1);
  assert.equal(importCount, 0);
  assert.equal(replacementUrl, "http://localhost:8000/?devReady=456");

  const secondWindow = {
    indexedDB: forbiddenStorage,
    localStorage: forbiddenStorage,
    location: {
      hash: "",
      hostname: "localhost",
      origin: "http://localhost:8000",
      pathname: "/",
      search: "?devReady=456",
    },
    history: { replaceState(_state, _title, url) { visibleUrl = url; } },
  };
  const cleanNavigator = {
    serviceWorker: {
      controller: null,
      async getRegistrations() { return []; },
    },
  };

  const secondResult = await startQuizStudio({
    windowObject: secondWindow,
    navigatorObject: cleanNavigator,
    importApp: async () => { importCount += 1; },
  });

  assert.deepEqual(secondResult, { navigated: false, started: true });
  assert.equal(importCount, 1);
  assert.equal(visibleUrl, "/");
});
