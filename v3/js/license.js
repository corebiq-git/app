import { getAppLicense, observeAuth } from "./firebase-service.js?v=7";

const planNames = ["Demo","Base","Enterprise","Pro"];
const APP_VERSION = "1.0.0";

function formatDate(value){
  if(!value) return "Not set";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if(Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}).format(date);
}

function renderLicense(license){
  const plan = planNames.includes(license?.planName) ? license.planName : "Demo";
  document.getElementById("licenseAppVersion").textContent = license?.appVersion || APP_VERSION;
  document.getElementById("licenseInfo").textContent = license?.licenseInfo || (plan === "Demo" ? "Demo license" : "License active");
  document.getElementById("licenseValidTill").textContent = formatDate(license?.validTill);
  document.getElementById("licensePlanName").textContent = plan;
  document.getElementById("licensePlanBadge").textContent = plan;
  document.querySelectorAll("[data-plan]").forEach(option=>option.classList.toggle("is-current",option.dataset.plan === plan));
}

observeAuth(async user=>{
  if(!user){
    window.location.replace("./login.html");
    return;
  }
  renderLicense(null);
  try{
    renderLicense(await getAppLicense(user));
  }catch(error){
    document.getElementById("licenseFeedback").textContent = error.message || "Could not load license information.";
    document.getElementById("licenseFeedback").hidden = false;
  }
},()=>window.location.replace("./login.html"));

window.addEventListener("load",()=>window.lucide?.createIcons());
