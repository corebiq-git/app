import { db } from "../../../js/firebase-config.js";
        import { collection, addDoc, query, where, getDocs, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

        const formatReceiptMoney = value => window.formatCorebiqCurrency
            ? window.formatCorebiqCurrency(value)
            : `₹${(Number(value) || 0).toFixed(2)}`;
        window.txnDataCache = {};
        window.allBranchesStringTxn = "";

        document.getElementById("txnDate").value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

        window.toggleAmtFields = function(selectEl) {
            if(selectEl.value === 'Sales') {
                document.getElementById('cashInContainer').style.display = 'none';
                document.getElementById('cashOutContainer').style.display = 'block';
                document.getElementById('txnCashIn').value = '';
            } else {
                document.getElementById('cashOutContainer').style.display = 'none';
                document.getElementById('cashInContainer').style.display = 'block';
                document.getElementById('txnCashOut').value = '';
            }
        };

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

        window.verifyTxnMobile = async function() {
            const mobile = document.getElementById('mobileInput').value;
            const btn = document.getElementById('verifyTxnBtn');
            const dash = document.getElementById('patientSummaryDash');
            if (mobile.length !== 10) return alert("Enter 10-digit mobile number.");
            
            btn.innerText = "...";
            try {
                const pSnap = await getDocs(query(collection(db, "patients"), where("mobile", "==", mobile)));
                if (!pSnap.empty) document.getElementById('patientName').value = pSnap.docs[0].data().name;
                else { alert("No patient found. Type name manually."); dash.style.display = 'none'; }

                const tSnap = await getDocs(query(collection(db, "transactions"), where("mobile", "==", mobile)));
                if(!tSnap.empty) {
                    let tBilled = 0; let tPaid = 0;
                    tSnap.forEach(d => {
                        const rec = d.data();
                        tBilled += parseFloat(rec.cashOut) || 0; // Sales logged as cashOut
                        tPaid += parseFloat(rec.cashIn) || 0;    // Receipts logged as cashIn
                    });
                    const tPending = tBilled - tPaid;
                    document.getElementById('dashTotalBilled').innerText = `₹${tBilled.toFixed(2)}`;
                    document.getElementById('dashTotalPaid').innerText = `₹${tPaid.toFixed(2)}`;
                    document.getElementById('dashTotalPending').innerText = `₹${tPending.toFixed(2)}`;
                    
                    if(tPending > 0) {
                        document.getElementById('txnType').value = 'Receipt';
                        window.toggleAmtFields(document.getElementById('txnType'));
                        document.getElementById('txnCashIn').value = tPending.toFixed(2);
                        document.getElementById('txnNotes').value = "Clearing pending dues";
                    }
                    dash.style.display = 'flex';
                } else dash.style.display = 'none';
            } catch(e) { console.error(e); }
            btn.innerText = "Search";
        }

        window.loadTransactions = async function() {
            const tableBody = document.getElementById('txnTableBody');
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Loading receipt vouchers...</td></tr>';

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
                let tSales = 0;
                let tReceipts = 0;

                querySnapshot.forEach(doc => {
                    const data = doc.data();
                    // FILTER SPECIFIC TO RECEIPTS & SALES
                    if(data.type === 'Receipt' || data.type === 'Sales') {
                        txnList.push({ id: doc.id, data: data });
                        if(data.type === 'Sales') tSales += parseFloat(data.cashOut) || 0;
                        if(data.type === 'Receipt') tReceipts += parseFloat(data.cashIn) || 0;
                    }
                });

                document.getElementById('ledgerTotalBilled').innerText = `₹${tSales.toFixed(2)}`;
                document.getElementById('ledgerTotalCollected').innerText = `₹${tReceipts.toFixed(2)}`;
                document.getElementById('ledgerTotalPending').innerText = `₹${(tSales - tReceipts).toFixed(2)}`;

                if (txnList.length === 0) {
                    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: var(--text-muted);">No receipts or sales recorded yet.</td></tr>';
                    return;
                }

                txnList.sort((a, b) => new Date(b.data.date || 0) - new Date(a.data.date || 0));

                txnList.forEach((item) => {
                    const data = item.data;
                    const docId = item.id; 
                    window.txnDataCache[docId] = data;
                    
                    let typeBadge = data.type === 'Receipt' ? '<span class="badge badge-receipt">Receipt</span>' : '<span class="badge badge-sales">Sales</span>';
                    
                    let amountHtml = '';
                    if(data.type === 'Receipt') amountHtml = `<strong style="color: var(--success);">+ ₹${data.cashIn || 0}</strong>`;
                    else amountHtml = `<strong style="color: #274777;">Billed: ₹${data.cashOut || 0}</strong>`;

                    const receiptAmount = window.formatCorebiqCurrency
                        ? window.formatCorebiqCurrency(data.cashIn || data.cashOut)
                        : `₹${data.cashIn || data.cashOut}`;
                    const waText = encodeURIComponent(`Hello ${data.name}, your payment receipt for ${receiptAmount} has been successfully processed at STRA CARE. Thank you!`);

                    const tr = document.createElement('tr');
                    tr.setAttribute("data-type", data.type.toLowerCase());
                    tr.setAttribute("data-date", data.date);
                    tr.setAttribute("data-search", `${data.name} ${data.mobile} ${data.txnId} ${data.ref}`.toLowerCase());

                    tr.innerHTML = `
                        <td data-label="Date/ID"><strong>${data.date}</strong><br><span style="font-size:11px; color:var(--text-muted);">${data.txnId || '--'}</span></td>
                        <td data-label="Client">
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
                            <div style="display:flex; gap: 8px; align-items:center; justify-content: flex-end;">
                                <span class="material-symbols-rounded" style="color: #8B5CF6; cursor: pointer; font-size: 20px;" title="Print Statement Ledger" onclick="window.printPatientStatement('${data.mobile}', '${data.name}')">account_box</span>
                                <span class="material-symbols-rounded" style="color: var(--primary); cursor: pointer; font-size: 20px;" title="Print Receipt" onclick="window.printReceipt('${data.txnId}', '${data.name}', '${data.date}', '${data.type}', '${data.mode}', '${data.cashIn}', '${data.cashOut}')">receipt_long</span>
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

        window.printReceipt = function(txnId, name, date, type, mode, cashIn, cashOut) {
            const amount = parseFloat(cashIn) > 0 ? cashIn : cashOut;
            const title = type === 'Sales' ? 'Invoice / Bill' : 'Payment Receipt';
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
                        <h2 style="margin:0; color: #10B981; text-transform: uppercase;">${title}</h2>
                    </div>
                    <div class="row"><strong>Voucher No:</strong> ${txnId}</div>
                    <div class="row"><strong>Date:</strong> ${date}</div>
                    <div class="box">
                        <div class="row"><strong>Received From:</strong> <span>${name}</span></div>
                        <div class="row"><strong>Voucher Type:</strong> <span>${type}</span></div>
                        <div class="row"><strong>Payment Mode:</strong> <span>${mode}</span></div>
                    </div>
                    <div class="amt">Amount: ${formatReceiptMoney(amount)}</div>
                    <div style="margin-top: 60px; display: flex; justify-content: space-between;">
                        <div>_____________________<br>Authorized Signatory</div>
                        <div>_____________________<br>Customer / Payer</div>
                    </div>
                    <div class="footer-text">Generated by COREBIQ</div>
                    <script>window.onload = function() { window.print(); }<\/script>
                </body>
                </html>
            `);
            win.document.close();
        }

        window.printPatientStatement = async function(mobile, name) {
            if(!mobile || mobile === "undefined") return alert("Cannot generate statement. Invalid mobile number.");
            try {
                const q = query(collection(db, "transactions"), where("mobile", "==", mobile));
                const snap = await getDocs(q);
                let txns = [];
                let totalBilled = 0; let totalPaid = 0;
                
                snap.forEach(doc => {
                    let d = doc.data(); txns.push(d);
                    totalBilled += parseFloat(d.cashOut) || 0; 
                    totalPaid += parseFloat(d.cashIn) || 0;    
                });
                
                if (txns.length === 0) return alert("No transaction history found.");
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
                        <td style="text-align:right;">${t.cashOut > 0 ? formatReceiptMoney(t.cashOut) : '-'}</td>
                        <td style="text-align:right; color: #10B981;">${t.cashIn > 0 ? formatReceiptMoney(t.cashIn) : '-'}</td>
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
                            <h2 style="margin: 0; color: #10B981; text-transform: uppercase;">Statement of Account</h2>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                            <div>
                                <strong>Client Name:</strong> <span style="font-size: 16px;">${name}</span><br>
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
                            <tbody>${tbody}</tbody>
                        </table>
                        <div class="summary">
                            <div class="summary-row"><span>Total Services Billed:</span> <span>${formatReceiptMoney(totalBilled)}</span></div>
                            <div class="summary-row"><span>Total Payments Received:</span> <span style="color: #10B981;">${formatReceiptMoney(totalPaid)}</span></div>
                            <div class="summary-row total"><span>Total Pending Dues:</span> <span>${formatReceiptMoney(balancePending)}</span></div>
                        </div>
                        <div class="footer-text">Generated by COREBIQ</div>
                        <script>window.onload = function() { window.print(); }<\/script>
                    </body>
                    </html>
                `);
                win.document.close();
            } catch(e) { console.error(e); alert("Error generating statement."); }
        }

        window.editTxn = function(docId) {
            const data = window.txnDataCache[docId];
            if(!data) return;
            document.getElementById('txnDocId').value = docId; 
            document.getElementById('txnIdDisplay').value = data.txnId; 
            document.getElementById('txnDate').value = data.date || '';
            document.getElementById('txnType').value = data.type || 'Receipt';
            window.toggleAmtFields(document.getElementById('txnType'));
            document.getElementById('mobileInput').value = data.mobile || '';
            document.getElementById('patientName').value = data.name || '';
            document.getElementById('txnBranch').value = data.branch || '';
            document.getElementById('txnMode').value = data.mode || 'Cash';
            document.getElementById('txnRef').value = data.ref || '';
            document.getElementById('txnCashIn').value = data.cashIn || '';
            document.getElementById('txnCashOut').value = data.cashOut || '';
            document.getElementById('txnNotes').value = data.notes || '';
            
            document.getElementById('saveTxnBtn').innerText = "Update Receipt";
            const mc = document.getElementById('main-content');
            if(mc) mc.scrollTo({ top: 0, behavior: 'smooth' });
        }

        window.deleteTxn = async function(docId) {
            if(confirm("Are you sure you want to permanently delete this receipt voucher?")) {
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
            document.getElementById('txnDate').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
            document.getElementById('saveTxnBtn').innerText = "Save Receipt";
            document.getElementById('patientSummaryDash').style.display = 'none';
            window.toggleAmtFields(document.getElementById('txnType'));
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
            const mobile = document.getElementById('mobileInput').value;
            const name = document.getElementById('patientName').value;
            const mode = document.getElementById('txnMode').value;
            const ref = document.getElementById('txnRef').value;
            
            // Depends on Type selected
            const cashIn = type === 'Receipt' ? (document.getElementById('txnCashIn').value || 0) : 0;
            const cashOut = type === 'Sales' ? (document.getElementById('txnCashOut').value || 0) : 0;
            
            const notes = document.getElementById('txnNotes').value;

            if (!name || !date || !type || !branch) return alert("Required fields missing!");
            if (type === 'Receipt' && !cashIn) return alert("Please enter the Amount Received.");
            if (type === 'Sales' && !cashOut) return alert("Please enter the Amount Billed.");

            saveBtn.innerText = "Saving...";
            saveBtn.disabled = true;

            const payload = {
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
                    await updateDoc(doc(db, "transactions", docId), payload);
                    alert("Receipt updated!");
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
                    alert("Receipt saved!");
                }
                window.resetTxnForm();
                window.loadTransactions();
            } catch (error) { console.error(error); alert("Failed to save."); }
            saveBtn.innerText = "Save Receipt";
            saveBtn.disabled = false;
        }
