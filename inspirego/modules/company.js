import { getCompany, saveCompany } from "../js/firebase-service.js?v=6";

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
  el("cmp_id").value = "master";
  fields.forEach(id=>{
    if(el(id)) el(id).value = data[id] ?? "";
  });
  ["createdAt","createdBy","createdByEmail","updatedAt","updatedBy","updatedByEmail"].forEach(key=>{
    const target = {
      createdAt:"sys_created_at",createdBy:"sys_created_by",createdByEmail:"sys_created_email",
      updatedAt:"sys_updated_at",updatedBy:"sys_updated_by",updatedByEmail:"sys_updated_email"
    }[key];
    if(el(target)){
      const value = data[key];
      el(target).textContent = value?.toDate ? value.toDate().toLocaleString() : value || "--";
    }
  });
}

async function load(){
  el("companyLoader").style.display = "grid";
  el("companyForm").style.display = "none";

  let data;
  try{
    data = await getCompany() || {};
  }catch(error){
    el("companyLoader").innerHTML = `<div class="empty"><span class="material-symbols-rounded">cloud_off</span><p>Could not load company profile from Firebase.</p><small>${String(error.message || "Check Firebase configuration and Firestore access rules.")}</small></div>`;
    return;
  }

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
    saveButton.innerHTML = `<span class="material-symbols-rounded">sync</span> Saving...`;

    const data = {};
    fields.forEach(id=>data[id]=el(id)?.value || "");
    try{
      await saveCompany(data);
      original = structuredClone(data);
      populate(data);
      setEditing(false);
      window.showToast?.("Company profile saved.");
    }catch(error){
      window.showToast?.(error.message || "Could not save company profile.");
    }finally{
      saveButton.disabled = false;
      saveButton.innerHTML = `<span class="material-symbols-rounded">save</span> Save Company`;
      window.COREBIQ?.renderIcons(saveButton);
    }
  });

  await load();
}
