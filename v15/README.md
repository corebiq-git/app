# CM | BIZODIT — Revised Auth Starter

Authentication is separate at `auth/signin.html`.

User profile:
`users/{Firebase UID}`

Expected fields:
- uid
- email
- name
- role: `admin` or `user`
- companyId
- branchId
- branchName
- status: `active` / `inactive`

Admin:
- Full access within the assigned company.

Staff/User:
- Access only to records with the same companyId and branchId.

IMPORTANT:
Firestore Security Rules are the real security boundary. Client-side checks are only for UI/routing.
Edit `js/firebase-config.js` with your Firebase Web App config.
Deploy `firestore.rules` with Firebase CLI or the Firebase console.

## Public appointment booking

`public-booking.html` is the shareable, unauthenticated booking request page. It collects a preferred branch, date/time, patient name, and 10-digit mobile number. Requests remain pending until staff review them in **Appointments → Public Booking Requests**, where the mobile is matched against patients in the selected branch and the request can be converted into an appointment.

Deploy the updated `firestore.rules` before publishing the page. Public access to the `branches` collection is used to populate the branch selector; keep branch documents limited to information intended for public visibility. Public requests can be submitted but cannot be read by unauthenticated users.
Admins can review requests for all branches. Branch users can view, convert, or decline requests only for their assigned branch; Firestore rules enforce this restriction.

Branch appointment saves check for duplicates using branch, date, time, therapist, and patient filters before checking the deterministic appointment document in a transaction. The matching composite index is listed in `firestore.indexes.json`. The rules allow a branch user to read a missing appointment document for the transaction check, while reads of existing appointments and appointment lists remain restricted to the assigned branch. Deploy the updated rules and indexes for branch users to save appointments.

The appointment page loads the patient list only when a form is opened or pending bookings need patient matching, reuses cached patient document IDs during saves, and skips writes to linked sales/receipt records when their values have not changed. If a date-query index is missing, the page reports the index error instead of retrying with a full-branch scan.

## Firestore usage dashboard

The admin-only `usage.html` page displays actual Cloud Monitoring metrics for the default Firestore database: document reads, writes, deletes, and stored bytes. Operation graphs cover the latest 14 Pacific calendar days. Metrics update about once per minute and can take up to four minutes to appear; the free-tier numbers are reference limits, not billing alerts. Outbound network transfer is not included.

The page calls the `getFirestoreUsage` callable Cloud Function; Google Cloud credentials are never placed in the browser. Deploying Cloud Functions requires the Firebase project to use the Blaze plan. Before deployment:

1. Sign in to Firebase CLI: `npx firebase-tools login`.
2. Enable the Cloud Monitoring API: `gcloud services enable monitoring.googleapis.com --project cmf001stra`.
3. Deploy the callable: `npx firebase-tools deploy --only functions:getFirestoreUsage --project cmf001stra`.
4. In Google Cloud IAM, grant the deployed function's runtime service account the **Monitoring Viewer** role (`roles/monitoring.viewer`) on project `cmf001stra`.

The function independently verifies the signed-in user's `users/{lowercase-email}` profile has `role: "admin"`. The metrics use the function's service identity and are restricted to Firestore's `(default)` database.

## Full database backup

Admins can download the full backup as one JSON file or as a ZIP containing one JSON file per exported collection plus a `manifest.json` with the generation time, selected date range, and document counts. Blank start and end dates export all available history; optional dates filter records by their date, creation date, or update date. Collection reads are paginated in batches of 500. The export includes appointments, booking requests, branches, attendance, estimates, leave requests, ledger categories, ledgers, patients, staff, tasks, therapists, transactions, users, and the company profile in settings.

Deploy `firestore.rules` after changing the backup access rules. Admins need read access to estimates, ledger data, and all tasks for a complete backup. If the export reports a permission or connection error, it does not produce a partial file.

## Attendance and appointment query indexes

Appointment and attendance lists query by branch and apply date filters in the page to avoid requiring compound branch/date indexes. Patient lookups still use branch and mobile together and may require the corresponding index in `firestore.indexes.json`.
Admins can manage attendance across branches. Branch users can view, add, edit, and delete attendance only for their assigned branch; Firestore rules enforce the branch restriction.

The root `firebase.json` maps `firestore.indexes.json` to Firebase CLI. From this directory, deploy the indexes to the app's Firebase project with:

```sh
npx firebase-tools deploy --only firestore:indexes --project cmf001stra
```

Wait until the indexes show **Enabled** in Firebase Console → Firestore Database → Indexes, then reload the app. If the attendance page still shows the old generic error after refreshing the deployed site, publish the latest `attendance.html` as well.

## Transaction module storage

The Transactions & Vouchers module continues to use Firebase and remains linked to Payments, Receipts, and Ledgers.

The **My Task** module stores personal tasks in browser localStorage under the signed-in Firebase UID. Tasks are local to that browser/device and do not sync between devices. Existing Firestore task records are not automatically copied into local storage.
