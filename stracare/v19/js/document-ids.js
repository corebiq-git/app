import {
    collection,
    doc,
    getDoc,
    getDocs,
    runTransaction,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

export const DOCUMENT_ID_CONFIG = Object.freeze([
    { collection: 'appointments', prefix: 'APT' },
    { collection: 'branches', prefix: 'BRA' },
    { collection: 'daily_attendance', prefix: 'ATT' },
    { collection: 'patients', prefix: 'PAT' },
    { collection: 'staff', prefix: 'STA' },
    { collection: 'therapists', prefix: 'THE' },
    { collection: 'transactions', prefix: 'TRA' }
]);

function parseDocumentId(id, prefix) {
    const match = String(id || '').match(new RegExp(`^${prefix}-(\\d{4,})$`));
    return match ? Number(match[1]) : null;
}

async function initializeCounter(db, collectionName, prefix) {
    const counterRef = doc(db, 'id_counters', collectionName);
    if ((await getDoc(counterRef)).exists()) return;

    const existingDocuments = await getDocs(collection(db, collectionName));
    const lastIssued = existingDocuments.docs.reduce((highest, snapshot) => {
        const number = parseDocumentId(snapshot.id, prefix);
        return number === null ? highest : Math.max(highest, number);
    }, 0);

    await runTransaction(db, async transaction => {
        const counter = await transaction.get(counterRef);
        if (!counter.exists()) {
            transaction.set(counterRef, { lastIssued, updatedAt: serverTimestamp() });
        }
    });
}

export async function initializeDocumentIdCounters(db) {
    for (const { collection: collectionName, prefix } of DOCUMENT_ID_CONFIG) {
        await initializeCounter(db, collectionName, prefix);
    }
}

export async function reserveNextDocumentIds(db, collectionName, prefix, count = 1, canInitialize = false) {
    if (!Number.isInteger(count) || count < 1 || count > 500) {
        throw new Error('Document ID reservation count must be between 1 and 500.');
    }

    const counterRef = doc(db, 'id_counters', collectionName);
    if (!(await getDoc(counterRef)).exists()) {
        if (!canInitialize) {
            throw new Error(`Sequential IDs for ${collectionName} are not initialized. Ask an administrator to open the dashboard once.`);
        }
        await initializeCounter(db, collectionName, prefix);
    }

    return runTransaction(db, async transaction => {
        const counter = await transaction.get(counterRef);
        if (!counter.exists()) {
            throw new Error(`Sequential IDs for ${collectionName} are not initialized. Ask an administrator to open the dashboard once.`);
        }
        const lastIssued = Number(counter.data().lastIssued);
        if (!Number.isSafeInteger(lastIssued) || lastIssued < 0) {
            throw new Error(`The ${collectionName} ID counter is invalid.`);
        }
        const first = lastIssued + 1;
        transaction.update(counterRef, {
            lastIssued: lastIssued + count,
            updatedAt: serverTimestamp()
        });
        return Array.from({ length: count }, (_, index) =>
            `${prefix}-${String(first + index).padStart(4, '0')}`
        );
    });
}

export async function advanceDocumentIdCounter(db, collectionName, prefix, ids, canInitialize = false) {
    const highestImported = ids
        .map(id => parseDocumentId(id, prefix))
        .filter(Number.isSafeInteger)
        .reduce((highest, number) => Math.max(highest, number), 0);
    if (!highestImported) return;

    const counterRef = doc(db, 'id_counters', collectionName);
    if (!(await getDoc(counterRef)).exists()) {
        if (!canInitialize) {
            throw new Error(`Sequential IDs for ${collectionName} are not initialized. Ask an administrator to open the dashboard once.`);
        }
        await initializeCounter(db, collectionName, prefix);
    }
    await runTransaction(db, async transaction => {
        const counter = await transaction.get(counterRef);
        if (!counter.exists()) {
            throw new Error(`Sequential IDs for ${collectionName} are not initialized.`);
        }
        const lastIssued = Number(counter.data().lastIssued);
        if (highestImported > lastIssued) {
            transaction.update(counterRef, {
                lastIssued: highestImported,
                updatedAt: serverTimestamp()
            });
        }
    });
}
