import { db } from '../../js/firebase-config.js';
import { doc, getDoc, collection, getDocs, query, where, runTransaction } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

window.selectedDashboardDate = window.getLocalDateString();

function dashboardDateFromKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function renderDashboardWeek() {
    const selectedDate = dashboardDateFromKey(window.selectedDashboardDate);
    const weekStart = new Date(selectedDate);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const label = document.getElementById('dashboardWeekLabel');
    const days = document.getElementById('dashboardWeekDays');
    if (!label || !days) return;

    const dateLabel = date => date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    label.textContent = `${dateLabel(weekStart)} - ${dateLabel(weekEnd)}`;
    days.replaceChildren();
    for (let index = 0; index < 7; index++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + index);
        const dateKey = window.getLocalDateString(date);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dashboard-week-day';
        if (dateKey === window.getLocalDateString()) button.classList.add('dashboard-week-day-today');
        button.setAttribute('aria-pressed', String(dateKey === window.selectedDashboardDate));
        button.setAttribute('aria-label', date.toLocaleDateString('en-IN', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        }));
        const dayName = document.createElement('span');
        dayName.className = 'dashboard-week-day-name';
        dayName.textContent = date.toLocaleDateString('en-IN', { weekday: 'long' });
        const dayNumber = document.createElement('span');
        dayNumber.className = 'dashboard-week-day-number';
        dayNumber.textContent = String(date.getDate());
        const year = document.createElement('span');
        year.className = 'dashboard-week-day-year';
        year.textContent = String(date.getFullYear());
        button.append(dayName, dayNumber, year);
        button.addEventListener('click', () => {
            window.selectedDashboardDate = dateKey;
            renderDashboardWeek();
            window.fetchDashboardData();
        });
        days.appendChild(button);
    }
}

document.getElementById('dashboardPreviousWeek')?.addEventListener('click', () => {
    const date = dashboardDateFromKey(window.selectedDashboardDate);
    date.setDate(date.getDate() - 7);
    window.selectedDashboardDate = window.getLocalDateString(date);
    renderDashboardWeek();
    window.fetchDashboardData();
});
document.getElementById('dashboardNextWeek')?.addEventListener('click', () => {
    const date = dashboardDateFromKey(window.selectedDashboardDate);
    date.setDate(date.getDate() + 7);
    window.selectedDashboardDate = window.getLocalDateString(date);
    renderDashboardWeek();
    window.fetchDashboardData();
});
document.getElementById('dashboardCurrentWeek')?.addEventListener('click', () => {
    window.selectedDashboardDate = window.getLocalDateString();
    renderDashboardWeek();
    window.fetchDashboardData();
});
renderDashboardWeek();

const dashboardEscapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
}[character]));
let dashboardEmployees = [];
let dashboardTherapists = [];

function dashboardFillSelect(select, records, placeholder) {
    select.innerHTML = `<option value="">${dashboardEscapeHtml(placeholder)}</option>`;
    records.forEach(record => {
        const option = document.createElement('option');
        option.value = record.id;
        option.textContent = record.name;
        if (record.type) option.dataset.type = record.type;
        if (record.branch) option.dataset.branch = record.branch;
        select.appendChild(option);
    });
}

function refreshDashboardEntryDirectories() {
    const attendanceBranch = document.getElementById('dashboardAttendanceBranch').value;
    const appointmentBranch = document.getElementById('dashboardAppointmentBranch').value;
    const employees = dashboardEmployees.filter(employee => !attendanceBranch || employee.branch === attendanceBranch);
    const therapists = dashboardTherapists.filter(therapist => !appointmentBranch || therapist.branch === appointmentBranch);
    dashboardFillSelect(document.getElementById('dashboardAttendanceEmployee'), employees, 'Select staff or therapist');
    dashboardFillSelect(document.getElementById('dashboardAppointmentTherapist'), therapists, 'Select therapist');
}

window.loadDashboardEntryOptions = async function() {
    const isAdmin = window.currentUser?.role === 'admin';
    const branch = window.currentUser?.branch || '';
    const branchSelects = [
        document.getElementById('dashboardAttendanceBranch'),
        document.getElementById('dashboardAppointmentBranch')
    ];
    const branchesRequest = isAdmin
        ? getDocs(collection(db, 'branches'))
        : Promise.resolve(null);
    const staffQuery = isAdmin
        ? collection(db, 'staff')
        : query(collection(db, 'staff'), where('branch', '==', branch));
    const therapistsQuery = isAdmin
        ? collection(db, 'therapists')
        : query(collection(db, 'therapists'), where('branch', '==', branch));
    const [branchesSnapshot, staffSnapshot, therapistsSnapshot] = await Promise.all([
        branchesRequest,
        getDocs(staffQuery),
        getDocs(therapistsQuery)
    ]);
    const branches = isAdmin
        ? [...new Set(branchesSnapshot.docs.map(item => item.data().name).filter(Boolean))].sort()
        : [branch];

    branchSelects.forEach(select => {
        select.innerHTML = '';
        if (isAdmin) {
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'Select branch';
            select.appendChild(placeholder);
        }
        branches.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
        if (!isAdmin) {
            select.value = branch;
            select.disabled = true;
        }
    });

    dashboardEmployees = [
        ...staffSnapshot.docs.map(item => ({
            id: item.id,
            name: item.data().name || 'Unnamed staff',
            type: 'Staff',
            branch: item.data().branch || ''
        })),
        ...therapistsSnapshot.docs.map(item => ({
            id: item.id,
            name: item.data().name || 'Unnamed therapist',
            type: 'Therapist',
            branch: item.data().branch || ''
        }))
    ].sort((a, b) => a.name.localeCompare(b.name));
    dashboardTherapists = therapistsSnapshot.docs.map(item => ({
        id: item.id,
        name: item.data().name || 'Unnamed therapist',
        branch: item.data().branch || ''
    })).sort((a, b) => a.name.localeCompare(b.name));
    refreshDashboardEntryDirectories();
};

function setDashboardFeedback(id, message, state = '') {
    const feedback = document.getElementById(id);
    feedback.textContent = message;
    feedback.className = `dashboard-entry-feedback${state ? ` ${state}` : ''}`;
}

function dashboardAttendanceDocumentId(date, type, employeeId) {
    return `${date}_${String(type || 'employee').toLowerCase()}_${encodeURIComponent(employeeId)}`;
}

function dashboardAppointmentDocumentId(appointment) {
    return `apt_${encodeURIComponent(appointment.branch)}_${appointment.date}_${encodeURIComponent(appointment.time)}_${encodeURIComponent(appointment.therapist)}_${encodeURIComponent(appointment.mobile)}`;
}

window.saveDashboardAttendance = async function(event) {
    event.preventDefault();
    const form = document.getElementById('dashboardAttendanceForm');
    const button = document.getElementById('dashboardAttendanceSubmit');
    if (button.disabled) return;
    const employeeSelect = document.getElementById('dashboardAttendanceEmployee');
    const employee = dashboardEmployees.find(item => item.id === employeeSelect.value && item.type === employeeSelect.selectedOptions[0]?.dataset.type);
    const branch = window.currentUser?.role === 'admin'
        ? document.getElementById('dashboardAttendanceBranch').value
        : window.currentUser?.branch;
    const date = document.getElementById('dashboardAttendanceDate').value;
    if (!employee || !branch || !date) {
        setDashboardFeedback('dashboardAttendanceFeedback', 'Select an employee, branch, and date.', 'error');
        return;
    }

    button.disabled = true;
    button.textContent = 'Saving...';
    setDashboardFeedback('dashboardAttendanceFeedback', '');
    try {
        const attendanceRef = doc(db, 'daily_attendance', dashboardAttendanceDocumentId(date, employee.type, employee.id));
        await runTransaction(db, async transaction => {
            const existing = await transaction.get(attendanceRef);
            transaction.set(attendanceRef, {
                date,
                empId: employee.id,
                empName: employee.name,
                empType: employee.type,
                branch,
                status: document.getElementById('dashboardAttendanceStatus').value,
                notes: document.getElementById('dashboardAttendanceNotes').value.trim(),
                updatedAt: new Date(),
                createdAt: existing.exists() ? existing.data().createdAt || new Date() : new Date()
            }, { merge: true });
        });
        form.reset();
        document.getElementById('dashboardAttendanceDate').value = window.getLocalDateString();
        if (window.currentUser?.role !== 'admin') document.getElementById('dashboardAttendanceBranch').value = window.currentUser.branch;
        refreshDashboardEntryDirectories();
        setDashboardFeedback('dashboardAttendanceFeedback', 'Attendance saved.', 'success');
        await window.fetchDashboardData();
    } catch (error) {
        console.error('Dashboard attendance save failed:', error);
        setDashboardFeedback('dashboardAttendanceFeedback', 'Could not save attendance. Check your access and try again.', 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Save Attendance';
    }
};

window.saveDashboardAppointment = async function(event) {
    event.preventDefault();
    const form = document.getElementById('dashboardAppointmentForm');
    const button = document.getElementById('dashboardAppointmentSubmit');
    if (button.disabled) return;
    const mobile = document.getElementById('dashboardAppointmentMobile').value.trim();
    const name = document.getElementById('dashboardAppointmentName').value.trim();
    const date = document.getElementById('dashboardAppointmentDate').value;
    const time = document.getElementById('dashboardAppointmentTime').value;
    const branch = window.currentUser?.role === 'admin'
        ? document.getElementById('dashboardAppointmentBranch').value
        : window.currentUser?.branch;
    const therapist = document.getElementById('dashboardAppointmentTherapist').selectedOptions[0]?.textContent || '';
    if (!/^\d{10}$/.test(mobile) || !name || !date || !branch || !therapist || !/^(0[9]|1\d|20):[0-5]\d$|^21:00$/.test(time)) {
        setDashboardFeedback('dashboardAppointmentFeedback', 'Enter valid patient details, branch, therapist, date, and a time between 9 AM and 9 PM.', 'error');
        return;
    }

    button.disabled = true;
    button.textContent = 'Saving...';
    setDashboardFeedback('dashboardAppointmentFeedback', '');
    const appointment = {
        mobile, name, age: '', gender: '', category: 'Normal', location: '', patientNotes: '',
        branch, date, time, previousDate: '', previousTime: '', duration: '',
        sessionsPerDay: '', therapist, status: 'Pending', fee: 0, advance: 0,
        balance: 0, prevDues: 0, notes: '', paymentMode: 'Cash',
        paymentReference: '', paymentRemarks: '', createdAt: new Date(), updatedAt: new Date()
    };
    const appointmentRef = doc(db, 'appointments', dashboardAppointmentDocumentId(appointment));
    try {
        const matchingAppointments = await getDocs(query(
            collection(db, 'appointments'),
            where('branch', '==', branch),
            where('date', '==', date),
            where('time', '==', time),
            where('therapist', '==', therapist),
            where('mobile', '==', mobile)
        ));
        if (matchingAppointments.docs.some(item => String(item.data().status || '').toLowerCase() !== 'cancelled')) {
            throw new Error('An appointment already exists for this patient, therapist, branch, date, and time.');
        }

        const patientMatches = await getDocs(query(
            collection(db, 'patients'),
            where('mobile', '==', mobile),
            where('branch', '==', branch)
        ));
        const patientRef = patientMatches.empty
            ? doc(db, 'patients', `apt_${encodeURIComponent(branch)}_${encodeURIComponent(mobile)}`)
            : null;
        await runTransaction(db, async transaction => {
            const appointmentSnapshot = await transaction.get(appointmentRef);
            if (appointmentSnapshot.exists() && String(appointmentSnapshot.data().status || '').toLowerCase() !== 'cancelled') {
                throw new Error('An appointment already exists for this patient, therapist, branch, date, and time.');
            }
            const patientSnapshot = patientRef ? await transaction.get(patientRef) : null;
            transaction.set(appointmentRef, appointment);
            if (patientRef && patientSnapshot && !patientSnapshot.exists()) {
                transaction.set(patientRef, {
                    patientId: `P${mobile}`,
                    mobile,
                    name,
                    category: 'Normal',
                    branch,
                    location: '',
                    notes: '',
                    createdAt: new Date()
                });
            }
        });
        form.reset();
        document.getElementById('dashboardAppointmentDate').value = window.getLocalDateString();
        if (window.currentUser?.role !== 'admin') document.getElementById('dashboardAppointmentBranch').value = window.currentUser.branch;
        refreshDashboardEntryDirectories();
        setDashboardFeedback('dashboardAppointmentFeedback', 'Appointment saved.', 'success');
        await window.fetchDashboardData();
    } catch (error) {
        console.error('Dashboard appointment save failed:', error);
        const message = error.message.includes('already exists')
            ? error.message
            : 'Could not save appointment. Check your access and try again.';
        setDashboardFeedback('dashboardAppointmentFeedback', message, 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Save Appointment';
    }
};

window.formatTime12Hour = function(value) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (!match) return value || '--:--';

    let hours = Number(match[1]);
    const minutes = match[2];
    const meridiem = match[3]?.toUpperCase();
    if (meridiem) {
        if (hours < 1 || hours > 12) return value;
        return `${String(hours).padStart(2, '0')}:${minutes} ${meridiem}`;
    }
    if (hours > 23) return value;

    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${String(hours).padStart(2, '0')}:${minutes} ${period}`;
};

window.selectedDateStr = window.getLocalDateString();

window.pendingInvoicePayload = null;
window.dispatchInvoicePayload = function() {
    const frame = document.getElementById('invoice-frame');
    if (!frame || frame.dataset.ready !== 'true' || !window.pendingInvoicePayload) return;

    frame.contentWindow.postMessage({
        type: 'corebiq:invoice',
        payload: window.pendingInvoicePayload.payload,
        action: window.pendingInvoicePayload.action
    }, window.location.origin === 'null' ? '*' : window.location.origin);
    window.pendingInvoicePayload = null;
};

window.openBlankInvoiceTemplate = function(element) {
    window.pendingInvoicePayload = null;
    const frame = document.getElementById('invoice-frame');
    if (frame) {
        frame.dataset.ready = 'false';
        frame.src = 'modules/templates/template-invoice/template-invoice.html';
    }
    window.switchView('view-invoice', element);
};

window.addEventListener('message', event => {
    const invoiceFrame = document.getElementById('invoice-frame');
    if (event.source !== invoiceFrame?.contentWindow) return;
    if (event.data?.type === 'corebiq:invoice:ready') {
        invoiceFrame.dataset.ready = 'true';
        window.dispatchInvoicePayload();
        return;
    }
    if (event.data?.type === 'corebiq:invoice:back') {
        window.switchView('view-appointments', null);
    }
});

document.getElementById('invoice-frame')?.addEventListener('load', event => {
    event.currentTarget.dataset.ready = 'true';
    window.dispatchInvoicePayload();
});


window.loadDashboardCompanyName = async function() {
    const companyElement = document.getElementById('dash-company-name');
    if (!companyElement || !window.currentUser) return;

    companyElement.textContent = 'Loading company...';

    try {
        const companySnapshot = await getDoc(doc(db, 'settings', 'company_profile'));
        if (!companySnapshot.exists()) {
            companyElement.textContent = 'Company profile not configured';
            return;
        }

        const companyProfile = companySnapshot.data();
        window.applyCorebiqSettings?.(companyProfile);
        try {
            localStorage.setItem('corebiq-company-bank-card-profile', JSON.stringify({
                clinicName: companyProfile.name || '',
                accountName: companyProfile.accName || '',
                bankName: companyProfile.bankName || '',
                accountNumber: companyProfile.accNo || '',
                ifsc: companyProfile.ifsc || '',
                upi: companyProfile.upi || '',
                phone: companyProfile.phone1 || ''
            }));
        } catch (storageError) {
            console.warn('Unable to cache company bank details locally:', storageError);
        }
        const companyName = companyProfile.name;
        if (typeof companyName === 'string' && companyName.trim()) {
            const normalizedName = companyName.trim();
            companyElement.textContent = normalizedName;
            try {
                localStorage.setItem('corebiq-company-name', normalizedName);
            } catch (storageError) {
                console.warn('Unable to cache the dashboard company name:', storageError);
            }
        } else {
            companyElement.textContent = 'Company name not configured';
        }
    } catch (error) {
        console.error('Unable to load dashboard company name:', error);
        companyElement.textContent = 'Company profile unavailable';
    }
};


/* -------------------------------------------------------
   CALENDAR
------------------------------------------------------- */
window.renderCalendar = function() {
    const title = document.getElementById('calMonthDisplay');
    const grid = document.getElementById('calendarGrid');

    if (!title || !grid) return;

    const today = new Date();
    const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
    const formatRangeDate = date => new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short'
    }).format(date);
    title.textContent = `${formatRangeDate(weekStart)} – ${formatRangeDate(weekEnd)} ${weekEnd.getFullYear()}`;

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    grid.innerHTML = weekdays.map((weekday, index) => {
        const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index);
        const dateKey = window.getLocalDateString(date);
        const classes = [
            'cal-day',
            dateKey === window.selectedDateStr ? 'active' : '',
            dateKey === window.getLocalDateString(today) ? 'today' : '',
            window.aptDatesSet.has(dateKey) ? 'has-event' : ''
        ].filter(Boolean).join(' ');
        const ariaLabel = new Intl.DateTimeFormat('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(date);
        return `<button type="button" class="${classes}" onclick="window.selectDate('${dateKey}')" aria-label="${ariaLabel}" aria-pressed="${dateKey === window.selectedDateStr}">
            <span class="cal-day-name">${weekday}</span>
            <span class="cal-day-number">${date.getDate()}</span>
        </button>`;
    }).join('');
};

window.selectDate = function(dateStr) {
    window.selectedDateStr = dateStr;
    window.renderCalendar();
    window.renderLiveTable();
};

window.setCalToToday = function() {
    const today = new Date();
    window.selectDate(window.getLocalDateString(today));
};

/* -------------------------------------------------------
   BALANCE DISPLAY
   0  => No Due
   >0 => Due ₹...
   <0 => Excess ₹...
------------------------------------------------------- */
window.getBalanceDisplay = function(value) {
    const balance = Number(value || 0);

    if (Math.abs(balance) < 0.005) {
        return {
            text: 'No Due',
            className: 'balance-no-due'
        };
    }

    if (balance > 0) {
        return {
            text: `Due ₹${balance.toFixed(2)}`,
            className: 'balance-due'
        };
    }

    return {
        text: `Excess ₹${Math.abs(balance).toFixed(2)}`,
        className: 'balance-excess'
    };
};

/* -------------------------------------------------------
   LIVE DASHBOARD TABLE
------------------------------------------------------- */
window.renderLiveTable = function() {

    const tableBody =
        document.getElementById('dashAptTableBody');

    if (!tableBody) return;

    const todayStr =
        window.getLocalDateString();

    const title =
        document.getElementById('dashListTitle');

    if (title) {
        title.innerText =
            window.selectedDateStr === todayStr
                ? "Today"
                : window.formatIndianDate(window.selectedDateStr);
    }

    const dayApts =
        window.allApts.filter(
            a => a.date === window.selectedDateStr
        );

    if (dayApts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5"
                    style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px;display:block;width:100%">
                    No appointments scheduled for this date.
                </td>
            </tr>
        `;
        return;
    }

    let rowsHtml = '';

    dayApts.forEach(data => {

        let badgeClass = 'badge-pending';

        const st =
            (data.status || '').toLowerCase();

        if (st === 'completed') {
            badgeClass = 'badge-completed';
        } else if (st === 'rescheduled') {
            badgeClass = 'badge-rescheduled';
        } else if (st === 'cancelled') {
            badgeClass = 'badge-cancelled';
        }

        const balance =
            window.getBalanceDisplay(data.balance);

        rowsHtml += `
            <tr>
                <td>
                    <strong style="color:var(--text-main);font-size:14px">
                        ${window.formatTime12Hour(data.time)}
                    </strong>
                </td>

                <td>
                    <strong style="font-size:14px;display:block;margin-bottom:2px">
                        ${data.name || 'Unknown'}
                    </strong>
                    <span style="font-size:12px;color:var(--text-muted);font-weight:600">
                        +91 ${data.mobile || ''}
                    </span>
                </td>

                <td>
                    <strong style="font-size:13px;color:var(--primary);display:block;margin-bottom:2px">
                        ${data.branch || ''}
                    </strong>
                    <span style="font-size:12px;color:var(--text-muted);font-weight:600">
                        Dr. ${data.therapist || 'N/A'}
                    </span>
                </td>

                <td>
                    <span style="font-size:12px;color:var(--text-muted);font-weight:600">
                        Fee: ₹${Number(data.fee || 0).toFixed(2)}
                    </span>
                    <br>
                    <strong class="${balance.className}" style="font-size:13px">
                        ${balance.text}
                    </strong>
                </td>

                <td>
                    <span class="badge ${badgeClass}">
                        ${data.status || 'Pending'}
                    </span>
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = rowsHtml;
};

/* -------------------------------------------------------
   GLOBAL CLOCK
------------------------------------------------------- */
window.updateGlobalClock = function() {
    const now = new Date();
    const dateElement = document.getElementById('dashboard-as-of-date');
    const timeElement = document.getElementById('dashboard-as-of-time');
    if (!dateElement || !timeElement) return;

    dateElement.textContent = new Intl.DateTimeFormat('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(now);
    dateElement.dateTime = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');
    timeElement.textContent = new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    }).format(now);
    timeElement.dateTime = now.toISOString();
};

window.dashboardTransactions = [];

window.getDashboardSalesPeriod = function(period, now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start = new Date(today);
    let end = new Date(today);

    if (period === 'this-week') {
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    } else if (period === 'this-month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'this-fy') {
        const fiscalYearStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        start = new Date(fiscalYearStart, 3, 1);
    } else if (period === 'this-year') {
        start = new Date(now.getFullYear(), 0, 1);
    }

    end = new Date(today);
    return { start, end, period };
};

window.getDashboardDateKey = function(value) {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    if (typeof value.toDate === 'function') {
        return window.getDashboardDateKey(value.toDate());
    }
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
};

window.renderSalesTrend = function(transactions, period, range, total) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('salesTrendChart');
    if (!canvas) return;
    if (window.salesTrendChartInstance) window.salesTrendChartInstance.destroy();

    const pad = value => String(value).padStart(2, '0');
    const start = range.start;
    const end = range.end;
    let chartEnd = new Date(end);
    const labels = [];
    const values = [];
    const totalsByBucket = new Map();
    const todayMode = period === 'today';
    const fiscalOrAnnual = period === 'this-fy' || period === 'this-year';

    if (todayMode) {
        for (let hour = 0; hour < 24; hour++) {
            labels.push(hour % 3 === 0 ? `${pad(hour)}:00` : '');
            values.push(0);
        }
    } else if (fiscalOrAnnual) {
        chartEnd = period === 'this-fy'
            ? new Date(start.getFullYear() + 1, 2, 31)
            : new Date(start.getFullYear(), 11, 31);
        let month = new Date(start.getFullYear(), start.getMonth(), 1);
        while (month <= chartEnd) {
            labels.push(month.toLocaleString(window.corebiqLocale?.() || 'en-IN', { month: 'short' }));
            values.push(0);
            month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
        }
    } else {
        if (period === 'this-week') {
            chartEnd.setDate(chartEnd.getDate() + (6 - ((chartEnd.getDay() + 6) % 7)));
        } else if (period === 'this-month') {
            chartEnd = new Date(end.getFullYear(), end.getMonth() + 1, 0);
        }
        const day = new Date(start);
        while (day <= chartEnd) {
            labels.push(`${pad(day.getDate())} ${day.toLocaleString(window.corebiqLocale?.() || 'en-IN', { month: 'short' })}`);
            values.push(0);
            day.setDate(day.getDate() + 1);
        }
    }

    transactions.forEach(transaction => {
        if (String(transaction.type || '').toLowerCase() !== 'sales') return;
        const dateKey = window.getDashboardDateKey(transaction.date);
        if (!dateKey) return;

        const [year, month, day] = dateKey.split('-').map(Number);
        const transactionDay = new Date(year, month - 1, day);
        if (transactionDay < start || transactionDay > end) return;

        const amount = Number(transaction.cashOut) || 0;
        let bucket;
        if (todayMode) {
            let createdAt = transaction.createdAt;
            if (createdAt && typeof createdAt.toDate === 'function') createdAt = createdAt.toDate();
            const hour = createdAt instanceof Date && !Number.isNaN(createdAt.getTime())
                ? createdAt.getHours()
                : 12;
            bucket = hour;
        } else if (fiscalOrAnnual) {
            bucket = `${transactionDay.getFullYear()}-${transactionDay.getMonth()}`;
        } else {
            bucket = dateKey;
        }
        totalsByBucket.set(bucket, (totalsByBucket.get(bucket) || 0) + amount);
    });

    if (todayMode) {
        totalsByBucket.forEach((amount, hour) => { values[hour] += amount; });
    } else if (fiscalOrAnnual) {
        const month = new Date(start.getFullYear(), start.getMonth(), 1);
        values.forEach((_, index) => {
            const key = `${month.getFullYear()}-${month.getMonth()}`;
            values[index] = totalsByBucket.get(key) || 0;
            month.setMonth(month.getMonth() + 1);
        });
    } else {
        let day = new Date(start);
        values.forEach((_, index) => {
            const key = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
            values[index] = totalsByBucket.get(key) || 0;
            day.setDate(day.getDate() + 1);
        });
    }

    const currency = value => window.formatCorebiqCurrency
        ? window.formatCorebiqCurrency(value)
        : `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    window.salesTrendChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Sales',
                data: values,
                borderColor: '#0B1F4B',
                backgroundColor: 'rgba(11, 87, 208, .10)',
                borderWidth: 2,
                pointRadius: todayMode ? 0 : 2,
                pointHoverRadius: 4,
                pointBackgroundColor: '#0B1F4B',
                fill: true,
                tension: .35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: context => ` Sales: ${currency(context.parsed.y)}` } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 8, color: '#6B7280', font: { size: 10 } } },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(107, 114, 128, .12)' },
                    ticks: {
                        maxTicksLimit: 5,
                        color: '#6B7280',
                        font: { size: 10 },
                        callback: value => window.formatCorebiqCurrency
                            ? window.formatCorebiqCurrency(value)
                            : `₹${Number(value).toLocaleString('en-IN')}`
                    }
                }
            }
        }
    });
    canvas.setAttribute('aria-label', `Sales trend. Total sales for selected period: ${currency(total)}.`);
};

window.updateDashboardSales = function() {
    const periodSelect = document.getElementById('dashboard-period');
    const period = periodSelect ? periodSelect.value : 'today';
    const range = window.getDashboardSalesPeriod(period);
    const isToday = period === 'today';
    const label = periodSelect ? periodSelect.options[periodSelect.selectedIndex].text : 'Today';
    const currency = value => window.formatCorebiqCurrency
        ? window.formatCorebiqCurrency(value)
        : `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const rangeTransactions = window.dashboardTransactions.filter(transaction => {
        const dateKey = window.getDashboardDateKey(transaction.date);
        if (!dateKey) return false;
        const [year, month, day] = dateKey.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date >= range.start && date <= range.end;
    });
    const salesTransactions = rangeTransactions.filter(transaction =>
        String(transaction.type || '').toLowerCase() === 'sales'
    );
    const total = salesTransactions.reduce((sum, transaction) => sum + (Number(transaction.cashOut) || 0), 0);
    const received = rangeTransactions
        .filter(transaction => String(transaction.type || '').toLowerCase() === 'receipt')
        .reduce((sum, transaction) => sum + (Number(transaction.cashIn) || 0), 0);
    const totalElement = document.getElementById('dashboard-sales-total');
    const periodLabel = document.getElementById('dashboard-sales-period-label');
    const caption = document.getElementById('sales-trend-caption');
    const financeLabel = document.getElementById('dashboard-finance-period-label');
    const revenueElement = document.getElementById('dashboard-revenue-total');
    const receivedElement = document.getElementById('dashboard-received-total');
    const dueElement = document.getElementById('dashboard-due-total');
    if (revenueElement) revenueElement.textContent = currency(total);
    if (receivedElement) receivedElement.textContent = currency(received);
    if (dueElement) dueElement.textContent = currency(total - received);
    if (financeLabel) financeLabel.textContent = label;
    if (totalElement) totalElement.textContent = currency(total);
    if (periodLabel) periodLabel.textContent = label;
    if (caption) caption.textContent = `${isToday ? 'Hourly' : (period === 'this-fy' || period === 'this-year' ? 'Monthly' : 'Daily')} billed sales for ${label.toLowerCase()}`;
    window.renderSalesTrend(salesTransactions, period, range, total);
    window.updateDashboardAppointmentSummary(range);
};

window.updateDashboardAppointmentSummary = function(range) {
    if (!range || !Array.isArray(window.allApts)) return;

    const counts = { pending: 0, completed: 0, rescheduled: 0, cancelled: 0 };
    window.allApts.forEach(appointment => {
        const dateKey = window.getDashboardDateKey(appointment.date);
        if (!dateKey) return;
        const [year, month, day] = dateKey.split('-').map(Number);
        const appointmentDate = new Date(year, month - 1, day);
        if (appointmentDate < range.start || appointmentDate > range.end) return;

        const status = String(appointment.status || '').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status]++;
    });

    document.getElementById('dashPending').innerText = counts.pending;
    document.getElementById('dashCompleted').innerText = counts.completed;
    window.renderChart(counts.pending, counts.completed, counts.rescheduled, counts.cancelled);
};

/* -------------------------------------------------------
   DASHBOARD FIRESTORE DATA
------------------------------------------------------- */
let dashboardRequestSequence = 0;
const dashboardInFlightRequests = new Map();
window.fetchDashboardData = async function() {
    if (!window.currentUser) return;

    const errorBanner = document.getElementById('dash-error-banner');
    const errorText = document.getElementById('dash-error-text');
    const selectedDate = window.selectedDashboardDate || window.getLocalDateString();
    const requestSequence = ++dashboardRequestSequence;
    const selectedLabel = dashboardDateFromKey(selectedDate).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
    });
    const branch = window.currentUser.role === 'admin' ? '' : window.currentUser.branch;
    const appointmentConstraints = [where('date', '==', selectedDate)];
    const attendanceConstraints = [where('date', '==', selectedDate)];
    if (branch) {
        appointmentConstraints.push(where('branch', '==', branch));
        attendanceConstraints.push(where('branch', '==', branch));
    }

    const requestKey = `${selectedDate}:${branch}`;
    let request = dashboardInFlightRequests.get(requestKey);
    if (!request) {
        request = Promise.all([
            getDocs(query(collection(db, 'appointments'), ...appointmentConstraints)),
            getDocs(query(collection(db, 'daily_attendance'), ...attendanceConstraints))
        ]);
        dashboardInFlightRequests.set(requestKey, request);
        request.then(
            () => { if (dashboardInFlightRequests.get(requestKey) === request) dashboardInFlightRequests.delete(requestKey); },
            () => { if (dashboardInFlightRequests.get(requestKey) === request) dashboardInFlightRequests.delete(requestKey); }
        );
    }

    try {
        if (errorBanner) errorBanner.style.display = 'none';
        document.getElementById('dashboardAttendanceCountHeading').textContent = selectedLabel;
        document.getElementById('dashboardAppointmentCountHeading').textContent = selectedLabel;
        document.getElementById('dashboardAppointmentCountCaption').textContent = `Scheduled for ${selectedLabel}`;
        document.getElementById('dashboardFeeSummaryHeading').textContent = selectedLabel;
        document.getElementById('dashboardAttendanceHeading').textContent = selectedLabel;
        document.getElementById('dashboardAppointmentHeading').textContent = selectedLabel;
        const [appointmentsSnapshot, attendanceSnapshot] = await request;
        if (requestSequence !== dashboardRequestSequence) return;

        const appointmentRecords = appointmentsSnapshot.docs.map(item => ({ id: item.id, data: item.data() }));
        const appointmentMap = new Map();
        appointmentRecords.forEach(record => {
            const data = record.data;
            const identityParts = [data.branch, data.date, data.time, data.therapist, data.mobile]
                .map(value => String(value || '').trim().toLowerCase());
            const key = identityParts.every(Boolean) ? identityParts.join('|') : record.id;
            const existing = appointmentMap.get(key);
            const isActive = String(data.status || '').toLowerCase() !== 'cancelled';
            const existingIsActive = existing && String(existing.status || '').toLowerCase() !== 'cancelled';
            const timestamp = value => value && typeof value.toMillis === 'function'
                ? value.toMillis()
                : (Date.parse(value || '') || 0);
            const dataTime = timestamp(data.updatedAt) || timestamp(data.createdAt);
            const existingTime = existing
                ? timestamp(existing.updatedAt) || timestamp(existing.createdAt)
                : -1;
            if (!existing || (isActive && !existingIsActive) || (isActive === existingIsActive && dataTime >= existingTime)) {
                appointmentMap.set(key, data);
            }
        });
        const appointments = [...appointmentMap.values()];
        const completed = appointments.filter(item => String(item.status || '').toLowerCase() === 'completed').length;
        const attendanceByEmployee = new Map();
        attendanceSnapshot.docs.forEach(item => {
            const data = item.data();
            const key = `${data.empType || ''}:${data.empId || item.id}:${data.date || selectedDate}`;
            const existing = attendanceByEmployee.get(key);
            const timestamp = value => value && typeof value.toMillis === 'function'
                ? value.toMillis()
                : Date.parse(value || '') || 0;
            const dataTime = timestamp(data.updatedAt) || timestamp(data.createdAt);
            const existingTime = existing
                ? timestamp(existing.updatedAt) || timestamp(existing.createdAt)
                : -1;
            if (!existing || dataTime >= existingTime) attendanceByEmployee.set(key, data);
        });

        let attendancePresent = 0;
        let attendanceAbsent = 0;
        let attendanceHalfDay = 0;
        attendanceByEmployee.forEach(item => {
            const status = String(item.status || '').toLowerCase();
            if (status === 'present') attendancePresent++;
            else if (status === 'absent') attendanceAbsent++;
            else if (status === 'half-day') attendanceHalfDay++;
        });

        document.getElementById('dashboardAttendancePresent').textContent = attendancePresent;
        document.getElementById('dashboardAttendanceAbsent').textContent = attendanceAbsent;
        document.getElementById('dashboardAttendanceHalfDay').textContent = attendanceHalfDay;
        document.getElementById('dashboardAttendanceTotal').textContent = attendanceByEmployee.size;
        const attendanceTotal = attendanceByEmployee.size;
        const attendanceBarPercent = count => attendanceTotal ? `${(count / attendanceTotal) * 100}%` : '0%';
        document.getElementById('dashboardAttendancePresentBar').style.width = attendanceBarPercent(attendancePresent);
        document.getElementById('dashboardAttendanceAbsentBar').style.width = attendanceBarPercent(attendanceAbsent);
        document.getElementById('dashboardAttendanceHalfDayBar').style.width = attendanceBarPercent(attendanceHalfDay);
        document.getElementById('dashboardAppointmentTotal').textContent = appointments.length;
        const pending = appointments.filter(item =>
            String(item.status || 'Pending').toLowerCase() === 'pending'
        ).length;
        document.getElementById('dashboardAppointmentPending').textContent = pending;
        document.getElementById('dashboardAppointmentCompleted').textContent = completed;
        document.getElementById('dashboardAppointmentDonutTotal').textContent = appointments.length;
        const appointmentStatusTotal = pending + completed;
        const appointmentDonut = document.getElementById('dashboardAppointmentDonut');
        if (appointmentStatusTotal) {
            const completedAngle = (completed / appointmentStatusTotal) * 360;
            appointmentDonut.style.setProperty('--completed-angle', `${completedAngle}deg`);
            appointmentDonut.classList.remove('is-empty');
        } else {
            appointmentDonut.classList.add('is-empty');
        }
        const billableAppointments = appointments.filter(item =>
            String(item.status || '').toLowerCase() !== 'cancelled'
        );
        const totalFee = billableAppointments.reduce((sum, item) =>
            sum + (Number(item.fee ?? item.totalFee) || 0), 0
        );
        const totalReceived = billableAppointments.reduce((sum, item) =>
            sum + (Number(item.advance) || 0), 0
        );
        const totalDue = billableAppointments.reduce((sum, item) => {
            const balance = Number(item.balance);
            return sum + (item.balance != null && Number.isFinite(balance)
                ? balance
                : (Number(item.fee ?? item.totalFee) || 0) + (Number(item.prevDues) || 0) - (Number(item.advance) || 0));
        }, 0);
        const formatDashboardMoney = amount => window.formatCorebiqCurrency
            ? window.formatCorebiqCurrency(amount)
            : `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('dashboardFeeTotal').textContent = formatDashboardMoney(totalFee);
        document.getElementById('dashboardFeeReceived').textContent = formatDashboardMoney(totalReceived);
        document.getElementById('dashboardFeeDue').textContent = formatDashboardMoney(totalDue);
        const feeChartMax = Math.max(totalReceived, totalDue, 0);
        const feeChartEndX = amount => 4 + (feeChartMax > 0 ? Math.max(amount, 0) / feeChartMax : 0) * 112;
        const receivedEndX = feeChartEndX(totalReceived);
        const pendingEndX = feeChartEndX(totalDue);
        document.getElementById('dashboardFeeChartReceivedLine').setAttribute('d', `M4 3 V18 H${receivedEndX}`);
        document.getElementById('dashboardFeeChartPendingLine').setAttribute('d', `M4 3 V18 H${pendingEndX}`);
        const attendanceList = document.getElementById('dashboardAttendanceRecords');
        attendanceList.replaceChildren();
        const attendanceRecords = [...attendanceByEmployee.values()]
            .sort((a, b) => String(a.empName || '').localeCompare(String(b.empName || '')));
        if (!attendanceRecords.length) {
            attendanceList.innerHTML = '<div class="dashboard-record-empty">No attendance has been saved today.</div>';
        } else {
            attendanceRecords.forEach(item => {
                const row = document.createElement('div');
                row.className = 'dashboard-record';
                const main = document.createElement('div');
                main.className = 'dashboard-record-main';
                const name = document.createElement('div');
                name.className = 'dashboard-record-name';
                name.textContent = item.empName || 'Unnamed employee';
                const meta = document.createElement('div');
                meta.className = 'dashboard-record-meta';
                meta.textContent = `${item.empType || 'Employee'} · ${item.branch || 'No branch'}${item.notes ? ` · ${item.notes}` : ''}`;
                const status = document.createElement('span');
                status.className = `dashboard-record-status ${String(item.status || '').toLowerCase()}`;
                status.textContent = item.status || 'Unknown';
                main.append(name, meta);
                row.append(main, status);
                attendanceList.appendChild(row);
            });
        }

        const appointmentList = document.getElementById('dashboardAppointmentRecords');
        appointmentList.replaceChildren();
        appointments.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
        if (!appointments.length) {
            appointmentList.innerHTML = '<div class="dashboard-record-empty">No appointments are scheduled today.</div>';
        } else {
            appointments.forEach(item => {
                const row = document.createElement('div');
                row.className = 'dashboard-record';
                const main = document.createElement('div');
                main.className = 'dashboard-record-main';
                const name = document.createElement('div');
                name.className = 'dashboard-record-name';
                name.textContent = item.name || 'Unnamed patient';
                const meta = document.createElement('div');
                meta.className = 'dashboard-record-meta';
                meta.textContent = `${window.formatTime12Hour(item.time)} · ${item.branch || 'No branch'} · ${item.therapist || 'Unassigned therapist'}${item.mobile ? ` · ${item.mobile}` : ''}`;
                const status = document.createElement('span');
                status.className = `dashboard-record-status ${String(item.status || '').toLowerCase()}`;
                status.textContent = item.status || 'Pending';
                main.append(name, meta);
                row.append(main, status);
                appointmentList.appendChild(row);
            });
        }
    } catch (error) {
        if (requestSequence !== dashboardRequestSequence) return;
        console.error('Dashboard Load Error:', error);
        if (errorBanner) errorBanner.style.display = 'flex';
        if (errorText) errorText.textContent = `Data Sync Error: ${error.message || 'Unknown error'}`;
        document.getElementById('dashboardAttendanceRecords').innerHTML =
            '<div class="dashboard-record-empty">Unable to load attendance records.</div>';
        document.getElementById('dashboardAppointmentRecords').innerHTML =
            '<div class="dashboard-record-empty">Unable to load appointments.</div>';
    }
};

window.updateDashboardQuickToolsControls = function() {
    const list = document.getElementById('dashboard-quick-tools-list');
    if (!list) return;

    const controls = document.querySelectorAll('.dashboard-quick-tools-arrow');
    const maxScroll = Math.max(0, list.scrollWidth - list.clientWidth);
    controls[0]?.toggleAttribute('disabled', list.scrollLeft <= 1);
    controls[1]?.toggleAttribute('disabled', maxScroll - list.scrollLeft <= 1);
};

window.scrollDashboardQuickTools = function(direction) {
    const list = document.getElementById('dashboard-quick-tools-list');
    if (!list) return;

    const item = list.querySelector('.dashboard-quick-tool');
    const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
    const distance = item ? item.getBoundingClientRect().width + gap : list.clientWidth;
    list.scrollBy({ left: Math.sign(direction) * distance, behavior: 'smooth' });
};


/* -------------------------------------------------------
   CHART
------------------------------------------------------- */
window.renderChart = function(
    pending,
    completed,
    rescheduled,
    cancelled
) {
    try {
        if (typeof Chart === 'undefined') return;

        const canvas = document.getElementById('apptDonutChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        if (window.apptChartInstance) {
            window.apptChartInstance.destroy();
        }

        const total =
            pending +
            completed +
            rescheduled +
            cancelled;

        const dataValues =
            total === 0
                ? [1]
                : [pending, completed, rescheduled, cancelled];

        const bgColors =
            total === 0
            ? ['#E8EAF0']
            : ['#AAB9D0', '#0B1F4B', '#0B1F4B', '#6B7280'];

        const labels =
            total === 0
                ? ['No Data']
                : ['Pending', 'Completed', 'Rescheduled', 'Cancelled'];

        window.apptChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: bgColors,
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: total > 0 }
                }
            }
        });

    } catch (e) {
        console.warn("Chart rendering skipped:", e);
    }
};



window.loadDashboardCompanyName?.();
window.updateGlobalClock?.();
window.dashboardClockInterval ??= window.setInterval(() => window.updateGlobalClock?.(), 1000);
const quickToolsList = document.getElementById('dashboard-quick-tools-list');
quickToolsList?.addEventListener('scroll', window.updateDashboardQuickToolsControls, { passive: true });
window.addEventListener('resize', window.updateDashboardQuickToolsControls);
window.updateDashboardQuickToolsControls?.();
window.applyLucideIcons?.(document.getElementById('view-dashboard'));
if (window.currentUser) window.fetchDashboardData?.();