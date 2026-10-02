import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, runTransaction, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getBlob, getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js?v=6";

let db;
let auth;
let app;
const DOCUMENT_PREFIXES = {
  branches:"BRN",clients:"CLI",staff:"STF",products:"PRD",services:"SRV",
  sales:"SAL",purchases:"PUR",invoices:"INV",expenses:"EXP",transactions:"TRN",
  payments:"PAY",qr:"QRC",reports:"RPT",settings:"SET",ledger:"LED",
  checkbooks:"CBK",cheques:"CHQ"
};
const COUNTER_DOCUMENT_ID = "_document_counter";
const DEFAULT_LEDGER_GROUPS = [
  {category:"Assets",groups:[
    {name:"Current Assets",accounts:["Cash & Cash Equivalents","Bank Accounts","Petty Cash","Accounts Receivable","Sundry Debtors","Supplier Advances","Employee Advances","Prepaid Expenses","Accrued Income","Security Deposits","Other Current Assets"]},
    {name:"Fixed Assets",accounts:["Land","Buildings","Plant & Machinery","Furniture & Fixtures","Computers & IT Equipment","Office Equipment","Vehicles","Other Fixed Assets"]},
    {name:"Intangible Assets",accounts:["Software","Goodwill","Patents","Trademarks","Other Intangible Assets"]},
    {name:"Investments",accounts:["Fixed Deposits","Short Term Investments","Long Term Investments","Other Investments"]},
    {name:"Accumulated Depreciation",balanceType:"Credit",accounts:["Accumulated Depreciation - Building","Accumulated Depreciation - Plant","Accumulated Depreciation - Furniture","Accumulated Depreciation - Computer","Accumulated Depreciation - Vehicle"]}
  ]},
  {category:"Liabilities",groups:[
    {name:"Current Liabilities",balanceType:"Credit",accounts:["Accounts Payable","Customer Advances","Outstanding Expenses","Salary Payable","Rent Payable","Other Payables","Other Current Liabilities"]},
    {name:"Statutory Liabilities",balanceType:"Credit",accounts:["GST Payable","Output CGST","Output SGST","Output IGST","TDS Payable","TCS Payable","PF Payable","ESI Payable","Professional Tax Payable","Other Statutory Payables"]},
    {name:"Loans & Borrowings",balanceType:"Credit",accounts:["Bank Loan","Term Loan","Working Capital Loan","Vehicle Loan","Personal / Director Loan","Bank Overdraft"]},
    {name:"Other Liabilities",balanceType:"Credit",accounts:["Provision for Expenses","Provision for Tax","Other Liabilities"]}
  ]},
  {category:"Equity / Capital",groups:[
    {name:"Capital",balanceType:"Credit",accounts:["Owner's Capital","Partner's Capital","Share Capital","Additional Capital","Retained Earnings","Reserves & Surplus","Current Year Profit"]},
    {name:"Capital Adjustments",accounts:[["Current Year Loss","Debit"],["Drawings","Debit"]]}
  ]},
  {category:"Income / Revenue",groups:[
    {name:"Operating Revenue",balanceType:"Credit",accounts:["Sales - Goods","Sales - Services","Domestic Sales","Export Sales","Service Income","Other Operating Income"]},
    {name:"Other Income",balanceType:"Credit",accounts:["Interest Income","Commission Received","Discount Received","Rental Income","Profit on Sale of Asset","Other Income"]}
  ]},
  {category:"Direct Expenses / Cost of Sales",groups:[
    {name:"Purchases",accounts:["Purchase - Goods","Purchase - Services","Local Purchases","Import Purchases"]},
    {name:"Direct Costs",accounts:["Direct Labour","Job Work Charges","Freight Inward","Loading & Unloading","Manufacturing Expenses","Production Expenses","Other Direct Expenses"]},
    {name:"Purchase Adjustments",accounts:[["Purchase Return","Credit"],["Purchase Discount","Credit"]]}
  ]},
  {category:"Indirect Expenses",groups:[
    {name:"Employee Expenses",accounts:["Salary & Wages","Bonus","Staff Welfare","Employee Benefits","Recruitment Expenses"]},
    {name:"Administrative Expenses",accounts:["Office Rent","Electricity","Water Charges","Telephone","Internet","Printing & Stationery","Postage & Courier","Office Expenses","General Administrative Expenses"]},
    {name:"Selling & Marketing Expenses",accounts:["Advertising","Marketing Expenses","Sales Commission","Business Promotion","Exhibition & Events"]},
    {name:"Travel & Conveyance",accounts:["Travelling Expenses","Conveyance","Local Travel","Accommodation"]},
    {name:"Vehicle Expenses",accounts:["Fuel","Vehicle Maintenance","Vehicle Insurance","Vehicle Tax & Permit"]},
    {name:"Professional & Compliance",accounts:["Professional Fees","Legal Fees","Consultancy Fees","Audit Fees","Accounting Fees","Compliance Fees"]},
    {name:"Technology Expenses",accounts:["Software Subscription","Cloud Services","Domain & Hosting","IT Support","Technology Expenses"]},
    {name:"Repairs & Maintenance",accounts:["Building Repairs","Equipment Repairs","Computer Repairs","General Repairs"]},
    {name:"Financial Expenses",accounts:["Bank Charges","Payment Gateway Charges","Loan Interest","Credit Card Charges","Finance Charges"]},
    {name:"Insurance",accounts:["General Insurance","Vehicle Insurance","Employee Insurance","Other Insurance"]},
    {name:"Other Expenses",accounts:["Depreciation","Bad Debts","Discount Allowed","Loss on Sale of Asset","Other Expenses"]}
  ]},
  {category:"Sales Adjustments",groups:[
    {name:"Sales Adjustments",accounts:["Sales Return","Sales Discount","Sales Allowance"]}
  ]},
  {category:"Tax / GST",groups:[
    {name:"GST Receivable",accounts:["Input CGST","Input SGST","Input IGST","Input Cess"]},
    {name:"GST Payable",balanceType:"Credit",accounts:["Output CGST","Output SGST","Output IGST","Output Cess"]},
    {name:"Direct Tax",accounts:["Advance Tax","TDS Receivable","TCS Receivable",["Income Tax Payable","Credit"],"Income Tax Expense"]},
    {name:"Tax Adjustments",balanceType:"Debit / Credit",accounts:["GST Rounding Off","Tax Adjustment","Other Tax Adjustment"]}
  ]},
  {category:"Other / Adjustment",groups:[
    {name:"Other Adjustments",accounts:[["Round Off Gain","Credit"],["Round Off Loss","Debit"],["Suspense Account","Debit / Credit"],["Opening Balance Adjustment","Debit / Credit"],["Prior Period Adjustment","Debit / Credit"],["Miscellaneous Adjustment","Debit / Credit"]]}
  ]}
];
const DEFAULT_LEDGER_ACCOUNTS = DEFAULT_LEDGER_GROUPS.flatMap(({category,groups})=>groups.flatMap(({name:group,balanceType="Debit",accounts})=>accounts.map(item=>{
  const [name,accountBalanceType] = Array.isArray(item) ? item : [item,balanceType];
  const key = `${category}_${group}_${name}`.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
  const isCash = name === "Cash & Cash Equivalents";
  const isBank = name === "Bank Accounts";
  return {
    key,
    id:isCash ? "system_cash" : isBank ? "system_bank" : `system_${key}`,
    legacyNames:isCash ? ["cash"] : isBank ? ["bank"] : [],
    name,
    category,
    group,
    balanceType:accountBalanceType,
    accountType:isCash ? "Cash" : isBank ? "Bank" : "Other"
  };
})));

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

async function ensureDefaultLedgers(firestore,existingDocuments){
  const matchingDocuments = DEFAULT_LEDGER_ACCOUNTS.map(account=>existingDocuments.find(record=>
    record.id === account.id || record.data().systemDefaultKey === account.key || account.legacyNames.includes(String(record.data().name || "").trim().toLowerCase())
  ));
  const references = DEFAULT_LEDGER_ACCOUNTS.map((account,index)=>doc(firestore,"ledger",matchingDocuments[index]?.id || account.id));
  const counterReference = doc(firestore,"ledger",COUNTER_DOCUMENT_ID);
  const minimumNext = existingDocuments.reduce((next,record)=>{
    const match = String(record.data().documentNo || "").match(/^LED-(\d+)$/);
    return match ? Math.max(next,Number(match[1])+1) : next;
  },1);

  await runTransaction(firestore,async transaction=>{
    const [counterSnapshot,...accountSnapshots] = await Promise.all([
      transaction.get(counterReference),...references.map(reference=>transaction.get(reference))
    ]);
    let nextNumber = Math.max(Number(counterSnapshot.data()?.nextNumber) || 1,minimumNext);
    for(let index=0;index<DEFAULT_LEDGER_ACCOUNTS.length;index++){
      const account = DEFAULT_LEDGER_ACCOUNTS[index];
      const reference = references[index];
      const snapshot = accountSnapshots[index];
      if(snapshot.exists()){
        const current = snapshot.data();
          const protectedFields = {
          name:account.name,
          category:account.category,
          accountGroup:account.group,
          accountType:account.accountType,
          openingBalance:current.openingBalance ?? 0,
          balanceType:account.balanceType,
          systemDefault:true,
          systemDefaultKey:account.key
          };
          if(account.accountType === "Bank") Object.assign(protectedFields,{bankName:current.bankName || "",accountHolderName:current.accountHolderName || "",accountNumber:current.accountNumber || "",ifsc:current.ifsc || "",bankBranch:current.bankBranch || ""});
          if(Object.entries(protectedFields).some(([key,value])=>current[key] !== value)) transaction.update(reference,protectedFields);
        continue;
      }
      const now = serverTimestamp();
      transaction.set(reference,{
        name:account.name,
        category:account.category,
        accountGroup:account.group,
        accountType:account.accountType,
        openingBalance:0,
        balanceType:account.balanceType,
        ...(account.accountType === "Bank" ? {bankName:"",accountHolderName:"",accountNumber:"",ifsc:"",bankBranch:""} : {}),
        systemDefault:true,
        systemDefaultKey:account.key,
        documentNo:`LED-${String(nextNumber).padStart(5,"0")}`,
        createdAt:now,
        updatedAt:now
      });
      nextNumber++;
    }
    const currentNext = Number(counterSnapshot.data()?.nextNumber) || 1;
    if(!counterSnapshot.exists() || currentNext < nextNumber){
      transaction.set(counterReference,{nextNumber});
    }
  });
}

async function ensureDocumentCounterFloor(collectionName, minimumNext){
  const firestore = initFirebase();
  const counterReference = doc(firestore,collectionName,COUNTER_DOCUMENT_ID);
  await runTransaction(firestore,async transaction=>{
    const snapshot = await transaction.get(counterReference);
    const currentNext = Number(snapshot.data()?.nextNumber) || 1;
    if(currentNext < minimumNext) transaction.set(counterReference,{nextNumber:minimumNext});
  });
}

async function ensureRecordDocumentNumber(collectionName, recordId){
  const prefix = DOCUMENT_PREFIXES[collectionName];
  if(!prefix) return null;
  const firestore = initFirebase();
  const recordReference = doc(firestore,collectionName,recordId);
  const counterReference = doc(firestore,collectionName,COUNTER_DOCUMENT_ID);
  return runTransaction(firestore,async transaction=>{
    const [recordSnapshot,counterSnapshot] = await Promise.all([
      transaction.get(recordReference),transaction.get(counterReference)
    ]);
    if(!recordSnapshot.exists()) return null;
    const existingNumber = recordSnapshot.data().documentNo;
    if(existingNumber) return existingNumber;
    const nextNumber = Number(counterSnapshot.data()?.nextNumber) || 1;
    const documentNo = `${prefix}-${String(nextNumber).padStart(5,"0")}`;
    transaction.set(counterReference,{nextNumber:nextNumber+1});
    transaction.update(recordReference,{documentNo});
    return documentNo;
  });
}

export async function listRecords(collectionName){
  const firestore = initFirebase();
  let snapshot = await getDocs(collection(firestore,collectionName));
  let documents = snapshot.docs.filter(record=>record.id !== COUNTER_DOCUMENT_ID);
  if(collectionName === "ledger"){
    await ensureDefaultLedgers(firestore,documents);
    snapshot = await getDocs(collection(firestore,collectionName));
    documents = snapshot.docs.filter(record=>record.id !== COUNTER_DOCUMENT_ID);
  }
  const prefix = DOCUMENT_PREFIXES[collectionName];
  if(!prefix) return documents.map(record=>({id:record.id,...record.data()}));

  const minimumNext = documents.reduce((next,record)=>{
    const match = String(record.data().documentNo || "").match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Math.max(next,Number(match[1])+1) : next;
  },1);
  await ensureDocumentCounterFloor(collectionName,minimumNext);
  const records = [];
  for(const document of documents){
    const record = {id:document.id,...document.data()};
    if(!record.documentNo) record.documentNo = await ensureRecordDocumentNumber(collectionName,record.id);
    records.push(record);
  }
  return records;
}

export async function createRecord(collectionName, data){
  const firestore = initFirebase();
  const reference = doc(collection(firestore,collectionName));
  const prefix = DOCUMENT_PREFIXES[collectionName];
  if(!prefix){
    const now = serverTimestamp();
    await setDoc(reference,{...data,createdAt:now,updatedAt:now});
    return reference.id;
  }
  const counterReference = doc(firestore,collectionName,COUNTER_DOCUMENT_ID);
  await runTransaction(firestore,async transaction=>{
    const snapshot = await transaction.get(counterReference);
    const nextNumber = Number(snapshot.data()?.nextNumber) || 1;
    const now = serverTimestamp();
    transaction.set(counterReference,{nextNumber:nextNumber+1});
    transaction.set(reference,{
      ...data,
      documentNo:`${prefix}-${String(nextNumber).padStart(5,"0")}`,
      createdAt:now,
      updatedAt:now
    });
  });
  return reference.id;
}

export async function issueCheque(checkbookId,data){
  const firestore=initFirebase();
  const checkbookReference=doc(firestore,"checkbooks",checkbookId);
  const chequeReference=doc(collection(firestore,"cheques"));
  const counterReference=doc(firestore,"cheques",COUNTER_DOCUMENT_ID);
  let issuedCheque;
  await runTransaction(firestore,async transaction=>{
    const [checkbookSnapshot,counterSnapshot]=await Promise.all([
      transaction.get(checkbookReference),transaction.get(counterReference)
    ]);
    if(!checkbookSnapshot.exists()) throw new Error("Select a valid checkbook before issuing a cheque.");
    const checkbook=checkbookSnapshot.data();
    const chequeNumber=Number(checkbook.nextChequeNo??checkbook.firstChequeNo);
    if(!Number.isSafeInteger(chequeNumber)||chequeNumber>Number(checkbook.lastChequeNo)) throw new Error("This checkbook has no cheque numbers remaining.");
    const nextDocumentNumber=Number(counterSnapshot.data()?.nextNumber)||1;
    const formattedChequeNumber=String(chequeNumber).padStart(Number(checkbook.chequeNumberWidth)||0,"0");
    issuedCheque={id:chequeReference.id,chequeNumber:formattedChequeNumber,documentNo:`CHQ-${String(nextDocumentNumber).padStart(5,"0")}`};
    const now=serverTimestamp();
    transaction.set(chequeReference,{
      ...data,
      checkbookId,
      checkbookName:checkbook.name,
      bankId:checkbook.bankId,
      bankName:checkbook.bankName,
      chequeNumber:formattedChequeNumber,
      documentNo:issuedCheque.documentNo,
      status:"Issued",
      createdAt:now,
      updatedAt:now
    });
    transaction.update(checkbookReference,{nextChequeNo:chequeNumber+1,updatedAt:now});
    transaction.set(counterReference,{nextNumber:nextDocumentNumber+1});
  });
  return issuedCheque;
}

export async function updateRecord(collectionName, recordId, data){
  const reference = doc(initFirebase(),collectionName,recordId);
  let editableData = data;
  if(collectionName === "ledger"){
    const snapshot = await getDoc(reference);
    const preset = snapshot.data();
    if(preset?.systemDefault){
      const allowedFields = preset.partyType === "Client"
        ? new Set(["openingBalance","name","category","accountGroup","accountType","balanceType","systemDefaultKey","partyType","partyId","clientId"])
        : preset.accountType === "Bank"
        ? new Set(["openingBalance","bankName","accountHolderName","accountNumber","ifsc","bankBranch"])
        : new Set(["openingBalance"]);
      editableData = Object.fromEntries(Object.entries(data).filter(([key])=>allowedFields.has(key)));
    }
  }
  await updateDoc(reference, {
    ...editableData,
    updatedAt:serverTimestamp()
  });
}

export async function deleteRecord(collectionName, recordId){
  const reference = doc(initFirebase(),collectionName,recordId);
  if(collectionName === "ledger"){
    const snapshot = await getDoc(reference);
    if(snapshot.data()?.systemDefault && snapshot.data()?.partyType !== "Client") throw new Error("Preset ledgers cannot be deleted.");
  }
  await deleteDoc(reference);
}

export async function getCompany(){
  const firestore = initFirebase();
  const snap = await getDoc(doc(firestore, "company_settings", "master"));
  return snap.exists() ? snap.data() : null;
}

export async function uploadCompanyLogo(file){
  const user = getAuthClient().currentUser;
  if(!user) throw new Error("Sign in before uploading a company logo.");
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG, or WebP logo.");
  if(file.size > 5 * 1024 * 1024) throw new Error("Company logos must be 5 MB or smaller.");
  const safeName = file.name.replace(/[^a-z0-9._-]/gi,"_").slice(0,100) || "company-logo";
  const storagePath = `company-logos/${user.uid}/${Date.now()}-${safeName}`;
  await uploadBytes(ref(getStorage(getFirebaseApp()),storagePath),file,{contentType:file.type});
  return storagePath;
}

export async function getCompanyLogoBlob(storagePath){
  const user = getAuthClient().currentUser;
  if(!user) throw new Error("Sign in before loading the company logo.");
  return getBlob(ref(getStorage(getFirebaseApp()),storagePath));
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
