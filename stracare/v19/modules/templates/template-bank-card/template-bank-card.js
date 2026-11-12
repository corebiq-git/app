(() => {
    const root = document.getElementById('bank-card-module');
    if (!root || root.dataset.bankCardInitialized === 'true') return;
    root.dataset.bankCardInitialized = 'true';

    const fields = {
        clinicName: root.querySelector('#bankCardClinicName'),
        accountName: root.querySelector('#bankCardAccountName'),
        bankName: root.querySelector('#bankCardBankName'),
        accountNumber: root.querySelector('#bankCardAccountNumber'),
        ifsc: root.querySelector('#bankCardIfsc'),
        upi: root.querySelector('#bankCardUpi'),
        phone: root.querySelector('#bankCardPhone')
    };
    const canvas = root.querySelector('#bankCardCanvas');
    const context = canvas?.getContext('2d');
    const qrCanvas = root.querySelector('#bankCardQrCanvas');
    const status = root.querySelector('#bankCardStatus');
    const actions = [...root.querySelectorAll('.bank-card-actions button')];
    let qrLibraryPromise;
    let renderSequence = 0;
    let cardReady = false;

    if (!context || !status || Object.values(fields).some(input => !input)) {
        console.error('Bank card module is missing required markup.');
        return;
    }

    function setStatus(message, isError = false) {
        status.textContent = message;
        status.classList.toggle('error', isError);
    }

    function loadQrLibrary() {
        if (window.QRious) return Promise.resolve();
        if (qrLibraryPromise) return qrLibraryPromise;
        qrLibraryPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js';
            script.onload = () => window.QRious
                ? resolve()
                : reject(new Error('QR generator loaded without its API.'));
            script.onerror = () => reject(new Error('Could not load QR generator. Check your internet connection.'));
            document.head.appendChild(script);
        }).catch(error => {
            qrLibraryPromise = null;
            throw error;
        });
        return qrLibraryPromise;
    }

    function roundedRect(x, y, width, height, radius) {
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(x + width - radius, y);
        context.quadraticCurveTo(x + width, y, x + width, y + radius);
        context.lineTo(x + width, y + height - radius);
        context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        context.lineTo(x + radius, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - radius);
        context.lineTo(x, y + radius);
        context.quadraticCurveTo(x, y, x + radius, y);
        context.closePath();
    }

    function drawText(value, x, y, maxWidth, font, color, align = 'left') {
        context.font = font;
        context.fillStyle = color;
        context.textAlign = align;
        context.fillText(value || 'Not provided', x, y, maxWidth);
    }

    function drawCardBackground() {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#EAF0F6';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.save();
        context.shadowColor = 'rgba(18, 38, 63, .16)';
        context.shadowBlur = 28;
        context.shadowOffsetY = 10;
        context.fillStyle = '#FFFFFF';
        roundedRect(30, 30, 1140, 640, 30);
        context.fill();
        context.restore();

        context.save();
        roundedRect(30, 30, 1140, 640, 30);
        context.clip();
        const header = context.createLinearGradient(30, 30, 770, 160);
        header.addColorStop(0, '#102C59');
        header.addColorStop(1, '#1A5276');
        context.fillStyle = header;
        context.fillRect(30, 30, 1140, 145);
        context.fillStyle = '#19A7A1';
        context.fillRect(30, 168, 1140, 7);
        context.restore();
    }

    function drawCompanyName(name) {
        drawText(name || 'Company name', 72, 112, 700, '700 26px Inter, Arial, sans-serif', '#FFFFFF');
        drawText('BANK DETAILS CARD', 72, 151, 700, '600 26px Inter, Arial, sans-serif', '#D5E8F5');
    }

    function drawQrPanel(message) {
        context.fillStyle = '#FFFFFF';
        context.strokeStyle = '#DCE5EF';
        context.lineWidth = 2;
        roundedRect(842, 205, 288, 400, 22);
        context.fill();
        context.stroke();
        context.fillStyle = '#F1F5F9';
        roundedRect(866, 230, 240, 240, 16);
        context.fill();
        drawText(message, 986, 357, 210, '600 26px Inter, Arial, sans-serif', '#52677F', 'center');
        drawText('SCAN TO PAY', 986, 524, 250, '700 26px Inter, Arial, sans-serif', '#137D83', 'center');
        drawText('Open your UPI app', 986, 562, 250, '500 26px Inter, Arial, sans-serif', '#52677F', 'center');
    }

    async function renderBankCard() {
        const sequence = ++renderSequence;
        const upiId = fields.upi.value.trim();
        const validUpi = /^[^@\s]+@[^@\s]+$/.test(upiId);
        cardReady = false;
        setStatus('Generating bank card and UPI QR...');
        drawCardBackground();
        drawCompanyName(fields.clinicName.value.trim());
        const details = [
            ['ACCOUNT NUMBER', fields.accountNumber.value.trim()],
            ['ACCOUNT HOLDER', fields.accountName.value.trim()],
            ['BANK NAME', fields.bankName.value.trim()],
            ['IFSC CODE', fields.ifsc.value.trim()],
            ['UPI ID', upiId],
            ['CONTACT', fields.phone.value.trim()]
        ];
        let detailY = 232;
        for (const [label, value] of details) {
            drawText(label, 72, detailY, 270, '700 26px Inter, Arial, sans-serif', '#137D83');
            context.fillStyle = '#102C59';
            roundedRect(354, detailY - 30, 446, 44, 10);
            context.fill();
            drawText(value || 'Not provided', 374, detailY, 400, '600 26px Inter, Arial, sans-serif', '#FFFFFF');
            context.strokeStyle = '#E7EDF3';
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(72, detailY + 18);
            context.lineTo(800, detailY + 18);
            context.stroke();
            detailY += 68;
        }
        drawQrPanel(validUpi ? 'UPI QR CODE' : 'Enter a valid UPI ID');

        let qrError = null;
        if (validUpi) {
            try {
                await loadQrLibrary();
                if (sequence !== renderSequence) return;
                const payee = fields.clinicName.value.trim() || fields.accountName.value.trim() || 'Clinic';
                const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&cu=INR`;
                const qr = new window.QRious({
                    element: qrCanvas,
                    value: upiUri,
                    size: 240,
                    level: 'H',
                    background: '#FFFFFF',
                    foreground: '#0B1F4B'
                });
                context.fillStyle = '#FFFFFF';
                roundedRect(866, 230, 240, 240, 16);
                context.fill();
                context.drawImage(qr.canvas, 878, 242, 216, 216);
            } catch (error) {
                if (sequence !== renderSequence) return;
                qrError = error;
                console.error('Bank card QR rendering failed:', error);
                drawQrPanel('QR could not load');
            }
        }

        cardReady = true;

        if (!validUpi) {
            setStatus('Card generated. Enter a valid UPI ID (for example, name@bank) to add its QR.', true);
        } else if (qrError) {
            setStatus('Card generated without QR. Check your connection and generate again to add the QR.', true);
        } else {
            setStatus('Card and UPI QR are ready.');
        }
    }

    function safeFilePart(value) {
        return (value || 'Clinic').trim()
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 60) || 'Clinic';
    }

    function downloadBankCard() {
        if (!cardReady) {
            setStatus('Generate the card before downloading the JPEG.', true);
            return false;
        }
        const link = document.createElement('a');
        link.download = `${safeFilePart(fields.clinicName.value)}_Bank_Details.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.96);
        link.click();
        return true;
    }

    function shareMessage() {
        const name = fields.clinicName.value.trim() || 'our clinic';
        const upi = fields.upi.value.trim();
        return `Bank details for ${name}.${upi ? ` UPI ID: ${upi}.` : ''}${fields.accountNumber.value.trim() ? ` Account No: ${fields.accountNumber.value.trim()}.` : ''} See the attached card for payment details.`;
    }

    async function shareBankCard(channel) {
        if (!cardReady) {
            setStatus('Generate the card before sharing it.', true);
            return;
        }
        actions.forEach(button => { button.disabled = true; });
        try {
            const blob = await new Promise((resolve, reject) => canvas.toBlob(
                result => result ? resolve(result) : reject(new Error('Could not create the JPEG image.')),
                'image/jpeg',
                0.96
            ));
            const file = new File([blob], `${safeFilePart(fields.clinicName.value)}_Bank_Details.jpg`, { type: 'image/jpeg' });
            if (navigator.canShare?.({ files: [file] }) && navigator.share) {
                await navigator.share({ files: [file], title: 'Clinic bank details', text: shareMessage() });
                setStatus('Bank card shared.');
                return;
            }

            downloadBankCard();
            const body = `${shareMessage()}\n\nThe JPEG card has been downloaded. Please attach it before sending.`;
            if (channel === 'whatsapp') {
                const phone = fields.phone.value.replace(/\D/g, '');
                const url = phone
                    ? `https://wa.me/${phone}?text=${encodeURIComponent(body)}`
                    : `https://wa.me/?text=${encodeURIComponent(body)}`;
                window.open(url, '_blank', 'noopener,noreferrer');
            } else {
                window.location.href = `mailto:?subject=${encodeURIComponent('Clinic bank details')}&body=${encodeURIComponent(body)}`;
            }
            setStatus(`JPEG downloaded. Attach it in ${channel === 'whatsapp' ? 'WhatsApp' : 'your email app'} before sending.`);
        } catch (error) {
            if (error.name === 'AbortError') {
                setStatus('Sharing cancelled. The card is still available to download.');
            } else {
                console.error(`Bank card ${channel} sharing failed:`, error);
                setStatus(error.message || 'Could not share the bank card.', true);
            }
        } finally {
            actions.forEach(button => { button.disabled = false; });
        }
    }

    function saveCardDetailsLocally() {
        try {
            localStorage.setItem('corebiq-bank-card-details', JSON.stringify(
                Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value]))
            ));
            return true;
        } catch (error) {
            console.error('Could not save bank card details locally:', error);
            setStatus('Could not save details on this device. Check browser storage settings.', true);
            return false;
        }
    }

    Object.values(fields).forEach(input => input.addEventListener('input', () => {
        renderSequence += 1;
        cardReady = false;
        saveCardDetailsLocally();
        setStatus('Details changed. Select Generate Card to refresh the preview.');
    }));

    root.querySelector('#bankCardGenerate').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            saveCardDetailsLocally();
            await renderBankCard();
        } catch (error) {
            console.error('Bank card generation failed:', error);
            setStatus(error.message || 'Could not generate the bank card.', true);
        } finally {
            button.disabled = false;
        }
    });

    root.querySelector('#bankCardDownload').addEventListener('click', downloadBankCard);
    root.querySelector('#bankCardWhatsApp').addEventListener('click', () => shareBankCard('whatsapp'));
    root.querySelector('#bankCardEmail').addEventListener('click', () => shareBankCard('email'));

    try {
        const companyProfile = JSON.parse(localStorage.getItem('corebiq-company-bank-card-profile') || '{}');
        const savedDetails = JSON.parse(localStorage.getItem('corebiq-bank-card-details') || '{}');
        for (const [key, input] of Object.entries(fields)) {
            input.value = savedDetails[key] ?? companyProfile[key] ?? '';
        }
        setStatus('Details are stored locally on this device. Select Generate Card to create the preview.');
        if (fields.upi.value.trim()) renderBankCard();
    } catch (error) {
        console.error('Could not load locally saved bank card details:', error);
        setStatus('Could not load details saved on this device. Enter them manually and try again.', true);
    }
})();
