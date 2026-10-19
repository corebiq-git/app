const CACHE="bizodit-v3";
const CORE=["./","./index.html","./manifest.json","/assets/logo.png","./auth/signin.html","./css/cm.css","./css/dashboard.css","./css/forms.css","./css/responsive.css","./css/splash.css","./css/loading.css","./css/auth.css","./js/app.js","./js/auth.js","./js/permissions.js","./js/date.js","./js/navigation.js","./js/loading.js","./js/splash.js","./js/export.js","./js/utils.js","./js/firebase-config.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)))});
