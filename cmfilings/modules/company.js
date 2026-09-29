const fields = [
  "cmp_name","cmp_legal_name","cmp_biz_type","cmp_email","cmp_phone","cmp_alt_phone",
  "cmp_website","cmp_reg_no","cmp_pan","cmp_gstin","cmp_cin","cmp_addr1","cmp_addr2",
  "cmp_city","cmp_district","cmp_state","cmp_pin","cmp_country","cmp_currency","cmp_fy_start",
  "cmp_tax_type","cmp_tax_rate","cmp_inv_prefix","cmp_inv_start","cmp_bank_name","cmp_acc_name",
  "cmp_acc_no","cmp_ifsc","cmp_bank_branch","cmp_logo","cmp_inv_logo","cmp_inv_header",
  "cmp_date_format","cmp_timezone","cmp_terms","cmp_notes"
];

let original = {};
let editing = false;

function el(id){ return document.getElementById(id); }

function setEditing(value){
  editing = value;
  fields.forEach(id=>{ if(el(id)) el(id).disabled = !value; });
  el("companyViewActions").style.display = value ? "none" : "flex";
  el("companyEditActions").style.display = value ? "flex" : "none";
  if(value) el("cmp_name")?.focus();
}

function populate(data){
  fields.forEach(id=>{
    if(el(id) && data[id] !== undefined) el(id).value = data[id];
  });
  ["createdAt","createdBy","createdByEmail","updatedAt","updatedBy","updatedByEmail"].forEach(key=>{
    const target = {
      createdAt:"sys_created_at",createdBy:"sys_created_by",createdByEmail:"sys_created_email",
      updatedAt:"sys_updated_at",updatedBy:"sys_updated_by",updatedByEmail:"sys_updated_email"
    }[key];
    if(el(target)) el(target).textContent = data[key] || "--";
  });
}

async function load(){
  el("companyLoader").style.display = "grid";
  el("companyForm").style.display = "none";

  // Demo mode: intentionally works without Firebase.
  // Replace this block with getCompany() from firebase-service.js when configured.
  await new Promise(r=>setTimeout(r,300));

  const saved = JSON.parse(localStorage.getItem("corebiq_company_demo") || "null");
  const data = saved || {
    cmp_id:"COMP-00001",
    cmp_country:"India",
    cmp_currency:"INR",
    cmp_fy_start:"April",
    cmp_tax_type:"Registered",
    cmp_date_format:"DD-MM-YYYY",
    cmp_timezone:"Asia/Kolkata",
    cmp_inv_prefix:"INV-",
    cmp_inv_start:"1"
  };

  original = structuredClone(data);
  populate(data);

  el("companyLoader").style.display = "none";
  el("companyForm").style.display = "block";
  setEditing(false);
}

export async function init(){
  el("companyEdit").addEventListener("click",()=>setEditing(true));
  el("companyRefresh").addEventListener("click",load);

  el("companyCancel").addEventListener("click",()=>{
    populate(original);
    setEditing(false);
  });

  el("companyForm").addEventListener("submit", async e=>{
    e.preventDefault();
    const saveButton = el("companySave");
    saveButton.disabled = true;
    const old = saveButton.innerHTML;
    saveButton.innerHTML = `<span class="material-symbols-rounded">sync</span> Saving...`;

    const data = {};
    fields.forEach(id=>data[id]=el(id)?.value || "");
    data.updatedAt = new Date().toLocaleString("en-IN");
    data.updatedBy = "Demo User";
    if(!original.createdAt){
      data.createdAt = new Date().toLocaleString("en-IN");
      data.createdBy = "Demo User";
    }else{
      data.createdAt = original.createdAt;
      data.createdBy = original.createdBy;
      data.createdByEmail = original.createdByEmail || "";
    }

    localStorage.setItem("corebiq_company_demo",JSON.stringify(data));
    original = structuredClone(data);
    populate(data);
    setEditing(false);
    saveButton.disabled = false;
    saveButton.innerHTML = old;
    window.showToast?.("Company saved successfully");
  });

  await load();
}
