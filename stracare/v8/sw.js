const CACHE="corebiq-v10";
const CORE=[
    "./",
    "./index.html",
    "./login.html",
    "./splash-screen.html",
    "./manifest.webmanifest",
    "./assets/favicon.png",
    "./assets/app-icon.png",
    "./assets/splash-screen.png",
    "./assets/loading.png",
    "./assets/logo-sidebar-bottom.png",
    "./assets/logo-client.png",
    "./assets/logo-client-display.png",
    "./assets/name-client-display.png",
    "./assets/logo.png",
    "./assets/name.png",
    "./css/corebiq.css",
    "./firebase-config.js",
    "./corebiq-locale.js",
    "./template-invoice.html"
];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)))});
