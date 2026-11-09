import { db } from "../../../js/firebase-config.js";
        import { collection, addDoc, query, where, getDocs, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

        window.txnDataCache = {};
        window.allBranchesStringTxn = "";

        document.getElementById("txnDate").value = new Date().toISOString().split('T')[0];

        window.loadBranchesForTxn = async function() {
            const select = document.getElementById('txnBranch');
            if (window.currentUser && window.currentUser.role !== 'admin') {
                const userBranch = window.currentUser.branch;
                select.innerHTML = `<option value="${userBranch}">${userBranch}</option>`;
                select.style.pointerEvents = 'none';
                select.style.background = 'var(--grey-med)';
                window.allBranchesStringTxn = userBranch;
                return; 
            }
            try {
                const snap = await getDocs(collection(db, "branches"));
                let branchList = [];
                snap.forEach(doc => { if(doc.data().name) branchList.push(doc.data().name); });
                branchList.sort();
                window.allBranchesStringTxn = branchList.join(" | ");
                select.innerHTML = '<option value="">Select Branch</option>';
                branchList.forEach(bName => {
                    const option = document.createElement('option');
                    option.value = bName; option.text = bName; select.appendChild(option);
                });
            } catch(e) { select.innerHTML = '<option value="Main Branch">Main Branch</option>'; }
        };
        window.loadBranchesForTxn();

        window.loadTransactions = async function() {
            const tableBody = document.getElementById('txnTableBody');
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Loading payment vouchers...</td></tr>';

            try {
                let q;
                if (window.currentUser && window.currentUser.role !== 'admin') {
                    q = query(collection(db, "transactions"), where("branch", "==", window.currentUser.branch));
                } else {
                    q = collection(db, "transactions");
                }

                const querySnapshot = await getDocs(q);
                tableBody.innerHTML = ''; 
                window.txnDataCache = {};
                
                let txnList = [];
                let tPayments = 0;
                let tExpenses = 0;

                querySnapshot.forEach(doc => {
                    const data = doc.data();
                    // FILTER SPECIFIC TO PAYMENTS & EXPENSES
                    if(data.type === 'Payment' || data.type === 'Expense') {
                        txnList.push({ id: doc.id, data: data });
                        if(data.type === 'Payment') tPayments += parseFloat(data.cashOut) || 0;
                        if(data.type === 'Expense') tExpenses += parseFloat(data.cashOut) || 0;
                    }
                });

                document.getElementById('ledgerTotalPayments').innerText = `₹${tPayments.toFixed(2)}`;
                document.getElementById('ledgerTotalExpenses').innerText = `₹${tExpenses.toFixed(2)}`;
                document.getElementById('ledgerTotalOut').innerText = `₹${(tPayments + tExpenses).toFixed(2)}`;

                if (txnList.length === 0) {
                    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--text-muted);">No payment vouchers recorded yet.</td></tr>';
                    return;
                }

                txnList.sort((a, b) => new Date(b.data.date || 0) - new Date(a.data.date || 0));

                txnList.forEach((item) => {
                    const data = item.data;
                    const docId = item.id; 
                    window.txnDataCache[docId] = data;
                    
                    let typeBadge = data.type === 'Payment' ? '<span class="badge badge-payment">Payment</span>' : '<span class="badge badge-expense">Expense</span>';
                    let amountHtml = `<strong style="color: var(--danger);">- ₹${data.cashOut || 0}</strong>`;

                    const tr = document.createElement('tr');
                    tr.setAttribute("data-type", data.type.toLowerCase());
                    tr.setAttribute("data-date", data.date);
                    tr.setAttribute("data-search", `${data.name} ${data.txnId} ${data.notes} ${data.ref}`.toLowerCase());

                    tr.innerHTML = `
                        <td data-label="Date/ID"><strong>${data.date}</strong><br><span style="font-size:11px; color:var(--text-muted);">${data.txnId || '--'}</span></td>
                        <td data-label="Payee"><strong>${data.name}</strong></td>
                        <td data-label="Branch"><span style="font-size:12px; color:var(--primary); font-weight:600;">${data.branch || 'Unassigned'}</span></td>
                        <td data-label="Type">${typeBadge}<br><span style="font-size:12px; color:var(--text-muted);">${data.mode}</span></td>
                        <td data-label="Notes"><span style="font-size:12px;">Ref: ${data.ref || '--'}</span><br><span style="font-size:12px; color:var(--secondary);">${data.notes}</span></td>
                        <td data-label="Amount">${amountHtml}</td>
                        <td class="no-print" data-label="Actions" style="text-align: right;">
                            <div style="display:flex; gap: 8px; align-items:center; justify-content: flex-end;">
                                <span class="material-symbols-rounded" style="color: var(--primary); cursor: pointer; font-size: 20px;" title="Print Voucher" onclick="window.printVoucher('${data.txnId}', '${data.name}', '${data.date}', '${data.type}', '${data.mode}', '${data.cashOut}', '${data.notes}')">receipt_long</span>
                                <span class="material-symbols-rounded" style="color: var(--secondary); cursor: pointer; font-size: 18px;" title="Edit" onclick="window.editTxn('${docId}')">edit</span>
                                <span class="material-symbols-rounded" style="color: var(--danger); cursor: pointer; font-size: 18px;" title="Delete" onclick="window.deleteTxn('${docId}')">delete</span>
                            </div>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });
            } catch (error) { console.error("Firebase Read Error:", error); }
        };

        window.loadTransactions();

        window.filterTxnTable = function() {
            const typeQuery = document.getElementById("filterTxnType").value.toLowerCase();
            const dateFromQuery = document.getElementById("filterTxnDateFrom").value;
            const dateToQuery = document.getElementById("filterTxnDateTo").value;
            const textQuery = document.getElementById("txnSearchInput").value.toLowerCase();
            const trs = document.getElementById("txnTableBody").getElementsByTagName("tr");

            for (let i = 0; i < trs.length; i++) {
                if (trs[i].cells.length === 1) continue; 
                const rowType = trs[i].getAttribute("data-type");
                const rowDate = trs[i].getAttribute("data-date");
                const rowSearch = trs[i].getAttribute("data-search");

                let show = true;
                if (typeQuery && rowType !== typeQuery) show = false;
                if (dateFromQuery && rowDate < dateFromQuery) show = false;
                if (dateToQuery && rowDate > dateToQuery) show = false;
                if (textQuery && rowSearch.indexOf(textQuery) === -1) show = false;
                trs[i].style.display = show ? "" : "none";
            }
        }

        window.clearTxnFilters = function() {
            document.getElementById("filterTxnDateFrom").value = "";
            document.getElementById("filterTxnDateTo").value = "";
            document.getElementById("filterTxnType").value = "";
            document.getElementById("txnSearchInput").value = "";
            window.filterTxnTable();
        }

        window.printVoucher = function(txnId, name, date, type, mode, amount, notes) {
            const branchesText = window.allBranchesStringTxn || 'Mahe | Chokli | Panoor | Koothuparamba';
            const displayAmount = window.formatCorebiqCurrency
                ? window.formatCorebiqCurrency(amount)
                : `₹${(Number(amount) || 0).toFixed(2)}`;
            const win = window.open('', '_blank');
            win.document.write(`
                <html>
                <head>
                    <title>Payment Voucher - ${txnId}</title>
                    
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
                        <h2 style="margin:0; color: #EF4444; text-transform: uppercase;">Payment Voucher</h2>
                    </div>
                    <div class="row"><strong>Voucher No:</strong> ${txnId}</div>
                    <div class="row"><strong>Date:</strong> ${date}</div>
                    <div class="box">
                        <div class="row"><strong>Paid To:</strong> <span>${name}</span></div>
                        <div class="row"><strong>Payment Type:</strong> <span>${type}</span></div>
                        <div class="row"><strong>Payment Mode:</strong> <span>${mode}</span></div>
                        <div class="row" style="margin-top:10px; padding-top:10px; border-top:1px solid #eee;">
                            <strong>Particulars:</strong> <span style="text-align:right; max-width:60%;">${notes || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="amt">Amount Paid: ${displayAmount}</div>
                    <div style="margin-top: 60px; display: flex; justify-content: space-between;">
                        <div>_____________________<br>Authorized Signatory</div>
                        <div>_____________________<br>Receiver's Signature</div>
                    </div>
                    <div class="footer-text">Generated by COREBIQ</div>
                    <script>window.onload = function() { window.print(); }<\/script>
                </body>
                </html>
            `);
            win.document.close();
        }

        window.editTxn = function(docId) {
            const data = window.txnDataCache[docId];
            if(!data) return;
            document.getElementById('txnDocId').value = docId; 
            document.getElementById('txnIdDisplay').value = data.txnId; 
            document.getElementById('txnDate').value = data.date || '';
            document.getElementById('txnType').value = data.type || 'Payment';
            document.getElementById('patientName').value = data.name || '';
            document.getElementById('txnBranch').value = data.branch || '';
            document.getElementById('txnMode').value = data.mode || 'Cash';
            document.getElementById('txnRef').value = data.ref || '';
            document.getElementById('txnCashOut').value = data.cashOut || '';
            document.getElementById('txnNotes').value = data.notes || '';
            
            document.getElementById('saveTxnBtn').innerText = "Update Payment";
            const mc = document.getElementById('main-content');
            if(mc) mc.scrollTo({ top: 0, behavior: 'smooth' });
        }

        window.deleteTxn = async function(docId) {
            if(confirm("Are you sure you want to permanently delete this payment voucher?")) {
                try {
                    await deleteDoc(doc(db, "transactions", docId));
                    alert("Voucher deleted.");
                    window.loadTransactions();
                } catch(e) { alert("Error deleting transaction."); }
            }
        }

        window.resetTxnForm = function() {
            document.getElementById('transaction-form').reset();
            document.getElementById('txnDocId').value = ''; 
            document.getElementById('txnIdDisplay').value = 'Auto-Generated'; 
            document.getElementById('txnDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('saveTxnBtn').innerText = "Save Payment";
            if (window.currentUser && window.currentUser.role !== 'admin') {
                document.getElementById('txnBranch').value = window.currentUser.branch;
            }
        }

        window.saveTransaction = async function() {
            const saveBtn = document.getElementById('saveTxnBtn');
            const docId = document.getElementById('txnDocId').value; 
            
            const date = document.getElementById('txnDate').value;
            const type = document.getElementById('txnType').value;
            const branch = document.getElementById('txnBranch').value;
            const name = document.getElementById('patientName').value;
            const mode = document.getElementById('txnMode').value;
            const ref = document.getElementById('txnRef').value;
            const cashOut = document.getElementById('txnCashOut').value || 0;
            const notes = document.getElementById('txnNotes').value;

            if (!name || !date || !type || !branch || !cashOut) return alert("Required fields missing! Ensure amount is entered.");

            saveBtn.innerText = "Saving...";
            saveBtn.disabled = true;

            const payload = {
                date: date,
                type: type,
                branch: branch,
                mobile: "", // Not typically needed for vendor payments, but keeping field for schema consistency
                name: name,
                mode: mode,
                ref: ref,
                cashIn: 0, // Enforce 0 for payments out
                cashOut: parseFloat(cashOut),
                notes: notes,
                updatedAt: new Date()
            };

            try {
                if(docId) {
                    payload.txnId = document.getElementById('txnIdDisplay').value;
                    await updateDoc(doc(db, "transactions", docId), payload);
                    alert("Payment updated!");
                } else {
                    const now = new Date();
                    const dd = String(now.getDate()).padStart(2, '0');
                    const mm = String(now.getMonth() + 1).padStart(2, '0');
                    const yy = String(now.getFullYear()).slice(-2);
                    const hh = String(now.getHours()).padStart(2, '0');
                    const mins = String(now.getMinutes()).padStart(2, '0');
                    
                    payload.txnId = `TRN${dd}${mm}${yy}${hh}${mins}`;
                    payload.createdAt = now;
                    
                    await addDoc(collection(db, "transactions"), payload);
                    alert("Payment saved!");
                }
                window.resetTxnForm();
                window.loadTransactions();
            } catch (error) { console.error(error); alert("Failed to save."); }
            saveBtn.innerText = "Save Payment";
            saveBtn.disabled = false;
        }
