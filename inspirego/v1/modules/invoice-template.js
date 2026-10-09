import { getCompany, listRecords, saveCompany } from "../js/firebase-service.js?v=7";
import { createInvoiceHtml } from "./invoice-document.js";

const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
const defaults={name:"Sales invoice",layout:"classic",accentColor:"#174A7E",billingBankId:"",showLogo:true,showBankDetails:true,showCompanyName:true,showCompanyAddress:true,paymentTerms:"Payment is due as agreed.",footerNote:"Thank you for your business."};

export async function init(){
  const root=document.querySelector("#moduleContainer .invoice-template-page");
  if(!root) return;
  const [companyResult,ledgerResult]=await Promise.allSettled([getCompany(),listRecords("ledger")]);
  if(companyResult.status==="rejected"){
    root.innerHTML=`<div class="empty invoice-template-error"><span class="material-symbols-rounded">cloud_off</span><p>Could not load Company Profile. Invoice settings were not changed.</p><small>${escapeHtml(companyResult.reason?.message||"Check Firebase configuration and access rules.")}</small></div>`;
    return;
  }
  const company=companyResult.value||{};
  const banks=ledgerResult.status==="fulfilled"
    ?ledgerResult.value.filter(ledger=>ledger.accountType==="Bank"||ledger.systemDefaultKey==="bank")
    :[];
  const settings={...defaults,...(company.invoiceTemplate||{})};
  if(!settings.billingBankId&&banks.length===1) settings.billingBankId=banks[0].id;
  root.innerHTML=`<div class="page-header"><div class="page-title"><div class="page-title-icon"><span class="material-symbols-rounded">receipt_long</span></div><div><h1>Invoice Template</h1><p>Set the design, company details, bank account, and terms used on sales invoices.</p></div></div></div><div class="invoice-template-layout"><form class="invoice-template-settings" id="invoiceTemplateForm"><div><p class="invoice-template-eyebrow">SALES DOCUMENT</p><h2>Template settings</h2></div><div class="form-group"><label for="invoiceTemplateName">Template name</label><input class="form-control" id="invoiceTemplateName" maxlength="70" required></div><div class="form-group"><label for="invoiceTemplateLayout">Style</label><select class="form-control" id="invoiceTemplateLayout"><option value="classic">Classic</option><option value="modern">Modern</option></select></div><div class="form-group"><label for="invoiceTemplateColor">Accent colour</label><div class="invoice-template-color"><input id="invoiceTemplateColor" type="color" aria-label="Invoice accent colour"><span id="invoiceTemplateColorValue"></span></div></div><div class="invoice-template-options"><label class="invoice-template-toggle"><input id="invoiceTemplateShowLogo" type="checkbox"><span>Show logo-client.svg</span></label><label class="invoice-template-toggle"><input id="invoiceTemplateShowName" type="checkbox"><span>Show company name</span></label><label class="invoice-template-toggle"><input id="invoiceTemplateShowAddress" type="checkbox"><span>Show company address</span></label><label class="invoice-template-toggle"><input id="invoiceTemplateShowBank" type="checkbox"><span>Show bank details</span></label></div><div class="form-group"><label for="invoiceBillingBank">Invoice bank account</label><select class="form-control" id="invoiceBillingBank"><option value="">Select bank account</option>${banks.map(bank=>`<option value="${escapeHtml(bank.id)}">${escapeHtml(bank.bankName||bank.name||"Bank account")}${bank.accountNumber?` ···${escapeHtml(String(bank.accountNumber).slice(-4))}`:""}</option>`).join("")}</select><small class="invoice-template-help">Bank information is linked directly from Ledger.</small></div><div class="form-group"><label for="invoiceTemplateTerms">Invoice terms</label><textarea class="form-control" id="invoiceTemplateTerms" rows="3" maxlength="1200"></textarea></div><div class="form-group"><label for="invoiceTemplateFooter">Footer note</label><textarea class="form-control" id="invoiceTemplateFooter" rows="2" maxlength="500"></textarea></div><p class="invoice-template-company">Company name and address are linked from Company Profile. Update them there; these options control whether they appear on the invoice.</p><p class="invoice-template-feedback" id="invoiceTemplateFeedback" role="status" hidden></p><button class="btn btn-primary" type="submit"><span class="material-symbols-rounded">save</span><span>Save template</span></button></form><section class="invoice-template-preview"><div class="invoice-template-preview-header"><div><p class="invoice-template-eyebrow">LIVE PREVIEW</p><h2>Sales invoice</h2></div><span>A4 · Print-ready</span></div><iframe title="Sales invoice template preview" id="invoiceTemplatePreview"></iframe></section></div>`;

  const el=id=>document.getElementById(id);
  el("invoiceTemplateName").value=settings.name;
  el("invoiceTemplateLayout").value=settings.layout;
  el("invoiceTemplateColor").value=/^#[0-9a-f]{6}$/i.test(settings.accentColor)?settings.accentColor:defaults.accentColor;
  el("invoiceTemplateShowLogo").checked=settings.showLogo!==false;
  el("invoiceTemplateShowName").checked=settings.showCompanyName!==false;
  el("invoiceTemplateShowAddress").checked=settings.showCompanyAddress!==false;
  el("invoiceTemplateShowBank").checked=settings.showBankDetails!==false;
  el("invoiceBillingBank").value=settings.billingBankId||"";
  el("invoiceTemplateTerms").value=settings.paymentTerms||"";
  el("invoiceTemplateFooter").value=settings.footerNote||"";

  function getSettings(){
    return{
      ...settings,
      name:el("invoiceTemplateName").value.trim(),
      layout:el("invoiceTemplateLayout").value,
      accentColor:el("invoiceTemplateColor").value,
      showLogo:el("invoiceTemplateShowLogo").checked,
      showCompanyName:el("invoiceTemplateShowName").checked,
      showCompanyAddress:el("invoiceTemplateShowAddress").checked,
      showBankDetails:el("invoiceTemplateShowBank").checked,
      billingBankId:el("invoiceBillingBank").value,
      paymentTerms:el("invoiceTemplateTerms").value.trim(),
      footerNote:el("invoiceTemplateFooter").value.trim()
    };
  }

  function refreshPreview(){
    const selectedSettings=getSettings();
    el("invoiceTemplateColorValue").textContent=selectedSettings.accentColor.toUpperCase();
    const sample={documentNo:"SAL-00001",reference:"BOOKING-001",date:new Date().toISOString().slice(0,10),travelDate:new Date(Date.now()+14*86400000).toISOString().slice(0,10),amount:1500,quantity:2,rate:750,paymentStatus:"Pending",items:[{description:"Sample travel service",quantity:2,rate:750,amount:1500}]};
    const bank=banks.find(item=>item.id===selectedSettings.billingBankId)||null;
    el("invoiceTemplatePreview").srcdoc=createInvoiceHtml({sale:sample,customer:{name:"Sample Customer",email:"customer@example.com",phone:"+91 90000 00000"},company,bank,template:selectedSettings});
  }

  ["invoiceTemplateName","invoiceTemplateLayout","invoiceTemplateColor","invoiceTemplateShowLogo","invoiceTemplateShowName","invoiceTemplateShowAddress","invoiceTemplateShowBank","invoiceBillingBank","invoiceTemplateTerms","invoiceTemplateFooter"].forEach(id=>{
    el(id).addEventListener("input",refreshPreview);
    el(id).addEventListener("change",refreshPreview);
  });
  if(ledgerResult.status==="rejected"){
    el("invoiceTemplateFeedback").textContent=`Could not load Ledger bank accounts: ${ledgerResult.reason?.message||"Check Firebase configuration and access rules."}`;
    el("invoiceTemplateFeedback").hidden=false;
  }

  el("invoiceTemplateForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const form=el("invoiceTemplateForm");
    const submit=form.querySelector('[type="submit"]');
    const feedback=el("invoiceTemplateFeedback");
    const nextSettings=getSettings();
    if(nextSettings.showBankDetails&&!nextSettings.billingBankId){
      feedback.textContent=banks.length?"Choose an invoice bank account or turn off Show bank details.":"Add a bank account in Ledger or turn off Show bank details.";
      feedback.hidden=false;
      el("invoiceBillingBank").focus();
      return;
    }
    submit.disabled=true;
    feedback.hidden=true;
    try{
      const next={...company,invoiceTemplate:nextSettings};
      await saveCompany(next);
      Object.assign(company,next);
      Object.assign(settings,nextSettings);
      feedback.textContent="Invoice template saved.";
      feedback.hidden=false;
      window.showToast?.("Invoice template saved.");
    }catch(error){
      feedback.textContent=error.message||"Could not save invoice template.";
      feedback.hidden=false;
    }finally{submit.disabled=false;}
  });
  refreshPreview();
}
