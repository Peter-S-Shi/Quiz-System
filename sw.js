const CACHE_NAME = "quiz-studio-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./src/app.js",
  "./src/core/backup.js",
  "./src/core/grading.js",
  "./src/core/interchange.js",
  "./src/core/learning-records.js",
  "./src/core/migrations.js",
  "./src/core/question-registry.js",
  "./src/core/translation-domain.js",
  "./src/core/utils.js",
  "./src/storage/local-storage.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
