import { auth, db } from '../../../js/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, addDoc, query, where, getDocs, updateDoc, doc, deleteDoc, getDoc, runTransaction, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

window.appointmentsDataCache={}; window.allPatientsCache={}; window.allPatientsCacheByBranch={}; window.allPatientsDocumentIdsByBranch={}; window.allPatientsCacheLoaded=false; window.patientsForAptLoadPromise=null; window.allBranchesString='';
let allAppointments=[]; let sortMode='dateDesc'; let confirmHandler=null;
const appointmentsRequestCache=new Map();
let appointmentsLoadVersion=0;

const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=v=>(parseFloat(v)||0).toFixed(2);
const displayMoney=v=>window.formatCorebiqCurrency?window.formatCorebiqCurrency(v):`₹${money(v)}`;
const formatTime12Hour=value=>{
  const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if(!match)return value||'';
  let hours=Number(match[1]);
  const minutes=match[2],meridiem=match[3]?.toUpperCase();
  if(meridiem)return hours>=1&&hours<=12?`${String(hours).padStart(2,'0')}:${minutes} ${meridiem}`:value;
  if(hours>23)return value;
  const period=hours>=12?'PM':'AM';
  hours=hours%12||12;
  return `${String(hours).padStart(2,'0')}:${minutes} ${period}`;
};
function balanceDisplay(v){
  const n=Number(v)||0;
  if(Math.abs(n)<0.005) return {text:'No Due',cls:'no-due'};
  if(n<0) return {text:`Excess ${displayMoney(Math.abs(n))}`,cls:'excess'};
  return {text:`Due ${displayMoney(n)}`,cls:'due'};
}
function paymentStatusDisplay(v){
  const n=Number(v)||0;
  if(Math.abs(n)<0.005) return {text:'Paid',cls:'payment-paid',detail:''};
  if(n<0) return {text:'Excess',cls:'payment-excess',detail:displayMoney(Math.abs(n))};
  return {text:'Not Paid',cls:'payment-not-paid',detail:`Due ${displayMoney(n)}`};
}
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
document.getElementById('filterDateFrom').value=todayISO();
document.getElementById('filterDateTo').value=todayISO();
let selectedAppointmentDate=todayISO();
function appointmentDateFromKey(dateKey){
  const [year,month,day]=dateKey.split('-').map(Number);
  return new Date(year,month-1,day);
}
function renderAppointmentWeek(){
  const selectedDate=appointmentDateFromKey(selectedAppointmentDate);
  const weekStart=new Date(selectedDate);
  weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
  const weekEnd=new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate()+6);
  const label=document.getElementById('appointmentWeekLabel');
  const days=document.getElementById('appointmentWeekDays');
  if(!label||!days)return;
  const dateLabel=date=>date.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  label.textContent=`${dateLabel(weekStart)} - ${dateLabel(weekEnd)}`;
  days.replaceChildren();
  for(let index=0;index<7;index++){
    const date=new Date(weekStart);
    date.setDate(weekStart.getDate()+index);
    const dateKey=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const button=document.createElement('button');
    button.type='button';
    button.className='dashboard-week-day';
    if(dateKey===todayISO())button.classList.add('dashboard-week-day-today');
    button.setAttribute('aria-pressed',String(dateKey===selectedAppointmentDate));
    button.setAttribute('aria-label',date.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'}));
    const dayName=document.createElement('span');
    dayName.className='dashboard-week-day-name';
    dayName.textContent=date.toLocaleDateString('en-IN',{weekday:'short'});
    const dayNumber=document.createElement('span');
    dayNumber.className='dashboard-week-day-number';
    dayNumber.textContent=String(date.getDate());
    button.append(dayName,dayNumber);
    button.addEventListener('click',()=>{
      selectedAppointmentDate=dateKey;
      document.getElementById('filterDateFrom').value=dateKey;
      document.getElementById('filterDateTo').value=dateKey;
      renderAppointmentWeek();
      window.loadAppointments();
    });
    days.appendChild(button);
  }
}
function shiftAppointmentWeek(days){
  const date=appointmentDateFromKey(selectedAppointmentDate);
  date.setDate(date.getDate()+days);
  selectedAppointmentDate=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  document.getElementById('filterDateFrom').value=selectedAppointmentDate;
  document.getElementById('filterDateTo').value=selectedAppointmentDate;
  renderAppointmentWeek();
  window.loadAppointments();
}
document.getElementById('appointmentPreviousWeek').addEventListener('click',()=>shiftAppointmentWeek(-7));
document.getElementById('appointmentNextWeek').addEventListener('click',()=>shiftAppointmentWeek(7));
document.getElementById('appointmentCurrentWeek').addEventListener('click',()=>{
  selectedAppointmentDate=todayISO();
  document.getElementById('filterDateFrom').value=selectedAppointmentDate;
  document.getElementById('filterDateTo').value=selectedAppointmentDate;
  renderAppointmentWeek();
  window.loadAppointments();
});
renderAppointmentWeek();
window.appointmentDateFilterChanged=()=>{
  const from=document.getElementById('filterDateFrom').value;
  if(from)selectedAppointmentDate=from;
  renderAppointmentWeek();
  return window.loadAppointments();
};
window.formatIndianDate=dateStr=>{if(!dateStr)return'';const p=String(dateStr).split('-');return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:dateStr};
const attendanceDayInitial=dateStr=>{
  const match=String(dateStr||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return'';
  const [,year,month,day]=match;
  const date=new Date(Number(year),Number(month)-1,Number(day));
  if(date.getFullYear()!==Number(year)||date.getMonth()!==Number(month)-1||date.getDate()!==Number(day))return'';
  return['S','M','T','W','T','F','S'][date.getDay()];
};
function closeTools(){document.querySelectorAll('.tool.open').forEach(x=>x.classList.remove('open'))}
window.toggleTool=id=>{const e=document.getElementById(id);if(!e)return;const was=e.classList.contains('open');closeTools();if(!was)e.classList.add('open')};
document.addEventListener('click',e=>{if(!e.target.closest('.tool'))closeTools()});
window.closeModal=id=>document.getElementById(id)?.classList.remove('show');

onAuthStateChanged(auth,user=>{
  if(!user){document.getElementById('appointment-module').innerHTML='<div style="padding:50px;text-align:center;color:#991B1B">Access denied. Please log in.</div>';return}
  window.loadPublicBookingRequests()
    .catch(e=>{console.error('Unable to initialize public booking requests:',e);document.getElementById('publicBookingList').innerHTML='<div class="public-booking-empty" style="color:var(--danger)">Unable to load booking requests. Check Firestore permissions.</div>'});
  window.loadBranchesForApt(); window.loadTherapistsForApt();
  document.getElementById('todayLabel').textContent='Today: '+window.formatIndianDate(todayISO());
  window.resetAptForm();
  window.appointmentsLoadPromise=window.loadAppointments();
  window.appointmentsLoadPromise.then(()=>{
    if(window.dashboardPendingDuesRequested){
      window.dashboardPendingDuesRequested=false;
      window.showPendingDues();
    }
  });
});

window.loadPatientsForApt=async()=>{
  const dl=document.getElementById('patients-datalist'); if(!dl)return;
  if(window.allPatientsCacheLoaded)return;
  if(window.patientsForAptLoadPromise)return window.patientsForAptLoadPromise;
  const request=(async()=>{
    try{
      let q=query(collection(db,'patients'));
      if(window.currentUser&&window.currentUser.role!=='admin')q=query(collection(db,'patients'),where('branch','==',window.currentUser.branch));
      const s=await getDocs(q);let h='';window.allPatientsCache={};window.allPatientsCacheByBranch={};window.allPatientsDocumentIdsByBranch={};
      s.forEach(d=>{const p=d.data();if(p.name&&p.mobile){window.allPatientsCache[p.mobile]=p;window.allPatientsCacheByBranch[`${p.branch||''}:${p.mobile}`]=p;window.allPatientsDocumentIdsByBranch[`${p.branch||''}:${p.mobile}`]=d.id;h+=`<option value="${esc(p.mobile)}" label="${esc(p.name)} (${esc(p.mobile)})"></option><option value="${esc(p.name)} (${esc(p.mobile)})"></option>`}});
      window.allPatientsCacheLoaded=true;
      window.patientMatchLookupFailed=false;
      dl.innerHTML=h;
      window.renderPublicBookingRequests?.();
      return s;
    }catch(e){window.allPatientsCacheLoaded=false;window.patientMatchLookupFailed=true;console.error(e);throw e}
  })();
  window.patientsForAptLoadPromise=request;
  try{return await request}
  finally{if(window.patientsForAptLoadPromise===request)window.patientsForAptLoadPromise=null}
};
window.loadBranchesForApt=async()=>{
  const a=document.getElementById('aptBranch'),f=document.getElementById('filterBranch');
  if(window.currentUser&&window.currentUser.role!=='admin'){const b=window.currentUser.branch;a.innerHTML=`<option value="${esc(b)}">${esc(b)}</option>`;f.innerHTML=`<option value="${esc(b)}">${esc(b)}</option>`;a.disabled=true;window.allBranchesString=b;return}
  try{const s=await getDocs(collection(db,'branches'));let l=[];s.forEach(d=>{if(d.data().name)l.push(d.data().name)});l.sort();window.allBranchesString=l.join(' | ');a.innerHTML='<option value="">Select Branch</option>'+l.map(x=>`<option>${esc(x)}</option>`).join('');f.innerHTML='<option value="">All Branches</option>'+l.map(x=>`<option>${esc(x)}</option>`).join('')}catch(e){console.error(e)}
};
window.loadTherapistsForApt=async()=>{
  const dl=document.getElementById('therapists-datalist');if(!dl)return;
  try{let q=query(collection(db,'therapists'));if(window.currentUser&&window.currentUser.role!=='admin')q=query(collection(db,'therapists'),where('branch','==',window.currentUser.branch));const s=await getDocs(q);let l=[];s.forEach(d=>{if(d.data().name)l.push(d.data().name)});dl.innerHTML=l.sort().map(x=>`<option value="${esc(x)}"></option>`).join('')}catch(e){console.error(e)}
};
window.handlePatientSelect=async()=>{
  let raw=document.getElementById('aptPatientSearch').value.trim(),mobile=raw;if(!window.allPatientsCache[mobile]){const m=raw.match(/(\d{10})/);if(m)mobile=m[1]}const p=window.allPatientsCache[mobile];if(!p)return;
  document.getElementById('aptPatientSearch').value=p.name||'';
  const ids=['aptName','aptMobile','aptAge','aptGender','aptLocation','aptPatientNotes'],keys=['name','mobile','age','gender','location','notes'];ids.forEach((id,i)=>document.getElementById(id).value=p[keys[i]]||'');
  document.getElementById('aptCategory').value=p.category||'Normal';if(p.branch&&!document.getElementById('aptBranch').disabled)document.getElementById('aptBranch').value=p.branch;
  let due=0,current=document.getElementById('aptDocId').value;try{let q=query(collection(db,'appointments'),where('mobile','==',p.mobile));if(window.currentUser&&window.currentUser.role!=='admin')q=query(collection(db,'appointments'),where('mobile','==',p.mobile),where('branch','==',window.currentUser.branch));(await getDocs(q)).forEach(d=>{if(d.id!==current)due+=parseFloat(d.data().balance)||0});document.getElementById('aptPrevDues').value=due.toFixed(2);window.calcBalance()}catch(e){console.error(e)}
};
window.calcBalance=()=>{
  const f=parseFloat(document.getElementById('aptFee').value)||0;
  const a=parseFloat(document.getElementById('aptAdvance').value)||0;
  document.getElementById('aptPaymentModeField').style.display=a>0?'':'none';
  const p=parseFloat(document.getElementById('aptPrevDues').value)||0;
  const n=f+p-a;
  const state=balanceDisplay(n);
  const input=document.getElementById('aptBalance');
  const label=document.getElementById('aptBalanceState');
  const previousInput=document.getElementById('aptPrevDues');
  const previousState=balanceDisplay(p);
  previousInput.classList.remove('due','excess','no-due');
  previousInput.classList.add(previousState.cls);
  input.classList.remove('due','excess','no-due');
  input.classList.add(state.cls);
  input.value=Math.abs(n)<0.005?'0.00':money(n);
  label.textContent=state.text;
  label.className=state.cls;
};
window.toggleReschedule=s=>{const c=document.getElementById('reschedule-container');c.style.display=s.value==='Rescheduled'?'block':'none';if(s.value!=='Rescheduled')document.getElementById('aptRescheduleDate').value=''};
window.openLocationMap=()=>{const l=document.getElementById('aptLocation').value;if(!l)return alert('Please enter an address or map link first.');window.open(l.startsWith('http')?l:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(l),'_blank')};
window.getCurrentLocation=btn=>{if(!navigator.geolocation)return alert('Geolocation is not supported.');const old=btn.innerHTML;btn.innerHTML='<span class="material-symbols-rounded">sync</span>';navigator.geolocation.getCurrentPosition(p=>{document.getElementById('aptLocation').value=`https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`;btn.innerHTML=old},()=>{alert('Unable to get location.');btn.innerHTML=old})};

window.resetAptForm=()=>{
  document.getElementById('add-appointment-form').reset();document.getElementById('aptDocId').value='';document.getElementById('aptPatientSearch').value='';
  document.getElementById('aptCategory').value='Normal';document.getElementById('aptStatus').value='Pending';document.getElementById('aptPaymentMode').value='Cash';
  document.getElementById('aptPrevDues').value='0.00';document.getElementById('aptBalance').value='0.00';document.getElementById('aptBalanceState').textContent='No Due';document.getElementById('aptBalanceState').className='no-due';document.getElementById('saveAptBtn').textContent='Save Appointment';document.getElementById('formTitle').textContent='New Appointment';
  document.getElementById('aptDate').value=todayISO();document.getElementById('aptRescheduleDate').value='';document.getElementById('reschedule-container').style.display='none';
  if(window.currentUser&&window.currentUser.role!=='admin')document.getElementById('aptBranch').value=window.currentUser.branch;
  window.calcBalance();
};
window.openAppointmentForm=()=>{closeTools();window.resetAptForm();window.loadPatientsForApt().catch(e=>console.error('Unable to load appointment patient choices:',e));document.getElementById('aptModal').classList.add('show');setTimeout(()=>document.getElementById('aptMobile').focus(),80)};
window.closeAppointmentForm=()=>document.getElementById('aptModal').classList.remove('show');

window.publicBookingRequestsCache={};
window.canReviewPublicBookingRequest=request=>
  Boolean(window.currentUser)&&(
    window.currentUser.role==='admin'
    || (Boolean(window.currentUser.branch)&&request?.branch===window.currentUser.branch)
  );
window.loadPublicBookingRequests=async()=>{
  const list=document.getElementById('publicBookingList');
  list.innerHTML='<div class="public-booking-empty">Loading public booking requests…</div>';
  try{
    if(!window.currentUser)throw new Error('Your account profile is not available.');
    let q=collection(db,'booking_requests');
    if(window.currentUser.role!=='admin'){
      if(!window.currentUser.branch||window.currentUser.branch==='Unknown'){
        throw new Error('Your account has no assigned branch.');
      }
      q=query(collection(db,'booking_requests'),where('branch','==',window.currentUser.branch));
    }
    const snapshot=await getDocs(q);
    window.publicBookingRequestsCache={};
    snapshot.forEach(item=>{
      const request=item.data();
      if(request.status==='pending')window.publicBookingRequestsCache[item.id]=request;
    });
    if(Object.keys(window.publicBookingRequestsCache).length&&!window.allPatientsCacheLoaded){
      try{await window.loadPatientsForApt();window.patientMatchLookupFailed=false}
      catch(error){window.patientMatchLookupFailed=true;console.error('Unable to match public bookings to patients:',error)}
    }
    window.renderPublicBookingRequests();
  }catch(error){
    console.error('Public booking request load failed:',error);
    document.getElementById('publicBookingCount').textContent='!';
    list.innerHTML='<div class="public-booking-empty" style="color:var(--danger)">Unable to load requests. Check deployed Firestore rules.</div>';
    throw error;
  }
};
window.renderPublicBookingRequests=()=>{
  const requests=Object.entries(window.publicBookingRequestsCache||{}).sort(([,a],[,b])=>
    `${a.date||''} ${a.time||''}`.localeCompare(`${b.date||''} ${b.time||''}`)
  );
  document.getElementById('publicBookingCount').textContent=String(requests.length);
  if(!requests.length){
    document.getElementById('publicBookingList').innerHTML='<div class="public-booking-empty">No pending public requests.</div>';
    return;
  }
  document.getElementById('publicBookingList').innerHTML=requests.map(([id,request])=>{
    const patient=window.allPatientsCacheByBranch?.[`${request.branch||''}:${request.mobile||''}`];
    const matchLabel=window.patientMatchLookupFailed
      ?'Patient match unavailable — verified during conversion'
      :!window.allPatientsCacheLoaded
        ?'Patient match not checked yet'
        :patient?'Existing patient — verify details':'New patient — verify before creating';
    const matchClass=patient?'existing':window.allPatientsCacheLoaded?'new':'';
    const time=formatTime12Hour(request.time);
    return `<article class="public-booking-request">
      <div class="public-booking-request-top">
        <div><div class="public-booking-request-name">${esc(request.name||'')}</div><div class="public-booking-request-meta">${esc(request.mobile||'')}<br>${esc(request.branch||'')} · ${window.formatIndianDate(request.date)} ${esc(time)}${request.notes?`<br>Message: ${esc(request.notes)}`:''}</div></div>
        <span class="patient-match ${matchClass}">${matchLabel}</span>
      </div>
      <div class="public-booking-actions">
        <button class="btn primary" type="button" onclick="window.convertPublicBooking('${esc(id)}')"><span class="material-symbols-rounded" style="font-size:17px">event_available</span> Convert to Appointment</button>
        <button class="btn" type="button" onclick="window.declinePublicBooking('${esc(id)}')"><span class="material-symbols-rounded" style="font-size:17px">close</span> Decline</button>
      </div>
    </article>`;
  }).join('');
};
window.convertPublicBooking=async requestId=>{
  const request=window.publicBookingRequestsCache?.[requestId];
  if(!request)return alert('This booking request is no longer pending. Refresh the request list.');
  if(!window.canReviewPublicBookingRequest(request))return alert('You can only approve public bookings for your assigned branch.');
  const patientQuery=query(
    collection(db,'patients'),
    where('mobile','==',request.mobile),
    where('branch','==',request.branch)
  );
  const patientSnapshot=await getDocs(patientQuery);
  const existingPatient=patientSnapshot.docs[0]?.data()||null;
  const requestRef=doc(db,'booking_requests',requestId);
  const appointmentRef=doc(collection(db,'appointments'));
  const appointment={
    mobile:request.mobile,
    name:existingPatient?.name||request.name,
    age:existingPatient?.age||'',
    gender:existingPatient?.gender||'',
    category:existingPatient?.category||'Normal',
    location:existingPatient?.location||'',
    patientNotes:existingPatient?.notes||'',
    branch:request.branch,
    date:request.date,
    time:request.time,
    previousDate:'',
    previousTime:'',
    duration:'',
    sessionsPerDay:'',
    therapist:'',
    status:'Pending',
    fee:0,
    advance:0,
    balance:0,
    prevDues:0,
    notes:request.notes?`Public booking message: ${request.notes}`:'',
    paymentMode:'Cash',
    paymentReference:'',
    paymentRemarks:'',
    publicBookingRequestId:requestId,
    createdAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  };
  const patientRef=existingPatient?null:doc(collection(db,'patients'));
  const patientData=patientRef?{
    patientId:'P'+Math.floor(Math.random()*90000+10000),
    mobile:request.mobile,
    name:request.name,
    category:'Normal',
    branch:request.branch,
    location:'',
    notes:'',
    createdAt:serverTimestamp()
  }:null;
  try{
    await runTransaction(db,async transaction=>{
      const requestSnapshot=await transaction.get(requestRef);
      if(!requestSnapshot.exists()||requestSnapshot.data().status!=='pending'){
        throw new Error('This booking request has already been handled.');
      }
      transaction.set(appointmentRef,appointment);
      if(patientRef&&patientData)transaction.set(patientRef,patientData);
      transaction.update(requestRef,{
        status:'converted',
        appointmentId:appointmentRef.id,
        patientMatch:existingPatient?'existing':'new',
        reviewedAt:serverTimestamp()
      });
    });
    invalidateAppointmentsRequestCache();
    if(patientData)window.allPatientsCacheByBranch[`${request.branch}:${request.mobile}`]=patientData;
    delete window.publicBookingRequestsCache[requestId];
    await Promise.all([window.loadAppointments(),window.loadPublicBookingRequests()]);
    alert(`Booking converted to appointment.${existingPatient?' Existing patient record matched by mobile and branch.':' New patient record created.'}`);
  }catch(error){
    console.error('Public booking conversion failed:',error);
    alert(`Could not convert booking request: ${error.message}`);
  }
};
window.declinePublicBooking=async requestId=>{
  const request=window.publicBookingRequestsCache?.[requestId];
  if(!request)return;
  if(!window.canReviewPublicBookingRequest(request))return alert('You can only decline public bookings for your assigned branch.');
  if(!confirm(`Decline the booking request from ${request.name||'this patient'}?`))return;
  try{
    await updateDoc(doc(db,'booking_requests',requestId),{status:'declined',reviewedAt:serverTimestamp()});
    delete window.publicBookingRequestsCache[requestId];
    window.renderPublicBookingRequests();
  }catch(error){
    console.error('Public booking decline failed:',error);
    alert('Could not decline this booking request. Check Firestore permissions.');
  }
};

window.loadAppointments=async()=>{
  const requestVersion=++appointmentsLoadVersion;
  const report=document.getElementById('therapistWiseReportContent');
  report.innerHTML='<div class="empty">Loading appointments...</div>';
  try{
    if(!window.currentUser)throw new Error('Your account profile is not available. Please sign out and sign in again.');
    const branch=window.currentUser.role!=='admin'
      ?String(window.currentUser.branch||'').trim()
      :document.getElementById('filterBranch').value;
    if(window.currentUser.role!=='admin'&&(!branch||branch==='Unknown')){
      throw new Error('Your account has no assigned branch. Ask an administrator to set your branch in Users.');
    }
    const from=document.getElementById('filterDateFrom').value;
    const to=document.getElementById('filterDateTo').value;
    const cacheKey=JSON.stringify([branch,from,to]);
    let request=appointmentsRequestCache.get(cacheKey);
    if(!request){
      const constraints=[];
      if(branch)constraints.push(where('branch','==',branch));
      if(from)constraints.push(where('date','>=',from));
      if(to)constraints.push(where('date','<=',to));
      request=getDocs(query(collection(db,'appointments'),...constraints));
      appointmentsRequestCache.set(cacheKey,request);
      request.then(()=>{
        if(appointmentsRequestCache.get(cacheKey)===request)appointmentsRequestCache.delete(cacheKey);
      },()=>{
        if(appointmentsRequestCache.get(cacheKey)===request)appointmentsRequestCache.delete(cacheKey);
      });
    }
    const snap=await request;
    if(requestVersion!==appointmentsLoadVersion)return;
    allAppointments=deduplicateAppointments(snap.docs.map(item=>({id:item.id,data:item.data()})));
    window.appointmentsDataCache={};
    allAppointments.forEach(item=>{window.appointmentsDataCache[item.id]=item.data});
    renderAppointments();
    if((!from||from<=todayISO())&&(!to||to>=todayISO())){
      updateKPIs(allAppointments);
    }else if(branch){
      updateKPIs(allAppointments);
    }else{
      try{
        const todaySnapshot=await getDocs(query(collection(db,'appointments'),where('date','==',todayISO())));
        if(requestVersion===appointmentsLoadVersion){
          updateKPIs(todaySnapshot.docs.map(item=>({id:item.id,data:item.data()})));
        }
      }catch(error){
        console.error('Unable to load today appointment totals:',error);
        if(requestVersion===appointmentsLoadVersion){
          ['kpiToday','kpiCompleted','kpiPending'].forEach(id=>document.getElementById(id).textContent='—');
        }
      }
    }
    return allAppointments;
  }catch(e){
    if(requestVersion!==appointmentsLoadVersion)return;
    console.error('Appointment load failed:',e);
    const detail=e?.code==='permission-denied'
      ?'Firestore denied this query. Confirm the deployed appointments rule allows this user branch and that the user profile branch exactly matches appointment.branch.'
      :e?.code==='failed-precondition'
        ?'A Firestore composite index is required. Deploy firestore.indexes.json, or open the full error in the browser console and use its index link. Wait for the index to finish building.'
        :e?.message||'An unexpected error occurred.';
    report.innerHTML=`<div class="empty" role="alert" style="color:var(--danger)">Unable to load appointments: ${esc(detail)}${e?.code?` <small>(${esc(e.code)})</small>`:''}</div>`;
  }
};
function invalidateAppointmentsRequestCache(){appointmentsRequestCache.clear()}
function patientDocumentId(branch,mobile){return `apt_${encodeURIComponent(branch)}_${encodeURIComponent(mobile)}`}
function appointmentDocumentId(appointment){
  return `apt_${encodeURIComponent(appointment.branch)}_${appointment.date}_${encodeURIComponent(appointment.time)}_${encodeURIComponent(appointment.therapist)}_${encodeURIComponent(appointment.mobile)}`;
}
function appointmentTimestamp(value){
  if(value&&typeof value.toMillis==='function')return value.toMillis();
  const parsed=value instanceof Date?value.getTime():Date.parse(value||'');
  return Number.isFinite(parsed)?parsed:0;
}
function deduplicateAppointments(records){
  const unique=new Map();
  records.forEach(record=>{
    const data=record.data;
    const identity=[data.branch,data.date,data.time,data.therapist,data.mobile]
      .map(value=>String(value||'').trim().toLowerCase());
    const key=identity.slice(0,3).every(Boolean)&&identity[4]
      ?identity.join('|')
      :record.id;
    const existing=unique.get(key);
    const isActive=String(data.status||'').toLowerCase()!=='cancelled';
    const existingIsActive=existing&&String(existing.data.status||'').toLowerCase()!=='cancelled';
    const timestamp=appointmentTimestamp(data.updatedAt)||appointmentTimestamp(data.createdAt);
    const existingTimestamp=existing
      ?appointmentTimestamp(existing.data.updatedAt)||appointmentTimestamp(existing.data.createdAt)
      :-1;
    if(!existing||(isActive&&!existingIsActive)||(isActive===existingIsActive&&timestamp>=existingTimestamp)){
      unique.set(key,record);
    }
  });
  return [...unique.values()];
}
async function createAppointmentIfMissing(appointment,{checkLegacyDuplicates=true}={}){
  const id=appointmentDocumentId(appointment);
  if(checkLegacyDuplicates){
    const existingQuery=query(
      collection(db,'appointments'),
      where('branch','==',appointment.branch),
      where('date','==',appointment.date),
      where('time','==',appointment.time),
      where('therapist','==',appointment.therapist),
      where('mobile','==',appointment.mobile)
    );
    const matches=await getDocs(existingQuery);
    if(matches.docs.some(item=>{
      const existing=item.data();
      return existing.date===appointment.date
        && existing.time===appointment.time
        && existing.therapist===appointment.therapist
        && existing.mobile===appointment.mobile
        && String(existing.status||'').toLowerCase()!=='cancelled';
    })){
      throw new Error('An appointment already exists for this patient, therapist, branch, date, and time.');
    }
  }
  const appointmentRef=doc(db,'appointments',id);
  await runTransaction(db,async transaction=>{
    const existing=await transaction.get(appointmentRef);
    if(existing.exists()&&String(existing.data().status||'').toLowerCase()!=='cancelled'){
      throw new Error('An appointment already exists for this patient, therapist, branch, date, and time.');
    }
    transaction.set(appointmentRef,appointment);
  });
  return id;
}
function updateKPIs(appointments=allAppointments){
  const t=todayISO(),tod=appointments.filter(x=>x.data.date===t),done=tod.filter(x=>String(x.data.status||'').toLowerCase()==='completed').length,pending=tod.filter(x=>String(x.data.status||'').toLowerCase()==='pending').length;
  document.getElementById('kpiToday').textContent=tod.length;document.getElementById('kpiCompleted').textContent=done;document.getElementById('kpiPending').textContent=pending;
}
function filteredAppointments(){
  const fr=document.getElementById('filterDateFrom').value,to=document.getElementById('filterDateTo').value,st=document.getElementById('filterStatus').value.toLowerCase(),cat=document.getElementById('filterCategory').value.toLowerCase(),pay=document.getElementById('filterPayment').value,br=document.getElementById('filterBranch').value.toLowerCase(),term=document.getElementById('aptSearchInput').value.toLowerCase().trim();
  let a=allAppointments.filter(x=>{const d=x.data,b=(d.branch||'').toLowerCase(),s=(d.status||'Pending').toLowerCase(),c=(d.category||'Normal').toLowerCase(),bal=parseFloat(d.balance)||0,text=`${d.name||''} ${d.mobile||''} ${d.therapist||''} ${d.branch||''} ${d.date||''}`.toLowerCase();return(!fr||d.date>=fr)&&(!to||d.date<=to)&&(!st||s===st)&&(!cat||c===cat)&&(!br||b===br)&&(!term||text.includes(term))&&(!pay||(pay==='pending'&&bal>0)||(pay==='paid'&&bal<=0))});
  a.sort((x,y)=>{const A=x.data,B=y.data;switch(sortMode){case'nameAsc':return String(A.name||'').localeCompare(String(B.name||''));case'doctorAsc':return String(A.therapist||'').localeCompare(String(B.therapist||''));case'balanceDesc':return (parseFloat(B.balance)||0)-(parseFloat(A.balance)||0);case'balanceAsc':return (parseFloat(A.balance)||0)-(parseFloat(B.balance)||0);case'dateAsc':return String(A.date||'').localeCompare(String(B.date||''))||String(A.time||'').localeCompare(String(B.time||''));default:return String(B.date||'').localeCompare(String(A.date||''))||String(B.time||'').localeCompare(String(A.time||''))}});
  return a;
}
function renderTherapistWiseReport(appointments){
  const content=document.getElementById('therapistWiseReportContent');
  if(!appointments.length){
    content.innerHTML='<div class="empty">No appointments match the selected date and filters.</div>';
    return;
  }
  const grouped=new Map();
  appointments.forEach(appointment=>{
    const therapist=String(appointment.data.therapist||'Unassigned').trim()||'Unassigned';
    if(!grouped.has(therapist))grouped.set(therapist,[]);
    grouped.get(therapist).push(appointment);
  });
  const groups=[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b));
  groups.forEach(([,items])=>items.sort((a,b)=>
    String(a.data.date||'').localeCompare(String(b.data.date||''))||String(a.data.time||'').localeCompare(String(b.data.time||''))
  ));
  const reportGroups=groups.map(([therapist,items])=>`
    <section class="therapist-report-group">
      <h3>${esc(therapist)} <span>${items.length} appointment${items.length===1?'':'s'}</span></h3>
      <div class="therapist-report-table-wrap">
        <table class="therapist-report-table">
          <thead><tr><th class="no-print">Select</th><th>Patient</th><th>Date &amp; Time</th><th>Branch</th><th>Fee</th><th>Patient O/S Due</th><th>Payment Status</th><th>Appointment Status</th><th class="no-print">Actions</th></tr></thead>
          <tbody>${items.map(({id,data:item})=>{
            const payment=paymentStatusDisplay(item.balance);
            const previousDue=balanceDisplay(item.prevDues);
            const status=String(item.status||'Pending');
            const statusClass={Completed:'completed',Reported:'reported',Rescheduled:'rescheduled',Cancelled:'cancelled',Pending:'pending'}[status]||'pending';
            return `<tr>
              <td class="no-print"><input type="checkbox" class="apt-checkbox" value="${esc(id)}" aria-label="Select appointment for ${esc(item.name||'Unnamed patient')}" onchange="window.updateSelectionBar()"></td>
              <td><span class="therapist-report-patient">${esc(item.name||'Unnamed patient')}</span><span class="therapist-report-mobile">${esc(item.mobile||'')}</span></td>
              <td>${esc(attendanceDayInitial(item.date))} · ${esc(window.formatIndianDate(item.date))} · ${esc(formatTime12Hour(item.time))}</td>
              <td>${esc(item.branch||'—')}</td>
              <td>₹${money(item.fee)}</td>
              <td><span class="${previousDue.cls}">${esc(previousDue.text)}</span></td>
              <td><span class="badge payment-status ${payment.cls}">${esc(payment.text)}</span></td>
              <td><span class="badge ${statusClass}">${esc(status)}</span></td>
              <td class="no-print">${actionHTML(id)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </section>
  `).join('');
  content.innerHTML=
    `<p class="therapist-report-meta">${appointments.length} appointments · ${groups.length} therapists</p>${reportGroups}`;
}
function actionHTML(id){
  return `<div class="actions"><button class="act edit" title="Edit Appointment" aria-label="Edit Appointment" onclick="window.editAppointment('${id}')"><span class="material-symbols-rounded">edit</span></button><button class="act inv" title="View Invoice" aria-label="View Invoice" onclick="window.printInvoice('${id}')"><span class="material-symbols-rounded">visibility</span></button></div>`;
}
function renderAppointments(){
  renderTherapistWiseReport(filteredAppointments());
  updateSelectionBar();
}
window.filterTable=renderAppointments;
window.setFilterToday=()=>{const s=todayISO();selectedAppointmentDate=s;document.getElementById('filterDateFrom').value=s;document.getElementById('filterDateTo').value=s;renderAppointmentWeek();return window.loadAppointments()};
window.clearFilters=()=>{document.getElementById('filterStatus').value='';document.getElementById('filterCategory').value='';document.getElementById('filterPayment').value='';if(!window.currentUser||window.currentUser.role==='admin')document.getElementById('filterBranch').value='';document.getElementById('aptSearchInput').value='';return window.setFilterToday()};
window.showFilters=()=>{closeTools();document.getElementById('filtersBar').classList.add('show')};
window.showPendingDues=async()=>{
  if(window.appointmentsLoadPromise)await window.appointmentsLoadPromise;
  document.getElementById('filterDateFrom').value='';
  document.getElementById('filterDateTo').value='';
  document.getElementById('filterStatus').value='';
  document.getElementById('filterCategory').value='';
  document.getElementById('filterPayment').value='pending';
  document.getElementById('aptSearchInput').value='';
  document.getElementById('filtersBar').classList.add('show');
  await window.loadAppointments();
};
window.setSort=m=>{sortMode=m;const select=document.getElementById('aptSortSelect');if(select)select.value=m;renderAppointments();closeTools()};
window.updateSelectionBar=()=>{
  const ids=[...document.querySelectorAll('.apt-checkbox:checked')].map(x=>x.value);document.getElementById('selectedCount').textContent=new Set(ids).size;document.getElementById('bulkBar').classList.toggle('show',ids.length>0);
};
window.clearSelection=()=>{document.querySelectorAll('.apt-checkbox').forEach(x=>x.checked=false);window.updateSelectionBar()};
function selectedIds(){return [...new Set([...document.querySelectorAll('.apt-checkbox:checked')].map(x=>x.value))]}
window.editSelectedAppointment=()=>{
  const ids=selectedIds();closeTools();
  if(ids.length!==1)return alert('Please select exactly one appointment to edit.');
  if(!window.appointmentsDataCache[ids[0]])return alert('Selected appointment data not found. Please reload the appointments.');
  window.editAppointment(ids[0]);
};
window.openSelectedNew=()=>{
  const ids=selectedIds();if(!ids.length)return alert('Please select at least one appointment first.');
  const d=window.appointmentsDataCache[ids[0]];if(!d)return;
  showConfirm('Create New Appointment','Create a new appointment using the first selected appointment as the patient/template?','Continue',()=>{window.editAppointmentData(d,null,true)});
};
window.editAppointmentData=async(d,id=null,isNew=false)=>{
  window.loadPatientsForApt().catch(e=>console.error('Unable to load appointment patient choices:',e));
  const fields={aptDocId:id||'',aptMobile:d.mobile||'',aptName:d.name||'',aptAge:d.age||'',aptGender:d.gender||'',aptCategory:d.category||'Normal',aptLocation:d.location||'',aptPatientNotes:d.patientNotes||'',aptBranch:d.branch||'',aptDate:isNew?todayISO():(d.date||''),aptTime:isNew?'':(d.time||''),aptPreviousDate:d.previousDate||'',aptPreviousTime:d.previousTime||'',aptDuration:d.duration||'',aptSessionsPerDay:d.sessionsPerDay||'',aptTherapist:d.therapist||'',aptStatus:isNew?'Pending':(d.status||'Pending'),aptFee:d.fee??'',aptAdvance:isNew?'':(d.advance??''),aptNotes:d.notes||'',aptPaymentMode:d.paymentMode||'Cash',aptPaymentReference:isNew?'':(d.paymentReference||''),aptPaymentRemarks:isNew?'':(d.paymentRemarks||'')};
  Object.entries(fields).forEach(([k,v])=>document.getElementById(k).value=v);
  document.getElementById('aptPatientSearch').value=d.name||'';document.getElementById('saveAptBtn').textContent=isNew?'Save Appointment':'Update Appointment';document.getElementById('formTitle').textContent=isNew?'New Appointment from Selected':'Edit Appointment';
  let due=0;try{let q=query(collection(db,'appointments'),where('mobile','==',d.mobile));if(window.currentUser&&window.currentUser.role!=='admin')q=query(collection(db,'appointments'),where('mobile','==',d.mobile),where('branch','==',window.currentUser.branch));(await getDocs(q)).forEach(x=>{if(x.id!==id)due+=parseFloat(x.data().balance)||0});document.getElementById('aptPrevDues').value=due.toFixed(2)}catch(e){document.getElementById('aptPrevDues').value='0.00'}window.calcBalance();window.toggleReschedule(document.getElementById('aptStatus'));document.getElementById('aptModal').classList.add('show');
};
window.editAppointment=id=>{const d=window.appointmentsDataCache[id];if(d)window.editAppointmentData(d,id,false)};
window.saveAppointment=async()=>{
  const btn=document.getElementById('saveAptBtn'),id=document.getElementById('aptDocId').value,get=x=>document.getElementById(x).value.trim(),fee=parseFloat(get('aptFee'))||0,advance=parseFloat(get('aptAdvance'))||0,prev=parseFloat(get('aptPrevDues'))||0;
  if(btn.disabled)return;
  let status=get('aptStatus'),date=get('aptDate'),notes=get('aptNotes'),res=get('aptRescheduleDate');const req=['aptMobile','aptName','aptBranch','aptDate','aptTime','aptTherapist','aptCategory'];if(req.some(x=>!get(x)))return alert('Please fill all required (*) fields.');
  const appointmentTime=get('aptTime');if(!/^(0[9]|1\d|20):[0-5]\d$|^21:00$/.test(appointmentTime))return alert('Appointment time must be between 9:00 AM and 9:00 PM.');
  if(status==='Rescheduled'){if(!res)return alert('Please pick a new reschedule date.');notes=notes.replace(/\[Moved from: .*?\]/g,'').trim()+(notes.trim()?'\n':'')+`[Moved from: ${window.formatIndianDate(date)}]`;date=res}
  const payload={mobile:get('aptMobile'),name:get('aptName'),age:get('aptAge'),gender:get('aptGender'),category:get('aptCategory'),location:get('aptLocation'),patientNotes:get('aptPatientNotes'),branch:get('aptBranch'),date,time:appointmentTime,previousDate:get('aptPreviousDate'),previousTime:get('aptPreviousTime'),duration:get('aptDuration'),sessionsPerDay:get('aptSessionsPerDay'),therapist:get('aptTherapist'),status,fee,advance,balance:fee+prev-advance,prevDues:prev,notes,paymentMode:get('aptPaymentMode'),paymentReference:get('aptPaymentReference'),paymentRemarks:get('aptPaymentRemarks'),updatedAt:new Date()};
  btn.disabled=true;btn.textContent='Saving...';
  try{
    const pdata={mobile:payload.mobile,name:payload.name,age:payload.age,gender:payload.gender,category:payload.category,location:payload.location,notes:payload.patientNotes,branch:payload.branch};
    const patientCacheKey=`${payload.branch}:${payload.mobile}`;
    let appointmentId=id;
    if(id){
      const targetId=appointmentDocumentId(payload);
      if(targetId!==id&&(await getDoc(doc(db,'appointments',targetId))).exists()){
        throw new Error('An appointment already exists for this patient, therapist, branch, date, and time.');
      }
      await updateDoc(doc(db,'appointments',id),payload);
    }else{
      payload.createdAt=new Date();
      appointmentId=await createAppointmentIfMissing(payload);
    }
    if(window.patientsForAptLoadPromise){
      try{await window.patientsForAptLoadPromise}
      catch(cacheError){console.warn('Patient cache unavailable; using a focused patient lookup for this save.',cacheError)}
    }
    let patientId=window.allPatientsCacheLoaded
      ?window.allPatientsDocumentIdsByBranch?.[patientCacheKey]
      :null;
    if(!window.allPatientsCacheLoaded){
      const patientQuery=query(collection(db,'patients'),where('mobile','==',payload.mobile),where('branch','==',payload.branch));
      const patientSnapshot=await getDocs(patientQuery);
      patientId=patientSnapshot.docs[0]?.id||null;
    }
    const savedPatientId=patientId||patientDocumentId(payload.branch,payload.mobile);
    await setDoc(doc(db,'patients',savedPatientId),{
      ...(!patientId?{patientId:'P'+Math.floor(Math.random()*90000+10000),createdAt:new Date()}:{}),
      ...pdata
    },{merge:true});
    if(window.allPatientsCacheLoaded){
      window.allPatientsDocumentIdsByBranch[patientCacheKey]=savedPatientId;
      window.allPatientsCache[payload.mobile]=pdata;
      window.allPatientsCacheByBranch[patientCacheKey]=pdata;
    }
    await window.syncTransactions(appointmentId,payload);
    alert(id?'Appointment updated successfully!':'New appointment saved successfully!');
    window.closeAppointmentForm();window.resetAptForm();document.getElementById('filterDateFrom').value=payload.date;document.getElementById('filterDateTo').value=payload.date;invalidateAppointmentsRequestCache();await window.loadAppointments();
  }catch(e){
    console.error('Appointment save failed:',e);
    const isQuotaError=e?.code==='resource-exhausted'||/quota exceeded/i.test(e?.message||'');
    const detail=isQuotaError
      ?'Firebase Firestore quota has been reached. This save now checks only appointments matching the same branch, date, time, therapist, and patient. Check Firebase Console → Firestore → Usage and project quotas; if a limit is exhausted, wait for its reset or enable billing as appropriate.'
      :e?.code==='permission-denied'
        ?'Firestore denied a patient, appointment, or transaction operation. Confirm the latest firestore.rules are deployed and your profile branch matches the appointment branch.'
        :e?.message||'An unexpected error occurred.';
    alert(`Failed to save appointment: ${detail}`);
  }finally{btn.disabled=false;btn.textContent=id?'Update Appointment':'Save Appointment'}
};
window.syncTransactions=async(aptId,payload)=>{
  let linkedQuery=query(collection(db,'transactions'),where('linkedAptId','==',aptId));
  if(window.currentUser&&window.currentUser.role!=='admin'){
    linkedQuery=query(collection(db,'transactions'),where('linkedAptId','==',aptId),where('branch','==',window.currentUser.branch));
  }
  const snapshot=await getDocs(linkedQuery);
  let sale=null,receipt=null,receiptData=null;
  snapshot.forEach(transactionDoc=>{
    const data=transactionDoc.data();
    const type=String(data.type||'').toLowerCase();
    if(type==='sales'&&!sale)sale=transactionDoc.id;
    if(type==='receipt'&&!receipt){receipt=transactionDoc.id;receiptData=data}
  });
  const mode=payload.paymentMode||'Cash';
  const invoiceNo=payload.invoiceNo||`INV-${aptId}`;
  const fee=Number(payload.fee)||0;
  if(sale||fee>0){
    const salePayload={date:payload.date,type:'Sales',mobile:payload.mobile,name:payload.name,mode,ref:'Auto-Bill',invoiceNo,cashIn:0,cashOut:fee,notes:fee>0?'Consultation / Therapy Billed':'Appointment bill voided',linkedAptId:aptId,branch:payload.branch};
    if(sale){
      const current=snapshot.docs.find(item=>item.id===sale).data();
      if(Object.entries(salePayload).some(([key,value])=>current[key]!==value)){
        await updateDoc(doc(db,'transactions',sale),{...salePayload,updatedAt:new Date()});
      }
    }
    else if(fee>0)await setDoc(doc(db,'transactions',`apt_${aptId}_sales`),{...salePayload,txnId:'TRN'+Math.floor(Math.random()*900000+100000),createdAt:new Date(),updatedAt:new Date()},{merge:true});
  }
  const advance=Number(payload.advance)||0;
  if(receipt||advance>0){
    const receiptDate=receiptData&&Number(receiptData.cashIn||0)===advance&&receiptData.date?receiptData.date:todayISO();
    const receiptPayload={date:receiptDate,type:'Receipt',mobile:payload.mobile,name:payload.name,mode,ref:payload.paymentReference||'Auto-Advance',cashIn:advance,cashOut:0,notes:advance>0?(payload.paymentRemarks||'Appointment receipt received today'):'Appointment receipt voided',linkedAptId:aptId,branch:payload.branch};
    if(receipt){
      if(Object.entries(receiptPayload).some(([key,value])=>receiptData[key]!==value)){
        await updateDoc(doc(db,'transactions',receipt),{...receiptPayload,updatedAt:new Date()});
      }
    }
    else if(advance>0)await setDoc(doc(db,'transactions',`apt_${aptId}_receipt`),{...receiptPayload,txnId:'TRN'+Math.floor(Math.random()*900000+100000),createdAt:new Date(),updatedAt:new Date()},{merge:true});
  }
};
window.viewNotes=id=>{const d=window.appointmentsDataCache[id];if(!d)return;document.getElementById('modalPatientName').textContent=d.name||'';document.getElementById('modalPatientMeta').textContent=`Mobile: +91 ${d.mobile||''} | Scheduled: ${window.formatIndianDate(d.date)} ${formatTime12Hour(d.time)} | Doctor: ${d.therapist||'--'}`;let n='';if(d.patientNotes)n+=`[Medical History]\n${d.patientNotes}\n\n`;if(d.notes)n+=`[Diagnosis Report]\n${d.notes}`;document.getElementById('modalPatientNotesText').textContent=n||'No notes recorded for this patient.';document.getElementById('notesModal').classList.add('show')};
window.printModalNotes=()=>{const c=document.getElementById('printNotesArea').innerHTML,w=window.open('','_blank');if(!w)return;w.document.write(`<html><head><title>Patient Report</title></head><body><h2>Patient Report</h2>${c}<script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()};
window.openInvoiceTemplate=async(id,action='view')=>{
  let d=window.appointmentsDataCache[id];
  if(!d){
    try{
      const appointmentSnapshot=await getDoc(doc(db,'appointments',id));
      if(appointmentSnapshot.exists())d=appointmentSnapshot.data();
    }catch(error){
      console.error('Could not load appointment for invoice:',error);
      return alert('Could not load appointment data for this invoice. Check your database access.');
    }
  }
  if(!d)return alert('Appointment data not found.');
  const diagnosisNotes=[d.diagnosis,d.notes].filter((value,index,array)=>value&&array.indexOf(value)===index).join('\n');
  let invoiceData={...d,invoiceNo:d.invoiceNo||`INV-${id}`,billDate:new Date().toISOString()};
  let invoiceLinkError='',patientLinkError='';
  if(d.mobile){
    try{
      let patientQuery=query(collection(db,'patients'),where('mobile','==',d.mobile));
      if(window.currentUser&&window.currentUser.role!=='admin'){
        patientQuery=query(
          collection(db,'patients'),
          where('mobile','==',d.mobile),
          where('branch','==',window.currentUser.branch)
        );
      }else if(d.branch){
        patientQuery=query(
          collection(db,'patients'),
          where('mobile','==',d.mobile),
          where('branch','==',d.branch)
        );
      }
      let patientSnapshot=await getDocs(patientQuery);
      if(patientSnapshot.empty&&window.currentUser?.role==='admin'&&d.branch){
        patientSnapshot=await getDocs(query(collection(db,'patients'),where('mobile','==',d.mobile)));
      }
      const patient=patientSnapshot.docs[0]?.data();
      if(patient){
        invoiceData={
          ...invoiceData,
          patientId:patient.patientId||invoiceData.patientId,
          name:patient.name||invoiceData.name,
          age:patient.age||invoiceData.age,
          gender:patient.gender||invoiceData.gender,
          category:patient.category||invoiceData.category,
          mobile:patient.mobile||invoiceData.mobile,
          email:patient.email||invoiceData.email,
          address:patient.address||patient.location||invoiceData.address||invoiceData.location,
          location:patient.address||patient.location||invoiceData.location||invoiceData.address,
          patientNotes:invoiceData.patientNotes||patient.notes
        };
      }else{
        patientLinkError='Patient profile was not found. Invoice uses appointment details.';
      }
    }catch(error){
      console.error('Could not link patient profile to invoice:',error);
      patientLinkError='Patient profile details could not be linked. Invoice uses appointment details.';
    }
  }else{
    patientLinkError='Patient mobile number is missing; patient profile could not be linked.';
  }
  try{
    let linkedQuery=query(collection(db,'transactions'),where('linkedAptId','==',id));
    if(window.currentUser&&window.currentUser.role!=='admin'){
      linkedQuery=query(collection(db,'transactions'),where('linkedAptId','==',id),where('branch','==',window.currentUser.branch));
    }
    const linkedSnapshot=await getDocs(linkedQuery);
    let billed=0,advance=0,hasSales=false,hasReceipts=false;
    linkedSnapshot.forEach(transactionDoc=>{
      const transaction=transactionDoc.data();
      const type=String(transaction.type||'').toLowerCase();
      if(type==='sales'){
        hasSales=true;
        billed+=Number(transaction.cashOut)||0;
        invoiceData.invoiceNo=transaction.invoiceNo||invoiceData.invoiceNo;
        invoiceData.billDate=transaction.date||invoiceData.billDate;
      }else if(type==='receipt'){
        hasReceipts=true;
        advance+=Number(transaction.cashIn)||0;
      }
    });
    invoiceData.fee=hasSales?billed:Number(d.fee??d.totalFee)||0;
    invoiceData.advance=hasReceipts?advance:Number(d.advance)||0;
  }catch(error){
    console.error('Unable to load linked sales and receipt records for invoice:',error);
    invoiceLinkError='Sales and receipt details could not be loaded. Invoice uses appointment amounts.';
  }
  const payload={
    appointment:{
      ...invoiceData,
      id,
      appointmentId:id,
      serviceName:d.serviceName||d.service||d.duration||'Therapy Session',
      diagnosis:diagnosisNotes,
      invoiceNotes:[diagnosisNotes,d.patientNotes].filter(Boolean).join('\n\n')
    },
    company:{},
    companyProfileError:false,
    invoiceLinkError,
    patientLinkError
  };
  try{
    const snap=await getDoc(doc(db,'settings','company_profile'));
    if(snap.exists())payload.company=snap.data();
    else payload.companyProfileError='Company profile was not found.';
  }catch(e){
    console.error('Unable to load company profile for invoice:',e);
    payload.companyProfileError='Invoice opened, but company profile details could not be loaded. Check Firestore permissions.';
  }
  const invoiceFrame=document.getElementById('invoice-frame');
  if(!invoiceFrame)return alert('Invoice template is unavailable. Please reload the dashboard and try again.');
  window.pendingInvoicePayload=null;
  let payloadStored=false;
  try{
    const invoiceUrl=new URL('../../templates/template-invoice/template-invoice.html', import.meta.url);
    invoiceUrl.searchParams.set('invoiceRequest',`${Date.now()}`);
    if(action==='download')invoiceUrl.searchParams.set('action','download');
    sessionStorage.setItem('bizodit.invoicePayload',JSON.stringify(payload));
    invoiceFrame.dataset.ready='false';
    invoiceFrame.src=invoiceUrl.href;
    payloadStored=true;
  }catch(error){
    console.error('Could not prepare invoice data for the template:',error);
    try{sessionStorage.removeItem('bizodit.invoicePayload')}catch(storageError){console.error('Could not clear unsent invoice data:',storageError)}
    window.pendingInvoicePayload={payload,action};
  }
  window.switchView('view-invoice',null);
  if(!payloadStored)window.dispatchInvoicePayload();
};
window.printInvoice=id=>window.openInvoiceTemplate(id);
window.downloadInvoice=id=>window.openInvoiceTemplate(id,'download');
window.sendInvoiceWhatsApp=id=>{
  const d=window.appointmentsDataCache[id];if(!d)return alert('Appointment data not found.');
  let phone=String(d.mobile||'').replace(/\D/g,'');
  if(phone.length===11&&phone.startsWith('0'))phone=phone.slice(1);
  if(phone.length===10)phone='91'+phone;
  if(!/^91\d{10}$/.test(phone))return alert('Patient mobile number must be a valid 10-digit Indian number.');
  const amount=money(d.fee),paid=money(d.advance),balance=balanceDisplay(d.balance).text;
  const message=`Hello ${d.name||''}, here are your invoice details (Invoice INV-${id}):\nAppointment: ${window.formatIndianDate(d.date)} ${formatTime12Hour(d.time)}\nService: ${d.duration||'Therapy session'}\nFee: ${displayMoney(amount)}\nAdvance paid: ${displayMoney(paid)}\nBalance: ${balance}`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank','noopener');
};
window.executeBulkDelete=async()=>{
  const ids=selectedIds();if(!ids.length)return alert('Please select appointments to delete.');for(const id of ids){const d=window.appointmentsDataCache[id];if(d&&d.status!=='Pending'&&d.status!=='Cancelled')return alert('You can only bulk delete Pending or Cancelled appointments.')}
  showConfirm('Delete Appointments',`Permanently delete ${ids.length} selected appointment${ids.length>1?'s':''}?`,'Delete',async()=>{try{for(const id of ids)await deleteDoc(doc(db,'appointments',id));alert('Selected appointments deleted.');invalidateAppointmentsRequestCache();await window.setFilterToday()}catch(e){console.error(e);alert('Error deleting appointments.')}})
};
window.showBulkDate=()=>{if(!selectedIds().length)return alert('Please select appointments first.');document.getElementById('bulkDateArea').style.display='inline-flex'};
window.confirmBulkCopy=async()=>{
  const nd=document.getElementById('bulkDateInput').value,ids=selectedIds();if(!nd)return alert('Please select a date.');
  if(!ids.length)return alert('Please select appointments first.');
  showConfirm('Copy Selected Appointments',`Create ${ids.length} new Pending appointment${ids.length>1?'s':''} on ${window.formatIndianDate(nd)}? The original records will remain unchanged.`,'Copy',async()=>{
    const failures=[];let copied=0;
    for(const id of ids){
      const d=window.appointmentsDataCache[id];
      if(!d){failures.push('Selected appointment data is no longer available. Reload the appointments and try again.');continue}
      try{
        let notes=String(d.notes||'').replace(/\[Copied from: .*?\]/g,'').trim();
        notes+=(notes?'\n':'')+`[Copied from: ${window.formatIndianDate(d.date)}]`;
        await createAppointmentIfMissing(
          {...d,date:nd,status:'Pending',notes,createdAt:new Date(),updatedAt:new Date()},
          {checkLegacyDuplicates:false}
        );
        copied++;
      }catch(error){
        console.error(`Could not copy appointment ${id}:`,error);
        failures.push(`${d.name||d.mobile||id}: ${error?.message||'Unknown error'}`);
      }
    }
    document.getElementById('bulkDateArea').style.display='none';
    document.getElementById('bulkDateInput').value='';
    if(copied){
      window.clearSelection();
      invalidateAppointmentsRequestCache();
      try{await window.setFilterToday()}
      catch(error){console.error('Appointments were copied, but the list could not be refreshed:',error);alert('The appointments were copied, but the list could not be refreshed. Reload the page to see them.')}
    }
    if(failures.length){
      alert(`Copied: ${copied}\nFailed: ${failures.length}\n\n${failures.slice(0,10).join('\n')}${failures.length>10?'\nMore errors are in the browser console.':''}`);
      if(!copied)window.clearSelection();
      return;
    }
    alert(`${copied} appointment${copied===1?'':'s'} copied to ${window.formatIndianDate(nd)}.`);
  })
};
window.executeBulkCopy=()=>window.showBulkDate();
window.confirmBulkReschedule=window.confirmBulkCopy;
window.executeBulkReschedule=window.executeBulkCopy;
function showConfirm(title,message,ok,fn){document.getElementById('confirmTitle').textContent=title;document.getElementById('confirmMessage').textContent=message;document.getElementById('confirmOk').textContent=ok;confirmHandler=fn;document.getElementById('confirmModal').classList.add('show');document.getElementById('confirmOk').onclick=async()=>{const f=confirmHandler;window.closeModal('confirmModal');confirmHandler=null;if(f)await f()}}

const CSV_HEADERS=['mobile','name','age','gender','category','location','patientNotes','branch','date','time','previousDate','previousTime','duration','sessionsPerDay','therapist','status','fee','advance','prevDues','notes','paymentMode','paymentReference','paymentRemarks'];
function csvCell(v){const s=String(v??'');return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
window.downloadAppointmentSampleCSV=()=>{const row=['9744902555','Sample Patient','40','Male','Normal','','Medical/admin notes','Branch Name',todayISO(),'10:30','','','30 minutes','1','Therapist Name','Pending','1000','500','0','Appointment notes','UPI','REFERENCE123',''];const blob=new Blob([[CSV_HEADERS,row].map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='appointments-sample.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
function parseCSV(text){const rows=[];let row=[],cell='',q=false;text=String(text||'').replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}else{if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else if(c!=='\r')cell+=c}}if(cell!==''||row.length){row.push(cell);rows.push(row)}return rows.filter(r=>r.some(v=>String(v).trim()!==''))}
const norm=v=>String(v||'').trim().toLowerCase().replace(/[\s_\-\/]+/g,'');
window.importAppointmentsCSV=async file=>{
  if(!file)return;try{const rows=parseCSV(await file.text());if(rows.length<2)throw Error('CSV contains no appointment rows.');const hm={};rows[0].forEach((h,i)=>hm[norm(h)]=i);const req=['mobile','name','branch','date','time','therapist'];const miss=req.filter(k=>hm[norm(k)]===undefined);if(miss.length)throw Error('Missing required columns: '+miss.join(', '));
    let ok=0,fail=[];
    for(let ri=1;ri<rows.length;ri++){
      try{
        const r={};
        CSV_HEADERS.forEach(k=>r[k]=hm[norm(k)]===undefined?'':String(rows[ri][hm[norm(k)]]??'').trim());
        const mobile=r.mobile.replace(/\D/g,'');
        if(!/^\d{10}$/.test(mobile))throw Error('Mobile must be 10 digits');
        if(!r.name||!r.branch||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!/^(0[9]|1\d|20):[0-5]\d$|^21:00$/.test(r.time)||!r.therapist)throw Error('Required value missing or invalid date/time (time must be 9:00 AM–9:00 PM)');
        if(!window.currentUser||window.currentUser.role!=='admin'){if(r.branch!==window.currentUser.branch)throw Error('Branch mismatch')}
        const fee=parseFloat(r.fee)||0,adv=parseFloat(r.advance)||0,prev=parseFloat(r.prevDues)||0;
        const payload={mobile,name:r.name,age:r.age,gender:r.gender,category:r.category||'Normal',location:r.location,patientNotes:r.patientNotes,branch:r.branch,date:r.date,time:r.time,previousDate:r.previousDate,previousTime:r.previousTime,duration:r.duration,sessionsPerDay:r.sessionsPerDay,therapist:r.therapist,status:r.status||'Pending',fee,advance:adv,balance:fee+prev-adv,prevDues:prev,notes:r.notes,paymentMode:r.paymentMode||'Cash',paymentReference:r.paymentReference,paymentRemarks:r.paymentRemarks,createdAt:new Date(),updatedAt:new Date()};
        const patientQuery=query(collection(db,'patients'),where('mobile','==',mobile),where('branch','==',r.branch));
        const patientSnapshot=await getDocs(patientQuery);
        const patientData={mobile,name:r.name,age:r.age,gender:r.gender,category:payload.category,location:r.location,notes:r.patientNotes,branch:r.branch};
        if(patientSnapshot.empty){
          await setDoc(doc(db,'patients',patientDocumentId(r.branch,mobile)),{patientId:'P'+Math.floor(Math.random()*90000+10000),...patientData,createdAt:new Date()},{merge:true});
        }else{
          await updateDoc(doc(db,'patients',patientSnapshot.docs[0].id),patientData);
        }
        const appointmentId=await createAppointmentIfMissing(payload);
        try{await window.syncTransactions(appointmentId,payload)}catch(tx){console.error(tx)}
        ok++;
      }catch(e){fail.push(`Row ${ri+1}: ${e.message}`)}
    }
    alert(`CSV import complete.\n\nImported: ${ok}\nFailed: ${fail.length}${fail.length?'\n\n'+fail.slice(0,15).join('\n'):''}`);
    if(ok){invalidateAppointmentsRequestCache();await window.setFilterToday()}
  }catch(e){console.error(e);alert('CSV import failed: '+e.message)}finally{document.getElementById('aptCsvInput').value=''}};
window.exportAppointmentsCSV=()=>{const list=filteredAppointments();const rows=[CSV_HEADERS,...list.map(x=>{const d=x.data;return CSV_HEADERS.map(k=>d[k]??'')})];const csv=rows.map(r=>r.map(csvCell).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`appointments-${todayISO()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
window.exportAptPDF=()=>window.print();
window.openBulkReschedule=window.executeBulkReschedule;

document.getElementById('aptModal').addEventListener('click',e=>{if(e.target.id==='aptModal')window.closeAppointmentForm()});
document.getElementById('notesModal').addEventListener('click',e=>{if(e.target.id==='notesModal')window.closeModal('notesModal')});
document.getElementById('confirmModal').addEventListener('click',e=>{if(e.target.id==='confirmModal')window.closeModal('confirmModal')});
