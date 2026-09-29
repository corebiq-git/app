import { db, auth } from "../../js/firebase-config.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function init() {
  const form = document.getElementById("companyForm");
  const edit = document.getElementById("companyEdit");
  const cancel = document.getElementById("companyCancel");
  const actions = document.getElementById("companyActions");
  const meta = document.getElementById("companyMeta");
  const fields = ["cmp_name","cmp_legal_name","cmp_biz_type","cmp_email","cmp_phone","cmp_website","cmp_pan","cmp_gstin","cmp_cin","cmp_address","cmp_city","cmp_state","cmp_pin","cmp_country"];
  const ref = doc(db, "companies", "master");
  let original = {};

  const setEdit = enabled => {
    fields.forEach(id => document.getElementById(id).disabled = !enabled);
    edit.style.display = enabled ? "none" : "inline-flex";
    actions.style.display = enabled ? "flex" : "none";
  };

  const populate = data => {
    original = data || {};
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el && data[id] !== undefined) el.value = data[id];
    });
    meta.textContent = `Created: ${data.createdByEmail || "—"}  •  Updated: ${data.updatedByEmail || "—"}`;
  };

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      populate(snap.data());
      setEdit(false);
    } else {
      setEdit(true);
      meta.textContent = "No company profile yet. Enter details and save.";
    }
  } catch(e) {
    meta.textContent = "Firebase error: " + e.message;
  }

  edit.onclick = () => setEdit(true);
  cancel.onclick = () => { populate(original); setEdit(false); };

  form.onsubmit = async e => {
    e.preventDefault();
    const user = auth.currentUser;
    const payload = {};
    fields.forEach(id => payload[id] = document.getElementById(id).value.trim());
    payload.updatedAt = serverTimestamp();
    payload.updatedByEmail = user?.email || "";
    payload.updatedBy = user?.displayName || user?.email?.split("@")[0] || "";
    if (!Object.keys(original).length) {
      payload.createdAt = serverTimestamp();
      payload.createdByEmail = user?.email || "";
      payload.createdBy = user?.displayName || user?.email?.split("@")[0] || "";
    }
    const save = document.getElementById("companySave");
    save.disabled = true;
    save.textContent = "Saving...";
    try {
      await setDoc(ref, payload, { merge: true });
      const fresh = await getDoc(ref);
      populate(fresh.data());
      setEdit(false);
    } catch(e) {
      alert("Save failed: " + e.message);
    } finally {
      save.disabled = false;
      save.textContent = "Save Company";
    }
  };
}
