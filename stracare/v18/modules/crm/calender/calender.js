import { auth, db } from '../../../js/firebase-config.js';
    import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
    import { collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

    const root = document.getElementById('calendar-module');
    const state = {
      appointments: [],
      year: new Date().getFullYear(),
      month: new Date().getMonth(),
      selectedDate: localDateKey(new Date()),
      appointmentsByMonth: new Map(),
      appointmentRequests: new Map()
    };

    function localDateKey(date) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
    }

    function formatDate(dateKey, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
      const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return 'Date unavailable';
      return new Intl.DateTimeFormat('en-IN', options).format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    }

    function formatTime(value) {
      const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
      if (!match) return value || 'Time not set';
      let hour = Number(match[1]);
      const minute = match[2];
      const meridiem = match[3]?.toUpperCase();
      if (meridiem) return hour >= 1 && hour <= 12 ? `${String(hour).padStart(2, '0')}:${minute} ${meridiem}` : value;
      if (hour > 23) return value;
      const suffix = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12 || 12;
      return `${String(hour).padStart(2, '0')}:${minute} ${suffix}`;
    }

    function statusClass(status) {
      const normalized = String(status || 'Pending').toLowerCase();
      return ['pending', 'reported', 'completed', 'rescheduled', 'cancelled'].includes(normalized) ? `status-${normalized}` : 'status-pending';
    }

    function appointmentBalance(appointment) {
      const balance = Number(appointment.balance) || 0;
      if (Math.abs(balance) < 0.005) return 'No Due';
      if (balance < 0) return `Excess ₹${Math.abs(balance).toFixed(2)}`;
      return `Due ₹${balance.toFixed(2)}`;
    }

    function renderCalendar() {
      const monthTitle = root.querySelector('#calendarMonthTitle');
      const calendarDays = root.querySelector('#calendarDays');
      const monthCount = root.querySelector('#calendarMonthCount');
      if (!monthTitle || !calendarDays) return;

      monthTitle.textContent = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(state.year, state.month, 1));
      const appointmentsByDate = new Map();
      state.appointments.forEach(appointment => {
        if (!appointment.date) return;
        appointmentsByDate.set(appointment.date, (appointmentsByDate.get(appointment.date) || 0) + 1);
      });
      const monthPrefix = `${state.year}-${String(state.month + 1).padStart(2, '0')}-`;
      if (monthCount) monthCount.textContent = String(state.appointments.filter(appointment => appointment.date?.startsWith(monthPrefix)).length);

      const firstWeekday = new Date(state.year, state.month, 1).getDay();
      const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
      const cells = [];
      for (let index = 0; index < firstWeekday; index += 1) {
        const date = new Date(state.year, state.month, 0 - (firstWeekday - index - 1));
        cells.push(dayCell(date, true, appointmentsByDate));
      }
      for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push(dayCell(new Date(state.year, state.month, day), false, appointmentsByDate));
      }
      const trailing = (7 - cells.length % 7) % 7;
      for (let day = 1; day <= trailing; day += 1) {
        cells.push(dayCell(new Date(state.year, state.month + 1, day), true, appointmentsByDate));
      }
      calendarDays.innerHTML = cells.join('');
      renderAgenda();
    }

    function dayCell(date, outsideMonth, appointmentsByDate) {
      const key = localDateKey(date);
      const count = appointmentsByDate.get(key) || 0;
      const classes = ['day-cell'];
      if (outsideMonth) classes.push('outside-month');
      if (key === localDateKey(new Date())) classes.push('today');
      if (key === state.selectedDate) classes.push('selected');
      if (count) classes.push('has-appointments');
      return `<button class="${classes.join(' ')}" type="button" role="gridcell" aria-label="${escapeHtml(formatDate(key))}${count ? `, ${count} appointment${count === 1 ? '' : 's'}` : ', no appointments'}" aria-pressed="${key === state.selectedDate}" data-date="${key}"><span class="day-number">${date.getDate()}</span><span class="day-count">${count ? `${count} apt${count === 1 ? '' : 's'}` : '0'}</span></button>`;
    }

    function renderAgenda() {
      const agenda = root.querySelector('#calendarAgenda');
      const selectedDate = root.querySelector('#calendarSelectedDate');
      const agendaCount = root.querySelector('#calendarAgendaCount');
      if (!agenda) return;
      const dayAppointments = state.appointments
        .filter(appointment => appointment.date === state.selectedDate)
        .sort((first, second) => String(first.time || '').localeCompare(String(second.time || '')));
      if (selectedDate) selectedDate.textContent = formatDate(state.selectedDate);
      if (agendaCount) agendaCount.textContent = String(dayAppointments.length);
      root.querySelector('#calendarDayCount').textContent = String(dayAppointments.length);
      root.querySelector('#calendarPendingCount').textContent = String(dayAppointments.filter(item => String(item.status || 'Pending').toLowerCase() === 'pending').length);
      root.querySelector('#calendarCompletedCount').textContent = String(dayAppointments.filter(item => String(item.status || '').toLowerCase() === 'completed').length);

      if (!dayAppointments.length) {
        agenda.innerHTML = `<div class="agenda-empty"><span class="material-symbols-rounded" aria-hidden="true">event_busy</span><strong>No appointments for this day</strong><span>Select another date or use the month arrows to see scheduled visits.</span></div>`;
        return;
      }

      agenda.innerHTML = dayAppointments.map(appointment => {
        const status = appointment.status || 'Pending';
        const name = appointment.name || 'Unknown patient';
        const initial = name.trim().charAt(0).toUpperCase() || '?';
        const notes = appointment.notes ? `<div class="detail-item" style="grid-column:1/-1"><div class="detail-label">Notes</div><div class="detail-value">${escapeHtml(appointment.notes)}</div></div>` : '';
        return `<article class="appointment-card">
          <div class="appointment-top">
            <div class="appointment-person"><span class="person-avatar" aria-hidden="true">${escapeHtml(initial)}</span><div><div class="person-name">${escapeHtml(name)}</div><div class="person-mobile">${appointment.mobile ? `+91 ${escapeHtml(appointment.mobile)}` : 'Mobile not provided'}</div></div></div>
            <span class="status-badge ${statusClass(status)}">${escapeHtml(status)}</span>
          </div>
          <div class="appointment-time"><span class="material-symbols-rounded" aria-hidden="true">schedule</span>${escapeHtml(formatTime(appointment.time))}</div>
          <div class="appointment-details">
            <div class="detail-item"><div class="detail-label">Branch</div><div class="detail-value">${escapeHtml(appointment.branch || '—')}</div></div>
            <div class="detail-item"><div class="detail-label">Therapist</div><div class="detail-value">${escapeHtml(appointment.therapist || '—')}</div></div>
            <div class="detail-item"><div class="detail-label">Service / Duration</div><div class="detail-value">${escapeHtml(appointment.duration || '—')}</div></div>
            <div class="detail-item"><div class="detail-label">Fee · Advance</div><div class="detail-value">₹${(Number(appointment.fee) || 0).toFixed(2)} · ₹${(Number(appointment.advance) || 0).toFixed(2)}</div></div>
            <div class="detail-item"><div class="detail-label">Balance</div><div class="detail-value">${escapeHtml(appointmentBalance(appointment))}</div></div>
            ${notes}
          </div>
        </article>`;
      }).join('');
    }

    function moveMonth(offset) {
      const date = new Date(state.year, state.month + offset, 1);
      state.year = date.getFullYear();
      state.month = date.getMonth();
      renderCalendar();
      const user = auth.currentUser;
      if (user) loadAppointments(user);
    }

    async function loadAppointments(user, forceRefresh = false) {
      const requestedYear = state.year;
      const requestedMonth = state.month;
      const agenda = root.querySelector('#calendarAgenda');
      const grid = root.querySelector('#calendarDays');
      agenda.innerHTML = '<div class="loading-state">Loading appointments…</div>';
      grid.innerHTML = '<div class="loading-state" style="grid-column:1/-1">Loading appointments…</div>';
      try {
        let context = window.currentUser;
        if (!context && user.email) {
          const profile = await getDoc(doc(db, 'users', user.email.toLowerCase()));
          if (profile.exists()) {
            const profileData = profile.data();
            context = { role: profileData.role || 'user', branch: profileData.branch || 'Unknown' };
          }
        }
        if (!context) throw new Error('Could not load the signed-in user profile.');
        const branch = context.role === 'admin' ? '' : String(context.branch || '').trim();
        if (context.role !== 'admin' && (!branch || branch === 'Unknown')) {
          throw new Error('Your account does not have an assigned branch.');
        }
        const monthKey = `${requestedYear}-${String(requestedMonth + 1).padStart(2, '0')}`;
        const cacheKey = `${branch}:${monthKey}`;
        let appointments = forceRefresh ? null : state.appointmentsByMonth.get(cacheKey);
        if (!appointments) {
          let request = forceRefresh ? null : state.appointmentRequests.get(cacheKey);
          if (!request) {
            const firstDay = `${monthKey}-01`;
            const lastDay = localDateKey(new Date(requestedYear, requestedMonth + 1, 0));
            const constraints = [
              where('date', '>=', firstDay),
              where('date', '<=', lastDay)
            ];
            if (branch) constraints.unshift(where('branch', '==', branch));
            request = getDocs(query(collection(db, 'appointments'), ...constraints))
              .then(snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
            state.appointmentRequests.set(cacheKey, request);
            request.then(
              records => {
                state.appointmentsByMonth.set(cacheKey, records);
                if (state.appointmentRequests.get(cacheKey) === request) {
                  state.appointmentRequests.delete(cacheKey);
                }
              },
              () => {
                if (state.appointmentRequests.get(cacheKey) === request) {
                  state.appointmentRequests.delete(cacheKey);
                }
              }
            );
          }
          appointments = await request;
        }
        if (state.year !== requestedYear || state.month !== requestedMonth) return;
        if (forceRefresh) state.appointmentsByMonth.set(cacheKey, appointments);
        state.appointments = appointments;
        renderCalendar();
      } catch (error) {
        if (state.year !== requestedYear || state.month !== requestedMonth) return;
        console.error('Unable to load calendar appointments:', error);
        agenda.innerHTML = `<div class="error-state">${escapeHtml(error.message || 'Unable to load calendar appointments. Check Firestore permissions.')}</div>`;
        grid.innerHTML = '<div class="error-state" style="grid-column:1/-1">Calendar could not be loaded.</div>';
      }
    }

    root.querySelector('#calendarPrevMonth').addEventListener('click', () => moveMonth(-1));
    root.querySelector('#calendarNextMonth').addEventListener('click', () => moveMonth(1));
    root.querySelector('#calendarDays').addEventListener('click', event => {
      const cell = event.target.closest('[data-date]');
      if (!cell) return;
      state.selectedDate = cell.dataset.date;
      const date = new Date(`${state.selectedDate}T00:00:00`);
      state.year = date.getFullYear();
      state.month = date.getMonth();
      renderCalendar();
      const user = auth.currentUser;
      if (user) loadAppointments(user);
    });
    root.querySelector('#calendarTodayButton').addEventListener('click', () => {
      const today = new Date();
      state.selectedDate = localDateKey(today);
      state.year = today.getFullYear();
      state.month = today.getMonth();
      renderCalendar();
      const user = auth.currentUser;
      if (user) loadAppointments(user);
    });
    root.querySelector('#calendarRefreshButton').addEventListener('click', () => {
      const user = auth.currentUser;
      if (user) loadAppointments(user, true);
    });

    renderCalendar();

    onAuthStateChanged(auth, user => {
      if (!user) {
        root.querySelector('#calendarAgenda').innerHTML = '<div class="error-state">Please sign in to view the appointment calendar.</div>';
        root.querySelector('#calendarDays').innerHTML = '<div class="error-state" style="grid-column:1/-1">Sign-in required.</div>';
        return;
      }
      loadAppointments(user);
    });
