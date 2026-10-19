# COREBIQ ERP Dashboard — Starter ZIP

## Included modules
- `index.html` — workspace landing page
- `dashboard.html` — KPI overview and quick actions
- `clients.html` — CRM/client master
- `sales.html` — sales invoice register
- `purchases.html` — purchase bills
- `inventory.html` — product/stock register
- `finance.html` — accounting voucher register
- `compliance.html` — statutory work tracker
- `employees.html` — employee master
- `documents.html` — document register
- `reports.html` — report register
- `users.html` — administration/user register
- `manifest.json`, `sw.js` — basic PWA shell
- `404.html` — fallback page

## Run
Extract the ZIP and open `index.html`, or deploy the folder to a static host such as GitHub Pages. Each module is a standalone HTML page with inline CSS/JS and can be opened directly.

## CRUD features
Create, edit, delete, search and CSV export in every register module.

## Important backend limitation
This is a front-end prototype. Demo records are stored in browser localStorage and are not shared across devices. Firebase Authentication, Firestore sync and Google Sheets sync are not enabled. Do not store confidential client, tax or credential data until backend access control, validation and audit logging are implemented.
