import { getAuthProfile, observeAuth, signOutUser } from "./firebase-service.js?v=7";

const MODULES = {
  dashboard:"app-info/dashboard",
  company:"company/company",
  branches:"company/branches",
  clients:"crm/clients",
  staff:"employees/staff",
  products:"inventory/products",
  services:"inventory/services",
  sales:"gst/sales",
  purchases:"gst/purchases",
  invoices:"gst/invoices",
  "invoice-templates":"templates/invoice-template/invoice-templates",
  templates:"templates/index",
  "voucher-templates":"templates/voucher-templates/voucher-templates",
  "qr-template":"templates/qr-template/qr-template",
  expenses:"gst/expenses",
  transactions:"accounts/vouchers/index",
  "all-vouchers":"accounts/vouchers/all-vouchers",
  "contra-voucher":"accounts/vouchers/contra/contra",
  "payment-voucher":"accounts/vouchers/payments/payment-voucher",
  "receipt-voucher":"accounts/vouchers/receipts/receipts",
  "journal-voucher":"accounts/vouchers/journals/journals",
  "sales-voucher":"accounts/vouchers/sales/sales",
  "sales-return-voucher":"accounts/vouchers/sales-return/sales-return",
  "purchase-voucher":"accounts/vouchers/purchase/purchase",
  "purchase-return-voucher":"accounts/vouchers/purchase-return/purchase-return",
  "estimate-voucher":"accounts/vouchers/estimate/estimate",
  ledger:"accounts/ledgers/ledger",
  cheques:"accounts/vouchers/cheque-transactions/cheques",
  payments:"accounts/vouchers/payments/payments",
  qr:"more/qr",
  reports:"reports/reports",
  settings:"settings/settings",
  assistant:"tools/assistant"
};

const container = document.getElementById("moduleContainer");
const sidebar = document.getElementById("sidebar");
const appShell = document.getElementById("appShell");
const toast = document.getElementById("toast");
const globalSearchInput = document.getElementById("globalSearch");
const profileButton = document.getElementById("profileButton");
const profileMenu = document.getElementById("profileMenu");
const splashScreen = document.getElementById("splashScreen");
const onboarding = document.getElementById("onboarding");
const installButton = document.getElementById("installButton");
const onboardingInstall = document.getElementById("onboardingInstall");
let startupFinished = false;
let installPrompt = null;
let moduleLoadSequence = 0;
let geminiGradientSequence = 0;

const ICON_ALIASES = {
  home:"house",domain:"building-2",account_tree:"git-branch",group:"users",badge:"id-card",
  inventory_2:"boxes",design_services:"briefcase-business",point_of_sale:"hand-coins",
  shopping_cart:"shopping-cart",receipt_long:"receipt-text",payments:"wallet",
  account_balance:"landmark",currency_rupee:"indian-rupee",qr_code_2:"qr-code",
  bar_chart:"chart-no-axes-column",settings:"settings",auto_awesome:"sparkles",
  menu:"panel-left",search:"search",download:"download",sync:"refresh-cw",
  notifications:"bell",logout:"log-out",account_circle:"circle-user",add:"plus",person_add:"user-round-plus",
  history:"history",refresh:"refresh-cw",filter_list:"list-filter",close:"x",
  save:"save",edit:"pencil",delete:"trash-2",search_off:"search-x",inbox:"inbox",
  cloud_off:"cloud-off",error:"circle-alert",dashboard:"layout-dashboard",info:"info",
  gavel:"gavel",location_on:"map-pin",account_balance_wallet:"wallet-cards",
  settings_suggest:"settings-2",memory:"cpu",person:"user-round",flight_takeoff:"plane-takeoff",
  arrow_upward:"arrow-up",attach_file:"paperclip",picture_as_pdf:"file-down",
  chat:"message-circle",call:"phone",email:"mail"
};

function renderLucideIcons(root=document){
  document.querySelectorAll(".nav-item").forEach(button=>{ button.title = button.textContent.trim(); });
  root.querySelectorAll(".material-symbols-rounded").forEach(element=>{
    const name = element.textContent.trim();
    element.removeAttribute("class");
    element.setAttribute("data-lucide",ICON_ALIASES[name] || name.replaceAll("_","-"));
    element.textContent = "";
  });
  window.lucide?.createIcons();
  applyGeminiGradientIcons(document);
}

function applyGeminiGradientIcons(root){
  const selectors = [
    '.sidebar [data-module="assistant"] svg',
    '.bottom-nav [data-module="assistant"] svg',
    ".assistant-hero-mark svg",
    ".assistant-welcome svg",
    ".dashboard-ai-mark svg",
    ".dashboard-welcome-art svg"
  ].join(",");
  root.querySelectorAll(selectors).forEach(icon=>{
    const previousGradientId = icon.dataset.geminiGradient;
    if(previousGradientId && icon.querySelector(`linearGradient[id="${previousGradientId}"]`)) return;
    const namespace = "http://www.w3.org/2000/svg";
    const gradientId = `corebiq-gemini-${++geminiGradientSequence}`;
    const definitions = document.createElementNS(namespace,"defs");
    const gradient = document.createElementNS(namespace,"linearGradient");
    gradient.setAttribute("id",gradientId);
    gradient.setAttribute("x1","0%");
    gradient.setAttribute("y1","0%");
    gradient.setAttribute("x2","100%");
    gradient.setAttribute("y2","100%");
    [["0%","#EA4335"],["50%","#4285F4"],["100%","#A142F4"]].forEach(([offset,color])=>{
      const stop = document.createElementNS(namespace,"stop");
      stop.setAttribute("offset",offset);
      stop.setAttribute("stop-color",color);
      gradient.append(stop);
    });
    definitions.append(gradient);
    icon.prepend(definitions);
    icon.querySelectorAll("path,circle,line,polyline,polygon,rect").forEach(shape=>{
      shape.setAttribute("stroke",`url(#${gradientId})`);
    });
    icon.classList.add("gemini-gradient-icon");
    icon.dataset.geminiGradient = gradientId;
  });
}

function setModuleStylesheet(moduleName){
  const activeStylesheet = document.querySelector("link[data-module-stylesheet]");
  if(activeStylesheet?.dataset.moduleStylesheet === moduleName) return;

  const nextStylesheet = document.createElement("link");
  nextStylesheet.rel = "stylesheet";
  nextStylesheet.href = `modules/${moduleName}.css`;
  nextStylesheet.dataset.moduleStylesheet = moduleName;
  nextStylesheet.addEventListener("load", ()=>activeStylesheet?.remove(), {once:true});
  nextStylesheet.addEventListener("error", ()=>nextStylesheet.remove(), {once:true});
  document.head.append(nextStylesheet);
}

window.COREBIQ = {
  currentModule: null,
  renderIcons(root=container){ renderLucideIcons(root); },
  async loadModule(name){
    const requestId = ++moduleLoadSequence;
    const moduleName = MODULES[name] || MODULES.dashboard;
    this.currentModule = moduleName;
    if(globalSearchInput){
      const recordModules = ["branches","clients","staff","products","services","sales","purchases","invoices","expenses","transactions","all-vouchers","contra-voucher","payment-voucher","receipt-voucher","journal-voucher","sales-voucher","sales-return-voucher","purchase-voucher","purchase-return-voucher","estimate-voucher","ledger","payments","qr","reports","settings"];
      const label = name.charAt(0).toUpperCase()+name.slice(1);
      globalSearchInput.placeholder = recordModules.includes(name) ? `Search ${label.toLowerCase()}...` : "Search modules...";
      globalSearchInput.setAttribute("aria-label",globalSearchInput.placeholder);
    }
    setActive(name);
    setModuleStylesheet(moduleName);
    container.innerHTML = `<div class="loader" role="status" aria-label="Loading"><span class="loading-ring" aria-hidden="true"></span></div>`;

    try{
      const htmlResponse = await fetch(`modules/${moduleName}.html`, {cache:"no-store"});
      if(!htmlResponse.ok) throw new Error(`Module HTML not found: ${moduleName}`);
      const html = await htmlResponse.text();
      if(requestId !== moduleLoadSequence) return;

      // Insert ONLY the module markup. Module scripts are loaded separately.
      container.innerHTML = html;
      renderLucideIcons(container);

      // Explicit dynamic import: works even though the HTML was injected.
      const moduleScript = await import(`../modules/${moduleName}.js?ts=${Date.now()}`);
      if(requestId !== moduleLoadSequence) return;

      finishStartup();
      if(typeof moduleScript.init === "function"){
        await moduleScript.init();
      }
      renderLucideIcons(container);

      if(requestId !== moduleLoadSequence) return;
      window.scrollTo({top:0, behavior:"instant"});
      finishStartup();
    }catch(error){
      if(requestId !== moduleLoadSequence) return;
      console.error("Module load error:", error);
      container.innerHTML = `
        <div class="card card-pad empty">
          <span class="material-symbols-rounded">error</span>
          <h3>Unable to load module</h3>
          <p>${escapeHtml(error.message)}</p>
          <button class="btn btn-primary" onclick="COREBIQ.loadModule('dashboard')">Back to Dashboard</button>
        </div>`;
      renderLucideIcons(container);
      finishStartup();
    }
  }
};

function setActive(moduleName){
  let activeButton=null;
  document.querySelectorAll(".nav-item").forEach(btn=>{
    const isActive=btn.dataset.module===moduleName;
    btn.classList.toggle("active",isActive);
    if(isActive) activeButton=btn;
  });
  const activeGroup=activeButton?.closest("details[data-nav-group]");
  const templateRoutes=["templates","invoice-templates","voucher-templates","qr-template"];
  document.querySelectorAll("details[data-nav-group]").forEach(group=>{group.open=group===activeGroup||templateRoutes.includes(moduleName)&&group.dataset.navGroup==="templates";});
  document.querySelectorAll("details[data-nav-subgroup]").forEach(group=>{group.open=Boolean(activeButton&&group.contains(activeButton));});
}
function escapeHtml(value){
  return String(value).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function showToast(message){
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>toast.classList.remove("show"),2400);
}
window.showToast = showToast;

async function populateProfile(user){
  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");
  const profileRole = document.getElementById("profileRole");
  profileName.textContent = user.displayName || user.email?.split("@")[0] || "COREBIQ User";
  profileEmail.textContent = user.email || "";
  profileRole.textContent = "User";
  try{
    const profile = await getAuthProfile(user);
    if(!profile) return;
    profileName.textContent = profile.name;
    profileEmail.textContent = profile.email;
    profileRole.textContent = String(profile.role || "User");
  }catch(error){
    console.warn("Could not load custom user role:",error);
  }
}

function finishStartup(){
  if(startupFinished) return;
  startupFinished = true;
  const hasCompletedOnboarding = localStorage.getItem("corebiq-onboarding-complete") === "true";
  splashScreen?.classList.add("is-hidden");
  setTimeout(()=>{
    if(splashScreen) splashScreen.hidden = true;
    if(!hasCompletedOnboarding && onboarding){
      onboarding.hidden = false;
      document.getElementById("onboardingStart")?.focus();
    }
  }, 350);
}

function closeOnboarding(){
  localStorage.setItem("corebiq-onboarding-complete", "true");
  if(onboarding) onboarding.hidden = true;
}

async function installApp(){
  if(!installPrompt){
    showToast("To install, open Share and choose Add to Home Screen.");
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  if(installButton) installButton.hidden = true;
  if(onboardingInstall) onboardingInstall.hidden = true;
}

document.getElementById("onboardingStart")?.addEventListener("click", closeOnboarding);
installButton?.addEventListener("click", installApp);
onboardingInstall?.addEventListener("click", installApp);

window.addEventListener("beforeinstallprompt", event=>{
  event.preventDefault();
  installPrompt = event;
  if(installButton) installButton.hidden = false;
  if(onboardingInstall) onboardingInstall.hidden = false;
});

window.addEventListener("appinstalled", ()=>{
  installPrompt = null;
  if(installButton) installButton.hidden = true;
  if(onboardingInstall) onboardingInstall.hidden = true;
  showToast("COREBIQ has been installed.");
});

if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches){
  if(installButton) installButton.hidden = false;
  if(onboardingInstall) onboardingInstall.hidden = false;
}

if("serviceWorker" in navigator){
  const hadController = Boolean(navigator.serviceWorker.controller);
  if(hadController){
    navigator.serviceWorker.addEventListener("controllerchange",()=>window.location.reload(),{once:true});
  }
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("./sw.js").catch(error=>console.error("Service worker registration failed:", error));
  });
}

document.addEventListener("click", e=>{
  const button = e.target.closest("[data-module]");
  if(button){
    if(button instanceof HTMLAnchorElement) e.preventDefault();
    const moduleName = button.dataset.module;
    if(moduleName){
      COREBIQ.loadModule(moduleName);
      sidebar.classList.remove("open");
    }
  }
});

document.getElementById("menuButton")?.addEventListener("click", ()=>{
  const mobile = window.matchMedia("(max-width:760px)").matches;
  if(mobile){
    sidebar.classList.toggle("open");
  }else{
    appShell.classList.toggle("sidebar-collapsed");
  }
  const expanded = mobile ? sidebar.classList.contains("open") : !appShell.classList.contains("sidebar-collapsed");
  document.getElementById("menuButton")?.setAttribute("aria-expanded",String(expanded));
});
document.getElementById("signOutButton")?.addEventListener("click", async()=>{
  try{ await signOutUser(); }
  catch(error){ showToast(error.message || "Could not sign out."); }
});
profileButton?.addEventListener("click",()=>{
  profileMenu.hidden = !profileMenu.hidden;
  profileButton.setAttribute("aria-expanded",String(!profileMenu.hidden));
});
document.getElementById("syncButton")?.addEventListener("click", ()=>{
  if(COREBIQ.currentModule) COREBIQ.loadModule(COREBIQ.currentModule);
});

function submitGlobalSearch(){
  const query = globalSearchInput?.value.trim();
  if(!query) return;

  const moduleSearch = container.querySelector("#crudSearch");
  if(moduleSearch){
    moduleSearch.value = query;
    moduleSearch.dispatchEvent(new Event("input",{bubbles:true}));
    moduleSearch.focus();
    return;
  }

  const normalize = value=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
  const normalizedQuery = normalize(query);
  const moduleMatch = Object.entries(MODULES).find(([name])=>{
    const label = normalize(name);
    return normalizedQuery === label || normalizedQuery.startsWith(label);
  });
  if(moduleMatch){
    const suffix = query.slice(moduleMatch[0].length).trim();
    globalSearchInput.value = suffix;
    COREBIQ.loadModule(moduleMatch[0]).then(()=>{
      const search = container.querySelector("#crudSearch");
      if(search && suffix){
        search.value = suffix;
        search.dispatchEvent(new Event("input",{bubbles:true}));
        search.focus();
      }
    });
    return;
  }
  showToast("Open a record module to search its records.");
}

globalSearchInput?.addEventListener("keydown", event=>{
  if(event.key === "Enter") submitGlobalSearch();
});
document.getElementById("globalSearchButton")?.addEventListener("click", submitGlobalSearch);

renderLucideIcons();
window.addEventListener("load",()=>renderLucideIcons());
document.addEventListener("click",event=>{
  if(window.matchMedia("(max-width:760px)").matches && sidebar.classList.contains("open") &&
    !sidebar.contains(event.target) && !event.target.closest("#menuButton")) sidebar.classList.remove("open");
});
document.addEventListener("keydown",event=>{
  if(event.key === "Escape"){
    sidebar.classList.remove("open");
    if(profileMenu) profileMenu.hidden = true;
    profileButton?.setAttribute("aria-expanded","false");
  }
});
document.addEventListener("click",event=>{
  if(profileMenu && !profileMenu.hidden && !profileMenu.contains(event.target) && !profileButton?.contains(event.target)){
    profileMenu.hidden = true;
    profileButton?.setAttribute("aria-expanded","false");
  }
});
observeAuth(user=>{
  if(!user){
    window.location.replace("./login.html");
    return;
  }
  appShell.hidden = false;
  populateProfile(user);
  if(!COREBIQ.currentModule) COREBIQ.loadModule("dashboard");
},error=>{
  console.error("Authentication state error:",error);
  window.location.replace("./login.html");
});
