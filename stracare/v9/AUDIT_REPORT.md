# COREBIQ v7 ZIP audit report

## Changes made
- Reordered the dashboard so the welcome hero is followed by the existing current-week calendar.
- Placed **Today's Attendance Overview** and **Appointments Overview** side by side on desktop/tablet, with a single-column stack on small phones.
- Kept the existing dashboard IDs, event handlers, chart canvas IDs, and Firestore/data-loading scripts unchanged.
- Updated the appointment card title from “Schedule Breakdown” to “Appointments Overview”.
- Bumped the service-worker cache name from `corebiq-v6` to `corebiq-v7` so deployed browsers can refresh the revised dashboard rather than retaining the previous cached index.

## Static checks performed
- Checked 36 inline JavaScript blocks with Node.js syntax checking: **0 syntax errors**.
- Scanned HTML files for duplicate element IDs: **none found**.
- Scanned local `src`/`href` references. Two template-string values were reported (`${data.mapLink}` in `branches.html`, `${src}` in `qr.html`); these are dynamically generated values, not literal missing files.

## Items to review before production
- Static checks do not replace testing against your actual Firebase project, Firestore rules, user roles, and mobile devices.
- Several icon/logo PNGs are byte-identical (`app-icon.png`, `favicon.png`, `logo-splash.png`, `logo.png`). This may be intentional branding reuse; they were retained because the pages may reference each filename separately.
- The Firebase web configuration is client-side by design. Keep database access controlled by deployed Firestore Security Rules and test admin/staff access separately.
