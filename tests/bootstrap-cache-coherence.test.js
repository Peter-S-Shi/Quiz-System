import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLocalDevelopmentHost,
  getDevCycleNonce,
  cleanupLocalDevelopmentServiceWorker,
} from "../src/bootstrap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("isLocalDevelopmentHost correctly distinguishes local development origins from remote hosting", () => {
  assert.equal(isLocalDevelopmentHost("localhost"), true);
  assert.equal(isLocalDevelopmentHost("127.0.0.1"), true);
  assert.equal(isLocalDevelopmentHost("[::1]"), true);
  assert.equal(isLocalDevelopmentHost("0.0.0.0"), true);
  assert.equal(isLocalDevelopmentHost(""), true);

  assert.equal(isLocalDevelopmentHost("peter-s-shi.github.io"), false);
  assert.equal(isLocalDevelopmentHost("quiz-studio.app"), false);
  assert.equal(isLocalDevelopmentHost("custom-domain.org"), false);
});

test("getDevCycleNonce extracts the nonce from query parameters correctly", () => {
  assert.equal(getDevCycleNonce("?dev=123456"), "123456");
  assert.equal(getDevCycleNonce("?other=1&dev=abc_789&foo=bar"), "abc_789");
  assert.equal(getDevCycleNonce("?other=1"), null);
  assert.equal(getDevCycleNonce(""), null);
  assert.equal(getDevCycleNonce(null), null);
});

test("cleanupLocalDevelopmentServiceWorker unregisters SWs and clears only quiz-studio- prefixed caches", async () => {
  const unregistered = [];
  const mockServiceWorker = {
    controller: null,
    getRegistrations: async () => [
      {
        scope: "http://localhost:8000/",
        unregister: async () => {
          unregistered.push("http://localhost:8000/");
          return true;
        },
      },
    ],
  };

  const deletedCaches = [];
  const mockCaches = {
    keys: async () => [
      "quiz-studio-v1",
      "quiz-studio-v4",
      "quiz-studio-precache",
      "quiz-studio_legacy", // not starting with quiz-studio-
      "unrelated-third-party-cache",
    ],
    delete: async (name) => {
      deletedCaches.push(name);
      return true;
    },
  };

  const mockSessionStorage = {
    data: new Map(),
    getItem(k) {
      return this.data.get(k) ?? null;
    },
    setItem(k, v) {
      this.data.set(k, String(v));
    },
  };

  let reloaded = false;
  const mockLocation = {
    search: "?dev=cycle_1",
    reload: () => {
      reloaded = true;
    },
  };

  const result = await cleanupLocalDevelopmentServiceWorker({
    serviceWorker: mockServiceWorker,
    caches: mockCaches,
    location: mockLocation,
    sessionStorage: mockSessionStorage,
  });

  assert.deepEqual(result, { status: "clean" });
  assert.equal(reloaded, false);
  assert.deepEqual(unregistered, ["http://localhost:8000/"]);
  assert.deepEqual(deletedCaches.sort(), [
    "quiz-studio-precache",
    "quiz-studio-v1",
    "quiz-studio-v4",
  ]);
});

test("cleanupLocalDevelopmentServiceWorker scopes reload guard to nonce, avoids loops, and blocks persistent controllers", async () => {
  const mockServiceWorker = {
    controller: { scriptURL: "http://localhost:8000/sw.js" },
    getRegistrations: async () => [],
  };
  const mockCaches = {
    keys: async () => [],
    delete: async () => true,
  };
  const mockSessionStorage = {
    data: new Map(),
    getItem(k) {
      return this.data.get(k) ?? null;
    },
    setItem(k, v) {
      this.data.set(k, String(v));
    },
  };

  let reloadCount = 0;
  const mockLocation = {
    search: "?dev=nonce_alpha",
    reload: () => {
      reloadCount++;
    },
  };

  // 1. First run on nonce_alpha: active controller present -> triggers one reload
  const firstRun = await cleanupLocalDevelopmentServiceWorker({
    serviceWorker: mockServiceWorker,
    caches: mockCaches,
    location: mockLocation,
    sessionStorage: mockSessionStorage,
  });

  assert.deepEqual(firstRun, { status: "reloading" });
  assert.equal(reloadCount, 1);
  assert.equal(mockSessionStorage.getItem("qs_sw_detached_nonce_alpha"), "1");

  // 2. Second run on same nonce_alpha with PERSISTENT controller: must NOT reload loop and must be BLOCKED
  const secondRunPersistent = await cleanupLocalDevelopmentServiceWorker({
    serviceWorker: mockServiceWorker,
    caches: mockCaches,
    location: mockLocation,
    sessionStorage: mockSessionStorage,
  });

  assert.equal(secondRunPersistent.status, "blocked");
  assert.equal(reloadCount, 1); // No second reload triggered for same nonce

  // 3. Second run on same nonce_alpha when controller is successfully detached (normal case): clean status
  const detachedServiceWorker = {
    controller: null,
    getRegistrations: async () => [],
  };
  const secondRunDetached = await cleanupLocalDevelopmentServiceWorker({
    serviceWorker: detachedServiceWorker,
    caches: mockCaches,
    location: mockLocation,
    sessionStorage: mockSessionStorage,
  });

  assert.deepEqual(secondRunDetached, { status: "clean" });
  assert.equal(reloadCount, 1);

  // 4. New launcher invocation with new nonce (nonce_beta): allowed to perform its own fresh detachment cycle
  mockLocation.search = "?dev=nonce_beta";
  const newCycleRun = await cleanupLocalDevelopmentServiceWorker({
    serviceWorker: mockServiceWorker, // active controller present again in future development cycle
    caches: mockCaches,
    location: mockLocation,
    sessionStorage: mockSessionStorage,
  });

  assert.deepEqual(newCycleRun, { status: "reloading" });
  assert.equal(reloadCount, 2); // Allowed to perform fresh detachment reload for new nonce
  assert.equal(mockSessionStorage.getItem("qs_sw_detached_nonce_beta"), "1");
});

test("Python dev-server serves static files with no-store / no-cache response headers", async () => {
  const testPort = 8991;
  const devServerScript = path.join(rootDir, "scripts", "dev-server.py");

  const pyProcess = spawn("python", ["-u", devServerScript, String(testPort)], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    // Poll for server readiness
    let resHeaders = null;
    for (let i = 0; i < 20; i++) {
      try {
        resHeaders = await new Promise((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${testPort}/index.html`, (res) => {
            resolve(res.headers);
            res.resume();
          });
          req.on("error", reject);
        });
        if (resHeaders) break;
      } catch (err) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    assert.ok(resHeaders, "Failed to connect to dev server on test port");

    assert.ok(
      resHeaders["cache-control"]?.includes("no-store"),
      `Expected Cache-Control header to contain no-store, got: ${resHeaders["cache-control"]}`
    );
    assert.ok(
      resHeaders["cache-control"]?.includes("no-cache"),
      `Expected Cache-Control header to contain no-cache, got: ${resHeaders["cache-control"]}`
    );
    assert.equal(resHeaders["pragma"], "no-cache");
    assert.equal(resHeaders["expires"], "0");
  } finally {
    pyProcess.kill();
  }
});

test("Python dev-server exits with code 1 and error message if target port is already bound", async () => {
  const occupiedPort = 8992;
  // Create a blocking dummy server
  const blocker = http.createServer((_, res) => res.end("blocked"));
  await new Promise((resolve) => blocker.listen(occupiedPort, "127.0.0.1", resolve));

  const devServerScript = path.join(rootDir, "scripts", "dev-server.py");
  let stderrData = "";

  const pyProcess = spawn("python", ["-u", devServerScript, String(occupiedPort)], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  pyProcess.stderr.on("data", (d) => {
    stderrData += d.toString();
  });

  const exitCode = await new Promise((resolve) => {
    pyProcess.on("exit", resolve);
  });

  try {
    assert.equal(exitCode, 1);
    assert.ok(
      stderrData.includes("Could not bind"),
      `Expected stderr to report bind failure, got: ${stderrData}`
    );
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});
