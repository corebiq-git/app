import { getCompany, getCompanyLogoBlob, saveCompany, uploadCompanyLogo } from "../../js/firebase-service.js?v=6";

const fields = [
  "cmp_name","cmp_legal_name","cmp_biz_type","cmp_email","cmp_phone","cmp_alt_phone",
  "cmp_website","cmp_reg_no","cmp_pan","cmp_gstin","cmp_cin","cmp_addr1","cmp_addr2",
  "cmp_city","cmp_district","cmp_state","cmp_pin","cmp_country","cmp_currency","cmp_fy_start",
  "cmp_tax_type","cmp_tax_rate","cmp_inv_prefix","cmp_inv_start","cmp_bank_name","cmp_acc_name",
  "cmp_acc_no","cmp_ifsc","cmp_bank_branch","cmp_logo","cmp_logo_ratio","cmp_inv_logo","cmp_inv_header",
  "cmp_date_format","cmp_timezone","cmp_terms","cmp_notes"
];

let original = {};
let editing = false;
let pendingLogoFile = null;
let removeCurrentLogo = false;
let logoObjectUrl = "";
let logoPreviewRequest = 0;

function el(id){ return document.getElementById(id); }

function selectedLogoRatio(){
  return document.querySelector('input[name="companyLogoRatioChoice"]:checked')?.value || "horizontal";
}

function setLogoRatio(value){
  const ratio = value === "square" ? "square" : "horizontal";
  el("cmp_logo_ratio").value = ratio;
  document.querySelectorAll('input[name="companyLogoRatioChoice"]').forEach(input=>{ input.checked = input.value === ratio; });
  el("companyLogoPreview").classList.toggle("is-square",ratio === "square");
  el("companyLogoPreview").classList.toggle("is-horizontal",ratio === "horizontal");
}

function releaseLogoObjectUrl(){
  if(logoObjectUrl){
    URL.revokeObjectURL(logoObjectUrl);
    logoObjectUrl = "";
  }
}

function showLogoPreview(source,filename){
  const image = el("companyLogoImage");
  releaseLogoObjectUrl();
  image.onload = ()=>{
    image.hidden = false;
    el("companyLogoPlaceholder").hidden = true;
  };
  image.onerror = ()=>{
    image.hidden = true;
    el("companyLogoPlaceholder").hidden = false;
    el("companyLogoPlaceholder").textContent = "Logo preview unavailable";
  };
  image.src = source;
  el("companyLogoFilename").textContent = filename || "Company logo";
  el("companyLogoRemove").hidden = !source;
}

async function loadLogoPreview(value){
  const request = ++logoPreviewRequest;
  setLogoRatio(el("cmp_logo_ratio").value);
  el("companyLogoImage").hidden = true;
  el("companyLogoPlaceholder").hidden = false;
  el("companyLogoPlaceholder").textContent = value ? "Loading logo..." : "No company logo selected";
  el("companyLogoFilename").textContent = value || "PNG, JPG, or WebP; max 5 MB";
  el("companyLogoRemove").hidden = !value;
  if(!value){
    releaseLogoObjectUrl();
    el("companyLogoImage").removeAttribute("src");
    return;
  }
  if(/^(https?:|data:|blob:)/i.test(value)){
    showLogoPreview(value,"Saved company logo");
    return;
  }
  try{
    const blob = await getCompanyLogoBlob(value);
    if(request !== logoPreviewRequest) return;
    releaseLogoObjectUrl();
    logoObjectUrl = URL.createObjectURL(blob);
    const previewUrl = logoObjectUrl;
    const image = el("companyLogoImage");
    image.onload = ()=>{
      image.hidden = false;
      el("companyLogoPlaceholder").hidden = true;
    };
    image.onerror = ()=>{
      image.hidden = true;
      el("companyLogoPlaceholder").textContent = "Logo preview unavailable";
    };
    image.src = previewUrl;
  }catch(error){
    if(request !== logoPreviewRequest) return;
    el("companyLogoPlaceholder").textContent = "Could not load saved logo";
  }
}

function setEditing(value){
  editing = value;
  fields.forEach(id=>{ if(el(id)) el(id).disabled = !value; });
  el("companyLogoFile").disabled = !value;
  el("companyLogoChoose").disabled = !value;
  el("companyLogoRemove").disabled = !value;
  document.querySelectorAll('input[name="companyLogoRatioChoice"]').forEach(input=>{ input.disabled = !value; });
  el("companyViewActions").style.display = value ? "none" : "flex";
  el("companyEditActions").style.display = value ? "flex" : "none";
  if(!value){
    pendingLogoFile = null;
    removeCurrentLogo = false;
  }
  if(value) el("cmp_name")?.focus();
}

function populate(data){
  el("cmp_id").value = "master";
  fields.forEach(id=>{
    if(el(id)) el(id).value = data[id] ?? "";
  });
  if(!data.cmp_logo_ratio) el("cmp_logo_ratio").value = "horizontal";
  setLogoRatio(data.cmp_logo_ratio);
  pendingLogoFile = null;
  removeCurrentLogo = false;
  void loadLogoPreview(data.cmp_logo || "");
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
  el("companyLogoChoose").addEventListener("click",()=>el("companyLogoFile").click());
  el("companyLogoFile").addEventListener("change",event=>{
    const file = event.target.files?.[0];
    if(!file) return;
    el("companyLogoStatus").hidden = true;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024){
      el("companyLogoStatus").textContent = "Choose a PNG, JPG, or WebP image no larger than 5 MB.";
      el("companyLogoStatus").hidden = false;
      event.target.value = "";
      return;
    }
    pendingLogoFile = file;
    removeCurrentLogo = false;
    releaseLogoObjectUrl();
    const previewUrl = URL.createObjectURL(file);
    logoObjectUrl = previewUrl;
    const image = el("companyLogoImage");
    image.onload = ()=>{
      image.hidden = false;
      el("companyLogoPlaceholder").hidden = true;
    };
    image.src = previewUrl;
    el("companyLogoFilename").textContent = file.name;
    el("companyLogoRemove").hidden = false;
  });
  el("companyLogoRemove").addEventListener("click",()=>{
    pendingLogoFile = null;
    removeCurrentLogo = true;
    el("companyLogoFile").value = "";
    releaseLogoObjectUrl();
    el("companyLogoImage").removeAttribute("src");
    el("companyLogoImage").hidden = true;
    el("companyLogoPlaceholder").hidden = false;
    el("companyLogoPlaceholder").textContent = "Logo will be removed when saved";
    el("companyLogoFilename").textContent = "No company logo selected";
    el("companyLogoRemove").hidden = true;
  });
  document.querySelectorAll('input[name="companyLogoRatioChoice"]').forEach(input=>{
    input.addEventListener("change",()=>setLogoRatio(selectedLogoRatio()));
  });

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
      if(pendingLogoFile) data.cmp_logo = await uploadCompanyLogo(pendingLogoFile);
      else if(removeCurrentLogo) data.cmp_logo = "";
      data.cmp_logo_ratio = selectedLogoRatio();
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
