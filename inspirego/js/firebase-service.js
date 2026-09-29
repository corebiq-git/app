import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { deleteObject, getBlob, getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js?v=6";

let db;
let auth;
let app;

function getFirebaseApp(){
  if(!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

function getAuthClient(){
  if(!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export function observeAuth(callback, onError){
  return onAuthStateChanged(getAuthClient(),callback,onError);
}

export async function signIn(email,password,remember=true){
  const authClient = getAuthClient();
  await setPersistence(authClient,remember ? browserLocalPersistence : browserSessionPersistence);
  return signInWithEmailAndPassword(authClient,email,password);
}

export async function createAccount(email,password,name,remember=true){
  const authClient = getAuthClient();
  await setPersistence(authClient,remember ? browserLocalPersistence : browserSessionPersistence);
  const credential = await createUserWithEmailAndPassword(authClient,email,password);
  if(name?.trim()) await updateProfile(credential.user,{displayName:name.trim()});
  return credential;
}

export async function getAuthProfile(user=getAuthClient().currentUser){
  if(!user) return null;
  const token = await user.getIdTokenResult();
  const claims = token.claims || {};
  return {
    name:user.displayName || user.email?.split("@")[0] || "COREBIQ User",
    email:user.email || "",
    role:claims.role || claims.userRole || claims.user_role || (claims.admin ? "Admin" : "User")
  };
}

export async function getAppLicense(user=getAuthClient().currentUser){
  if(!user) return null;
  const snapshot = await getDoc(doc(initFirebase(),"app_licenses",user.uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function resetPassword(email){
  return sendPasswordResetEmail(getAuthClient(),email);
}

export async function signOutUser(){
  return signOut(getAuthClient());
}

export function initFirebase(){
  if(!db) db = getFirestore(getFirebaseApp());
  return db;
}

export async function listRecords(collectionName){
  const snapshot = await getDocs(collection(initFirebase(), collectionName));
  return snapshot.docs.map(record=>({id:record.id,...record.data()}));
}

export async function createRecord(collectionName, data){
  const now = serverTimestamp();
  const reference = await addDoc(collection(initFirebase(), collectionName), {
    ...data,
    createdAt:now,
    updatedAt:now
  });
  return reference.id;
}

export async function importRecords(collectionName, records){
  const firestore = initFirebase();
  for(let offset=0;offset<records.length;offset+=450){
    const batch = writeBatch(firestore);
    records.slice(offset,offset+450).forEach(record=>{
      const reference = doc(collection(firestore,collectionName));
      batch.set(reference,{...record,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    });
    await batch.commit();
  }
}

export async function listModulePdfs(moduleName){
  const snapshot = await getDocs(collection(initFirebase(),`${moduleName}_pdfs`));
  return snapshot.docs.map(record=>({id:record.id,...record.data()}));
}

export async function uploadModulePdf(moduleName,file){
  const user = getAuthClient().currentUser;
  if(!user) throw new Error("Sign in before importing a PDF.");
  if(file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a PDF file.");

  const safeName = file.name.replace(/[^a-z0-9._-]/gi,"_").slice(0,120) || "document.pdf";
  const storagePath = `module-pdfs/${user.uid}/${moduleName}/${Date.now()}-${safeName}`;
  const storage = getStorage(getFirebaseApp());
  const fileReference = ref(storage,storagePath);
  const uploaded = await uploadBytes(fileReference,file,{contentType:"application/pdf"});
  try{
    const documentRecord = {
      fileName:file.name,
      storagePath,
      size:file.size,
      contentType:"application/pdf",
      importedBy:user.uid,
      createdAt:serverTimestamp()
    };
    const reference = await addDoc(collection(initFirebase(),`${moduleName}_pdfs`),documentRecord);
    return {id:reference.id,...documentRecord};
  }catch(error){
    await deleteObject(uploaded.ref).catch(()=>{});
    throw error;
  }
}

export async function getModulePdfBlob(documentRecord){
  if(!getAuthClient().currentUser) throw new Error("Sign in before opening this PDF.");
  return getBlob(ref(getStorage(getFirebaseApp()),documentRecord.storagePath));
}

export async function deleteModulePdf(moduleName,documentRecord){
  await deleteObject(ref(getStorage(getFirebaseApp()),documentRecord.storagePath));
  await deleteDoc(doc(initFirebase(),`${moduleName}_pdfs`,documentRecord.id));
}

export async function updateRecord(collectionName, recordId, data){
  await updateDoc(doc(initFirebase(), collectionName, recordId), {
    ...data,
    updatedAt:serverTimestamp()
  });
}

export async function deleteRecord(collectionName, recordId){
  await deleteDoc(doc(initFirebase(), collectionName, recordId));
}

export async function getCompany(){
  const firestore = initFirebase();
  const snap = await getDoc(doc(firestore, "company_settings", "master"));
  return snap.exists() ? snap.data() : null;
}

export async function saveCompany(data){
  const firestore = initFirebase();
  const reference = doc(firestore, "company_settings", "master");
  const existing = await getDoc(reference);
  await setDoc(reference, {
    ...data,
    ...(!existing.exists() ? {createdAt:serverTimestamp()} : {}),
    updatedAt:serverTimestamp()
  }, {merge:true});
}
