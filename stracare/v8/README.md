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

## Attendance and appointment query indexes

Attendance and appointment pages query by branch and date range. Appointment duplicate checks also query branch, date, time, therapist, and patient mobile together. Create the composite indexes in `firestore.indexes.json` before using these pages. Patient lookups use branch and mobile together to avoid matching a record from a different branch.
