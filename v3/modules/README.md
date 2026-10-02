Each module has three files grouped by category:

- `<category>/<module>.html` — markup
- `<category>/<module>.js` — exported `init()` function
- `<category>/<module>.css` — optional module-specific CSS

The category folder is one of `company`, `crm`, `employees`, `inventory`, `reports`,
`gst`, `app-info`, `templates`, `settings`, `tools`, or `more`. Accounts use
nested module folders under `accounts/ledgers` and
`accounts/vouchers/<voucher-type>`; voucher pages use the shared
`accounts/vouchers/voucher-engine.js` implementation. Invoice settings are in
`templates/invoice-template`; cheque, payment, receipt, estimate, and payroll
document previews are in `templates/voucher-templates` and query their source
module records plus Company settings.

Do not put `<script>` tags in dynamically injected module HTML.
Use `export async function init(){...}` in the module JS instead. Register
logical module names and their category paths in `js/app.js`.
