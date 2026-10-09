const CACHE="corebiq-shell-v43";
const CORE=[
	"./",
	"./index.html",
	"./login.html",
	"./license.html",
	"./manifest.json",
	"./css/corebiq.css",
	"./css/pwa.css",
	"./css/login.css",
	"./css/license.css",
	"./js/app.js",
	"./js/login.js",
	"./js/license.js",
	"./js/crud-module.js",
	"./js/currency.js",
	"./js/firebase-config.js",
	"./js/firebase-service.js",
	"./modules/invoice-document.js",
	"./modules/invoice-builder-document.js",
	"./modules/transaction-receipt.js",
	"./assets/logo.svg",
	"./assets/logo-app.svg",
	"./assets/logo-favicon.svg",
	"./assets/name.svg",
	"./assets/name-splash.svg",
	...[
		"assistant","branches","cheques","clients","company","dashboard","expenses","invoice-templates","invoices",
		"payments","products","purchases","qr","reports","sales","services",
		"settings","staff","transactions","ledger"
	].flatMap(moduleName=>[
		`./modules/${moduleName}.html`,
		`./modules/${moduleName}.js`,
		`./modules/${moduleName}.css`
	])
];

self.addEventListener("install",event=>{
	event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
	self.skipWaiting();
});

self.addEventListener("activate",event=>{
	event.waitUntil(caches.keys().then(keys=>Promise.all(
		keys.filter(key=>key.startsWith("corebiq-") && key!==CACHE).map(key=>caches.delete(key))
	)));
	self.clients.claim();
});

self.addEventListener("fetch",event=>{
	if(event.request.method!=="GET") return;
	event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(response=>response||fetch(event.request)));
});
