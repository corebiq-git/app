import { formatCurrency } from "../js/currency.js";

const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
const uniqueValues=values=>values.map(value=>String(value??"").trim()).filter((value,index,items)=>value&&items.findIndex(item=>item.toLowerCase()===value.toLowerCase())===index);

export function invoiceMessage({sale,customer,company}){
  const companyName=company.cmp_name||"our company";
  const customerName=customer?.name||sale.customer||"there";
  const number=sale.documentNo||sale.invoiceNumber||sale.reference||"your bill";
  const amount=formatCurrency(sale.amount,company.cmp_currency||"INR");
  const date=sale.date||sale.createdAt?.toDate?.().toLocaleDateString?.()||"";
  return `Hello ${customerName},\n\nPlease find your bill ${number}${date?` dated ${date}`:""} for ${amount} from ${companyName}.\nPayment status: ${sale.paymentStatus||"Pending"}.\n\nThank you,\n${companyName}${company.cmp_phone?`\n${company.cmp_phone}`:""}`;
}

export function createInvoiceHtml({sale,customer,company={},bank=null,template={},logoDataUrl="",autoPrint=false}){
  const currency=company.cmp_currency||"INR";
  const accent=/^#[0-9a-f]{6}$/i.test(template.accentColor||"")?template.accentColor:"#174A7E";
  const invoiceNumber=sale.documentNo||sale.invoiceNumber||sale.reference||"Pending";
  const companyName=company.cmp_name||company.cmp_legal_name||"Company name";
  const legalName=company.cmp_legal_name&&company.cmp_legal_name.trim().toLowerCase()!==companyName.trim().toLowerCase()?company.cmp_legal_name:"";
  const logo=template.showLogo!==false?`<img class="company-logo" src="assets/logo-client.svg" alt="${escapeHtml(companyName)}">`:"";
  const address=uniqueValues([company.cmp_addr1,company.cmp_addr2,company.cmp_city,company.cmp_district,company.cmp_state,company.cmp_pin,company.cmp_country]).join(", ");
  const phoneNumbers=uniqueValues([company.cmp_phone,company.cmp_alt_phone]);
  const companyDetails=[
    address?`<p class="contact-line"><span class="contact-label">Address</span><span>${escapeHtml(address)}</span></p>`:"",
    phoneNumbers.length?`<p class="contact-line"><span class="contact-label">Phone</span><span>${phoneNumbers.map(escapeHtml).join(" / ")}</span></p>`:"",
    company.cmp_email?`<p class="contact-line"><span class="contact-label">Email</span><span>${escapeHtml(company.cmp_email)}</span></p>`:"",
    company.cmp_website?`<p class="contact-line"><span class="contact-label">Website</span><span>${escapeHtml(company.cmp_website)}</span></p>`:"",
    legalName?`<p class="contact-line"><span class="contact-label">Legal name</span><span>${escapeHtml(legalName)}</span></p>`:"",
    company.cmp_biz_type?`<p class="contact-line"><span class="contact-label">Business type</span><span>${escapeHtml(company.cmp_biz_type)}</span></p>`:"",
    company.cmp_reg_no?`<p class="contact-line"><span class="contact-label">Registration</span><span>${escapeHtml(company.cmp_reg_no)}</span></p>`:"",
    company.cmp_pan?`<p class="contact-line"><span class="contact-label">PAN</span><span>${escapeHtml(company.cmp_pan)}</span></p>`:"",
    company.cmp_gstin?`<p class="contact-line"><span class="contact-label">GSTIN</span><span>${escapeHtml(company.cmp_gstin)}</span></p>`:"",
    company.cmp_cin?`<p class="contact-line"><span class="contact-label">CIN / LLPIN</span><span>${escapeHtml(company.cmp_cin)}</span></p>`:""
  ].filter(Boolean).join("");
  const customerAddress=uniqueValues([customer?.address,customer?.city,customer?.district,customer?.state,customer?.pin,customer?.country]).join(", ");
  const bankDetails=bank?[
    bank.bankName||bank.name?`<p><strong>Bank Name:</strong> ${escapeHtml(bank.bankName||bank.name)}</p>`:"",
    bank.accountHolderName?`<p><strong>Account Holder:</strong> ${escapeHtml(bank.accountHolderName)}</p>`:"",
    bank.accountNumber?`<p><strong>Account No:</strong> ${escapeHtml(bank.accountNumber)}</p>`:"",
    bank.ifsc?`<p><strong>IFSC:</strong> ${escapeHtml(bank.ifsc)}</p>`:"",
    bank.bankBranch?`<p><strong>Branch:</strong> ${escapeHtml(bank.bankBranch)}</p>`:""
  ].filter(Boolean).join(""):"";
  const bankSection=template.showBankDetails!==false&&bankDetails?`<section class="payment-section"><div class="bank-details"><h3>Payment Details (Bank Transfer)</h3>${bankDetails}</div></section>`:"";
  const description=sale.description||sale.notes||"Sales";
  const quantityValue=Number(sale.quantity??sale.qty)||1;
  const totalValue=Number(sale.total??sale.amount)||0;
  const itemAmount=Number(sale.subtotal??sale.amount)||0;
  const rateValue=Number(sale.rate??(itemAmount/quantityValue))||0;
  const taxValue=Number(sale.taxAmount)||0;
  const showBreakdown=sale.subtotal!==undefined||sale.taxAmount!==undefined;
  const subtotalValue=Number(sale.subtotal??itemAmount)||0;
  const grandTotal=Number(sale.total??(subtotalValue+taxValue))||0;
  const paymentTerms=template.paymentTerms||company.cmp_terms||"Thank you for your business.";
  const footerLines=uniqueValues([paymentTerms,template.footerNote,company.cmp_inv_header]);
  const layout=template.layout==="modern"?"modern":"classic";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escapeHtml(invoiceNumber)}</title><style>
    *{box-sizing:border-box}body{margin:0;padding:20px;background:#e0e0e0;color:#333;font:14px/1.5 Arial,Helvetica,sans-serif}.toolbar{margin:0 auto 20px;text-align:center}.toolbar button{border:0;border-radius:5px;background:${accent};color:#fff;padding:12px 24px;font-size:15px;font-weight:700;cursor:pointer}.invoice{width:210mm;min-height:297mm;margin:0 auto;padding:20mm;background:#fff;box-shadow:0 10px 30px #0003}.invoice-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:20px;margin-bottom:30px;border-bottom:2px solid ${accent}}.brand{display:flex;align-items:flex-start;gap:16px;max-width:65%;min-width:0}.company-logo{width:${company.cmp_logo_ratio==="square"?"76px":"150px"};max-height:100px;object-fit:contain;object-position:left top}.company-details{min-width:0;color:#555;font-size:11px}.company-name{margin:0 0 8px;color:${accent};font-size:15px;font-weight:700}.company-details p{margin:0 0 5px}.contact-line{display:flex;gap:8px}.contact-label{min-width:78px;color:#657180;font-weight:700}.invoice-title{text-align:right;flex-shrink:0}.invoice-title h1{margin:0 0 10px;color:${accent};font-size:34px;letter-spacing:2px}.invoice-meta{display:grid;grid-template-columns:auto auto;gap:5px 12px;text-align:right;font-size:12px}.invoice-meta strong{color:${accent}}.info-section{display:flex;justify-content:space-between;gap:24px;margin-bottom:30px}.bill-to,.travel-details{min-width:0;flex:1}.bill-to h3,.travel-details h3{margin:0 0 10px;padding-bottom:5px;border-bottom:1px solid #eee;color:${accent};font-size:15px}.bill-to p,.travel-details p{margin:5px 0;font-size:13px}.travel-details{padding:15px;border-radius:5px;background:#f4f8fb}.line-items{width:100%;margin:0 0 26px;border-collapse:collapse}.line-items th{padding:12px;background:${accent};color:#fff;text-align:left;font-size:12px}.line-items td{padding:12px;border-bottom:1px solid #ddd;font-size:13px}.line-items th:nth-child(2),.line-items td:nth-child(2){text-align:center}.line-items th:nth-child(n+3),.line-items td:nth-child(n+3){text-align:right}.totals-section{display:flex;justify-content:flex-end;margin-bottom:35px}.totals-box{width:300px}.totals-row{display:flex;justify-content:space-between;gap:16px;padding:7px 0;font-size:13px}.totals-row.grand-total{margin-top:5px;padding-top:10px;border-top:2px solid ${accent};color:${accent};font-size:17px;font-weight:700}.payment-section{display:flex;justify-content:space-between;padding:18px;border:1px solid #e0e0e0;border-radius:8px;background:#f8f9fa}.bank-details h3{margin:0 0 12px;color:${accent};font-size:15px}.bank-details p{margin:5px 0;font-size:12px}.invoice-footer{margin-top:35px;padding-top:18px;border-top:1px solid #eee;color:#777;text-align:center;font-size:11px;white-space:pre-line}.modern .invoice-head{border-bottom-width:5px}.modern .payment-section{border-left:4px solid ${accent}}.auto-print .toolbar{display:none}@page{size:A4;margin:0}@media print{body{padding:0;background:#fff}.invoice{width:100%;min-height:297mm;margin:0;padding:15mm;box-shadow:none}.toolbar{display:none!important}}@media(max-width:750px){body{padding:0}.invoice{width:100%;min-height:0;padding:22px}.invoice-head,.info-section{flex-direction:column}.brand{max-width:none}.invoice-title{text-align:left}.invoice-meta{text-align:left}.travel-details{width:100%}.line-items th,.line-items td{padding:8px 5px;font-size:11px}}
    </style></head><body class="${layout}${autoPrint?" auto-print":""}"><div class="toolbar"><button type="button" onclick="window.print()">Print / Save PDF</button></div><main class="invoice"><header class="invoice-head"><div class="brand">${logo}<div class="company-details"><div class="company-name">${escapeHtml(companyName)}</div>${companyDetails}</div></div><div class="invoice-title"><h1>INVOICE</h1><div class="invoice-meta"><strong>Invoice No:</strong><span>${escapeHtml(invoiceNumber)}</span><strong>Date:</strong><span>${escapeHtml(sale.date||"-")}</span>${sale.dueDate?`<strong>Due Date:</strong><span>${escapeHtml(sale.dueDate)}</span>`:""}</div></div></header><section class="info-section"><div class="bill-to"><h3>Bill To</h3><p><strong>${escapeHtml(customer?.name||sale.customer||"Customer")}</strong></p>${customer?.contactPerson?`<p>${escapeHtml(customer.contactPerson)}</p>`:""}${customerAddress?`<p>${escapeHtml(customerAddress)}</p>`:""}${customer?.phone?`<p>Phone: ${escapeHtml(customer.phone)}</p>`:""}${customer?.email?`<p>Email: ${escapeHtml(customer.email)}</p>`:""}${customer?.gstin?`<p>GSTIN: ${escapeHtml(customer.gstin)}</p>`:""}</div><div class="travel-details"><h3>Sale Details</h3>${sale.travelDate?`<p><strong>Travel Date:</strong> ${escapeHtml(sale.travelDate)}</p>`:""}<p><strong>Description:</strong> ${escapeHtml(description)}</p>${sale.reference&&sale.reference!==invoiceNumber?`<p><strong>Reference:</strong> ${escapeHtml(sale.reference)}</p>`:""}<p><strong>Payment Status:</strong> ${escapeHtml(sale.paymentStatus||"Pending")}</p></div></section><table class="line-items"><thead><tr><th>Description</th><th>Qty</th><th>Rate (${escapeHtml(currency)})</th><th>Amount (${escapeHtml(currency)})</th></tr></thead><tbody><tr><td>${escapeHtml(description)}</td><td>${escapeHtml(quantityValue)}</td><td>${escapeHtml(formatCurrency(rateValue,currency))}</td><td>${escapeHtml(formatCurrency(itemAmount,currency))}</td></tr></tbody></table><section class="totals-section"><div class="totals-box">${showBreakdown?`<div class="totals-row"><span>Subtotal:</span><span>${escapeHtml(formatCurrency(subtotalValue,currency))}</span></div>${taxValue?`<div class="totals-row"><span>Tax${sale.taxRate!==undefined?` (${escapeHtml(sale.taxRate)}%):`:":"}</span><span>${escapeHtml(formatCurrency(taxValue,currency))}</span></div>`:""}`:""}<div class="totals-row grand-total"><span>Grand Total:</span><span>${escapeHtml(formatCurrency(totalValue||grandTotal,currency))}</span></div></div></section>${bankSection}<footer class="invoice-footer">${footerLines.map(escapeHtml).join("\n")}</footer></main>${autoPrint?"<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250),{once:true});</script>":""}</body></html>`;
}

export function companyLogoSource(company){
  const source=company.cmp_logo||"";
  return /^(https?:|data:|blob:)/i.test(source)?source:"";
}
