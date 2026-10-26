# COREBIQ Firebase Monitor

Responsive admin dashboard starter combining Cloud Monitoring metrics with daily snapshots saved in Firestore. It does not include credentials or fabricated usage/billing data.

## Features
- Google sign-in using Firebase Authentication
- Backend admin email allowlist (server-side check)
- Cloud Monitoring metrics for Firestore, Realtime Database, Cloud Functions, Cloud Storage and Hosting (metric availability varies by project/service)
- Daily snapshot callable function and scheduled daily snapshot
- 1 / 7 / 30 day dashboard range, trend chart, service coverage and history table
- Billing section explicitly reports “Not connected” until an actual billing source is configured

## Before deploying
1. Create/use a Firebase project and register a Web App. Copy its config into `public/app.js`.
2. In Firebase Authentication, enable Google sign-in.
3. Install Firebase CLI and sign in: `npm install -g firebase-tools`, `firebase login`.
4. Copy `.firebaserc.example` to `.firebaserc` and replace the project ID, or run `firebase use YOUR_PROJECT_ID`.
5. Enable Cloud Monitoring API (`monitoring.googleapis.com`) in Google Cloud for the project. Also enable Cloud Functions, Cloud Build, Artifact Registry, and Eventarc as prompted during deployment. Scheduled snapshots require Cloud Scheduler and may require the Blaze plan.
6. Configure function parameters using `firebase functions:config:set` is not used here. Set the parameters when prompted at deploy time:
   - `MONITORING_PROJECT_ID`: Google Cloud project ID (usually the Firebase project ID)
   - `COREBIQ_ADMIN_EMAILS`: comma-separated exact administrator email addresses
7. Ensure the deployed function runtime service account has the least-privilege Monitoring Viewer permission (or a custom role with `monitoring.timeSeries.list`) and Firestore access via Admin SDK.
8. Install dependencies and deploy: `cd functions && npm install && cd .. && firebase deploy`.

## Optional quota warning thresholds
Set these environment variables for the Functions runtime (or replace with Firebase function params in your deployment workflow): `WARN_FIRESTORE_READS_DAILY`, `WARN_FIRESTORE_WRITES_DAILY`, and `WARN_FUNCTION_EXECUTIONS_DAILY`. A value of `0` disables that warning. These are operator-defined warning thresholds, not automatically detected plan quotas. Configure thresholds to match your project plan and workload.

## Important security notes
- Never place a service-account key in `public/` or client-side JavaScript.
- Add the administrator email allowlist before exposing the hosted page. Authentication alone does not grant access; backend functions check the allowlist.
- App Check is not enforced in this starter. Enable and enforce it after registering the web app and testing. Consider MFA for administrator accounts.
- `firestore.rules` is intentionally deny-all. It is a starter rules file; do not replace existing production rules without merging them. The backend uses the Admin SDK and is governed by IAM plus the backend allowlist.
- Scheduled snapshots query metrics for the recent 24 hours and store them under `firebaseUsageDaily/YYYY-MM-DD`. They are daily snapshots, not a perfect reconstruction of each calendar day's usage. For rigorous daily totals, configure metric-aligned time series or export usage to BigQuery.
- Some metric names vary by product/version and some services do not emit a metric until used. Unsupported metrics are marked unavailable, not treated as zero. Validate metric types in Google Cloud Monitoring Metrics Explorer.
- `cloudfunctions.googleapis.com/function/execution_count` and Hosting/Storage metrics may differ by generation or configuration. Update the metric definitions to the metric types available in your project.
- Billing data is not wired by default. For actual costs, enable Cloud Billing export to BigQuery, then add a server-side BigQuery query with dataset/table identifiers and least-privilege access. Do not expose billing datasets or credentials in the browser. Set budget alerts separately in Google Cloud Billing.

## Useful official docs
- Firestore usage monitoring: https://firebase.google.com/docs/firestore/monitor-usage
- Realtime Database usage monitoring: https://firebase.google.com/docs/database/usage/monitor-usage
- Firebase usage and billing dashboard: https://support.google.com/firebase/answer/9628313
- Export Firebase data to Cloud Logging: https://firebase.google.com/docs/projects/cloud-logging-export
