import { getCompany, listRecords } from "../../../js/firebase-service.js?v=7";

const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[char]));
const TYPES=["Cheque Voucher","Payment Voucher","Receipt Voucher","Estimate Voucher","Payroll Voucher"];

function formatMoney(value,currency){
  try{return new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(Number(value)||0);}
  catch{return `${currency} ${Number(value||0).toFixed(2)}`;}
}
function dateLabel(value){
  if(!value) return "--";
  const date=typeof value.toDate==="function"?value.toDate():new Date(value);
  return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(date);
}
function companyAddress(company){
  return [company.cmp_addr1,company.cmp_addr2,company.cmp_city,company.cmp_state,company.cmp_pin,company.cmp_country].filter(Boolean).join(", ");
}

export async function init(){
  const root=document.querySelector("#moduleContainer #voucherTemplatePage");
  if(!root) return;
  const typeSelect=root.querySelector("#voucherTemplateType");
  const recordSelect=root.querySelector("#voucherTemplateRecord");
  const preview=root.querySelector("#voucherTemplatePreview");
  const feedback=root.querySelector("#voucherTemplateFeedback");
  let company={};
  let records=[];
  let clients=[];
  let staff=[];
  let ledgers=[];
  let chequeBooks=[];
  let currency="INR";

  function recordsFor(type){
    if(type==="Cheque Voucher") return records.cheques.map(record=>({record,source:"cheques",label:`${record.documentNo||record.chequeNumber||"Cheque"} · ${record.payee||""} · ${record.chequeDate||record.issueDate||""}`}));
    if(type==="Payment Voucher") return [
      ...records.transactions.filter(record=>["Payment Voucher","Supplier Advance","Salary Payment"].includes(record.voucherType||record.type)).map(record=>({record,source:"transactions",label:`${record.documentNo||record.voucherType} · ${record.partyName||record.details?.party||""} · ${record.date||""}`})),
      ...records.payments.map(record=>({record,source:"payments",label:`${record.documentNo||"Payment"} · ${record.party||""} · ${record.date||""}`}))
    ];
    if(type==="Receipt Voucher") return records.transactions.filter(record=>["Receipt Voucher","Customer Advance"].includes(record.voucherType||record.type)).map(record=>({record,source:"transactions",label:`${record.documentNo||record.voucherType} · ${record.partyName||""} · ${record.date||""}`}));
    if(type==="Estimate Voucher") return records.transactions.filter(record=>["Estimate / Quotation","Estimate Voucher"].includes(record.voucherType||record.type)).map(record=>({record,source:"transactions",label:`${record.documentNo||"Estimate"} · ${record.partyName||""} · ${record.date||""}`}));
    return records.transactions.filter(record=>["Salary Journal","Salary Payment"].includes(record.voucherType||record.type)).map(record=>({record,source:"transactions",label:`${record.documentNo||record.voucherType} · ${record.details?.salaryMonth||record.date||""}`}));
  }
  function selectedEntry(){return recordsFor(typeSelect.value).find(entry=>`${entry.source}:${entry.record.id}`===recordSelect.value)||null;}
  function partyFor(record){
    const id=record.clientId||record.customerId;
    return clients.find(client=>client.id===id)||clients.find(client=>client.name===(record.partyName||record.customer||record.party))||staff.find(person=>person.id===record.employeeId||person.name===record.partyName)||null;
  }
  function ledgerFor(id){return ledgers.find(ledger=>ledger.id===id)||null;}
  function setSourceButton(source){
    const routes={cheques:"cheques",payments:"payments",transactions:"all-vouchers"};
    root.querySelector("#voucherTemplateSource").dataset.module=routes[source]||"transactions";
  }
  function documentHtml(type,record){
    const template=company.invoiceTemplate||{};
    const accent=/^#[0-9a-f]{6}$/i.test(template.accentColor||"")?template.accentColor:"#245C47";
    const title=type.toUpperCase();
    const details=record.details||{};
    const party=partyFor(record);
    const bank=record.bankName||record.checkbookName||ledgerFor(record.ledgerId)?.bankName||"";
    const ref=record.documentNo||record.reference||record.chequeNumber||"--";
    const date=record.transactionDate||record.date||record.issueDate||"--";
    const amount=Number(record.amount??details.amount??details.netPaid??details.netReceived??details.grandTotal??details.netSalary)||0;
    const info=type==="Cheque Voucher"?[
      ["Voucher number",ref],["Transaction date",dateLabel(record.transactionDate)],["Cheque number",record.chequeNumber||"--"],["Cheque date",dateLabel(record.chequeDate||record.issueDate)],["Bank",bank],["Pay to",record.payee||"--"],["Party ledger",ledgerFor(record.payeeLedgerId)?.name||"--"],["Purpose",record.purpose||"--"],["Comment",record.purposeComment||"--"],["Amount",formatMoney(amount,record.currency||currency)],["Notes",record.notes||"--"]
    ]:type==="Estimate Voucher"?[
      ["Estimate number",ref],["Date",dateLabel(record.date)],["Valid until",dateLabel(details.validUntil)],["Customer",record.partyName||record.customer||party?.name||"--"],["GSTIN",details.customerGstin||party?.gstin||"--"],["Place of supply",details.placeOfSupply||"--"],["Reference",record.reference||details.referenceNumber||"--"],["Amount",formatMoney(amount,record.currency||currency)],["Taxable amount",formatMoney(details.taxableAmount||0,record.currency||currency)],["GST",formatMoney((Number(details.cgst)||0)+(Number(details.sgst)||0)+(Number(details.igst)||0),record.currency||currency)],["Terms",details.terms||company.cmp_terms||"--"],["Notes",details.notes||record.narration||"--"]
    ]:type==="Payroll Voucher"?[
      ["Voucher number",ref],["Salary month",details.salaryMonth||"--"],["Pay date",dateLabel(record.date)],["Payroll batch",details.payrollBatch||"--"],["Department",details.department||record.department||"--"],["Basic salary",formatMoney(details.basicSalary||0,record.currency||currency)],["Allowances",formatMoney(details.allowances||0,record.currency||currency)],["Bonus",formatMoney(details.bonus||0,record.currency||currency)],["Gross salary",formatMoney(details.grossSalary||0,record.currency||currency)],["PF / ESI / TDS",formatMoney((Number(details.pf)||0)+(Number(details.esi)||0)+(Number(details.tds)||0),record.currency||currency)],["Net salary",formatMoney(details.netSalary||amount,record.currency||currency)],["Narration",record.narration||details.narration||"--"]
    ]:[
      ["Voucher number",ref],["Date",dateLabel(record.date)],["Party",record.partyName||record.customer||record.supplier||record.party||party?.name||"--"],["Party ledger",ledgerFor(details.partyLedgerId)?.name||ledgerFor(record.ledgerId)?.name||"--"],["Payment / receipt mode",details.paymentMode||details.receiptMode||record.method||"--"],["Bank / cash account",ledgerFor(record.ledgerId)?.name||record.account||bank||"--"],["Reference",record.reference||details.referenceNumber||"--"],["Amount",formatMoney(amount,record.currency||currency)],["Status",record.status||record.paymentStatus||"--"],["Narration",record.narration||details.narration||record.notes||"--"]
    ];
    const rows=info.map(([label,value])=>`<div class="row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} ${esc(ref)}</title><style>*{box-sizing:border-box}body{margin:0;background:#eef2f4;color:#25312d;font:14px/1.5 Arial,sans-serif}.toolbar{position:sticky;top:0;padding:12px;text-align:right;background:white;border-bottom:1px solid #d9e1dd}.toolbar button{border:0;border-radius:4px;background:${accent};color:white;padding:10px 16px;font-weight:700}.document{width:min(210mm,calc(100% - 30px));min-height:180mm;margin:20px auto;padding:18mm;background:#fff;box-shadow:0 6px 24px #20382d18}.head{display:flex;justify-content:space-between;gap:20px;padding-bottom:16px;border-bottom:3px solid ${accent}}h1{margin:0;color:${accent};font-size:22px}.company{color:#66736d;font-size:12px}.tag{color:#728079;font-size:11px;letter-spacing:1px;text-align:right}.rows{display:grid;grid-template-columns:1fr 1fr;gap:0 28px;margin:24px 0}.row{display:grid;grid-template-columns:minmax(110px,.7fr) minmax(0,1fr);gap:12px;padding:11px 0;border-bottom:1px solid #e6ebe8}.row span{color:#6a756f;font-size:12px}.row strong{overflow-wrap:anywhere}.amount{margin:22px 0 0 auto;padding:14px 0;border-top:2px solid ${accent};width:min(100%,300px);display:flex;justify-content:space-between;font-size:18px;font-weight:700}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:70px}.signatures span{padding-top:8px;border-top:1px solid #9da9a2;color:#67736c;font-size:11px}@media print{body{background:#fff}.toolbar{display:none}.document{width:100%;min-height:auto;margin:0;padding:12mm;box-shadow:none}}@media(max-width:600px){.document{padding:20px}.rows{grid-template-columns:1fr}.head{flex-direction:column}.tag{text-align:left}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div><main class="document"><header class="head"><div><h1>${esc(company.cmp_name||"Company")}</h1><div class="company">${esc(company.cmp_legal_name||"")}<br>${esc(companyAddress(company))}<br>${esc(company.cmp_phone||"")} ${company.cmp_email?`· ${esc(company.cmp_email)}`:""}${company.cmp_gstin?`<br>GSTIN ${esc(company.cmp_gstin)}`:""}</div></div><div class="tag"><strong>${esc(title)}</strong><br>${esc(ref)}<br>${esc(dateLabel(date))}</div></header><section class="rows">${rows}</section><div class="amount"><span>Total</span><span>${esc(formatMoney(amount,record.currency||currency))}</span></div><div class="signatures"><span>Prepared by</span><span>Authorized signatory</span></div></main></body></html>`;
  }
  function render(){
    const type=typeSelect.value;
    const entries=recordsFor(type);
    const previous=recordSelect.value;
    recordSelect.innerHTML=`<option value="">Select related record</option>${entries.map(entry=>`<option value="${esc(entry.source)}:${esc(entry.record.id)}">${esc(entry.label)}</option>`).join("")}`;
    if(entries.some(entry=>`${entry.source}:${entry.record.id}`===previous)) recordSelect.value=previous;
    const entry=selectedEntry();
    const disabled=!entry;
    ["voucherTemplatePrint","voucherTemplateEmail","voucherTemplateWhatsapp","voucherTemplateSource"].forEach(id=>root.querySelector(`#${id}`).disabled=disabled);
    if(!entry){preview.srcdoc=`<!doctype html><html><body style="font:14px Arial;color:#66736d;padding:32px">Select a ${esc(type.toLowerCase())} record to preview its Company-branded template.</body></html>`;return;}
    setSourceButton(entry.source);
    preview.srcdoc=documentHtml(type,entry.record);
  }
  function selectedEntry(){return recordsFor(typeSelect.value).find(entry=>`${entry.source}:${entry.record.id}`===recordSelect.value)||null;}
  async function refresh(){
    feedback.hidden=true;
    const results=await Promise.allSettled([getCompany(),listRecords("cheques"),listRecords("transactions"),listRecords("payments"),listRecords("invoices"),listRecords("clients"),listRecords("staff"),listRecords("ledger")]);
    company=results[0].status==="fulfilled"?results[0].value||{}:{};
    records={cheques:results[1].status==="fulfilled"?results[1].value:[],transactions:results[2].status==="fulfilled"?results[2].value:[],payments:results[3].status==="fulfilled"?results[3].value:[],invoices:results[4].status==="fulfilled"?results[4].value:[]};
    clients=results[5].status==="fulfilled"?results[5].value:[];
    staff=results[6].status==="fulfilled"?results[6].value:[];
    ledgers=results[7].status==="fulfilled"?results[7].value:[];
    currency=String(company.cmp_currency||"INR").toUpperCase();
    const failures=results.slice(1).filter(result=>result.status==="rejected").length;
    feedback.textContent=failures?"Some related module records could not be loaded. Available records are still shown.":"";
    feedback.hidden=!failures;
    render();
  }
  typeSelect.value=TYPES.includes(sessionStorage.getItem("corebiqTemplateType"))?sessionStorage.getItem("corebiqTemplateType"):TYPES[0];
  sessionStorage.removeItem("corebiqTemplateType");
  typeSelect.addEventListener("change",render);
  recordSelect.addEventListener("change",render);
  root.querySelector("#templateRefresh").addEventListener("click",refresh);
  root.querySelector("#voucherTemplatePrint").addEventListener("click",()=>preview.contentWindow?.print());
  root.querySelector("#voucherTemplateEmail").addEventListener("click",()=>{
    const entry=selectedEntry();if(!entry)return;
    const record=entry.record,party=partyFor(record),email=party?.email||record.email;
    if(!email){window.showToast?.("Add an email address to the linked Client or Staff record first.");return;}
    const number=record.documentNo||record.chequeNumber||"";
    window.open(`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`${typeSelect.value} ${number}`)}&body=${encodeURIComponent(`Please find ${typeSelect.value.toLowerCase()} ${number} from ${company.cmp_name||"our company"}.`)}`,"_blank","noopener,noreferrer");
  });
  root.querySelector("#voucherTemplateWhatsapp").addEventListener("click",()=>{
    const entry=selectedEntry();if(!entry)return;
    const record=entry.record,party=partyFor(record),digits=String(party?.phone||record.phone||"").replace(/\D/g,"");
    if(!digits){window.showToast?.("Add a phone number to the linked Client or Staff record first.");return;}
    const number=record.documentNo||record.chequeNumber||"";
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(`Please find ${typeSelect.value.toLowerCase()} ${number} from ${company.cmp_name||"our company"}.`)}`,"_blank","noopener,noreferrer");
  });
  await refresh();
}