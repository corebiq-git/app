export function normalizeDateKey(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return [
            value.getFullYear(),
            String(value.getMonth() + 1).padStart(2, '0'),
            String(value.getDate()).padStart(2, '0')
        ].join('-');
    }

    if (value && typeof value.toDate === 'function') {
        return normalizeDateKey(value.toDate());
    }

    const text = String(value || '').trim();
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dayFirstMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    let year;
    let month;
    let day;

    if (isoMatch) {
        [, year, month, day] = isoMatch;
    } else if (dayFirstMatch) {
        [, day, month, year] = dayFirstMatch;
    } else {
        return '';
    }

    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (
        date.getFullYear() !== Number(year)
        || date.getMonth() !== Number(month) - 1
        || date.getDate() !== Number(day)
    ) {
        return '';
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function legacyDateValues(from, to) {
    const startKey = normalizeDateKey(from);
    const endKey = normalizeDateKey(to);
    if (!startKey || !endKey || startKey > endKey) return [];

    const values = [];
    const current = new Date(`${startKey}T00:00:00`);
    const end = new Date(`${endKey}T00:00:00`);
    while (current <= end) {
        const day = String(current.getDate()).padStart(2, '0');
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const year = current.getFullYear();
        values.push(`${day}-${month}-${year}`, `${day}/${month}/${year}`);
        current.setDate(current.getDate() + 1);
    }
    return values;
}

export function chunkValues(values, size = 30) {
    const chunks = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}
