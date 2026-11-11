// 1. Import from your central config instead of re-initializing Firebase
        import { auth, db } from '../../../js/firebase-config.js'; 
        import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
        import { reserveNextDocumentIds } from "../../../js/document-ids.js";
        import { collection, getDocs, updateDoc, deleteDoc, doc, query, where, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

        window.therapistDataCache = {};

        // --- AUTHENTICATION GATEKEEPER ---
        onAuthStateChanged(auth, (user) => {
            if (!user) {
                // User is NOT logged in. Destroy the module content and show a warning.
                document.getElementById('therapist-module').innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; background: #FEF2F2; border-radius: 16px; border: 1px solid #FCA5A5; margin-top: 20px;">
                        <span class="material-symbols-rounded" style="font-size: 48px; color: #EF4444; margin-bottom: 12px;">gpp_bad</span>
                        <h2 style="color: #991B1B; margin-bottom: 8px;">Access Denied</h2>
                        <p style="color: #7F1D1D; font-size: 14px;">You must be logged into the administrative dashboard to view this module.</p>
                    </div>
                `;
                return; 
            }

            // User IS logged in. Proceed with bootstrapping the module.
            window.loadBranchesForDropdown();
            window.loadTherapists();
        });

        // --- 1. SAFE BRANCH LOADER (WITH RBAC) ---
        window.loadBranchesForDropdown = async function() {
            const select = document.getElementById('therapistBranch');
            
            // SECURITY: If standard user, lock the dropdown to their branch only
            if (window.currentUser && window.currentUser.role !== 'admin') {
                const userBranch = window.currentUser.branch;
                select.innerHTML = `<option value="${userBranch}">${userBranch}</option>`;
                select.style.pointerEvents = 'none';
                select.style.background = 'var(--grey-med)';
                return; 
            }

            try {
                const snap = await getDocs(collection(db, "branches"));
                let branchList = [];
                
                snap.forEach(doc => {
                    const bName = doc.data().name;
                    if(bName) branchList.push(bName);
                });

                branchList.sort();

                select.innerHTML = '<option value="">Select Branch</option>';
                branchList.forEach(bName => {
                    const option = document.createElement('option');
                    option.value = bName;
                    option.text = bName;
                    select.appendChild(option);
                });
            } catch(e) {
                console.error("Error loading branches", e);
                select.innerHTML = '<option value="">Select Branch</option>';
            }
        };

        // --- 2. LOAD THERAPISTS (WITH RBAC) ---
        window.loadTherapists = async function() {
            const tableBody = document.getElementById('therapistTableBody');
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Loading therapists...</td></tr>';

            try {
                let q;
                // Admin gets all, Branch users get only their branch
                if (window.currentUser && window.currentUser.role !== 'admin') {
                    q = query(collection(db, "therapists"), where("branch", "==", window.currentUser.branch));
                } else {
                    q = collection(db, "therapists");
                }

                const querySnapshot = await getDocs(q);
                
                tableBody.innerHTML = ''; 
                window.therapistDataCache = {};
                
                if (querySnapshot.empty) {
                    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">No therapists added yet.</td></tr>';
                    return;
                }

                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    const docId = docSnap.id;
                    window.therapistDataCache[docId] = data;

                    // Fallbacks to prevent crashes
                    const safeName = data.name || 'Unknown';
                    const safeId = data.therapistId || 'THE-0000';
                    const safeSpec = data.specialisation || 'N/A';
                    const safeBranch = data.branch || 'N/A';
                    const safeContact = data.contact || data.mobile || 'N/A';

                    // HIDE DELETE ICON IF NOT ADMIN
                    let deleteIconHtml = '';
                    if (window.currentUser && window.currentUser.role === 'admin') {
                        deleteIconHtml = `<span class="material-symbols-rounded icon-action delete" title="Remove" style="margin-left: 8px;" onclick="window.deleteTherapist('${docId}')">delete</span>`;
                    }

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td data-label="Name">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="t-id">${safeId}</span>
                                <strong>${safeName}</strong>
                            </div>
                        </td>
                        <td data-label="Specialisation">${safeSpec}</td>
                        <td data-label="Branch">${safeBranch}</td>
                        <td data-label="Contact">+91 ${safeContact}</td>
                        <td data-label="Actions" style="text-align: right;">
                            <span class="material-symbols-rounded icon-action" title="Edit" onclick="window.editTherapist('${docId}')">edit</span>
                            ${deleteIconHtml}
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });
            } catch (error) {
                console.error("Firebase Read Error:", error);
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--danger);">Error loading data. Check Firestore rules.</td></tr>';
            }
        }

        // --- 3. LIVE SEARCH ---
        window.searchTherapists = function() {
            const input = document.getElementById("therapistSearchInput").value.toLowerCase();
            const trs = document.getElementById("therapistTableBody").getElementsByTagName("tr");
            
            for (let i = 0; i < trs.length; i++) {
                if (trs[i].cells.length === 1) continue; 
                const text = trs[i].innerText.toLowerCase();
                trs[i].style.display = text.indexOf(input) > -1 ? "" : "none";
            }
        }

        // --- 4. EDIT & DELETE ---
        window.editTherapist = function(docId) {
            const data = window.therapistDataCache[docId];
            if(!data) return;

            document.getElementById('therapistDocId').value = docId;
            document.getElementById('therapistIdDisplay').value = data.therapistId || '';
            document.getElementById('therapistName').value = data.name || '';
            document.getElementById('therapistSpec').value = data.specialisation || '';
            document.getElementById('therapistBranch').value = data.branch || '';
            document.getElementById('therapistContact').value = data.contact || data.mobile || '';

            document.getElementById('saveTherapistBtn').innerHTML = '<span class="material-symbols-rounded">save</span> Update';
            
            const mainContent = document.getElementById('main-content');
            if(mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        window.deleteTherapist = async function(docId) {
            if(confirm("Are you sure you want to remove this therapist?")) {
                try {
                    await deleteDoc(doc(db, "therapists", docId));
                    window.loadTherapists();
                } catch(e) {
                    alert("Error deleting record.");
                }
            }
        }

        window.clearTherapistForm = function() {
            document.getElementById('therapist-form').reset();
            document.getElementById('therapistDocId').value = '';
            document.getElementById('therapistIdDisplay').value = 'Auto-Generated';
            document.getElementById('saveTherapistBtn').innerHTML = '<span class="material-symbols-rounded">person_add</span> Save';
            
            // Ensure branch stays locked if user is not admin
            if (window.currentUser && window.currentUser.role !== 'admin') {
                document.getElementById('therapistBranch').value = window.currentUser.branch;
            }
        }

        // --- 5. SAVE / UPDATE ---
        window.saveTherapist = async function() {
            const saveBtn = document.getElementById('saveTherapistBtn');
            const docId = document.getElementById('therapistDocId').value;
            
            const name = document.getElementById('therapistName').value;
            const spec = document.getElementById('therapistSpec').value;
            const branch = document.getElementById('therapistBranch').value;
            const contact = document.getElementById('therapistContact').value;

            if(!name || !spec || !branch || !contact) {
                return alert("Please fill all required fields!");
            }

            saveBtn.innerHTML = 'Saving...';
            saveBtn.disabled = true;

            const payload = {
                ...(docId ? { id: docId, therapistId: docId } : {}),
                name: name,
                specialisation: spec,
                branch: branch,
                contact: contact,
                mobile: contact,
                updatedAt: new Date()
            };

            try {
                if(docId) {
                    await updateDoc(doc(db, "therapists", docId), payload);
                    alert("Therapist updated successfully!");
                } else {
                    const [generatedId] = await reserveNextDocumentIds(
                        db, 'therapists', 'THE', 1, window.currentUser?.role === 'admin'
                    );
                    payload.id = generatedId;
                    payload.therapistId = generatedId;
                    payload.createdAt = new Date();
                    await setDoc(doc(db, 'therapists', generatedId), payload);
                    alert("New Therapist added successfully!");
                }

                window.clearTherapistForm();
                window.loadTherapists(); 

            } catch (error) {
                console.error("Firebase Save Error:", error);
                alert("Failed to save. Check database rules.");
            }

            saveBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Save';
            saveBtn.disabled = false;
        }
