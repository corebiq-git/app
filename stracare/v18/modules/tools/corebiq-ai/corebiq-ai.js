import { auth, db } from '../../../js/firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const root=document.getElementById('corebiq-ai');
const searchInput=document.getElementById('aiPatientSearch');
const suggestions=document.getElementById('aiSuggestions');
const loading=document.getElementById('aiLoading');
const errorBox=document.getElementById('aiError');
const results=document.getElementById('aiResults');
const searchButton=document.getElementById('aiSearchButton');
let patients=[];
let visiblePatients=[];
let activeUser=null;

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(value)||0);
const dateValue=value=>{
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
  return date.getFullYear()===Number(match[1])&&date.getMonth()===Number(match[2])-1&&date.getDate()===Number(match[3])?date:null;
};
const formatDate=value=>{
  const date=dateValue(value);
  return date?new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(date):'Not recorded';
};
const formatTime=value=>{
  const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if(!match)return String(value||'');
  let hour=Number(match[1]);
  if(match[3])return hour>=1&&hour<=12?`${String(hour).padStart(2,'0')}:${match[2]} ${match[3].toUpperCase()}`:String(value);
  if(hour>23)return String(value);
  const period=hour>=12?'PM':'AM';
  hour=hour%12||12;
  return `${String(hour).padStart(2,'0')}:${match[2]} ${period}`;
};
const dayOrder=(a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.time||'').localeCompare(String(a.time||''));
const setError=message=>{
  errorBox.textContent=message;
  errorBox.hidden=!message;
};

function renderSuggestions(value){
  const term=value.trim().toLocaleLowerCase();
  if(!term){suggestions.classList.remove('show');suggestions.innerHTML='';visiblePatients=[];return}
  const digits=term.replace(/\D/g,'');
  const matches=patients.filter(({data})=>{
    const name=String(data.name||'').toLocaleLowerCase();
    const mobile=String(data.mobile||'').replace(/\D/g,'');
    return name.includes(term)||(digits.length>0&&mobile.includes(digits));
  }).sort((a,b)=>{
    const aName=String(a.data.name||'').toLocaleLowerCase(),bName=String(b.data.name||'').toLocaleLowerCase();
    const aExact=String(a.data.mobile||'').replace(/\D/g,'')===digits||aName===term;
    const bExact=String(b.data.mobile||'').replace(/\D/g,'')===digits||bName===term;
    return Number(bExact)-Number(aExact)||aName.localeCompare(bName);
  }).slice(0,8);
  visiblePatients=matches;
  if(!matches.length){
    suggestions.innerHTML='<div class="ai-empty">No matching patients found in your permitted records.</div>';
    suggestions.classList.add('show');
    return;
  }
  suggestions.innerHTML=matches.map((item,index)=>{
    const patient=item.data;
    const name=patient.name||'Unnamed patient';
    const meta=[patient.mobile,patient.branch].filter(Boolean).join(' · ');
    return `<button type="button" class="ai-suggestion" role="option" aria-selected="false" data-patient-index="${index}"><span class="ai-avatar">${escapeHtml(name.trim().charAt(0).toUpperCase()||'?')}</span><span><span class="ai-suggestion-name">${escapeHtml(name)}</span><span class="ai-suggestion-meta">${escapeHtml(meta||'Patient details')}</span></span></button>`;
  }).join('');
  suggestions.classList.add('show');
}

async function loadPatientAppointments(patient){
  let appointmentQuery=query(collection(db,'appointments'),where('mobile','==',String(patient.mobile||'')));
  if(activeUser.role!=='admin'){
    appointmentQuery=query(collection(db,'appointments'),where('mobile','==',String(patient.mobile||'')),where('branch','==',activeUser.branch));
  }
  const snapshot=await getDocs(appointmentQuery);
  return snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
}

function renderPatient(patient,appointments){
  const patientName=patient.name||'Unnamed patient';
  const due=appointments.reduce((total,appointment)=>total+(Number(appointment.balance)||0),0);
  const completed=appointments.filter(appointment=>String(appointment.status||'').toLowerCase()==='completed');
  const lastService=[...completed].sort(dayOrder)[0]||null;
  const today=new Date();
  today.setHours(0,0,0,0);
  const upcoming=appointments.filter(appointment=>{
    const date=dateValue(appointment.date);
    return date&&date>=today&&String(appointment.status||'').toLowerCase()==='pending';
  }).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.time||'').localeCompare(String(b.time||'')))[0]||null;
  const recent=[...appointments].sort(dayOrder).slice(0,6);
  const dueClass=due>0.005?'due':due<-.005?'credit':'';
  const dueLabel=due>0.005?'Outstanding due':due<-.005?'Credit / excess':'Outstanding due';
  const dueText=due>0.005?money(due):due<-.005?money(Math.abs(due)):'No due';
  const ageGender=[patient.age?`${escapeHtml(patient.age)} yrs`:null,patient.gender?escapeHtml(patient.gender):null].filter(Boolean).join(' · ');
  const lastServiceText=lastService?formatDate(lastService.date):'No completed service';
  const lastServiceNote=lastService?[lastService.time?formatTime(lastService.time):'',lastService.therapist||''].filter(Boolean).map(escapeHtml).join(' · '):'Completed visits only';
  const nextText=upcoming?formatDate(upcoming.date):'None scheduled';
  const nextNote=upcoming?[upcoming.time?formatTime(upcoming.time):'',upcoming.branch||''].filter(Boolean).map(escapeHtml).join(' · '):'No upcoming pending appointment';
  const recentRows=recent.length?recent.map(appointment=>{
    const balance=Number(appointment.balance)||0;
    const status=String(appointment.status||'Pending');
    const statusClass=status.toLowerCase()==='completed'?'completed':status.toLowerCase()==='cancelled'?'cancelled':'';
    return `<tr><td>${escapeHtml(formatDate(appointment.date))}${appointment.time?` · ${escapeHtml(formatTime(appointment.time))}`:''}</td><td>${escapeHtml(appointment.therapist||'—')}</td><td>${escapeHtml(appointment.branch||'—')}</td><td><span class="ai-status ${statusClass}">${escapeHtml(status)}</span></td><td>${balance>0.005?`<span style="color:#c44646;font-weight:700">${escapeHtml(money(balance))}</span>`:balance<-.005?`<span style="color:#16835b;font-weight:700">${escapeHtml(money(Math.abs(balance)))}</span>`:'—'}</td></tr>`;
  }).join(''):'<tr><td colspan="5">No appointments found for this patient.</td></tr>';

  results.innerHTML=`
    <div class="ai-answer"><div class="ai-answer-mark" aria-hidden="true"><span class="material-symbols-rounded">auto_awesome</span></div><div class="ai-answer-copy"><strong>Here’s the patient summary.</strong> The details below are based on saved clinic records.</div></div>
    <section class="ai-patient-card" aria-label="Patient summary">
      <header class="ai-patient-head">
        <div class="ai-patient-avatar" aria-hidden="true">${escapeHtml(patientName.trim().charAt(0).toUpperCase()||'?')}</div>
        <div><h2 class="ai-patient-name">${escapeHtml(patientName)}</h2><p class="ai-patient-meta">${escapeHtml([patient.mobile,patient.branch].filter(Boolean).join(' · ')||'Patient profile')}</p>${ageGender?`<p class="ai-patient-meta">${ageGender}</p>`:''}</div>
        <div class="ai-patient-id">${patient.patientId?`Patient ID<br><strong>${escapeHtml(patient.patientId)}</strong>`:''}</div>
      </header>
      <div class="ai-metrics">
        <div class="ai-metric"><span class="ai-metric-label"><span class="material-symbols-rounded">account_balance_wallet</span>${dueLabel}</span><strong class="ai-metric-value ${dueClass}">${dueText}</strong><span class="ai-metric-note">${due<-.005?'Available credit':due>0.005?'Across recorded appointments':'All recorded appointments settled'}</span></div>
        <div class="ai-metric"><span class="ai-metric-label"><span class="material-symbols-rounded">event_available</span>Last service</span><strong class="ai-metric-value">${escapeHtml(lastServiceText)}</strong><span class="ai-metric-note">${lastServiceNote||'Completed visits only'}</span></div>
        <div class="ai-metric"><span class="ai-metric-label"><span class="material-symbols-rounded">medical_services</span>Completed sessions</span><strong class="ai-metric-value">${completed.length}</strong><span class="ai-metric-note">Based on completed appointments</span></div>
        <div class="ai-metric"><span class="ai-metric-label"><span class="material-symbols-rounded">upcoming</span>Next appointment</span><strong class="ai-metric-value">${escapeHtml(nextText)}</strong><span class="ai-metric-note">${nextNote||'No upcoming pending appointment'}</span></div>
      </div>
      <div class="ai-detail-grid">
        <section class="ai-detail-card"><h3 class="ai-section-title"><span class="material-symbols-rounded">person</span>Patient details</h3>
          <div class="ai-detail-line"><span>Category</span><strong>${escapeHtml(patient.category||'Not recorded')}</strong></div>
          <div class="ai-detail-line"><span>Branch</span><strong>${escapeHtml(patient.branch||'Not recorded')}</strong></div>
          <div class="ai-detail-line"><span>Last therapist</span><strong>${escapeHtml(lastService?.therapist||'Not recorded')}</strong></div>
          <div class="ai-detail-line"><span>Total appointments</span><strong>${appointments.length}</strong></div>
        </section>
        <section class="ai-detail-card"><h3 class="ai-section-title"><span class="material-symbols-rounded">history</span>Recent appointments</h3>
          <div class="ai-history-wrap"><table class="ai-history"><thead><tr><th>Date</th><th>Therapist</th><th>Branch</th><th>Status</th><th>Balance</th></tr></thead><tbody>${recentRows}</tbody></table></div>
        </section>
      </div>
    </section>
    <p class="ai-footnote">Summary is calculated from appointment records visible to your account. “Last service” uses appointments marked Completed. Please verify balances against the original records before collecting payment.</p>`;
  results.hidden=false;
}

async function selectPatient(patientRecord){
  const patient=patientRecord.data;
  suggestions.classList.remove('show');
  searchInput.value=patient.name||patient.mobile||'';
  setError('');
  results.hidden=true;
  loading.textContent=`Looking up appointments for ${patient.name||'this patient'}…`;
  loading.hidden=false;
  searchButton.disabled=true;
  try{
    const appointments=await loadPatientAppointments(patient);
    renderPatient(patient,appointments);
  }catch(error){
    console.error('COREBIQ AI patient lookup failed:',error);
    setError('Unable to load this patient’s appointment details. Check your account access and try again.');
  }finally{
    loading.hidden=true;
    searchButton.disabled=false;
  }
}

document.getElementById('aiSearchForm').addEventListener('submit',event=>{
  event.preventDefault();
  const term=searchInput.value.trim().toLocaleLowerCase();
  if(!term){setError('Enter a patient name or mobile number to search.');searchInput.focus();return}
  const digits=term.replace(/\D/g,'');
  const exact=patients.find(({data})=>String(data.mobile||'').replace(/\D/g,'')===digits||String(data.name||'').toLocaleLowerCase()===term);
  const match=exact||visiblePatients[0];
  if(!match){renderSuggestions(searchInput.value);setError('No matching patient found. Check the spelling or mobile number.');return}
  setError('');
  selectPatient(match);
});
searchInput.addEventListener('input',()=>{
  setError('');
  renderSuggestions(searchInput.value);
});
suggestions.addEventListener('click',event=>{
  const button=event.target.closest('[data-patient-index]');
  if(!button)return;
  const patient=visiblePatients[Number(button.dataset.patientIndex)];
  if(patient)selectPatient(patient);
});
document.addEventListener('click',event=>{
  if(!root.contains(event.target))suggestions.classList.remove('show');
});

onAuthStateChanged(auth,async user=>{
  if(!user){setError('Access denied. Please sign in to use the patient assistant.');loading.hidden=true;searchButton.disabled=true;return}
  activeUser=window.currentUser;
  if(!activeUser){setError('Your user profile is still loading. Please refresh and try again.');loading.hidden=true;return}
  loading.textContent='Loading patients available to your account…';
  loading.hidden=false;
  try{
    let patientQuery=query(collection(db,'patients'));
    if(activeUser.role!=='admin')patientQuery=query(collection(db,'patients'),where('branch','==',activeUser.branch));
    const snapshot=await getDocs(patientQuery);
    patients=snapshot.docs.map(doc=>({id:doc.id,data:doc.data()})).filter(item=>item.data.name||item.data.mobile);
    loading.textContent=patients.length?`Ready · ${patients.length} patient${patients.length===1?'':'s'} available in your records.`:'No patients were found in your records.';
  }catch(error){
    console.error('COREBIQ AI patient list failed to load:',error);
    loading.hidden=true;
    setError('Unable to load patients. Check your account access and connection, then refresh this page.');
  }
});
