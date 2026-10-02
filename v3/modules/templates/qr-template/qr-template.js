import { createRecord, getCompany, listRecords } from "../../../js/firebase-service.js?v=7";

const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[char]));
const el=id=>document.getElementById(id);

export async function init(){
  const root=document.querySelector("#moduleContainer #qrTemplatePage");
  if(!root) return;
  const feedback=el("qrTemplateFeedback");
  let company={};
  let sales=[];
  let invoices=[];
  let transactions=[];
  let selectedRecord=null;
  let upiUrl="";

  function recordOptions(){
    return [...sales.map(record=>({source:"sales",record})),...invoices.map(record=>({source:"invoices",record})),...transactions.filter(record=>["Sales Invoice","Estimate / Quotation"].includes(record.voucherType||record.type)).map(record=>({source:"transactions",record}))];
  }
  function recordLabel({source,record}){
    const label=source==="sales"?"Sale":source==="transactions"?record.voucherType||"Sales Voucher":"Invoice";
    return `${label} ${record.documentNo||record.reference||record.id} · ${record.customer||record.partyName||"Client"} · ${record.date||""}`;
  }
  function buildUpiUrl(){
    const upiId=String(company.cmp_upi_id||"").trim();
    const amount=Number(el("qrPaymentAmount").value)||0;
    if(!upiId||!amount){upiUrl="";return;}
    const params=new URLSearchParams({pa:upiId,pn:company.cmp_name||"",am:amount.toFixed(2),cu:company.cmp_currency||"INR",tn:el("qrPaymentNote").value.trim()||el("qrPaymentLabel").value.trim()||"Invoice payment"});
    upiUrl=`upi://pay?${params.toString()}`;
  }
  function renderPreview(){
    buildUpiUrl();
    const image=el("qrPreviewImage");
    if(!upiUrl){image.removeAttribute("src");el("qrPreviewAmount").textContent=company.cmp_upi_id?"Enter an amount to create the QR":"Add a Company UPI ID first";el("qrPreviewPayload").textContent="";return;}
    const qrUrl=new URL("https://api.qrserver.com/v1/create-qr-code/");
    qrUrl.searchParams.set("size","280x280");qrUrl.searchParams.set("data",upiUrl);
    image.src=qrUrl.toString();
    el("qrPreviewAmount").textContent=new Intl.NumberFormat(undefined,{style:"currency",currency:company.cmp_currency||"INR"}).format(Number(el("qrPaymentAmount").value)||0);
    el("qrPreviewPayload").textContent=upiUrl;
  }
  function loadRecord(recordKey){
    const [source,id]=String(recordKey||"").split(":");
    selectedRecord=recordOptions().find(item=>item.source===source&&item.record.id===id)||null;
    if(selectedRecord){
      el("qrPaymentAmount").value=String(Number(selectedRecord.record.amount)||0);
      el("qrPaymentNote").value=selectedRecord.record.documentNo||selectedRecord.record.reference||"";
      el("qrPaymentLabel").value=`${selectedRecord.source==="sales"?"Sale":"Invoice"} payment`;
    }
    renderPreview();
  }
  async function refresh(){
    feedback.hidden=true;
    const [companyResult,salesResult,invoiceResult,transactionResult]=await Promise.allSettled([getCompany(),listRecords("sales"),listRecords("invoices"),listRecords("transactions")]);
    company=companyResult.status==="fulfilled"?companyResult.value||{}:{};
    sales=salesResult.status==="fulfilled"?salesResult.value:[];
    invoices=invoiceResult.status==="fulfilled"?invoiceResult.value:[];
    transactions=transactionResult.status==="fulfilled"?transactionResult.value:[];
    el("qrCompanyUpi").value=company.cmp_upi_id||"";
    const records=recordOptions();
    const pending=JSON.parse(sessionStorage.getItem("corebiqPaymentQrSource")||"null");
    const options=records.map(item=>`<option value="${escapeHtml(`${item.source}:${item.record.id}`)}">${escapeHtml(recordLabel(item))}</option>`).join("");
    el("qrSourceRecord").innerHTML=`<option value="">Select sale or invoice</option>${options}`;
    if(pending){
      const matchingSource=pending.collection;
      const key=`${matchingSource}:${pending.recordId}`;
      if(records.some(item=>`${item.source}:${item.record.id}`===key)) el("qrSourceRecord").value=key;
      sessionStorage.removeItem("corebiqPaymentQrSource");
    }
    if(!company.cmp_upi_id){feedback.textContent="Set Company UPI ID before generating payment QR codes.";feedback.hidden=false;}
    loadRecord(el("qrSourceRecord").value);
  }
  el("qrSourceRecord").addEventListener("change",()=>loadRecord(el("qrSourceRecord").value));
  ["qrPaymentAmount","qrPaymentNote","qrPaymentLabel"].forEach(id=>el(id).addEventListener("input",renderPreview));
  el("qrTemplateRefresh").addEventListener("click",refresh);
  el("qrOpenCompany").addEventListener("click",()=>window.COREBIQ?.loadModule("company"));
  el("qrCopyPayment").addEventListener("click",async()=>{
    renderPreview();if(!upiUrl){window.showToast?.("Add a Company UPI ID and payment amount first.");return;}
    try{await navigator.clipboard.writeText(upiUrl);window.showToast?.("UPI payment link copied.");}
    catch{window.showToast?.("Could not copy the payment link.");}
  });
  el("qrSaveRecord").addEventListener("click",async()=>{
    renderPreview();
    if(!upiUrl){feedback.textContent="Add a Company UPI ID and payment amount first.";feedback.hidden=false;return;}
    try{
      await createRecord("qr",{name:el("qrPaymentLabel").value.trim()||"Invoice payment",value:upiUrl,purpose:"Invoice payment",status:"Active",companyUpiId:company.cmp_upi_id,currency:company.cmp_currency||"INR",amount:Number(el("qrPaymentAmount").value)||0,source:el("qrSourceRecord").value,sourceDocumentNo:selectedRecord?.record.documentNo||""});
      window.showToast?.("Payment QR saved in QR records.");
    }catch(error){feedback.textContent=error.message||"Could not save QR record.";feedback.hidden=false;}
  });
  await refresh();
}