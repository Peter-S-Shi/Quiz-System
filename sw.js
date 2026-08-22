const CACHE_NAME = "quiz-studio-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./src/app.js",
  "./src/core/audio-engine.js",
  "./src/core/backup.js",
  "./src/core/corrections.js",
  "./src/core/deletion-policy.js",
  "./src/core/grading.js",
  "./src/core/interchange.js",
  "./src/core/learning-records.js",
  "./src/core/migrations.js",
  "./src/core/question-registry.js",
  "./src/core/review-records.js",
  "./src/core/review-transport.js",
  "./src/core/service-worker-policy.js",
  "./src/core/translation-annotations.js",
  "./src/core/translation-domain.js",
  "./src/core/translation-history.js",
  "./src/core/translation-import.js",
  "./src/core/translation-retry.js",
  "./src/core/translation-session.js",
  "./src/core/ui-preferences.js",
  "./src/core/utils.js",
  "./src/storage/local-storage.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const oldKeys = keys.filter((key) => key !== CACHE_NAME);
      const hadOldCache = oldKeys.length > 0;
      await Promise.all(oldKeys.map((key) => caches.delete(key)));
      await self.clients.claim();
      if (hadOldCache) {
        const allClients = await self.clients.matchAll({ type: "window" });
        for (const client of allClients) {
          if ("navigate" in client && client.url) {
            try {
              await client.navigate(client.url);
            } catch (e) {
              // Ignore if client navigation fails or is constrained by browser policy
            }
          }
        }
      }
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache with fresh network content if it is a successful local request
        if (response && response.status === 200 && response.type === "basic") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if offline or server is unreachable
        return caches.match(event.request);
      })
  );
});
