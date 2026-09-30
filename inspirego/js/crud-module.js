import { createRecord, deleteRecord, getCompany, getCompanyLogoBlob, listRecords, updateRecord } from "./firebase-service.js?v=7";
import { companyLogoSource, createInvoiceHtml, invoiceMessage } from "../modules/invoice-document.js";

const MODULE_CONFIG = {
  branches:{title:"Branches",singular:"Branch",icon:"account_tree",description:"Manage business locations.",fields:[{key:"name",label:"Branch name",required:true},{key:"branchCode",label:"Branch code"},{key:"manager",label:"Manager"},{key:"email",label:"Email",type:"email"},{key:"phone",label:"Phone"},{key:"city",label:"City"},{key:"status",label:"Status",type:"select",options:["Active","Inactive"]}]},
  clients:{title:"Clients",icon:"group",description:"Manage customer and client records.",fields:[{key:"name",label:"Client name",required:true},{key:"contactPerson",label:"Contact person"},{key:"email",label:"Email",type:"email"},{key:"phone",label:"Phone"},{key:"gstin",label:"GSTIN"},{key:"city",label:"City"},{key:"status",label:"Status",type:"select",options:["Active","Inactive"]}]},
  staff:{title:"Staff",icon:"badge",description:"Manage employees and staff details.",fields:[{key:"name",label:"Staff name",required:true},{key:"role",label:"Role"},{key:"email",label:"Email",type:"email"},{key:"phone",label:"Phone"},{key:"branch",label:"Branch"},{key:"status",label:"Status",type:"select",options:["Active","Inactive"]}]},
  products:{title:"Products",icon:"inventory_2",description:"Manage products, pricing and stock.",fields:[{key:"name",label:"Product name",required:true},{key:"sku",label:"SKU"},{key:"category",label:"Category"},{key:"price",label:"Price",type:"number"},{key:"stock",label:"Stock quantity",type:"number"},{key:"unit",label:"Unit"},{key:"status",label:"Status",type:"select",options:["Active","Inactive"]}]},
  services:{title:"Services",icon:"design_services",description:"Manage services and pricing.",fields:[{key:"name",label:"Service name",required:true},{key:"serviceCode",label:"Service code"},{key:"category",label:"Category"},{key:"price",label:"Price",type:"number"},{key:"duration",label:"Duration"},{key:"status",label:"Status",type:"select",options:["Active","Inactive"]}]},
  sales:{title:"Sales",icon:"point_of_sale",description:"Track sales and customer payments.",fields:[{key:"customer",label:"Customer",required:true},{key:"reference",label:"Sale reference"},{key:"date",label:"Date",type:"date"},{key:"amount",label:"Amount",type:"number",required:true},{key:"paymentStatus",label:"Payment status",type:"select",options:["Pending","Paid","Partially paid"]},{key:"notes",label:"Notes",type:"textarea"}]},
  purchases:{title:"Purchases",icon:"shopping_cart",description:"Track purchases and supplier payments.",fields:[{key:"supplier",label:"Supplier",required:true},{key:"reference",label:"Purchase reference"},{key:"date",label:"Date",type:"date"},{key:"amount",label:"Amount",type:"number",required:true},{key:"paymentStatus",label:"Payment status",type:"select",options:["Pending","Paid","Partially paid"]},{key:"notes",label:"Notes",type:"textarea"}]},
  invoices:{title:"Invoices",icon:"receipt_long",description:"Manage invoices and outstanding balances.",fields:[{key:"customer",label:"Customer",required:true},{key:"invoiceNumber",label:"Invoice number"},{key:"date",label:"Invoice date",type:"date"},{key:"dueDate",label:"Due date",type:"date"},{key:"amount",label:"Amount",type:"number",required:true},{key:"paymentStatus",label:"Payment status",type:"select",options:["Unpaid","Partially paid","Paid","Overdue"]}]},
  expenses:{title:"Expenses",icon:"payments",description:"Record and review business expenses.",fields:[{key:"category",label:"Category",required:true},{key:"description",label:"Description"},{key:"date",label:"Date",type:"date"},{key:"amount",label:"Amount",type:"number",required:true},{key:"paymentMethod",label:"Payment method"},{key:"notes",label:"Notes",type:"textarea"}]},
  transactions:{title:"Transactions",icon:"account_balance",description:"Track business account transactions.",fields:[{key:"type",label:"Transaction type",required:true},{key:"reference",label:"Reference"},{key:"date",label:"Date",type:"date"},{key:"amount",label:"Amount",type:"number",required:true},{key:"account",label:"Account"},{key:"notes",label:"Notes",type:"textarea"}]},
  payments:{title:"Payments",icon:"currency_rupee",description:"Manage incoming and outgoing payments.",fields:[{key:"party",label:"Customer or supplier",required:true},{key:"reference",label:"Payment reference"},{key:"date",label:"Date",type:"date"},{key:"amount",label:"Amount",type:"number",required:true},{key:"method",label:"Payment method"},{key:"status",label:"Status",type:"select",options:["Pending","Completed","Failed"]}]},
  qr:{title:"QR Codes",icon:"qr_code_2",description:"Store and manage QR code destinations.",fields:[{key:"name",label:"QR label",required:true},{key:"value",label:"QR value or URL",required:true},{key:"purpose",label:"Purpose"},{key:"status",label:"Status",type:"select",options:["Active","Inactive"]}]},
  reports:{title:"Reports",icon:"bar_chart",description:"Save report definitions for your team.",fields:[{key:"name",label:"Report name",required:true},{key:"reportType",label:"Report type"},{key:"period",label:"Period"},{key:"notes",label:"Notes",type:"textarea"}]},
  settings:{title:"Settings",icon:"settings",description:"Manage workspace settings.",fields:[{key:"name",label:"Setting name",required:true},{key:"value",label:"Value",type:"textarea"},{key:"description",label:"Description",type:"textarea"}]},
  ledger:{title:"Ledger",singular:"Ledger",icon:"account_balance_wallet",description:"Manage ledger accounts and opening balances.",fields:[{key:"name",label:"Ledger name",required:true},{key:"category",label:"Category under",type:"select",required:true,options:["Assets","Liabilities","Equity","Income","Expenses"]},{key:"accountType",label:"Account type",type:"select",options:["Other","Cash","Bank"],defaultValue:"Other"},{key:"openingBalance",label:"Opening balance",type:"number",required:true,defaultValue:"0"},{key:"balanceType",label:"Balance type",type:"select",required:true,options:["Debit","Credit"]},{key:"bankName",label:"Bank name",bankOnly:true},{key:"accountHolderName",label:"Account holder",bankOnly:true},{key:"accountNumber",label:"Account number",bankOnly:true},{key:"ifsc",label:"IFSC code",bankOnly:true},{key:"bankBranch",label:"Bank branch",bankOnly:true},{key:"notes",label:"Notes",type:"textarea"}]}
};

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
}

function renderInput(field,lookups){
  const required = field.required ? " required" : "";
  if(field.type === "reference"){
    const options = lookups[field.lookup].map(record=>`<option value="${escapeHtml(record.id)}">${escapeHtml(record.name || record.title || record.id)}</option>`).join("");
    return `<select class="form-control" name="${field.key}"${required}><option value="">Select ${escapeHtml(field.label.toLowerCase())}</option>${options}</select>`;
  }
  if(field.type === "select"){
    return `<select class="form-control" name="${field.key}"${required}><option value="">Select</option>${field.options.map(option=>`<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}</select>`;
  }
  if(field.type === "textarea") return `<textarea class="form-control" name="${field.key}" rows="3"${required}></textarea>`;
  return `<input class="form-control" name="${field.key}" type="${field.type || "text"}" value="${escapeHtml(field.defaultValue ?? "")}"${field.type === "number" ? ' step="any"' : ""}${required}>`;
}

function renderPage(config,lookups){
  const singular = config.singular || config.title.replace(/s$/,"");
  const filterField = config.fields.find(field=>field.type === "select") || config.fields[0];
  config.tableFields = config.fields.filter(field=>!field.bankOnly);
  const fields = config.fields.map(field=>`<div class="form-group${field.bankOnly ? " crud-bank-field" : ""}"${field.bankOnly ? " hidden" : ""}><label>${escapeHtml(field.label)}${field.required ? ' <span class="req">*</span>' : ""}</label>${renderInput(field,lookups)}</div>`).join("");
  const headers = config.tableFields.map(field=>`<th>${escapeHtml(field.label)}</th>`).join("");
  return `<div class="module-page crud-page">
    <div class="page-header"><div class="page-title"><div class="page-title-icon"><span class="material-symbols-rounded">${config.icon}</span></div><div><h1>${config.title}</h1><p>${config.description}</p></div></div><div class="actions"><button class="btn btn-outline" id="crudRefresh" type="button" title="Refresh"><span class="material-symbols-rounded">refresh</span><span>Refresh</span></button><button class="btn btn-primary" id="crudCreate" type="button"><span class="material-symbols-rounded">add</span><span>Add ${singular}</span></button></div></div>
    <div class="card card-pad"><div class="crud-toolbar"><input class="input-search" id="crudSearch" type="search" placeholder="Search ${config.title.toLowerCase()}..." aria-label="Search ${config.title}"><select class="form-control crud-select" id="crudFilter" aria-label="Filter by ${escapeHtml(filterField.label)}"><option value="">All ${escapeHtml(config.title.toLowerCase())}</option></select><select class="form-control crud-select" id="crudSort" aria-label="Sort records"><option value="updated-desc">Recent</option><option value="updated-asc">Oldest</option><option value="field-asc">${escapeHtml(filterField.label)} A-Z</option><option value="field-desc">${escapeHtml(filterField.label)} Z-A</option></select><button class="btn btn-outline crud-toolbar-icon" id="crudImport" type="button" title="Import records from CSV" aria-label="Import records from CSV"><span class="material-symbols-rounded">upload</span><span class="crud-control-label">Import CSV</span></button><button class="btn btn-outline crud-toolbar-icon" id="crudPdf" type="button" title="Download filtered data as PDF" aria-label="Download filtered data as PDF"><span class="material-symbols-rounded">picture_as_pdf</span><span class="crud-control-label">PDF</span></button><button class="btn btn-outline crud-toolbar-icon" id="crudPdfImport" type="button" title="Attach a PDF" aria-label="Attach a PDF"><span class="material-symbols-rounded">attach_file</span><span class="crud-control-label">Import PDF</span></button></div><input id="crudCsvFile" type="file" accept=".csv,text/csv" hidden><input id="crudPdfFile" type="file" accept=".pdf,application/pdf" hidden><p class="crud-feedback" id="crudFeedback" role="status" hidden></p><div class="table-wrap"><table class="data-table"><thead><tr>${headers}<th>Updated</th><th>Actions</th></tr></thead><tbody id="crudRows"><tr><td colspan="${config.fields.length+2}"><div class="loader"><span class="material-symbols-rounded">sync</span></div></td></tr></tbody></table></div><section class="crud-pdf-documents"><h2>PDF attachments</h2><div id="crudPdfRows"><p class="crud-pdf-empty">Loading attachments...</p></div></section></div>
    <dialog class="crud-dialog" id="crudDialog"><form id="crudForm"><div class="crud-dialog-header"><h2 id="crudDialogTitle">Add ${config.title.replace(/s$/,"")}</h2><button class="icon-button" type="button" id="crudClose" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><input type="hidden" name="recordId"><div class="form-grid">${fields}</div><div class="form-actions"><button class="btn btn-outline" type="button" id="crudCancel">Cancel</button><button class="btn btn-primary" id="crudSave" type="submit"><span class="material-symbols-rounded">save</span><span>Save</span></button></div></form></dialog>
  </div>`;
}

function formatDate(value){
  if(!value) return "--";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(date);
}

function getFieldValue(record,field,lookups){
  let value = record[field.key];
  if(value === undefined && field.lookup === "clients") value = record.customer;
  if(value === undefined && field.lookup === "branches") value = record.branch;
  if(field.lookup && value){
    const match = lookups[field.lookup].find(item=>item.id === value || item.name === value);
    if(match) return match.name || match.title || match.id;
  }
  return value ?? "";
}

function getRecordDate(record){
  const value = record.date || record.createdAt || record.updatedAt;
  if(!value) return "";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0,10);
}

function getDisplayValue(record,field,lookups){
  const value = field.type === "date" ? formatDate(record[field.key]) : getFieldValue(record,field,lookups);
  return value === null || value === undefined || value === "" ? "--" : value;
}

function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(String(reader.result||""));
    reader.onerror = ()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function initCrudModule(moduleName){
  const sourceConfig = MODULE_CONFIG[moduleName];
  const config = sourceConfig && {...sourceConfig,fields:sourceConfig.fields.map(field=>({...field}))};
  const container = document.getElementById("moduleContainer");
  if(!config || !container) return;

  if(!["clients","branches","ledger"].includes(moduleName)){
    let clientField = config.fields.find(field=>field.key === "customer" || field.key === "clientId");
    if(clientField){
      clientField.key = "clientId";
      clientField.label = "Client";
      clientField.lookup = "clients";
      clientField.type = "reference";
      clientField.required = true;
    }else{
      config.fields.unshift({key:"clientId",label:"Client",type:"reference",lookup:"clients",required:true});
    }
    let branchField = config.fields.find(field=>field.key === "branch" || field.key === "branchId");
    if(branchField){
      branchField.key = "branchId";
      branchField.label = "Branch";
      branchField.lookup = "branches";
      branchField.type = "reference";
      branchField.required = true;
    }else{
      config.fields.splice(1,0,{key:"branchId",label:"Branch",type:"reference",lookup:"branches",required:true});
    }
  }
  const lookups = {clients:[],branches:[]};
  container.innerHTML = renderPage(config,lookups);
  container.querySelectorAll(".loader .material-symbols-rounded").forEach(icon=>{
    icon.className="loading-ring";
    icon.textContent="";
    icon.setAttribute("aria-hidden","true");
  });
  const toolbar = container.querySelector(".crud-toolbar");
  ["crudImport","crudPdfImport"].forEach(id=>document.getElementById(id)?.remove());
  ["crudCsvFile","crudPdfFile"].forEach(id=>document.getElementById(id)?.remove());
  container.querySelector(".crud-pdf-documents")?.remove();
  const dateFilter = document.createElement("div");
  dateFilter.className = "crud-date-filter";
  dateFilter.innerHTML = `<label>From<input class="form-control" id="crudDateFrom" type="date" aria-label="Filter from date"></label><label>To<input class="form-control" id="crudDateTo" type="date" aria-label="Filter to date"></label>`;
  toolbar.append(dateFilter);
  const sortControl = document.getElementById("crudSort");
  sortControl.insertAdjacentHTML("beforeend",'<option value="date-asc">Date: oldest</option><option value="date-desc">Date: newest</option>');
  const rows = document.getElementById("crudRows");
  const feedback = document.getElementById("crudFeedback");
  const dialog = document.getElementById("crudDialog");
  const form = document.getElementById("crudForm");
  const documentNumberField = document.createElement("div");
  documentNumberField.className = "form-group span-2 crud-document-number";
  documentNumberField.innerHTML = '<label for="displayDocumentNo">Document No.</label><input class="form-control" id="displayDocumentNo" name="displayDocumentNo" type="text" value="Assigned on save" readonly>';
  form.elements.recordId.after(documentNumberField);
  const headerRow = container.querySelector(".data-table thead tr");
  const dateField = config.fields.find(field=>field.type === "date");
  const documentHeader = document.createElement("th");
  documentHeader.textContent = "Document No.";
  headerRow.insertBefore(documentHeader,headerRow.firstChild);
  headerRow.children[headerRow.children.length-2].textContent = dateField ? "Updated" : "Date";
  const exportButton = document.getElementById("crudPdf");
  const downloadMenu = document.createElement("details");
  downloadMenu.className = "crud-download-menu";
  downloadMenu.innerHTML = `<summary class="btn btn-outline crud-toolbar-icon"><span class="material-symbols-rounded">download</span><span>Download</span></summary><div class="crud-download-options"><button type="button" id="crudExportCsv">CSV (.csv)</button><button type="button" id="crudExportPdf">PDF (.pdf)</button></div>`;
  exportButton.replaceWith(downloadMenu);
  const printHeading = document.createElement("div");
  printHeading.className = "crud-print-heading";
  printHeading.innerHTML = `<div><p>COREBIQ CRM + ERP</p><h2>${escapeHtml(config.title)} report</h2></div><div><strong id="crudPrintCount"></strong><time id="crudPrintDate"></time></div>`;
  document.querySelector(".crud-page .table-wrap").before(printHeading);
  const printFooter = document.createElement("footer");
  printFooter.className = "crud-print-footer";
  printFooter.innerHTML = `<img class="crud-print-logo" src="assets/logo-app.svg" alt=""><img class="crud-print-wordmark" src="assets/name.svg" alt="COREBIQ CRM ERP">`;
  document.querySelector(".crud-page").append(printFooter);
  const filterField = config.fields.find(field=>field.type === "select") || config.fields[0];
  let records = [];
  let invoiceProfile = {};
  let invoiceBanks = [];

  async function refreshInvoiceContext(){
    const [companyResult,ledgerResult] = await Promise.allSettled([getCompany(),listRecords("ledger")]);
    invoiceProfile = companyResult.status === "fulfilled" ? companyResult.value || {} : {};
    invoiceBanks = ledgerResult.status === "fulfilled"
      ? ledgerResult.value.filter(ledger=>ledger.accountType === "Bank" || ledger.systemDefaultKey === "bank")
      : [];
  }

  function getClientForSale(record){
    return lookups.clients.find(client=>client.id === record.clientId) || lookups.clients.find(client=>client.name === record.customer) || null;
  }

  function getSaleMessage(record,client){
    return invoiceMessage({sale:record,customer:client,company:invoiceProfile});
  }

  async function openSaleInvoice(record,client,popup){
    const template=invoiceProfile.invoiceTemplate||{};
    const selectedBank=invoiceBanks.find(bank=>bank.id===template.billingBankId)||(invoiceBanks.length===1?invoiceBanks[0]:null);
    if(template.showBankDetails!==false&&invoiceBanks.length>1&&!selectedBank){
      popup?.close();
      window.showToast?.("Select the billing bank in Invoice Template first.");
      return;
    }
    let logoDataUrl=companyLogoSource(invoiceProfile);
    if(invoiceProfile.cmp_logo&&!logoDataUrl){
      try{logoDataUrl=await blobToDataUrl(await getCompanyLogoBlob(invoiceProfile.cmp_logo));}
      catch{window.showToast?.("Could not load the company logo; opening bill without it.");}
    }
    const html=createInvoiceHtml({sale:record,customer:client,company:invoiceProfile,bank:selectedBank,template,logoDataUrl,autoPrint:true});
    if(!popup){
      window.showToast?.("Allow pop-ups to open or save the bill PDF.");
      return;
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  async function refreshLookups(){
    const collections = [...new Set(config.fields.filter(field=>field.lookup).map(field=>field.lookup))];
    const results = await Promise.allSettled(collections.map(collectionName=>listRecords(collectionName)));
    const errors = [];
    results.forEach((result,index)=>{
      const collectionName = collections[index];
      if(result.status === "fulfilled") lookups[collectionName] = result.value;
      else errors.push(collectionName);
      const options = lookups[collectionName].map(record=>`<option value="${escapeHtml(record.id)}">${escapeHtml(record.name || record.title || record.id)}</option>`).join("");
      config.fields.filter(field=>field.lookup === collectionName).forEach(field=>{
        const select = form.elements[field.key];
        select.innerHTML = `<option value="">Select ${escapeHtml(field.label.toLowerCase())}</option>${options}`;
      });
    });
    renderFilterOptions();
    renderRows();
    if(errors.length){
      feedback.textContent = `Could not load ${errors.join(" and ")} for the required dropdowns.`;
      feedback.hidden = false;
    }
  }

  function renderFilterOptions(){
    const filter = document.getElementById("crudFilter");
    const selected = filter.value;
    const values = [...new Set(records.map(record=>String(record[filterField.key] ?? "").trim()).filter(Boolean))].sort((left,right)=>left.localeCompare(right));
    filter.innerHTML = `<option value="">All ${escapeHtml(config.title.toLowerCase())}</option>${values.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(getFieldValue({[filterField.key]:value},filterField,lookups))}</option>`).join("")}`;
    filter.value = values.includes(selected) ? selected : "";
  }

  function renderRows(){
    const query = document.getElementById("crudSearch").value.trim().toLowerCase();
    const filterValue = document.getElementById("crudFilter").value;
    const sortOrder = document.getElementById("crudSort").value;
    const dateFrom = document.getElementById("crudDateFrom").value;
    const dateTo = document.getElementById("crudDateTo").value;
    const visible = records.filter(record=>
      (!filterValue || String(record[filterField.key] ?? "") === filterValue) &&
      (!dateFrom || getRecordDate(record) >= dateFrom) &&
      (!dateTo || getRecordDate(record) <= dateTo) &&
      (String(record.documentNo || "").toLowerCase().includes(query) || config.fields.some(field=>String(getFieldValue(record,field,lookups)).toLowerCase().includes(query)))
    );
    visible.sort((left,right)=>{
      if(sortOrder.startsWith("date-")){
        const comparison = getRecordDate(left).localeCompare(getRecordDate(right));
        return sortOrder === "date-asc" ? comparison : -comparison;
      }
      if(sortOrder.startsWith("field-")){
        const comparison = String(left[filterField.key] ?? "").localeCompare(String(right[filterField.key] ?? ""));
        return sortOrder === "field-asc" ? comparison : -comparison;
      }
      const getTime = record=>{
        const value = record.date || record.updatedAt || record.createdAt;
        if(value?.toMillis) return value.toMillis();
        const time = value ? new Date(value).getTime() : 0;
        return Number.isNaN(time) ? 0 : time;
      };
      const leftTime = getTime(left);
      const rightTime = getTime(right);
      return sortOrder === "updated-asc" ? leftTime-rightTime : rightTime-leftTime;
    });
    if(!visible.length){
      rows.innerHTML = `<tr><td colspan="${config.fields.length+3}"><div class="empty"><span class="material-symbols-rounded">${records.length ? "search_off" : "inbox"}</span><p>${records.length ? "No matching records." : `No ${config.title.toLowerCase()} found.`}</p></div></td></tr>`;
      window.COREBIQ?.renderIcons(rows);
      return;
    }
    rows.innerHTML = visible.map(record=>`<tr><td>${escapeHtml(record.documentNo || "--")}</td>${config.tableFields.map(field=>`<td>${escapeHtml(getDisplayValue(record,field,lookups))}</td>`).join("")}<td>${formatDate(dateField ? record.updatedAt || record.createdAt : record.date || record.createdAt || record.updatedAt)}</td><td><div class="crud-row-actions"><button class="icon-button" type="button" data-action="edit" data-id="${escapeHtml(record.id)}" aria-label="Edit record"><span class="material-symbols-rounded">edit</span></button>${moduleName === "sales" ? `<button class="icon-button" type="button" data-action="invoice-email" data-id="${escapeHtml(record.id)}" aria-label="Email bill" title="Email bill"><span class="material-symbols-rounded">email</span></button><button class="icon-button" type="button" data-action="invoice-whatsapp" data-id="${escapeHtml(record.id)}" aria-label="Send bill with WhatsApp" title="Send bill with WhatsApp"><span class="material-symbols-rounded">chat</span></button><button class="icon-button" type="button" data-action="invoice-pdf" data-id="${escapeHtml(record.id)}" aria-label="Download bill PDF" title="Download bill PDF"><span class="material-symbols-rounded">picture_as_pdf</span></button>` : ""}${record.systemDefault ? "" : `<button class="icon-button crud-delete" type="button" data-action="delete" data-id="${escapeHtml(record.id)}" aria-label="Delete record"><span class="material-symbols-rounded">delete</span></button>`}</div></td></tr>`).join("");
    window.COREBIQ?.renderIcons(rows);
  }

  async function refresh(){
    feedback.hidden = true;
    rows.innerHTML = `<tr><td colspan="${config.fields.length+3}"><div class="loader" role="status" aria-label="Loading"><span class="loading-ring" aria-hidden="true"></span></div></td></tr>`;
    try{
      records = await listRecords(moduleName);
      renderFilterOptions();
      renderRows();
    }catch(error){
      records = [];
      rows.innerHTML = `<tr><td colspan="${config.fields.length+3}"><div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Could not load ${config.title.toLowerCase()} from Firebase.</p></div></td></tr>`;
      window.COREBIQ?.renderIcons(rows);
      feedback.textContent = error.message || "Check your Firebase configuration and Firestore access rules.";
      feedback.hidden = false;
    }
  }

  function openEditor(record){
    form.reset();
    form.elements.recordId.value = record?.id || "";
    form.elements.displayDocumentNo.value = record?.documentNo || "Assigned on save";
    const protectedLedger = moduleName === "ledger" && record?.systemDefault === true;
    const editablePresetFields = record?.systemDefaultKey === "bank"
      ? new Set(["openingBalance","bankName","accountHolderName","accountNumber","ifsc","bankBranch"])
      : new Set(["openingBalance"]);
    config.fields.forEach(field=>{
      const input = form.elements[field.key];
      const legacyValue = field.lookup === "clients" ? record?.customer : field.lookup === "branches" ? record?.branch : "";
      const rawValue = record?.[field.key] ?? (field.lookup ? legacyValue : field.defaultValue) ?? "";
      const match = field.lookup && lookups[field.lookup].find(item=>item.id === rawValue || item.name === rawValue);
      const value = match?.id ?? rawValue;
      if(field.lookup && value && !lookups[field.lookup].some(item=>item.id === value)){
        const option = document.createElement("option");
        option.value = value;
        option.textContent = `${rawValue} (existing value)`;
        input.append(option);
      }
      input.value = value;
      input.disabled = protectedLedger && !editablePresetFields.has(field.key);
      const fieldGroup = input.closest(".form-group");
      if(field.bankOnly){
        fieldGroup.hidden = form.elements.accountType?.value !== "Bank";
      }else{
        fieldGroup.hidden = protectedLedger && !editablePresetFields.has(field.key) && !["name","category"].includes(field.key);
      }
    });
    document.getElementById("crudDialogTitle").textContent = `${record ? "Edit" : "Add"} ${config.singular || config.title.replace(/s$/,"")}`;
    dialog.showModal();
  }

  document.getElementById("crudCreate").addEventListener("click",()=>openEditor(null));
  if(moduleName === "ledger"){
    const syncBankFields=()=>{
      const showBankDetails = form.elements.accountType.value === "Bank";
      form.querySelectorAll(".crud-bank-field").forEach(field=>{ field.hidden = !showBankDetails; });
    };
    form.elements.accountType.addEventListener("change",syncBankFields);
    syncBankFields();
  }
  document.getElementById("crudRefresh").addEventListener("click",refresh);
  document.getElementById("crudSearch").addEventListener("input",renderRows);
  document.getElementById("crudFilter").addEventListener("change",renderRows);
  document.getElementById("crudSort").addEventListener("change",renderRows);
  document.getElementById("crudDateFrom").addEventListener("change",renderRows);
  document.getElementById("crudDateTo").addEventListener("change",renderRows);
  document.getElementById("crudExportCsv").addEventListener("click",()=>{
    const csvEscape = value=>{
      const safeValue = /^[=+\-@]/.test(String(value)) ? `'${value}` : String(value);
      return /[",\r\n]/.test(safeValue) ? `"${safeValue.replace(/"/g,'""')}"` : safeValue;
    };
    const visibleRecords = [...rows.querySelectorAll('[data-action="edit"]')].map(button=>records.find(record=>record.id === button.dataset.id)).filter(Boolean);
    const csv = [["Document No.",...config.fields.map(field=>field.label)],...visibleRecords.map(record=>[record.documentNo,...config.fields.map(field=>getFieldValue(record,field,lookups))])].map(row=>row.map(csvEscape).join(",")).join("\r\n");
    const blobUrl = URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
    const download = document.createElement("a");
    download.href = blobUrl;
    download.download = `${moduleName}-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.append(download);
    download.click();
    download.remove();
    window.setTimeout(()=>URL.revokeObjectURL(blobUrl),1000);
    downloadMenu.open = false;
  });
  document.getElementById("crudExportPdf").addEventListener("click",()=>{
    const visibleRecords = [...rows.querySelectorAll('[data-action="edit"]')];
    document.getElementById("crudPrintCount").textContent = `${visibleRecords.length} records`;
    document.getElementById("crudPrintDate").textContent = `Generated ${new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date())}`;
    downloadMenu.open = false;
    window.print();
  });
  document.getElementById("crudCancel").addEventListener("click",()=>dialog.close());
  document.getElementById("crudClose").addEventListener("click",()=>dialog.close());
  rows.addEventListener("click",async event=>{
    const button = event.target.closest("[data-action]");
    if(!button) return;
    const record = records.find(item=>item.id === button.dataset.id);
    if(!record) return;
    if(["invoice-email","invoice-whatsapp","invoice-pdf"].includes(button.dataset.action)){
      const client=getClientForSale(record);
      const message=getSaleMessage(record,client);
      if(button.dataset.action === "invoice-email"){
        if(!client?.email){window.showToast?.("Add an email address to this client before emailing the bill.");return;}
        const subject=`Bill ${record.documentNo||record.reference||""} from ${invoiceProfile.cmp_name||"COREBIQ"}`;
        window.open(`mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
        return;
      }
      if(button.dataset.action === "invoice-whatsapp"){
        const digits=String(client?.phone||"").replace(/\D/g,"").replace(/^0/,"");
        if(!digits){window.showToast?.("Add a phone number to this client before using WhatsApp.");return;}
        const phone=digits.length===10?`91${digits}`:digits;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
        return;
      }
      const popup=window.open("about:blank","_blank");
      await openSaleInvoice(record,client,popup);
      return;
    }
    if(button.dataset.action === "delete" && record.systemDefault){
      window.showToast?.("Cash and Bank system ledgers cannot be deleted.");
      return;
    }
    if(button.dataset.action === "edit"){
      openEditor(record);
      return;
    }
    if(!window.confirm(`Delete this ${(config.singular || config.title.replace(/s$/,"")).toLowerCase()} record?`)) return;
    button.disabled = true;
    try{
      await deleteRecord(moduleName,record.id);
      records = records.filter(item=>item.id !== record.id);
      renderRows();
      window.showToast?.("Record deleted.");
    }catch(error){
      button.disabled = false;
      window.showToast?.(error.message || "Delete failed.");
    }
  });

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const saveButton = document.getElementById("crudSave");
    const recordId = form.elements.recordId.value;
    const data = {};
    config.fields.forEach(field=>{
      const value = form.elements[field.key].value.trim();
      data[field.key] = field.type === "number" && value !== "" ? Number(value) : value;
    });
    saveButton.disabled = true;
    try{
      if(moduleName === "ledger" && !recordId && ["cash","bank"].includes(data.name.trim().toLowerCase())){
        throw new Error("Cash and Bank are preset ledgers. Edit the existing account instead.");
      }
      if(recordId){
        await updateRecord(moduleName,recordId,data);
        window.showToast?.("Record updated.");
      }else{
        await createRecord(moduleName,data);
        window.showToast?.("Record created.");
      }
      dialog.close();
      await refresh();
    }catch(error){
      feedback.textContent = error.message || "Save failed. Check Firestore access rules.";
      feedback.hidden = false;
    }finally{
      saveButton.disabled = false;
    }
  });

  await Promise.all([refresh(),refreshLookups(),...(moduleName === "sales"?[refreshInvoiceContext()]:[])]);
}
