import { db } from '../../../js/firebase-config.js'; 
        import { collection, addDoc, query, where, getDocs, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

        window.ledgerDataCache = {};
        window.nextLedgerCount = 1;
        const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
        const formatCurrency = value => `₹${(Number(value) || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;

        // 1. Load Categories
        window.loadCategories = async function() {
            const select = document.getElementById('lCategory');
            try {
                const snap = await getDocs(collection(db, "ledger_categories"));

                const defaults = ['Indirect Expense', 'Direct Expense', 'Purchase', 'Sales', 'Fixed Assets', 'Sundry Creditors', 'Sundry Debtors', 'Cash-in-Hand', 'Bank Accounts'];
                const existingNames = new Set();
                const catList = [];
                snap.forEach(category => {
                    const name = String(category.data().name || '').trim();
                    if(name) {
                        existingNames.add(name.toLowerCase());
                        catList.push(name);
                    }
                });
                for(const category of defaults) {
                    if(!existingNames.has(category.toLowerCase())) {
                        await addDoc(collection(db, "ledger_categories"), { name: category });
                        existingNames.add(category.toLowerCase());
                        catList.push(category);
                    }
                }

                catList.sort((a, b) => a.localeCompare(b));

                select.innerHTML = '<option value="">Select a Category</option>';
                catList.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c; opt.text = c; select.appendChild(opt);
                });
            } catch(e) { console.error("Error loading categories", e); }
        };

        window.loadLinkedLedgers = async function() {
            const tbody = document.getElementById('linkedLedgerTableBody');
            const accountRows = [
                { name: 'Cash', category: 'Cash-in-Hand', target: 'view-cash-ledger', details: 'Live account from the existing Cash Ledger.' },
                { name: 'Bank', category: 'Bank Accounts', target: 'view-bank-ledger', details: 'Live account from the existing Bank Ledger.' }
            ];
            const renderAccountRow = ({ name, category, target, details, balance }) => `
                <tr class="ledger-row" data-search="${escapeHtml(`${name} ${category} ${details}`.toLowerCase())}">
                    <td><strong>COREBIQ</strong></td>
                    <td><strong style="color:var(--primary)">${escapeHtml(name)}</strong></td>
                    <td><span class="badge badge-cat">${escapeHtml(category)}</span></td>
                    <td><span class="badge badge-dr">${balance === undefined ? 'Open ledger for balance' : formatCurrency(balance)}</span></td>
                    <td><span style="font-size:12px;color:var(--secondary)">${escapeHtml(details)}</span></td>
                    <td style="text-align:right"><button type="button" class="btn-outline" onclick="window.switchView('${target}',null)">Open ledger</button></td>
                </tr>`;

            tbody.innerHTML = accountRows.map(renderAccountRow).join('');
            try {
                const user = window.currentUser;
                if(!user) throw new Error('User profile is not ready.');
                let patientsQuery = collection(db, 'patients');
                let transactionsQuery = collection(db, 'transactions');
                if(user.role !== 'admin') {
                    if(!user.branch) throw new Error('Your account does not have an assigned branch.');
                    patientsQuery = query(patientsQuery, where('branch', '==', user.branch));
                    transactionsQuery = query(transactionsQuery, where('branch', '==', user.branch));
                }
                const [patientSnapshot, transactionSnapshot] = await Promise.all([
                    getDocs(patientsQuery),
                    getDocs(transactionsQuery)
                ]);
                const totalsByMobile = new Map();
                let cashBalance = 0;
                let bankBalance = 0;
                transactionSnapshot.forEach(transactionDoc => {
                    const transaction = transactionDoc.data();
                    const mode = String(transaction.mode || '').trim().toLowerCase();
                    const isBank = mode !== '' && mode !== 'cash' && mode !== 'credit';
                    const movement = (Number(transaction.cashIn) || 0) - (Number(transaction.cashOut) || 0);
                    if(mode === 'cash') cashBalance += movement;
                    else if(isBank) bankBalance += movement;

                    const type = String(transaction.type || '').trim().toLowerCase();
                    const mobile = String(transaction.mobile || '').replace(/\D/g, '');
                    if(!mobile || !['sales', 'receipt'].includes(type)) return;
                    const totals = totalsByMobile.get(mobile) || { sales: 0, receipts: 0 };
                    if(type === 'sales') totals.sales += Number(transaction.cashOut) || 0;
                    else totals.receipts += Number(transaction.cashIn) || 0;
                    totalsByMobile.set(mobile, totals);
                });

                tbody.innerHTML = accountRows.map(account => renderAccountRow({
                    ...account,
                    balance: account.target === 'view-cash-ledger' ? cashBalance : bankBalance
                })).join('');
                const patientRows = patientSnapshot.docs.map(patientDoc => {
                    const patient = patientDoc.data();
                    const mobile = String(patient.mobile || '').replace(/\D/g, '');
                    const totals = totalsByMobile.get(mobile) || { sales: 0, receipts: 0 };
                    const due = totals.sales - totals.receipts;
                    const balanceType = due < 0 ? 'Cr' : 'Dr';
                    const info = `Sales ${formatCurrency(totals.sales)} · Receipts ${formatCurrency(totals.receipts)} · ${mobile || 'No mobile'}`;
                    const search = `${patient.name || ''} ${mobile} Sundry Debtors sales patients`.toLowerCase();
                    return `
                        <tr class="ledger-row" data-search="${escapeHtml(search)}">
                            <td><strong>${escapeHtml(patient.patientId || 'PATIENT')}</strong></td>
                            <td><strong style="color:var(--primary)">${escapeHtml(patient.name || 'Unnamed patient')}</strong></td>
                            <td><span class="badge badge-cat">Sundry Debtors</span></td>
                            <td><span class="badge ${balanceType === 'Dr' ? 'badge-dr' : 'badge-cr'}">${balanceType} ${formatCurrency(Math.abs(due))}</span></td>
                            <td><span style="font-size:12px;color:var(--secondary)">${escapeHtml(info)}</span></td>
                            <td style="text-align:right"><button type="button" class="btn-outline" onclick="window.switchView('view-patients',null)">Patient</button></td>
                        </tr>`;
                });
                const salesTotal = [...totalsByMobile.values()].reduce((sum, totals) => sum + totals.sales, 0);
                const receiptTotal = [...totalsByMobile.values()].reduce((sum, totals) => sum + totals.receipts, 0);
                const dueTotal = salesTotal - receiptTotal;
                const salesInfo = `Sales ${formatCurrency(salesTotal)} · Receipts ${formatCurrency(receiptTotal)} · Patient receivables`;
                const salesRow = `
                    <tr class="ledger-row" data-search="${escapeHtml(`sales sundry debtors patients ${salesInfo}`.toLowerCase())}">
                        <td><strong>COREBIQ</strong></td>
                        <td><strong style="color:var(--primary)">Patient Sales</strong></td>
                        <td><span class="badge badge-cat">Sundry Debtors</span></td>
                        <td><span class="badge ${dueTotal < 0 ? 'badge-cr' : 'badge-dr'}">${dueTotal < 0 ? 'Cr' : 'Dr'} ${formatCurrency(Math.abs(dueTotal))}</span></td>
                        <td><span style="font-size:12px;color:var(--secondary)">${escapeHtml(salesInfo)}</span></td>
                        <td style="text-align:right"><button type="button" class="btn-outline" onclick="window.switchView('view-transaction',null)">Sales & receipts</button></td>
                    </tr>`;
                tbody.insertAdjacentHTML('beforeend', salesRow + patientRows.join(''));
                if(!patientRows.length) {
                    tbody.insertAdjacentHTML('beforeend', '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text-muted);">No patient accounts found under Sundry Debtors.</td></tr>');
                }
            } catch(error) {
                console.error('Error loading linked ledger accounts', error);
                tbody.insertAdjacentHTML('beforeend', `<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--danger);">Unable to load patient balances: ${escapeHtml(error.message || 'Check access and try again.')}</td></tr>`);
            }
        };

        // 2. Save New Category
        window.saveCategory = async function() {
            const input = document.getElementById('newCategoryName');
            const name = input.value.trim();
            const btn = document.getElementById('saveCatBtn');

            if(!name) return;
            btn.disabled = true; btn.innerText = "Adding...";

            try {
                await addDoc(collection(db, "ledger_categories"), { name: name });
                input.value = '';
                await window.loadCategories();
                alert(`Category '${name}' added successfully!`);
            } catch(e) { alert("Failed to add category."); }
            
            btn.disabled = false; 
            btn.innerHTML = `<span class="material-symbols-rounded" style="font-size: 18px;">add</span> Add Category`;
        };

        // 3. Load Ledgers & Auto-generate Ledger No.
        window.loadLedgers = async function() {
            const tbody = document.getElementById('ledgerTableBody');
            try {
                const snap = await getDocs(collection(db, "ledgers"));
                tbody.innerHTML = '';
                window.ledgerDataCache = {};
                
                // Set the next auto-ID based on total records
                window.nextLedgerCount = snap.size + 1;
                document.getElementById('lNo').value = `LD/COREBIQ/${String(window.nextLedgerCount).padStart(3, '0')}`;

                if(snap.empty) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">No ledgers found. Create one above.</td></tr>';
                    return;
                }

                let arr = [];
                snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
                // Sort by Ledger No
                arr.sort((a, b) => (a.ledgerNo || '').localeCompare(b.ledgerNo || ''));

                arr.forEach(data => {
                    window.ledgerDataCache[data.id] = data;
                    
                    const badgeClass = data.opType === 'Dr' ? 'badge-dr' : 'badge-cr';
                    const balHtml = data.opAmt > 0 ? `<span class="badge ${badgeClass}">${data.opType} ${data.opAmt.toFixed(2)}</span>` : '<span style="color: var(--text-muted); font-size: 12px;">Nil</span>';

                    const tr = document.createElement('tr');
                    tr.className = "ledger-row";
                    tr.setAttribute("data-search", `${data.ledgerNo} ${data.name} ${data.category} ${data.otherInfo}`.toLowerCase());

                    tr.innerHTML = `
                        <td><strong>${data.ledgerNo}</strong></td>
                        <td><strong style="color: var(--primary);">${data.name}</strong></td>
                        <td><span class="badge badge-cat">${data.category}</span></td>
                        <td>${balHtml}</td>
                        <td><span style="font-size: 12px; color: var(--secondary); display: block; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${data.otherInfo || ''}">${data.otherInfo || '--'}</span></td>
                        <td style="text-align: right;">
                            <div style="display:flex; gap: 10px; align-items:center; justify-content: flex-end;">
                                <span class="material-symbols-rounded" style="color: var(--secondary); cursor: pointer; font-size: 18px;" onclick="window.editLedger('${data.id}')" title="Edit">edit</span>
                                <span class="material-symbols-rounded" style="color: var(--danger); cursor: pointer; font-size: 18px;" onclick="window.deleteLedger('${data.id}')" title="Delete">delete</span>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

            } catch (error) { console.error("Error loading ledgers", error); }
        };

        // 4. Save Ledger
        window.saveLedger = async function() {
            const docId = document.getElementById('docId').value;
            const ledgerNo = document.getElementById('lNo').value;
            const name = document.getElementById('lName').value.trim();
            const category = document.getElementById('lCategory').value;
            const opType = document.getElementById('lOpType').value;
            const opAmt = parseFloat(document.getElementById('lOpAmt').value) || 0;
            const otherInfo = document.getElementById('lOtherInfo').value.trim();
            
            const btn = document.getElementById('saveLedgerBtn');

            if(!name || !category) return alert("Please fill the required fields.");

            btn.disabled = true; btn.innerText = "Saving...";

            const payload = {
                ledgerNo: ledgerNo,
                name: name,
                category: category,
                opType: opType,
                opAmt: opAmt,
                otherInfo: otherInfo,
                updatedAt: new Date()
            };

            try {
                if(docId) {
                    await updateDoc(doc(db, "ledgers", docId), payload);
                    alert("Ledger updated!");
                } else {
                    payload.createdAt = new Date();
                    await addDoc(collection(db, "ledgers"), payload);
                    alert("New Ledger saved!");
                }
                window.resetLedgerForm();
                window.loadLedgers();
            } catch(e) { console.error(e); alert("Error saving ledger."); }

            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-rounded">save</span> Save Ledger`;
        };

        // 5. Edit / Delete / Reset / Filter
        window.editLedger = function(id) {
            const data = window.ledgerDataCache[id];
            if(!data) return;
            document.getElementById('docId').value = id;
            document.getElementById('lNo').value = data.ledgerNo;
            document.getElementById('lName').value = data.name;
            document.getElementById('lCategory').value = data.category;
            document.getElementById('lOpType').value = data.opType || 'Dr';
            document.getElementById('lOpAmt').value = data.opAmt || '';
            document.getElementById('lOtherInfo').value = data.otherInfo || '';
            
            document.getElementById('saveLedgerBtn').innerHTML = `<span class="material-symbols-rounded">update</span> Update Ledger`;
            document.getElementById('main-content').scrollTo({ top: 0, behavior: 'smooth' });
        };

        window.deleteLedger = async function(id) {
            if(confirm("Are you sure you want to permanently delete this Ledger?")) {
                try {
                    await deleteDoc(doc(db, "ledgers", id));
                    window.loadLedgers();
                } catch(e) { alert("Error deleting ledger."); }
            }
        };

        window.resetLedgerForm = function() {
            document.getElementById('ledger-form').reset();
            document.getElementById('docId').value = '';
            document.getElementById('saveLedgerBtn').innerHTML = `<span class="material-symbols-rounded">save</span> Save Ledger`;
            document.getElementById('lNo').value = `LD/COREBIQ/${String(window.nextLedgerCount).padStart(3, '0')}`;
        };

        window.filterLedgers = function() {
            const query = document.getElementById('searchLedger').value.toLowerCase();
            const rows = document.querySelectorAll('#ledger-module .ledger-row');
            rows.forEach(row => {
                const txt = row.getAttribute('data-search');
                row.style.display = txt.includes(query) ? '' : 'none';
            });
        };

        // Bootstrap Module
        window.loadCategories();
        window.loadLedgers();
        window.loadLinkedLedgers();
