import { formatCurrency } from "../js/currency.js";
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));

function underThousand(value){
  const ones=["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  if(value<20) return ones[value];
  if(value<100) return `${tens[Math.floor(value/10)]}${value%10?` ${ones[value%10]}`:""}`;
  return `${ones[Math.floor(value/100)]} Hundred${value%100?` ${underThousand(value%100)}`:""}`;
}

function integerWords(value){
  if(!Number.isFinite(value)||value<0) return "Zero";
  if(value===0) return "Zero";
  const groups=[[10000000,"Crore"],[100000,"Lakh"],[1000,"Thousand"],[100,"Hundred"]];
  const words=[];
  let remaining=Math.floor(value);
  groups.forEach(([size,label])=>{
    if(remaining>=size){
      const count=Math.floor(remaining/size);
      words.push(`${count>=100?integerWords(count):underThousand(count)} ${label}`);
      remaining%=size;
    }
  });
  if(remaining) words.push(underThousand(remaining));
  return words.join(" ");
}

export function amountInWords(value,currency="INR"){
  const amount=Math.max(0,Number(value)||0);
  const majorUnits={INR:["Rupee","Rupees"],USD:["Dollar","Dollars"],AED:["Dirham","Dirhams"]};
  const minorUnits={INR:["Paisa","Paise"],USD:["Cent","Cents"],AED:["Fil","Fils"]};
  let major=Math.floor(amount);
  let minor=Math.round((amount-major)*100);
  if(minor===100){major++;minor=0;}
  const majorName=majorUnits[currency]||[currency,currency];
  const minorName=minorUnits[currency]||["minor unit","minor units"];
  return `${integerWords(major)} ${major===1?majorName[0]:majorName[1]}${minor?` and ${integerWords(minor)} ${minor===1?minorName[0]:minorName[1]}`:""} Only`;
}

function paymentQrSource(value){
  if(!value) return "";
  const url=new URL("https://api.qrserver.com/v1/create-qr-code/");
  url.searchParams.set("size","180x180");
  url.searchParams.set("data",value);
  return url.toString();
}

export function createBuilderInvoiceHtml({invoice,client,company={},bank=null,template={},logoDataUrl="",paymentQr="",autoPrint=false}){
  const currency=company.cmp_currency||"INR";
  const accent=/^#[0-9a-f]{6}$/i.test(template.accentColor||"")?template.accentColor:"#174A7E";
  const logo=template.showLogo!==false&&logoDataUrl?`<img class="logo" src="${escapeHtml(logoDataUrl)}" alt="${escapeHtml(company.cmp_name||"Company logo")}">`:"";
  const companyLines=[
    [company.cmp_addr1,company.cmp_addr2,company.cmp_city,company.cmp_district,company.cmp_state,company.cmp_pin,company.cmp_country].filter(Boolean).join(", "),
    company.cmp_email,company.cmp_phone,company.cmp_website,
    company.cmp_gstin?`GSTIN ${company.cmp_gstin}`:""
  ].filter(Boolean);
  const lines=invoice.items?.length?invoice.items:[{description:invoice.description||"Invoice item",quantity:1,rate:invoice.subtotal||invoice.amount,amount:invoice.subtotal||invoice.amount}];
  const itemRows=lines.map(item=>`<tr><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(formatCurrency(item.rate,currency))}</td><td>${escapeHtml(formatCurrency(item.amount,currency))}</td></tr>`).join("");
  const bankDetails=template.showBankDetails===false||!bank?"":`<section class="bank"><h2>Bank transfer</h2><p><strong>${escapeHtml(bank.bankName||bank.name||"Bank")}</strong></p>${bank.accountHolderName?`<p>Account holder: ${escapeHtml(bank.accountHolderName)}</p>`:""}${bank.accountNumber?`<p>Account number: ${escapeHtml(bank.accountNumber)}</p>`:""}${bank.ifsc?`<p>IFSC: ${escapeHtml(bank.ifsc)}</p>`:""}${bank.bankBranch?`<p>Branch: ${escapeHtml(bank.bankBranch)}</p>`:""}</section>`;
  const qrSrc=paymentQr?paymentQrSource(paymentQr):"";
  const qrBlock=qrSrc?`<section class="upi"><div><h2>UPI / QR payment</h2><p>${escapeHtml(invoice.upiLabel||"Scan to pay")}</p><p class="upi-id">${escapeHtml(paymentQr)}</p></div><img src="${escapeHtml(qrSrc)}" alt="Payment QR code"></section>`:"";
  const companyName=company.cmp_name||"Company name";
  const grandTotal=Number(invoice.amount)||0;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escapeHtml(invoice.documentNo||invoice.invoiceNumber||"Draft")}</title><style>*{box-sizing:border-box}body{margin:0;background:#edf1f5;color:#202b37;font:14px/1.5 Arial,Helvetica,sans-serif}.toolbar{position:sticky;top:0;padding:12px;text-align:right;background:#fff;border-bottom:1px solid #dfe5ec}.toolbar button{border:0;border-radius:6px;background:${accent};color:#fff;padding:10px 16px;font-weight:700}.invoice{width:min(210mm,calc(100% - 32px));min-height:270mm;margin:24px auto;padding:17mm;background:#fff;box-shadow:0 8px 35px #182c421a}.head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:3px solid ${accent}}.brand{display:flex;align-items:flex-start;gap:14px}.logo{width:${company.cmp_logo_ratio==="square"?"74px":"170px"};height:68px;object-fit:contain;object-position:left top}.company h1{margin:0;color:${accent};font-size:22px}.company p{margin:3px 0;color:#5d6977;font-size:11px}.title{text-align:right}.title small{color:#798592;font-weight:700;letter-spacing:1px}.title h2{margin:2px 0;color:${accent};font-size:26px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:22px 0}.meta h3,.bank h2,.upi h2{margin:0 0 7px;color:${accent};font-size:11px;text-transform:uppercase}.meta p,.bank p,.upi p{margin:2px 0;color:#45515f}.items{width:100%;border-collapse:collapse}.items th,.items td{padding:10px;border-bottom:1px solid #dfe5ec;text-align:left}.items th{background:#f1f4f7;color:#526171;font-size:10px;text-transform:uppercase}.items td:last-child,.items th:last-child{text-align:right}.subtotal{display:grid;gap:4px;width:min(100%,310px);margin:16px 0 24px auto}.subtotal div{display:flex;justify-content:space-between;gap:20px}.subtotal .grand{margin-top:7px;padding-top:9px;border-top:2px solid ${accent};font-size:17px;font-weight:700}.words{margin:14px 0 22px;color:#526171;font-size:12px}.bank,.upi{margin-top:14px;padding:13px 15px;border:1px solid #dfe5ec;border-radius:6px;background:#f8fafc}.upi{display:flex;align-items:center;justify-content:space-between;gap:18px}.upi img{width:112px;height:112px;object-fit:contain}.upi-id{overflow-wrap:anywhere;font-size:11px}.footer{margin-top:22px;padding-top:11px;border-top:1px solid #dfe5ec;color:#687583;font-size:11px;white-space:pre-line}.auto-print .toolbar{display:none}@page{size:A4;margin:14mm}@media print{body{background:#fff}.invoice{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.toolbar{display:none!important}tr,.bank,.upi{break-inside:avoid}}@media(max-width:600px){.invoice{width:100%;margin:0;padding:22px}.head{flex-direction:column}.title{text-align:left}.meta{grid-template-columns:1fr}.upi{align-items:flex-start}}</style></head><body class="${template.layout==="modern"?"modern":"classic"}${autoPrint?" auto-print":""}"><div class="toolbar"><button onclick="window.print()" type="button">Print / Save PDF</button></div><main class="invoice"><header class="head"><div class="brand">${logo}<div class="company"><h1>${escapeHtml(companyName)}</h1>${companyLines.map(line=>`<p>${escapeHtml(line)}</p>`).join("")}</div></div><div class="title"><small>${escapeHtml(invoice.invoiceTypeLabel||"INVOICE")}</small><h2>${escapeHtml(invoice.documentNo||invoice.invoiceNumber||"Draft")}</h2><p>Date: ${escapeHtml(invoice.date||"")}</p></div></header><section class="meta"><div><h3>Bill to</h3><p><strong>${escapeHtml(client?.name||"Client")}</strong></p>${client?.contactPerson?`<p>${escapeHtml(client.contactPerson)}</p>`:""}${client?.email?`<p>${escapeHtml(client.email)}</p>`:""}${client?.phone?`<p>${escapeHtml(client.phone)}</p>`:""}${client?.gstin?`<p>GSTIN ${escapeHtml(client.gstin)}</p>`:""}</div><div><h3>Invoice details</h3><p>Type: ${escapeHtml(invoice.invoiceTypeLabel||"")}</p><p>GST applicable: ${invoice.gstApplicable?"Yes":"No"}</p>${invoice.gstApplicable?`<p>GST rate: ${escapeHtml(invoice.gstRate)}%</p>`:""}</div></section><table class="items"><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table><section class="subtotal"><div><span>Subtotal</span><strong>${escapeHtml(formatCurrency(invoice.subtotal,currency))}</strong></div>${invoice.additionalCharges?`<div><span>Additional charges${invoice.additionalChargeName?` (${escapeHtml(invoice.additionalChargeName)})`:""}</span><strong>${escapeHtml(formatCurrency(invoice.additionalCharges,currency))}</strong></div>`:""}${invoice.gstApplicable?`<div><span>GST</span><strong>${escapeHtml(formatCurrency(invoice.gstAmount,currency))}</strong></div>`:""}<div class="grand"><span>Total</span><span>${escapeHtml(formatCurrency(grandTotal,currency))}</span></div><div><span>Advance received</span><strong>${escapeHtml(formatCurrency(invoice.advanceReceived,currency))}</strong></div><div><span>Balance due</span><strong>${escapeHtml(formatCurrency(invoice.balanceDue,currency))}</strong></div></section><p class="words"><strong>Amount in words:</strong> ${escapeHtml(invoice.amountWords||amountInWords(grandTotal))}</p>${bankDetails}${qrBlock}<footer class="footer">${escapeHtml(template.paymentTerms||company.cmp_terms||"Payment is due as agreed.")}${template.footerNote?`\n${escapeHtml(template.footerNote)}`:""}</footer></main>${autoPrint?"<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350),{once:true});</script>":""}</body></html>`;
}
