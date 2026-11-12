const statusElement = document.getElementById('status');
        const fieldElements = [...document.querySelectorAll('[data-output]')];
        const valueElements = [...document.querySelectorAll('[data-value]')];
        const readField = id => document.getElementById(id).value.trim();
        const receiptText = () => [
            readField('business-name'),
            'Payment receipt ' + readField('receipt-number'),
            'Date: ' + readField('receipt-date'),
            'Received from: ' + readField('patient-name'),
            'Amount received: ₹' + (readField('amount') || '0.00'),
            'Payment method: ' + readField('payment-method'),
            'Payment for: ' + readField('purpose')
        ].join('\n');

        document.getElementById('receipt-date').value = new Date().toISOString().slice(0, 10);
        const updateReceipt = () => {
            for (const element of valueElements) {
                const field = document.getElementById(element.dataset.value);
                let value = field.value.trim();
                if (element.dataset.value === 'amount') value = Number(value || 0).toFixed(2);
                element.textContent = value || (['patient-name', 'patient-mobile', 'purpose'].includes(element.dataset.value) ? '—' : '');
            }
        };
        fieldElements.forEach(field => field.addEventListener('input', updateReceipt));
        updateReceipt();

        const applyTransactionReceipt = payload => {
            const fields = {
                'receipt-number': payload.receiptNumber,
                'receipt-date': payload.date,
                'patient-name': payload.name,
                'patient-mobile': payload.mobile,
                amount: payload.amount,
                'payment-method': payload.paymentMethod,
                purpose: payload.purpose,
                notes: payload.notes
            };
            Object.entries(fields).forEach(([id, value]) => {
                if (value == null) return;
                document.getElementById(id).value = String(value);
            });
            fieldElements.forEach(field => field.dispatchEvent(new Event('input')));
            statusElement.textContent = 'Transaction receipt loaded. Review the details before printing or sharing.';
        };

        window.addEventListener('message', event => {
            if (
                event.origin !== window.location.origin ||
                event.source !== window.opener ||
                event.data?.type !== 'corebiq:receipt:data' ||
                !event.data.payload
            ) return;
            applyTransactionReceipt(event.data.payload);
        });
        if (window.opener) {
            window.opener.postMessage({ type: 'corebiq:receipt:ready' }, window.location.origin);
        }

        const createPdf = async () => {
            if (typeof html2pdf === 'undefined') throw new Error('PDF download is unavailable. Check your internet connection or use Print and choose Save as PDF.');
            const options = {
                margin: 0,
                filename: `receipt-${readField('receipt-number') || 'payment'}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'in', format: [4, Math.max(5, document.getElementById('receipt').scrollHeight / 96 + 0.4)], orientation: 'portrait' }
            };
            return html2pdf().set(options).from(document.getElementById('receipt')).outputPdf('blob');
        };
        document.getElementById('download-button').addEventListener('click', async () => {
            try {
                const blob = await createPdf();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `receipt-${readField('receipt-number') || 'payment'}.pdf`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                statusElement.textContent = 'Receipt PDF downloaded.';
            } catch (error) {
                statusElement.textContent = error.message;
            }
        });
        document.getElementById('share-button').addEventListener('click', async () => {
            try {
                const blob = await createPdf();
                const file = new File([blob], `receipt-${readField('receipt-number') || 'payment'}.pdf`, { type: 'application/pdf' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ title: 'Payment receipt', text: receiptText(), files: [file] });
                    statusElement.textContent = 'Receipt shared.';
                    return;
                }
                const mobile = readField('patient-mobile').replace(/\D/g, '');
                const phone = mobile.length === 10 ? `91${mobile}` : mobile;
                const url = `https://wa.me/${phone}?text=${encodeURIComponent(receiptText())}`;
                const downloadUrl = URL.createObjectURL(blob);
                const downloadLink = document.createElement('a');
                downloadLink.href = downloadUrl;
                downloadLink.download = `receipt-${readField('receipt-number') || 'payment'}.pdf`;
                downloadLink.click();
                setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
                window.location.href = url;
                statusElement.textContent = 'WhatsApp opened with receipt details. Attach the downloaded PDF if needed.';
            } catch (error) {
                if (error.name !== 'AbortError') statusElement.textContent = error.message;
            }
        });
        document.getElementById('email-button').addEventListener('click', () => {
            const subject = encodeURIComponent(`Payment receipt ${readField('receipt-number')}`);
            const body = encodeURIComponent(receiptText() + '\n\nAttach the receipt PDF after downloading it.');
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
        });
