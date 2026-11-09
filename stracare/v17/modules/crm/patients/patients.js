import { db } from "../../../js/firebase-config.js";
        import { collection, addDoc, query, where, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
        let patientSort = { key: 'time', direction: 'desc' };
        let patientDateFilter = { from: '', to: '' };
        let editingPatientId = null;

        let patientFormPreviousOverflow;
        window.togglePatientForm = function(open) {
            const modal = document.getElementById('patientFormModal');
            if (!modal) return;
            if (open && !modal.classList.contains('show')) {
                patientFormPreviousOverflow = document.body.style.overflow;
            }
            modal.classList.toggle('show', Boolean(open));
            modal.setAttribute('aria-hidden', String(!open));
            if (open) document.body.style.overflow = 'hidden';
            else if (patientFormPreviousOverflow !== undefined) {
                document.body.style.overflow = patientFormPreviousOverflow;
                patientFormPreviousOverflow = undefined;
            }
            if (open) {
                window.resetForm();
                window.setTimeout(() => document.getElementById('mobileInput')?.focus(), 80);
            }
        };

        document.getElementById('patientFormModal').addEventListener('click', event => {
            if (event.target.id === 'patientFormModal') window.togglePatientForm(false);
        });
        document.getElementById('patientViewModal').addEventListener('click', event => {
            if (event.target.id === 'patientViewModal') window.closePatientView();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && document.getElementById('patientFormModal').classList.contains('show')) {
                window.togglePatientForm(false);
            }
            if (event.key === 'Escape' && document.getElementById('patientViewModal').classList.contains('show')) {
                window.closePatientView();
            }
        });

        const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);

        window.closePatientView = function() {
            const modal = document.getElementById('patientViewModal');
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        };

        window.handlePatientRowAction = async function(button) {
            const row = button.closest('tr');
            const menu = button.closest('.patient-row-menu');
            const action = button.dataset.action;
            menu.open = false;

            if (action === 'view') {
                const fields = [
                    ['Patient ID', row.dataset.patientId],
                    ['Mobile', row.dataset.mobile],
                    ['Age', row.dataset.age ? `${row.dataset.age} years` : '—'],
                    ['Category', row.dataset.category],
                    ['Gender', row.dataset.gender],
                    ['Branch', row.dataset.branch],
                    ['Address', row.dataset.address],
                    ['Notes / Medical History', row.dataset.notes]
                ];
                document.getElementById('patientViewTitle').textContent = row.dataset.name || 'Patient details';
                document.getElementById('patientViewContent').innerHTML = fields.map(([label, value]) => `
                    <div class="patient-view-field">
                        <span>${escapeHtml(label)}</span>
                        <p>${escapeHtml(value || '—')}</p>
                    </div>
                `).join('');
                const modal = document.getElementById('patientViewModal');
                modal.classList.add('show');
                modal.setAttribute('aria-hidden', 'false');
                return;
            }

            if (action === 'edit') {
                window.togglePatientForm(true);
                editingPatientId = row.dataset.id;
                document.getElementById('patientFormTitle').textContent = 'Edit Patient';
                document.getElementById('patientIdInput').value = row.dataset.patientId || '';
                document.getElementById('mobileInput').value = row.dataset.mobile || '';
                document.getElementById('patientName').value = row.dataset.name || '';
                document.getElementById('patientAge').value = row.dataset.age || '';
                document.getElementById('patientCategory').value = row.dataset.category || 'Normal';
                document.getElementById('patientGender').value = row.dataset.gender || '';
                document.getElementById('patientBranch').value = row.dataset.branch || '';
                document.getElementById('patientAddress').value = row.dataset.address || '';
                document.getElementById('patientNotes').value = row.dataset.notes || '';
                document.getElementById('patientDetailsFieldset').disabled = false;
                document.getElementById('mobileValidationMsg').textContent = 'Editing registered patient.';
                document.getElementById('mobileValidationMsg').className = 'validation-msg success';
                document.getElementById('saveBtn').textContent = 'Update Patient';
                document.getElementById('mobileInput').focus();
                return;
            }

            if (action === 'delete' && window.confirm(`Delete ${row.dataset.name || 'this patient'}? This cannot be undone.`)) {
                button.disabled = true;
                try {
                    await deleteDoc(doc(db, 'patients', row.dataset.id));
                    row.remove();
                    window.filterAndSortTable();
                } catch (error) {
                    console.error('Firebase Delete Error:', error);
                    window.alert('Failed to delete patient. Please try again.');
                    button.disabled = false;
                }
            }
        };

        document.getElementById('patientTableBody').addEventListener('click', event => {
            const button = event.target.closest('.patient-row-menu [data-action]');
            if (button) window.handlePatientRowAction(button);
        });
        document.addEventListener('click', event => {
            document.querySelectorAll('#patient-module .patient-row-menu[open]').forEach(menu => {
                if (!menu.contains(event.target)) menu.open = false;
            });
        });

        // --- 0. LOAD BRANCHES (UPDATED FOR ROLE BASED ACCESS) ---
        window.loadBranchesForPatient = async function() {
            const select = document.getElementById('patientBranch');
            const filterSelect = document.getElementById('filterBranch');
            
            // SECURITY: If standard user, lock the dropdown to their branch only
            if (window.currentUser && window.currentUser.role !== 'admin') {
                const userBranch = window.currentUser.branch;
                select.innerHTML = `<option value="${userBranch}">${userBranch}</option>`;
                select.style.pointerEvents = 'none';
                select.style.background = 'var(--grey-med)';
                
                filterSelect.innerHTML = `<option value="${userBranch}">${userBranch}</option>`;
                filterSelect.style.pointerEvents = 'none';
                filterSelect.style.background = 'var(--grey-med)';
                return; // Stop executing
            }

            // Normal flow for Admin
            try {
                const snap = await getDocs(collection(db, "branches"));
                let branchList = [];
                
                snap.forEach(doc => {
                    const bName = doc.data().name;
                    if(bName) branchList.push(bName);
                });

                branchList.sort();
                select.innerHTML = '<option value="">Select Branch</option>';
                filterSelect.innerHTML = '<option value="">All Branches</option>';
                
                branchList.forEach(bName => {
                    select.appendChild(new Option(bName, bName));
                    filterSelect.appendChild(new Option(bName, bName));
                });
            } catch(e) {
                console.error("Error loading branches", e);
                select.innerHTML = '<option value="">Select Branch</option><option value="Mahe">Mahe</option>';
            }
        };

        window.loadBranchesForPatient();

        // --- 1. FILTER AND SORT FUNCTION ---
        window.filterAndSortTable = function() {
            const branchQuery = document.getElementById("filterBranch").value.toLowerCase();
            const categoryQuery = document.getElementById("filterCategory").value.toLowerCase();
            const recentLimit = Number(document.getElementById("filterRecentPatients").value) || 0;
            const textQuery = document.getElementById("patientSearchInput").value.toLowerCase();
            const dateFrom = patientDateFilter.from ? new Date(`${patientDateFilter.from}T00:00:00`) : null;
            const dateToExclusive = patientDateFilter.to ? new Date(`${patientDateFilter.to}T00:00:00`) : null;
            if (dateToExclusive) dateToExclusive.setDate(dateToExclusive.getDate() + 1);

            const tableBody = document.getElementById("patientTableBody");
            const rows = Array.from(tableBody.getElementsByTagName("tr"));
            
            // 1. First, apply filters (display: '' or display: 'none')
            rows.forEach(row => {
                if (row.cells.length === 1) return; // Skip "loading/empty" status rows
                
                const rowBranch = (row.getAttribute("data-branch") || "").toLowerCase();
                const rowCategory = (row.getAttribute("data-category") || "").toLowerCase();
                const rowSearch = (row.getAttribute("data-search") || "").toLowerCase();
                const rowTime = Number(row.getAttribute("data-time"));

                let show = true;
                if (branchQuery && rowBranch !== branchQuery) show = false;
                if (categoryQuery && rowCategory !== categoryQuery) show = false;
                if (textQuery && rowSearch.indexOf(textQuery) === -1) show = false;
                if (dateFrom && (!rowTime || rowTime < dateFrom.getTime())) show = false;
                if (dateToExclusive && (!rowTime || rowTime >= dateToExclusive.getTime())) show = false;

                row.style.display = show ? "" : "none";
            });

            if (recentLimit) {
                const recentRows = rows
                    .filter(row => row.cells.length > 1 && row.style.display !== 'none')
                    .sort((a, b) => Number(b.getAttribute('data-time')) - Number(a.getAttribute('data-time')))
                    .slice(0, recentLimit);
                const recentSet = new Set(recentRows);
                rows.forEach(row => {
                    if (row.cells.length > 1 && !recentSet.has(row)) row.style.display = 'none';
                });
            }

            // 2. Second, execute sorting logic
            rows.sort((a, b) => {
                const aIsStatus = a.cells.length === 1;
                const bIsStatus = b.cells.length === 1;
                if (aIsStatus && bIsStatus) return 0;
                if (aIsStatus) return 1;
                if (bIsStatus) return -1;
                const valueA = a.getAttribute(`data-${patientSort.key}`) || '';
                const valueB = b.getAttribute(`data-${patientSort.key}`) || '';
                const comparison = patientSort.key === 'time'
                    ? Number(valueA) - Number(valueB)
                    : valueA.localeCompare(valueB, undefined, { numeric: true, sensitivity: 'base' });
                return patientSort.direction === 'asc' ? comparison : -comparison;
            });

            // 3. Re-append sorted rows to the DOM
            rows.forEach(row => tableBody.appendChild(row));
            const visibleCount = rows.filter(row => row.cells.length > 1 && row.style.display !== 'none').length;
            const countLabel = document.getElementById('patientCount');
            if (countLabel) countLabel.textContent = `${visibleCount} ${visibleCount === 1 ? 'patient' : 'patients'}`;
        }

        window.applyPatientDateFilter = function() {
            const from = document.getElementById('patientDateFrom').value;
            const to = document.getElementById('patientDateTo').value;
            const error = document.getElementById('patientDateFilterError');
            error.textContent = '';
            if (from && to && from > to) {
                error.textContent = 'The start date must be on or before the end date.';
                return;
            }
            patientDateFilter = { from, to };
            window.filterAndSortTable();
            document.querySelector('#patient-module .patient-date-filter').open = false;
        };

        window.clearPatientDateFilter = function() {
            document.getElementById('patientDateFrom').value = '';
            document.getElementById('patientDateTo').value = '';
            document.getElementById('patientDateFilterError').textContent = '';
            patientDateFilter = { from: '', to: '' };
            window.filterAndSortTable();
            document.querySelector('#patient-module .patient-date-filter').open = false;
        };

        function updatePatientSortHeaders() {
            document.querySelectorAll('#patient-module .patient-sort-button').forEach(button => {
                const active = button.dataset.sortKey === patientSort.key;
                const icon = button.querySelector('.material-symbols-rounded');
                const header = button.closest('th');
                if (icon) icon.textContent = active
                    ? (patientSort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward')
                    : 'unfold_more';
                if (header) header.setAttribute('aria-sort', active
                    ? (patientSort.direction === 'asc' ? 'ascending' : 'descending')
                    : 'none');
            });
        }

        document.querySelectorAll('#patient-module .patient-sort-button').forEach(button => {
            button.addEventListener('click', () => {
                const key = button.dataset.sortKey;
                patientSort = {
                    key,
                    direction: patientSort.key === key && patientSort.direction === 'asc' ? 'desc' : 'asc'
                };
                updatePatientSortHeaders();
                window.filterAndSortTable();
            });
        });

        window.clearFilters = function() {
            if (window.currentUser && window.currentUser.role === 'admin') {
                document.getElementById("filterBranch").value = "";
            }
            document.getElementById("filterCategory").value = "";
            document.getElementById("filterRecentPatients").value = "10";
            document.getElementById("patientSearchInput").value = "";
            document.getElementById("patientDateFrom").value = "";
            document.getElementById("patientDateTo").value = "";
            document.getElementById("patientDateFilterError").textContent = "";
            patientDateFilter = { from: '', to: '' };
            document.querySelector('#patient-module .patient-date-filter').open = false;
            patientSort = { key: 'time', direction: 'desc' };
            updatePatientSortHeaders();
            window.filterAndSortTable();
        }

        // --- 2. EXPORT PDF FUNCTION ---
        window.exportPatientsPDF = function() {
            window.print();
        }

        // --- 3. LOAD PATIENTS (UPDATED FOR ROLE BASED ACCESS) ---
        window.loadPatients = async function() {
            const tableBody = document.getElementById('patientTableBody');
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Loading patients...</td></tr>';

            try {
                let q;
                // Admin gets all, Branch users get only their branch
                if (window.currentUser && window.currentUser.role !== 'admin') {
                    q = query(collection(db, "patients"), where("branch", "==", window.currentUser.branch));
                } else {
                    q = query(collection(db, "patients"));
                }

                const querySnapshot = await getDocs(q);
                tableBody.innerHTML = ''; 
                
                if (querySnapshot.empty) {
                    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">No patients found.</td></tr>';
                    return;
                }

                // Initial fetch array mapped so sorting can be done inside filterAndSortTable naturally.
                let pList = [];
                querySnapshot.forEach(doc => pList.push({ id: doc.id, data: doc.data() }));

                pList.forEach((item) => {
                    const data = item.data;
                    const catLower = (data.category || 'Normal').toLowerCase();
                    const createdAtTime = data.createdAt ? (data.createdAt.toMillis ? data.createdAt.toMillis() : new Date(data.createdAt).getTime()) : 0;
                    
                    let badgeClass = 'badge-normal';
                    if(catLower === 'regular') badgeClass = 'badge-regular';
                    if(catLower === 'both') badgeClass = 'badge-both';

                    const tr = document.createElement('tr');
                    tr.dataset.id = item.id;
                    tr.dataset.patientId = data.patientId || '';
                    tr.setAttribute("data-branch", data.branch || '');
                    tr.setAttribute("data-category", data.category || 'Normal');
                    tr.setAttribute("data-name", data.name || '');
                    tr.setAttribute("data-mobile", data.mobile || '');
                    tr.dataset.age = data.age || '';
                    tr.dataset.gender = data.gender || '';
                    tr.setAttribute("data-demographics", `${data.category || ''} ${data.age || ''} ${data.gender || ''} ${data.branch || ''}`);
                    tr.setAttribute("data-address", data.address || '');
                    tr.dataset.notes = data.notes || '';
                    tr.setAttribute("data-time", createdAtTime);
                    tr.setAttribute("data-search", `${data.name || ''} ${data.mobile || ''} ${data.patientId || ''}`.toLowerCase());

                    tr.innerHTML = `
                        <td data-label="Patient"><div class="patient-info"><span class="patient-avatar" aria-hidden="true">${escapeHtml((data.name || '?').trim().charAt(0).toUpperCase())}</span><strong>${escapeHtml(data.name || 'Unknown patient')}</strong><span class="pid">${escapeHtml(data.patientId || 'ID unavailable')}</span></div></td>
                        <td data-label="Mobile">
                            <span class="patient-mobile-number">${escapeHtml(data.mobile || '--')}</span>
                            <div class="mobile-cta-container no-print">
                                <a href="tel:${encodeURIComponent(data.mobile || '')}" class="cta-link" title="Call"><span class="material-symbols-rounded" style="color:var(--primary)">call</span></a>
                                <a href="https://wa.me/91${encodeURIComponent(String(data.mobile || '').replace(/\D/g, ''))}" class="cta-link" target="_blank" rel="noopener noreferrer" title="WhatsApp"><span class="material-symbols-rounded" style="color:#188038">chat</span></a>
                            </div>
                        </td>
                        <td data-label="Demographics">
                            <span class="badge ${badgeClass}">${escapeHtml(data.category || 'Normal')}</span>
                            <div class="patient-demographic">${escapeHtml(data.age || '--')} Yrs · ${escapeHtml(data.gender || '--')}</div>
                            <span class="patient-branch">${escapeHtml(data.branch || 'Unassigned')}</span>
                        </td>
                        <td data-label="Address"><span class="patient-address">${escapeHtml(data.address || '--')}</span></td>
                        <td class="no-print" data-label="Actions">
                            <div class="patient-row-actions">
                                <details class="patient-row-menu">
                                    <summary aria-label="Actions for ${escapeHtml(data.name || 'patient')}" title="More actions">
                                        <span class="material-symbols-rounded" aria-hidden="true">more_horiz</span>
                                    </summary>
                                    <div class="patient-row-menu-popup">
                                        <button type="button" data-action="view"><span class="material-symbols-rounded" aria-hidden="true">visibility</span>View</button>
                                        <button type="button" data-action="edit"><span class="material-symbols-rounded" aria-hidden="true">edit</span>Edit</button>
                                        <button type="button" data-action="delete" class="patient-delete-action"><span class="material-symbols-rounded" aria-hidden="true">delete</span>Delete</button>
                                    </div>
                                </details>
                            </div>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });

                // Apply default Sort (Newest) and current filter states on load
                window.filterAndSortTable();

            } catch (error) {
                console.error("Firebase Read Error:", error);
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--danger);">Error loading data.</td></tr>';
            }
        };

        window.refreshPatients = async function(button) {
            button.disabled = true;
            button.classList.add('is-refreshing');
            try {
                await window.loadPatients();
            } finally {
                button.disabled = false;
                button.classList.remove('is-refreshing');
            }
        };

        window.loadPatients();

        // --- 4. SMART VERIFY (CROSS-CHECKS DATABASE) ---
        window.verifyMobile = async function() {
            const mobileInput = document.getElementById('mobileInput').value;
            const validationMsg = document.getElementById('mobileValidationMsg');
            const fieldset = document.getElementById('patientDetailsFieldset');
            const verifyBtn = document.getElementById('verifyBtn');
            
            validationMsg.className = 'validation-msg';

            if (mobileInput.length !== 10) {
                validationMsg.innerText = "Please enter a valid 10-digit mobile number.";
                validationMsg.classList.add('error');
                fieldset.disabled = true;
                return;
            }

            verifyBtn.innerText = "Checking...";
            verifyBtn.disabled = true;

            try {
                // Check if they are already in the PATIENTS database
                const pSnap = await getDocs(query(collection(db, "patients"), where("mobile", "==", mobileInput)));

                if (!pSnap.empty) {
                    let existingName = pSnap.docs[0].data().name; 
                    validationMsg.innerHTML = `Patient already registered as <strong>${existingName}</strong>! Directory filtered below.`;
                    validationMsg.classList.add('error');
                    fieldset.disabled = true;
                    
                    // Auto-search the table to show them the duplicate
                    document.getElementById('patientSearchInput').value = mobileInput;
                    window.filterAndSortTable();
                } else {
                    // Brand new number
                    validationMsg.innerText = "Number is available. Please fill out the details.";
                    validationMsg.classList.add('success');
                    fieldset.disabled = false;
                    document.getElementById('patientName').focus();
                    
                    // Clear search if it was previously active
                    document.getElementById('patientSearchInput').value = "";
                    window.filterAndSortTable();
                }
            } catch (error) {
                console.error("Firebase Error:", error);
                validationMsg.innerText = "Error checking database.";
                validationMsg.classList.add('error');
            }

            verifyBtn.innerText = "Verify";
            verifyBtn.disabled = false;
        }

        // --- 5. SAVE PATIENT ---
        window.savePatient = async function() {
            const saveBtn = document.getElementById('saveBtn');
            const mobile = document.getElementById('mobileInput').value;
            const name = document.getElementById('patientName').value;
            const age = document.getElementById('patientAge').value;
            const category = document.getElementById('patientCategory').value;
            const gender = document.getElementById('patientGender').value;
            const branch = document.getElementById('patientBranch').value;
            const address = document.getElementById('patientAddress').value;
            const notes = document.getElementById('patientNotes').value;

            if (!name || !mobile || !category) {
                alert("Patient Name, Mobile Number, and Category are required!");
                return;
            }

            saveBtn.innerText = "Saving...";
            saveBtn.disabled = true;

            try {
                const patientData = {
                    mobile: mobile,
                    name: name,
                    age: age,
                    category: category,
                    gender: gender,
                    branch: branch,
                    address: address,
                    notes: notes
                };

                if (editingPatientId) {
                    await updateDoc(doc(db, 'patients', editingPatientId), patientData);
                    alert('Patient updated successfully.');
                } else {
                    const generatedId = "P" + Math.floor(Math.random() * 90000 + 10000);
                    await addDoc(collection(db, "patients"), {
                        ...patientData,
                        patientId: generatedId,
                        createdAt: new Date()
                    });
                    alert(`Success! Patient saved with ID: ${generatedId}`);
                }
                window.resetForm();
                window.togglePatientForm(false);
                window.loadPatients();

            } catch (error) {
                console.error(editingPatientId ? "Firebase Update Error:" : "Firebase Save Error:", error);
                alert(editingPatientId ? "Failed to update patient." : "Failed to save patient.");
            }

            saveBtn.innerText = "Save Patient";
            saveBtn.disabled = false;
        }

        // --- 6. RESET FORM ---
        window.resetForm = function() {
            editingPatientId = null;
            // Hard reset the form HTML logic
            document.getElementById('add-patient-form').reset();
            
            // UI specific reset overrides
            document.getElementById('mobileValidationMsg').className = 'validation-msg';
            document.getElementById('mobileValidationMsg').innerText = '';
            document.getElementById('patientDetailsFieldset').disabled = true;
            document.getElementById('patientCategory').value = 'Normal';
            document.getElementById('patientFormTitle').textContent = 'Register New Patient';
            document.getElementById('saveBtn').textContent = 'Save Patient';
            
            // Ensure branch stays locked to standard user branch if applicable
            if (window.currentUser && window.currentUser.role !== 'admin') {
                document.getElementById('patientBranch').value = window.currentUser.branch;
            } else {
                document.getElementById('patientBranch').value = "";
            }
        }
