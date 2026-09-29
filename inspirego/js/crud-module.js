import { createRecord, deleteRecord, listRecords, updateRecord } from "./firebase-service.js?v=7";

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
  settings:{title:"Settings",icon:"settings",description:"Manage workspace settings.",fields:[{key:"name",label:"Setting name",required:true},{key:"value",label:"Value",type:"textarea"},{key:"description",label:"Description",type:"textarea"}]}
};

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[character]));
}

function renderInput(field){
  const required = field.required ? " required" : "";
  if(field.type === "select"){
    return `<select class="form-control" name="${field.key}"${required}><option value="">Select</option>${field.options.map(option=>`<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}</select>`;
  }
  if(field.type === "textarea") return `<textarea class="form-control" name="${field.key}" rows="3"${required}></textarea>`;
  return `<input class="form-control" name="${field.key}" type="${field.type || "text"}"${field.type === "number" ? ' step="any"' : ""}${required}>`;
}

function renderPage(config){
  const singular = config.singular || config.title.replace(/s$/,"");
  const filterField = config.fields.find(field=>field.type === "select") || config.fields[0];
  const fields = config.fields.map(field=>`<div class="form-group"><label>${escapeHtml(field.label)}${field.required ? ' <span class="req">*</span>' : ""}</label>${renderInput(field)}</div>`).join("");
  const headers = config.fields.map(field=>`<th>${escapeHtml(field.label)}</th>`).join("");
  return `<div class="module-page crud-page">
    <div class="page-header"><div class="page-title"><div class="page-title-icon"><span class="material-symbols-rounded">${config.icon}</span></div><div><h1>${config.title}</h1><p>${config.description}</p></div></div><div class="actions"><button class="btn btn-outline" id="crudRefresh" type="button" title="Refresh"><span class="material-symbols-rounded">refresh</span><span>Refresh</span></button><button class="btn btn-primary" id="crudCreate" type="button"><span class="material-symbols-rounded">add</span><span>Add ${singular}</span></button></div></div>
    <div class="card card-pad"><div class="crud-toolbar"><input class="input-search" id="crudSearch" type="search" placeholder="Search ${config.title.toLowerCase()}..." aria-label="Search ${config.title}"><select class="form-control crud-select" id="crudFilter" aria-label="Filter by ${escapeHtml(filterField.label)}"><option value="">All ${escapeHtml(config.title.toLowerCase())}</option></select><select class="form-control crud-select" id="crudSort" aria-label="Sort records"><option value="updated-desc">Recent</option><option value="updated-asc">Oldest</option><option value="field-asc">${escapeHtml(filterField.label)} A-Z</option><option value="field-desc">${escapeHtml(filterField.label)} Z-A</option></select><button class="btn btn-outline crud-toolbar-icon" id="crudCsvDownload" type="button" title="Download filtered data as CSV" aria-label="Download filtered data as CSV"><span class="material-symbols-rounded">download</span><span class="crud-control-label">CSV</span></button><button class="btn btn-outline crud-toolbar-icon" id="crudPdf" type="button" title="Download filtered data as PDF" aria-label="Download filtered data as PDF"><span class="material-symbols-rounded">picture_as_pdf</span><span class="crud-control-label">PDF</span></button><button class="btn btn-outline crud-toolbar-icon" id="crudClear" type="button" title="Clear search, filter and sort" aria-label="Clear search, filter and sort"><span class="material-symbols-rounded">refresh</span><span class="crud-control-label">Clear</span></button></div><p class="crud-feedback" id="crudFeedback" role="status" hidden></p><div class="table-wrap"><table class="data-table"><thead><tr>${headers}<th>Updated</th><th>Actions</th></tr></thead><tbody id="crudRows"><tr><td colspan="${config.fields.length+2}"><div class="loader"><span class="material-symbols-rounded">sync</span></div></td></tr></tbody></table></div></div>
    <dialog class="crud-dialog" id="crudDialog"><form id="crudForm"><div class="crud-dialog-header"><h2 id="crudDialogTitle">Add ${config.title.replace(/s$/,"")}</h2><button class="icon-button" type="button" id="crudClose" aria-label="Close"><span class="material-symbols-rounded">close</span></button></div><input type="hidden" name="recordId"><div class="form-grid">${fields}</div><div class="form-actions"><button class="btn btn-outline" type="button" id="crudCancel">Cancel</button><button class="btn btn-primary" id="crudSave" type="submit"><span class="material-symbols-rounded">save</span><span>Save</span></button></div></form></dialog>
  </div>`;
}

function parseCsv(source){
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for(let index=0;index<source.length;index++){
    const character = source[index];
    if(quoted){
      if(character === '"' && source[index+1] === '"'){
        value += '"';
        index++;
      }else if(character === '"') quoted = false;
      else value += character;
    }else if(character === '"' && value.length === 0){
      quoted = true;
    }else if(character === ","){
      row.push(value);
      value = "";
    }else if(character === "\n" || character === "\r"){
      if(character === "\r" && source[index+1] === "\n") index++;
      row.push(value);
      if(row.some(cell=>cell.trim())) rows.push(row);
      row = [];
      value = "";
    }else value += character;
  }
  if(quoted) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(value);
  if(row.some(cell=>cell.trim())) rows.push(row);
  return rows;
}

function formatDate(value){
  if(!value) return "--";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(date);
}

export async function initCrudModule(moduleName){
  const config = MODULE_CONFIG[moduleName];
  const container = document.getElementById("moduleContainer");
  if(!config || !container) return;

  container.innerHTML = renderPage(config);
  const rows = document.getElementById("crudRows");
  const feedback = document.getElementById("crudFeedback");
  const dialog = document.getElementById("crudDialog");
  const form = document.getElementById("crudForm");
  const pdfRows = document.getElementById("crudPdfRows");
  const filterField = config.fields.find(field=>field.type === "select") || config.fields[0];
  let records = [];
  let pdfDocuments = [];

  function renderFilterOptions(){
    const filter = document.getElementById("crudFilter");
    const selected = filter.value;
    const values = [...new Set(records.map(record=>String(record[filterField.key] ?? "").trim()).filter(Boolean))].sort((left,right)=>left.localeCompare(right));
    filter.innerHTML = `<option value="">All ${escapeHtml(config.title.toLowerCase())}</option>${values.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    filter.value = values.includes(selected) ? selected : "";
  }

  function renderRows(){
    const query = document.getElementById("crudSearch").value.trim().toLowerCase();
    const filterValue = document.getElementById("crudFilter").value;
    const sortOrder = document.getElementById("crudSort").value;
    const visible = records.filter(record=>
      (!filterValue || String(record[filterField.key] ?? "") === filterValue) &&
      config.fields.some(field=>String(record[field.key] ?? "").toLowerCase().includes(query))
    );
    visible.sort((left,right)=>{
      if(sortOrder.startsWith("field-")){
        const comparison = String(left[filterField.key] ?? "").localeCompare(String(right[filterField.key] ?? ""));
        return sortOrder === "field-asc" ? comparison : -comparison;
      }
      const getTime = record=>{
        const value = record.updatedAt || record.createdAt || record.date;
        if(value?.toMillis) return value.toMillis();
        const time = value ? new Date(value).getTime() : 0;
        return Number.isNaN(time) ? 0 : time;
      };
      const leftTime = getTime(left);
      const rightTime = getTime(right);
      return sortOrder === "updated-asc" ? leftTime-rightTime : rightTime-leftTime;
    });
    if(!visible.length){
      rows.innerHTML = `<tr><td colspan="${config.fields.length+2}"><div class="empty"><span class="material-symbols-rounded">${records.length ? "search_off" : "inbox"}</span><p>${records.length ? "No matching records." : `No ${config.title.toLowerCase()} found.`}</p></div></td></tr>`;
      window.COREBIQ?.renderIcons(rows);
      return;
    }
    rows.innerHTML = visible.map(record=>`<tr>${config.fields.map(field=>`<td>${escapeHtml(record[field.key] ?? "--")}</td>`).join("")}<td>${formatDate(record.updatedAt || record.createdAt)}</td><td><div class="crud-row-actions"><button class="icon-button" type="button" data-action="edit" data-id="${escapeHtml(record.id)}" aria-label="Edit record"><span class="material-symbols-rounded">edit</span></button><button class="icon-button crud-delete" type="button" data-action="delete" data-id="${escapeHtml(record.id)}" aria-label="Delete record"><span class="material-symbols-rounded">delete</span></button></div></td></tr>`).join("");
    window.COREBIQ?.renderIcons(rows);
  }

  async function refresh(){
    feedback.hidden = true;
    rows.innerHTML = `<tr><td colspan="${config.fields.length+2}"><div class="loader"><span class="material-symbols-rounded">sync</span></div></td></tr>`;
    try{
      records = await listRecords(moduleName);
      renderFilterOptions();
      renderRows();
    }catch(error){
      records = [];
      rows.innerHTML = `<tr><td colspan="${config.fields.length+2}"><div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Could not load ${config.title.toLowerCase()} from Firebase.</p></div></td></tr>`;
      window.COREBIQ?.renderIcons(rows);
      feedback.textContent = error.message || "Check your Firebase configuration and Firestore access rules.";
      feedback.hidden = false;
    }
  }

  function renderPdfDocuments(){
    if(!pdfDocuments.length){
      pdfRows.innerHTML = `<p class="crud-pdf-empty">No PDF attachments imported.</p>`;
      return;
    }
    pdfRows.innerHTML = pdfDocuments.map(documentRecord=>`<div class="crud-pdf-row"><button class="crud-pdf-open" type="button" data-pdf-open="${escapeHtml(documentRecord.id)}"><span class="material-symbols-rounded">picture_as_pdf</span><span>${escapeHtml(documentRecord.fileName)}</span></button><time>${formatDate(documentRecord.createdAt)}</time><button class="icon-button crud-delete" type="button" data-pdf-delete="${escapeHtml(documentRecord.id)}" aria-label="Delete PDF attachment"><span class="material-symbols-rounded">delete</span></button></div>`).join("");
    window.COREBIQ?.renderIcons(pdfRows);
  }

  async function refreshPdfDocuments(){
    try{
      pdfDocuments = await listModulePdfs(moduleName);
      renderPdfDocuments();
    }catch(error){
      pdfRows.innerHTML = `<p class="crud-pdf-error">Could not load PDF attachments: ${escapeHtml(error.message || "Check Firebase Storage and Firestore rules.")}</p>`;
    }
  }

  function openEditor(record){
    form.reset();
    form.elements.recordId.value = record?.id || "";
    config.fields.forEach(field=>{
      form.elements[field.key].value = record?.[field.key] ?? "";
    });
    document.getElementById("crudDialogTitle").textContent = `${record ? "Edit" : "Add"} ${config.singular || config.title.replace(/s$/,"")}`;
    dialog.showModal();
  }

  document.getElementById("crudCreate").addEventListener("click",()=>openEditor(null));
  document.getElementById("crudRefresh").addEventListener("click",refresh);
  document.getElementById("crudSearch").addEventListener("input",renderRows);
  document.getElementById("crudFilter").addEventListener("change",renderRows);
  document.getElementById("crudSort").addEventListener("change",renderRows);
  document.getElementById("crudPdf").addEventListener("click",()=>window.print());
  document.getElementById("crudImport").addEventListener("click",()=>document.getElementById("crudCsvFile").click());
  document.getElementById("crudPdfImport").addEventListener("click",()=>document.getElementById("crudPdfFile").click());
  document.getElementById("crudPdfFile").addEventListener("change",async event=>{
    const file = event.target.files?.[0];
    if(!file) return;
    feedback.hidden = true;
    try{
      const documentRecord = await uploadModulePdf(moduleName,file);
      pdfDocuments = [documentRecord,...pdfDocuments];
      renderPdfDocuments();
      window.showToast?.("PDF attachment imported.");
    }catch(error){
      feedback.textContent = error.message || "PDF upload failed. Check Firebase Storage rules.";
      feedback.hidden = false;
    }finally{
      event.target.value = "";
    }
  });
  pdfRows.addEventListener("click",async event=>{
    const openButton = event.target.closest("[data-pdf-open]");
    if(openButton){
      const documentRecord = pdfDocuments.find(item=>item.id === openButton.dataset.pdfOpen);
      if(!documentRecord) return;
      const preview = window.open("about:blank","_blank");
      try{
        const blobUrl = URL.createObjectURL(await getModulePdfBlob(documentRecord));
        if(preview){
          preview.opener = null;
          preview.location.href = blobUrl;
        }else{
          const download = document.createElement("a");
          download.href = blobUrl;
          download.download = documentRecord.fileName;
          download.click();
        }
        setTimeout(()=>URL.revokeObjectURL(blobUrl),60000);
      }catch(error){
        preview?.close();
        window.showToast?.(error.message || "Could not open the PDF attachment.");
      }
      return;
    }
    const button = event.target.closest("[data-pdf-delete]");
    if(!button) return;
    const documentRecord = pdfDocuments.find(item=>item.id === button.dataset.pdfDelete);
    if(!documentRecord || !window.confirm(`Delete ${documentRecord.fileName}?`)) return;
    button.disabled = true;
    try{
      await deleteModulePdf(moduleName,documentRecord);
      pdfDocuments = pdfDocuments.filter(item=>item.id !== documentRecord.id);
      renderPdfDocuments();
      window.showToast?.("PDF attachment deleted.");
    }catch(error){
      button.disabled = false;
      window.showToast?.(error.message || "Could not delete PDF attachment.");
    }
  });
  document.getElementById("crudCsvFile").addEventListener("change",async event=>{
    const file = event.target.files?.[0];
    if(!file) return;
    feedback.hidden = true;
    try{
      const rows = parseCsv(await file.text());
      if(rows.length < 2) throw new Error("Add a header row and at least one record to the CSV.");
      const normalize = value=>value.trim().toLowerCase().replace(/[^a-z0-9]/g,"");
      const headerIndexes = new Map(rows[0].map((header,index)=>[normalize(header),index]));
      const fieldIndexes = new Map(config.fields.map(field=>[
        field.key,
        headerIndexes.get(normalize(field.key)) ?? headerIndexes.get(normalize(field.label))
      ]));
      const missing = config.fields.filter(field=>field.required && fieldIndexes.get(field.key) === undefined);
      if(missing.length) throw new Error(`CSV is missing required columns: ${missing.map(field=>field.label).join(", ")}.`);
      const imported = rows.slice(1).map((cells,rowIndex)=>{
        const record = {};
        config.fields.forEach(field=>{
          const cellIndex = fieldIndexes.get(field.key);
          const value = cellIndex === undefined ? "" : (cells[cellIndex] ?? "").trim();
          if(field.required && !value) throw new Error(`Row ${rowIndex+2} is missing ${field.label}.`);
          record[field.key] = field.type === "number" && value ? Number(value) : value;
          if(field.type === "number" && value && !Number.isFinite(record[field.key])) throw new Error(`Row ${rowIndex+2} has an invalid number in ${field.label}.`);
        });
        return record;
      });
      await importRecords(moduleName,imported);
      window.showToast?.(`${imported.length} ${config.title.toLowerCase()} imported.`);
      await refresh();
    }catch(error){
      feedback.textContent = error.message || "CSV import failed.";
      feedback.hidden = false;
    }finally{
      event.target.value = "";
    }
  });
  document.getElementById("crudCancel").addEventListener("click",()=>dialog.close());
  document.getElementById("crudClose").addEventListener("click",()=>dialog.close());
  rows.addEventListener("click",async event=>{
    const button = event.target.closest("[data-action]");
    if(!button) return;
    const record = records.find(item=>item.id === button.dataset.id);
    if(!record) return;
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

  await Promise.all([refresh(),refreshPdfDocuments()]);
}
