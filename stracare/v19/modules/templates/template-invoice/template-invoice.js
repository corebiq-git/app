// Currency formatter
        const formatCurrency = amount => window.formatCorebiqNumber
            ? window.formatCorebiqNumber(amount)
            : amount.toFixed(2);

        // Toast Notification
        const showToast = (message, isError = false) => {
            const toast = document.getElementById('toastMessage');
            const toastText = document.getElementById('toastText');
            const icon = document.getElementById('toastIcon');
            
            toastText.textContent = message;
            toast.style.backgroundColor = isError ? 'var(--md-sys-color-error)' : '#313033';
            icon.textContent = isError ? 'error' : 'check_circle';
            
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3500);
        };
        window.showToast = showToast;

        const invoiceSealSelections = { left: '', right: '' };
        const invoiceSealTypes = new Set(['company', 'doctor', 'payment']);
        const invoiceSealProfile = {
            companyName: 'Company name not set',
            signatoryName: 'Authorised signatory name not set',
            designation: 'Designation not set',
            qualificationLicence: 'Qualification / Licence No. not set'
        };

        function createInvoiceSeal(sealType) {
            const seal = document.createElement('div');
            const addText = (className, text) => {
                const element = document.createElement('div');
                element.className = className;
                element.textContent = text;
                seal.appendChild(element);
            };

            if (sealType === 'company') {
                seal.className = 'seal-box-company';
                addText('seal-name', `FOR ${invoiceSealProfile.companyName}`);
                const signatureLine = document.createElement('div');
                signatureLine.className = 'signature-line';
                seal.appendChild(signatureLine);
                addText('seal-role', invoiceSealProfile.designation);
            } else if (sealType === 'doctor') {
                seal.className = 'seal-box-doctor';
                addText('doc-name', invoiceSealProfile.signatoryName);
                addText('doc-qual', invoiceSealProfile.designation);
                addText('doc-reg', invoiceSealProfile.qualificationLicence);
            } else if (sealType === 'sincerely') {
                seal.className = 'seal-box-sincerely';
                addText('sincerely-title', 'Sincerely');
                const signatureGap = document.createElement('div');
                signatureGap.className = 'sincerely-signature-gap';
                signatureGap.setAttribute('aria-hidden', 'true');
                seal.appendChild(signatureGap);
                addText('sincerely-administration', 'Administration');
                addText('sincerely-company', invoiceSealProfile.companyName);
            } else if (sealType === 'payment') {
                seal.className = 'seal-box-payment';
                seal.textContent = 'Payment Received';
            } else {
                throw new Error(`Unsupported invoice seal: ${sealType}`);
            }
            return seal;
        }

        function renderInvoiceSeals() {
            const sealArea = document.getElementById('invoice-seal-area');
            const slots = ['left', 'right']
                .filter(position => invoiceSealSelections[position])
                .map(position => {
                    const slot = document.createElement('div');
                    slot.className = `invoice-seal-slot invoice-seal-slot-${position}`;
                    slot.appendChild(createInvoiceSeal(invoiceSealSelections[position]));
                    return slot;
                });
            if (!slots.length) {
                sealArea.replaceChildren();
                sealArea.classList.remove('visible');
                return;
            }

            sealArea.replaceChildren(...slots);
            sealArea.classList.add('visible');
        }

        window.selectInvoiceSeal = (position, sealType) => {
            if (!Object.hasOwn(invoiceSealSelections, position)) {
                throw new Error(`Unsupported invoice seal position: ${position}`);
            }
            if (sealType && !invoiceSealTypes.has(sealType)) {
                throw new Error(`Unsupported invoice seal: ${sealType}`);
            }
            invoiceSealSelections[position] = sealType;
            renderInvoiceSeals();
        };

        // Auto-generating UPI QR Code
        let qrTimeout;
        const updateQRCode = () => {
            clearTimeout(qrTimeout);
            qrTimeout = setTimeout(() => {
                const upiElement = document.getElementById('upi-id');
                const rawUpiId = upiElement.innerText.trim();
                if (!rawUpiId) return;
                const companyName = document.getElementById('company-name').textContent.trim();
                const uri = `upi://pay?pa=${encodeURIComponent(rawUpiId)}&pn=${encodeURIComponent(companyName)}&cu=INR`;
                const encodedUri = encodeURIComponent(uri);
                
                const qrImage = document.getElementById('upi-qr');
                qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodedUri}&margin=0`;
                qrImage.hidden = false;
            }, 400);
        };

        window.applyCompanyProfile = (profile) => {
            window.applyCorebiqSettings?.(profile);
            invoiceSealProfile.companyName = String(profile.name || '').trim() || 'Company name not set';
            invoiceSealProfile.signatoryName = String(profile.authorisedSignatoryName || '').trim() || 'Authorised signatory name not set';
            invoiceSealProfile.designation = String(profile.authorisedSignatoryDesignation || '').trim() || 'Designation not set';
            invoiceSealProfile.qualificationLicence = String(profile.authorisedSignatoryQualificationLicence || '').trim() || 'Qualification / Licence No. not set';
            renderInvoiceSeals();
            const set = (id, value) => {
                document.getElementById(id).textContent = value || '';
            };
            const formatAddressParts = values => values
                .filter(value => typeof value === 'string' && value.trim())
                .map(value => value.trim())
                .join(', ');
            const addressLine1 = formatAddressParts([
                profile.buildingNo,
                profile.buildingName,
                profile.area
            ]);
            const addressLine2 = formatAddressParts([
                profile.district,
                profile.state,
                profile.country,
                profile.postalCode
            ]);
            set('company-name', profile.name);
            set('company-tagline', profile.tagline);
            set('company-address-line-1', addressLine1 || profile.address);
            set('company-address-line-2', addressLine2);
            set('company-phone', [profile.phone1, profile.phone2].filter(Boolean).join(' | '));
            set('company-email', profile.email);
            set('company-website', profile.website);
            set('account-name', profile.accName);
            set('account-number', profile.accNo);
            set('ifsc-code', profile.ifsc);
            set('upi-id', profile.upi);
            set('bank-name', profile.bankName);
            document.getElementById('bank-name-row').style.display = profile.bankName ? 'flex' : 'none';
            document.getElementById('upi-detail-row').style.display = profile.upi ? 'flex' : 'none';
            document.getElementById('upi-qr-container').style.display = profile.upi ? 'flex' : 'none';
            updateQRCode();
        };

        // Recalculate totals
        const calculateTotals = () => {
            const tbody = document.getElementById('table-body');
            const rows = tbody.querySelectorAll('tr');
            let subtotal = 0;

            rows.forEach(row => {
                const qtyInput = row.querySelector('.qty-input');
                const rateInput = row.querySelector('.rate-input');
                const amountCell = row.querySelector('.amount-cell');

                if (qtyInput && rateInput && amountCell) {
                    const qty = parseFloat(qtyInput.value) || 0;
                    const rate = parseFloat(rateInput.value) || 0;
                    const amount = qty * rate;
                    
                    amountCell.textContent = formatCurrency(amount);
                    subtotal += amount;
                }
            });

            document.getElementById('subtotal-amount').textContent = `₹ ${formatCurrency(subtotal)}`;

            const appointment = window.invoicePayload?.appointment;
            const isAppointmentInvoice = Boolean(appointment);
            const previousDues = isAppointmentInvoice ? Number(appointment.prevDues ?? appointment.previousDues) || 0 : 0;
            const advance = isAppointmentInvoice ? Number(appointment.advance) || 0 : 0;
            const balanceDue = isAppointmentInvoice
                ? subtotal + previousDues - advance
                : subtotal;
            document.getElementById('fee-label').textContent = isAppointmentInvoice ? 'Fee' : 'Subtotal';
            document.getElementById('previous-dues-amount').textContent = `₹ ${formatCurrency(previousDues)}`;
            document.getElementById('advance-paid-amount').textContent = `₹ ${formatCurrency(advance)}`;
            document.getElementById('previous-dues-row').classList.toggle('hidden', !isAppointmentInvoice);
            document.getElementById('advance-paid-row').classList.toggle('hidden', !isAppointmentInvoice);
            document.getElementById('total-label').textContent = isAppointmentInvoice
                ? balanceDue < 0 ? 'Credit Balance' : 'Pending Due'
                : 'Total Amount';
            document.getElementById('total-amount').textContent =
                `₹ ${formatCurrency(isAppointmentInvoice && balanceDue < 0 ? Math.abs(balanceDue) : balanceDue)}`;
        };

        // Add line item
        const addRow = () => {
            const tbody = document.getElementById('table-body');
            const tr = document.createElement('tr');
            tr.className = 'group hover:bg-gray-50/50 transition-colors';
            
            tr.innerHTML = `
                <td class="py-1.5 px-2 align-top">
                    <input type="text" class="clean-input font-medium text-gray-900" placeholder="Item description">
                    <input type="text" class="clean-input text-[11px] text-gray-500" placeholder="Additional details (optional)">
                </td>
                <td class="py-1.5 px-2 text-right align-top">
                    <input type="number" class="clean-input text-right qty-input" value="1" min="0" step="1" onchange="calculateTotals()" onkeyup="calculateTotals()">
                </td>
                <td class="py-1.5 px-2 text-right align-top">
                    <input type="number" class="clean-input text-right rate-input" value="0.00" min="0" step="0.01" onchange="calculateTotals()" onkeyup="calculateTotals()">
                </td>
                <td class="py-1.5 px-2 text-right font-medium text-gray-900 amount-cell align-top pt-2">
                    0.00
                </td>
                <td class="py-1.5 px-1 text-center align-top pt-1.5 no-print">
                    <button onclick="removeRow(this)" class="text-gray-300 hover:text-red-500 transition-colors p-0.5 rounded-full" title="Remove item">
                        <span class="material-symbols-outlined text-[15px]">close</span>
                    </button>
                </td>
            `;
            
            tbody.appendChild(tr);
            const firstInput = tr.querySelector('input');
            if (firstInput) firstInput.focus();
        };

        // Remove line item
        const removeRow = (btn) => {
            const tbody = document.getElementById('table-body');
            if (tbody.querySelectorAll('tr').length <= 1) {
                showToast("Cannot remove the last line item.", true);
                return;
            }
            
            const row = btn.closest('tr');
            row.style.opacity = '0';
            row.style.transform = 'translateX(-10px)';
            row.style.transition = 'all 0.2s ease';
            
            setTimeout(() => {
                row.remove();
                calculateTotals();
            }, 200);
        };

        const setPrintEmpty = (element, isEmpty) => {
            if (!element) return;
            element.dataset.printEmpty = String(isEmpty);
        };

        const prepareInvoiceOutput = () => {
            const container = document.getElementById('invoice-container');
            container.querySelectorAll('.patient-report-field').forEach(field => {
                const values = field.querySelectorAll('.patient-report-value, [contenteditable="true"]');
                setPrintEmpty(field, !Array.from(values).some(value => value.textContent.trim()));
            });

            const meta = document.getElementById('invoice-meta');
            const metaChildren = Array.from(meta.children);
            for (let index = 0; index < metaChildren.length; index += 2) {
                const label = metaChildren[index];
                const value = metaChildren[index + 1];
                const isEmpty = !value?.textContent.trim();
                setPrintEmpty(label, isEmpty);
                setPrintEmpty(value, isEmpty);
            }
            setPrintEmpty(meta, !meta.querySelector('[data-print-empty="false"]'));

            [
                ['.invoice-address-contact', ['company-address-line-1', 'company-address-line-2']],
                ['.invoice-phone-contact', ['company-phone']],
                ['.invoice-email-contact', ['company-email']],
                ['.invoice-website-contact', ['company-website']]
            ].forEach(([selector, ids]) => {
                const contact = container.querySelector(selector);
                setPrintEmpty(contact, ids.every(id => !document.getElementById(id).textContent.trim()));
            });
            const contactRow = container.querySelector('.invoice-contact-row');
            setPrintEmpty(contactRow, Array.from(contactRow.children).every(contact => contact.dataset.printEmpty === 'true'));

            const rows = Array.from(document.querySelectorAll('#table-body tr'));
            rows.forEach(row => {
                const description = row.querySelector('td:first-child input:nth-of-type(1)')?.value.trim();
                const details = row.querySelector('td:first-child input:nth-of-type(2)')?.value.trim();
                const rate = Number(row.querySelector('.rate-input')?.value) || 0;
                row.classList.toggle('invoice-item-row-empty', !description && !details && rate <= 0);
            });
            const hasItems = rows.some(row => !row.classList.contains('invoice-item-row-empty'));
            container.querySelector('.invoice-items-section').classList.toggle('invoice-items-empty', !hasItems);

            const bankValues = ['account-name', 'bank-name', 'account-number', 'ifsc-code', 'upi-id'];
            setPrintEmpty(
                document.getElementById('bank-details-container'),
                bankValues.every(id => !document.getElementById(id).textContent.trim())
            );
            [
                ['account-name-row', 'account-name'],
                ['bank-name-row', 'bank-name'],
                ['account-number-row', 'account-number'],
                ['ifsc-code-row', 'ifsc-code'],
                ['upi-detail-row', 'upi-id'],
                ['upi-qr-container', 'upi-id']
            ].forEach(([rowId, valueId]) => {
                setPrintEmpty(
                    document.getElementById(rowId),
                    !document.getElementById(valueId).textContent.trim()
                );
            });
            setPrintEmpty(
                document.getElementById('client-phone-row'),
                !document.getElementById('client-phone').textContent.trim()
            );
            setPrintEmpty(
                document.getElementById('client-email-row'),
                !document.getElementById('client-email').textContent.trim()
            );
            setPrintEmpty(
                document.getElementById('client-address'),
                !document.getElementById('client-address').textContent.trim()
            );

            const appointmentCards = Array.from(document.querySelectorAll('#appointment-details > div'));
            appointmentCards.forEach(card => {
                const value = card.querySelector('[id]');
                setPrintEmpty(card, !value?.textContent.trim() || value.textContent.trim() === '—');
            });
            setPrintEmpty(
                document.getElementById('appointment-details'),
                appointmentCards.every(card => card.dataset.printEmpty === 'true')
            );
            setPrintEmpty(
                container.querySelector('.invoice-branch-footer'),
                !document.getElementById('invoice-branches').textContent.trim()
            );
        };

        const clearInvoiceOutputState = () => {
            const container = document.getElementById('invoice-container');
            container.querySelectorAll('[data-print-empty]').forEach(element => delete element.dataset.printEmpty);
            container.querySelectorAll('.invoice-item-row-empty').forEach(row => row.classList.remove('invoice-item-row-empty'));
            container.querySelector('.invoice-items-section').classList.remove('invoice-items-empty');
        };

        window.addEventListener('beforeprint', prepareInvoiceOutput);
        window.addEventListener('afterprint', clearInvoiceOutputState);

        // Action 1: View / Print A4 PDF
        const handlePrint = () => {
            calculateTotals();
            prepareInvoiceOutput();
            window.print();
        };

        const getInvoiceCanvasOptions = () => ({
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: 794,
            windowHeight: 1123,
            width: 794,
            height: 1123,
            scrollX: 0,
            scrollY: 0
        });

        const getSafeInvoiceFileName = extension => {
            const invoiceNo = document.getElementById('invoice-no').innerText.trim();
            const safeInvoiceNo = (invoiceNo || 'Invoice')
                .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
                .replace(/\s+/g, '_')
                .replace(/-+/g, '-')
                .replace(/^[.]+|[.]+$/g, '') || 'Invoice';
            return `Invoice_${safeInvoiceNo}.${extension}`;
        };

        const downloadInvoiceWord = async () => {
            const button = document.getElementById('download-invoice-word-btn');
            if (button.disabled) return;
            button.disabled = true;
            calculateTotals();
            prepareInvoiceOutput();
            const element = document.getElementById('invoice-container');
            element.classList.add('pdf-export-mode');
            try {
                const { downloadA4WordDocument } = await import('../../../js/a4-word-export.js');
                await downloadA4WordDocument(element, getSafeInvoiceFileName('doc'));
                showToast('A4 Word invoice downloaded.');
            } catch (error) {
                console.error('Invoice Word download failed:', error);
                showToast(error.message || 'Word download failed.', true);
            } finally {
                element.classList.remove('pdf-export-mode');
                clearInvoiceOutputState();
                button.disabled = false;
            }
        };
        window.downloadInvoiceWord = downloadInvoiceWord;

        const createInvoiceCanvas = async () => {
            if (typeof html2pdf !== 'function') {
                throw new Error('Invoice image export is unavailable. Check your internet connection and try again.');
            }
            const element = document.getElementById('invoice-container');
            calculateTotals();
            prepareInvoiceOutput();
            element.classList.add('pdf-export-mode');
            try {
                const worker = html2pdf()
                    .set({ margin: 0, html2canvas: getInvoiceCanvasOptions() })
                    .from(element)
                    .toCanvas();
                const canvas = await worker.get('canvas');
                if (!(canvas instanceof HTMLCanvasElement)) {
                    throw new Error('Could not render the invoice image.');
                }
                return canvas;
            } finally {
                element.classList.remove('pdf-export-mode');
                clearInvoiceOutputState();
            }
        };

        const createInvoiceJpeg = async () => {
            const canvas = await createInvoiceCanvas();
            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(result => {
                    if (result) resolve(result);
                    else reject(new Error('Could not encode the invoice as a JPEG image.'));
                }, 'image/jpeg', 0.95);
            });
            return blob;
        };

        const downloadBlob = (blob, filename) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        };

        const downloadJPEG = async () => {
            const button = document.getElementById('download-invoice-jpeg-btn');
            if (button.disabled) return;
            button.disabled = true;
            showToast('Preparing A4 JPEG download...');
            try {
                const jpeg = await createInvoiceJpeg();
                downloadBlob(jpeg, getSafeInvoiceFileName('jpeg'));
                showToast('A4 invoice JPEG downloaded.');
            } catch (error) {
                console.error('Invoice JPEG download failed:', error);
                showToast(error.message || 'JPEG download failed.', true);
            } finally {
                button.disabled = false;
            }
        };

        // Action 2: Direct PDF Download via html2pdf
        const downloadPDF = async () => {
            calculateTotals();
            const downloadButton = document.getElementById('download-invoice-btn');
            downloadButton?.classList.remove('download-requested');
            if (typeof html2pdf !== 'function') {
                showToast("PDF download is unavailable. Use View / Print instead.", true);
                return;
            }
            const element = document.getElementById('invoice-container');
            const invoiceNo = document.getElementById('invoice-no').innerText.trim();
            const safeInvoiceNo = (invoiceNo || 'Invoice')
                .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
                .replace(/\s+/g, '_')
                .replace(/-+/g, '-')
                .replace(/^[.]+|[.]+$/g, '') || 'Invoice';

            if (downloadButton?.disabled) return;
            if (downloadButton) downloadButton.disabled = true;
            showToast("Preparing PDF download...");

            const opt = {
                margin:       0,
                filename:     `Invoice_${safeInvoiceNo}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  getInvoiceCanvasOptions(),
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            try {
                prepareInvoiceOutput();
                element.classList.add('pdf-export-mode');
                await html2pdf().set(opt).from(element).save();
                showToast("PDF downloaded successfully!");
            } catch (error) {
                console.error('Invoice PDF download failed:', error);
                showToast("PDF download failed. Use View / Print and save as PDF.", true);
            } finally {
                element.classList.remove('pdf-export-mode');
                clearInvoiceOutputState();
                if (downloadButton) downloadButton.disabled = false;
            }
        };

        // Action 3: Send via Email
        const sendEmail = () => {
            const clientEmail = document.getElementById('client-email')?.innerText.trim() || '';
            const clientName = document.getElementById('client-name').innerText.trim() || 'Customer';
            const invoiceNo = document.getElementById('invoice-no').innerText.trim();
            const totalAmount = document.getElementById('total-amount').innerText.trim();
            const companyName = document.getElementById('company-name').innerText.trim();
            const bankDetails = [
                document.getElementById('account-name').innerText.trim(),
                document.getElementById('bank-name').innerText.trim(),
                document.getElementById('account-number').innerText.trim(),
                document.getElementById('ifsc-code').innerText.trim(),
                document.getElementById('upi-id').innerText.trim()
            ].filter(Boolean).join('\n');

            if (!clientEmail || !clientEmail.includes('@')) {
                showToast("Please provide a valid client email address.", true);
                return;
            }

            const subject = encodeURIComponent(`Invoice ${invoiceNo}${companyName ? ` - ${companyName}` : ''}`);
            const body = encodeURIComponent(
                `Dear ${clientName},\n\nInvoice ${invoiceNo}\nTotal Amount: ${totalAmount}\n\n` +
                (bankDetails ? `Payment Details:\n${bankDetails}\n\n` : '') +
                `Regards${companyName ? `,\n${companyName}` : ''}`
            );

            window.location.href = `mailto:${clientEmail}?subject=${subject}&body=${body}`;
            showToast("Opening email client...");
        };

        // Action 4: Send via WhatsApp
        const sendWhatsApp = async () => {
            const clientPhoneRaw = document.getElementById('client-phone').innerText;
            const clientName = document.getElementById('client-name').innerText.trim() || 'Customer';
            const invoiceNo = document.getElementById('invoice-no').innerText.trim();
            const totalAmount = document.getElementById('total-amount').innerText.trim();
            const companyName = document.getElementById('company-name').innerText.trim();
            const bankDetails = [
                document.getElementById('account-name').innerText.trim(),
                document.getElementById('bank-name').innerText.trim(),
                document.getElementById('account-number').innerText.trim(),
                document.getElementById('ifsc-code').innerText.trim(),
                document.getElementById('upi-id').innerText.trim()
            ].filter(Boolean).join(' | ');
            
            let clientPhone = clientPhoneRaw.replace(/\D/g, '');
            if (clientPhone.length === 11 && clientPhone.startsWith('0')) clientPhone = clientPhone.slice(1);
            if (clientPhone.length === 10) clientPhone = `91${clientPhone}`;

            if (!/^91\d{10}$/.test(clientPhone)) {
                showToast("Please enter a valid client mobile number.", true);
                return;
            }

            const message = `Hello ${clientName},\n\nInvoice ${invoiceNo}${companyName ? ` from ${companyName}` : ''}: ${totalAmount}${bankDetails ? `\n\nPayment Details:\n${bankDetails}` : ''}`;
            const fileName = getSafeInvoiceFileName('jpeg');
            let canShareImage = false;
            if (typeof File === 'function' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
                try {
                    canShareImage = navigator.canShare({
                        files: [new File([], fileName, { type: 'image/jpeg' })]
                    });
                } catch (error) {
                    console.warn('Native invoice image sharing is unavailable:', error);
                }
            }

            const whatsappWindow = canShareImage ? null : window.open('about:blank', '_blank');
            if (!canShareImage && !whatsappWindow) {
                showToast('Allow pop-ups to open WhatsApp, or download the JPEG and attach it manually.', true);
                return;
            }

            const button = document.getElementById('send-invoice-whatsapp-btn');
            if (button.disabled) {
                whatsappWindow?.close();
                return;
            }
            button.disabled = true;
            showToast('Preparing invoice JPEG for WhatsApp...');
            try {
                const jpeg = await createInvoiceJpeg();
                const file = canShareImage ? new File([jpeg], fileName, { type: 'image/jpeg' }) : null;
                if (file && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: `Invoice ${invoiceNo}`,
                        text: message,
                        files: [file]
                    });
                    showToast('Choose WhatsApp in the share menu to send the invoice image and message.');
                    return;
                }

                downloadBlob(jpeg, fileName);
                whatsappWindow.location.href = `https://wa.me/${clientPhone}?text=${encodeURIComponent(message)}`;
                showToast('JPEG downloaded and WhatsApp opened. Attach the image to the prefilled message.');
            } catch (error) {
                whatsappWindow?.close();
                if (error.name !== 'AbortError') {
                    console.error('Invoice WhatsApp sharing failed:', error);
                    showToast(error.message || 'Could not prepare the invoice for WhatsApp.', true);
                }
            } finally {
                button.disabled = false;
            }
        };

        const formatInvoiceDate = (value) => {
            if (!value) return '';
            const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
                ? new Date(`${value}T00:00:00`)
                : new Date(value);
            if (Number.isNaN(date.getTime())) return '';
            return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        };

        const formatInvoiceTime = (value) => {
            const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
            if (!match) return value || '';
            let hours = Number(match[1]);
            const minutes = match[2];
            const meridiem = match[3]?.toUpperCase();
            if (meridiem) return hours >= 1 && hours <= 12 ? `${String(hours).padStart(2, '0')}:${minutes} ${meridiem}` : value;
            if (hours > 23) return value;
            const period = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            return `${String(hours).padStart(2, '0')}:${minutes} ${period}`;
        };

        const applyAppointmentData = (appointment = {}) => {
            const set = (id, value) => {
                document.getElementById(id).textContent = value == null ? '' : String(value);
            };
            const firstRow = document.querySelector('#table-body tr');
            const descriptionInput = firstRow?.querySelector('td:first-child input:nth-of-type(1)');
            const notesInput = firstRow?.querySelector('td:first-child input:nth-of-type(2)');
            const quantityInput = firstRow?.querySelector('.qty-input');
            const rateInput = firstRow?.querySelector('.rate-input');
            set('invoice-no', appointment.invoiceNo || appointment.billNo || (appointment.id ? `INV-${appointment.id}` : ''));
            set('invoice-date', formatInvoiceDate(appointment.billDate || new Date()));
            set('client-name', appointment.patientName || appointment.name);
            set('client-address', appointment.location || appointment.address);
            set('client-phone', appointment.mobile || appointment.mobileNo || appointment.phone);
            set('client-email', appointment.email);
            set('patient-duration', appointment.duration);
            set('patient-sessions-per-day', appointment.sessionsPerDay);
            set('patient-report-detail', appointment.invoiceNotes || [appointment.diagnosis, appointment.notes, appointment.patientNotes].filter(Boolean).join('\n\n'));
            document.getElementById('client-email-row').style.display = appointment.email ? 'flex' : 'none';
            const patientMeta = [appointment.age ? `${appointment.age} years` : '', appointment.gender].filter(Boolean).join(' · ');
            set('client-meta', patientMeta);
            document.getElementById('appointment-details').style.display = 'grid';
            const schedule = [formatInvoiceDate(appointment.date), formatInvoiceTime(appointment.time)].filter(Boolean).join(' · ');
            set('appointment-schedule', schedule);
            set('appointment-branch', appointment.branch || '—');
            set('appointment-therapist', appointment.therapist || '—');
            set('appointment-status', [appointment.category, appointment.status].filter(Boolean).join(' · ') || '—');
            if (descriptionInput) descriptionInput.value = appointment.invoiceDescription || appointment.serviceName || appointment.service || appointment.duration || 'Therapy Session';
            if (notesInput) notesInput.value = appointment.invoiceNotes || [appointment.diagnosis || appointment.notes, appointment.patientNotes].filter(Boolean).join('\n\n');
            if (quantityInput) quantityInput.value = '1';
            if (rateInput) rateInput.value = String(Number(appointment.fee ?? appointment.totalFee ?? 0));
            if (rateInput) rateInput.dispatchEvent(new Event('input', { bubbles: true }));
            calculateTotals();
        };

        const promptForInvoiceDownload = () => {
            const downloadButton = document.getElementById('download-invoice-btn');
            window.scrollTo(0, 0);
            downloadButton?.classList.add('download-requested');
            downloadButton?.focus({ preventScroll: true });
            showToast('Invoice is ready. Select the download icon at the top to save it.');
        };

        window.invoicePayload = null;
        let storedInvoicePayload = sessionStorage.getItem('bizodit.invoicePayload');
        if (!storedInvoicePayload && window.name.startsWith('corebiq-invoice:')) {
            storedInvoicePayload = window.name.slice('corebiq-invoice:'.length);
            window.name = '';
        }
        if (storedInvoicePayload) {
            try {
                window.invoicePayload = JSON.parse(storedInvoicePayload);
                sessionStorage.removeItem('bizodit.invoicePayload');
            } catch (error) {
                console.error('Invoice data could not be read:', error);
                showToast('Invoice data could not be read.', true);
            }
        }

        // Init
        document.addEventListener('DOMContentLoaded', () => {
            if (window.invoicePayload) {
                applyAppointmentData(window.invoicePayload.appointment || {});
                if (window.invoicePayload.invoiceLinkError) showToast(window.invoicePayload.invoiceLinkError, true);
                if (window.invoicePayload.patientLinkError) showToast(window.invoicePayload.patientLinkError, true);
            } else {
                document.getElementById('invoice-date').textContent = formatInvoiceDate(new Date());
            }
            calculateTotals();
            
            document.querySelectorAll('.qty-input, .rate-input').forEach(input => {
                input.addEventListener('input', calculateTotals);
            });
            if (new URLSearchParams(window.location.search).get('action') === 'download') {
                promptForInvoiceDownload();
            }
        });

        window.addEventListener('message', event => {
            if (event.source !== window.parent) return;
            if (window.location.origin !== 'null' && event.origin !== window.location.origin) return;
            if (event.data?.type !== 'corebiq:invoice' || !event.data.payload) return;

            window.invoicePayload = event.data.payload;
            const appointment = window.invoicePayload.appointment || {};
            if (!document.querySelector('#table-body tr')) {
                console.error('Invoice line item row is missing; appointment data was not applied.');
                showToast('Invoice line item is unavailable. Reload the invoice and try again.', true);
                return;
            }
            applyAppointmentData(appointment);
            if (window.applyCompanyProfile && window.invoicePayload.company) {
                window.applyCompanyProfile(window.invoicePayload.company);
            }
            if (window.invoicePayload.companyProfileError) {
                showToast(window.invoicePayload.companyProfileError, true);
            }
            if (window.invoicePayload.invoiceLinkError) {
                showToast(window.invoicePayload.invoiceLinkError, true);
            }
            if (window.invoicePayload.patientLinkError) {
                showToast(window.invoicePayload.patientLinkError, true);
            }
            if (event.data.action === 'download') promptForInvoiceDownload();
        });

        document.addEventListener('DOMContentLoaded', () => {
            window.parent.postMessage(
                { type: 'corebiq:invoice:ready' },
                window.location.origin === 'null' ? '*' : window.location.origin
            );
        }, { once: true });
