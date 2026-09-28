const CACHE_NAME = "corebiq-v4";

// Only caching files that actually exist in your directory.
// We include your updated specific logo asset paths here.
const APP_SHELL = [
  "./",
  "./index.html",
  "./login.html",
  "./manifest.json",
  "./assets/name.png",
  "./assets/logo-app.png",
  "./assets/logo-favicon.png",
  "./assets/name-splash.png",
  "./assets/logo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.error("SW Install Error: ", err))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first strategy: Tries to fetch from the network to get the latest data.
// If the network fails (offline), it falls back to the cached version.
self.addEventListener("fetch", event => {
  // We only want to cache GET requests (ignore POST/PUT for database writes)
  if (event.request.method !== "GET") return;
  
  // Skip cross-origin requests (like Firebase API calls) to prevent caching errors
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Only cache valid, successful responses
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        // Network failed, look in the cache
        return caches.match(event.request);
      })
  );
});