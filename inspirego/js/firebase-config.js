import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDShAm9FNnIj7sodlfzQFZ727pc9WhU-fc",
  authDomain: "corebic--inspirego.firebaseapp.com",
  projectId: "corebic--inspirego",
  storageBucket: "corebic--inspirego.firebasestorage.app",
  messagingSenderId: "1091888608027",
  appId: "1:1091888608027:web:6d4b56472871e3c48299be"
};

export const app =
  !getApps().length
    ? initializeApp(firebaseConfig)
    : getApp();

export const db = getFirestore(app);
export const auth = getAuth(app);