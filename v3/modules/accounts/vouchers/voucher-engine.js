import { createRecord, deleteRecord, getAuthProfile, getCompany, getCompanyLogoBlob, listRecords, updateRecord } from "../../../js/firebase-service.js?v=7";
import { amountInWords, createBuilderInvoiceHtml } from "../../templates/invoice-builder-document.js";
import { companyLogoSource, invoiceMessage } from "../../templates/invoice-document.js";

const field=(key,label,type="text",options)=>({key,label,type,...(options?{options}:{})});
const section=(title,fields)=>({title,fields});
const itemFields=[
  field("gstApplicable","GST Applicable","select",["Yes","No"]),
  field("supplyType","Supply type","select",["Intrastate","Interstate"]),
  field("subTotal","Sub Total","number"),field("discount","Discount","number"),field("taxableAmount","Taxable Amount","number"),
  field("cgst","CGST","number"),field("sgst","SGST","number"),field("igst","IGST","number"),
  field("otherCharges","Other Charges","number"),field("roundOff","Round Off","number"),field("grandTotal","Grand Total","number")
];
const salesItems=[section("Reference",[field("salesOrder","Sales Order"),field("deliveryChallan","Delivery Challan"),field("quotation","Quotation"),field("referenceNumber","Reference Number")])];
const purchaseItems=[section("Reference",[field("purchaseOrder","Purchase Order"),field("grn","GRN"),field("deliveryChallan","Delivery Challan"),field("supplierReference","Supplier Reference")])];
const itemTotals=[section("Totals",itemFields)];
const invoiceAdditional=[section("Additional",[field("notes","Notes","textarea"),field("terms","Terms & Conditions","textarea")])];
const purchaseAdditional=[section("Additional",[field("notes","Notes","textarea")])];
const creditNoteSections=[
  section("Reference",[field("originalDocument","Original Invoice / Bill"),field("reason","Reason"),field("placeOfSupply","Place of Supply")]),
  section("Totals",[field("taxableAmount","Taxable Amount","number"),field("tax","Tax","number"),field("roundOff","Round Off","number"),field("noteTotal","Credit / Debit Note Total","number")]),
  section("Additional",[field("notes","Notes","textarea")])
];

const VOUCHER_CATEGORIES=[
  {name:"Sales",vouchers:[
    {name:"Sales Invoice",dateLabel:"Invoice Date",partyLabel:"Customer",ledgerLabel:"Customer Ledger",sections:[section("Basic Information",[field("invoiceNumber","Invoice Number"),field("dueDate","Due Date","date"),field("customerGstin","Customer GSTIN"),field("placeOfSupply","Place of Supply"),field("billingAddress","Billing Address","textarea"),field("shippingAddress","Shipping Address","textarea")]),...salesItems,...itemTotals,section("Payment",[field("paymentTerms","Payment Terms"),field("paymentMethod","Payment Method"),field("dueAmount","Due Amount","number")]),...invoiceAdditional],items:true},
    {name:"Estimate / Quotation",dateLabel:"Estimate Date",partyLabel:"Customer",ledgerLabel:"Customer Ledger",sections:[section("Basic Information",[field("estimateNumber","Estimate Number"),field("validUntil","Valid Until","date"),field("customerGstin","Customer GSTIN"),field("placeOfSupply","Place of Supply"),field("billingAddress","Billing Address","textarea"),field("shippingAddress","Shipping Address","textarea")]),...salesItems,...itemTotals,section("Additional",[field("notes","Notes","textarea"),field("terms","Terms & Conditions","textarea")])],items:true},
    {name:"Sales Return / Credit Note",dateLabel:"Return Date",partyLabel:"Customer",ledgerLabel:"Customer Ledger",sections:[...creditNoteSections],items:true,creditNote:true},
    {name:"Sales Debit Note",dateLabel:"Debit Note Date",partyLabel:"Customer",ledgerLabel:"Customer Ledger",sections:[...creditNoteSections],items:true,creditNote:true},
    {name:"Credit Note",dateLabel:"Credit Note Date",partyLabel:"Customer",ledgerLabel:"Customer Ledger",sections:[...creditNoteSections],items:true,creditNote:true}
  ]},
  {name:"Purchase",vouchers:[
    {name:"Purchase Bill",dateLabel:"Bill Date",partyLabel:"Supplier",ledgerLabel:"Supplier Ledger",sections:[section("Basic Information",[field("billNumber","Bill Number"),field("dueDate","Due Date","date"),field("supplierGstin","Supplier GSTIN"),field("placeOfSupply","Place of Supply"),field("billingAddress","Billing Address","textarea")]),...purchaseItems,...itemTotals,section("Payment",[field("paymentTerms","Payment Terms"),field("paymentMethod","Payment Method"),field("outstandingAmount","Outstanding Amount","number")]),...purchaseAdditional],items:true},
    {name:"Purchase Return / Debit Note",dateLabel:"Return Date",partyLabel:"Supplier",ledgerLabel:"Supplier Ledger",sections:[...creditNoteSections.map(group=>({...group,fields:group.fields.map(item=>item.key==="originalDocument"?{...item,label:"Original Bill"}:item)}))],items:true,creditNote:true},
    {name:"Purchase Credit Note",dateLabel:"Credit Note Date",partyLabel:"Supplier",ledgerLabel:"Supplier Ledger",sections:[...creditNoteSections],items:true,creditNote:true},
    {name:"Debit Note",dateLabel:"Debit Note Date",partyLabel:"Supplier",ledgerLabel:"Supplier Ledger",sections:[...creditNoteSections],items:true,creditNote:true}
  ]},
  {name:"Receipt",vouchers:[{name:"Receipt Voucher",dateLabel:"Receipt Date",partyLabel:"Customer / Party",ledgerLabel:"Bank / Cash Account",sections:[section("Voucher Information",[field("receiptNumber","Receipt Number"),field("receiptMode","Receipt Mode","select",["Cash","Bank","UPI","Card","Cheque","Other"]),field("referenceNumber","Reference Number")]),section("Transaction",[field("amount","Amount","number"),field("tdsDeducted","TDS Deducted","number"),field("discountAllowed","Discount Allowed","number"),field("adjustment","Adjustment","number"),field("netReceived","Net Received","number")]),section("Allocation",[field("invoice","Invoice"),field("invoiceAmount","Invoice Amount","number"),field("amountReceived","Amount Received","number"),field("balance","Balance","number")]),section("Additional",[field("narration","Narration","textarea")])]}]},
  {name:"Payment",vouchers:[{name:"Payment Voucher",dateLabel:"Payment Date",partyLabel:"Supplier / Party",ledgerLabel:"Bank / Cash Account",sections:[section("Voucher Information",[field("paymentNumber","Payment Number"),field("paymentMode","Payment Mode","select",["Cash","Bank","UPI","Card","Cheque","Other"]),field("referenceNumber","Reference Number")]),section("Transaction",[field("amount","Amount","number"),field("tdsDeducted","TDS Deducted","number"),field("discountReceived","Discount Received","number"),field("adjustment","Adjustment","number"),field("netPaid","Net Paid","number")]),section("Allocation",[field("bill","Bill"),field("billAmount","Bill Amount","number"),field("amountPaid","Amount Paid","number"),field("balance","Balance","number")]),section("Additional",[field("narration","Narration","textarea")])]}]},
  {name:"Banking",vouchers:[{name:"Contra Voucher",dateLabel:"Date",partyLabel:"",ledgerLabel:false,sections:[section("Voucher Information",[field("voucherNumber","Voucher Number"),field("transferType","Transfer Type","select",["Cash to Bank","Bank to Cash","Bank to Bank"])]),section("From Account",[field("fromLedgerId","Ledger","ledger"),field("fromAccountType","Account Type","select",["Cash","Bank"]),field("fromAmount","Amount","number")]),section("To Account",[field("toLedgerId","Ledger","ledger"),field("toAccountType","Account Type","select",["Cash","Bank"]),field("toAmount","Amount","number")]),section("Additional",[field("reference","Reference"),field("narration","Narration","textarea")])]}]},
  {name:"Journal",vouchers:[{name:"Journal Voucher",dateLabel:"Date",partyLabel:"",ledgerLabel:false,journal:true,sections:[section("Voucher Information",[field("journalNumber","Journal Number"),field("reference","Reference")]),section("Additional",[field("narration","Narration","textarea")])]}]},
  {name:"Expense",vouchers:[{name:"Expense Voucher",dateLabel:"Expense Date",partyLabel:"Vendor / Employee",ledgerLabel:"Payment Account",sections:[section("Basic Information",[field("expenseNumber","Expense Number"),field("expenseCategory","Expense Category"),field("referenceNumber","Reference Number")]),section("Expense Details",[field("expenseLedgerId","Expense Ledger","ledger"),field("description","Description"),field("amount","Amount","number"),field("gst","GST","number"),field("tds","TDS","number"),field("netAmount","Net Amount","number")]),section("Additional",[field("costCentre","Cost Centre"),field("project","Project"),field("department","Department"),field("narration","Narration","textarea")])]}]},
  {name:"Advance",vouchers:[
    {name:"Customer Advance",dateLabel:"Date",partyLabel:"Customer",ledgerLabel:"Bank / Cash Account",sections:[section("Advance Information",[field("advanceNumber","Advance Number"),field("amount","Amount","number"),field("gstApplicable","GST Applicable","select",["Yes","No"]),field("gstAmount","GST Amount","number"),field("receiptMode","Receipt Mode","select",["Cash","Bank","UPI","Card","Cheque","Other"]),field("reference","Reference")]),section("Adjustment",[field("invoice","Invoice"),field("adjustedAmount","Adjusted Amount","number"),field("balanceAdvance","Balance Advance","number")]),section("Additional",[field("narration","Narration","textarea")])]},
    {name:"Supplier Advance",dateLabel:"Date",partyLabel:"Supplier",ledgerLabel:"Bank / Cash Account",sections:[section("Advance Information",[field("advanceNumber","Advance Number"),field("amount","Amount","number"),field("paymentMode","Payment Mode","select",["Cash","Bank","UPI","Card","Cheque","Other"]),field("reference","Reference")]),section("Adjustment",[field("purchaseBill","Purchase Bill"),field("adjustedAmount","Adjusted Amount","number"),field("balanceAdvance","Balance Advance","number")]),section("Additional",[field("narration","Narration","textarea")])]} 
  ]},
  {name:"Transfer",vouchers:[{name:"Fund Transfer",dateLabel:"Date",partyLabel:"",ledgerLabel:false,sections:[section("Transfer",[field("fromLedgerId","From Account","ledger"),field("toLedgerId","To Account","ledger"),field("amount","Amount","number"),field("reference","Reference"),field("narration","Narration","textarea")])]}]},
  {name:"Tax",vouchers:[{name:"Tax Adjustment",dateLabel:"Date",partyLabel:"",ledgerLabel:false,sections:[section("Tax Information",[field("adjustmentNumber","Adjustment Number"),field("taxType","Tax Type","select",["GST","TDS","TCS","Other"]),field("taxPeriod","Tax Period"),field("reference","Reference"),field("reason","Reason","textarea")]),section("Adjustment",[field("inputCgst","Input CGST","number"),field("inputSgst","Input SGST","number"),field("inputIgst","Input IGST","number"),field("outputCgst","Output CGST","number"),field("outputSgst","Output SGST","number"),field("outputIgst","Output IGST","number"),field("tds","TDS","number"),field("tcs","TCS","number"),field("otherTax","Other Tax","number")]),section("Additional",[field("narration","Narration","textarea")])]}]},
  {name:"Payroll",vouchers:[
    {name:"Salary Journal",dateLabel:"Pay Date",partyLabel:"",ledgerLabel:false,sections:[section("Payroll Information",[field("salaryMonth","Salary Month","month"),field("payrollBatch","Payroll Batch"),field("department","Department")]),section("Salary Components",[field("basicSalary","Basic Salary","number"),field("allowances","Allowances","number"),field("bonus","Bonus","number"),field("overtime","Overtime","number"),field("grossSalary","Gross Salary","number"),field("pf","PF","number"),field("esi","ESI","number"),field("tds","TDS","number"),field("otherDeductions","Other Deductions","number"),field("netSalary","Net Salary","number")]),section("Accounting",[field("salaryExpenseLedgerId","Salary Expense","ledger"),field("employerPf","Employer PF","number"),field("employerEsi","Employer ESI","number"),field("salaryPayableLedgerId","Salary Payable","ledger"),field("pfPayableLedgerId","PF Payable","ledger"),field("esiPayableLedgerId","ESI Payable","ledger"),field("tdsPayableLedgerId","TDS Payable","ledger")])]},
    {name:"Salary Payment",dateLabel:"Payment Date",partyLabel:"Employee",ledgerLabel:"Bank / Cash Account",sections:[section("Payroll Information",[field("salaryMonth","Salary Month","month"),field("payrollBatch","Payroll Batch"),field("department","Department"),field("amount","Salary Payment","number"),field("reference","Reference")]),section("Additional",[field("narration","Narration","textarea")])]} 
  ]},
  {name:"Asset",vouchers:[
    {name:"Asset Purchase",dateLabel:"Purchase Date",partyLabel:"Supplier",ledgerLabel:"Asset Ledger",sections:[section("Asset Information",[field("assetName","Asset Name"),field("assetCategory","Asset Category"),field("quantity","Quantity","number"),field("cost","Cost","number"),field("gst","GST","number"),field("totalCost","Total Cost","number"),field("location","Location"),field("invoiceNumber","Invoice Number")]),section("Asset Register",[field("assetId","Asset ID"),field("serialNumber","Serial Number"),field("capitalizationDate","Capitalization Date","date"),field("usefulLife","Useful Life (years)","number"),field("depreciationMethod","Depreciation Method"),field("depreciationRate","Depreciation Rate","number"),field("residualValue","Residual Value","number")])]},
    {name:"Asset Sale",dateLabel:"Sale Date",partyLabel:"Buyer",ledgerLabel:"Asset Ledger",sections:[section("Asset Information",[field("assetId","Asset ID"),field("assetName","Asset Name"),field("saleValue","Sale Value","number"),field("gst","GST","number"),field("totalValue","Total Value","number")]),section("Accounting",[field("originalCost","Original Cost","number"),field("accumulatedDepreciation","Accumulated Depreciation","number"),field("bookValue","Book Value","number"),field("profitLoss","Profit / Loss","number")])]} 
  ]},
  {name:"Adjustment",vouchers:[
    {name:"Credit / Debit Adjustment",dateLabel:"Date",partyLabel:"Party",ledgerLabel:"Ledger",sections:[section("Adjustment",[field("adjustmentType","Adjustment Type","select",["Credit","Debit"]),field("amount","Amount","number"),field("reason","Reason"),field("reference","Reference"),field("narration","Narration","textarea")])]},
    {name:"Opening Balance",dateLabel:"Opening Date",partyLabel:"",ledgerLabel:"Ledger",sections:[section("Opening Balance",[field("financialYear","Financial Year"),field("debit","Debit","number"),field("credit","Credit","number"),field("openingReference","Opening Reference"),field("narration","Narration","textarea")])]} 
  ]}
];

const ACCOUNTING_FIELDS={
  "Sales Invoice":[section("Accounting",[field("salesLedgerId","Sales Ledger","ledger"),field("outputCgstLedgerId","Output CGST Ledger","ledger"),field("outputSgstLedgerId","Output SGST Ledger","ledger"),field("outputIgstLedgerId","Output IGST Ledger","ledger")])],
  "Sales Return / Credit Note":[section("Accounting",[field("salesReturnLedgerId","Sales Return Ledger","ledger"),field("outputCgstLedgerId","Output CGST Ledger","ledger"),field("outputSgstLedgerId","Output SGST Ledger","ledger"),field("outputIgstLedgerId","Output IGST Ledger","ledger")])],
  "Sales Debit Note":[section("Accounting",[field("salesLedgerId","Sales Ledger","ledger"),field("outputCgstLedgerId","Output CGST Ledger","ledger"),field("outputSgstLedgerId","Output SGST Ledger","ledger"),field("outputIgstLedgerId","Output IGST Ledger","ledger")])],
  "Credit Note":[section("Accounting",[field("salesReturnLedgerId","Sales Return Ledger","ledger"),field("outputCgstLedgerId","Output CGST Ledger","ledger"),field("outputSgstLedgerId","Output SGST Ledger","ledger"),field("outputIgstLedgerId","Output IGST Ledger","ledger")])],
  "Purchase Bill":[section("Accounting",[field("purchaseLedgerId","Purchase / Expense Ledger","ledger"),field("inputCgstLedgerId","Input CGST Ledger","ledger"),field("inputSgstLedgerId","Input SGST Ledger","ledger"),field("inputIgstLedgerId","Input IGST Ledger","ledger")])],
  "Purchase Return / Debit Note":[section("Accounting",[field("purchaseReturnLedgerId","Purchase Return Ledger","ledger"),field("inputCgstLedgerId","Input CGST Ledger","ledger"),field("inputSgstLedgerId","Input SGST Ledger","ledger"),field("inputIgstLedgerId","Input IGST Ledger","ledger")])],
  "Purchase Credit Note":[section("Accounting",[field("purchaseReturnLedgerId","Purchase Return Ledger","ledger"),field("inputCgstLedgerId","Input CGST Ledger","ledger"),field("inputSgstLedgerId","Input SGST Ledger","ledger"),field("inputIgstLedgerId","Input IGST Ledger","ledger")])],
  "Debit Note":[section("Accounting",[field("purchaseReturnLedgerId","Purchase Return Ledger","ledger"),field("inputCgstLedgerId","Input CGST Ledger","ledger"),field("inputSgstLedgerId","Input SGST Ledger","ledger"),field("inputIgstLedgerId","Input IGST Ledger","ledger")])],
  "Receipt Voucher":[section("Accounting",[field("partyLedgerId","Customer / Party Ledger","ledger")])],
  "Payment Voucher":[section("Accounting",[field("partyLedgerId","Supplier / Party Ledger","ledger")])],
  "Customer Advance":[section("Accounting",[field("partyLedgerId","Customer Ledger","ledger"),field("advanceLedgerId","Customer Advances Ledger","ledger")])],
  "Supplier Advance":[section("Accounting",[field("partyLedgerId","Supplier Ledger","ledger"),field("advanceLedgerId","Supplier Advances Ledger","ledger")])],
  "Tax Adjustment":[section("Accounting Ledgers",[field("inputCgstLedgerId","Input CGST Ledger","ledger"),field("inputSgstLedgerId","Input SGST Ledger","ledger"),field("inputIgstLedgerId","Input IGST Ledger","ledger"),field("outputCgstLedgerId","Output CGST Ledger","ledger"),field("outputSgstLedgerId","Output SGST Ledger","ledger"),field("outputIgstLedgerId","Output IGST Ledger","ledger"),field("tdsLedgerId","TDS Ledger","ledger"),field("tcsLedgerId","TCS Ledger","ledger")])],
  "Salary Payment":[section("Accounting",[field("salaryPayableLedgerId","Salary Payable Ledger","ledger")])],
  "Asset Purchase":[section("Accounting",[field("supplierLedgerId","Supplier Ledger","ledger")])],
  "Asset Sale":[section("Accounting",[field("buyerLedgerId","Buyer Ledger","ledger"),field("accumulatedDepreciationLedgerId","Accumulated Depreciation Ledger","ledger"),field("gainLossLedgerId","Profit / Loss Ledger","ledger")])]
};

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
}
function money(value,currency="INR"){
  const number=Number(value)||0;
  try{return new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(number);}
  catch{return `${currency} ${number.toFixed(2)}`;}
}
function amountOf(record){
  const details=record.details||{};
  return Number(details.grandTotal??details.noteTotal??details.netReceived??details.netPaid??details.netAmount??details.totalCost??details.totalValue??details.saleValue??details.amount??details.netSalary??details.grossSalary??details.fromAmount??details.debit??details.credit??record.amount)||0;
}
function getVoucher(category,type){
  return VOUCHER_CATEGORIES.find(group=>group.name===category)?.vouchers.find(voucher=>voucher.name===type);
}
function financialYear(startMonth="April",date=new Date()){
  const startMonthIndex=new Date(`${startMonth} 1, 2000`).getMonth();
  const startYear=date.getMonth()>=startMonthIndex?date.getFullYear():date.getFullYear()-1;
  return `${startYear}-${String((startYear+1)%100).padStart(2,"0")}`;
}

export async function initVoucherModule({fixedCategory="",fixedVoucherType=""}={}){
  const root=document.querySelector("#moduleContainer .tx-module-root");
  if(!root) return;
  root.innerHTML=`<div class="page-header"><div class="page-title"><div class="page-title-icon"><span class="material-symbols-rounded">account_balance</span></div><div><h1>Transactions</h1><p>Vouchers, ledger references, and accounting entries.</p></div></div><div class="actions"><button class="btn btn-outline" id="txRefresh" type="button" title="Refresh"><span class="material-symbols-rounded">refresh</span><span>Refresh</span></button><button class="btn btn-primary" id="txCreate" type="button"><span class="material-symbols-rounded">add</span><span>New Transaction</span></button></div></div>
    <div class="card card-pad tx-register"><div class="tx-toolbar"><input class="input-search" id="txSearch" type="search" placeholder="Search vouchers, parties, or ledgers" aria-label="Search transactions"><select class="form-control" id="txCategoryFilter" aria-label="Filter transactions"><option value="">All categories</option>${VOUCHER_CATEGORIES.map(category=>`<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join("")}</select></div><p class="tx-feedback" id="txFeedback" role="status" hidden></p><div class="table-wrap"><table class="data-table tx-table"><thead><tr><th>Voucher No.</th><th>Date</th><th>Category / Voucher</th><th>Party</th><th>Ledger</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody id="txRows"></tbody></table></div></div>
    <dialog class="crud-dialog tx-dialog" id="txDialog"><form id="txForm"><div class="crud-dialog-header"><h2 id="txDialogTitle">New Transaction</h2><button class="icon-button" id="txClose" type="button" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><input type="hidden" name="recordId"><div class="tx-document-number"><span>Voucher Number</span><strong id="txDocumentNo">Assigned on save</strong></div><section class="form-section"><h3 class="form-section-title">Voucher Information</h3><div class="form-grid"><div class="form-group"><label for="txCategory">Transaction Category <span class="req">*</span></label><select class="form-control" id="txCategory" required>${VOUCHER_CATEGORIES.map(category=>`<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join("")}</select></div><div class="form-group"><label for="txVoucherType">Voucher / Form Type <span class="req">*</span></label><select class="form-control" id="txVoucherType" required></select></div><div class="form-group"><label id="txDateLabel" for="txDate">Transaction Date <span class="req">*</span></label><input class="form-control" id="txDate" type="date" required></div><div class="form-group tx-party-group"><label id="txPartyLabel" for="txParty">Party</label><input class="form-control" id="txParty" type="text"></div><div class="form-group tx-ledger-group"><label id="txLedgerLabel" for="txLedger">Linked Ledger</label><select class="form-control" id="txLedger"></select></div><div class="form-group"><label for="txReference">Reference Number</label><input class="form-control" id="txReference"></div><div class="form-group"><label for="txFinancialYear">Financial Year</label><input class="form-control" id="txFinancialYear" value="${financialYear()}"></div><div class="form-group"><label for="txBranch">Branch</label><select class="form-control" id="txBranch"><option value="">No branch</option></select></div><div class="form-group"><label for="txCurrency">Currency</label><input class="form-control" id="txCurrency" value="INR" maxlength="3"></div><div class="form-group"><label for="txExchangeRate">Exchange Rate</label><input class="form-control" id="txExchangeRate" type="number" min="0" step="any" value="1"></div></div></section><div id="txVoucherFields"></div><section class="form-section tx-common-additional"><h3 class="form-section-title">Additional</h3><div class="form-grid"><div class="form-group"><label for="txCostCentre">Cost Centre</label><input class="form-control" id="txCostCentre"></div><div class="form-group"><label for="txProject">Project</label><input class="form-control" id="txProject"></div><div class="form-group"><label for="txDepartment">Department</label><input class="form-control" id="txDepartment"></div><div class="form-group span-2"><label for="txNarration">Description / Narration</label><textarea class="form-control" id="txNarration" rows="3"></textarea></div><div class="form-group"><label for="txAttachment">Attachment Link</label><input class="form-control" id="txAttachment" type="url" placeholder="https://..."></div><div class="form-group"><label for="txStatus">Status</label><select class="form-control" id="txStatus"><option>Draft</option><option>Posted</option><option>Cancelled</option></select></div></div></section><p class="tx-form-error" id="txFormError" role="alert" hidden></p><div class="form-actions"><button class="btn btn-outline" id="txCancel" type="button">Cancel</button><button class="btn btn-primary" id="txSave" type="submit"><span class="material-symbols-rounded">save</span><span>Save Transaction</span></button></div></form></dialog>`;

  const form=root.querySelector("#txForm");
  const dialog=root.querySelector("#txDialog");
  const rows=root.querySelector("#txRows");
  const feedback=root.querySelector("#txFeedback");
  const formError=root.querySelector("#txFormError");
  const categorySelect=root.querySelector("#txCategory");
  const voucherSelect=root.querySelector("#txVoucherType");
  let ledgers=[];
  let branches=[];
  let inventoryItems=[];
  let clients=[];
  let records=[];
  let company={};
  let editingRecord=null;
  let financialYearManuallyEdited=false;
  const fixedVoucher=Boolean(fixedVoucherType);
  if(fixedVoucher){
    root.querySelector(".page-title h1").textContent=fixedVoucherType;
    root.querySelector(".page-title p").textContent=`${fixedCategory} voucher register.`;
    root.querySelector("#txCreate span:last-child").textContent=`New ${fixedVoucherType}`;
    categorySelect.closest(".form-group").hidden=true;
    voucherSelect.closest(".form-group").hidden=true;
    root.querySelector("#txCategoryFilter").hidden=true;
    categorySelect.value=fixedCategory;
    categorySelect.disabled=true;
    voucherSelect.disabled=true;
  }

  function ledgerLabel(ledger){
    const path=[ledger.category,ledger.accountGroup].filter(Boolean).join(" / ");
    return `${ledger.name||ledger.id}${path?` · ${path}`:""}`;
  }
  function configuredBanks(){
    return ledgers.filter(ledger=>ledger.accountType==="Bank"&&!ledger.systemDefault&&(ledger.bankName||ledger.accountNumber||ledger.ifsc));
  }
  function ledgerOptions(selected="",accountKind="all",paymentMode=""){
    let choices=ledgers;
    if(accountKind==="cash-bank"){
      const banks=configuredBanks();
      choices=paymentMode==="Cash"?ledgers.filter(ledger=>ledger.accountType==="Cash"):paymentMode?banks:ledgers.filter(ledger=>ledger.accountType==="Cash"||banks.some(bank=>bank.id===ledger.id));
    }
    if(selected&&!choices.some(ledger=>ledger.id===selected)){
      const existing=ledgers.find(ledger=>ledger.id===selected);
      if(existing) choices=[existing,...choices];
    }
    return `<option value="">Select ledger</option>${choices.map(ledger=>`<option value="${escapeHtml(ledger.id)}"${ledger.id===selected?" selected":""}>${escapeHtml(ledgerLabel(ledger))}</option>`).join("")}`;
  }
  function populateLedgerSelect(select,selected="",accountKind="all",paymentMode=""){
    select.innerHTML=ledgerOptions(selected,accountKind,paymentMode);
  }
  function primaryLedgerKind(voucher){
    return ["Bank / Cash Account","Payment Account"].includes(voucher.ledgerLabel)?"cash-bank":"all";
  }
  function paymentModeFor(voucher){
    const key=voucher.name==="Payment Voucher"||voucher.name==="Supplier Advance"?"paymentMode":"receiptMode";
    return root.querySelector(`[data-voucher-field="${key}"]`)?.value||"";
  }
  function syncPrimaryLedgerOptions(voucher,selected=root.querySelector("#txLedger").value){
    populateLedgerSelect(root.querySelector("#txLedger"),selected,primaryLedgerKind(voucher),paymentModeFor(voucher));
  }
  function renderBranchOptions(selected=""){
    root.querySelector("#txBranch").innerHTML=`<option value="">No branch</option>${branches.map(branch=>`<option value="${escapeHtml(branch.id)}"${branch.id===selected?" selected":""}>${escapeHtml(branch.name||branch.id)}</option>`).join("")}`;
  }
  function renderField(item,values={}){
    const value=values[item.key]??item.defaultValue??(item.key==="gstApplicable"?"Yes":"");
    const required=item.required||item.type==="ledger"?" required":"";
    const label=`<label>${escapeHtml(item.label)}${item.required?' <span class="req">*</span>':""}</label>`;
    if(item.type==="ledger") return `<div class="form-group"><label for="txField_${escapeHtml(item.key)}">${escapeHtml(item.label)}${item.required?' <span class="req">*</span>':""}</label><select class="form-control" id="txField_${escapeHtml(item.key)}" data-voucher-field="${escapeHtml(item.key)}"${required}>${ledgerOptions(value,["fromLedgerId","toLedgerId"].includes(item.key)?"cash-bank":"all")}</select></div>`;
    if(item.type==="select") return `<div class="form-group"><label for="txField_${escapeHtml(item.key)}">${escapeHtml(item.label)}${item.required?' <span class="req">*</span>':""}</label><select class="form-control" id="txField_${escapeHtml(item.key)}" data-voucher-field="${escapeHtml(item.key)}"${required}><option value="">Select</option>${item.options.map(option=>`<option value="${escapeHtml(option)}"${String(value)===option?" selected":""}>${escapeHtml(option)}</option>`).join("")}</select></div>`;
    if(item.type==="textarea") return `<div class="form-group span-2"><label for="txField_${escapeHtml(item.key)}">${escapeHtml(item.label)}</label><textarea class="form-control" id="txField_${escapeHtml(item.key)}" data-voucher-field="${escapeHtml(item.key)}" rows="3">${escapeHtml(value)}</textarea></div>`;
    const readonly=item.readOnly?" readonly":"";
    return `<div class="form-group"><label for="txField_${escapeHtml(item.key)}">${escapeHtml(item.label)}${item.required?' <span class="req">*</span>':""}</label><input class="form-control" id="txField_${escapeHtml(item.key)}" data-voucher-field="${escapeHtml(item.key)}" type="${escapeHtml(item.type||"text")}" value="${escapeHtml(value)}"${item.type==="number"?' min="0" step="any"':""}${readonly}${required}></div>`;
  }
  function itemRow(values={},inventoryItems=[]){
    const selectedRef=values.catalogRef||`${values.itemType||""}:${values.itemId||""}`;
    const itemOptions=inventoryItems.map(item=>`<option value="${escapeHtml(`${item.type}:${item.id}`)}"${selectedRef===`${item.type}:${item.id}`?" selected":""}>${escapeHtml(item.name)} · ${item.type==="product"?"Product":"Service"}</option>`).join("");
    return `<article class="tx-item-row"><label>Inventory Item / Service<select class="form-control" data-item-field="catalogRef"><option value="">Select catalog item</option>${itemOptions}</select></label><label>Category<input class="form-control" data-item-field="itemCategory" value="${escapeHtml(values.itemCategory||"")}"></label><label>Description<input class="form-control" data-item-field="description" value="${escapeHtml(values.description||values.item||"")}"></label><label>HSN / SAC<input class="form-control" data-item-field="hsn" value="${escapeHtml(values.hsn||values.sac||"")}"></label><label>Qty<input class="form-control" data-item-field="quantity" type="number" min="0" step="any" value="${escapeHtml(values.quantity??1)}"></label><label>Unit<input class="form-control" data-item-field="unit" value="${escapeHtml(values.unit||"")}"></label><label>Rate<input class="form-control" data-item-field="rate" type="number" min="0" step="any" value="${escapeHtml(values.rate??"")}"></label><label>Discount<input class="form-control" data-item-field="discount" type="number" min="0" step="any" value="${escapeHtml(values.discount??"")}"></label><label>GST %<input class="form-control" data-item-field="gstRate" type="number" min="0" step="any" value="${escapeHtml(values.gstRate??"")}"></label><div class="tx-item-tax" data-item-tax></div><button class="icon-button tx-remove-row" type="button" data-action="remove-item" aria-label="Remove item"><span class="material-symbols-rounded">delete</span></button></article>`;
  }
  function journalRow(values={}){
    return `<article class="tx-journal-row"><select class="form-control" data-journal-field="ledgerId" aria-label="Ledger">${ledgerOptions(values.ledgerId||"")}</select><input class="form-control" data-journal-field="description" value="${escapeHtml(values.description||"")}" placeholder="Description"><input class="form-control" data-journal-field="debit" type="number" min="0" step="any" value="${escapeHtml(values.debit??"")}" placeholder="Debit"><input class="form-control" data-journal-field="credit" type="number" min="0" step="any" value="${escapeHtml(values.credit??"")}" placeholder="Credit"><input class="form-control" data-journal-field="costCentre" value="${escapeHtml(values.costCentre||"")}" placeholder="Cost centre / project"><button class="icon-button tx-remove-row" type="button" data-action="remove-journal" aria-label="Remove journal line"><span class="material-symbols-rounded">delete</span></button></article>`;
  }
  function readItemRows(){
    const mode=root.querySelector('[data-voucher-field="supplyType"]')?.value||"Intrastate";
    const gstEnabled=root.querySelector('[data-voucher-field="gstApplicable"]')?.value!=="No";
    return [...root.querySelectorAll(".tx-item-row")].map(row=>{
      const values=Object.fromEntries([...row.querySelectorAll("[data-item-field]")].map(input=>[input.dataset.itemField,["quantity","rate","discount","gstRate"].includes(input.dataset.itemField)?Number(input.value)||0:input.value.trim()]));
      const separator=values.catalogRef.indexOf(":");
      const itemType=separator<0?"":values.catalogRef.slice(0,separator);
      const itemId=separator<0?"":values.catalogRef.slice(separator+1);
      const selected=inventoryItems.find(item=>item.type===itemType&&item.id===itemId);
      delete values.catalogRef;
      const subTotal=values.quantity*values.rate;
      const taxableValue=Math.max(0,subTotal-values.discount);
      const tax=gstEnabled?taxableValue*values.gstRate/100:0;
      return {...values,item:selected?.name||values.description,itemId,itemType,itemCategory:selected?.category||values.itemCategory||"",taxableValue,cgst:mode==="Interstate"?0:tax/2,sgst:mode==="Interstate"?0:tax/2,igst:mode==="Interstate"?tax:0,tax,lineTotal:taxableValue+tax};
    });
  }
  function readJournalRows(){
    return [...root.querySelectorAll(".tx-journal-row")].map(row=>Object.fromEntries([...row.querySelectorAll("[data-journal-field]")].map(input=>[input.dataset.journalField,["debit","credit"].includes(input.dataset.journalField)?Number(input.value)||0:input.value.trim()])));
  }
  function setDetailValue(key,value){
    const input=root.querySelector(`[data-voucher-field="${CSS.escape(key)}"]`);
    if(input) input.value=Number.isFinite(Number(value))?String(value):"0";
  }
  function updateItemTotals(){
    const mode=root.querySelector('[data-voucher-field="supplyType"]')?.value||"Intrastate";
    const gstEnabled=root.querySelector('[data-voucher-field="gstApplicable"]')?.value!=="No";
    const totals={subTotal:0,discount:0,taxableAmount:0,cgst:0,sgst:0,igst:0,grandTotal:0};
    root.querySelectorAll(".tx-item-row").forEach(row=>{
      const val=key=>row.querySelector(`[data-item-field="${key}"]`)?.value;
      const quantity=Number(val("quantity"))||0;
      const rate=Number(val("rate"))||0;
      const discount=Number(val("discount"))||0;
      const taxRate=Number(val("gstRate"))||0;
      const subTotal=quantity*rate;
      const taxable=Math.max(0,subTotal-discount);
      const tax=gstEnabled?taxable*taxRate/100:0;
      const cgst=mode==="Interstate"?0:tax/2;
      const sgst=mode==="Interstate"?0:tax/2;
      const igst=mode==="Interstate"?tax:0;
      const lineTotal=taxable+tax;
      Object.assign(totals,{subTotal:totals.subTotal+subTotal,discount:totals.discount+discount,taxableAmount:totals.taxableAmount+taxable,cgst:totals.cgst+cgst,sgst:totals.sgst+sgst,igst:totals.igst+igst,grandTotal:totals.grandTotal+lineTotal});
      row.querySelector("[data-item-tax]").textContent=`Taxable ${money(taxable,company.cmp_currency||"INR")} · CGST ${money(cgst,company.cmp_currency||"INR")} · SGST ${money(sgst,company.cmp_currency||"INR")} · IGST ${money(igst,company.cmp_currency||"INR")} · Total ${money(lineTotal,company.cmp_currency||"INR")}`;
    });
    const otherCharges=Number(root.querySelector('[data-voucher-field="otherCharges"]')?.value)||0;
    const roundOff=Number(root.querySelector('[data-voucher-field="roundOff"]')?.value)||0;
    totals.grandTotal+=otherCharges+roundOff;
    Object.entries(totals).forEach(([key,value])=>setDetailValue(key,value.toFixed(2)));
  }
  function updateJournalTotals(){
    const lines=readJournalRows();
    const debit=lines.reduce((sum,line)=>sum+line.debit,0);
    const credit=lines.reduce((sum,line)=>sum+line.credit,0);
    root.querySelector("#txJournalTotals").textContent=`Total Debit ${money(debit,company.cmp_currency||"INR")} · Total Credit ${money(credit,company.cmp_currency||"INR")} · Difference ${money(Math.abs(debit-credit),company.cmp_currency||"INR")}`;
    return {lines,debit,credit};
  }
  function renderVoucherFields(voucher,values={}){
    const target=root.querySelector("#txVoucherFields");
    const groups=[...voucher.sections,...(ACCOUNTING_FIELDS[voucher.name]||[])];
    target.innerHTML=groups.map(group=>`<section class="form-section"><h3 class="form-section-title">${escapeHtml(group.title)}</h3><div class="form-grid">${group.fields.map(item=>renderField(item,values)).join("")}</div></section>`).join("");
    if(voucher.items){
      const savedItems=values.items?.length?values.items:[{}];
      target.insertAdjacentHTML("beforeend",`<section class="form-section"><div class="tx-section-heading"><h3 class="form-section-title">Item Details</h3><button class="btn btn-outline tx-small-button" type="button" data-action="add-item"><span class="material-symbols-rounded">add</span><span>Add item</span></button></div><div class="tx-items">${savedItems.map(item=>itemRow(item,inventoryItems)).join("")}</div></section>`);
      target.querySelectorAll('[data-item-field="catalogRef"]').forEach(select=>select.addEventListener("change",()=>{
        const [itemType,...idParts]=select.value.split(":");
        const selected=inventoryItems.find(item=>item.type===itemType&&item.id===idParts.join(":"));
        const row=select.closest(".tx-item-row");
        if(selected){
          row.querySelector('[data-item-field="description"]').value=selected.name||"";
          row.querySelector('[data-item-field="itemCategory"]').value=selected.category||"";
          row.querySelector('[data-item-field="hsn"]').value=selected.hsn||selected.sac||"";
          row.querySelector('[data-item-field="unit"]').value=selected.unit||"";
          row.querySelector('[data-item-field="rate"]').value=String(Number(selected.price)||0);
          row.querySelector('[data-item-field="gstRate"]').value=String(Number(selected.gstRate)||Number(company.cmp_tax_rate)||0);
        }
        updateItemTotals();
      }));
    }
    if(voucher.journal){
      const lines=values.journalEntries?.length?values.journalEntries:[{},{}];
      target.insertAdjacentHTML("beforeend",`<section class="form-section"><div class="tx-section-heading"><h3 class="form-section-title">Journal Lines</h3><button class="btn btn-outline tx-small-button" type="button" data-action="add-journal"><span class="material-symbols-rounded">add</span><span>Add line</span></button></div><div class="tx-journal-head"><span>Ledger</span><span>Description</span><span>Debit</span><span>Credit</span><span>Cost Centre / Project</span><span></span></div><div class="tx-journal-lines">${lines.map(journalRow).join("")}</div><output class="tx-journal-totals" id="txJournalTotals"></output></section>`);
      updateJournalTotals();
    }
    root.querySelectorAll("[data-voucher-field]").forEach(input=>input.addEventListener("input",()=>{if(voucher.items) updateItemTotals();}));
    root.querySelectorAll('[data-voucher-field="receiptMode"],[data-voucher-field="paymentMode"]').forEach(input=>input.addEventListener("change",()=>syncPrimaryLedgerOptions(voucher,"")));
    if(voucher.items) updateItemTotals();
  }
  function syncVoucherType(selected=""){
    const category=VOUCHER_CATEGORIES.find(group=>group.name===categorySelect.value)||VOUCHER_CATEGORIES[0];
    voucherSelect.innerHTML=category.vouchers.map(voucher=>`<option value="${escapeHtml(voucher.name)}">${escapeHtml(voucher.name)}</option>`).join("");
    voucherSelect.value=category.vouchers.some(voucher=>voucher.name===selected)?selected:category.vouchers[0].name;
    renderCurrentVoucher();
  }
  function renderCurrentVoucher(details={}){
    const voucher=getVoucher(categorySelect.value,voucherSelect.value);
    if(!voucher) return;
    root.querySelector("#txDateLabel").innerHTML=`${escapeHtml(voucher.dateLabel||"Transaction Date")} <span class="req">*</span>`;
    const partyGroup=root.querySelector(".tx-party-group");
    partyGroup.hidden=!voucher.partyLabel;
    root.querySelector("#txPartyLabel").textContent=voucher.partyLabel||"Party";
    const ledgerGroup=root.querySelector(".tx-ledger-group");
    ledgerGroup.hidden=voucher.ledgerLabel===false;
    const ledger=root.querySelector("#txLedger");
    ledger.required=voucher.ledgerLabel!==false;
    root.querySelector("#txLedgerLabel").textContent=voucher.ledgerLabel||"Linked Ledger";
    renderVoucherFields(voucher,details);
    syncPrimaryLedgerOptions(voucher);
  }
  function captureDetails(){
    const details={};
    root.querySelectorAll("[data-voucher-field]").forEach(input=>{
      if(input.type==="number") details[input.dataset.voucherField]=Number(input.value)||0;
      else details[input.dataset.voucherField]=input.value.trim();
    });
    if(root.querySelector(".tx-item-row")) details.items=readItemRows();
    if(root.querySelector(".tx-journal-row")) details.journalEntries=readJournalRows();
    return details;
  }
  function ledgerFor(id){return ledgers.find(ledger=>ledger.id===id);}
  function getRowLedgerName(record){
    if(record.ledgerName) return record.ledgerName;
    if(record.ledgerId) return ledgerFor(record.ledgerId)?.name||"Linked ledger";
    const first=record.details?.journalEntries?.find(line=>line.ledgerId);
    return first?ledgerFor(first.ledgerId)?.name||"Journal ledgers":"—";
  }
  function getVoucherClient(record){
    const details=record.details||{};
    return clients.find(client=>client.id===record.clientId||client.id===details.clientId)||clients.find(client=>client.name===(record.partyName||record.customer))||null;
  }
  function getVoucherPaymentQr(record,amount){
    const upiId=String(company.cmp_upi_id||"").trim();
    if(!upiId) return "";
    const query=new URLSearchParams({pa:upiId,pn:company.cmp_name||"",am:Number(amount||0).toFixed(2),cu:record.currency||company.cmp_currency||"INR",tn:record.documentNo||record.reference||"Invoice payment"});
    return `upi://pay?${query.toString()}`;
  }
  async function getVoucherInvoiceHtml(record){
    const details=record.details||{};
    const amount=amountOf(record);
    const currency=record.currency||company.cmp_currency||"INR";
    const template=company.invoiceTemplate||{};
    const client=getVoucherClient(record);
    const bank=ledgers.find(item=>item.id===template.billingBankId)||(configuredBanks().length===1?configuredBanks()[0]:null);
    const invoice={
      ...details,documentNo:record.documentNo||record.reference,date:record.date,invoiceTypeLabel:record.voucherType||record.type||"Sales Invoice",
      customer:record.partyName||record.customer||client?.name||"",items:(details.items||[]).map(item=>({...item,amount:item.lineTotal??item.amount})),
      subtotal:details.taxableAmount??details.subTotal??amount,additionalCharges:details.otherCharges||0,
      gstApplicable:details.gstApplicable!=="No",gstRate:details.items?.[0]?.gstRate||0,gstAmount:(Number(details.cgst)||0)+(Number(details.sgst)||0)+(Number(details.igst)||0),
      amount,advanceReceived:details.advanceReceived||0,balanceDue:details.dueAmount??Math.max(0,amount-(Number(details.advanceReceived)||0)),
      amountWords:amountInWords(amount,currency),currency
    };
    let logoDataUrl=companyLogoSource(company);
    if(!logoDataUrl&&company.cmp_logo){
      try{
        const reader=new FileReader();
        const blob=await getCompanyLogoBlob(company.cmp_logo);
        logoDataUrl=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
      }catch{}
    }
    const html=createBuilderInvoiceHtml({invoice,client,company,bank,template,logoDataUrl,paymentQr:getVoucherPaymentQr(record,amount),autoPrint:true});
    const invoiceDocument=new DOMParser().parseFromString(html,"text/html");
    const table=invoiceDocument.querySelector(".items");
    if(table){
      const headers=["Description","Category","HSN / SAC","Qty","Rate","GST %","CGST","SGST","IGST","Amount"];
      table.querySelector("thead tr").replaceChildren(...headers.map(label=>{const cell=document.createElement("th");cell.textContent=label;return cell;}));
      const body=table.querySelector("tbody");
      body.replaceChildren(...(invoice.items||[]).map(item=>{
        const row=document.createElement("tr");
        const values=[item.description,item.itemCategory,item.hsn||item.sac,item.quantity,formatCurrency(item.rate,currency),`${Number(item.gstRate)||0}%`,formatCurrency(item.cgst||0,currency),formatCurrency(item.sgst||0,currency),formatCurrency(item.igst||0,currency),formatCurrency(item.amount,currency)];
        values.forEach(value=>{const cell=document.createElement("td");cell.textContent=String(value??"--");row.append(cell);});
        return row;
      }));
    }
    const subtotal=invoiceDocument.querySelector(".subtotal");
    if(subtotal&&(invoice.cgst||invoice.sgst||invoice.igst)){
      const gstLine=[...subtotal.children].find(row=>row.firstElementChild?.textContent.trim()==="GST");
      gstLine?.remove();
      const grand=subtotal.querySelector(".grand");
      [["CGST",invoice.cgst],["SGST",invoice.sgst],["IGST",invoice.igst]].filter(([,value])=>Number(value)>0).forEach(([label,value])=>{
        const row=document.createElement("div"),caption=document.createElement("span"),total=document.createElement("strong");
        caption.textContent=label;total.textContent=formatCurrency(value,currency);row.append(caption,total);subtotal.insertBefore(row,grand);
      });
    }
    return `<!doctype html>${invoiceDocument.documentElement.outerHTML}`;
  }
  function renderRows(){
    const query=root.querySelector("#txSearch").value.trim().toLowerCase();
    const filter=root.querySelector("#txCategoryFilter").value;
    const visible=records.filter(record=>{
      const category=record.category||"Adjustment";
      const type=record.voucherType||record.type||"Transaction";
      const ledgerName=getRowLedgerName(record);
      const haystack=[record.documentNo,type,category,record.partyName,record.customer,record.supplier,record.reference,ledgerName,record.narration,record.notes].join(" ").toLowerCase();
      return (!fixedVoucher||type===fixedVoucherType)&&(!filter||category===filter)&&haystack.includes(query);
    }).sort((left,right)=>String(right.date||right.createdAt||"").localeCompare(String(left.date||left.createdAt||"")));
    if(!visible.length){
      rows.innerHTML=`<tr><td colspan="8"><div class="empty"><span class="material-symbols-rounded">${records.length?"search_off":"inbox"}</span><p>${records.length?"No matching transactions.":"No transactions recorded."}</p></div></td></tr>`;
      return;
    }
    rows.innerHTML=visible.map(record=>{
      const ledgerName=getRowLedgerName(record);
      const party=record.partyName||record.customer||record.supplier||"—";
      const type=record.voucherType||record.type||"Transaction";
      const category=record.category||"Legacy";
      const ledgerButton=record.ledgerId?`<button class="tx-ledger-link" type="button" data-action="ledger" data-ledger-id="${escapeHtml(record.ledgerId)}">${escapeHtml(ledgerName)}</button>`:escapeHtml(ledgerName);
      const invoiceActions=["Sales Invoice","Estimate / Quotation"].includes(type)?`<button class="icon-button" type="button" data-action="invoice-email" data-id="${escapeHtml(record.id)}" aria-label="Email document" title="Email"><span class="material-symbols-rounded">email</span></button><button class="icon-button" type="button" data-action="invoice-whatsapp" data-id="${escapeHtml(record.id)}" aria-label="WhatsApp document" title="WhatsApp"><span class="material-symbols-rounded">chat</span></button><button class="icon-button" type="button" data-action="invoice-pdf" data-id="${escapeHtml(record.id)}" aria-label="Print or save PDF" title="Print / Save PDF"><span class="material-symbols-rounded">picture_as_pdf</span></button><button class="icon-button" type="button" data-action="invoice-qr" data-id="${escapeHtml(record.id)}" aria-label="Create payment QR" title="Payment QR"><span class="material-symbols-rounded">qr_code_2</span></button>`:"";
      return `<tr><td>${escapeHtml(record.documentNo||"—")}</td><td>${escapeHtml(record.date||"—")}</td><td><strong>${escapeHtml(type)}</strong><small class="tx-category-label">${escapeHtml(category)}</small></td><td>${escapeHtml(party)}</td><td>${ledgerButton}</td><td>${money(amountOf(record),record.currency||company.cmp_currency||"INR")}</td><td><span class="tx-status tx-status-${escapeHtml(String(record.status||"Draft").toLowerCase())}">${escapeHtml(record.status||"Draft")}</span></td><td><div class="tx-row-actions">${invoiceActions}<button class="icon-button" type="button" data-action="edit" data-id="${escapeHtml(record.id)}" aria-label="Edit transaction"><span class="material-symbols-rounded">edit</span></button><button class="icon-button tx-delete" type="button" data-action="delete" data-id="${escapeHtml(record.id)}" aria-label="Delete transaction"><span class="material-symbols-rounded">delete</span></button></div></td></tr>`;
    }).join("");
    window.COREBIQ?.renderIcons(rows);
  }
  async function refresh(){
    feedback.hidden=true;
    try{
      records=await listRecords("transactions");
      renderRows();
    }catch(error){
      records=[];
      rows.innerHTML=`<tr><td colspan="8"><div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Could not load transactions.</p></div></td></tr>`;
      feedback.textContent=error.message||"Check Firebase configuration and Firestore access rules.";
      feedback.hidden=false;
    }
  }
  function openEditor(record=null){
    editingRecord=record;
    financialYearManuallyEdited=false;
    form.reset();
    form.elements.recordId.value=record?.id||"";
    root.querySelector("#txDialogTitle").textContent=`${record?"Edit":"New"} ${fixedVoucherType||"Transaction"}`;
    root.querySelector("#txDocumentNo").textContent=record?.documentNo||"Assigned on save";
    formError.hidden=true;
    const matchedVoucher=VOUCHER_CATEGORIES.flatMap(group=>group.vouchers.map(voucher=>({category:group.name,voucher}))).find(entry=>entry.voucher.name===(record?.voucherType||record?.type));
    const category=fixedVoucher?fixedCategory:matchedVoucher?.category||record?.category||(record?"Adjustment":"Sales");
    const voucherType=fixedVoucher?fixedVoucherType:matchedVoucher?.voucher.name||record?.voucherType||(record?"Credit / Debit Adjustment":"Sales Invoice");
    categorySelect.value=VOUCHER_CATEGORIES.some(group=>group.name===category)?category:"Adjustment";
    syncVoucherType(voucherType);
    const details={...(record?.details||{})};
    if(record&&!record.details&&record.amount!==undefined) details.amount=record.amount;
    if(record&&!record.details&&record.notes) details.narration=record.notes;
    renderCurrentVoucher(details);
    root.querySelector("#txDate").value=record?.date||new Date().toISOString().slice(0,10);
    root.querySelector("#txParty").value=record?.partyName||record?.customer||record?.supplier||"";
    root.querySelector("#txReference").value=record?.reference||"";
    const existingLedger=record?.ledgerId||ledgers.find(ledger=>ledger.name===record?.ledgerName||ledger.name===record?.account)?.id||"";
    syncPrimaryLedgerOptions(getVoucher(categorySelect.value,voucherSelect.value),existingLedger);
    const recordDate=record?.date?new Date(`${record.date}T00:00:00`):new Date();
    root.querySelector("#txFinancialYear").value=record?.financialYear||financialYear(company.cmp_fy_start||"April",recordDate);
    renderBranchOptions(record?.branchId||"");
    root.querySelector("#txCurrency").value=record?.currency||company.cmp_currency||"INR";
    root.querySelector("#txExchangeRate").value=record?.exchangeRate??1;
    root.querySelector("#txCostCentre").value=record?.costCentre||"";
    root.querySelector("#txProject").value=record?.project||"";
    root.querySelector("#txDepartment").value=record?.department||"";
    root.querySelector("#txNarration").value=record?.narration||record?.notes||"";
    root.querySelector("#txAttachment").value=record?.attachmentUrl||"";
    root.querySelector("#txStatus").value=record?.status||"Draft";
    dialog.showModal();
  }

  categorySelect.addEventListener("change",()=>syncVoucherType());
  voucherSelect.addEventListener("change",()=>renderCurrentVoucher());
  root.querySelector("#txFinancialYear").addEventListener("input",()=>{financialYearManuallyEdited=true;});
  root.querySelector("#txDate").addEventListener("change",()=>{
    if(financialYearManuallyEdited) return;
    const value=root.querySelector("#txDate").value;
    const date=value?new Date(`${value}T00:00:00`):new Date();
    root.querySelector("#txFinancialYear").value=financialYear(company.cmp_fy_start||"April",date);
  });
  root.querySelector("#txCreate").addEventListener("click",()=>openEditor());
  root.querySelector("#txRefresh").addEventListener("click",refresh);
  root.querySelector("#txSearch").addEventListener("input",renderRows);
  root.querySelector("#txCategoryFilter").addEventListener("change",renderRows);
  root.querySelector("#txCancel").addEventListener("click",()=>dialog.close());
  root.querySelector("#txClose").addEventListener("click",()=>dialog.close());
  root.addEventListener("click",async event=>{
    const button=event.target.closest("[data-action]");
    if(!button) return;
    if(button.dataset.action==="add-item"){
      root.querySelector(".tx-items").insertAdjacentHTML("beforeend",itemRow({},inventoryItems));
      updateItemTotals();
      return;
    }
    if(button.dataset.action==="add-journal"){
      root.querySelector(".tx-journal-lines").insertAdjacentHTML("beforeend",journalRow());
      updateJournalTotals();
      return;
    }
    if(button.dataset.action==="remove-item"){
      if(root.querySelectorAll(".tx-item-row").length>1) button.closest(".tx-item-row").remove();
      updateItemTotals();
      return;
    }
    if(button.dataset.action==="remove-journal"){
      if(root.querySelectorAll(".tx-journal-row").length>2) button.closest(".tx-journal-row").remove();
      updateJournalTotals();
      return;
    }
    if(button.dataset.action==="ledger"){
      const linked=ledgerFor(button.dataset.ledgerId);
      await window.COREBIQ?.loadModule("ledger");
      const search=document.querySelector("#crudSearch");
      if(search&&linked){search.value=linked.name;search.dispatchEvent(new Event("input",{bubbles:true}));}
      return;
    }
    const record=records.find(item=>item.id===button.dataset.id);
    if(!record) return;
    if(["invoice-email","invoice-whatsapp","invoice-pdf","invoice-qr"].includes(button.dataset.action)){
      const client=getVoucherClient(record);
      const message=invoiceMessage({sale:{...record,amount:amountOf(record)},customer:client,company});
      if(button.dataset.action==="invoice-email"){
        if(!client?.email){window.showToast?.("Add an email address to the linked Client first.");return;}
        window.open(`mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(`${record.voucherType||record.type} ${record.documentNo||""}`)}&body=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
        return;
      }
      if(button.dataset.action==="invoice-whatsapp"){
        const digits=String(client?.phone||"").replace(/\D/g,"").replace(/^0/,"");
        if(!digits){window.showToast?.("Add a phone number to the linked Client first.");return;}
        const phone=digits.length===10?`91${digits}`:digits;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
        return;
      }
      if(button.dataset.action==="invoice-qr"){
        sessionStorage.setItem("corebiqPaymentQrSource",JSON.stringify({collection:"transactions",recordId:record.id}));
        await window.COREBIQ?.loadModule("qr-template");
        return;
      }
      const popup=window.open("about:blank","_blank");
      if(!popup){window.showToast?.("Allow pop-ups to print or save the invoice PDF.");return;}
      const html=await getVoucherInvoiceHtml(record);
      popup.document.open();popup.document.write(html);popup.document.close();
      return;
    }
    if(button.dataset.action==="edit") openEditor(record);
    if(button.dataset.action==="delete"&&window.confirm(`Delete voucher ${record.documentNo||record.voucherType||record.type||"transaction"}?`)){
      button.disabled=true;
      try{await deleteRecord("transactions",record.id);records=records.filter(item=>item.id!==record.id);renderRows();window.showToast?.("Transaction deleted.");}
      catch(error){button.disabled=false;window.showToast?.(error.message||"Could not delete transaction.");}
    }
  });
  root.addEventListener("input",event=>{
    if(event.target.matches("[data-item-field]")) updateItemTotals();
    if(event.target.matches("[data-journal-field]")) updateJournalTotals();
  });
  root.addEventListener("change",event=>{
    if(event.target.matches("[data-item-field], [data-voucher-field='supplyType']")) updateItemTotals();
    if(event.target.matches("[data-journal-field='ledgerId']")) updateJournalTotals();
  });
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    formError.hidden=true;
    const voucher=getVoucher(categorySelect.value,voucherSelect.value);
    const details=captureDetails();
    let journalTotals=null;
    if(voucher.journal){
      journalTotals=updateJournalTotals();
      const filled=journalTotals.lines.filter(line=>line.ledgerId&&(line.debit>0||line.credit>0));
      if(filled.length<2||filled.some(line=>line.debit>0&&line.credit>0)||Math.abs(journalTotals.debit-journalTotals.credit)>0.005){
        formError.textContent="Journal voucher requires at least two ledger lines, with total debit equal to total credit.";
        formError.hidden=false;
        return;
      }
      details.journalEntries=filled;
    }
    if(voucher.name==="Contra Voucher"&&(!details.fromLedgerId||!details.toLedgerId||details.fromLedgerId===details.toLedgerId||Number(details.fromAmount)!==Number(details.toAmount)||!(Number(details.fromAmount)>0))){
      formError.textContent="Contra voucher requires different From and To ledgers with matching amounts.";
      formError.hidden=false;
      return;
    }
    if(voucher.name==="Opening Balance"&&Number(details.debit)>0&&Number(details.credit)>0){
      formError.textContent="Enter an opening balance on either the debit or credit side, not both.";
      formError.hidden=false;
      return;
    }
    const primaryLedger=ledgerFor(root.querySelector("#txLedger").value);
    const date=root.querySelector("#txDate").value;
    const amount=amountOf({details});
    const detailsLedgerId=details.ledgerId||details.fromLedgerId||details.expenseLedgerId||journalTotals?.lines.find(line=>line.ledgerId)?.ledgerId||"";
    const linkedLedger=primaryLedger||ledgerFor(detailsLedgerId);
    const actor=await getAuthProfile().catch(()=>null);
    const payload={
      name:voucher.name,category:categorySelect.value,type:voucher.name,voucherType:voucher.name,date,transactionDate:date,
      partyName:root.querySelector("#txParty").value.trim(),partyLabel:voucher.partyLabel||"",reference:root.querySelector("#txReference").value.trim(),
      ledgerId:primaryLedger?.id||detailsLedgerId||"",ledgerName:primaryLedger?.name||linkedLedger?.name||(voucher.journal?"Multiple ledgers":""),account:primaryLedger?.name||linkedLedger?.name||"",
      amount,details,financialYear:root.querySelector("#txFinancialYear").value.trim(),branchId:root.querySelector("#txBranch").value,
      branchName:branches.find(branch=>branch.id===root.querySelector("#txBranch").value)?.name||"",companyName:company.cmp_name||"",
      currency:root.querySelector("#txCurrency").value.trim().toUpperCase()||"INR",exchangeRate:Number(root.querySelector("#txExchangeRate").value)||1,
      costCentre:root.querySelector("#txCostCentre").value.trim(),project:root.querySelector("#txProject").value.trim(),department:root.querySelector("#txDepartment").value.trim(),
      narration:root.querySelector("#txNarration").value.trim(),notes:root.querySelector("#txNarration").value.trim(),attachmentUrl:root.querySelector("#txAttachment").value.trim(),status:root.querySelector("#txStatus").value,
      createdBy:editingRecord?.createdBy||actor?.name||"",updatedBy:actor?.name||""
    };
    const save=root.querySelector("#txSave");
    save.disabled=true;
    try{
      const id=form.elements.recordId.value;
      if(id){await updateRecord("transactions",id,payload);window.showToast?.("Transaction updated.");}
      else{await createRecord("transactions",payload);window.showToast?.("Transaction saved.");}
      dialog.close();
      await refresh();
    }catch(error){
      formError.textContent=error.message||"Could not save transaction. Check Firebase access rules.";
      formError.hidden=false;
    }finally{save.disabled=false;}
  });

  const [ledgerResult,branchResult,companyResult,productResult,serviceResult,clientResult]=await Promise.allSettled([listRecords("ledger"),listRecords("branches"),getCompany(),listRecords("products"),listRecords("services"),listRecords("clients")]);
  if(ledgerResult.status==="fulfilled") ledgers=ledgerResult.value;
  else{feedback.textContent="Could not load ledger accounts. Ledger-linked transactions require an available chart of accounts.";feedback.hidden=false;}
  if(branchResult.status==="fulfilled") branches=branchResult.value;
  if(companyResult.status==="fulfilled") company=companyResult.value||{};
  if(clientResult.status==="fulfilled") clients=clientResult.value;
  inventoryItems=[
    ...(productResult.status==="fulfilled"?productResult.value.map(item=>({...item,type:"product",hsn:item.hsn||""})):[]),
    ...(serviceResult.status==="fulfilled"?serviceResult.value.map(item=>({...item,type:"service",hsn:item.sac||item.hsn||""})):[])
  ];
  root.querySelector("#txFinancialYear").value=financialYear(company.cmp_fy_start||"April");
  root.querySelector("#txCurrency").value=String(company.cmp_currency||"INR").toUpperCase();
  populateLedgerSelect(root.querySelector("#txLedger"));
  renderBranchOptions();
  syncVoucherType();
  await refresh();
}