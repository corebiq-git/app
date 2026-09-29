# COREBIQ CRM + ERP — Fresh Module Architecture Sample

A clean, mobile-first COREBIQ CRM/ERP starter built around a single dashboard shell.

## Architecture

- `index.html` — authenticated-style application shell
- `css/corebiq.css` — Gemini / Material 3 inspired design system
- `js/app.js` — module router/loader
- `js/firebase-config.js` — Firebase placeholder
- `js/firebase-service.js` — optional Firestore service helpers
- `modules/*.html` — module UI only
- `modules/*.js` — module logic
- `modules/*.css` — module-specific styling

## Important module-loading approach

The shell fetches a module HTML file and inserts it into `#moduleContainer`.
It then dynamically imports the matching module JS file.

This avoids the common problem where `<script>` tags inside HTML injected with
`innerHTML` do not execute.

Example:

    app.loadModule("company");

Module registry is in `js/app.js`.

## Included sample modules

Dashboard, Company, Branches, Clients, Staff, Products, Services, Sales,
Purchases, Invoices, Expenses, Transactions, Payments, QR, Reports, Settings.

## Firebase

The UI runs without Firebase. To connect Firestore, replace the placeholder
configuration in `js/firebase-config.js` and enable the Firestore service
functions in the module JS files.

This is intentionally a clean implementation scaffold; it does not contain
real credentials.
