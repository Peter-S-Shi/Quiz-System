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

export async function bootstrapApplication() {
  if (typeof window === "undefined") return;

  const hostname = window.location.hostname;
  const isLocal = isLocalDevelopmentHost(hostname);

  if (isLocal) {
    const cleanupResult = await cleanupLocalDevelopmentServiceWorker({
      serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : null,
      caches: "caches" in window ? window.caches : null,
      location: window.location,
      sessionStorage: window.sessionStorage,
    });

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
  }
}

// Auto-run when loaded directly in browser context
if (typeof window !== "undefined" && typeof document !== "undefined") {
  bootstrapApplication();
}
