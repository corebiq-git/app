const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));

function formatCurrency(value,currency="INR"){
  const amount=Number(value)||0;
  try{return new Intl.NumberFormat(undefined,{style:"currency",currency}).format(amount)}
  catch{return `${currency} ${amount.toFixed(2)}`}
}

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
  const companyName=company.cmp_name||"Company name";
  const customerName=customer?.name||sale.customer||"Customer";
  const logo=template.showLogo!==false&&logoDataUrl?`<img class="company-logo" src="${escapeHtml(logoDataUrl)}" alt="${escapeHtml(companyName)}">`:"";
  const companyAddress=[
    [company.cmp_addr1,company.cmp_addr2,company.cmp_city,company.cmp_district,company.cmp_state,company.cmp_pin,company.cmp_country].filter(Boolean).join(", "),
    company.cmp_website?`Website: ${company.cmp_website}`:"",
    company.cmp_alt_phone?`Alternate phone: ${company.cmp_alt_phone}`:"",
    company.cmp_biz_type?`Business type: ${company.cmp_biz_type}`:"",
    company.cmp_reg_no?`Registration: ${company.cmp_reg_no}`:"",
    company.cmp_pan?`PAN: ${company.cmp_pan}`:"",
    company.cmp_cin?`CIN / LLPIN: ${company.cmp_cin}`:""
  ].filter(Boolean).join(" | ");
  const customerAddress=[customer?.address,customer?.city,customer?.state,customer?.gstin?`GSTIN ${customer.gstin}`:""].filter(Boolean).join(", ");
  const bankSection=template.showBankDetails===false||!bank?"":`<section class="bank"><h2>Payment details</h2><div class="bank-grid"><span>Bank</span><strong>${escapeHtml(bank.bankName||bank.name||"Bank")}</strong>${bank.accountHolderName?`<span>Account holder</span><strong>${escapeHtml(bank.accountHolderName)}</strong>`:""}${bank.accountNumber?`<span>Account number</span><strong>${escapeHtml(bank.accountNumber)}</strong>`:""}${bank.ifsc?`<span>IFSC</span><strong>${escapeHtml(bank.ifsc)}</strong>`:""}${bank.bankBranch?`<span>Branch</span><strong>${escapeHtml(bank.bankBranch)}</strong>`:""}</div></section>`;
  const layout=template.layout==="modern"?"modern":"classic";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bill ${escapeHtml(invoiceNumber)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#eef2f6;color:#202a35;font:14px/1.5 Arial,Helvetica,sans-serif}.toolbar{position:sticky;top:0;padding:12px;text-align:right;background:#fff;border-bottom:1px solid #dce3eb}.toolbar button{border:0;border-radius:6px;background:${accent};color:#fff;padding:10px 16px;font-weight:700;cursor:pointer}.invoice{width:min(210mm,calc(100% - 32px));min-height:275mm;margin:24px auto;padding:18mm;background:#fff;box-shadow:0 8px 35px #182c421a}.invoice-head{display:flex;justify-content:space-between;gap:30px;padding-bottom:24px;border-bottom:3px solid ${accent}}.brand{display:flex;align-items:flex-start;gap:14px;min-width:0}.company-logo{width:${company.cmp_logo_ratio==="square"?"76px":"170px"};height:72px;object-fit:contain;object-position:left center}.company h1{margin:0;color:${accent};font-size:24px;line-height:1.15}.company p{margin:5px 0;color:#657180;font-size:12px}.invoice-title{text-align:right}.invoice-title span{color:#7b8794;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase}.invoice-title h2{margin:3px 0;color:${accent};font-size:28px}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;padding:24px 0}.meta h3,.bank h2{margin:0 0 8px;color:${accent};font-size:12px;text-transform:uppercase}.meta p{margin:2px 0;color:#364250}.line-items{width:100%;border-collapse:collapse;margin:10px 0 22px}.line-items th,.line-items td{padding:12px;border-bottom:1px solid #e2e7ed;text-align:left}.line-items th{background:#f3f6f9;color:#4d5c6a;font-size:11px;text-transform:uppercase}.line-items td:last-child,.line-items th:last-child{text-align:right}.totals{display:flex;justify-content:flex-end;margin-bottom:24px}.total-row{width:min(100%,300px);display:flex;justify-content:space-between;padding:12px 0;border-top:2px solid ${accent};font-size:18px;font-weight:700}.bank{padding:16px 18px;border:1px solid #dfe5ec;border-radius:6px;background:#f8fafc}.bank-grid{display:grid;grid-template-columns:130px minmax(0,1fr);gap:5px 12px;font-size:12px}.bank-grid span{color:#718090}.invoice-footer{margin-top:30px;padding-top:12px;border-top:1px solid #e2e7ed;color:#687583;font-size:11px;white-space:pre-line}.modern .invoice-head{border-bottom-width:6px}.modern .bank{border-left:4px solid ${accent}}@page{size:A4;margin:14mm}.auto-print .toolbar{display:none}@media print{body{background:#fff}.invoice{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.toolbar{display:none!important}.meta,.bank,.line-items tr{break-inside:avoid}}@media(max-width:600px){.invoice{width:100%;margin:0;padding:22px}.invoice-head{flex-direction:column}.invoice-title{text-align:left}.meta{grid-template-columns:1fr}.toolbar{text-align:center}}
    </style></head><body class="${layout}${autoPrint?" auto-print":""}"><div class="toolbar"><button type="button" onclick="window.print()">Print / Save PDF</button></div><main class="invoice"><header class="invoice-head"><div class="brand">${logo}<div class="company"><h1>${escapeHtml(companyName)}</h1><p>${escapeHtml(company.cmp_legal_name||"")}</p><p>${escapeHtml(companyAddress)}</p><p>${escapeHtml(company.cmp_email||"")}${company.cmp_phone?` | ${escapeHtml(company.cmp_phone)}`:""}</p>${company.cmp_gstin?`<p>GSTIN ${escapeHtml(company.cmp_gstin)}</p>`:""}</div></div><div class="invoice-title"><span>Sales bill</span><h2>${escapeHtml(invoiceNumber)}</h2><p>Date: ${escapeHtml(sale.date||"-")}</p></div></header><section class="meta"><div><h3>Bill to</h3><p><strong>${escapeHtml(customerName)}</strong></p>${customer?.contactPerson?`<p>${escapeHtml(customer.contactPerson)}</p>`:""}${customer?.email?`<p>${escapeHtml(customer.email)}</p>`:""}${customer?.phone?`<p>${escapeHtml(customer.phone)}</p>`:""}${customerAddress?`<p>${escapeHtml(customerAddress)}</p>`:""}</div><div><h3>Payment</h3><p>Status: <strong>${escapeHtml(sale.paymentStatus||"Pending")}</strong></p>${sale.reference?`<p>Reference: ${escapeHtml(sale.reference)}</p>`:""}</div></section><table class="line-items"><thead><tr><th>Description</th><th>Reference</th><th>Amount</th></tr></thead><tbody><tr><td>${escapeHtml(sale.description||sale.notes||"Sales")}</td><td>${escapeHtml(sale.reference||invoiceNumber)}</td><td>${escapeHtml(formatCurrency(sale.amount,currency))}</td></tr></tbody></table><div class="totals"><div class="total-row"><span>Total</span><span>${escapeHtml(formatCurrency(sale.amount,currency))}</span></div></div>${bankSection}<footer class="invoice-footer">${escapeHtml(template.paymentTerms||company.cmp_terms||"Thank you for your business.")}${template.footerNote?`\n${escapeHtml(template.footerNote)}`:""}${company.cmp_inv_header?`\n${escapeHtml(company.cmp_inv_header)}`:""}</footer></main>${autoPrint?"<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250),{once:true});</script>":""}</body></html>`;
}

export function companyLogoSource(company){
  const source=company.cmp_logo||"";
  return /^(https?:|data:|blob:)/i.test(source)?source:"";
}
