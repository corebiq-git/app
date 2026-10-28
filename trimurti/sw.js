
const CACHE_NAME = "trimurti-pwa-v1";
const APP_SHELL = [
    "./",
    "./index.html",
    "./manifest.json",
    "./assets/logo.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll(APP_SHELL)
        ).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key.startsWith("trimurti-pwa-") &&
                                   key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== "GET" || url.origin !== self.location.origin) {
        return;
    }

    // Network-first for page navigation; cached page if offline.
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache =>
                        cache.put("./index.html", copy)
                    );
                }
                return response;
            }).catch(async () =>
                (await caches.match("./index.html")) ||
                (await caches.match("./"))
            )
        );
        return;
    }

    // Cache-first for same-origin static shell files.
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;

            return fetch(request).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache =>
                        cache.put(request, copy)
                    );
                }
                return response;
            });
        })
    );
});
