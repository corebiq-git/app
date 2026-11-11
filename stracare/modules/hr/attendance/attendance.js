import { db } from "../../../js/firebase-config.js";
        import { reserveNextDocumentIds } from "../../../js/document-ids.js";
        import { chunkValues, legacyDateValues, normalizeDateKey } from "../../../js/date-utils.js";
        import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
        
        window.attDataCache = {};
        let allEmployees = [];
        const attendanceMonthCache = new Map();
        let attendanceLogLoadVersion = 0;
        let monthlyReportVersion = 0;
        let bulkAttendanceLoadVersion = 0;

        function attendanceRecordKey(data, fallbackId) {
            if (!data.empId || !data.date) return fallbackId;
            return `${data.empType || ''}:${data.empId}:${normalizeDateKey(data.date) || data.date}`;
        }

        function employeeIds(employee) {
            return new Set([employee.id, ...(employee.legacyIds || [])].filter(Boolean).map(String));
        }

        function findAttendanceEmployee(empId, empType, branch, empName = '') {
            const id = String(empId || '');
            const candidates = allEmployees.filter(employee =>
                employee.type === empType
                && (!branch || normalizeAttendanceBranch(employee.branch) === normalizeAttendanceBranch(branch))
            );
            const matchedId = candidates.find(employee => employeeIds(employee).has(id));
            if (matchedId) return matchedId;
            const normalizedName = String(empName || '').trim().toLocaleLowerCase();
            if (!normalizedName) return null;
            const nameMatches = candidates.filter(employee =>
                String(employee.name || '').trim().toLocaleLowerCase() === normalizedName
            );
            return nameMatches.length === 1 ? nameMatches[0] : null;
        }

        function attendanceEmployeeKey(data) {
            const employee = findAttendanceEmployee(data.empId, data.empType, data.branch, data.empName);
            return `${data.empType || ''}:${employee?.id || data.empId || ''}`;
        }

        function timestampValue(value) {
            if (value && typeof value.toMillis === 'function') return value.toMillis();
            const parsed = value instanceof Date ? value.getTime() : Date.parse(value || '');
            return Number.isFinite(parsed) ? parsed : 0;
        }

        function deduplicateAttendance(records) {
            const recordsByKey = new Map();
            records.forEach(record => {
                const key = attendanceRecordKey(record.data, record.id);
                const existing = recordsByKey.get(key);
                const recordTime = timestampValue(record.data.updatedAt) || timestampValue(record.data.createdAt);
                const existingTime = existing
                    ? timestampValue(existing.data.updatedAt) || timestampValue(existing.data.createdAt)
                    : -1;
                if (!existing || recordTime >= existingTime) recordsByKey.set(key, record);
            });
            return Array.from(recordsByKey.values());
        }

        function normalizeAttendanceBranch(value) {
            return String(value || '').trim().toLocaleLowerCase();
        }

        function getAttendanceMonth(monthValue) {
            const cacheKey = `${monthValue}:${isAdmin ? 'all' : currentUserBranch}`;
            if (attendanceMonthCache.has(cacheKey)) return attendanceMonthCache.get(cacheKey);

            const [year, month] = monthValue.split('-').map(Number);
            const paddedMonth = String(month).padStart(2, '0');
            const firstDay = `${year}-${paddedMonth}-01`;
            const lastDay = `${year}-${paddedMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
            const constraints = [];
            if (!isAdmin) constraints.push(where('branch', '==', currentUserBranch));
            constraints.push(where('date', '>=', firstDay), where('date', '<=', lastDay));

            const requests = [getDocs(query(collection(db, 'daily_attendance'), ...constraints))];
            chunkValues(legacyDateValues(firstDay, lastDay)).forEach(dateChunk => {
                requests.push(getDocs(query(
                    collection(db, 'daily_attendance'),
                    ...(!isAdmin ? [where('branch', '==', currentUserBranch)] : []),
                    where('date', 'in', dateChunk)
                )));
            });
            const monthRequest = Promise.all(requests)
                .catch(error => {
                    if (isAdmin || error?.code !== 'failed-precondition') throw error;
                    console.warn('Attendance date index unavailable; falling back to the assigned-branch query.', error);
                    return getDocs(query(
                        collection(db, 'daily_attendance'),
                        where('branch', '==', currentUserBranch)
                    )).then(snapshot => [snapshot]);
                })
                .then(snapshots => {
                    const records = new Map();
                    snapshots.forEach(snapshot => snapshot.docs.forEach(docSnap => {
                        records.set(docSnap.id, { id: docSnap.id, data: docSnap.data() });
                    }));
                    return deduplicateAttendance([...records.values()].filter(record => {
                        const date = normalizeDateKey(record.data.date);
                        return date >= firstDay && date <= lastDay;
                    }));
                });
            attendanceMonthCache.set(cacheKey, monthRequest);
            monthRequest.catch(() => {
                if (attendanceMonthCache.get(cacheKey) === monthRequest) {
                    attendanceMonthCache.delete(cacheKey);
                }
            });
            return monthRequest;
        }

        function invalidateAttendanceMonthCache() {
            attendanceMonthCache.clear();
        }

        // Formatting Helpers
        window.formatDateToDDMMMYYYY = function(dateStr) {
            if(!dateStr) return '';
            const dateKey = normalizeDateKey(dateStr);
            if(!dateKey) return dateStr;
            const parts = dateKey.split('-');
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const day = parts[2];
            const month = months[parseInt(parts[1], 10) - 1];
            const year = parts[0];
            return `${day} ${month} ${year}`;
        }

        // --- UI Modal Controls ---
        window.openAttModal = function() {
            document.getElementById('attModal').style.display = 'flex';
        }
        window.closeAttModal = function() {
            document.getElementById('attModal').style.display = 'none';
            window.resetAttForm();
        }
        window.openLeaveModal = function() {
            document.getElementById('leaveModal').style.display = 'flex';
            document.getElementById('leaveDate').value = new Date().toISOString().split('T')[0];
        }
        window.closeLeaveModal = function() {
            document.getElementById('leaveModal').style.display = 'none';
            document.getElementById('leave-form').reset();
        }

        // Set Default Date to Today
        const now = new Date();
        const todayString = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        document.getElementById("attDate").value = todayString;
        document.getElementById("filterAttMonth").value = todayString.slice(0, 7);

        // Ensure Admin UI checks
        const isAdmin = window.currentUser?.role === 'admin';
        const currentUserBranch = String(window.currentUser?.branch || '').trim();
        const canAccessAttendance = isAdmin || Boolean(window.currentUser && currentUserBranch && currentUserBranch !== 'Unknown');
        if (!isAdmin) {
            const style = document.createElement('style');
            style.innerHTML = `.admin-only-col { display: none !important; }`;
            document.head.appendChild(style);
        }

        function canManageAttendanceRecord(data) {
            return isAdmin || (canAccessAttendance && data?.branch === currentUserBranch);
        }

        function escapeAttendanceText(value) {
            return String(value).replace(/[&<>"']/g, character => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]);
        }

        // --- 1. LOAD DROPDOWNS (WITH RBAC) ---
        window.loadDropdowns = async function() {
            try {
                if (!canAccessAttendance) {
                    throw new Error('Your account does not have an assigned branch for attendance access.');
                }
                const branchSelect = document.getElementById('attBranch');
                const leaveBranchSelect = document.getElementById('leaveBranch');
                const filterBranchSelect = document.getElementById('filterAttBranch');
                const reportBranchSelect = document.getElementById('reportBranch');
                const bulkBranchSelect = document.getElementById('bulkAttendanceBranch');
                let branchesRequest = Promise.resolve(null);

                if (!isAdmin) {
                    [branchSelect, leaveBranchSelect, filterBranchSelect, reportBranchSelect].forEach((select, index) => {
                        select.replaceChildren(new Option(currentUserBranch, currentUserBranch));
                        select.disabled = true;
                        if (index < 2) select.style.background = 'var(--grey-med)';
                    });
                    bulkBranchSelect.replaceChildren(new Option(currentUserBranch, currentUserBranch));
                    bulkBranchSelect.disabled = true;
                } else {
                    branchesRequest = getDocs(query(collection(db, "branches"), orderBy("name")));
                }

                let tQuery = collection(db, "therapists");
                let sQuery = collection(db, "staff");

                if (!isAdmin) {
                    tQuery = query(collection(db, "therapists"), where("branch", "==", currentUserBranch));
                    sQuery = query(collection(db, "staff"), where("branch", "==", currentUserBranch));
                }

                const [bSnap, tSnap, sSnap] = await Promise.all([
                    branchesRequest,
                    getDocs(tQuery),
                    getDocs(sQuery)
                ]);

                if (bSnap) {
                    let bHtml = '<option value="">Select Branch</option>';
                    let fHtml = '<option value="">All Branches</option>';
                    bSnap.forEach(branchDoc => {
                        const bName = branchDoc.data().name;
                        bHtml += `<option value="${bName}">${bName}</option>`;
                        fHtml += `<option value="${bName}">${bName}</option>`;
                    });
                    branchSelect.innerHTML = bHtml;
                    leaveBranchSelect.innerHTML = bHtml;
                    filterBranchSelect.innerHTML = fHtml;
                    reportBranchSelect.innerHTML = fHtml;
                    bulkBranchSelect.innerHTML = bHtml;
                }

                allEmployees = [];
                tSnap.forEach(doc => allEmployees.push({
                    id: doc.id,
                    legacyIds: [doc.data().id, doc.data().therapistId],
                    name: doc.data().name,
                    type: 'Therapist',
                    branch: doc.data().branch
                }));
                sSnap.forEach(doc => allEmployees.push({
                    id: doc.id,
                    legacyIds: [doc.data().id, doc.data().empId],
                    name: doc.data().name,
                    type: 'Staff',
                    branch: doc.data().branch
                }));
                allEmployees.sort((a, b) => a.name.localeCompare(b.name));

                let empHtml = '<option value="">Select Employee</option>';
                allEmployees.forEach(emp => {
                    empHtml += `<option value="${emp.id}" data-name="${emp.name}" data-type="${emp.type}" data-branch="${emp.branch}">${emp.name} (${emp.type})</option>`;
                });
                
                document.getElementById('attEmployee').innerHTML = empHtml;
                document.getElementById('leaveEmployee').innerHTML = empHtml;

            } catch(e) {
                console.error("Error loading attendance dropdowns:", e);
                throw e;
            }
        };

        window.handleEmployeeSelect = function() {
            const select = document.getElementById('attEmployee');
            const selectedOption = select.options[select.selectedIndex];
            if(selectedOption && selectedOption.value && isAdmin) {
                const empBranch = selectedOption.getAttribute('data-branch');
                if(empBranch) document.getElementById('attBranch').value = empBranch;
            }
        };

        window.openBulkAttendance = async function() {
            if (!canAccessAttendance) return alert('Your account does not have an assigned branch for attendance access.');
            if (!allEmployees.length) return alert('The staff and therapist directory is not loaded yet. Please try again.');
            const dateInput = document.getElementById('bulkAttendanceDate');
            dateInput.value = todayString;
            document.getElementById('bulkAttendanceBranch').value = isAdmin ? '' : currentUserBranch;
            document.getElementById('bulkAttendanceMessage').textContent = 'Choose a date and branch. Previous dates are allowed.';
            document.getElementById('bulkAttendanceModal').style.display = 'flex';
            await window.renderBulkAttendance();
        };

        window.closeBulkAttendance = function() {
            bulkAttendanceLoadVersion++;
            document.getElementById('bulkAttendanceModal').style.display = 'none';
        };

        window.renderBulkAttendance = async function() {
            const requestVersion = ++bulkAttendanceLoadVersion;
            const date = document.getElementById('bulkAttendanceDate').value;
            const branch = document.getElementById('bulkAttendanceBranch').value;
            const body = document.getElementById('bulkAttendanceBody');
            const message = document.getElementById('bulkAttendanceMessage');
            body.innerHTML = '<tr><td colspan="3" style="text-align:center;">Loading attendance...</td></tr>';
            if (!date || !branch) {
                body.innerHTML = '<tr><td colspan="3" style="text-align:center;">Choose a date and branch.</td></tr>';
                message.textContent = isAdmin && !branch ? 'Select a branch to show its staff and therapists.' : 'Select a date.';
                return;
            }

            const employees = allEmployees
                .filter(employee => normalizeAttendanceBranch(employee.branch) === normalizeAttendanceBranch(branch))
                .sort((left, right) => left.name.localeCompare(right.name));
            if (!employees.length) {
                body.innerHTML = '<tr><td colspan="3" style="text-align:center;">No staff or therapists are assigned to this branch in the directory.</td></tr>';
                message.textContent = 'Check the Staff and Therapist directories and confirm their branch is set to the selected branch.';
                return;
            }

            try {
                const monthRecords = await getAttendanceMonth(date.slice(0, 7));
                if (requestVersion !== bulkAttendanceLoadVersion) return;
                const existingByEmployee = new Map();
                monthRecords.forEach(record => {
                    if (normalizeDateKey(record.data.date) === date && normalizeAttendanceBranch(record.data.branch) === normalizeAttendanceBranch(branch)) {
                        existingByEmployee.set(attendanceEmployeeKey(record.data), record);
                    }
                });
                body.innerHTML = employees.map(employee => {
                    const existing = existingByEmployee.get(`${employee.type}:${employee.id}`)?.data;
                    const status = ['Present', 'Leave', 'Half-Day'].includes(existing?.status) ? existing.status : '';
                    return `<tr>
                        <td>${escapeAttendanceText(employee.name || '')}</td>
                        <td>${escapeAttendanceText(employee.type)}</td>
                        <td><select class="form-input bulk-attendance-status" data-employee-id="${escapeAttendanceText(employee.id)}" data-employee-type="${escapeAttendanceText(employee.type)}" aria-label="Attendance status for ${escapeAttendanceText(employee.name || '')}">
                            <option value=""${status ? '' : ' selected'}>Select P / L / H</option>
                            <option value="Present"${status === 'Present' ? ' selected' : ''}>P - Present</option>
                            <option value="Leave"${status === 'Leave' ? ' selected' : ''}>L - Leave</option>
                            <option value="Half-Day"${status === 'Half-Day' ? ' selected' : ''}>H - Half-Day</option>
                        </select></td>
                    </tr>`;
                }).join('');
                const staffCount = employees.filter(employee => employee.type === 'Staff').length;
                const therapistCount = employees.filter(employee => employee.type === 'Therapist').length;
                message.textContent = `${staffCount} staff and ${therapistCount} therapists listed for ${branch}. Only directory records assigned to this exact branch are included. Existing attendance marks are preselected.`;
            } catch (error) {
                if (requestVersion !== bulkAttendanceLoadVersion) return;
                console.error('Unable to load attendance for bulk posting:', error);
                body.innerHTML = '<tr><td colspan="3" role="alert" style="text-align:center;color:var(--danger);">Unable to load saved attendance for this date.</td></tr>';
                message.textContent = error?.message || 'Check attendance access and try again.';
            }
        };

        window.submitBulkAttendance = async function() {
            const button = document.getElementById('submitBulkAttendanceBtn');
            const date = document.getElementById('bulkAttendanceDate').value;
            const branch = document.getElementById('bulkAttendanceBranch').value;
            const statuses = [...document.querySelectorAll('#bulkAttendanceBody .bulk-attendance-status')];
            if (!date || !branch) return alert('Select an attendance date and branch.');
            if (!statuses.length) return alert('No staff or therapists are available for this branch.');
            const missing = statuses.filter(select => !select.value);
            if (missing.length) {
                const firstMissing = missing[0].closest('tr')?.cells[0]?.textContent || 'an employee';
                return alert(`Select P, L, or H for every employee. Missing: ${firstMissing}${missing.length > 1 ? ` and ${missing.length - 1} more` : ''}.`);
            }

            button.disabled = true;
            button.textContent = 'Submitting...';
            let savedCount = 0;
            try {
                const monthRecords = await getAttendanceMonth(date.slice(0, 7));
                const existingByEmployee = new Map();
                monthRecords.forEach(record => {
                    if (normalizeDateKey(record.data.date) === date && normalizeAttendanceBranch(record.data.branch) === normalizeAttendanceBranch(branch)) {
                        existingByEmployee.set(attendanceEmployeeKey(record.data), record);
                    }
                });
                const newRecordCount = statuses.filter(select => {
                    const employee = allEmployees.find(item =>
                        item.id === select.dataset.employeeId
                        && item.type === select.dataset.employeeType
                        && normalizeAttendanceBranch(item.branch) === normalizeAttendanceBranch(branch)
                    );
                    return employee && !existingByEmployee.has(`${employee.type}:${employee.id}`);
                }).length;
                const newRecordIds = newRecordCount
                    ? await reserveNextDocumentIds(db, 'daily_attendance', 'ATT', newRecordCount, isAdmin)
                    : [];
                let nextNewRecordId = 0;
                const writes = statuses.map(select => {
                    const employee = allEmployees.find(item =>
                        item.id === select.dataset.employeeId
                        && item.type === select.dataset.employeeType
                        && normalizeAttendanceBranch(item.branch) === normalizeAttendanceBranch(branch)
                    );
                    if (!employee) throw new Error('The staff directory changed. Reload attendance and try again.');
                    const existingRecord = existingByEmployee.get(`${employee.type}:${employee.id}`);
                    const existing = existingRecord?.data;
                    const attendanceId = existingRecord?.id || newRecordIds[nextNewRecordId++];
                    return {
                        ref: doc(db, 'daily_attendance', attendanceId),
                        data: {
                            id: attendanceId,
                            date,
                            empId: employee.id,
                            empName: employee.name,
                            empType: employee.type,
                            branch,
                            status: select.value,
                            notes: existing?.notes || '',
                            createdAt: existing?.createdAt || new Date(),
                            updatedAt: new Date()
                        }
                    };
                });
                for (let offset = 0; offset < writes.length; offset += 450) {
                    const batch = writeBatch(db);
                    writes.slice(offset, offset + 450).forEach(write => batch.set(write.ref, write.data, { merge: true }));
                    await batch.commit();
                    savedCount += Math.min(450, writes.length - offset);
                }
                invalidateAttendanceMonthCache();
                window.closeBulkAttendance();
                try {
                    await Promise.all([window.loadAttendanceLog(), window.generateMonthlyReport()]);
                } catch (refreshError) {
                    console.error('Bulk attendance was saved, but the attendance views could not be refreshed:', refreshError);
                    alert(`Attendance was saved for ${savedCount} employees, but the views could not be refreshed. Reload the page to see the records.`);
                    return;
                }
                alert(`Attendance submitted for ${savedCount} employees on ${window.formatDateToDDMMMYYYY(date)}.`);
            } catch (error) {
                console.error('Bulk attendance submit failed:', error);
                alert(savedCount
                    ? `Attendance was submitted for ${savedCount} employees before an error occurred. ${error?.message || error?.code || 'Unknown error'}`
                    : `Failed to submit bulk attendance: ${error?.message || error?.code || 'Unknown error'}`);
            } finally {
                button.disabled = false;
                button.textContent = 'Submit Attendance';
            }
        };

        window.handleLeaveEmployeeSelect = function() {
            const select = document.getElementById('leaveEmployee');
            const selectedOption = select.options[select.selectedIndex];
            if(selectedOption && selectedOption.value && isAdmin) {
                const empBranch = selectedOption.getAttribute('data-branch');
                if(empBranch) document.getElementById('leaveBranch').value = empBranch;
            }
        };

        // --- 2. LEAVE REQUESTS LOGIC ---
        window.submitLeaveRequest = async function() {
            const btn = document.getElementById('submitLeaveBtn');
            const date = document.getElementById('leaveDate').value;
            const selectEmp = document.getElementById('leaveEmployee');
            const empId = selectEmp.value;
            const branch = document.getElementById('leaveBranch').value;
            const reason = document.getElementById('leaveReason').value;

            if(!date || !empId || !branch || !reason) {
                return alert("All fields are required to submit a leave request.");
            }

            const empName = selectEmp.options[selectEmp.selectedIndex].getAttribute('data-name');
            const empType = selectEmp.options[selectEmp.selectedIndex].getAttribute('data-type');

            btn.innerText = 'Submitting...';
            btn.disabled = true;

            const payload = {
                date: date, empId: empId, empName: empName, empType: empType, branch: branch, reason: reason,
                status: 'Pending', createdAt: new Date()
            };

            try {
                await addDoc(collection(db, "leave_requests"), payload);
                alert("Leave request submitted successfully.");
                window.closeLeaveModal();
                window.loadLeaveRequests();
            } catch(e) {
                alert("Failed to submit request.");
            }

            btn.innerText = 'Submit Request';
            btn.disabled = false;
        }

        window.loadLeaveRequests = async function() {
            const tableBody = document.getElementById('leaveReqBody');
            try {
                let q;
                if (!isAdmin) {
                    q = query(collection(db, "leave_requests"), where("branch", "==", window.currentUser.branch));
                } else {
                    q = collection(db, "leave_requests");
                }
                
                const snap = await getDocs(q);
                tableBody.innerHTML = '';
                
                if(snap.empty) {
                    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: var(--text-muted);">No leave requests found.</td></tr>';
                    return;
                }

                let reqs = [];
                snap.forEach(docSnap => reqs.push({id: docSnap.id, data: docSnap.data()}));
                reqs.sort((a,b) => new Date(b.data.date) - new Date(a.data.date));

                reqs.forEach(req => {
                    const data = req.data;
                    let badgeCls = 'badge-pending';
                    if(data.status === 'Approved') badgeCls = 'badge-present';
                    if(data.status === 'Rejected') badgeCls = 'badge-rejected';

                    let actionsHtml = '--';
                    if (isAdmin && data.status === 'Pending') {
                        actionsHtml = `
                            <button class="btn-outline" style="padding: 4px 8px; font-size: 11px; border-color: var(--success); color: var(--success);" onclick="window.approveLeave('${req.id}', '${data.date}', '${data.empId}', '${data.empName}', '${data.empType}', '${data.branch}', '${data.reason}')">Approve</button>
                            <button class="btn-outline" style="padding: 4px 8px; font-size: 11px; border-color: var(--danger); color: var(--danger); margin-left: 4px;" onclick="window.rejectLeave('${req.id}')">Reject</button>
                        `;
                    }

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td data-label="Date"><strong>${window.formatDateToDDMMMYYYY(data.date)}</strong></td>
                        <td data-label="Employee"><strong>${data.empName}</strong><br><span style="font-size: 11px; color: var(--text-muted);">${data.empType}</span></td>
                        <td data-label="Branch">${data.branch}</td>
                        <td data-label="Reason">${data.reason}</td>
                        <td data-label="Status"><span class="badge ${badgeCls}">${data.status}</span></td>
                        <td class="no-print admin-only-col" data-label="Actions" style="text-align: right;">${actionsHtml}</td>
                    `;
                    tableBody.appendChild(tr);
                });
            } catch(e) {
                console.error("Error loading leave requests:", e);
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: var(--danger);">Error loading leave requests.</td></tr>';
            }
        }

        window.approveLeave = async function(reqId, rDate, rEmpId, rEmpName, rEmpType, rBranch, rReason) {
            if(!confirm(`Approve leave for ${rEmpName} on ${rDate}?`)) return;
            try {
                const monthRecords = await getAttendanceMonth(rDate.slice(0, 7));
                const existingRecord = monthRecords.find(record =>
                    normalizeDateKey(record.data.date) === rDate
                    && record.data.empType === rEmpType
                    && normalizeAttendanceBranch(record.data.branch) === normalizeAttendanceBranch(rBranch)
                    && attendanceEmployeeKey(record.data) === attendanceEmployeeKey({
                        empId: rEmpId, empType: rEmpType, empName: rEmpName, branch: rBranch
                    })
                );
                const employee = findAttendanceEmployee(rEmpId, rEmpType, rBranch, rEmpName);
                const linkedEmployeeId = employee?.id || rEmpId;
                const attendanceId = existingRecord?.id || (
                    await reserveNextDocumentIds(db, 'daily_attendance', 'ATT', 1, isAdmin)
                )[0];
                const batch = writeBatch(db);
                batch.update(doc(db, "leave_requests", reqId), { status: 'Approved' });
                batch.set(doc(db, "daily_attendance", attendanceId), {
                    id: attendanceId,
                    date: rDate, empId: linkedEmployeeId, empName: rEmpName, empType: rEmpType, branch: rBranch,
                    status: 'Leave', notes: 'Approved Leave: ' + rReason, createdAt: new Date(), updatedAt: new Date()
                }, { merge: true });
                await batch.commit();

                alert("Leave approved and attendance marked.");
                invalidateAttendanceMonthCache();
                await Promise.all([
                    window.loadLeaveRequests(),
                    window.loadAttendanceLog(),
                    window.generateMonthlyReport()
                ]);
            } catch(e) {
                console.error("Error approving leave:", e);
                alert("Failed to approve leave.");
            }
        }

        window.rejectLeave = async function(reqId) {
            if(!confirm("Reject this leave request?")) return;
            try {
                await updateDoc(doc(db, "leave_requests", reqId), { status: 'Rejected' });
                window.loadLeaveRequests();
            } catch(e) {
                alert("Failed to reject leave.");
            }
        }

        // --- 3. MONTHLY REPORT LOGIC (DEFAULT ON LOAD) ---
        window.initializeMonthlyMatrix = function() {
            const d = new Date();
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            document.getElementById('reportMonth').value = `${yyyy}-${mm}`;
            return window.generateMonthlyReport();
        }

        window.generateMonthlyReport = async function() {
            const requestVersion = ++monthlyReportVersion;
            const monthVal = document.getElementById('reportMonth').value; // YYYY-MM
            const branchFilter = document.getElementById('reportBranch').value.toLowerCase();
            
            if(!monthVal) return;

            const [year, month] = monthVal.split('-');
            const daysInMonth = new Date(year, month, 0).getDate();
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            
            document.getElementById('reportPrintMonthTxt').innerText = `${monthNames[parseInt(month)-1]} ${year}`;
            document.getElementById('monthlyEmptyMsg').style.display = 'none';

            // Build Header
            let headHtml = `<tr><th style="width: 150px;">Branch</th><th style="width: 150px;">Name</th><th>Role</th>`;
            for(let i=1; i<=daysInMonth; i++) {
                headHtml += `<th>${i}</th>`;
            }
            headHtml += `<th>Total P</th></tr>`;
            document.getElementById('monthlyHead').innerHTML = headHtml;

            let attData;
            try {
                attData = await getAttendanceMonth(monthVal);
            } catch (error) {
                console.error("Error loading monthly attendance:", error);
                if (requestVersion !== monthlyReportVersion) return;
                const detail = error?.code === 'failed-precondition'
                    ? 'A Firestore composite index is required. Deploy firestore.indexes.json, then wait for the index to finish building.'
                    : error?.code === 'permission-denied'
                        ? 'Firestore denied this query. Check the deployed daily_attendance rule and confirm your user branch matches the attendance records.'
                        : error?.message || 'An unexpected error occurred.';
                document.getElementById('monthlyBody').innerHTML =
                    `<tr><td colspan="${daysInMonth + 4}" role="alert" style="padding: 20px; color: var(--danger);">Unable to load attendance records: ${escapeAttendanceText(detail)}${error?.code ? ` (${escapeAttendanceText(error.code)})` : ''}</td></tr>`;
                return;
            }
            if (requestVersion !== monthlyReportVersion) return;

            const recordsByEmployeeDate = new Map();
            attData.forEach(record => {
                const data = record.data;
                recordsByEmployeeDate.set(`${attendanceEmployeeKey(data)}:${normalizeDateKey(data.date) || data.date}`, data);
            });

            // Filter Employees and Sort by Branch, then Name
            let filteredEmps = allEmployees;
            if (branchFilter && branchFilter !== 'all branches') {
                filteredEmps = filteredEmps.filter(e => (e.branch || '').toLowerCase() === branchFilter);
            }
            
            let bodyHtml = '';
            filteredEmps.forEach(emp => {
                let presentCount = 0;
                let rowHtml = `<tr>
                    <td>${emp.branch || '--'}</td>
                    <td>${emp.name}</td>
                    <td><span style="font-size:9px; color:#888;">${emp.type}</span></td>`;
                
                for(let i=1; i<=daysInMonth; i++) {
                    let dStr = `${year}-${month}-${String(i).padStart(2, '0')}`;
                    const record = recordsByEmployeeDate.get(`${emp.type}:${emp.id}:${dStr}`);
                    
                    let mark = '-';
                    let cls = 'm-st-none';
                    
                    if(record) {
                        if(record.status === 'Present') { mark = 'P'; cls = 'm-st-P'; presentCount++; }
                        else if(record.status === 'Half-Day') { mark = 'H'; cls = 'm-st-H'; presentCount += 0.5; }
                        else if(record.status === 'Leave') { mark = 'L'; cls = 'm-st-L'; }
                    }
                    rowHtml += `<td class="${cls}">${mark}</td>`;
                }
                rowHtml += `<td style="color:var(--primary); font-weight:800;">${presentCount}</td></tr>`;
                bodyHtml += rowHtml;
            });

            if (filteredEmps.length === 0) {
                bodyHtml = `<tr><td colspan="${daysInMonth + 4}" style="padding: 20px; color: var(--text-muted);">No employees found.</td></tr>`;
            }

            document.getElementById('monthlyBody').innerHTML = bodyHtml;
        }

        window.printMonthlyReport = function() {
            const tableBody = document.getElementById('monthlyBody').innerHTML;
            if(!tableBody) return alert("Report is empty.");
            
            document.body.classList.add('printing-monthly');
            document.getElementById('reportPrintTitle').style.display = 'block';
            
            window.print();
            
            setTimeout(() => {
                document.body.classList.remove('printing-monthly');
                document.getElementById('reportPrintTitle').style.display = 'none';
            }, 1000);
        }

        window.exportMonthlyCSV = function() {
            const table = document.getElementById("monthTable");
            let csvData = [];
            for (let i = 0; i < table.rows.length; i++) {
                let rowData = [];
                let cols = table.rows[i].querySelectorAll("td, th");
                for (let j = 0; j < cols.length; j++) {
                    let text = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, " ").trim();
                    rowData.push('"' + text + '"');
                }
                csvData.push(rowData.join(","));
            }
            
            let monthLabel = document.getElementById('reportMonth').value || "Report";
            let csvContent = "data:text/csv;charset=utf-8," + csvData.join("\n");
            let encodedUri = encodeURI(csvContent);
            let link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `Monthly_Attendance_Matrix_${monthLabel}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        // --- 4. DAILY ATTENDANCE LOG ---
        window.loadAttendanceLog = async function() {
            const requestVersion = ++attendanceLogLoadVersion;
            const tableBody = document.getElementById('attTableBody');
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Loading records...</td></tr>';

            try {
                const period = document.getElementById("filterAttPeriod").value;
                const monthValue = period === 'selected-month'
                    ? document.getElementById("filterAttMonth").value
                    : todayString.slice(0, 7);
                const attList = monthValue ? await getAttendanceMonth(monthValue) : [];
                if (requestVersion !== attendanceLogLoadVersion) return;
                tableBody.innerHTML = ''; 
                window.attDataCache = {};

                if (attList.length === 0) {
                    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: var(--text-muted);">No attendance records found.</td></tr>';
                    window.calculateTotals();
                    return;
                }

                attList.sort((a, b) => (normalizeDateKey(b.data.date) || '').localeCompare(normalizeDateKey(a.data.date) || ''));

                attList.forEach((item) => {
                    const data = item.data;
                    const docId = item.id;
                    window.attDataCache[docId] = data;

                    let badgeClass = 'badge-present';
                    if (data.status === 'Leave' || data.status === 'Half-Day') badgeClass = 'badge-leave';

                    const tr = document.createElement('tr');
                    tr.setAttribute("data-date", normalizeDateKey(data.date) || data.date);
                    tr.setAttribute("data-branch", (data.branch || '').toLowerCase());
                    tr.setAttribute("data-status", data.status.toLowerCase());
                    tr.setAttribute("data-search", `${data.empName} ${data.empType}`.toLowerCase());

                    const formattedDate = window.formatDateToDDMMMYYYY(data.date);

                    tr.innerHTML = `
                        <td data-label="Date"><strong>${formattedDate}</strong></td>
                        <td data-label="Employee">
                            <strong style="font-size: 15px;">${data.empName}</strong><br>
                            <span style="font-size: 12px; color: var(--text-muted);">${data.empType}</span>
                        </td>
                        <td data-label="Branch">${data.branch || '--'}</td>
                        <td data-label="Status"><span class="badge ${badgeClass}">${data.status}</span></td>
                        <td data-label="Notes"><span style="font-size: 13px; color: var(--text-muted);">${data.notes || '--'}</span></td>
                        <td class="no-print" data-label="Actions" style="text-align: right;">
                                ${canManageAttendanceRecord(data) ? `
                                <span class="material-symbols-rounded" style="color: var(--text-muted); cursor: pointer; font-size: 20px; margin-right: 8px;" title="Edit" onclick="window.editAtt('${docId}')">edit</span>
                                <span class="material-symbols-rounded" style="color: var(--danger); cursor: pointer; font-size: 20px;" title="Delete" onclick="window.deleteAtt('${docId}')">delete</span>
                                ` : '--'}
                            </td>
                        `;
                    tableBody.appendChild(tr);
                });
                
                window.filterAttTable();

            } catch (error) {
                if (requestVersion !== attendanceLogLoadVersion) return;
                console.error("Firebase Read Error:", error);
                const detail = error?.code === 'permission-denied'
                    ? 'Firestore denied this query. Confirm the deployed attendance rule allows your assigned branch and that users.branch exactly matches daily_attendance.branch.'
                    : error?.code === 'failed-precondition'
                        ? 'Firestore requires a query index. Deploy firestore.indexes.json or use the index link in the browser console.'
                        : error?.message || 'An unexpected error occurred.';
                tableBody.innerHTML = `<tr><td colspan="6" role="alert" style="text-align:center; padding: 20px; color: var(--danger);">Unable to load attendance: ${escapeAttendanceText(detail)}${error?.code ? ` (${escapeAttendanceText(error.code)})` : ''}</td></tr>`;
            }
        };

        // --- 5. DYNAMIC FILTERING & COUNT CALCULATION ---
        window.filterAttTable = function() {
            const period = document.getElementById("filterAttPeriod").value;
            const dateQuery = todayString;
            const monthQuery = document.getElementById("filterAttMonth").value;
            const branchQuery = document.getElementById("filterAttBranch").value.toLowerCase();
            const statusQuery = document.getElementById("filterAttStatus").value.toLowerCase();
            const textQuery = document.getElementById("attSearchInput").value.toLowerCase();
            
            const trs = document.getElementById("attTableBody").getElementsByTagName("tr");

            for (let i = 0; i < trs.length; i++) {
                if (trs[i].cells.length === 1) continue; 
                
                const rowDate = trs[i].getAttribute("data-date");
                const rowBranch = trs[i].getAttribute("data-branch");
                const rowStatus = trs[i].getAttribute("data-status");
                const rowSearch = trs[i].getAttribute("data-search");

                let show = true;
                const normalizedDate = normalizeDateKey(rowDate);
                if (period === 'today' && normalizedDate !== dateQuery) show = false;
                if (period === 'this-month' && !normalizedDate.startsWith(todayString.slice(0, 7))) show = false;
                if (period === 'selected-month' && (!monthQuery || !normalizedDate.startsWith(monthQuery))) show = false;
                if (branchQuery && rowBranch !== branchQuery) show = false;
                if (statusQuery && rowStatus !== statusQuery) show = false;
                if (textQuery && rowSearch.indexOf(textQuery) === -1) show = false;

                trs[i].style.display = show ? "" : "none";
            }
            
            window.calculateTotals();
        }

        window.calculateTotals = function() {
            const trs = document.getElementById("attTableBody").getElementsByTagName("tr");
            let total = 0, present = 0, leave = 0;

            for (let i = 0; i < trs.length; i++) {
                if (trs[i].style.display !== "none" && trs[i].cells.length > 1) {
                    total++;
                    const status = trs[i].getAttribute("data-status");
                    if (status === 'present' || status === 'half-day') present++;
                    if (status === 'leave') leave++;
                }
            }

            document.getElementById('countTotal').innerText = total;
            document.getElementById('countPresent').innerText = present;
            document.getElementById('countLeave').innerText = leave;
        }

        window.handleAttPeriodChange = function() {
            const period = document.getElementById("filterAttPeriod").value;
            document.getElementById("filterAttMonth").style.display = period === 'selected-month' ? '' : 'none';
            window.loadAttendanceLog();
        }

        window.clearAttFilters = function() {
            document.getElementById("filterAttPeriod").value = "today";
            document.getElementById("filterAttMonth").value = todayString.slice(0, 7);
            document.getElementById("filterAttMonth").style.display = "none";
            if (isAdmin) document.getElementById("filterAttBranch").value = "";
            document.getElementById("filterAttStatus").value = "";
            document.getElementById("attSearchInput").value = "";
            window.loadAttendanceLog();
        }

        // --- 6. CRUD OPERATIONS ---
        window.saveAttendance = async function() {
            const saveBtn = document.getElementById('saveAttBtn');
            const docId = document.getElementById('attDocId').value;
            
            const date = document.getElementById('attDate').value;
            const selectEmp = document.getElementById('attEmployee');
            const empId = selectEmp.value;
            const branch = document.getElementById('attBranch').value;
            const status = document.getElementById('attStatus').value;
            const notes = document.getElementById('attNotes').value;

            const selectedEmployee = selectEmp.options[selectEmp.selectedIndex];
            const recordBeingEdited = docId ? window.attDataCache[docId] : null;
            if (!canAccessAttendance || (!isAdmin && (
                branch !== currentUserBranch
                || selectedEmployee?.getAttribute('data-branch') !== currentUserBranch
                || (docId && (!recordBeingEdited || !canManageAttendanceRecord(recordBeingEdited)))
            ))) {
                return alert('You can only manage attendance for your assigned branch.');
            }
            if(!date || !empId || !branch || !status) {
                return alert("Date, Employee, Branch, and Status are required!");
            }

            const empName = selectedEmployee.getAttribute('data-name');
            const empType = selectedEmployee.getAttribute('data-type');

            saveBtn.innerHTML = 'Saving...';
            saveBtn.disabled = true;

            const payload = {
                ...(docId ? { id: docId } : {}),
                date: date, empId: empId, empName: empName, empType: empType, branch: branch, status: status, notes: notes, updatedAt: new Date()
            };

            try {
                if(docId) {
                    await updateDoc(doc(db, "daily_attendance", docId), payload);
                } else {
                    const [attendanceId] = await reserveNextDocumentIds(db, 'daily_attendance', 'ATT', 1, isAdmin);
                    payload.id = attendanceId;
                    payload.createdAt = new Date();
                    await setDoc(doc(db, "daily_attendance", attendanceId), payload);
                }

                window.closeAttModal();
                invalidateAttendanceMonthCache();
                await Promise.all([window.loadAttendanceLog(), window.generateMonthlyReport()]);

            } catch (error) {
                console.error("Firebase Save Error:", error);
                alert("Failed to save. Check database rules.");
            } finally {
                saveBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size: 18px;">how_to_reg</span> Save Attendance';
                saveBtn.disabled = false;
            }
        }

        window.editAtt = function(docId) {
            const data = window.attDataCache[docId];
            if(!data || !canManageAttendanceRecord(data)) {
                return alert('You can only edit attendance for your assigned branch.');
            }

            document.getElementById('attDocId').value = docId;
            document.getElementById('attDate').value = normalizeDateKey(data.date) || data.date;
            const employee = findAttendanceEmployee(data.empId, data.empType, data.branch, data.empName);
            document.getElementById('attEmployee').value = employee?.id || data.empId;
            document.getElementById('attBranch').value = data.branch;
            document.getElementById('attStatus').value = data.status;
            document.getElementById('attNotes').value = data.notes || '';

            document.getElementById('saveAttBtn').innerHTML = '<span class="material-symbols-rounded" style="font-size: 18px;">update</span> Update Record';
            window.openAttModal();
        }

        window.deleteAtt = async function(docId) {
            const data = window.attDataCache[docId];
            if (!data || !canManageAttendanceRecord(data)) {
                return alert('You can only delete attendance for your assigned branch.');
            }
            if(confirm("Are you sure you want to delete this attendance record?")) {
                try {
                    await deleteDoc(doc(db, "daily_attendance", docId));
                    invalidateAttendanceMonthCache();
                    await Promise.all([window.loadAttendanceLog(), window.generateMonthlyReport()]);
                } catch(e) {
                    alert("Error deleting record.");
                }
            }
        }

        window.resetAttForm = function() {
            document.getElementById('attendance-form').reset();
            document.getElementById('attDocId').value = '';
            document.getElementById('attDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('saveAttBtn').innerHTML = '<span class="material-symbols-rounded" style="font-size: 18px;">how_to_reg</span> Save Attendance';
            
            if (!isAdmin && canAccessAttendance) {
                document.getElementById('attBranch').value = currentUserBranch;
            }
        }

        window.exportDailyAttCSV = function() {
            const table = document.getElementById("attendanceTable");
            let csvData = [];
            for (let i = 0; i < table.rows.length; i++) {
                if (table.rows[i].style.display === "none") continue; 
                let rowData = [];
                let cols = table.rows[i].querySelectorAll("td, th");
                let colCount = cols.length - 1; 
                for (let j = 0; j < colCount; j++) {
                    let text = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, " | ").trim();
                    rowData.push('"' + text + '"');
                }
                csvData.push(rowData.join(","));
            }
            let csvContent = "data:text/csv;charset=utf-8," + csvData.join("\n");
            let encodedUri = encodeURI(csvContent);
            let link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `Attendance_Daily_Log.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        document.getElementById("filterAttMonth").addEventListener("change", () => {
            if (document.getElementById("filterAttPeriod").value === 'selected-month') {
                window.loadAttendanceLog();
            }
        });
        document.getElementById('bulkAttendanceDate').addEventListener('change', window.renderBulkAttendance);
        document.getElementById('bulkAttendanceBranch').addEventListener('change', window.renderBulkAttendance);

        Promise.resolve()
            .then(() => window.loadDropdowns())
            .then(() => Promise.all([
                window.initializeMonthlyMatrix(),
                window.loadLeaveRequests(),
                window.loadAttendanceLog()
            ]))
            .catch(error => {
                console.error("Unable to initialize attendance module:", error);
                document.getElementById('attTableBody').innerHTML =
                    `<tr><td colspan="6" role="alert" style="text-align:center; padding:20px; color:var(--danger);">Attendance could not be loaded: ${escapeAttendanceText(error?.message || error?.code || 'Unknown error')}</td></tr>`;
            });
