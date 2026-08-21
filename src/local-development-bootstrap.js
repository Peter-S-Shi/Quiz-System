export async function startQuizStudio({
  windowObject = window,
  navigatorObject = navigator,
  importApp = () => import("./app.js"),
  now = () => Date.now(),
} = {}) {
  const isLocalDevelopment = ["localhost", "127.0.0.1", "[::1]"].includes(windowObject.location.hostname);

  if (isLocalDevelopment && "serviceWorker" in navigatorObject) {
    try {
      const registrations = await navigatorObject.serviceWorker.getRegistrations();
      const hadLegacyControl = Boolean(navigatorObject.serviceWorker.controller || registrations.length);
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if (hadLegacyControl) {
        const cleanNavigation = new URL("/", windowObject.location.origin);
        cleanNavigation.searchParams.set("devReady", now().toString());
        windowObject.location.replace(cleanNavigation);
        return { navigated: true, started: false };
      }
    } catch {
      // app.js retains a second localhost unregistration safeguard for constrained browsers.
    }
  }

  if (isLocalDevelopment && windowObject.location.search) {
    windowObject.history.replaceState(null, "", `${windowObject.location.pathname}${windowObject.location.hash}`);
  }

  await importApp();
  return { navigated: false, started: true };
}
