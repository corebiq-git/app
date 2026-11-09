// firebase-config.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCVg-iDZZVmnV0eN_H44QcuJgoqdjeXhjo",
  authDomain: "corebiq-stracare.firebaseapp.com",
  projectId: "corebiq-stracare",
  storageBucket: "corebiq-stracare.firebasestorage.app",
  messagingSenderId: "978459924995",
  appId: "1:978459924995:web:ee36c35d478c06c11a8c36",
  measurementId: "G-WJN0QJC3R2"
};

// Initialize Firebase only if it hasn't been initialized yet
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
