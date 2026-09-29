const CACHE="corebiq-shell-v1";
const CORE=["./","./index.html","./css/corebiq.css","./js/app.js"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE))));
self.addEventListener("fetch",e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
