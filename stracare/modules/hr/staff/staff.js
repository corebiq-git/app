import { db } from "../../../js/firebase-config.js";
        import { reserveNextDocumentIds } from "../../../js/document-ids.js";
        import { collection, getDocs, updateDoc, deleteDoc, doc, query, where, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
        
        window.staffDataCache = {};

        // --- 1. SAFE BRANCH LOADER (WITH RBAC) ---
        window.loadBranchesForStaff = async function() {
            const select = document.getElementById('staffBranch');
            
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
                select.innerHTML = '<option value="">Select Branch</option><option value="Mahe">Mahe</option><option value="Chokli">Chokli</option><option value="Panoor">Panoor</option><option value="Koothuparamba">Koothuparamba</option><option value="Nadapuram">Nadapuram</option><option value="Home Care">Home Care</option>';
            }
        };

        window.loadBranchesForStaff();

        // --- 2. LOAD STAFF (WITH RBAC) ---
        window.loadStaff = async function() {
            const tableBody = document.getElementById('staffTableBody');
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Loading staff...</td></tr>';

            try {
                let q;
                // Admin gets all, Branch users get only their branch
                if (window.currentUser && window.currentUser.role !== 'admin') {
                    q = query(collection(db, "staff"), where("branch", "==", window.currentUser.branch));
                } else {
                    q = collection(db, "staff");
                }

                const querySnapshot = await getDocs(q);
                
                tableBody.innerHTML = ''; 
                window.staffDataCache = {};
                
                if (querySnapshot.empty) {
                    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">No staff added yet.</td></tr>';
                    return;
                }

                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    const docId = docSnap.id;
                    window.staffDataCache[docId] = data;

                    // Fallbacks to prevent crashes
                    const safeName = data.name || 'Unknown';
                    const safeId = data.empId || 'STA-0000';
                    const safeRole = data.role || 'N/A';
                    const safeBranch = data.branch || 'N/A';
                    const safeContact = data.mobile || data.contact || 'N/A';

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td data-label="Name">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="t-id">${safeId}</span>
                                <strong>${safeName}</strong>
                            </div>
                        </td>
                        <td data-label="Role">${safeRole}</td>
                        <td data-label="Branch">${safeBranch}</td>
                        <td data-label="Contact">+91 ${safeContact}</td>
                        <td data-label="Actions" style="text-align: right;">
                            <span class="material-symbols-rounded icon-action" title="Edit" onclick="window.editStaff('${docId}')">edit</span>
                            <span class="material-symbols-rounded icon-action delete" title="Remove" style="margin-left: 8px;" onclick="window.deleteStaff('${docId}')">delete</span>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });
            } catch (error) {
                console.error("Firebase Read Error:", error);
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--danger);">Error loading data. Check Firestore rules.</td></tr>';
            }
        }

        window.loadStaff();

        // --- 3. LIVE SEARCH ---
        window.searchStaff = function() {
            const input = document.getElementById("staffSearchInput").value.toLowerCase();
            const trs = document.getElementById("staffTableBody").getElementsByTagName("tr");
            
            for (let i = 0; i < trs.length; i++) {
                if (trs[i].cells.length === 1) continue; 
                const text = trs[i].innerText.toLowerCase();
                trs[i].style.display = text.indexOf(input) > -1 ? "" : "none";
            }
        }

        // --- 4. EDIT & DELETE ---
        window.editStaff = function(docId) {
            const data = window.staffDataCache[docId];
            if(!data) return;

            document.getElementById('staffDocId').value = docId;
            document.getElementById('staffIdDisplay').value = data.empId || '';
            document.getElementById('staffName').value = data.name || '';
            document.getElementById('staffRole').value = data.role || '';
            document.getElementById('staffBranch').value = data.branch || '';
            document.getElementById('staffContact').value = data.mobile || data.contact || '';

            document.getElementById('saveStaffBtn').innerHTML = '<span class="material-symbols-rounded">save</span> Update';
            
            const mainContent = document.getElementById('main-content');
            if(mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        window.deleteStaff = async function(docId) {
            if(confirm("Are you sure you want to remove this staff member?")) {
                try {
                    await deleteDoc(doc(db, "staff", docId));
                    window.loadStaff();
                } catch(e) {
                    alert("Error deleting record.");
                }
            }
        }

        window.clearStaffForm = function() {
            document.getElementById('staff-form').reset();
            document.getElementById('staffDocId').value = '';
            document.getElementById('staffIdDisplay').value = 'Auto-Generated';
            document.getElementById('saveStaffBtn').innerHTML = '<span class="material-symbols-rounded">person_add</span> Save';
            
            // Re-lock branch for standard users
            if (window.currentUser && window.currentUser.role !== 'admin') {
                document.getElementById('staffBranch').value = window.currentUser.branch;
            }
        }

        // --- 5. SAVE / UPDATE ---
        window.saveStaff = async function() {
            const saveBtn = document.getElementById('saveStaffBtn');
            const docId = document.getElementById('staffDocId').value;
            
            const name = document.getElementById('staffName').value;
            const role = document.getElementById('staffRole').value;
            const branch = document.getElementById('staffBranch').value;
            const contact = document.getElementById('staffContact').value;

            if(!name || !role || !branch || !contact) {
                return alert("Please fill all required fields!");
            }

            saveBtn.innerHTML = 'Saving...';
            saveBtn.disabled = true;

            const payload = {
                ...(docId ? { id: docId, empId: docId } : {}),
                name: name,
                role: role,
                branch: branch,
                mobile: contact,
                contact: contact,
                updatedAt: new Date()
            };

            try {
                if(docId) {
                    await updateDoc(doc(db, "staff", docId), payload);
                    alert("Staff updated successfully!");
                } else {
                    const [generatedId] = await reserveNextDocumentIds(
                        db, 'staff', 'STA', 1, window.currentUser?.role === 'admin'
                    );
                    payload.id = generatedId;
                    payload.empId = generatedId;
                    payload.createdAt = new Date();
                    await setDoc(doc(db, 'staff', generatedId), payload);
                    alert("New Staff added successfully!");
                }

                window.clearStaffForm();
                window.loadStaff(); 

            } catch (error) {
                console.error("Firebase Save Error:", error);
                alert("Failed to save. Check database rules.");
            }

            saveBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Save';
            saveBtn.disabled = false;
        }
