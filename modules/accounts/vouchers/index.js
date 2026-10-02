const voucherLinks=[
  ["contra-voucher","Contra","swap_horiz","Cash and bank transfers"],
  ["payment-voucher","Payments","payments","Supplier and party payments"],
  ["receipt-voucher","Receipts","move_to_inbox","Money received"],
  ["journal-voucher","Journals","menu_book","Accounting adjustments"],
  ["sales-voucher","Sales","point_of_sale","Sales invoices"],
  ["sales-return-voucher","Sales Return","assignment_return","Customer returns and credit notes"],
  ["purchase-voucher","Purchase","shopping_cart","Purchase bills"],
  ["purchase-return-voucher","Purchase Return","keyboard_return","Supplier returns and debit notes"],
  ["estimate-voucher","Estimate","request_quote","Estimates and quotations"],
  ["cheques","Cheque transactions","payments","Cheque register"],
  ["all-vouchers","All vouchers","view_list","Other transaction types"],
  ["payments","Payment register","account_balance_wallet","Payment records"]
];

export async function init(){
  const root=document.querySelector("#moduleContainer #voucherHubList");
  if(!root) return;
  root.innerHTML=voucherLinks.map(([module,label,icon,description])=>`<button class="voucher-hub-link" type="button" data-module="${module}"><span class="voucher-hub-icon material-symbols-rounded">${icon}</span><span class="voucher-hub-copy"><strong>${label}</strong><small>${description}</small></span><span class="material-symbols-rounded voucher-hub-arrow">chevron_right</span></button>`).join("");
  window.COREBIQ?.renderIcons(root);
}