import { auth, db } from './firebase-config.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

const currency = value => `₹${(Number(value) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
})}`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function belongsInLedger(transaction, kind) {
    const mode = String(transaction.mode || '').trim().toLowerCase();
    if (kind === 'cash') return mode === 'cash';
    return mode !== '' && mode !== 'cash' && mode !== 'credit';
}

export function initializeLedgerView(kind) {
    const prefix = kind === 'cash' ? 'cash' : 'bank';
    const root = document.getElementById(`${prefix}-ledger-module`);
    if (!root) return;

    const elements = {
        body: root.querySelector(`#${prefix}LedgerRows`),
        from: root.querySelector(`#${prefix}LedgerFrom`),
        to: root.querySelector(`#${prefix}LedgerTo`),
        type: root.querySelector(`#${prefix}LedgerType`),
        branch: root.querySelector(`#${prefix}LedgerBranch`),
        search: root.querySelector(`#${prefix}LedgerSearch`),
        count: root.querySelector(`#${prefix}LedgerCount`),
        totalIn: root.querySelector(`#${prefix}LedgerIn`),
        totalOut: root.querySelector(`#${prefix}LedgerOut`),
        balance: root.querySelector(`#${prefix}LedgerBalance`)
    };

    let records = [];
    let loaded = false;

    function render() {
        const from = elements.from.value;
        const to = elements.to.value;
        const type = elements.type.value.toLowerCase();
        const branch = elements.branch.value;
        const term = elements.search.value.trim().toLowerCase();
        const visible = records.filter(({ data }) => {
            const date = String(data.date || '');
            const searchable = `${data.name || ''} ${data.mobile || ''} ${data.txnId || ''} ${data.ref || ''} ${data.notes || ''} ${data.branch || ''}`.toLowerCase();
            return (!from || date >= from)
                && (!to || date <= to)
                && (!type || String(data.type || '').toLowerCase() === type)
                && (!branch || String(data.branch || '').toLowerCase() === branch)
                && (!term || searchable.includes(term));
        });
        visible.sort((a, b) =>
            String(b.data.date || '').localeCompare(String(a.data.date || ''))
            || String(b.data.txnId || '').localeCompare(String(a.data.txnId || ''))
        );

        const totalIn = visible.reduce((sum, item) => sum + (Number(item.data.cashIn) || 0), 0);
        const totalOut = visible.reduce((sum, item) => sum + (Number(item.data.cashOut) || 0), 0);
        elements.totalIn.textContent = currency(totalIn);
        elements.totalOut.textContent = currency(totalOut);
        elements.balance.textContent = currency(totalIn - totalOut);
        elements.count.textContent = `${visible.length} record${visible.length === 1 ? '' : 's'}`;

        if (!visible.length) {
            elements.body.innerHTML = `<tr><td colspan="7" class="empty">${records.length ? 'No transactions match these filters.' : `No ${kind} transactions found.`}</td></tr>`;
            return;
        }
        elements.body.innerHTML = visible.map(({ data }) => `<tr>
            <td><strong>${escapeHtml(data.date || '—')}</strong><br><span style="color:#64748b;font-size:10px">${escapeHtml(data.txnId || '—')}</span></td>
            <td><strong>${escapeHtml(data.name || '—')}</strong><br><span style="color:#64748b;font-size:11px">${escapeHtml(data.mobile || '—')}</span></td>
            <td>${escapeHtml(data.branch || 'Unassigned')}</td>
            <td><span class="tag">${escapeHtml(data.type || 'Transaction')}</span><br><span style="color:#64748b;font-size:11px">${escapeHtml(data.mode || '—')}</span></td>
            <td style="text-align:right" class="amount-in">${Number(data.cashIn) > 0 ? currency(data.cashIn) : '—'}</td>
            <td style="text-align:right" class="amount-out">${Number(data.cashOut) > 0 ? currency(data.cashOut) : '—'}</td>
            <td>${escapeHtml([data.ref, data.notes].filter(Boolean).join(' · ') || '—')}</td>
        </tr>`).join('');
    }

    window.clearLedgerFilters = requestedKind => {
        if (requestedKind !== kind) return;
        elements.from.value = '';
        elements.to.value = '';
        elements.type.value = '';
        elements.branch.value = '';
        elements.search.value = '';
        render();
    };
    window.openView = target => {
        if (target === 'view-transaction') window.switchView(target, null);
    };

    [elements.from, elements.to, elements.type, elements.branch, elements.search].forEach(control => {
        control.addEventListener('input', render);
        control.addEventListener('change', render);
    });

    onAuthStateChanged(auth, async user => {
        if (!user) {
            elements.body.innerHTML = '<tr><td colspan="7" class="empty error">Sign in to view ledger transactions.</td></tr>';
            return;
        }
        if (loaded) return;
        loaded = true;
        elements.body.innerHTML = '<tr><td colspan="7" class="empty">Loading transactions…</td></tr>';
        try {
            const currentUser = window.currentUser;
            if (!currentUser) throw new Error('User profile is not ready. Reopen this ledger in a moment.');
            let transactionQuery = collection(db, 'transactions');
            if (currentUser.role !== 'admin') {
                if (!currentUser.branch) throw new Error('Your account does not have an assigned branch.');
                transactionQuery = query(
                    collection(db, 'transactions'),
                    where('branch', '==', currentUser.branch)
                );
            }
            const snapshot = await getDocs(transactionQuery);
            records = snapshot.docs
                .map(document => ({ id: document.id, data: document.data() }))
                .filter(record => belongsInLedger(record.data, kind));
            const branches = [...new Set(records.map(record => String(record.data.branch || '').trim()).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b));
            branches.forEach(name => {
                const option = document.createElement('option');
                option.value = name.toLowerCase();
                option.textContent = name;
                elements.branch.appendChild(option);
            });
            render();
        } catch (error) {
            loaded = false;
            console.error(`Could not load ${kind} ledger:`, error);
            elements.body.innerHTML = `<tr><td colspan="7" class="empty error">${escapeHtml(error.message || 'Unable to load transactions. Check Firestore permissions.')}</td></tr>`;
        }
    });
}
