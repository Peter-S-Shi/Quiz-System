import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
