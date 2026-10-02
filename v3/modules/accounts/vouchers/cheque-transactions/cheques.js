import { createRecord, getCompany, issueCheque, listRecords, updateRecord } from "../../../../js/firebase-service.js?v=6";

const el=id=>document.getElementById(id);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
const STATUS_OPTIONS=["Issued","Deposited","Cleared","Bounced","Voided"];
const numberLabel=(value,currency)=>{
  try{return new Intl.NumberFormat(undefined,{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);}
  catch{return `${currency} ${Number(value||0).toFixed(2)}`;}
};

function padChequeNumber(value,width){return String(value??"").padStart(Number(width)||0,"0");}

export async function init(){
  const root=document.querySelector("#moduleContainer .cheque-page");
  if(!root) return;
  const [bankResult,bookResult,chequeResult,companyResult]=await Promise.allSettled([listRecords("ledger"),listRecords("checkbooks"),listRecords("cheques"),getCompany()]);
  const currency=String(companyResult.status==="fulfilled"?companyResult.value?.cmp_currency||"INR":"INR").toUpperCase();
  const ledgers=bankResult.status==="fulfilled"?bankResult.value:[];
  const banks=ledgers.filter(bank=>bank.accountType==="Bank"&&!bank.systemDefault&&(bank.bankName||bank.accountNumber||bank.ifsc));
  let checkbooks=bookResult.status==="fulfilled"?bookResult.value:[];
  let cheques=chequeResult.status==="fulfilled"?chequeResult.value:[];
  function addChequeIssueFields(){
  root.querySelector("#registerPanel thead tr").innerHTML="<th>Cheque</th><th>Payee / Purpose</th><th>Bank</th><th>Transaction date</th><th>Cheque date</th><th>Amount</th><th>Status</th>";
  const issueDateGroup=el("issueChequeDate").closest(".form-group");
  const issueGrid=issueDateGroup.parentElement;
  issueDateGroup.querySelector("label").textContent="Cheque Date";
  const payeeInput=el("issuePayee");
  const payeeSelect=document.createElement("select");
  payeeSelect.className=payeeInput.className;
  payeeSelect.id="issuePayee";
  payeeSelect.required=true;
  payeeSelect.setAttribute("aria-label","Party ledger");
  payeeSelect.innerHTML=`<option value="">Select party ledger</option>${ledgers.map(ledger=>`<option value="${escapeHtml(ledger.id)}">${escapeHtml(ledger.name||ledger.id)}${ledger.accountGroup?` · ${escapeHtml(ledger.accountGroup)}`:""}</option>`).join("")}`;
  payeeInput.replaceWith(payeeSelect);
  issueGrid.querySelector('label[for="issuePayee"]').textContent="Party Ledger";
  const transactionDateGroup=document.createElement("div");
  transactionDateGroup.className="form-group";
  transactionDateGroup.innerHTML='<label for="issueTransactionDate">Transaction Date</label><input class="form-control" id="issueTransactionDate" type="date" required>';
  issueGrid.insertBefore(transactionDateGroup,issueDateGroup);
  const purposeGroup=document.createElement("div");
  purposeGroup.className="form-group";
  purposeGroup.innerHTML='<label for="issueChequePurpose">Purpose</label><select class="form-control" id="issueChequePurpose" required><option value="">Select purpose</option><option>Expenses</option><option>Vendors Payment</option><option>Bank Deposits</option><option>Others</option></select>';
  issueGrid.insertBefore(purposeGroup,issueDateGroup);
  const purposeCommentGroup=document.createElement("div");
  purposeCommentGroup.className="form-group cheque-purpose-comment";
  purposeCommentGroup.hidden=true;
  purposeCommentGroup.innerHTML='<label for="issuePurposeComment">Comment</label><textarea class="form-control" id="issuePurposeComment" rows="2" maxlength="240" placeholder="Add a comment for this cheque"></textarea>';
  issueGrid.insertBefore(purposeCommentGroup,issueDateGroup);
  el("issueChequePurpose").addEventListener("change",()=>{purposeCommentGroup.hidden=el("issueChequePurpose").value!=="Others";el("issuePurposeComment").required=!purposeCommentGroup.hidden;});
  }
  root.innerHTML=`<header class="page-header"><div class="page-title"><div class="page-title-icon"><span class="material-symbols-rounded">payments</span></div><div><h1>Cheque Register</h1><p>Set up bank checkbooks, then issue and track every cheque.</p></div></div><button class="btn btn-outline" id="chequeRefresh" type="button"><span class="material-symbols-rounded">refresh</span><span>Refresh</span></button></header><div class="cheque-tabs" role="tablist" aria-label="Cheque workflow"><button class="cheque-tab is-active" id="checkbookTab" type="button" role="tab" aria-selected="true" aria-controls="checkbookPanel">1. Set up checkbooks</button><button class="cheque-tab" id="registerTab" type="button" role="tab" aria-selected="false" aria-controls="registerPanel" ${checkbooks.length?"":"disabled"}>2. Track cheques</button></div><section class="cheque-panel" id="checkbookPanel" role="tabpanel" aria-labelledby="checkbookTab"><div class="cheque-panel-heading"><div><h2>Checkbook setup</h2><p>Choose the bank account and enter the cheque number range.</p></div></div><div class="cheque-setup-layout"><form class="cheque-form" id="checkbookForm"><div class="cheque-form-grid"><div class="form-group"><label for="checkbookName">Checkbook name</label><input class="form-control" id="checkbookName" required maxlength="80" placeholder="Main current account"></div><div class="form-group"><label for="checkbookBank">Bank account</label><select class="form-control" id="checkbookBank" required><option value="">Select bank account</option>${banks.map(bank=>`<option value="${escapeHtml(bank.id)}">${escapeHtml(bank.bankName||bank.name||"Bank")}${bank.accountNumber?` •••• ${escapeHtml(String(bank.accountNumber).slice(-4))}`:""}</option>`).join("")}</select></div><div class="form-group"><label for="checkbookFirst">First cheque number</label><input class="form-control" id="checkbookFirst" type="text" inputmode="numeric" pattern="[0-9]+" required placeholder="000001"></div><div class="form-group"><label for="checkbookLast">Last cheque number</label><input class="form-control" id="checkbookLast" type="text" inputmode="numeric" pattern="[0-9]+" required placeholder="000100"></div><div class="form-group"><label for="checkbookNotes">Notes</label><input class="form-control" id="checkbookNotes" maxlength="160" placeholder="Optional"></div></div><p class="cheque-feedback" id="checkbookFeedback" role="status" hidden></p><button class="btn btn-primary" id="saveCheckbook" type="submit"><span class="material-symbols-rounded">add</span><span>Add checkbook</span></button></form><section class="cheque-books-section"><h3>Saved checkbooks</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Checkbook</th><th>Bank</th><th>Range</th><th>Next cheque</th></tr></thead><tbody id="checkbookRows"></tbody></table></div></section></div></section><section class="cheque-panel" id="registerPanel" role="tabpanel" aria-labelledby="registerTab" hidden><div class="cheque-panel-heading"><div><h2>Cheque tracking</h2><p>Issue from the next available number, then update its status as it moves.</p></div></div><div class="cheque-register-layout"><form class="cheque-form" id="issueChequeForm"><h3>Issue a cheque</h3><div class="cheque-form-grid"><div class="form-group span-2"><label for="issueCheckbook">Checkbook</label><select class="form-control" id="issueCheckbook" required><option value="">Select checkbook</option>${checkbooks.map(book=>`<option value="${escapeHtml(book.id)}">${escapeHtml(book.name)} · ${escapeHtml(book.bankName)}</option>`).join("")}</select></div><div class="form-group"><label for="issueChequeNumber">Next cheque number</label><input class="form-control" id="issueChequeNumber" type="text" readonly></div><div class="form-group"><label for="issueChequeDate">Issue date</label><input class="form-control" id="issueChequeDate" type="date" required></div><div class="form-group span-2"><label for="issuePayee">Payee</label><input class="form-control" id="issuePayee" required maxlength="120"></div><div class="form-group"><label for="issueAmount">Amount</label><input class="form-control" id="issueAmount" type="number" min="0.01" step="any" required></div><div class="form-group span-2"><label for="issueNotes">Notes</label><input class="form-control" id="issueNotes" maxlength="160"></div></div><p class="cheque-feedback" id="issueFeedback" role="status" hidden></p><button class="btn btn-primary" type="submit"><span class="material-symbols-rounded">add</span><span>Issue cheque</span></button></form><section class="cheque-register"><div class="cheque-register-toolbar"><h3>Cheque history</h3><div><select class="form-control" id="chequeBookFilter" aria-label="Filter by checkbook"><option value="">All checkbooks</option>${checkbooks.map(book=>`<option value="${escapeHtml(book.id)}">${escapeHtml(book.name)}</option>`).join("")}</select><select class="form-control" id="chequeStatusFilter" aria-label="Filter by status"><option value="">All statuses</option>${STATUS_OPTIONS.map(status=>`<option>${status}</option>`).join("")}</select></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Cheque no.</th><th>Payee</th><th>Bank / book</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody id="chequeRows"></tbody></table></div></section></div></section>`;

  addChequeIssueFields();

  function renderCheckbooks(){
    const selectedCheckbookId=el("issueCheckbook").value;
    el("checkbookRows").innerHTML=checkbooks.length?checkbooks.map(book=>`<tr><td>${escapeHtml(book.name)}</td><td>${escapeHtml(book.bankName)}</td><td>${escapeHtml(padChequeNumber(book.firstChequeNo,book.chequeNumberWidth))}–${escapeHtml(padChequeNumber(book.lastChequeNo,book.chequeNumberWidth))}</td><td>${Number(book.nextChequeNo)<=Number(book.lastChequeNo)?escapeHtml(padChequeNumber(book.nextChequeNo,book.chequeNumberWidth)):"Complete"}</td></tr>`).join(""):`<tr><td colspan="4"><div class="empty"><p>${banks.length?"No checkbooks set up yet.":"Add a Bank account in Ledger before setting up a checkbook."}</p></div></td></tr>`;
    el("registerTab").disabled=!checkbooks.length;
    const options=checkbooks.map(book=>`<option value="${escapeHtml(book.id)}">${escapeHtml(book.name)} · ${escapeHtml(book.bankName)}</option>`).join("");
    el("issueCheckbook").innerHTML=`<option value="">Select checkbook</option>${options}`;
    el("issueCheckbook").value=checkbooks.some(book=>book.id===selectedCheckbookId)?selectedCheckbookId:(checkbooks[0]?.id||"");
    el("chequeBookFilter").innerHTML=`<option value="">All checkbooks</option>${checkbooks.map(book=>`<option value="${escapeHtml(book.id)}">${escapeHtml(book.name)}</option>`).join("")}`;
    updateNextCheque();
  }

  function renderCheques(){
    const bookFilter=el("chequeBookFilter").value;
    const statusFilter=el("chequeStatusFilter").value;
    const visible=cheques.filter(cheque=>(!bookFilter||cheque.checkbookId===bookFilter)&&(!statusFilter||cheque.status===statusFilter)).sort((left,right)=>String(right.issueDate||"").localeCompare(String(left.issueDate||"")));
    el("chequeRows").innerHTML=visible.length?visible.map(cheque=>`<tr><td><strong>${escapeHtml(cheque.chequeNumber)}</strong><small>${escapeHtml(cheque.documentNo||"")}</small></td><td>${escapeHtml(cheque.payee)}<small>${escapeHtml(cheque.purpose||"Cheque")}${cheque.purposeComment?` · ${escapeHtml(cheque.purposeComment)}`:""}</small></td><td>${escapeHtml(cheque.bankName)}<small>${escapeHtml(cheque.checkbookName)}</small></td><td>${escapeHtml(cheque.transactionDate||cheque.issueDate||"--")}</td><td>${escapeHtml(cheque.chequeDate||cheque.issueDate||"--")}</td><td>${escapeHtml(numberLabel(cheque.amount,currency))}</td><td><select class="form-control cheque-status" data-cheque-status="${escapeHtml(cheque.id)}" aria-label="Update status for cheque ${escapeHtml(cheque.chequeNumber)}">${STATUS_OPTIONS.map(status=>`<option${status===cheque.status?" selected":""}>${status}</option>`).join("")}</select></td></tr>`).join(""):`<tr><td colspan="7"><div class="empty"><p>${cheques.length?"No cheques match this filter.":"No issued cheques yet."}</p></div></td></tr>`;
    el("chequeRows").querySelectorAll("[data-cheque-status]").forEach(select=>select.addEventListener("change",async()=>{
      select.disabled=true;
      try{
        await updateRecord("cheques",select.dataset.chequeStatus,{status:select.value});
        const cheque=cheques.find(item=>item.id===select.dataset.chequeStatus);
        if(cheque) cheque.status=select.value;
        window.showToast?.("Cheque status updated.");
      }catch(error){
        window.showToast?.(error.message||"Could not update cheque status.");
        await refreshCheques();
      }finally{select.disabled=false;}
    }));
  }

  function updateNextCheque(){
    const book=checkbooks.find(item=>item.id===el("issueCheckbook").value);
    const number=book&&Number(book.nextChequeNo)<=Number(book.lastChequeNo)?padChequeNumber(book.nextChequeNo,book.chequeNumberWidth):"";
    el("issueChequeNumber").value=number||(book?"Checkbook complete":"Select checkbook");
    el("issueChequeForm").querySelector('[type="submit"]').disabled=!book||!number;
  }

  async function refreshCheques(){
    try{cheques=await listRecords("cheques");renderCheques();}
    catch(error){el("issueFeedback").textContent=error.message||"Could not load cheque history.";el("issueFeedback").hidden=false;}
  }

  function showPanel(panelName){
    const register=panelName==="register";
    el("checkbookPanel").hidden=register;
    el("registerPanel").hidden=!register;
    el("checkbookTab").classList.toggle("is-active",!register);
    el("registerTab").classList.toggle("is-active",register);
    el("checkbookTab").setAttribute("aria-selected",String(!register));
    el("registerTab").setAttribute("aria-selected",String(register));
  }

  el("checkbookForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const feedback=el("checkbookFeedback");
    const firstRaw=el("checkbookFirst").value.trim();
    const lastRaw=el("checkbookLast").value.trim();
    const first=Number(firstRaw);
    const last=Number(lastRaw);
    if(firstRaw.length>18||lastRaw.length>18||!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first<0||last<first){
      feedback.textContent="Enter a valid cheque range; the last number must be greater than or equal to the first.";
      feedback.hidden=false;
      return;
    }
    const bank=banks.find(item=>item.id===el("checkbookBank").value);
    if(!bank){feedback.textContent="Select a Bank ledger account first.";feedback.hidden=false;return;}
    const button=el("saveCheckbook");
    button.disabled=true;
    feedback.hidden=true;
    try{
      const data={name:el("checkbookName").value.trim(),bankId:bank.id,bankName:bank.bankName||bank.name,accountNumberLast4:String(bank.accountNumber||"").slice(-4),firstChequeNo:firstRaw,lastChequeNo:lastRaw,nextChequeNo:first,chequeNumberWidth:firstRaw.length,notes:el("checkbookNotes").value.trim()};
      const id=await createRecord("checkbooks",data);
      checkbooks=await listRecords("checkbooks");
      renderCheckbooks();
      el("checkbookForm").reset();
      el("checkbookFirst").value="";
      el("checkbookLast").value="";
      el("issueCheckbook").value=id;
      updateNextCheque();
      showPanel("register");
      window.showToast?.("Checkbook set up.");
    }catch(error){feedback.textContent=error.message||"Could not set up checkbook.";feedback.hidden=false;}
    finally{button.disabled=false;}
  });

  el("issueCheckbook").addEventListener("change",updateNextCheque);
  el("checkbookTab").addEventListener("click",()=>showPanel("checkbooks"));
  el("registerTab").addEventListener("click",()=>{if(checkbooks.length)showPanel("register");});
  el("chequeBookFilter").addEventListener("change",renderCheques);
  el("chequeStatusFilter").addEventListener("change",renderCheques);
  el("chequeRefresh").addEventListener("click",async()=>{
    const [bookResult,chequeResult]=await Promise.allSettled([listRecords("checkbooks"),listRecords("cheques")]);
    if(bookResult.status==="fulfilled") checkbooks=bookResult.value;
    if(chequeResult.status==="fulfilled") cheques=chequeResult.value;
    renderCheckbooks();
    renderCheques();
  });
  el("issueChequeForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const book=checkbooks.find(item=>item.id===el("issueCheckbook").value);
    if(!book){window.showToast?.("Set up and select a checkbook first.");return;}
    const button=el("issueChequeForm").querySelector('[type="submit"]');
    button.disabled=true;
    el("issueFeedback").hidden=true;
    try{
      const payeeLedger=ledgers.find(ledger=>ledger.id===el("issuePayee").value);
      if(!payeeLedger) throw new Error("Select a party ledger for this cheque.");
      const chequeDate=el("issueChequeDate").value;
      const issued=await issueCheque(book.id,{payee:payeeLedger.name,payeeLedgerId:payeeLedger.id,transactionDate:el("issueTransactionDate").value,chequeDate,issueDate:chequeDate,purpose:el("issueChequePurpose").value,purposeComment:el("issuePurposeComment").value.trim(),amount:Number(el("issueAmount").value),currency,notes:el("issueNotes").value.trim()});
      const [bookResult,chequeResult]=await Promise.all([listRecords("checkbooks"),listRecords("cheques")]);
      checkbooks=bookResult;
      cheques=chequeResult;
      renderCheckbooks();
      renderCheques();
      el("issuePayee").value="";
      el("issueAmount").value="";
      el("issueNotes").value="";
      el("issueChequePurpose").value="";
      el("issuePurposeComment").value="";
      el("issuePurposeComment").closest(".form-group").hidden=true;
      el("issuePurposeComment").required=false;
      el("issueTransactionDate").value=new Date().toISOString().slice(0,10);
      el("issueChequeDate").value=new Date().toISOString().slice(0,10);
      window.showToast?.(`Cheque ${issued.chequeNumber} issued.`);
    }catch(error){
      el("issueFeedback").textContent=error.message||"Could not issue cheque.";
      el("issueFeedback").hidden=false;
    }finally{button.disabled=false;updateNextCheque();}
  });

  el("issueTransactionDate").value=new Date().toISOString().slice(0,10);
  el("issueChequeDate").value=new Date().toISOString().slice(0,10);
  renderCheckbooks();
  renderCheques();
}
