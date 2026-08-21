import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { get, createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = Number.parseInt(process.argv[2] || "8000", 10);
const shouldOpenBrowser = process.argv.includes("--open");
const verifyAndExit = process.argv.includes("--verify-and-exit");
const parentPidFlag = process.argv.indexOf("--parent-pid");
const parentPid = parentPidFlag >= 0 ? Number.parseInt(process.argv[parentPidFlag + 1], 10) : null;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);
  const rootPrefix = `${root}${path.sep}`.toLowerCase();
  if (filePath !== root && !filePath.toLowerCase().startsWith(rootPrefix)) return null;
  return filePath;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  try {
    const filePath = resolveRequestPath(request.url || "/");
    const fileStat = filePath ? await stat(filePath) : null;
    if (!fileStat?.isFile()) throw new Error("Not found");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Connection": "close",
      "Content-Length": fileStat.size,
      "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fetchCanonicalIndex(url) {
  return new Promise((resolve, reject) => {
    const request = get(url, { timeout: 3000 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        body: Buffer.concat(chunks),
        cacheControl: response.headers["cache-control"],
        statusCode: response.statusCode,
      }));
    });
    request.on("timeout", () => request.destroy(new Error("Verification timed out")));
    request.on("error", reject);
  });
}

server.listen(port, host, async () => {
  const url = `http://localhost:${port}`;
  try {
    const expected = await readFile(path.join(root, "index.html"));
    const served = await fetchCanonicalIndex(`${url}/index.html`);
    const hasTitle = served.body.toString("utf8").includes("<title>Quiz Studio</title>");
    if (served.statusCode !== 200 || served.cacheControl !== "no-store" || sha256(served.body) !== sha256(expected) || !hasTitle) {
      throw new Error("Canonical origin did not return this worktree's exact index");
    }

    console.log(`${verifyAndExit ? "Verified Quiz Studio at / 已验证 Quiz Studio" : "Quiz Studio is running at / Quiz Studio 正在运行"} ${url}`);
    console.log(`Verified repository directory / 已验证仓库目录: ${root}`);
    console.log("Local development mode: Service Worker and HTTP caching are disabled on localhost. / 本地开发模式已在 localhost 禁用 Service Worker 与 HTTP 缓存。");
    if (!verifyAndExit) console.log("Press Ctrl+C or close this window to stop the server. / 按 Ctrl+C 或关闭窗口即可停止服务器。");

    if (verifyAndExit) {
      server.close();
      return;
    }

    if (shouldOpenBrowser) {
      // A unique navigation URL bypasses cache-first Service Workers left by early M6 builds.
      // index.html removes their registration before importing the current module graph, then
      // returns the visible address to the canonical localhost origin without touching storage.
      const browserUrl = `${url}/?devBoot=${Date.now()}`;
      spawn("explorer.exe", [browserUrl], { detached: true, stdio: "ignore" }).unref();
    }
  } catch (error) {
    console.error(`Server verification failed / 服务器验证失败: ${error.message}`);
    server.close(() => { process.exitCode = 1; });
  }
});

if (!verifyAndExit && Number.isInteger(parentPid) && parentPid > 0) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      server.close(() => process.exit(0));
    }
  }, 500);
}
