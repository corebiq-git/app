# COREBIQ Firebase Monitor — revised build

## Changes in this revision
- Email/password sign-in.
- Dashboard remains hidden by default and is shown only after the backend `checkAdminAccess` callable confirms the signed-in email is in `COREBIQ_ADMIN_EMAILS`.
- Firestore free-tier reference cards for daily reads, writes, deletes and stored bytes.
- Daily quotas are based on available Cloud Monitoring metrics and should be treated as indicative, not an authoritative bill or guaranteed free-tier meter.

## Deploy
1. Copy your Firebase web app config into `public/app.js`.
2. In Firebase Console, enable Authentication > Email/Password and create your admin user.
3. Set the `COREBIQ_ADMIN_EMAILS` Functions parameter to comma-separated administrator email addresses.
4. Enable Cloud Monitoring API and give the Functions runtime service account appropriate Monitoring read permissions.
5. From the project root, run `firebase deploy --only hosting,functions,firestore:rules`.

## Security notes
- `checkAdminAccess`, `getDashboard`, and `captureDailySnapshot` enforce the server-side admin allowlist.
- Client-side visibility is only a UI safeguard; backend checks are the security boundary.
- Do not place service-account keys in the public folder.
- Existing Firestore rules are retained. Review them before deployment; do not loosen them to make the dashboard work.

## Firestore free-tier reference
The page displays common Spark-plan reference allowances: 50,000 document reads/day, 20,000 writes/day, 20,000 deletes/day, and 1 GiB stored data. Plan terms, regional eligibility, database-specific conditions, and current quotas can change. Confirm current allowances in Firebase Console. Cloud Monitoring data may be delayed, aggregated, or unavailable; a missing metric is shown as unavailable rather than zero.
