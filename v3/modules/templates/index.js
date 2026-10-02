const templates=[
  ["invoice-templates","Invoice Template","receipt_long","Sales invoices and company invoice defaults"],
  ["qr-template","Payment QR Template","qr_code_2","UPI QR generated from Company ID and invoice amount"],
  ["voucher-templates","Cheque Voucher","payments","Cheque details and payment purpose"],
  ["voucher-templates","Payment Voucher","payments","Payment record with party and bank details"],
  ["voucher-templates","Receipt Voucher","move_to_inbox","Receipt record with customer and deposit details"],
  ["voucher-templates","Estimate Voucher","request_quote","Estimate and quotation records"],
  ["voucher-templates","Payroll Voucher","groups","Salary journal and payroll records"]
];

export async function init(){
  const list=document.querySelector("#moduleContainer #templatesHubList");
  if(!list) return;
  list.innerHTML=templates.map(([module,title,icon,description])=>`<button class="templates-hub-link" type="button" data-module="${module}" data-template="${title}"><span class="templates-hub-icon material-symbols-rounded">${icon}</span><span class="templates-hub-copy"><strong>${title}</strong><small>${description}</small></span><span class="material-symbols-rounded templates-hub-arrow">chevron_right</span></button>`).join("");
  list.addEventListener("click",event=>{
    const button=event.target.closest("[data-template]");
    if(!button) return;
    sessionStorage.setItem("corebiqTemplateType",button.dataset.template);
  });
  window.COREBIQ?.renderIcons(list);
}