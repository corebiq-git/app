import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// Replace these values with the Web app config from Firebase Console > Project settings.
const firebaseConfig = {
  apiKey: "AIzaSyAcO1L2Za7dzILxylmMkRTSx0FBVu_EEoM",
    authDomain: "cmf001stra.firebaseapp.com",
    projectId: "cmf001stra",
    storageBucket: "cmf001stra.firebasestorage.app",
    messagingSenderId: "763958641347",
    appId: "1:763958641347:web:316876bc2340b26bd21876",
    measurementId: "G-770FBR88LJ"
};
const configured = !Object.values(firebaseConfig).some(v => String(v).includes('YOUR_'));
const $ = id => document.getElementById(id);
let auth, functions, chart;
const fmt = n => n == null ? '—' : Intl.NumberFormat('en-IN',{notation:Math.abs(Number(n))>=100000?'compact':'standard',maximumFractionDigits:1}).format(Number(n));
const bytes = n => n == null ? '—' : Number(n)<1024?' '+fmt(n)+' B':Number(n)<1048576?fmt(Number(n)/1024)+' KB':fmt(Number(n)/1048576)+' MB';
function setNotice(message, kind='info'){ $('notice').textContent=message; $('notice').className='notice'+(kind==='error'?' error-notice':''); }
function setText(id,v){$(id).textContent=v==null?'—':v;}
function drawChart(days){
  const canvas=$('usageChart'); if(!canvas)return;
  if(chart) chart.destroy();
  const labels=days.map(x=>x.date);
  chart=new Chart(canvas,{type:'line',data:{labels,datasets:[
    {label:'Firestore reads',data:days.map(x=>x.firestoreReads??null),borderColor:'#3977df',backgroundColor:'#3977df18',fill:true,tension:.3,spanGaps:true},
    {label:'Firestore writes',data:days.map(x=>x.firestoreWrites??null),borderColor:'#8558d8',backgroundColor:'transparent',tension:.3,spanGaps:true},
    {label:'Function executions',data:days.map(x=>x.functionExecutions??null),borderColor:'#d69a2d',backgroundColor:'transparent',tension:.3,spanGaps:true}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:7,font:{family:'Inter',size:10}}}},scales:{x:{grid:{display:false},ticks:{font:{family:'Inter',size:9},maxRotation:0}},y:{beginAtZero:true,grid:{color:'#edf0f5'},ticks:{font:{family:'Inter',size:9}}}}}});
}
function renderServices(services=[]){
  const rows=$('serviceRows'), coverage=$('serviceCoverage'); rows.innerHTML=''; coverage.innerHTML='';
  if(!services.length){rows.innerHTML='<tr><td colspan="4" class="empty">No metric data returned. Check API enablement and metric availability.</td></tr>';coverage.innerHTML='<div class="empty">No service metrics returned.</div>';return;}
  for(const s of services){const tr=document.createElement('tr');for(const value of [s.service,s.metricLabel||s.metric||'—',s.value==null?'—':(s.unit==='bytes'?bytes(s.value):fmt(s.value))]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td)}const td=document.createElement('td');const span=document.createElement('span');span.className='status'+(s.available?'':' off');span.textContent=s.available?'Available':'Not available';td.appendChild(span);tr.appendChild(td);rows.appendChild(tr);
    const item=document.createElement('div');item.className='service-item';const bullet=document.createElement('span');bullet.className='service-bullet';const label=document.createElement('div');const strong=document.createElement('strong');strong.textContent=s.service;const small=document.createElement('small');small.textContent=s.metricLabel||s.metric||'Metric';label.append(strong,small);const right=document.createElement('div');right.className='right';const val=document.createElement('strong');val.textContent=s.value==null?'—':(s.unit==='bytes'?bytes(s.value):fmt(s.value));const state=document.createElement('small');state.textContent=s.available?'Available':'Unavailable';right.append(val,state);item.append(bullet,label,right);coverage.appendChild(item);
  }
}
function renderHistory(items=[]){const body=$('historyRows');body.innerHTML='';if(!items.length){body.innerHTML='<tr><td colspan="5" class="empty">No saved snapshots yet.</td></tr>';return}for(const x of items){const tr=document.createElement('tr');[x.date,fmt(x.firestoreReads),fmt(x.firestoreWrites),bytes(x.rtdbEgress),x.capturedAt?new Date(x.capturedAt).toLocaleString():'—'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td)});body.appendChild(tr)}}
async function loadDashboard(){if(!functions)return;setNotice('Loading official metrics and saved history…');$('refreshBtn').disabled=true;try{const fn=httpsCallable(functions,'getDashboard');const result=await fn({days:Number($('rangeSelect').value)});const d=result.data||{};const latest=d.latest||{};setText('projectLabel',`Project: ${d.projectId||firebaseConfig.projectId} · Last ${$('rangeSelect').value} day(s)`);setText('firestoreReads',fmt(latest.firestoreReads));setText('firestoreWrites',fmt(latest.firestoreWrites));setText('rtdbEgress',bytes(latest.rtdbEgress));setText('functionExecutions',fmt(latest.functionExecutions));drawChart(d.daily||[]);renderServices(d.services||[]);renderHistory(d.history||[]);if(d.billing?.available){setText('reportedCost',new Intl.NumberFormat('en-US',{style:'currency',currency:d.billing.currency||'USD'}).format(d.billing.amount));setText('billingPeriod',d.billing.period||'Reported from configured billing export.')}else{setText('reportedCost','Not connected');setText('billingPeriod','Configure Billing export to BigQuery to display actual costs.')}setNotice(d.warning||'Metrics refreshed. Values may be delayed by Cloud Monitoring and availability varies by service.');setText('lastUpdated','Updated '+new Date().toLocaleTimeString());}catch(e){console.error(e);setNotice(e.message||'Could not load metrics. Check admin access, deployed functions and Cloud Monitoring API permissions.','error')}finally{$('refreshBtn').disabled=false}}
async function saveSnapshot(){try{$('snapshotBtn').disabled=true;const fn=httpsCallable(functions,'captureDailySnapshot');await fn({});await loadDashboard();setNotice('Daily snapshot saved.');}catch(e){setNotice(e.message||'Snapshot failed.','error')}finally{$('snapshotBtn').disabled=false}}
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const button = $('loginBtn');
  const error = $('loginError');
  error.textContent = '';

  if (!configured || !auth) {
    error.textContent = 'Firebase configuration is missing. Check public/app.js.';
    return;
  }
  if (!email || !password) {
    error.textContent = 'Enter your email address and password.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    console.error('Sign-in failed:', e.code || e.message);
    const messages = {
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Check your connection.',
      'auth/operation-not-allowed': 'Enable Email/Password sign-in in Firebase Authentication.'
    };
    error.textContent = messages[e.code] || 'Sign-in failed. Check your credentials and Firebase setup.';
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});
$('logoutBtn').addEventListener('click',()=>signOut(auth));$('refreshBtn').addEventListener('click',loadDashboard);$('rangeSelect').addEventListener('change',loadDashboard);$('snapshotBtn').addEventListener('click',saveSnapshot);
if(configured){const app=initializeApp(firebaseConfig);auth=getAuth(app);functions=getFunctions(app);getFirestore(app);onAuthStateChanged(auth,user=>{if(user){$('loginScreen').classList.add('hidden');$('app').classList.remove('hidden');loadDashboard()}else{$('app').classList.add('hidden');$('loginScreen').classList.remove('hidden')}})}else{setNotice('Setup required: add Firebase web config, deploy the backend, and set the administrator allowlist. The dashboard is not connected to live data.');}
