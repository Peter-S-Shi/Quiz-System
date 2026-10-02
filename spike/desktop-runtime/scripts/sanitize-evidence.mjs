// Replace machine-specific values in evidence files with placeholders (run before every commit of evidence/).
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const dir = fileURLToPath(new URL("../evidence/", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url)).replace(/[\\/]+$/, "");
const spikeRoot = fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]+$/, "");
const user = os.userInfo().username;
const host = os.hostname();
const variants = (p) => [p, p.replace(/\\/g, "\\\\"), p.replace(/\\/g, "/")];
const subs = [];
for (const [p, ph] of [[spikeRoot, "<SPIKE>"], [repoRoot, "<REPO>"], [os.homedir(), "%USERPROFILE%"]]) for (const v of variants(p)) subs.push([v, ph]);
subs.push([host, "<HOST>"]);
let changed = 0;
for (const f of readdirSync(dir)) {
  const p = join(dir, f);
  if (!statSync(p).isFile()) continue;
  let t = readFileSync(p, "utf8"), o = t;
  for (const [a, b] of subs) if (a) t = t.split(a).join(b);
  // the public application identifier legitimately contains the GitHub owner handle; keep it
  if (user) t = t.replace(new RegExp(`\\b${user}\\b(?!-s-shi)`, "gi"), "<user>");
  if (t !== o) { writeFileSync(p, t); changed++; }
}
console.log(`sanitized ${changed} file(s)`);
