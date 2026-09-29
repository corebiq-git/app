const MODULES = {
  dashboard:"dashboard",
  company:"company",
  branches:"branches",
  clients:"clients",
  staff:"staff",
  products:"products",
  services:"services",
  sales:"sales",
  purchases:"purchases",
  invoices:"invoices",
  expenses:"expenses",
  transactions:"transactions",
  payments:"payments",
  qr:"qr",
  reports:"reports",
  settings:"settings"
};

const container = document.getElementById("moduleContainer");
const sidebar = document.getElementById("sidebar");
const toast = document.getElementById("toast");

window.COREBIQ = {
  currentModule: null,
  async loadModule(name){
    const moduleName = MODULES[name] || MODULES.dashboard;
    this.currentModule = moduleName;
    setActive(moduleName);
    container.innerHTML = `<div class="loader"><span class="material-symbols-rounded">sync</span></div>`;

    try{
      const htmlResponse = await fetch(`modules/${moduleName}.html`, {cache:"no-store"});
      if(!htmlResponse.ok) throw new Error(`Module HTML not found: ${moduleName}`);
      const html = await htmlResponse.text();

      // Insert ONLY the module markup. Module scripts are loaded separately.
      container.innerHTML = html;

      // Explicit dynamic import: works even though the HTML was injected.
      const moduleScript = await import(`../modules/${moduleName}.js?ts=${Date.now()}`);

      if(typeof moduleScript.init === "function"){
        await moduleScript.init();
      }

      window.scrollTo({top:0, behavior:"instant"});
    }catch(error){
      console.error("Module load error:", error);
      container.innerHTML = `
        <div class="card card-pad empty">
          <span class="material-symbols-rounded">error</span>
          <h3>Unable to load module</h3>
          <p>${escapeHtml(error.message)}</p>
          <button class="btn btn-primary" onclick="COREBIQ.loadModule('dashboard')">Back to Dashboard</button>
        </div>`;
    }
  }
};

function setActive(moduleName){
  document.querySelectorAll(".nav-item").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.module===moduleName);
  });
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

document.addEventListener("click", e=>{
  const button = e.target.closest("[data-module]");
  if(button){
    const moduleName = button.dataset.module;
    if(moduleName){
      COREBIQ.loadModule(moduleName);
      sidebar.classList.remove("open");
    }
  }
});

document.getElementById("menuButton")?.addEventListener("click", ()=>{
  sidebar.classList.toggle("open");
});
document.getElementById("bottomMenu")?.addEventListener("click", ()=>{
  sidebar.classList.toggle("open");
});
document.getElementById("syncButton")?.addEventListener("click", ()=>{
  if(COREBIQ.currentModule) COREBIQ.loadModule(COREBIQ.currentModule);
});

document.getElementById("globalSearch")?.addEventListener("keydown", e=>{
  if(e.key==="Enter" && e.target.value.trim()){
    showToast(`Searching for "${e.target.value.trim()}"`);
  }
});

COREBIQ.loadModule("dashboard");
