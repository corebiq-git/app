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
	"./js/firebase-config.js",
	"./js/firebase-service.js",
	"./modules/invoice-document.js",
	"./modules/invoice-builder-document.js",
	"./assets/logo.svg",
	"./assets/logo-app.svg",
	"./assets/logo-favicon.svg",
	"./assets/name.svg",
	"./assets/name-splash.svg",
	...[
		"accounts/ledgers/ledger",
		"accounts/vouchers/all-vouchers","accounts/vouchers/cheque-transactions/cheques",
		"accounts/vouchers/contra/contra","accounts/vouchers/estimate/estimate","accounts/vouchers/index",
		"accounts/vouchers/journals/journals","accounts/vouchers/payments/payment-voucher","accounts/vouchers/payments/payments",
		"accounts/vouchers/purchase/purchase","accounts/vouchers/purchase-return/purchase-return","accounts/vouchers/receipts/receipts",
		"accounts/vouchers/sales/sales","accounts/vouchers/sales-return/sales-return",
		"app-info/dashboard","company/company","crm/clients","data/branches","data/products","data/services",
		"employees/staff","gst/expenses","gst/invoice-templates","gst/invoices","gst/purchases","gst/sales",
		"more/qr","reports/reports","settings/settings","tools/assistant"
	].flatMap(modulePath=>[
		`./modules/${modulePath}.html`,
		`./modules/${modulePath}.js`,
		`./modules/${modulePath}.css`
	]),
	"./modules/accounts/vouchers/voucher-engine.js",
	"./modules/accounts/vouchers/voucher-shared.css"
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
