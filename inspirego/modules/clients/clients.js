import { db, auth } from "../../js/firebase-config.js";
import {
  collection, getDocs, doc, getDoc, setDoc, deleteDoc,
  serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const collectionRef = collection(db, "clients");

const $ = (id) => document.getElementById(id);
const form = $("clientForm");
const modal = $("clientModal");
const tbody = $("clientTableBody");
const loader = $("clientLoader");
const empty = $("clientEmpty");
const search = $("clientSearch");
const statusFilter = $("clientStatusFilter");

let clients = [];
let editingId = null;

function userInfo() {
  const user = auth.currentUser || window.currentUser;
  const email = user?.email || "system";
  return {
    email,
    name: user?.displayName || email.split("@")[0] || "system"
  };
}

function makeId(number) {
  return `CLI-${String(number).padStart(5, "0")}`;
}

async function nextClientId() {
  const snap = await getDocs(collectionRef);
  let max = 0;

  snap.forEach(d => {
    const id = d.data()?.client_id || d.id;
    const m = String(id).match(/^CLI-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });

  return makeId(max + 1);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

function badge(status) {
  return `<span class="status-badge ${String(status).toLowerCase()}">${esc(status || "Active")}</span>`;
}

function render() {
  const term = search.value.trim().toLowerCase();
  const status = statusFilter.value;

  const filtered = clients.filter(c => {
    const text = [
      c.client_id, c.client_name, c.client_email, c.client_phone,
      c.client_gstin, c.client_pan, c.client_type
    ].join(" ").toLowerCase();

    return (!term || text.includes(term)) &&
           (!status || c.client_status === status);
  });

  tbody.innerHTML = "";

  filtered.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${esc(c.client_id)}</strong></td>
      <td>
        <div class="client-name">${esc(c.client_name)}</div>
        <div class="muted">${esc(c.client_city || "")}</div>
      </td>
      <td>
        <div>${esc(c.client_email || "—")}</div>
        <div class="muted">${esc(c.client_phone || "—")}</div>
      </td>
      <td>${esc(c.client_type || "Business")}</td>
      <td>
        <div>${esc(c.client_gstin || "—")}</div>
        <div class="muted">${esc(c.client_pan || "")}</div>
      </td>
      <td>${badge(c.client_status)}</td>
      <td>
        <div class="row-actions">
          <button class="row-btn" data-edit="${esc(c.client_id)}" title="Edit">
            <span class="material-symbols-rounded">edit</span>
          </button>
          <button class="row-btn danger" data-delete="${esc(c.client_id)}" title="Delete">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  empty.style.display = filtered.length ? "none" : "flex";
}

async function loadClients() {
  loader.style.display = "flex";
  try {
    const q = query(collectionRef, orderBy("client_name"));
    const snap = await getDocs(q);
    clients = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
    render();
  } catch (err) {
    console.error(err);
    try {
      const snap = await getDocs(collectionRef);
      clients = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
      render();
    } catch (e) {
      alert("Unable to load clients: " + e.message);
    }
  } finally {
    loader.style.display = "none";
  }
}

function openModal(data = null) {
  editingId = data?.client_id || null;
  $("clientModalTitle").textContent = data ? "Edit Client" : "Add Client";

  form.reset();

  if (data) {
    [
      "client_id","client_type","client_status","client_name","client_email",
      "client_phone","client_alt_phone","client_gstin","client_pan",
      "client_branch_id","client_address","client_city","client_district",
      "client_state","client_pin","client_notes"
    ].forEach(id => {
      if ($(id)) $(id).value = data[id] ?? "";
    });
  } else {
    $("client_type").value = "Business";
    $("client_status").value = "Active";
    $("client_state").value = "Kerala";
  }

  modal.style.display = "flex";
  setTimeout(() => $("client_name").focus(), 50);
}

function closeModal() {
  modal.style.display = "none";
  editingId = null;
  form.reset();
}

function formData() {
  const ids = [
    "client_id","client_type","client_status","client_name","client_email",
    "client_phone","client_alt_phone","client_gstin","client_pan",
    "client_branch_id","client_address","client_city","client_district",
    "client_state","client_pin","client_notes"
  ];

  const data = {};
  ids.forEach(id => data[id] = $(id)?.value.trim() || "");
  return data;
}

$("clientAddBtn").addEventListener("click", async () => {
  try {
    const id = await nextClientId();
    openModal({ client_id: id, client_type:"Business", client_status:"Active", client_state:"Kerala" });
    editingId = null;
  } catch (e) {
    alert("Could not create Client ID: " + e.message);
  }
});

$("clientCloseBtn").addEventListener("click", closeModal);
$("clientCancelBtn").addEventListener("click", closeModal);
$("clientRefreshBtn").addEventListener("click", loadClients);
search.addEventListener("input", render);
statusFilter.addEventListener("change", render);

tbody.addEventListener("click", async (e) => {
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-delete]");

  if (edit) {
    const id = edit.dataset.edit;
    const item = clients.find(c => c.client_id === id);
    if (item) openModal(item);
  }

  if (del) {
    const id = del.dataset.delete;
    if (!confirm(`Delete ${id}? This cannot be undone.`)) return;

    try {
      await deleteDoc(doc(db, "clients", id));
      await loadClients();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const save = $("clientSaveBtn");
  save.disabled = true;

  try {
    const data = formData();
    if (!data.client_name) return;

    const id = editingId || data.client_id || await nextClientId();
    data.client_id = id;

    const { email, name } = userInfo();
    const existing = clients.find(c => c.client_id === id);

    data.updatedAt = serverTimestamp();
    data.updatedBy = name;
    data.updatedByEmail = email;

    if (!existing) {
      data.createdAt = serverTimestamp();
      data.createdBy = name;
      data.createdByEmail = email;
    }

    await setDoc(doc(db, "clients", id), data, { merge: true });

    closeModal();
    await loadClients();
  } catch (err) {
    console.error(err);
    alert("Error saving client: " + err.message);
  } finally {
    save.disabled = false;
  }
});

modal.addEventListener("click", e => {
  if (e.target === modal) closeModal();
});

loadClients();
