/**
 * Quiz Studio Preflight Bootstrap
 *
 * Runs before the main application module graph is loaded.
 * Ensures that long-lived browser profiles running on localhost
 * detach legacy Service Worker controllers and clear stale module caches
 * without risking SyntaxErrors during module import resolution.
 *
 * Scopes detachment guards to the launcher cycle nonce (?dev=<nonce>),
 * allowing each launcher cycle to self-heal while preventing reload loops.
 *
 * Preserves 100% of existing localStorage data.
 */

export function isLocalDevelopmentHost(hostname) {
  if (!hostname) return true;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  );
}

export function getDevCycleNonce(search) {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search);
    return params.get("dev") || null;
  } catch (_) {
    return null;
  }
}

export async function cleanupLocalDevelopmentServiceWorker({
  serviceWorker = typeof navigator !== "undefined" ? navigator.serviceWorker : null,
  caches = typeof window !== "undefined" ? window.caches : null,
  location = typeof window !== "undefined" ? window.location : null,
  sessionStorage = typeof window !== "undefined" ? window.sessionStorage : null,
} = {}) {
  let hadActiveController = false;

  if (serviceWorker) {
    hadActiveController = Boolean(serviceWorker.controller);

    if (typeof serviceWorker.getRegistrations === "function") {
      try {
        const registrations = await serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      } catch (err) {
        // Silently continue if unregister encounters browser restriction
      }
    }
  }

  if (caches && typeof caches.keys === "function") {
    try {
      const keys = await caches.keys();
      // Tighten cache ownership matching strictly to quiz-studio-
      const quizStudioKeys = keys.filter((key) => String(key).startsWith("quiz-studio-"));
      await Promise.all(quizStudioKeys.map((key) => caches.delete(key)));
    } catch (err) {
      // Silently continue if cache deletion fails
    }
  }

  // If a legacy Service Worker was actively controlling this document when loaded,
  // perform at most one controlled reload scoped to this launcher cycle nonce.
  if (hadActiveController) {
    const nonce = getDevCycleNonce(location?.search);
    const guardKey = nonce ? `qs_sw_detached_${nonce}` : "qs_sw_detached";
    const alreadyDetached = sessionStorage ? sessionStorage.getItem(guardKey) : null;

    if (!alreadyDetached) {
      if (sessionStorage) {
        try {
          sessionStorage.setItem(guardKey, "1");
        } catch (_) {
          // Ignore if storage restricted
        }
      }
      if (location && typeof location.reload === "function") {
        location.reload();
        return { status: "reloading" };
      }
    } else {
      // After one permitted reload for this nonce cycle, controller is STILL active.
      // Do NOT proceed into app module import under a persistent active controller.
      return {
        status: "blocked",
        reason: "Active Service Worker controller could not be detached automatically.",
      };
    }
  }

  return { status: "clean" };
}

// [DEBUG-qs-boot] ─── Diagnostic overlay ────────────────────────────────────
// Temporary instrumentation. Remove after root cause is identified.
// Renders a visible on-page report when startup fails — no DevTools needed.

async function collectDiagnosticState() {
  const sw =
    typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? navigator.serviceWorker
      : null;

  // Service Worker controller at the moment of collection
  const controller = sw ? sw.controller : null;
  const controllerInfo = controller
    ? { scriptURL: controller.scriptURL, state: controller.state }
    : null;

  // All SW registrations on this origin
  let registrations = [];
  if (sw && typeof sw.getRegistrations === "function") {
    try {
      const regs = await sw.getRegistrations();
      registrations = regs.map((r) => ({
        scope: r.scope,
        active: r.active ? `${r.active.scriptURL} [${r.active.state}]` : null,
        waiting: r.waiting ? `${r.waiting.scriptURL} [${r.waiting.state}]` : null,
        installing: r.installing
          ? `${r.installing.scriptURL} [${r.installing.state}]`
          : null,
      }));
    } catch (e) {
      registrations = [{ error: `getRegistrations() threw: ${e.message}` }];
    }
  }

  // Cache Storage — quiz-studio-* prefixed keys only
  let cacheKeys = [];
  if (typeof caches !== "undefined" && typeof caches.keys === "function") {
    try {
      const allKeys = await caches.keys();
      cacheKeys = allKeys.filter((k) => String(k).startsWith("quiz-studio-"));
    } catch (e) {
      cacheKeys = [`caches.keys() error: ${e.message}`];
    }
  }

  // sessionStorage — bootstrap guard keys only (qs_sw_*); no localStorage values read
  const guardKeys = {};
  if (typeof sessionStorage !== "undefined") {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith("qs_sw_")) {
        guardKeys[k] = sessionStorage.getItem(k);
      }
    }
  }

  // Direct fetch probe of src/app.js, bypassing any SW or browser cache
  let fetchProbe = {};
  const probeStart = performance.now();
  try {
    const resp = await fetch("./src/app.js", { cache: "no-store" });
    fetchProbe = {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      contentType: resp.headers.get("content-type"),
      cacheControl: resp.headers.get("cache-control"),
      durationMs: Math.round(performance.now() - probeStart),
    };
  } catch (e) {
    fetchProbe = {
      ok: false,
      fetchError: e.message,
      durationMs: Math.round(performance.now() - probeStart),
    };
  }

  return {
    url: typeof location !== "undefined" ? location.href : "(unknown)",
    nonce:
      typeof location !== "undefined" ? getDevCycleNonce(location.search) : null,
    timestamp: new Date().toISOString(),
    controllerInfo,
    registrations,
    cacheKeys,
    guardKeys,
    fetchProbe,
  };
}

function renderDiagnosticOverlay(diag, cleanupStatus, importError) {
  // Self-contained — inline styles only; works even if styles.css failed to load.
  if (typeof document === "undefined") return;

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function row(label, value, tone) {
    const colour =
      tone === "warn"
        ? "#b45309"
        : tone === "err"
        ? "#dc2626"
        : tone === "ok"
        ? "#15803d"
        : "#1f2937";
    return `<tr>
      <td style="padding:3px 14px 3px 0;vertical-align:top;color:#6b7280;
                 white-space:nowrap;font-weight:600;width:220px">${esc(label)}</td>
      <td style="padding:3px 0;color:${colour};word-break:break-all">${esc(value)}</td>
    </tr>`;
  }

  function heading(title) {
    return `<tr><td colspan="2" style="padding:12px 0 4px;font-weight:700;color:#111827;
            font-size:12px;letter-spacing:.05em;text-transform:uppercase;
            border-top:1px solid #e5e7eb">${esc(title)}</td></tr>`;
  }

  const { url, nonce, timestamp, controllerInfo: ctrl, registrations,
          cacheKeys, guardKeys, fetchProbe: fp } = diag;

  let t = "";

  // URL / launch
  t += heading("URL / Launch Context");
  t += row("URL", url);
  t += row(
    "?dev nonce",
    nonce ? nonce : "(absent — open via address bar, not start-local.bat)",
    nonce ? "ok" : "warn"
  );
  t += row("Captured at", timestamp);

  // SW controller
  t += heading("Service Worker Controller (at import attempt)");
  t += row(
    "controller",
    ctrl
      ? `PRESENT  ${ctrl.scriptURL}  [${ctrl.state}]`
      : "null (no active controller)",
    ctrl ? "warn" : "ok"
  );

  // SW registrations
  t += heading("SW Registrations (this origin)");
  if (registrations.length === 0) {
    t += row("registrations", "(none)", "ok");
  } else {
    registrations.forEach((r, i) => {
      if (r.error) {
        t += row(`[${i}] error`, r.error, "err");
      } else {
        t += row(`[${i}] scope`, r.scope);
        if (r.active) t += row(`[${i}] active`, r.active, "warn");
        if (r.waiting) t += row(`[${i}] waiting`, r.waiting, "warn");
        if (r.installing) t += row(`[${i}] installing`, r.installing);
      }
    });
  }

  // Cache Storage
  t += heading("Cache Storage — quiz-studio-* keys");
  if (cacheKeys.length === 0) {
    t += row("caches", "(none)", "ok");
  } else {
    cacheKeys.forEach((k, i) => t += row(`[${i}]`, k, "warn"));
  }

  // sessionStorage guard keys
  t += heading("sessionStorage Bootstrap Guard Keys");
  const guardEntries = Object.entries(guardKeys);
  if (guardEntries.length === 0) {
    t += row("qs_sw_* keys", "(none — clean)", "ok");
  } else {
    guardEntries.forEach(([k, v]) => t += row(k, String(v), "warn"));
  }

  // Cleanup result
  t += heading("Bootstrap Cleanup Result");
  t += row(
    "cleanupResult.status",
    cleanupStatus,
    cleanupStatus === "clean" ? "ok" : cleanupStatus === "reloading" ? "warn" : "err"
  );

  // Direct fetch probe
  t += heading("Direct fetch('./src/app.js') Probe — cache:no-store");
  t += row(
    "fetch ok",
    fp.ok
      ? `YES  HTTP ${fp.status} ${fp.statusText}  (${fp.durationMs} ms)`
      : `NO  (${fp.durationMs} ms)`,
    fp.ok ? "ok" : "err"
  );
  if (fp.fetchError) t += row("fetch threw", fp.fetchError, "err");
  if (fp.contentType) t += row("Content-Type", fp.contentType,
    fp.contentType.includes("javascript") ? "ok" : "err");
  if (fp.cacheControl) t += row("Cache-Control", fp.cacheControl);
  if (fp.status && !fp.ok) t += row("HTTP status", String(fp.status), "err");

  // Dynamic import error
  t += heading("Dynamic import('./app.js') Error");
  if (importError) {
    t += row("error.name", importError.name || "(none)", "err");
    t += row("error.message", importError.message || String(importError), "err");
    if (importError.stack) {
      t += row("stack (1st line)", importError.stack.split("\n")[0], "err");
    }
  } else {
    t += row("error", "(none — import succeeded)", "ok");
  }

  // Agent hypothesis
  t += heading("Agent Hypothesis");
  const h = [];
  if (!fp.ok && fp.fetchError && !ctrl) {
    h.push(
      "fetch('./src/app.js') threw a network error and there is no SW controller.",
      "Most likely cause: TIMING RACE — the dev-server had not finished binding",
      "to port 8000 when the browser opened and bootstrap fired import('./app.js').",
      "start-local.bat's server-ready check passed but the server window had not yet",
      "bound the socket, OR Chrome restored the tab before start-local.bat ran at all."
    );
  } else if (!fp.ok && fp.fetchError && ctrl) {
    h.push(
      "fetch('./src/app.js') threw a network error AND a SW controller is present.",
      "The SW intercepted the module fetch. Its fetch handler called network-first",
      "fetch(request) which also failed, then caches.match() returned nothing.",
      "Root cause candidates: SW serving stale cache; server not ready at SW fetch time."
    );
  } else if (!fp.ok && fp.status && ctrl) {
    h.push(
      `fetch('./src/app.js') returned HTTP ${fp.status} — served by the SW or server.`,
      "Check whether the SW's cache or the server returned an error status for app.js."
    );
  } else if (fp.ok && importError) {
    h.push(
      "fetch('./src/app.js') SUCCEEDS but dynamic import() still fails.",
      fp.contentType && !fp.contentType.includes("javascript")
        ? `Content-Type is "${fp.contentType}" — not a JS MIME type. ` +
          "dynamic import() requires application/javascript or text/javascript."
        : "MIME type looks OK. Possible: import specifier resolution failure, " +
          "or a transient network error between the fetch probe and the import."
    );
  }
  if (h.length === 0) {
    h.push("No clear pattern — provide this report for further analysis.");
  }
  h.forEach((line) => { t += row("→", line); });

  // Render
  const overlay = document.createElement("div");
  overlay.id = "qs-diag-overlay";
  overlay.setAttribute("role", "alert");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:999999;background:rgba(255,255,255,0.97);" +
    "overflow:auto;padding:24px 28px;" +
    "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;" +
    "font-size:12px;line-height:1.6;color:#111827";

  overlay.innerHTML =
    `<div style="max-width:860px;margin:0 auto">` +
    `<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;` +
    `padding:14px 18px;margin-bottom:20px">` +
    `<strong style="font-size:14px;color:#991b1b">` +
    `⚠ Quiz Studio failed to load — Diagnostic Report [DEBUG-qs-boot]</strong>` +
    `<p style="margin:6px 0 0;color:#374151;font-family:system-ui,sans-serif;font-size:13px">` +
    `Take a screenshot of this page (or scroll and screenshot all sections) and share it.<br>` +
    `Your quiz data is safe — this report does not read or modify localStorage.</p></div>` +
    `<table style="width:100%;border-collapse:collapse">${t}</table></div>`;

  const existing = document.getElementById("qs-diag-overlay");
  if (existing) existing.remove();
  document.body.appendChild(overlay);
}
// [DEBUG-qs-boot] ─── End diagnostic overlay ─────────────────────────────────

export async function bootstrapApplication() {
  if (typeof window === "undefined") return;

  const hostname = window.location.hostname;
  const isLocal = isLocalDevelopmentHost(hostname);

  let cleanupStatus = "skipped"; // [DEBUG-qs-boot]

  if (isLocal) {
    const cleanupResult = await cleanupLocalDevelopmentServiceWorker({
      serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : null,
      caches: "caches" in window ? window.caches : null,
      location: window.location,
      sessionStorage: window.sessionStorage,
    });

    cleanupStatus = cleanupResult.status; // [DEBUG-qs-boot]

    if (cleanupResult.status === "reloading") {
      return;
    }

    if (cleanupResult.status === "blocked") {
      const msg =
        "Bootstrap error: Active Service Worker controller could not be detached automatically on localhost. Please close this tab and reopen it via start-local.bat.";
      console.error(msg, cleanupResult.reason);
      const toast = document.getElementById("toast");
      if (toast) {
        toast.textContent = msg;
        toast.classList.add("show");
      }
      // [DEBUG-qs-boot] Show diagnostic overlay for blocked case too
      const diag = await collectDiagnosticState();
      renderDiagnosticOverlay(diag, "blocked", null);
      return;
    }
  }

  // Dynamically import the main application module once preflight is clean
  try {
    await import("./app.js");
  } catch (err) {
    console.error("Failed to load application module:", err);
    const toast = document.getElementById("toast");
    if (toast) {
      toast.textContent = "Application load error: " + (err?.message || err);
      toast.classList.add("show");
    }
    // [DEBUG-qs-boot] Collect diagnostic state and render visible overlay
    const diag = await collectDiagnosticState();
    renderDiagnosticOverlay(diag, cleanupStatus, err);
  }
}

// Auto-run when loaded directly in browser context
if (typeof window !== "undefined" && typeof document !== "undefined") {
  bootstrapApplication();
}
