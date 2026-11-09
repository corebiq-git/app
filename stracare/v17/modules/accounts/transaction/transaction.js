import { db } from "../../../js/firebase-config.js";
        import { collection, addDoc, query, where, getDocs, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

        window.txnDataCache = {};
        window.allBranchesStringTxn = "";
        const escapeTxnHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);

        window.openTransactionReceiptTemplate = function(transaction) {
            const receiptWindow = window.open(new URL('../../templates/template-receipt/template-receipt.html', import.meta.url), '_blank');
            if (!receiptWindow) {
                alert('The receipt template was blocked. Allow pop-ups for this site and try again.');
                return;
            }

            const handleReceiptReady = event => {
                if (
                    event.origin !== window.location.origin ||
                    event.source !== receiptWindow ||
                    event.data?.type !== 'corebiq:receipt:ready'
                ) return;

                window.removeEventListener('message', handleReceiptReady);
                receiptWindow.postMessage({
                    type: 'corebiq:receipt:data',
                    payload: {
                        receiptNumber: transaction.txnId || transaction.id || '',
                        date: transaction.date || '',
                        name: transaction.name || '',
                        mobile: transaction.mobile || '',
                        amount: Number(transaction.cashIn) || 0,
                        paymentMethod: transaction.mode || '',
                        purpose: transaction.ref || transaction.notes || 'Payment received',
                        notes: transaction.notes || ''
                    }
                }, window.location.origin);
            };

            window.addEventListener('message', handleReceiptReady);
        };

        document.getElementById('txnTableBody')?.addEventListener('click', event => {
            const button = event.target.closest('[data-receipt-id]');
            if (!button) return;
            const transaction = window.txnDataCache[button.dataset.receiptId];
            if (!transaction) {
                alert('Transaction details are unavailable. Reload the transaction list and try again.');
                return;
            }
            if (String(transaction.type || '').toLowerCase() === 'receipt') {
                window.openTransactionReceiptTemplate({ ...transaction, id: button.dataset.receiptId });
                return;
            }
            window.printReceipt(
                transaction.txnId,
                transaction.name,
                transaction.date,
                transaction.type,
                transaction.mode,
                transaction.cashIn,
                transaction.cashOut
            );
        });

        const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        document.getElementById("txnDate").value = today;
        document.getElementById("filterTxnDateFrom").value = today;
        document.getElementById("filterTxnDateTo").value = today;

        window.openTxnForm = function() {
            window.resetTxnForm();
            document.getElementById('txnFormTitle').textContent = 'Log Transaction';
            document.getElementById('txnModal').classList.add('show');
        };

        window.closeTxnForm = function() {
            document.getElementById('txnModal').classList.remove('show');
            window.resetTxnForm();
        };

        // --- 0. LOAD BRANCHES (WITH RBAC) ---
        window.loadBranchesForTxn = async function() {
            const select = document.getElementById('txnBranch');
            if (window.currentUser && window.currentUser.role !== 'admin') {
                const userBranch = window.currentUser.branch;
                select.innerHTML = `<option value="${escapeTxnHtml(userBranch)}">${escapeTxnHtml(userBranch)}</option>`;
                select.disabled = true;
                window.allBranchesStringTxn = userBranch;
                return;
            }

            try {
                const snap = await getDocs(collection(db, "branches"));
                const branchList = [];
                snap.forEach(branchDoc => {
                    const branchName = branchDoc.data().name;
                    if (branchName) branchList.push(branchName);
                });
                branchList.sort((a, b) => a.localeCompare(b));
                window.allBranchesStringTxn = branchList.join(" | ");
                select.innerHTML = '<option value="">Select Branch</option>';
                branchList.forEach(branchName => {
                    const option = document.createElement('option');
                    option.value = branchName;
                    option.textContent = branchName;
                    select.appendChild(option);
                });
            } catch (error) {
                console.error('Could not load transaction branches:', error);
                select.innerHTML = '<option value="">Branches could not be loaded</option>';
                throw error;
            }
        };

        window.loadBranchesForTxn().catch(error => console.error('Could not initialize transaction branches:', error));

        // --- 1. AUTO-FILL PATIENT & LOAD DUE DASHBOARD ---
        window.verifyTxnMobile = async function() {
            const mobile = document.getElementById('mobileInput').value;
            const btn = document.getElementById('verifyTxnBtn');
            const dash = document.getElementById('patientSummaryDash');
            
            if (mobile.length !== 10) return alert("Enter 10-digit mobile number.");
            
            btn.innerText = "...";
            try {
                const currentUser = window.currentUser;
                if (!currentUser) throw new Error('Your account profile is not available. Please sign out and sign in again.');
                const isBranchUser = currentUser.role !== 'admin';
                const branch = String(currentUser.branch || '').trim();
                if (isBranchUser && (!branch || branch === 'Unknown')) {
                    throw new Error('Your account has no assigned branch.');
                }
                const loadMobileMatches = async collectionName => {
                    const base = collection(db, collectionName);
                    const mobileQuery = isBranchUser
                        ? query(base, where('branch', '==', branch), where('mobile', '==', mobile))
                        : query(base, where('mobile', '==', mobile));
                    try {
                        const snapshot = await getDocs(mobileQuery);
                        return snapshot.docs;
                    } catch (error) {
                        if (!isBranchUser || error?.code !== 'failed-precondition') throw error;
                        console.warn(`Mobile lookup index unavailable for ${collectionName}; falling back to the assigned-branch query.`, error);
                        const branchSnapshot = await getDocs(query(base, where('branch', '==', branch)));
                        return branchSnapshot.docs.filter(item => item.data().mobile === mobile);
                    }
                };
                const [patientMatches, patientTransactions] = await Promise.all([
                    loadMobileMatches('patients'),
                    loadMobileMatches('transactions')
                ]);
                const patient = patientMatches[0];
                if (patient) {
                    document.getElementById('patientName').value = patient.data().name;
                } else {
                    alert("No patient found. Type name manually.");
                    dash.style.display = 'none';
                }

                if(patientTransactions.length) {
                    let tBilled = 0;
                    let tPaid = 0;
                    patientTransactions.forEach(transactionDoc => {
                        const record = transactionDoc.data();
                        tBilled += parseFloat(record.cashOut) || 0;
                        tPaid += parseFloat(record.cashIn) || 0;
                    });

                    const tPending = tBilled - tPaid;

                    document.getElementById('dashTotalBilled').innerText = `₹${tBilled.toFixed(2)}`;
                    document.getElementById('dashTotalPaid').innerText = `₹${tPaid.toFixed(2)}`;
                    document.getElementById('dashTotalPending').innerText = `₹${tPending.toFixed(2)}`;
                    
                    // Auto-fill form to clear dues
                    if(tPending > 0) {
                        document.getElementById('txnType').value = 'Receipt';
                        document.getElementById('txnCashIn').value = tPending.toFixed(2);
                        document.getElementById('txnCashOut').value = '';
                        document.getElementById('txnNotes').value = "Clearing pending dues";
                    }

                    dash.style.display = 'flex';
                } else {
                    dash.style.display = 'none';
                }

            } catch(error) {
                console.error('Transaction lookup failed:', error);
                alert(error.message || 'Could not search patient transactions.');
            }
            btn.innerText = "Search";
        }

        // --- 2. LOAD TRANSACTIONS (WITH RBAC) ---
        let transactionLoadId = 0;
        window.loadTransactions = async function() {
            const tableBody = document.getElementById('txnTableBody');
            const loadId = ++transactionLoadId;
            const fromDate = document.getElementById('filterTxnDateFrom').value;
            const toDate = document.getElementById('filterTxnDateTo').value;
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Loading transactions...</td></tr>';

            try {
                const currentUser = window.currentUser;
                if (!currentUser) throw new Error('Your account profile is not available. Please sign out and sign in again.');
                const isBranchUser = currentUser.role !== 'admin';
                const constraints = [];
                let branch = '';
                if (isBranchUser) {
                    branch = String(currentUser.branch || '').trim();
                    if (!branch || branch === 'Unknown') throw new Error('Your account has no assigned branch.');
                    constraints.push(where("branch", "==", branch));
                }
                if (fromDate) constraints.push(where("date", ">=", fromDate));
                if (toDate) constraints.push(where("date", "<=", toDate));
                const transactionCollection = collection(db, "transactions");
                const transactionQuery = constraints.length ? query(transactionCollection, ...constraints) : transactionCollection;
                let querySnapshot;
                try {
                    querySnapshot = await getDocs(transactionQuery);
                } catch (error) {
                    if (!isBranchUser || error?.code !== 'failed-precondition') throw error;
                    console.warn('Transaction date index unavailable; falling back to the assigned-branch query.', error);
                    querySnapshot = await getDocs(query(
                        transactionCollection,
                        where("branch", "==", branch)
                    ));
                }
                if (loadId !== transactionLoadId) return;
                tableBody.innerHTML = ''; 
                window.txnDataCache = {};
                const branchFilter = document.getElementById('filterTxnBranch');
                const selectedBranch = branchFilter.value;
                branchFilter.innerHTML = '<option value="">All Branches</option>';
                let txnList = querySnapshot.docs.map(transactionDoc => ({
                    id: transactionDoc.id,
                    data: transactionDoc.data()
                }));
                if (fromDate) txnList = txnList.filter(item => String(item.data.date || '') >= fromDate);
                if (toDate) txnList = txnList.filter(item => String(item.data.date || '') <= toDate);

                const branches = [...new Set(querySnapshot.docs.map(transactionDoc => String(transactionDoc.data().branch || '').trim()).filter(Boolean))]
                    .sort((a, b) => a.localeCompare(b));
                branches.forEach(branch => {
                    const option = document.createElement('option');
                    option.value = branch.toLowerCase();
                    option.textContent = branch;
                    branchFilter.appendChild(option);
                });
                if (branches.some(branch => branch.toLowerCase() === selectedBranch)) {
                    branchFilter.value = selectedBranch;
                }

                txnList.sort((a, b) => new Date(b.data.date || 0) - new Date(a.data.date || 0));
                if (!txnList.length) {
                    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">${querySnapshot.empty ? 'No transactions recorded yet.' : 'No transactions match the selected date range.'}</td></tr>`;
                    return;
                }

                txnList.forEach((item) => {
                    const data = item.data;
                    const docId = item.id; 
                    window.txnDataCache[docId] = data;
                    
                    let typeBadge = '';
                    if(data.type === 'Sales') typeBadge = '<span class="badge badge-sales">Sales</span>';
                    else if(data.type === 'Expense' || data.type === 'Payment') typeBadge = `<span class="badge badge-expense">${data.type}</span>`;
                    else typeBadge = `<span class="badge badge-receipt">${data.type}</span>`;

                    let amountHtml = '';
                    if(data.cashIn > 0) amountHtml += `<strong style="color: var(--success);">+ ₹${data.cashIn}</strong><br>`;
                    if(data.cashOut > 0) amountHtml += `<strong style="color: var(--danger);">- ₹${data.cashOut}</strong>`;

                    const receiptAmount = window.formatCorebiqCurrency
                        ? window.formatCorebiqCurrency(data.cashIn || data.cashOut)
                        : `₹${data.cashIn || data.cashOut}`;
                    const waText = encodeURIComponent(`Hello ${data.name}, your payment receipt for ${receiptAmount} has been successfully processed at STRA CARE. Thank you!`);

                    const tr = document.createElement('tr');
                    tr.setAttribute("data-type", data.type.toLowerCase());
                    tr.setAttribute("data-date", data.date);
                    tr.setAttribute("data-search", `${data.name} ${data.mobile} ${data.txnId} ${data.invoiceNo || (data.linkedAptId ? `INV-${data.linkedAptId}` : '')} ${data.linkedAptId || ''} ${data.ref}`.toLowerCase());
                    tr.dataset.branch = String(data.branch || '').toLowerCase();
                    tr.dataset.mode = String(data.mode || '').toLowerCase();
                    tr.dataset.name = String(data.name || '').toLowerCase();
                    tr.dataset.amount = String(Math.max(Number(data.cashIn) || 0, Number(data.cashOut) || 0));

                    tr.innerHTML = `
                        <td data-label="Date/ID"><strong>${escapeTxnHtml(data.date || '—')}</strong><br><span style="font-size:11px;color:var(--text-muted)">${escapeTxnHtml(data.txnId || '--')}</span>${data.invoiceNo || data.linkedAptId ? `<br><span style="font-size:11px;color:var(--primary);font-weight:600">${escapeTxnHtml(data.invoiceNo || `INV-${data.linkedAptId}`)}</span>` : ''}</td>
                        <td data-label="Ledger">
                            <strong>${data.name}</strong><br><span style="font-size:12px; color:var(--text-muted);">${data.mobile || '--'}</span>
                            <div class="no-print" style="margin-top: 6px;">
                                <a href="https://wa.me/91${data.mobile}?text=${waText}" class="cta-link" target="_blank" title="Send Receipt via WhatsApp"><span class="material-symbols-rounded" style="font-size: 14px; color: var(--success);">chat</span></a>
                            </div>
                        </td>
                        <td data-label="Branch"><span style="font-size:12px; color:var(--primary); font-weight:600;">${data.branch || 'Unassigned'}</span></td>
                        <td data-label="Type">${typeBadge}<br><span style="font-size:12px; color:var(--text-muted);">${data.mode}</span></td>
                        <td data-label="Notes"><span style="font-size:12px;">Ref: ${data.ref || '--'}</span><br><span style="font-size:12px; color:var(--secondary);">${data.notes}</span></td>
                        <td data-label="Amount">${amountHtml}</td>
                        <td class="no-print" data-label="Actions" style="text-align: right;">
                            <div class="transaction-row-actions">
                                ${String(data.type || '').toLowerCase() === 'sales' && data.linkedAptId ? `<button type="button" class="transaction-row-action" data-appointment-invoice="${escapeTxnHtml(data.linkedAptId)}" title="Open linked appointment invoice" aria-label="Open linked appointment invoice"><span class="material-symbols-rounded">description</span></button>` : ''}
                                <button type="button" class="transaction-row-action" title="Print Statement Ledger" aria-label="Print statement ledger" onclick="window.printPatientStatement('${data.mobile}', '${data.name}')"><span class="material-symbols-rounded">account_box</span></button>
                                <button type="button" class="transaction-row-action" data-receipt-id="${escapeTxnHtml(docId)}" title="${String(data.type || '').toLowerCase() === 'receipt' ? 'Open S4 receipt template' : 'Print receipt or voucher'}" aria-label="${String(data.type || '').toLowerCase() === 'receipt' ? 'Open S4 receipt template' : 'Print receipt or voucher'}"><span class="material-symbols-rounded">receipt_long</span></button>
                                <button type="button" class="transaction-row-action" title="Edit" aria-label="Edit transaction" onclick="window.editTxn('${docId}')"><span class="material-symbols-rounded">edit</span></button>
                                <button type="button" class="transaction-row-action danger" title="Delete" aria-label="Delete transaction" onclick="window.deleteTxn('${docId}')"><span class="material-symbols-rounded">delete</span></button>
                            </div>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });
                window.filterTxnTable();
            } catch (error) {
                if (loadId !== transactionLoadId) return;
                console.error("Firebase Read Error:", error);
                tableBody.innerHTML = `<tr><td colspan="7" role="alert" style="text-align:center;padding:24px;color:var(--danger)">${escapeTxnHtml(error.message || 'Unable to load transactions.')}</td></tr>`;
            }
        };

        window.loadTransactions();

        document.getElementById('txnTableBody').addEventListener('click', async event => {
            const button = event.target.closest('[data-appointment-invoice]');
            if (!button) return;
            const appointmentId = button.dataset.appointmentInvoice;
            button.disabled = true;
            try {
                if (typeof window.openInvoiceTemplate !== 'function') {
                    await window.switchView('view-appointments', null);
                    for (let attempt = 0; attempt < 40 && typeof window.openInvoiceTemplate !== 'function'; attempt++) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                }
                if (typeof window.openInvoiceTemplate !== 'function') {
                    throw new Error('Appointment invoice module did not load. Please retry.');
                }
                await window.openInvoiceTemplate(appointmentId);
            } catch (error) {
                console.error('Could not open linked appointment invoice:', error);
                alert(error.message || 'Could not open the linked appointment invoice.');
            } finally {
                button.disabled = false;
            }
        });

        // --- 3. FILTERING WITH FROM / TO DATE ---
        window.filterTxnTable = function() {
            const typeQuery = document.getElementById("filterTxnType").value.toLowerCase();
            const branchQuery = document.getElementById("filterTxnBranch").value.toLowerCase();
            const modeQuery = document.getElementById("filterTxnMode").value.toLowerCase();
            const dateFromQuery = document.getElementById("filterTxnDateFrom").value;
            const dateToQuery = document.getElementById("filterTxnDateTo").value;
            const textQuery = document.getElementById("txnSearchInput").value.toLowerCase().trim();
            const sortMode = document.getElementById("sortTxnBy").value;
            const tableBody = document.getElementById("txnTableBody");
            const trs = [...tableBody.querySelectorAll('tr[data-type]')];

            const filteredRows = trs.filter(row => {
                const rowDate = row.dataset.date || '';
                return (!typeQuery || row.dataset.type === typeQuery)
                    && (!branchQuery || row.dataset.branch === branchQuery)
                    && (!modeQuery || row.dataset.mode === modeQuery)
                    && (!dateFromQuery || rowDate >= dateFromQuery)
                    && (!dateToQuery || rowDate <= dateToQuery)
                    && (!textQuery || row.dataset.search.includes(textQuery));
            });
            const compareText = (a, b, direction) => direction * a.dataset.name.localeCompare(b.dataset.name);
            filteredRows.sort((a, b) => {
                switch (sortMode) {
                    case 'oldest': return a.dataset.date.localeCompare(b.dataset.date);
                    case 'name-asc': return compareText(a, b, 1);
                    case 'name-desc': return compareText(a, b, -1);
                    case 'amount-desc': return Number(b.dataset.amount) - Number(a.dataset.amount);
                    case 'amount-asc': return Number(a.dataset.amount) - Number(b.dataset.amount);
                    default: return b.dataset.date.localeCompare(a.dataset.date);
                }
            });
            trs.forEach(row => { row.style.display = 'none'; });
            filteredRows.forEach(row => {
                row.style.display = '';
                tableBody.appendChild(row);
            });
            let emptyState = tableBody.querySelector('[data-empty-state]');
            if (!filteredRows.length) {
                if (!emptyState) {
                    emptyState = document.createElement('tr');
                    emptyState.dataset.emptyState = 'true';
                    emptyState.innerHTML = '<td colspan="7" class="empty" style="text-align:center;padding:28px;color:var(--text-muted)">No transactions match these filters.</td>';
                    tableBody.appendChild(emptyState);
                }
                emptyState.style.display = '';
            } else if (emptyState) {
                emptyState.style.display = 'none';
            }
        }

        window.clearTxnFilters = function() {
            document.getElementById("filterTxnDateFrom").value = today;
            document.getElementById("filterTxnDateTo").value = today;
            document.getElementById("filterTxnType").value = "";
            document.getElementById("filterTxnBranch").value = "";
            document.getElementById("filterTxnMode").value = "";
            document.getElementById("sortTxnBy").value = "newest";
            document.getElementById("txnSearchInput").value = "";
            window.loadTransactions();
        }

        const escapeReportHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
        const formatReportMoney = value => window.formatCorebiqCurrency
            ? window.formatCorebiqCurrency(value)
            : `₹${(Number(value) || 0).toFixed(2)}`;

        function getPatientTxnReports() {
            const patients = new Map();
            Object.entries(window.txnDataCache).forEach(([id, data]) => {
                const type = String(data.type || '').toLowerCase();
                if (type !== 'sales' && type !== 'receipt') return;

                const name = String(data.name || 'Unknown patient').trim();
                const mobile = String(data.mobile || '').replace(/\D/g, '');
                const key = mobile ? `mobile:${mobile}` : `name:${name.toLowerCase()}`;
                if (!patients.has(key)) {
                    patients.set(key, { key, name, mobile, transactions: [], billed: 0, received: 0 });
                }
                const patient = patients.get(key);
                const transaction = { id, ...data, type: type === 'sales' ? 'Bill' : 'Receipt' };
                transaction.billAmount = type === 'sales' ? Number(data.cashOut) || 0 : 0;
                transaction.receiptAmount = type === 'receipt' ? Number(data.cashIn) || 0 : 0;
                patient.transactions.push(transaction);
                patient.billed += transaction.billAmount;
                patient.received += transaction.receiptAmount;
            });

            return [...patients.values()].map(patient => {
                patient.transactions.sort((a, b) =>
                    String(a.date || '').localeCompare(String(b.date || ''))
                    || String(a.txnId || a.id).localeCompare(String(b.txnId || b.id))
                );
                patient.balance = patient.billed - patient.received;
                return patient;
            }).sort((a, b) => a.name.localeCompare(b.name));
        }

        window.openPatientTxnReport = function() {
            document.getElementById('patientReportModal').classList.add('show');
            document.getElementById('patientReportSearch').value = '';
            document.getElementById('patientReportDetail').classList.remove('show');
            window.renderPatientTxnReport();
        };

        window.closePatientTxnReport = function() {
            document.getElementById('patientReportModal').classList.remove('show');
        };

        window.renderPatientTxnReport = function() {
            const patients = getPatientTxnReports();
            const search = document.getElementById('patientReportSearch').value.toLowerCase().trim();
            const body = document.getElementById('patientReportBody');
            const totalBilled = patients.reduce((sum, patient) => sum + patient.billed, 0);
            const totalReceived = patients.reduce((sum, patient) => sum + patient.received, 0);
            document.getElementById('reportTotalBilled').textContent = formatReportMoney(totalBilled);
            document.getElementById('reportTotalReceived').textContent = formatReportMoney(totalReceived);
            document.getElementById('reportTotalDue').textContent = formatReportMoney(totalBilled - totalReceived);

            const visiblePatients = patients.filter(patient =>
                `${patient.name} ${patient.mobile}`.toLowerCase().includes(search)
            );
            if (!visiblePatients.length) {
                body.innerHTML = `<tr><td colspan="6" class="report-empty">${patients.length ? 'No patients match your search.' : 'No bills or receipts found in the available transaction records.'}</td></tr>`;
                return;
            }

            body.innerHTML = visiblePatients.map(patient => {
                const encodedKey = encodeURIComponent(patient.key);
                const dueColor = patient.balance > 0 ? '#DC2626' : '#059669';
                return `<tr>
                    <td><strong>${escapeReportHtml(patient.name)}</strong></td>
                    <td>${escapeReportHtml(patient.mobile || '—')}</td>
                    <td style="text-align:right">${formatReportMoney(patient.billed)}</td>
                    <td style="text-align:right;color:#059669">${formatReportMoney(patient.received)}</td>
                    <td style="text-align:right;color:${dueColor};font-weight:750">${formatReportMoney(patient.balance)}</td>
                    <td><div class="report-actions">
                        <button type="button" class="report-icon-btn" data-report-action="details" data-patient="${encodedKey}" title="View bills and receipts" aria-label="View bills and receipts for ${escapeReportHtml(patient.name)}"><span class="material-symbols-rounded">expand_more</span></button>
                        <button type="button" class="report-icon-btn whatsapp" data-report-action="whatsapp" data-patient="${encodedKey}" ${patient.mobile ? '' : 'disabled'} title="Send report via WhatsApp" aria-label="Send report via WhatsApp"><span class="material-symbols-rounded">chat</span></button>
                        <button type="button" class="report-icon-btn download" data-report-action="download" data-patient="${encodedKey}" title="Download patient ledger" aria-label="Download patient ledger"><span class="material-symbols-rounded">download</span></button>
                    </div></td>
                </tr>`;
            }).join('');
        };

        function getPatientReport(key) {
            return getPatientTxnReports().find(patient => patient.key === key);
        }

        function getDailyPatientStatement(patient) {
            const dates = new Map();
            patient.transactions.forEach(transaction => {
                const date = transaction.date || '';
                if (!dates.has(date)) {
                    dates.set(date, { date, sales: 0, cashReceipts: 0, bankReceipts: 0, salesCount: 0, receiptCount: 0, particulars: [] });
                }
                const day = dates.get(date);
                if (transaction.type === 'Bill') {
                    day.sales += transaction.billAmount;
                    day.salesCount++;
                    day.particulars.push(`Invoice ${transaction.invoiceNo || (transaction.linkedAptId ? `INV-${transaction.linkedAptId}` : transaction.txnId || transaction.id)}`);
                } else {
                    const receipt = transaction.receiptAmount;
                    const paymentMode = String(transaction.mode || '').toLowerCase();
                    if (paymentMode === 'cash') day.cashReceipts += receipt;
                    else day.bankReceipts += receipt;
                    day.receiptCount++;
                    day.particulars.push(`${paymentMode === 'cash' ? 'Cash' : 'Bank'} receipt ${transaction.txnId || transaction.id}`);
                }
            });

            let due = 0;
            return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => {
                due += day.sales - day.cashReceipts - day.bankReceipts;
                return { ...day, due };
            });
        }

        function renderPatientReportDetails(patient) {
            const detail = document.getElementById('patientReportDetail');
            const dailyStatement = getDailyPatientStatement(patient);
            const rows = dailyStatement.map(day => `<tr>
                <td>${escapeReportHtml(day.date || '—')}</td>
                <td>${escapeReportHtml(day.particulars.join('; ') || 'Account activity')}</td>
                <td style="text-align:right;color:#B42318;font-weight:650">${day.sales ? formatReportMoney(day.sales) : '—'}</td>
                <td style="text-align:right;color:#067647">${day.cashReceipts ? formatReportMoney(day.cashReceipts) : '—'}</td>
                <td style="text-align:right;color:#0B1F4B">${day.bankReceipts ? formatReportMoney(day.bankReceipts) : '—'}</td>
                <td style="text-align:right;font-weight:750;color:${day.due > 0 ? '#B42318' : '#067647'}">${formatReportMoney(day.due)}</td>
            </tr>`).join('');
            const dueColor = patient.balance > 0 ? '#B42318' : '#067647';
            detail.innerHTML = `<div class="report-detail-head">
                <div><h4>${escapeReportHtml(patient.name)} · Account Statement</h4><div style="margin-top:3px;color:var(--text-muted);font-size:12px">Mobile: ${escapeReportHtml(patient.mobile || '—')} · ${dailyStatement.length} transaction date(s)</div></div>
                <div style="text-align:right;font-size:12px"><div>Sales ${formatReportMoney(patient.billed)} · Receipts ${formatReportMoney(patient.received)}</div><div class="report-detail-balance" style="color:${dueColor}">Final due ${formatReportMoney(patient.balance)}</div></div>
            </div>
            <div class="report-table-wrap"><table class="report-table">
                <thead><tr><th>Date</th><th>Particulars</th><th style="text-align:right">Sales (+)</th><th style="text-align:right">Cash Receipt (−)</th><th style="text-align:right">Bank Receipt (−)</th><th style="text-align:right">Running Due</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr style="background:#F8FAFC;font-weight:800">
                    <td colspan="2" style="text-align:right">Closing due</td>
                    <td style="text-align:right;color:#B42318">${formatReportMoney(patient.billed)}</td>
                    <td style="text-align:right;color:#067647">${formatReportMoney(dailyStatement.reduce((sum, day) => sum + day.cashReceipts, 0))}</td>
                    <td style="text-align:right;color:#0B1F4B">${formatReportMoney(dailyStatement.reduce((sum, day) => sum + day.bankReceipts, 0))}</td>
                    <td style="text-align:right;color:${dueColor};font-size:14px">${formatReportMoney(patient.balance)}</td>
                </tr></tfoot>
            </table></div>`;
            detail.classList.add('show');
        }

        function reportCsvCell(value) {
            return `"${String(value ?? '').replace(/"/g, '""')}"`;
        }

        function downloadPatientTxnReport(patient) {
            const dailyStatement = getDailyPatientStatement(patient);
            const rows = [
                ['ACCOUNT STATEMENT'],
                ['Patient', patient.name],
                ['Mobile', patient.mobile],
                ['Total sales', patient.billed.toFixed(2)],
                ['Cash receipts', dailyStatement.reduce((sum, day) => sum + day.cashReceipts, 0).toFixed(2)],
                ['Bank receipts', dailyStatement.reduce((sum, day) => sum + day.bankReceipts, 0).toFixed(2)],
                ['Final due', patient.balance.toFixed(2)],
                [],
                ['Date', 'Particulars', 'Sales (+) INR', 'Cash Receipt (-) INR', 'Bank Receipt (-) INR', 'Running Due INR']
            ];
            dailyStatement.forEach(day => rows.push([
                day.date,
                day.particulars.join('; '),
                day.sales ? day.sales.toFixed(2) : '',
                day.cashReceipts ? day.cashReceipts.toFixed(2) : '',
                day.bankReceipts ? day.bankReceipts.toFixed(2) : '',
                day.due.toFixed(2)
            ]));
            rows.push([], ['CLOSING DUE', '', '', '', '', patient.balance.toFixed(2)]);
            const csv = '\uFEFF' + rows.map(row => row.map(reportCsvCell).join(',')).join('\r\n');
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
            const link = document.createElement('a');
            const safeName = patient.name.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'patient';
            link.href = url;
            link.download = `${safeName}-transaction-report.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        function sendPatientTxnReport(patient) {
            if (!patient.mobile) {
                alert('This patient has no mobile number for WhatsApp.');
                return;
            }
            let phone = patient.mobile;
            if (phone.length === 11 && phone.startsWith('0')) phone = phone.slice(1);
            if (phone.length === 10) phone = `91${phone}`;
            if (!/^91\d{10}$/.test(phone)) {
                alert('Patient mobile number must be a valid 10-digit Indian number.');
                return;
            }
            const dailyStatement = getDailyPatientStatement(patient);
            const formatMoney = value => window.formatCorebiqCurrency
                ? window.formatCorebiqCurrency(value)
                : `₹${Number(value || 0).toFixed(2)}`;
            const lines = dailyStatement.map(day =>
                `${day.date || 'Date unavailable'} | Sales +${formatMoney(day.sales)} | Cash receipt -${formatMoney(day.cashReceipts)} | Bank receipt -${formatMoney(day.bankReceipts)} | Due ${formatMoney(day.due)}`
            );
            const message = [
                `Account statement: ${patient.name}`,
                `Total sales: ${formatMoney(patient.billed)}`,
                `Cash receipts: ${formatMoney(dailyStatement.reduce((sum, day) => sum + day.cashReceipts, 0))}`,
                `Bank receipts: ${formatMoney(dailyStatement.reduce((sum, day) => sum + day.bankReceipts, 0))}`,
                `Final due: ${formatMoney(patient.balance)}`,
                '',
                'Date-wise statement:',
                ...lines
            ].join('\n');
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
        }

        document.getElementById('patientReportBody').addEventListener('click', event => {
            const button = event.target.closest('[data-report-action]');
            if (!button) return;
            const patient = getPatientReport(decodeURIComponent(button.dataset.patient));
            if (!patient) return;
            if (button.dataset.reportAction === 'details') renderPatientReportDetails(patient);
            if (button.dataset.reportAction === 'download') downloadPatientTxnReport(patient);
            if (button.dataset.reportAction === 'whatsapp') sendPatientTxnReport(patient);
        });

        window.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                window.closePatientTxnReport();
                window.closeTxnForm();
            }
        });

        // --- 4. PRINT RECEIPT ---
        window.printReceipt = function(txnId, name, date, type, mode, cashIn, cashOut) {
            const amount = parseFloat(cashIn) > 0 ? cashIn : cashOut;
            const title = (type === 'Sales' || type === 'Receipt') ? 'Payment Receipt' : 'Payment Voucher';
            const branchesText = window.allBranchesStringTxn || 'Mahe | Chokli | Panoor | Koothuparamba';

            const win = window.open('', '_blank');
            win.document.write(`
                <html>
                <head>
                    <title>${title} - ${txnId}</title>
                    
                </head>
                <body>
                    <div class="header-row">
                        <div class="logo-area">
                            <img src="${new URL('../../../assets/logo.png', import.meta.url)}" alt="Logo">
                            <img src="${new URL('../../../assets/name.png', import.meta.url)}" alt="STRA CARE">
                        </div>
                        <div class="company-info">
                            <strong>+91 97449 02555 | +91 90612 07871</strong><br>
                            info@stracares.in | www.stracares.in<br>
                            Branches: ${branchesText}
                        </div>
                    </div>
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="margin:0; color: #e16349; text-transform: uppercase;">${title}</h2>
                    </div>
                    <div class="row"><strong>Voucher No:</strong> ${txnId}</div>
                    <div class="row"><strong>Date:</strong> ${date}</div>
                    <div class="box">
                        <div class="row"><strong>Name / Ledger:</strong> <span>${name}</span></div>
                        <div class="row"><strong>Voucher Type:</strong> <span>${type}</span></div>
                        <div class="row"><strong>Payment Mode:</strong> <span>${mode}</span></div>
                    </div>
                    <div class="amt">Amount: ${formatReportMoney(amount)}</div>
                    <div style="margin-top: 60px; display: flex; justify-content: space-between;">
                        <div>_____________________<br>Authorized Signatory</div>
                        <div>_____________________<br>Customer / Payee</div>
                    </div>
                    <div class="footer-text">
                        Generated by COREBIQ
                    </div>
                </body>
                </html>
            `);
            win.onload = function() { win.print(); };
            win.document.close();
        }

        // --- 4B. PRINT FULL PATIENT LEDGER STATEMENT ---
        window.printPatientStatement = async function(mobile, name) {
            if(!mobile || mobile === "undefined") return alert("Cannot generate statement. Invalid mobile number.");

            try {
                const isBranchUser = window.currentUser?.role !== 'admin';
                const transactionQuery = isBranchUser
                    ? query(collection(db, "transactions"), where("branch", "==", window.currentUser.branch))
                    : collection(db, "transactions");
                const snapshot = await getDocs(transactionQuery);
                const txns = snapshot.docs
                    .map(transactionDoc => transactionDoc.data())
                    .filter(transaction => transaction.mobile === mobile);
                const totalBilled = txns.reduce((sum, transaction) => sum + (parseFloat(transaction.cashOut) || 0), 0);
                const totalPaid = txns.reduce((sum, transaction) => sum + (parseFloat(transaction.cashIn) || 0), 0);
                
                if (txns.length === 0) return alert("No transaction history found for this patient.");

                // Sort ascending for chronological ledger view
                txns.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
                
                let balancePending = totalBilled - totalPaid;
                const branchesText = window.allBranchesStringTxn || 'Mahe | Chokli | Panoor | Koothuparamba';

                let tbody = '';
                txns.forEach(t => {
                    tbody += `<tr>
                        <td>${t.date}</td>
                        <td>${t.txnId || '--'}</td>
                        <td>${t.branch || '--'}</td>
                        <td>${t.type} / ${t.mode || '--'}</td>
                        <td style="text-align:right;">${t.cashOut > 0 ? formatReportMoney(t.cashOut) : '-'}</td>
                        <td style="text-align:right; color: #10B981;">${t.cashIn > 0 ? formatReportMoney(t.cashIn) : '-'}</td>
                    </tr>`;
                });

                const win = window.open('', '_blank');
                win.document.write(`
                    <html>
                    <head>
                        <title>Statement of Account - ${name}</title>
                        
                    </head>
                    <body>
                        <div class="header-row">
                            <div class="logo-area">
                                <img src="${new URL('../../../assets/logo.png', import.meta.url)}" alt="Logo">
                                <img src="${new URL('../../../assets/name.png', import.meta.url)}" alt="STRA CARE">
                            </div>
                            <div class="company-info">
                                <strong>+91 97449 02555 | +91 90612 07871</strong><br>
                                info@stracares.in | www.stracares.in<br>
                                Branches: ${branchesText}
                            </div>
                        </div>

                        <div style="text-align: center; margin-bottom: 30px;">
                            <h2 style="margin: 0; color: #e16349; text-transform: uppercase;">Statement of Account</h2>
                        </div>

                        <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                            <div>
                                <strong>Patient Name:</strong> <span style="font-size: 16px;">${name}</span><br>
                                <strong>Mobile Number:</strong> +91 ${mobile}
                            </div>
                            <div style="text-align: right;">
                                <strong>Report Generated:</strong> ${new Date().toLocaleDateString()}
                            </div>
                        </div>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Transaction ID</th>
                                    <th>Branch</th>
                                    <th>Type / Mode</th>
                                    <th style="text-align:right;">Billed Fee</th>
                                    <th style="text-align:right;">Paid Amt</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tbody}
                            </tbody>
                        </table>
                        
                        <div class="summary">
                            <div class="summary-row"><span>Total Services Billed:</span> <span>${formatReportMoney(totalBilled)}</span></div>
                            <div class="summary-row"><span>Total Payments Received:</span> <span style="color: #10B981;">${formatReportMoney(totalPaid)}</span></div>
                            <div class="summary-row total"><span>Total Pending Dues:</span> <span>${formatReportMoney(balancePending)}</span></div>
                        </div>

                        <div class="footer-text">
                            Generated by COREBIQ
                        </div>

                    </body>
                    </html>
                `);
                win.onload = function() { win.print(); };
                win.document.close();
            } catch(e) {
                console.error(e);
                alert("Error generating statement.");
            }
        }

        // --- 5. EDIT & DELETE ---
        window.editTxn = function(docId) {
            const data = window.txnDataCache[docId];
            if(!data) return;
            if (window.currentUser?.role !== 'admin' && data.branch !== window.currentUser?.branch) {
                return alert('You can only edit transactions for your assigned branch.');
            }
            document.getElementById('txnDocId').value = docId; 
            document.getElementById('txnIdDisplay').value = data.txnId; 
            document.getElementById('txnDate').value = data.date || '';
            document.getElementById('txnType').value = data.type || 'Sales';
            document.getElementById('mobileInput').value = data.mobile || '';
            document.getElementById('patientName').value = data.name || '';
            document.getElementById('txnBranch').value = data.branch || '';
            document.getElementById('txnMode').value = data.mode || 'Cash';
            document.getElementById('txnRef').value = data.ref || '';
            document.getElementById('txnCashIn').value = data.cashIn || '';
            document.getElementById('txnCashOut').value = data.cashOut || '';
            document.getElementById('txnNotes').value = data.notes || '';
            
            document.getElementById('saveTxnBtn').innerText = "Update Transaction";
            document.getElementById('txnFormTitle').textContent = 'Edit Transaction';
            document.getElementById('txnModal').classList.add('show');
        }

        window.deleteTxn = async function(docId) {
            const data = window.txnDataCache[docId];
            if (!data) return alert('This transaction is no longer available. Reload the list and try again.');
            if (window.currentUser?.role !== 'admin' && data.branch !== window.currentUser?.branch) {
                return alert('You can only delete transactions for your assigned branch.');
            }
            if(confirm("Are you sure you want to permanently delete this transaction?")) {
                try {
                    await deleteDoc(doc(db, "transactions", docId));
                    alert("Transaction deleted.");
                    window.loadTransactions();
                } catch(error) {
                    console.error('Transaction delete failed:', error);
                    alert(error.message || 'Could not delete the transaction.');
                }
            }
        }

        window.resetTxnForm = function() {
            document.getElementById('transaction-form').reset();
            document.getElementById('txnDocId').value = ''; 
            document.getElementById('txnIdDisplay').value = 'Auto-Generated'; 
            document.getElementById('txnDate').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
            document.getElementById('saveTxnBtn').innerText = "Save Transaction";
            document.getElementById('txnFormTitle').textContent = "Log Transaction";
            document.getElementById('patientSummaryDash').style.display = 'none';
            
            if (window.currentUser && window.currentUser.role !== 'admin') {
                document.getElementById('txnBranch').value = window.currentUser.branch;
            }
        }

        // --- 6. SAVE TRANSACTION (TRNDDMMYYHHMM FORMAT) ---
        window.saveTransaction = async function() {
            const saveBtn = document.getElementById('saveTxnBtn');
            const docId = document.getElementById('txnDocId').value; 
            
            const date = document.getElementById('txnDate').value;
            const type = document.getElementById('txnType').value;
            const branch = document.getElementById('txnBranch').value;
            const mobile = document.getElementById('mobileInput').value;
            const name = document.getElementById('patientName').value;
            const mode = document.getElementById('txnMode').value;
            const ref = document.getElementById('txnRef').value;
            const cashIn = document.getElementById('txnCashIn').value || 0;
            const cashOut = document.getElementById('txnCashOut').value || 0;
            const notes = document.getElementById('txnNotes').value;
            const currentUser = window.currentUser;

            if (!name || !date || !type || !branch) return alert("Required fields missing!");
            if (!currentUser) return alert('Your signed-in account is not ready. Reopen Transactions after signing in.');
            if (currentUser.role !== 'admin' && branch !== currentUser.branch) {
                return alert('You can only save transactions for your assigned branch.');
            }

            saveBtn.innerText = "Saving...";
            saveBtn.disabled = true;

            const payload = {
                ...(docId ? window.txnDataCache[docId] || {} : {}),
                date: date,
                type: type,
                branch: branch,
                mobile: mobile,
                name: name,
                mode: mode,
                ref: ref,
                cashIn: parseFloat(cashIn),
                cashOut: parseFloat(cashOut),
                notes: notes,
                updatedAt: new Date()
            };

            try {
                if(docId) {
                    payload.txnId = document.getElementById('txnIdDisplay').value;
                    const existing = window.txnDataCache[docId];
                    if (!existing) throw new Error('Transaction is no longer available. Reload and try again.');
                    if (currentUser.role !== 'admin' && existing.branch !== currentUser.branch) throw new Error('You can only edit transactions for your assigned branch.');
                    await updateDoc(doc(db, "transactions", docId), payload);
                    alert("Transaction updated!");
                } else {
                    // Custom Transaction ID formatting: TRNDDMMYYHHMM
                    const now = new Date();
                    const dd = String(now.getDate()).padStart(2, '0');
                    const mm = String(now.getMonth() + 1).padStart(2, '0');
                    const yy = String(now.getFullYear()).slice(-2);
                    const hh = String(now.getHours()).padStart(2, '0');
                    const mins = String(now.getMinutes()).padStart(2, '0');
                    
                    payload.txnId = `TRN${dd}${mm}${yy}${hh}${mins}`;
                    payload.createdAt = now;
                    await addDoc(collection(db, "transactions"), payload);
                    alert("Transaction saved!");
                }
                window.closeTxnForm();
                window.loadTransactions();
            } catch (error) {
                console.error("Firebase transaction save failed:", error);
                alert(error.message || "Failed to save transaction.");
            }
            saveBtn.innerText = "Save Transaction";
            saveBtn.disabled = false;
        }
