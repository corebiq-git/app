import { createRecord, getCompany, getCompanyLogoBlob, listRecords, saveCompany } from "../js/firebase-service.js?v=6";
import { amountInWords, createBuilderInvoiceHtml } from "./invoice-builder-document.js";
import { companyLogoSource, createInvoiceHtml } from "./invoice-document.js";
import { formatCurrency } from "../js/currency.js";

const el=id=>document.getElementById(id);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
const defaults={name:"COREBIQ Invoice",layout:"classic",accentColor:"#174A7E",billingBankId:"",showLogo:true,showBankDetails:true,paymentTerms:"Payment is due as agreed.",footerNote:"Thank you for your business."};

async function loadLogo(company){
  const direct=companyLogoSource(company);
  if(direct) return direct;
  if(!company.cmp_logo) return "";
  try{
    const blob=await getCompanyLogoBlob(company.cmp_logo);
    return await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||""));
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }catch{return "";}
}

export async function init(){
  const root=document.querySelector("#moduleContainer .invoice-template-page");
  if(!root) return;
  const [companyResult,ledgerResult,clientsResult,servicesResult,productsResult,qrResult]=await Promise.allSettled([
    getCompany(),listRecords("ledger"),listRecords("clients"),listRecords("services"),listRecords("products"),listRecords("qr")
  ]);
  const company=companyResult.status==="fulfilled"?companyResult.value||{}:{};
  const currency=company.cmp_currency||"INR";
  if(companyResult.status==="rejected") window.showToast?.("Could not load company currency; using INR.");
  const ledgers=ledgerResult.status==="fulfilled"?ledgerResult.value:[];
  const clients=clientsResult.status==="fulfilled"?clientsResult.value:[];
  const services=servicesResult.status==="fulfilled"?servicesResult.value:[];
  const products=productsResult.status==="fulfilled"?productsResult.value:[];
  const savedQrs=qrResult.status==="fulfilled"?qrResult.value:[];
  const banks=ledgers.filter(ledger=>ledger.accountType==="Bank"||ledger.systemDefaultKey==="bank");
  const expenseLedgers=ledgers.filter(ledger=>ledger.category==="Expenses"&&!ledger.systemDefault);
  const saved=company.invoiceTemplate||{};
  const settings={...defaults,...saved};
  if(!settings.billingBankId&&banks.length===1) settings.billingBankId=banks[0].id;
  const logoDataUrl=await loadLogo(company);
  root.innerHTML=`<div class="page-header"><div class="page-title"><div class="page-title-icon"><span class="material-symbols-rounded">receipt_long</span></div><div><h1>Invoice Template</h1><p>Company-branded sales bills and payment details.</p></div></div></div><div class="invoice-template-layout"><form class="invoice-template-settings" id="invoiceTemplateForm"><h2>Template settings</h2><div class="form-group"><label for="invoiceTemplateName">Template name</label><input class="form-control" id="invoiceTemplateName" maxlength="70" required></div><div class="form-group"><label for="invoiceTemplateLayout">Layout</label><select class="form-control" id="invoiceTemplateLayout"><option value="classic">Classic</option><option value="modern">Modern</option></select></div><div class="form-group"><label for="invoiceTemplateColor">Accent color</label><div class="invoice-template-color"><input id="invoiceTemplateColor" type="color" aria-label="Invoice accent color"><span>Preview color</span></div></div><label class="invoice-template-toggle"><input id="invoiceTemplateShowLogo" type="checkbox"><span>Show company logo</span></label><label class="invoice-template-toggle"><input id="invoiceTemplateShowBank" type="checkbox"><span>Show bank details</span></label><div class="form-group"><label for="invoiceBillingBank">Billing bank</label><select class="form-control" id="invoiceBillingBank"><option value="">No bank account</option>${banks.map(bank=>`<option value="${escapeHtml(bank.id)}">${escapeHtml(bank.bankName||bank.name||"Bank")}${bank.accountNumber?` - ${escapeHtml(String(bank.accountNumber).slice(-4))}`:""}</option>`).join("")}</select><small class="invoice-template-help">Choose which Ledger bank account appears on bills.</small></div><div class="form-group"><label for="invoiceTemplateTerms">Payment terms</label><textarea class="form-control" id="invoiceTemplateTerms" rows="3"></textarea></div><div class="form-group"><label for="invoiceTemplateFooter">Footer note</label><textarea class="form-control" id="invoiceTemplateFooter" rows="2"></textarea></div><p class="invoice-template-company">Company details are linked from Company Profile. Bank details are linked from Ledger.</p><p class="invoice-template-feedback" id="invoiceTemplateFeedback" role="status" hidden></p><button class="btn btn-primary" type="submit"><span class="material-symbols-rounded">save</span><span>Save template</span></button></form><section class="invoice-template-preview"><div class="invoice-template-preview-header"><h2>Preview</h2><span>Sample sales bill</span></div><iframe title="Invoice template preview" id="invoiceTemplatePreview"></iframe></section></div>`;
  const builder=document.createElement("section");
  builder.className="invoice-builder";
  builder.innerHTML=`<div class="invoice-builder-heading"><div><h2>Create invoice</h2><p>Build a service or inventory invoice from saved records.</p></div><span class="material-symbols-rounded">post_add</span></div><div class="invoice-builder-layout"><form id="invoiceBuilderForm" class="invoice-builder-form"><div class="invoice-builder-grid"><div class="form-group"><label for="builderInvoiceType">Invoice type</label><select class="form-control" id="builderInvoiceType"><option value="professional">Invoice (Professional / Service)</option><option value="inventory">Invoice (Inventory-wise)</option></select></div><div class="form-group"><label for="builderClient">Client</label><select class="form-control" id="builderClient" required><option value="">Select client</option>${clients.map(client=>`<option value="${escapeHtml(client.id)}">${escapeHtml(client.name||client.id)}</option>`).join("")}</select></div><div class="form-group" id="builderServiceGroup"><label for="builderService">Service</label><select class="form-control" id="builderService"><option value="">Select saved service</option>${services.map(service=>`<option value="${escapeHtml(service.id)}">${escapeHtml(service.name||service.id)}${service.price!==undefined?` - ${escapeHtml(service.price)}`:""}</option>`).join("")}</select></div><div class="form-group" id="builderProductGroup" hidden><label for="builderProduct">Inventory item</label><select class="form-control" id="builderProduct"><option value="">Select saved product</option>${products.map(product=>`<option value="${escapeHtml(product.id)}">${escapeHtml(product.name||product.id)}${product.price!==undefined?` - ${escapeHtml(product.price)}`:""}</option>`).join("")}</select></div><div class="form-group"><label for="builderQuantity">Quantity</label><input class="form-control" id="builderQuantity" type="number" min="0.01" step="any" value="1" required></div><div class="form-group"><label for="builderRate">Rate</label><input class="form-control" id="builderRate" type="number" min="0" step="any" value="0" required></div><div class="form-group"><label for="builderGst">GST applicable?</label><select class="form-control" id="builderGst"><option value="no">No</option><option value="yes">Yes</option></select></div><div class="form-group"><label for="builderAdditionalLedger">Additional charges ledger</label><select class="form-control" id="builderAdditionalLedger"><option value="">No additional charge</option>${expenseLedgers.map(ledger=>`<option value="${escapeHtml(ledger.id)}">${escapeHtml(ledger.name||ledger.id)}</option>`).join("")}</select></div><div class="form-group"><label for="builderAdditionalAmount">Additional charge amount</label><input class="form-control" id="builderAdditionalAmount" type="number" min="0" step="any" value="0"></div><div class="form-group"><label for="builderAdvance">Advance received</label><input class="form-control" id="builderAdvance" type="number" min="0" step="any" value="0"></div><div class="form-group"><label for="builderPaymentQr">UPI / QR payment</label><select class="form-control" id="builderPaymentQr"><option value="">No UPI / QR</option>${savedQrs.map(qr=>`<option value="${escapeHtml(qr.id)}">${escapeHtml(qr.name||qr.purpose||qr.id)}</option>`).join("")}</select></div></div><p class="invoice-builder-feedback" id="invoiceBuilderFeedback" role="status" hidden></p><button class="btn btn-primary" id="createInvoiceButton" type="submit"><span class="material-symbols-rounded">save</span><span>Save invoice &amp; open PDF</span></button></form><section class="invoice-builder-preview"><div class="invoice-template-preview-header"><h3>Invoice preview</h3><span>Updates as you build</span></div><iframe id="invoiceBuilderPreview" title="Invoice document preview"></iframe></section></div>`;
  root.querySelector(".invoice-template-layout").after(builder);
  ["builderRate","builderAdditionalAmount","builderAdvance"].forEach(id=>{
    const label=el(id).closest(".form-group").querySelector("label");
    label.textContent=`${label.textContent} (${currency})`;
  });
  [[el("builderService"),services],[el("builderProduct"),products]].forEach(([select,items])=>{
    [...select.options].slice(1).forEach(option=>{
      const item=items.find(record=>record.id===option.value);
      if(item?.price!==undefined) option.textContent=`${item.name||item.id} - ${formatCurrency(item.price,currency)}`;
    });
  });
  el("invoiceTemplateName").value=settings.name;
  el("invoiceTemplateLayout").value=settings.layout;
  el("invoiceTemplateColor").value=/^#[0-9a-f]{6}$/i.test(settings.accentColor)?settings.accentColor:defaults.accentColor;
  el("invoiceTemplateShowLogo").checked=settings.showLogo!==false;
  el("invoiceTemplateShowBank").checked=settings.showBankDetails!==false;
  el("invoiceBillingBank").value=banks.some(bank=>bank.id===settings.billingBankId)?settings.billingBankId:(banks.length===1?banks[0].id:"");
  el("invoiceBillingBank").disabled=banks.length<2;
  el("invoiceTemplateTerms").value=settings.paymentTerms;
  el("invoiceTemplateFooter").value=settings.footerNote;

  function syncBillingBankRequirement(){
    el("invoiceBillingBank").required=banks.length>1&&el("invoiceTemplateShowBank").checked;
  }

  function getTemplateSettings(){
    return{name:el("invoiceTemplateName").value.trim()||defaults.name,layout:el("invoiceTemplateLayout").value,accentColor:el("invoiceTemplateColor").value,billingBankId:el("invoiceBillingBank").value,showLogo:el("invoiceTemplateShowLogo").checked,showBankDetails:el("invoiceTemplateShowBank").checked,paymentTerms:el("invoiceTemplateTerms").value.trim(),footerNote:el("invoiceTemplateFooter").value.trim()};
  }

  function getBuilderValues(){
    const invoiceType=el("builderInvoiceType").value;
    const selectedItem=invoiceType==="inventory"
      ? products.find(item=>item.id===el("builderProduct").value)
      : services.find(item=>item.id===el("builderService").value);
    const quantity=Math.max(0,Number(el("builderQuantity").value)||0);
    const rate=Math.max(0,Number(el("builderRate").value)||0);
    const subtotal=quantity*rate;
    const additionalCharges=Math.max(0,Number(el("builderAdditionalAmount").value)||0);
    const gstApplicable=el("builderGst").value==="yes";
    const gstRate=gstApplicable?Math.max(0,Number(company.cmp_tax_rate)||0):0;
    const gstAmount=Math.round((subtotal+additionalCharges)*gstRate)/100;
    const amount=subtotal+additionalCharges+gstAmount;
    const advanceReceived=Math.max(0,Number(el("builderAdvance").value)||0);
    const chargeLedger=expenseLedgers.find(ledger=>ledger.id===el("builderAdditionalLedger").value);
    const qr=savedQrs.find(item=>item.id===el("builderPaymentQr").value);
    const itemDescription=selectedItem?.name||"Select a saved service or product";
    const items=[];
    if(selectedItem) items.push({description:itemDescription,quantity,rate,amount:subtotal});
    if(additionalCharges) items.push({description:chargeLedger?.name||"Additional charges",quantity:1,rate:additionalCharges,amount:additionalCharges});
    return{
      invoiceType,
      invoiceTypeLabel:invoiceType==="inventory"?"Invoice (Inventory-wise)":"Invoice (Professional)",
      selectedItem,quantity,rate,subtotal,additionalCharges,gstApplicable,gstRate,gstAmount,amount,
      advanceReceived,balanceDue:Math.max(0,amount-advanceReceived),amountWords:amountInWords(amount,currency),
      chargeLedger,qr,items,itemDescription
    };
  }

  function makeUpiPayload(qr,amount,invoiceNumber){
    const raw=String(qr?.value||"").trim();
    if(!raw) return "";
    try{
      const paymentUrl=/^upi:\/\/pay\?/i.test(raw)?new URL(raw):/^[\w.-]+@[\w.-]+$/.test(raw)?new URL(`upi://pay?pa=${encodeURIComponent(raw)}`):null;
      if(!paymentUrl) return raw;
      paymentUrl.searchParams.set("am",Number(amount).toFixed(2));
      paymentUrl.searchParams.set("cu",company.cmp_currency||"INR");
      paymentUrl.searchParams.set("tn",invoiceNumber||"Invoice payment");
      if(company.cmp_name&&!paymentUrl.searchParams.has("pn")) paymentUrl.searchParams.set("pn",company.cmp_name);
      return paymentUrl.toString();
    }catch{return raw;}
  }

  function builderInvoiceRecord(documentNo="DRAFT"){
    const values=getBuilderValues();
    const client=clients.find(item=>item.id===el("builderClient").value)||null;
    const template=getTemplateSettings();
    const bank=banks.find(item=>item.id===template.billingBankId)||(banks.length===1?banks[0]:null);
    return{
      documentNo,invoiceType:values.invoiceType,invoiceTypeLabel:values.invoiceTypeLabel,
      clientId:client?.id||"",customer:client?.name||"",date:new Date().toISOString().slice(0,10),
      serviceId:values.invoiceType==="professional"?values.selectedItem?.id||"":"",
      productId:values.invoiceType==="inventory"?values.selectedItem?.id||"":"",
      additionalChargeLedgerId:values.chargeLedger?.id||"",additionalChargeName:values.chargeLedger?.name||"",
      items:values.items,description:values.itemDescription,quantity:values.quantity,rate:values.rate,
      subtotal:values.subtotal,additionalCharges:values.additionalCharges,gstApplicable:values.gstApplicable,
      gstRate:values.gstRate,gstAmount:values.gstAmount,amount:values.amount,
      advanceReceived:values.advanceReceived,balanceDue:values.balanceDue,amountWords:values.amountWords,
      paymentStatus:values.balanceDue===0?"Paid":values.advanceReceived>0?"Partially paid":"Unpaid",
      upiLabel:values.qr?.name||"UPI / QR payment",upiPayload:makeUpiPayload(values.qr,values.amount,documentNo),
      billingBankId:bank?.id||""
    };
  }

  function refreshBuilderPreview(){
    const invoice=builderInvoiceRecord();
    const client=clients.find(item=>item.id===invoice.clientId)||null;
    const bank=banks.find(item=>item.id===invoice.billingBankId)||null;
    el("invoiceBuilderPreview").srcdoc=createBuilderInvoiceHtml({
      invoice,client,company,bank,template:getTemplateSettings(),logoDataUrl,
      paymentQr:invoice.upiPayload
    });
  }

  function updateInvoiceType(){
    const inventory=el("builderInvoiceType").value==="inventory";
    el("builderServiceGroup").hidden=inventory;
    el("builderService").required=!inventory;
    el("builderProductGroup").hidden=!inventory;
    el("builderProduct").required=inventory;
    const item=inventory?products.find(product=>product.id===el("builderProduct").value):services.find(service=>service.id===el("builderService").value);
    if(item) el("builderRate").value=Number(item.price)||0;
    refreshBuilderPreview();
  }
  function refreshPreview(){
    const sample={documentNo:"SAL-00001",reference:"ORDER-001",date:new Date().toISOString().slice(0,10),amount:1250,paymentStatus:"Pending",description:"Professional services"};
    const bank=banks.find(item=>item.id===el("invoiceBillingBank").value)||null;
    el("invoiceTemplatePreview").srcdoc=createInvoiceHtml({sale:sample,customer:{name:"Sample Customer",email:"customer@example.com",phone:"+91 90000 00000",gstin:"29ABCDE1234F1Z5"},company,bank,template:getTemplateSettings(),logoDataUrl});
  }
  ["invoiceTemplateName","invoiceTemplateLayout","invoiceTemplateColor","invoiceTemplateShowLogo","invoiceTemplateShowBank","invoiceBillingBank","invoiceTemplateTerms","invoiceTemplateFooter"].forEach(id=>el(id).addEventListener("input",refreshPreview));
  el("invoiceTemplateShowBank").addEventListener("change",syncBillingBankRequirement);
  syncBillingBankRequirement();
  el("invoiceTemplateForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const submit=el("invoiceTemplateForm").querySelector('[type="submit"]');
    const feedback=el("invoiceTemplateFeedback");
    if(el("invoiceBillingBank").required&&!el("invoiceBillingBank").value){
      feedback.textContent="Choose the billing bank to show on invoices.";
      feedback.hidden=false;
      el("invoiceBillingBank").focus();
      return;
    }
    submit.disabled=true;
    feedback.hidden=true;
    try{
      const next={...company,invoiceTemplate:getTemplateSettings()};
      await saveCompany(next);
      Object.assign(company,next);
      feedback.textContent="Invoice template saved.";
      feedback.hidden=false;
      window.showToast?.("Invoice template saved.");
    }catch(error){
      feedback.textContent=error.message||"Could not save invoice template.";
      feedback.hidden=false;
    }finally{submit.disabled=false;}
  });
  refreshPreview();
  const builderInputIds=["builderClient","builderService","builderProduct","builderQuantity","builderRate","builderGst","builderAdditionalLedger","builderAdditionalAmount","builderAdvance","builderPaymentQr"];
  builderInputIds.forEach(id=>el(id).addEventListener("input",refreshBuilderPreview));
  builderInputIds.forEach(id=>el(id).addEventListener("change",refreshBuilderPreview));
  el("builderInvoiceType").addEventListener("change",updateInvoiceType);
  el("builderService").addEventListener("change",()=>{
    const service=services.find(item=>item.id===el("builderService").value);
    if(service) el("builderRate").value=Number(service.price)||0;
    refreshBuilderPreview();
  });
  el("builderProduct").addEventListener("change",()=>{
    const product=products.find(item=>item.id===el("builderProduct").value);
    if(product) el("builderRate").value=Number(product.price)||0;
    refreshBuilderPreview();
  });
  updateInvoiceType();
  el("invoiceBuilderForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const feedback=el("invoiceBuilderFeedback");
    const button=el("createInvoiceButton");
    const invoice=builderInvoiceRecord();
    const client=clients.find(item=>item.id===el("builderClient").value);
    const values=getBuilderValues();
    if(!client){feedback.textContent="Select a client before saving the invoice.";feedback.hidden=false;el("builderClient").focus();return;}
    if(!values.selectedItem){feedback.textContent=values.invoiceType==="inventory"?"Select a saved product.":"Select a saved service.";feedback.hidden=false;return;}
    if(values.additionalCharges>0&&!values.chargeLedger){feedback.textContent="Select an expense ledger for the additional charge.";feedback.hidden=false;return;}
    if(values.advanceReceived>values.amount){feedback.textContent="Advance received cannot exceed the invoice total.";feedback.hidden=false;el("builderAdvance").focus();return;}
    const template=getTemplateSettings();
    if(template.showBankDetails&&banks.length>1&&!template.billingBankId){feedback.textContent="Choose the billing bank in Template settings before creating this invoice.";feedback.hidden=false;return;}
    const popup=window.open("about:blank","_blank");
    button.disabled=true;
    feedback.hidden=true;
    try{
      const invoiceId=await createRecord("invoices",invoice);
      const savedInvoices=await listRecords("invoices");
      const savedInvoice=savedInvoices.find(item=>item.id===invoiceId)||invoice;
      const bank=banks.find(item=>item.id===template.billingBankId)||(banks.length===1?banks[0]:null);
      const html=createBuilderInvoiceHtml({invoice:savedInvoice,client,company,bank,template,logoDataUrl,paymentQr:invoice.upiPayload,autoPrint:true});
      if(popup){popup.document.open();popup.document.write(html);popup.document.close();}
      else window.showToast?.("Invoice saved. Allow pop-ups to print or save the PDF.");
      feedback.textContent=`Invoice ${savedInvoice.documentNo||"saved"}.`;
      feedback.hidden=false;
      window.showToast?.("Invoice saved.");
      refreshBuilderPreview();
    }catch(error){
      popup?.close();
      feedback.textContent=error.message||"Could not save invoice.";
      feedback.hidden=false;
    }finally{button.disabled=false;}
  });
  refreshBuilderPreview();
}
