import { auth, db } from '../../../js/firebase-config.js';
    import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
    import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
    import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

    const statusElement = document.getElementById('usageStatus');
    const dashboard = document.getElementById('usageDashboard');
    const refreshButton = document.getElementById('refreshUsage');
    const functions = getFunctions(undefined, 'us-central1');
    const loadUsage = httpsCallable(functions, 'getFirestoreUsage');
    const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
    const bytesFormat = value => {
      if (value < 1024) return `${numberFormat.format(value)} B`;
      const units = ['KiB', 'MiB', 'GiB', 'TiB'];
      let size = value, unit = -1;
      do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
      return `${numberFormat.format(size)} ${units[unit]}`;
    };
    const formatDate = value => new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles'
    }).format(new Date(`${value}T12:00:00-07:00`));
    const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));

    function renderSummary(data) {
      const cards = [
        { key: 'reads', label: 'Document reads today', quota: data.quotas.reads, icon: 'visibility', format: numberFormat.format },
        { key: 'writes', label: 'Document writes today', quota: data.quotas.writes, icon: 'edit', format: numberFormat.format },
        { key: 'deletes', label: 'Document deletes today', quota: data.quotas.deletes, icon: 'delete', format: numberFormat.format },
        { key: 'storageBytes', label: 'Database storage', quota: data.quotas.storageBytes, icon: 'database', format: bytesFormat }
      ];
      document.getElementById('usageSummary').innerHTML = cards.map(card => {
        const value = Number(data.current[card.key]) || 0;
        const percent = Math.min(100, value / card.quota * 100);
        const progressClass = percent >= 90 ? 'danger' : percent >= 75 ? 'warn' : '';
        const quotaLabel = card.key === 'storageBytes' ? bytesFormat(card.quota) : numberFormat.format(card.quota);
        return `<article class="usage-card">
          <div class="usage-card-top"><span class="usage-card-label">${card.label}</span><span class="usage-card-icon material-symbols-rounded" aria-hidden="true">${card.icon}</span></div>
          <div class="usage-card-value">${card.format(value)}</div>
          <div class="usage-card-caption">${card.key === 'storageBytes' ? 'Current stored database size' : 'Pacific calendar day · partial today'}</div>
          <div class="usage-progress" role="progressbar" aria-label="${card.label} against free-tier reference quota" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent.toFixed(1)}"><span class="${progressClass}" style="width:${percent.toFixed(2)}%"></span></div>
          <div class="usage-progress-label"><span>${percent.toFixed(1)}% of reference</span><span>${quotaLabel} ${card.key === 'storageBytes' ? '' : '/ day'}</span></div>
        </article>`;
      }).join('');
    }

    function renderChart(title, key, values, format, storage = false) {
      const max = Math.max(1, ...values.map(day => Number(day[key]) || 0));
      const bars = values.map(day => {
        const value = Number(day[key]) || 0;
        const height = value ? Math.max(3, value / max * 100) : 0;
        const label = format(value);
        return `<div class="usage-chart-day" title="${escapeHtml(`${formatDate(day.date)}: ${label}`)}">
          <span class="usage-chart-value">${escapeHtml(label)}</span>
          <span class="usage-chart-bar-wrap"><span class="usage-chart-bar${storage ? ' storage' : ''}" style="height:${height.toFixed(2)}%" aria-hidden="true"></span></span>
          <span class="usage-chart-label">${escapeHtml(formatDate(day.date))}</span>
        </div>`;
      }).join('');
      return `<article class="usage-chart-card"><h2>${title}</h2><p class="usage-chart-subtitle">Daily total · last 14 Pacific calendar days</p><div class="usage-chart" role="img" aria-label="${escapeHtml(`${title} daily chart for the last 14 days`)}">${bars}</div></article>`;
    }

    function renderCharts(data) {
      const charts = [
        renderChart('Document reads', 'reads', data.daily, numberFormat.format),
        renderChart('Document writes', 'writes', data.daily, numberFormat.format),
        renderChart('Document deletes', 'deletes', data.daily, numberFormat.format),
        renderChart('Database storage', 'storageBytes', data.daily, bytesFormat, true)
      ];
      document.getElementById('usageCharts').innerHTML = charts.join('');
    }

    async function refresh() {
      refreshButton.disabled = true;
      statusElement.className = 'usage-state';
      statusElement.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">sync</span>Loading Cloud Monitoring metrics…';
      statusElement.hidden = false;
      dashboard.hidden = true;
      try {
        const result = await loadUsage();
        const data = result.data;
        renderSummary(data);
        renderCharts(data);
        document.getElementById('usageSubtitle').textContent = `Default database · ${data.daily.length} days · ${data.timezone}`;
        document.getElementById('usageUpdated').textContent = `Updated ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.lastUpdated))}`;
        dashboard.hidden = false;
        statusElement.hidden = true;
      } catch (error) {
        console.error('Unable to load Firestore usage metrics:', error);
        statusElement.className = 'usage-state error';
        const code = String(error.code || '').replace(/^functions\//, '');
        const message = code === 'not-found'
          ? 'The getFirestoreUsage backend is not deployed to us-central1 in this Firebase project. Sign in to Firebase CLI with "npx firebase-tools login", then deploy it with "npx firebase-tools deploy --only functions:getFirestoreUsage --project cmf001stra".'
          : error.message || 'Usage metrics could not be loaded.';
        statusElement.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">error</span>${escapeHtml(message)}`;
      } finally {
        refreshButton.disabled = false;
      }
    }

    refreshButton.addEventListener('click', refresh);
    onAuthStateChanged(auth, async user => {
      if (!user) {
        window.location.replace(new URL('../../../login.html', import.meta.url));
        return;
      }
      try {
        const email = user.email?.toLowerCase();
        if (!email) throw new Error('Your signed-in account does not have an email address.');
        const profile = await getDoc(doc(db, 'users', email));
        if (!profile.exists() || profile.data().role !== 'admin') {
          throw new Error('Firestore usage is available to administrators only.');
        }
        refreshButton.disabled = false;
        await refresh();
      } catch (error) {
        console.error('Firestore usage access check failed:', error);
        statusElement.className = 'usage-state error';
        statusElement.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">lock</span>${escapeHtml(error.message || 'Unable to verify administrator access.')}`;
      }
    });
