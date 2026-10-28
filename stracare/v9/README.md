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
