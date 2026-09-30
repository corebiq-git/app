# COREBIQ CRM + ERP — Fresh Module Architecture Sample

A clean, mobile-first COREBIQ CRM/ERP starter built around a single dashboard shell.

## Architecture

- `login.html` — Firebase Authentication sign-in and account creation
- `index.html` — authenticated application shell
- `css/corebiq.css` — shared design system (kept unchanged)
- `js/app.js` — module router/loader
- `js/firebase-config.js` — Firebase placeholder
- `js/firebase-service.js` — Authentication and Firestore service helpers
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
Purchases, Invoices, Invoice Template, Expenses, Transactions, Cheque Register, Ledger, Payments, QR, Reports,
Settings, COREBIQ AI Assistant.

## Firebase / Firestore

The app uses the project configuration in `js/firebase-config.js`. Record
modules read and write the matching Firestore collections: `branches`,
`clients`, `staff`, `products`, `services`, `sales`, `purchases`, `invoices`,
`expenses`, `transactions`, `ledger`, `checkbooks`, `cheques`, `payments`, `qr`, `reports`, and `settings`. The
company profile is stored in `company_settings/master`.

Invoice Template settings are saved on the company profile and use Company
Profile details plus Ledger bank accounts. Sales email and WhatsApp actions open
prefilled message drafts for review and sending in the chosen app.

Invoice Template also creates Professional/Service and Inventory-wise invoices
from saved Client, Service, Product, Expense-ledger, and QR records. It stores
GST, advance, balance, and amount-in-words details in the `invoices` collection.

The Ledger module creates protected Cash and Bank accounts under Assets. Their
names and categories are fixed; Cash allows opening-balance edits, while Bank
also allows bank account details. These preset accounts cannot be deleted.

Company logos are stored in Firebase Storage at `company-logos/{uid}/...`; add
authenticated Storage rules for that path so signed-in users can upload and
preview their company's logo.

Enable Email/Password in Firebase Authentication and create an account through
`login.html`; registration saves the entered name to the Auth profile. The
header profile shows Auth name/email and the `role`, `userRole`, `user_role`,
or `admin` custom claim (falling back to `User`). Deploy Firestore rules that
authorize only authenticated users and scope records to the intended
organization. This repository does not deploy project rules; permission
errors are shown rather than replaced with sample data. Do not make these
collections publicly writable.

The notification bell opens `license.html`, which reads
`app_licenses/{uid}`. Supported fields are `licenseInfo`, `validTill`,
`planName` (`Demo`, `Base`, `Enterprise`, or `Pro`), and `appVersion`. Accounts
without a license record display the Demo defaults.

Record modules provide text search, value filters, sorting, CSV record import,
Record modules provide text search, value filters, date-range filtering, and
sorting. CSV export downloads the filtered records; PDF export uses the browser
print dialog. Each record displays a stable module-prefixed document number,
such as `SAL-00001`, generated independently of its Firebase document ID.

The AI Assistant directs plan-upgrade inquiries through icon-only WhatsApp,
telephone, and email actions. WhatsApp and email use a generic prefilled plan
inquiry; the user's prompt is not forwarded.
