import { auth } from "./firebase-config.js";
import { onAuthStateChanged, logout } from "./auth.js";

const container = document.getElementById("moduleContainer");
const loader = document.getElementById("appLoader");
const title = document.getElementById("pageTitle");
const userEmail = document.getElementById("userEmail");

const modules = {
  dashboard: ["Dashboard", "modules/dashboard/dashboard.html", "modules/dashboard/dashboard.js"],
  company: ["Company Profile", "modules/company/company.html", "modules/company/company.js"],
  branches: ["Branches", "modules/branches/branches.html", "modules/branches/branches.js"],
  clients: ["Clients", "modules/clients/clients.html", "modules/clients/clients.js"],
  staff: ["Staff", "modules/staff/staff.html", "modules/staff/staff.js"],
  products: ["Products", "modules/products/products.html", "modules/products/products.js"],
  services: ["Services", "modules/services/services.html", "modules/services/services.js"],
  sales: ["Sales", "modules/sales/sales.html", "modules/sales/sales.js"],
  purchases: ["Purchases", "modules/purchases/purchases.html", "modules/purchases/purchases.js"],
  invoices: ["Invoices", "modules/invoices/invoices.html", "modules/invoices/invoices.js"],
  expenses: ["Expenses", "modules/expenses/expenses.html", "modules/expenses/expenses.js"],
  payments: ["Payments", "modules/payments/payments.html", "modules/payments/payments.js"],
  transactions: ["Transactions", "modules/transactions/transactions.html", "modules/transactions/transactions.js"],
  qr: ["QR", "modules/qr/qr.html", "modules/qr/qr.js"],
  reports: ["Reports", "modules/reports/reports.html", "modules/reports/reports.js"],
  settings: ["Settings", "modules/settings/settings.html", "modules/settings/settings.js"]
};

async function loadModule(name) {
  const item = modules[name] || modules.dashboard;
  title.textContent = item[0];
  document.querySelectorAll("[data-module]").forEach(b => b.classList.toggle("active", b.dataset.module === name));

  container.innerHTML = `<div class="module-loading"><div class="spinner"></div><span>Loading ${item[0]}...</span></div>`;
  try {
    const html = await fetch(item[1]).then(r => {
      if (!r.ok) throw new Error(`Module HTML not found: ${item[1]}`);
      return r.text();
    });
    container.innerHTML = html;
    const module = await import(`../${item[2]}?v=${Date.now()}`);
    if (typeof module.init === "function") await module.init();
  } catch (e) {
    console.error(e);
    container.innerHTML = `<div class="error-card"><h2>Module failed to load</h2><p>${e.message}</p></div>`;
  }
}

document.querySelectorAll("[data-module]").forEach(btn => btn.addEventListener("click", () => loadModule(btn.dataset.module)));

document.getElementById("logoutBtn").onclick = async () => {
  await logout();
  location.replace("login.html");
};

document.getElementById("menuBtn").onclick = () => document.getElementById("sidebar").classList.toggle("open");

onAuthStateChanged(auth, user => {
  if (!user) {
    location.replace("login.html");
    return;
  }
  userEmail.textContent = user.email || user.displayName || "Signed in";
  document.getElementById("profileBtn").textContent = (user.displayName || user.email || "U").charAt(0).toUpperCase();
  loader.classList.add("hidden");
  loadModule("dashboard");
});
