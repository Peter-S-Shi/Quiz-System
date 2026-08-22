import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import dns from "node:dns/promises";
import { readFile } from "node:fs/promises";
import http from "node:http";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverScript = path.join(rootDir, "scripts", "dev-server.py");

function findPython() {
  const configured = process.env.QUIZ_STUDIO_PYTHON;
  const candidates = configured
    ? [[configured, []]]
    : process.platform === "win32"
      ? [["py", ["-3"]], ["python", []]]
      : [["python3", []], ["python", []]];

  for (const [command, prefixArgs] of candidates) {
    const probe = spawnSync(command, [...prefixArgs, "--version"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (probe.status === 0) return { command, prefixArgs };
  }
  throw new Error(
    "Python 3 is required for local-runtime integration tests. " +
      "Set QUIZ_STUDIO_PYTHON to the Python executable when it is not on PATH."
  );
}

async function startServer() {
  const python = findPython();
  const child = spawn(
    python.command,
    [...python.prefixArgs, serverScript, "--no-browser"],
    {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out:\n${output}`)), 5000);
    const poll = setInterval(() => {
      if (output.includes("Local runtime ready")) {
        clearTimeout(timeout);
        clearInterval(poll);
        resolve();
      }
    }, 25);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      clearInterval(poll);
      reject(new Error(`Server exited during startup with code ${code}:\n${output}`));
    });
  });
  return child;
}

function requestLocalhost(family, pathname = "/") {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        hostname: "localhost",
        port: 8000,
        path: pathname,
        family,
        headers: { Host: "localhost:8000" },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve({ response, body }));
      }
    );
    request.on("error", reject);
  });
}

let server;

before(async () => {
  server = await startServer();
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
});

test("canonical local runtime serves current files with no-store semantics", async () => {
  const { response, body } = await requestLocalhost(4, "/src/app.js");
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["cache-control"] ?? "", /no-store/);
  assert.match(body, /function registerServiceWorker/);
});

test("canonical localhost is reachable through every advertised loopback family", async () => {
  const addresses = await dns.lookup("localhost", { all: true });
  const families = [...new Set(addresses.map(({ family }) => family))];
  assert.ok(families.includes(4), "localhost must advertise IPv4");

  for (const family of families) {
    const { response } = await requestLocalhost(family, "/");
    assert.equal(response.statusCode, 200, `localhost IPv${family} should be ready`);
  }
});

test("local runtime serves one coherent current-working-tree ESM graph", async () => {
  const { response: indexResponse, body: indexHtml } = await requestLocalhost(4, "/");
  assert.equal(indexResponse.statusCode, 200);
  const entry = indexHtml.match(/<script\s+type="module"\s+src="([^"]+)"/)?.[1];
  assert.ok(entry, "index.html should expose the module entry point");

  const pending = [new URL(entry, "http://localhost:8000/").pathname];
  const visited = new Set();
  while (pending.length > 0) {
    const pathname = pending.pop();
    if (visited.has(pathname)) continue;
    visited.add(pathname);

    const { response, body } = await requestLocalhost(4, pathname);
    assert.equal(response.statusCode, 200, pathname);
    assert.match(response.headers["cache-control"] ?? "", /no-store/, pathname);
    const diskSource = await readFile(path.join(rootDir, pathname.replace(/^\//, "")), "utf8");
    assert.equal(body, diskSource, `${pathname} must match the current working tree`);

    const imports = body.matchAll(/import\s+[^'";]*?from\s+['"]([^'"]+)['"]/g);
    for (const [, specifier] of imports) {
      if (specifier.startsWith(".")) {
        pending.push(new URL(specifier, `http://localhost:8000${pathname}`).pathname);
      }
    }
  }
  assert.ok(visited.size > 1, "the integration check should traverse the real ESM graph");
});

test("browser-facing health endpoint proves the canonical origin is ready", async () => {
  const { response, body } = await requestLocalhost(4, "/__runtime__/health");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(body), {
    status: "ok",
    origin: "http://localhost:8000",
  });
});

test("occupied canonical port fails clearly without drifting origin", () => {
  const python = findPython();
  const collision = spawnSync(
    python.command,
    [...python.prefixArgs, serverScript, "--no-browser"],
    { cwd: rootDir, encoding: "utf8", windowsHide: true, timeout: 5000 }
  );
  const output = `${collision.stdout ?? ""}${collision.stderr ?? ""}`;
  assert.equal(collision.status, 1);
  assert.match(output, /cannot start.*http:\/\/localhost:8000/is);
  assert.match(output, /changing it would change the browser data origin/i);
  assert.doesNotMatch(output, /localhost:8001/);
  if (process.platform === "win32") {
    assert.match(output, /PID\s+\d+/i, "Windows collision diagnostics should identify the listener");
  }
  assert.match(output, /端口 8000 必须保持可用/);
});

test("runtime rejects caller-supplied port drift", () => {
  const python = findPython();
  const driftAttempt = spawnSync(
    python.command,
    [...python.prefixArgs, serverScript, "8001"],
    { cwd: rootDir, encoding: "utf8", windowsHide: true, timeout: 5000 }
  );
  const output = `${driftAttempt.stdout ?? ""}${driftAttempt.stderr ?? ""}`;
  assert.notEqual(driftAttempt.status, 0);
  assert.match(output, /unrecognized arguments: 8001/i);
});

test("recovery entry retires only Quiz Studio SW/cache state and preserves localStorage", async () => {
  const { response, body } = await requestLocalhost(4, "/__runtime__/recover");
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/html/);
  assert.match(body, /本地运行恢复/);

  const script = body.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "recovery response should contain an executable migration script");

  const unregistered = [];
  const deletedCaches = [];
  let redirectedTo = null;
  let resolveRedirect;
  const redirected = new Promise((resolve) => {
    resolveRedirect = resolve;
  });
  const registrations = [
    {
      scope: "http://localhost:8000/",
      active: { scriptURL: "http://localhost:8000/sw.js" },
      unregister: async () => unregistered.push("quiz-studio"),
    },
    {
      scope: "http://localhost:8000/other/",
      active: { scriptURL: "http://localhost:8000/other-sw.js" },
      unregister: async () => unregistered.push("other"),
    },
  ];
  const context = {
    URL,
    navigator: { serviceWorker: { getRegistrations: async () => registrations } },
    caches: {
      keys: async () => ["quiz-studio-v3", "unrelated-cache"],
      delete: async (name) => deletedCaches.push(name),
    },
    location: {
      origin: "http://localhost:8000",
      replace: (target) => {
        redirectedTo = target;
        resolveRedirect();
      },
    },
    localStorage: new Proxy({}, { get: () => assert.fail("recovery must not access localStorage") }),
    document: { getElementById: () => ({ textContent: "" }) },
    console,
  };

  vm.runInNewContext(script, context);
  let redirectTimer;
  try {
    await Promise.race([
      redirected,
      new Promise((_, reject) => {
        redirectTimer = setTimeout(() => reject(new Error("recovery did not redirect")), 1000);
      }),
    ]);
  } finally {
    clearTimeout(redirectTimer);
  }
  assert.deepEqual(unregistered, ["quiz-studio"]);
  assert.deepEqual(deletedCaches, ["quiz-studio-v3"]);
  assert.equal(redirectedTo, "/?local-runtime=recovered=1");
});

test("browser launch failure keeps the runtime diagnosable in both languages", () => {
  const python = findPython();
  const probeCode = [
    "import importlib.util, sys",
    "spec = importlib.util.spec_from_file_location('quiz_runtime', sys.argv[1])",
    "module = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "opened = module.launch_browser(lambda _url: False)",
    "raise SystemExit(1 if opened else 0)",
  ].join("; ");
  const probe = spawnSync(
    python.command,
    [...python.prefixArgs, "-c", probeCode, serverScript],
    { cwd: rootDir, encoding: "utf8", windowsHide: true, timeout: 5000 }
  );
  const output = `${probe.stdout ?? ""}${probe.stderr ?? ""}`;
  assert.equal(probe.status, 0, output);
  assert.match(output, /browser launch failed/i);
  assert.match(output, /浏览器启动失败/);
  assert.match(output, /http:\/\/localhost:8000\/__runtime__\/recover/);
});
