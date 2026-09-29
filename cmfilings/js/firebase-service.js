// Optional Firebase service layer.
// This file is intentionally not imported by default so the sample works offline.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

let app;
let db;

export function initFirebase(){
  if(!app){
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
  return db;
}

export async function getCompany(){
  const firestore = initFirebase();
  const snap = await getDoc(doc(firestore, "company_settings", "master"));
  return snap.exists() ? snap.data() : null;
}

export async function saveCompany(data){
  const firestore = initFirebase();
  await setDoc(doc(firestore, "company_settings", "master"), data, {merge:true});
}
