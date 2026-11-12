// firebase-config.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAcO1L2Za7dzILxylmMkRTSx0FBVu_EEoM",
    authDomain: "cmf001stra.firebaseapp.com",
    projectId: "cmf001stra",
    storageBucket: "cmf001stra.firebasestorage.app",
    messagingSenderId: "763958641347",
    appId: "1:763958641347:web:316876bc2340b26bd21876",
    measurementId: "G-770FBR88LJ"
};

// Initialize Firebase only if it hasn't been initialized yet
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
