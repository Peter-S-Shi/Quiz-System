/**
 * Quiz Studio Preflight Bootstrap
 *
 * Runs before the main application module graph is loaded.
 * Ensures that long-lived browser profiles running on localhost
 * detach legacy Service Worker controllers and clear stale module caches
 * without risking SyntaxErrors during module import resolution.
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
      const quizStudioKeys = keys.filter((key) => String(key).startsWith("quiz-studio"));
      await Promise.all(quizStudioKeys.map((key) => caches.delete(key)));
    } catch (err) {
      // Silently continue if cache deletion fails
    }
  }

  // If a legacy Service Worker was actively controlling this document when loaded,
  // perform at most one controlled reload to detach the controller cleanly.
  if (hadActiveController && location && sessionStorage) {
    const alreadyDetached = sessionStorage.getItem("qs_sw_detached");
    if (!alreadyDetached) {
      try {
        sessionStorage.setItem("qs_sw_detached", "1");
      } catch (e) {
        // Ignore if storage restricted
      }
      location.reload();
      return true; // Indicates reload initiated
    }
  }

  return false;
}

export async function bootstrapApplication() {
  if (typeof window === "undefined") return;

  const hostname = window.location.hostname;
  const isLocal = isLocalDevelopmentHost(hostname);

  if (isLocal) {
    const reloaded = await cleanupLocalDevelopmentServiceWorker({
      serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : null,
      caches: "caches" in window ? window.caches : null,
      location: window.location,
      sessionStorage: window.sessionStorage,
    });
    if (reloaded) {
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
