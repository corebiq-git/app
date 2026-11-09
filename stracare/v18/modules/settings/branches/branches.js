import { db } from "../../../js/firebase-config.js";
        import { collection, getDocs, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

        window.branchDataCache = {};

        // --- 0. CHECK SECURITY (RBAC) ---
        if (window.currentUser && window.currentUser.role !== 'admin') {
            const editBtn = document.getElementById('editBranchBtnForm');
            if (editBtn) editBtn.style.display = 'none';
        }

        // --- 1. UI TOGGLES ---
        window.toggleEditMode = function(forceEnable) {
            if (forceEnable && window.currentUser && window.currentUser.role !== 'admin') {
                return;
            }

            const inputs = document.querySelectorAll('#branch-details-form .readonly-input');
            const saveActions = document.getElementById('save-actions');
            
            let isEditing = forceEnable; 

            if(forceEnable === undefined || forceEnable === null) {
                isEditing = inputs.length > 0 && inputs[0].hasAttribute('readonly'); 
            }
            
            inputs.forEach(input => {
                if(isEditing) {
                    input.classList.add('editable');
                    input.removeAttribute('readonly');
                } else {
                    input.classList.remove('editable');
                    input.setAttribute('readonly', true);
                }
            });

            saveActions.style.display = isEditing ? 'flex' : 'none';
        }

        // --- 2. LIVE SEARCH ---
        window.searchBranches = function() {
            const input = document.getElementById("branchSearchInput").value.toLowerCase();
            const trs = document.getElementById("branchTableBody").getElementsByTagName("tr");
            
            for (let i = 0; i < trs.length; i++) {
                if (trs[i].cells.length === 1) continue; 
                const text = trs[i].innerText.toLowerCase();
                trs[i].style.display = text.indexOf(input) > -1 ? "" : "none";
            }
        }

        // --- 3. LOAD BRANCHES ---
        window.loadBranches = async function() {
            const tableBody = document.getElementById('branchTableBody');
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Loading branches...</td></tr>';

            try {
                const querySnapshot = await getDocs(collection(db, "branches"));
                
                let branchesList = [];
                window.branchDataCache = {};
                
                if (querySnapshot.empty) {
                    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">No branches registered yet.</td></tr>';
                    return;
                }

                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    data.docId = docSnap.id;
                    window.branchDataCache[docSnap.id] = data;
                    branchesList.push(data);
                });

                branchesList.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

                tableBody.innerHTML = ''; 

                const isAdmin = !(window.currentUser && window.currentUser.role !== 'admin');

                branchesList.forEach((data) => {
                    let mapHtml = data.mapLink ? `<a href="${data.mapLink}" target="_blank" rel="noopener noreferrer" class="branch-map-link"><span class="material-symbols-rounded">location_on</span>View Map</a>` : `<span style="color: #999; font-size: 12px;">N/A</span>`;

                    let actionHtml = '';
                    if (isAdmin) {
                        actionHtml = `<button type="button" class="branch-row-action" title="Edit Branch" aria-label="Edit ${data.name || 'branch'}" onclick="window.editBranch('${data.docId}')"><span class="material-symbols-rounded">edit</span></button>`;
                    } else {
                        actionHtml = `<span class="branch-row-action" title="Locked" aria-label="Branch editing locked" style="color:var(--grey-med);cursor:default"><span class="material-symbols-rounded">lock</span></span>`;
                    }

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td data-label="Branch"><div class="branch-info"><span class="bid">${data.branchId || 'B-000'}</span><strong>${data.name || 'Unknown'}</strong></div></td>
                        <td data-label="Contact">${data.contact || '--'}</td>
                        <td data-label="Email">${data.email || '--'}</td>
                        <td data-label="Maps">${mapHtml}</td>
                        <td data-label="Actions">${actionHtml}</td>
                    `;
                    tableBody.appendChild(tr);
                });
            } catch (error) {
                console.error("Firebase Read Error:", error);
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--danger);">Error loading branches.</td></tr>';
            }
        }

        window.loadBranches();

        // --- 4. EDIT BRANCH ---
        window.editBranch = function(docId) {
            if (window.currentUser && window.currentUser.role !== 'admin') return;

            const data = window.branchDataCache[docId];
            if(!data) return;

            document.getElementById('branchDocId').value = docId;
            document.getElementById('branchIdDisplay').value = data.branchId || '';
            document.getElementById('branchName').value = data.name || '';
            document.getElementById('branchAddress').value = data.address || '';
            document.getElementById('branchContact').value = data.contact || '';
            document.getElementById('branchEmail').value = data.email || '';
            document.getElementById('branchMap').value = data.mapLink || '';

            window.toggleEditMode(true);
            
            const mainContent = document.getElementById('main-content');
            if(mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // --- 5. SAVE UPDATED BRANCH ---
        window.saveBranch = async function() {
            if (window.currentUser && window.currentUser.role !== 'admin') return;

            const saveBtn = document.getElementById('saveBranchBtn');
            const docId = document.getElementById('branchDocId').value;
            
            const name = document.getElementById('branchName').value;
            const address = document.getElementById('branchAddress').value;
            const contact = document.getElementById('branchContact').value;
            const email = document.getElementById('branchEmail').value;
            const mapLink = document.getElementById('branchMap').value;

            if(!name || !address) {
                return alert("Branch Name and Address are required!");
            }

            if (!docId) {
                return alert("Please select a branch from the list to edit.");
            }

            saveBtn.innerText = "Saving...";
            saveBtn.disabled = true;

            const payload = {
                id: docId,
                branchId: docId,
                name: name,
                address: address,
                contact: contact,
                email: email,
                mapLink: mapLink,
                updatedAt: new Date()
            };

            try {
                await updateDoc(doc(db, "branches", docId), payload);
                alert("Branch updated successfully!");

                window.toggleEditMode(false);
                document.getElementById('branch-details-form').reset();
                window.loadBranches();

            } catch (error) {
                console.error("Firebase Save Error:", error);
                alert("Failed to update branch. Check database rules.");
            }

            saveBtn.innerText = "Save Updates";
            saveBtn.disabled = false;
        }
