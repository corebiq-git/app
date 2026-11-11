import { auth, db } from '../../../js/firebase-config.js'; 
        import { advanceDocumentIdCounter, DOCUMENT_ID_CONFIG } from '../../../js/document-ids.js';
        import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
        import { collection, query, where, getDocs, getDoc, doc, documentId, orderBy, limit, startAfter, runTransaction, Timestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

        const MODULE_CSV_CONFIG = Object.freeze({
            appointments: { label: 'Appointments', prefix: 'APT', idField: 'id', dedicatedImport: true, fields: ['mobile', 'name', 'age', 'gender', 'category', 'location', 'patientNotes', 'branch', 'date', 'time', 'previousDate', 'previousTime', 'duration', 'sessionsPerDay', 'therapist', 'status', 'fee', 'advance', 'prevDues', 'notes', 'paymentMode', 'paymentReference', 'paymentRemarks'] },
            booking_requests: { label: 'Booking Requests', prefix: 'BKR', fields: ['branch', 'date', 'time', 'name', 'mobile', 'status', 'createdAt'] },
            branches: { label: 'Branches', prefix: 'BRA', idField: 'branchId', fields: ['branchId', 'name', 'address', 'location', 'mobile', 'phone', 'email', 'status'] },
            daily_attendance: { label: 'Attendance', prefix: 'ATT', idField: 'id', fields: ['date', 'empId', 'empName', 'empType', 'branch', 'status', 'notes', 'createdAt', 'updatedAt'] },
            estimates: { label: 'Estimates', prefix: 'EST', fields: ['name', 'mobile', 'date', 'branch', 'description', 'fee', 'advance', 'balance', 'createdAt'] },
            leave_requests: { label: 'Leave Requests', prefix: 'LVR', fields: ['date', 'empId', 'empName', 'empType', 'branch', 'reason', 'status', 'createdAt'] },
            ledger_categories: { label: 'Ledger Categories', prefix: 'LCT', fields: ['name', 'type', 'branch'] },
            ledgers: { label: 'Ledgers', prefix: 'LDG', fields: ['ledgerNo', 'name', 'category', 'opType', 'opAmt', 'otherInfo', 'createdAt', 'updatedAt'] },
            patients: { label: 'Patients', prefix: 'PAT', idField: 'patientId', fields: ['patientId', 'name', 'mobile', 'age', 'gender', 'category', 'branch', 'address', 'location', 'notes', 'createdAt'] },
            staff: { label: 'Staff', prefix: 'STA', idField: 'empId', fields: ['empId', 'name', 'mobile', 'email', 'role', 'branch', 'contact', 'createdAt', 'updatedAt'] },
            therapists: { label: 'Therapists', prefix: 'THE', idField: 'therapistId', fields: ['therapistId', 'name', 'specialisation', 'branch', 'contact', 'mobile', 'createdAt', 'updatedAt'] },
            transactions: { label: 'Transactions', prefix: 'TRA', idField: 'txnId', fields: ['txnId', 'date', 'type', 'branch', 'mobile', 'name', 'mode', 'ref', 'cashIn', 'cashOut', 'notes', 'createdAt', 'updatedAt'] }
        });

        // --- AUTH GATEKEEPER ---
        onAuthStateChanged(auth, (user) => {
            if (!user) {
                document.getElementById('export-module').innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; background: #FEF2F2; border-radius: 16px; border: 1px solid #FCA5A5; margin-top: 20px;">
                        <span class="material-symbols-rounded" style="font-size: 48px; color: #EF4444; margin-bottom: 12px;">gpp_bad</span>
                        <h2 style="color: #991B1B; margin-bottom: 8px;">Access Denied</h2>
                        <p style="color: #7F1D1D; font-size: 14px;">You must be logged into the administrative dashboard to view this module.</p>
                    </div>
                `;
                return; 
            }

            // Show full backup option only for admins
            if (window.currentUser && window.currentUser.role === 'admin') {
                document.getElementById('admin-backup-card').style.display = 'block';
                document.getElementById('admin-import-card').style.display = 'block';
                document.getElementById('admin-module-import-card').style.display = 'block';
            }
        });

        // --- CSV GENERATOR HELPER ---
        function convertToCSV(objArray) {
            if (!objArray || objArray.length === 0) return '';
            const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
            let str = '';
            
            // Extract all unique keys across all objects to form headers
            let headersSet = new Set();
            array.forEach(item => {
                Object.keys(item).forEach(key => headersSet.add(key));
            });
            const headers = Array.from(headersSet);
            str += headers.join(',') + '\r\n';

            // Extract values
            for (let i = 0; i < array.length; i++) {
                let line = '';
                for (let index in headers) {
                    if (line !== '') line += ',';
                    let key = headers[index];
                    let val = array[i][key];
                    
                    if(val === null || val === undefined) val = '';
                    else if (typeof val === 'object') {
                        // Handle Firestore Timestamps
                        if (val.seconds) {
                            val = new Date(val.seconds * 1000).toLocaleString();
                        } else {
                            val = JSON.stringify(val).replace(/"/g, '""');
                        }
                    }
                    
                    val = String(val);
                    if (/^\s*[=+\-@]/.test(val)) val = `'${val}`;
                    val = val.replace(/"/g, '""');
                    line += '"' + val + '"';
                }
                str += line + '\r\n';
            }
            return str;
        }

        function convertBackupRecordsToCSV(records) {
            const headers = [...new Set(records.flatMap(record => Object.keys(record)))].sort((a, b) => {
                if (a === 'id') return -1;
                if (b === 'id') return 1;
                return a.localeCompare(b);
            });
            if (!headers.includes('id')) headers.unshift('id');

            const normalizeNestedValue = value => {
                if (value instanceof Date) return value.toISOString();
                if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
                if (Array.isArray(value)) return value.map(normalizeNestedValue);
                if (value && typeof value === 'object') {
                    return Object.fromEntries(
                        Object.entries(value).map(([key, nestedValue]) => [key, normalizeNestedValue(nestedValue)])
                    );
                }
                return value;
            };
            const cellValue = value => {
                if (value === null || value === undefined) return '';
                if (value instanceof Date) return value.toISOString();
                if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
                if (typeof value === 'object') {
                    return JSON.stringify(normalizeNestedValue(value));
                }
                if (typeof value === 'string' && (/^\s*[=+\-@]/.test(value) || /^'\s*[=+\-@]/.test(value))) {
                    return `'${value}`;
                }
                return String(value);
            };
            const quote = value => `"${cellValue(value).replace(/"/g, '""')}"`;
            const rows = [
                headers.map(quote).join(','),
                ...records.map(record => headers.map(header => quote(record[header])).join(','))
            ];
            return `\uFEFF${rows.join('\r\n')}\r\n`;
        }

        function downloadFile(content, fileName, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        }

        function selectedModuleCsvConfig() {
            const collectionName = document.getElementById('exportModule').value;
            const config = MODULE_CSV_CONFIG[collectionName];
            if (!config) throw new Error('Select a supported data module first.');
            return { collectionName, config };
        }

        function moduleCsvDelimiter(text) {
            const firstLine = String(text).split(/\r?\n/, 1)[0];
            return (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
        }

        function moduleCsvValue(field, value) {
            value = String(value ?? '');
            if (value === '') return '';
            if (/^(date|previousDate|startDate|endDate|dueDate)$/i.test(field)) {
                const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
                if (match) return `${match[3]}-${match[2]}-${match[1]}`;
            }
            if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
                return restoreCsvValue(value);
            }
            if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
                return restoreCsvValue(value, value.startsWith('[') ? 'array' : 'object');
            }
            if (/^(fee|advance|balance|prevDues|age|sessionsPerDay|salary|amount|quantity|qty|rate|tax|total|subtotal|duration|count)$/i.test(field)
                && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
                return restoreCsvValue(value, 'number');
            }
            return restoreCsvValue(value, 'string');
        }

        function nextModuleCsvId(config, records) {
            const idPattern = new RegExp(`^${config.prefix}-(\\d{4,})$`);
            return records.reduce((next, record) => {
                const match = String(record.id || '').match(idPattern);
                return match ? Math.max(next, Number(match[1]) + 1) : next;
            }, 1);
        }

        function moduleSampleValue(field) {
            if (/^(date|startDate|endDate|dueDate)$/i.test(field)) return new Date().toISOString().slice(0, 10);
            if (/^(time|checkIn|checkOut)$/i.test(field)) return '09:00';
            if (/^(mobile|phone)$/i.test(field)) return '9999999999';
            if (/^(fee|advance|balance|prevDues|age|sessionsPerDay|salary|amount|quantity|qty|rate|tax|total|subtotal|duration|count)$/i.test(field)) return '0';
            if (/^status$/i.test(field)) return 'Pending';
            if (/^branch$/i.test(field)) return 'Sample Branch';
            if (/^(name|title|description|category|type|gender|location|address|specialization|designation|employeeName|customerName)$/i.test(field)) {
                return `Sample ${field.charAt(0).toUpperCase()}${field.slice(1)}`;
            }
            return '';
        }

        window.downloadModuleSampleCSV = function() {
            try {
                const { collectionName, config } = selectedModuleCsvConfig();
                const record = Object.fromEntries(config.fields.map(field => [field, moduleSampleValue(field)]));
                record.id = `${config.prefix}-0001`;
                if (config.idField && config.idField !== 'id') record[config.idField] = record.id;
                downloadFile(
                    convertBackupRecordsToCSV([record]),
                    `COREBIQ_${collectionName.toUpperCase()}_SAMPLE.csv`,
                    'text/csv;charset=utf-8;'
                );
            } catch (error) {
                alert(error.message);
            }
        };

        let moduleImportReport = [];
        window.downloadModuleImportReport = function() {
            if (!moduleImportReport.length) return;
            downloadFile(
                convertToCSV(moduleImportReport),
                `COREBIQ_MODULE_IMPORT_REPORT_${new Date().toISOString().slice(0, 10)}.csv`,
                'text/csv;charset=utf-8;'
            );
        };

        window.importModuleCSV = async function() {
            const button = document.getElementById('moduleImportBtn');
            const fileInput = document.getElementById('moduleImportFile');
            const reportButton = document.getElementById('moduleImportReportBtn');
            const status = document.getElementById('moduleImportStatus');
            if (window.currentUser?.role !== 'admin') {
                alert('Only an administrator can import module CSV files.');
                return;
            }
            const file = fileInput.files?.[0];
            if (!file) {
                alert('Select a module CSV file first.');
                return;
            }

            let collectionName;
            let config;
            let added = 0;
            let skipped = 0;
            moduleImportReport = [];
            reportButton.hidden = true;
            try {
                ({ collectionName, config } = selectedModuleCsvConfig());
                if (config.dedicatedImport) {
                    throw new Error('Import appointments from Appointments → More Actions → Import CSV so linked patient and transaction records are handled correctly.');
                }
                if (!window.confirm(`Import this ${config.label} CSV? Existing records will not be overwritten.`)) return;
                button.disabled = true;
                fileInput.disabled = true;
                status.textContent = 'Validating CSV...';

                const text = await file.text();
                const rows = parseCsv(text, moduleCsvDelimiter(text), false);
                if (!rows.length) throw new Error('The CSV contains no data rows.');
                const existingRecords = await getAllCollectionDocuments(collectionName);
                let nextNumber = nextModuleCsvId(config, existingRecords);
                const seenIds = new Set();
                const records = [];
                const idPattern = new RegExp(`^${config.prefix}-\\d{4,}$`);

                rows.forEach((row, index) => {
                    let id = Object.entries(row).find(([field]) => field.trim().toLowerCase() === 'id')?.[1]?.trim() || '';
                    if (!id) {
                        id = `${config.prefix}-${String(nextNumber).padStart(4, '0')}`;
                        nextNumber += 1;
                    } else if (!idPattern.test(id)) {
                        moduleImportReport.push({ collection: collectionName, id, row: index + 2, reason: `ID must use ${config.prefix}-0001 format` });
                        skipped += 1;
                        return;
                    } else {
                        nextNumber = Math.max(nextNumber, Number(id.slice(config.prefix.length + 1)) + 1);
                    }
                    if (seenIds.has(id)) {
                        moduleImportReport.push({ collection: collectionName, id, row: index + 2, reason: 'duplicate ID in CSV' });
                        skipped += 1;
                        return;
                    }
                    seenIds.add(id);
                    const data = {};
                    for (const [field, value] of Object.entries(row)) {
                        const trimmedField = field.trim();
                        if (trimmedField.toLowerCase() === 'id') continue;
                        data[trimmedField] = moduleCsvValue(trimmedField, value);
                    }
                    if (config.idField) {
                        data.id = id;
                        if (config.idField !== 'id') data[config.idField] = id;
                    }
                    records.push({ id, data });
                });

                let completed = 0;
                if (config.idField) {
                    await advanceDocumentIdCounter(
                        db, collectionName, config.prefix, records.map(record => record.id), true
                    );
                }
                for (const chunk of chunkImportRecords(records)) {
                    const createdIds = await runTransaction(db, async transaction => {
                        const references = chunk.map(record => backupDocumentReference(collectionName, record.id));
                        const snapshots = [];
                        for (const reference of references) snapshots.push(await transaction.get(reference));
                        const created = [];
                        snapshots.forEach((snapshot, index) => {
                            if (snapshot.exists()) return;
                            transaction.set(references[index], chunk[index].data);
                            created.push(chunk[index].id);
                        });
                        return created;
                    });
                    const createdSet = new Set(createdIds);
                    added += createdIds.length;
                    chunk.forEach(record => {
                        if (!createdSet.has(record.id)) {
                            skipped += 1;
                            moduleImportReport.push({
                                collection: collectionName,
                                id: record.id,
                                reason: 'document ID already exists'
                            });
                        }
                    });
                    completed += chunk.length;
                    status.textContent = `Imported ${completed.toLocaleString()} of ${records.length.toLocaleString()} rows...`;
                }

                reportButton.hidden = moduleImportReport.length === 0;
                status.textContent = `Import complete. Added ${added.toLocaleString()} records; skipped ${skipped.toLocaleString()}.`;
                alert(status.textContent);
            } catch (error) {
                console.error('Module CSV import failed:', error);
                reportButton.hidden = moduleImportReport.length === 0;
                status.textContent = `Import stopped after adding ${added.toLocaleString()} records and skipping ${skipped.toLocaleString()}. ${error.message}`;
                alert(status.textContent);
            } finally {
                button.disabled = false;
                fileInput.disabled = false;
                fileInput.value = '';
            }
        };

        function createZipBlob(files) {
            const encoder = new TextEncoder();
            const crcTable = new Uint32Array(256);
            for (let index = 0; index < crcTable.length; index += 1) {
                let value = index;
                for (let bit = 0; bit < 8; bit += 1) {
                    value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
                }
                crcTable[index] = value >>> 0;
            }

            const crc32 = bytes => {
                let crc = 0xFFFFFFFF;
                for (const byte of bytes) {
                    crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
                }
                return (crc ^ 0xFFFFFFFF) >>> 0;
            };
            const write16 = (view, offset, value) => view.setUint16(offset, value, true);
            const write32 = (view, offset, value) => view.setUint32(offset, value >>> 0, true);
            const now = new Date();
            const zipTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
            const zipDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
            const localParts = [];
            const centralParts = [];
            let localSize = 0;
            let centralSize = 0;

            files.forEach(file => {
                const name = encoder.encode(file.name);
                const data = encoder.encode(file.content);
                if (name.length > 0xFFFF || data.length > 0xFFFFFFFF || localSize > 0xFFFFFFFF) {
                    throw new Error('The ZIP backup exceeds the supported ZIP archive size.');
                }
                const checksum = crc32(data);
                const localHeader = new Uint8Array(30);
                const localView = new DataView(localHeader.buffer);
                write32(localView, 0, 0x04034B50);
                write16(localView, 4, 20);
                write16(localView, 6, 0x0800);
                write16(localView, 8, 0);
                write16(localView, 10, zipTime);
                write16(localView, 12, zipDate);
                write32(localView, 14, checksum);
                write32(localView, 18, data.length);
                write32(localView, 22, data.length);
                write16(localView, 26, name.length);
                write16(localView, 28, 0);
                localParts.push(localHeader, name, data);

                const centralHeader = new Uint8Array(46);
                const centralView = new DataView(centralHeader.buffer);
                write32(centralView, 0, 0x02014B50);
                write16(centralView, 4, 20);
                write16(centralView, 6, 20);
                write16(centralView, 8, 0x0800);
                write16(centralView, 10, 0);
                write16(centralView, 12, zipTime);
                write16(centralView, 14, zipDate);
                write32(centralView, 16, checksum);
                write32(centralView, 20, data.length);
                write32(centralView, 24, data.length);
                write16(centralView, 28, name.length);
                write16(centralView, 30, 0);
                write16(centralView, 32, 0);
                write16(centralView, 34, 0);
                write16(centralView, 36, 0);
                write32(centralView, 38, 0);
                write32(centralView, 42, localSize);
                centralParts.push(centralHeader, name);

                localSize += localHeader.length + name.length + data.length;
                centralSize += centralHeader.length + name.length;
            });

            if (files.length > 0xFFFF || localSize > 0xFFFFFFFF || centralSize > 0xFFFFFFFF) {
                throw new Error('The ZIP backup exceeds the supported ZIP archive size.');
            }
            const endRecord = new Uint8Array(22);
            const endView = new DataView(endRecord.buffer);
            write32(endView, 0, 0x06054B50);
            write16(endView, 4, 0);
            write16(endView, 6, 0);
            write16(endView, 8, files.length);
            write16(endView, 10, files.length);
            write32(endView, 12, centralSize);
            write32(endView, 16, localSize);
            write16(endView, 20, 0);

            return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
        }

        function readStoredZipEntries(buffer) {
            const bytes = new Uint8Array(buffer);
            const view = new DataView(buffer);
            const decoder = new TextDecoder();
            const entries = new Map();
            const crcTable = new Uint32Array(256);
            for (let index = 0; index < crcTable.length; index += 1) {
                let value = index;
                for (let bit = 0; bit < 8; bit += 1) {
                    value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
                }
                crcTable[index] = value >>> 0;
            }
            let offset = 0;
            while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034B50) {
                const flags = view.getUint16(offset + 6, true);
                const method = view.getUint16(offset + 8, true);
                const checksum = view.getUint32(offset + 14, true);
                const compressedSize = view.getUint32(offset + 18, true);
                const uncompressedSize = view.getUint32(offset + 22, true);
                const nameLength = view.getUint16(offset + 26, true);
                const extraLength = view.getUint16(offset + 28, true);
                const nameStart = offset + 30;
                const dataStart = nameStart + nameLength + extraLength;
                const dataEnd = dataStart + compressedSize;
                if ((flags & 0x0009) !== 0 || method !== 0 || compressedSize !== uncompressedSize || dataEnd > bytes.length) {
                    throw new Error('Unsupported or invalid ZIP entry. Select a CSV ZIP downloaded from COREBIQ.');
                }
                const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
                if (name.includes('..') || name.startsWith('/') || entries.has(name)) {
                    throw new Error('The ZIP contains an invalid or duplicate file path.');
                }
                const data = bytes.subarray(dataStart, dataEnd);
                let actualChecksum = 0xFFFFFFFF;
                for (const byte of data) {
                    actualChecksum = crcTable[(actualChecksum ^ byte) & 0xFF] ^ (actualChecksum >>> 8);
                }
                actualChecksum = (actualChecksum ^ 0xFFFFFFFF) >>> 0;
                if (actualChecksum !== checksum) throw new Error(`The ZIP entry ${name} is corrupted.`);
                entries.set(name, decoder.decode(data));
                offset = dataEnd;
            }
            if (!entries.size) throw new Error('The ZIP archive is empty or uses an unsupported format.');
            return entries;
        }

        function parseCsv(text, delimiter = ',', requireId = true) {
            const rows = [];
            let row = [];
            let value = '';
            let quoted = false;
            const source = text.replace(/^\uFEFF/, '');
            for (let index = 0; index < source.length; index += 1) {
                const character = source[index];
                if (quoted) {
                    if (character === '"' && source[index + 1] === '"') {
                        value += '"';
                        index += 1;
                    } else if (character === '"') {
                        quoted = false;
                    } else {
                        value += character;
                    }
                } else if (character === '"' && value === '') {
                    quoted = true;
                } else if (character === delimiter) {
                    row.push(value);
                    value = '';
                } else if (character === '\n' || character === '\r') {
                    if (character === '\r' && source[index + 1] === '\n') index += 1;
                    row.push(value);
                    if (row.some(cell => cell !== '')) rows.push(row);
                    row = [];
                    value = '';
                } else {
                    value += character;
                }
            }
            if (quoted) throw new Error('A CSV file contains an unterminated quoted field.');
            if (value !== '' || row.length) {
                row.push(value);
                if (row.some(cell => cell !== '')) rows.push(row);
            }
            if (!rows.length) throw new Error('A collection CSV is empty.');
            const headers = rows.shift().map(header => header.trim());
            if (headers.some(header => !header) || new Set(headers).size !== headers.length) {
                throw new Error('A CSV file has missing or duplicate column names.');
            }
            if (requireId && !headers.includes('id')) throw new Error('Each collection CSV must include an id column.');
            return rows.map((cells, rowIndex) => {
                if (cells.length !== headers.length) {
                    throw new Error(`CSV row ${rowIndex + 2} has ${cells.length} values; expected ${headers.length}.`);
                }
                return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
            });
        }

        function restoreCsvValue(value, type) {
            if (type === 'null') return null;
            if (type === 'number') {
                const number = Number(value);
                if (!Number.isFinite(number)) throw new Error(`Invalid number in backup CSV: ${value}`);
                return number;
            }
            if (type === 'boolean') {
                if (value !== 'true' && value !== 'false') throw new Error(`Invalid boolean in backup CSV: ${value}`);
                return value === 'true';
            }
            if (type === 'timestamp') {
                const date = new Date(value);
                if (!Number.isFinite(date.getTime())) throw new Error(`Invalid timestamp in backup CSV: ${value}`);
                return Timestamp.fromDate(date);
            }
            if (type === 'object' || type === 'array') {
                let parsed;
                try {
                    parsed = JSON.parse(value);
                } catch {
                    throw new Error('A nested object or array in the CSV is not valid JSON.');
                }
                if ((type === 'array') !== Array.isArray(parsed) || (type === 'object' && (!parsed || Array.isArray(parsed) || typeof parsed !== 'object'))) {
                    throw new Error(`A CSV cell does not match its expected ${type} type.`);
                }
                return restoreNestedTimestamps(parsed);
            }
            if (type === 'string' && value.startsWith("'")) {
                const original = value.slice(1);
                if (/^\s*[=+\-@]/.test(original) || /^'\s*[=+\-@]/.test(original)) return original;
            }
            if (!type && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
                const date = new Date(value);
                if (Number.isFinite(date.getTime())) return Timestamp.fromDate(date);
            }
            return value;
        }

        function restoreNestedTimestamps(value) {
            if (typeof value === 'string') {
                if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
                    const date = new Date(value);
                    if (Number.isFinite(date.getTime())) return Timestamp.fromDate(date);
                }
                return value;
            }
            if (Array.isArray(value)) return value.map(restoreNestedTimestamps);
            if (value && typeof value === 'object') {
                return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [
                    key,
                    restoreNestedTimestamps(nestedValue)
                ]));
            }
            return value;
        }

        function backupDocumentReference(collectionName, id) {
            return collectionName === 'settings'
                ? doc(db, 'settings', id)
                : doc(collection(db, collectionName), id);
        }

        function chunkImportRecords(records) {
            const chunks = [];
            let chunk = [];
            let chunkSize = 0;
            const maxChunkSize = 5 * 1024 * 1024;
            const encoder = new TextEncoder();
            records.forEach(record => {
                const recordSize = encoder.encode(JSON.stringify(record.data)).length;
                if (recordSize > 900 * 1024) {
                    throw new Error(`Document ${record.id} is too large to safely import.`);
                }
                if (chunk.length && (chunk.length >= 200 || chunkSize + recordSize > maxChunkSize)) {
                    chunks.push(chunk);
                    chunk = [];
                    chunkSize = 0;
                }
                chunk.push(record);
                chunkSize += recordSize;
            });
            if (chunk.length) chunks.push(chunk);
            return chunks;
        }

        function getBackupRecordDate(record) {
            const value = record.date || record.createdAt || record.updatedAt;
            if (!value) return '';
            if (typeof value === 'string') return value.slice(0, 10);
            if (value instanceof Date) return value.toISOString().slice(0, 10);
            if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
            if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString().slice(0, 10);
            return '';
        }

        async function getAllCollectionDocuments(collectionName) {
            const records = [];
            let lastDocument = null;
            while (true) {
                const constraints = [
                    orderBy(documentId()),
                    limit(500)
                ];
                if (lastDocument) constraints.push(startAfter(lastDocument));
                const snapshot = await getDocs(query(collection(db, collectionName), ...constraints));
                snapshot.forEach(documentSnapshot => {
                    records.push({ ...documentSnapshot.data(), id: documentSnapshot.id });
                });
                if (snapshot.size < 500) return records;
                lastDocument = snapshot.docs[snapshot.docs.length - 1];
            }
        }

        // --- 1. EXPORT MODULE (CSV) ---
        window.executeExport = async function() {
            const btn = document.getElementById('exportBtn');
            const moduleName = document.getElementById('exportModule').value;
            const fromDate = document.getElementById('exportFromDate').value;
            const toDate = document.getElementById('exportToDate').value;

            if (!moduleName) return alert("Please select a module to export.");

            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-rounded" style="animation: spin 1s linear infinite;">sync</span> Exporting...`;

            try {
                // Apply Branch Restrictions
                let q = collection(db, moduleName);
                if (window.currentUser && window.currentUser.role !== 'admin') {
                    // Global collections like branches might not have a branch field, handled safely
                    if(moduleName !== 'branches') {
                        q = query(collection(db, moduleName), where("branch", "==", window.currentUser.branch));
                    }
                }

                const snap = await getDocs(q);
                let dataArray = [];

                snap.forEach(doc => {
                    let data = doc.data();
                    data.id = doc.id; // Include Document ID
                    dataArray.push(data);
                });

                if (dataArray.length === 0) {
                    alert("No data found for the selected module and branch.");
                    btn.disabled = false;
                    btn.innerHTML = `<span class="material-symbols-rounded">table_view</span> Generate CSV Export`;
                    return;
                }

                // In-memory Date Filtering (Handles strings 'YYYY-MM-DD' and Firestore Timestamps)
                if (fromDate || toDate) {
                    dataArray = dataArray.filter(item => {
                        let itemDateStr = "";
                        // Determine which field holds the date based on common schemas
                        if (item.date) itemDateStr = item.date;
                        else if (item.createdAt && item.createdAt.seconds) {
                            itemDateStr = new Date(item.createdAt.seconds * 1000).toISOString().split('T')[0];
                        }

                        if (!itemDateStr) return true; // If no date field exists, keep the record

                        let keep = true;
                        if (fromDate && itemDateStr < fromDate) keep = false;
                        if (toDate && itemDateStr > toDate) keep = false;
                        return keep;
                    });
                }

                if (dataArray.length === 0) {
                    alert("No data found within the selected date range.");
                } else {
                    const csvData = convertToCSV(dataArray);
                    const filename = `COREBIQ_${moduleName.toUpperCase()}_Export_${new Date().toISOString().split('T')[0]}.csv`;
                    downloadFile(csvData, filename, 'text/csv;charset=utf-8;');
                }

            } catch (error) {
                console.error("Export Error: ", error);
                alert("Failed to export data. Please check your permissions and connection.");
            }

            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-rounded">table_view</span> Generate CSV Export`;
        };

        // --- 2. FULL DATABASE BACKUP (JSON / ZIP) ---
        window.executeFullBackup = async function(format = 'json') {
            const jsonBtn = document.getElementById('backupBtn');
            const zipBtn = document.getElementById('backupZipBtn');
            const csvBtn = document.getElementById('backupCsvBtn');
            const buttons = [jsonBtn, zipBtn, csvBtn];
            const originalLabels = [
                '<span class="material-symbols-rounded">data_object</span> Download Full Backup (.json)',
                '<span class="material-symbols-rounded">folder_zip</span> Download Full Backup (.zip)',
                '<span class="material-symbols-rounded">table_view</span> Download Full Backup (CSV .zip)'
            ];
            if (!['json', 'zip', 'csv'].includes(format)) {
                throw new Error(`Unsupported backup format: ${format}`);
            }
            const fromDate = document.getElementById('backupFromDate').value;
            const toDate = document.getElementById('backupToDate').value;
            if (fromDate && toDate && fromDate > toDate) {
                return alert('The start date must be on or before the end date.');
            }
            const formatLabel = format === 'csv' ? 'a ZIP of CSV files' : format.toUpperCase();
            if (!confirm(`Are you sure you want to download the full database backup as ${formatLabel}? This may take some time.`)) return;

            buttons.forEach(button => { button.disabled = true; });
            const activeButton = format === 'csv' ? csvBtn : format === 'zip' ? zipBtn : jsonBtn;
            activeButton.innerHTML = `<span class="material-symbols-rounded" style="animation: spin 1s linear infinite;">sync</span> Packaging Databases...`;

            try {
                const collectionsToBackup = [
                    'appointments',
                    'booking_requests',
                    'branches',
                    'daily_attendance',
                    'estimates',
                    'leave_requests',
                    'ledger_categories',
                    'ledgers',
                    'patients',
                    'staff',
                    'tasks',
                    'therapists',
                    'transactions',
                    'users'
                ];
                const fullBackupData = {};

                for (const collectionName of collectionsToBackup) {
                    activeButton.innerHTML = `<span class="material-symbols-rounded" style="animation: spin 1s linear infinite;">sync</span> Loading ${collectionName}...`;
                    const records = await getAllCollectionDocuments(collectionName);
                    fullBackupData[collectionName] = records.filter(record => {
                        if (!fromDate && !toDate) return true;
                        const recordDate = getBackupRecordDate(record);
                        if (!recordDate) return true;
                        return (!fromDate || recordDate >= fromDate)
                            && (!toDate || recordDate <= toDate);
                    });
                }

                const companyProfile = await getDoc(doc(db, 'settings', 'company_profile'));
                fullBackupData.settings = companyProfile.exists()
                    ? [{ ...companyProfile.data(), id: 'company_profile' }]
                    : [];

                const date = new Date().toISOString().split('T')[0];
                if (format === 'zip' || format === 'csv') {
                    const files = Object.entries(fullBackupData).map(([collectionName, records]) => ({
                        name: `${collectionName}.${format === 'csv' ? 'csv' : 'json'}`,
                        content: format === 'csv'
                            ? convertBackupRecordsToCSV(records)
                            : JSON.stringify(records, null, 2)
                    }));
                    files.unshift({
                        name: 'manifest.json',
                        content: JSON.stringify({
                            format: `COREBIQ Firestore ${format.toUpperCase()} backup`,
                            generatedAt: new Date().toISOString(),
                            dateRange: { from: fromDate || null, to: toDate || null },
                            csvNotes: format === 'csv'
                                ? 'Each row is one document. Nested arrays and objects are JSON-encoded in their cell. Timestamps are ISO 8601 strings.'
                                : undefined,
                            collections: Object.fromEntries(
                                Object.entries(fullBackupData).map(([name, records]) => [name, records.length])
                            ),
                            csvTypes: format === 'csv'
                                ? Object.fromEntries(Object.entries(fullBackupData).map(([name, records]) => [
                                    name,
                                    Object.fromEntries(records.map(record => [record.id, Object.fromEntries(
                                        Object.entries(record).map(([field, value]) => [
                                            field,
                                            value === null ? 'null'
                                                : value instanceof Date || (value && typeof value.toDate === 'function') ? 'timestamp'
                                                    : Array.isArray(value) ? 'array'
                                                        : value && typeof value === 'object' ? 'object'
                                                            : typeof value === 'number' ? 'number'
                                                                : typeof value === 'boolean' ? 'boolean'
                                                                    : 'string'
                                        ])
                                    )]))
                                ]))
                                : undefined
                        }, null, 2)
                    });
                    const zipBlob = createZipBlob(files);
                    const suffix = format === 'csv' ? 'CSV' : 'JSON';
                    downloadFile(zipBlob, `COREBIQ_FULL_BACKUP_${suffix}_${date}.zip`, 'application/zip');
                } else {
                    downloadFile(
                        JSON.stringify(fullBackupData, null, 2),
                        `COREBIQ_FULL_BACKUP_${date}.json`,
                        'application/json'
                    );
                }
            } catch (error) {
                console.error('Backup Error:', error);
                alert(`Failed to create backup: ${error.message || 'Ensure you have Admin permissions and a stable connection.'}`);
            } finally {
                buttons.forEach((button, index) => {
                    button.disabled = false;
                    button.innerHTML = originalLabels[index];
                });
            }
        };

        let skippedImportRecords = [];
        window.downloadImportSkippedReport = function() {
            if (!skippedImportRecords.length) return;
            downloadFile(
                convertToCSV(skippedImportRecords),
                `COREBIQ_IMPORT_SKIPPED_${new Date().toISOString().slice(0, 10)}.csv`,
                'text/csv;charset=utf-8;'
            );
        };

        window.importFullCsvBackup = async function() {
            const button = document.getElementById('backupImportBtn');
            const fileInput = document.getElementById('backupImportFile');
            const status = document.getElementById('backupImportStatus');
            const reportButton = document.getElementById('backupImportReportBtn');
            const user = window.currentUser;
            if (user?.role !== 'admin') {
                alert('Only an administrator can import a full system backup.');
                return;
            }
            const file = fileInput.files?.[0];
            if (!file) {
                alert('Select a CSV backup ZIP first.');
                return;
            }
            if (!window.confirm('Import this CSV backup? New document IDs will be added; existing IDs will be skipped. No existing documents will be overwritten or deleted.')) return;

            button.disabled = true;
            fileInput.disabled = true;
            reportButton.hidden = true;
            skippedImportRecords = [];
            status.textContent = 'Validating backup archive...';
            let added = 0;
            let skipped = 0;
            try {
                const entries = readStoredZipEntries(await file.arrayBuffer());
                const manifestText = entries.get('manifest.json');
                if (!manifestText) throw new Error('The ZIP is missing manifest.json.');
                const manifest = JSON.parse(manifestText);
                if (manifest.format !== 'COREBIQ Firestore CSV backup' || !manifest.collections || typeof manifest.collections !== 'object') {
                    throw new Error('This is not a supported COREBIQ CSV backup archive.');
                }
                const allowedCollections = new Set([
                    'appointments', 'booking_requests', 'branches', 'daily_attendance',
                    'estimates', 'leave_requests', 'ledger_categories', 'ledgers',
                    'patients', 'settings', 'staff', 'tasks', 'therapists',
                    'transactions', 'users'
                ]);
                const recordsByCollection = new Map();
                for (const [collectionName, count] of Object.entries(manifest.collections)) {
                    if (!allowedCollections.has(collectionName) || !Number.isInteger(count) || count < 0) {
                        throw new Error(`The backup manifest contains an invalid collection: ${collectionName}.`);
                    }
                    const csvName = `${collectionName}.csv`;
                    const csvText = entries.get(csvName);
                    if (csvText === undefined) throw new Error(`The backup is missing ${csvName}.`);
                    const typeMap = manifest.csvTypes?.[collectionName] || {};
                    const csvRows = parseCsv(csvText);
                    if (csvRows.length !== count) {
                        throw new Error(`${csvName} row count does not match the backup manifest.`);
                    }
                    const seenIds = new Set();
                    const records = [];
                    for (const row of csvRows) {
                        const id = row.id.trim();
                        if (!id || id.includes('/')) throw new Error(`${csvName} contains an empty or invalid document ID.`);
                        if (seenIds.has(id)) {
                            skippedImportRecords.push({ collection: collectionName, id, reason: 'duplicate ID in backup' });
                            skipped += 1;
                            continue;
                        }
                        seenIds.add(id);
                        const record = {};
                        for (const [field, value] of Object.entries(row)) {
                            if (field === 'id') continue;
                            record[field] = restoreCsvValue(value, typeMap[id]?.[field]);
                        }
                        if (DOCUMENT_ID_CONFIG.some(config => config.collection === collectionName)) {
                            record.id = id;
                        }
                        records.push({ id, data: record });
                    }
                    recordsByCollection.set(collectionName, records);
                }

                const total = [...recordsByCollection.values()].reduce((sum, records) => sum + records.length, 0);
                let completed = 0;
                for (const [collectionName, records] of recordsByCollection) {
                    const idConfig = DOCUMENT_ID_CONFIG.find(config => config.collection === collectionName);
                    if (idConfig) {
                        await advanceDocumentIdCounter(
                            db, collectionName, idConfig.prefix, records.map(record => record.id), true
                        );
                    }
                    for (const chunk of chunkImportRecords(records)) {
                        const createdIds = await runTransaction(db, async transaction => {
                            const references = chunk.map(record => backupDocumentReference(collectionName, record.id));
                            const snapshots = [];
                            for (const reference of references) snapshots.push(await transaction.get(reference));
                            const created = [];
                            snapshots.forEach((snapshot, index) => {
                                if (snapshot.exists()) return;
                                transaction.set(references[index], chunk[index].data);
                                created.push(chunk[index].id);
                            });
                            return created;
                        });
                        const createdSet = new Set(createdIds);
                        added += createdIds.length;
                        chunk.forEach(record => {
                            if (!createdSet.has(record.id)) {
                                skipped += 1;
                                skippedImportRecords.push({
                                    collection: collectionName,
                                    id: record.id,
                                    reason: 'document ID already exists'
                                });
                            }
                        });
                        completed += chunk.length;
                        status.textContent = `Imported ${completed.toLocaleString()} of ${total.toLocaleString()} documents...`;
                    }
                }
                reportButton.hidden = skippedImportRecords.length === 0;
                status.textContent = `Import complete. Added ${added.toLocaleString()} documents; skipped ${skipped.toLocaleString()} duplicate IDs.`;
                alert(status.textContent);
            } catch (error) {
                console.error('CSV backup import failed:', error);
                reportButton.hidden = skippedImportRecords.length === 0;
                status.textContent = `Import stopped after adding ${added.toLocaleString()} documents and skipping ${skipped.toLocaleString()} IDs. ${error.message}`;
                alert(status.textContent);
            } finally {
                button.disabled = false;
                fileInput.disabled = false;
            }
        };
