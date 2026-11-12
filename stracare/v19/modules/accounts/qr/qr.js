import '../../../js/corebiq-locale.js';
        import { db } from '../../../js/firebase-config.js'; 
        import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

        window.qrPatientsCache = {};

        // Helper to load external scripts dynamically
        function loadExternalScript(src) {
            return new Promise((resolve) => {
                if (document.querySelector(`script[src="${src}"]`)) return resolve();
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                document.head.appendChild(script);
            });
        }

        // Helper to load images safely as a Promise (Crucial for Canvas rendering)
        function loadCanvasImage(src) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
                img.src = src;
            });
        }

        async function initQRModule() {
            await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js');
            await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
            window.loadQRPatients();
        }

        window.loadQRPatients = async function() {
            const dataList = document.getElementById('qr-patients-datalist');
            if(!dataList) return;
            try {
                let q = query(collection(db, "patients"));
                if (window.currentUser && window.currentUser.role !== 'admin') {
                    q = query(collection(db, "patients"), where("branch", "==", window.currentUser.branch));
                }
                
                const snap = await getDocs(q);
                let html = '';
                window.qrPatientsCache = {};
                snap.forEach(doc => {
                    const p = doc.data();
                    if(p.name && p.mobile) {
                        // Store full object but only show Name in dropdown
                        window.qrPatientsCache[p.mobile] = p;
                        html += `<option value="${p.mobile}">${p.name}</option>`;
                    }
                });
                dataList.innerHTML = html;
            } catch(e) { console.error("Error loading QR patients: ", e); }
        };

        window.handleQRPatientSelect = async function() {
            const selectedMobile = document.getElementById('qrPatientSearch').value;
            const pData = window.qrPatientsCache[selectedMobile];
            
            if (pData) {
                // Clear search bar and show name, log mobile
                document.getElementById('qrPatientSearch').value = pData.name;
                document.getElementById('qrMobile').value = pData.mobile || '';
                document.getElementById('qrAmount').value = 'Loading...';
                
                let opBalance = 0;
                try {
                    let aptsQ = query(collection(db, "appointments"), where("mobile", "==", pData.mobile));
                    if (window.currentUser && window.currentUser.role !== 'admin') {
                        aptsQ = query(collection(db, "appointments"), where("mobile", "==", pData.mobile), where("branch", "==", window.currentUser.branch));
                    }
                    const aptsSnap = await getDocs(aptsQ);
                    aptsSnap.forEach(doc => { opBalance += parseFloat(doc.data().balance) || 0; });
                    
                    document.getElementById('qrAmount').value = opBalance > 0 ? opBalance.toFixed(2) : '';
                    if(opBalance <= 0) alert("This patient currently has no pending dues.");
                } catch(e) { 
                    console.error("Error fetching balance", e); 
                    document.getElementById('qrAmount').value = '';
                }
            }
        };

        // --- PREMIUM CANVAS GENERATION ---
        window.generateUPIQR = async function() {
            const amount = parseFloat(document.getElementById('qrAmount').value);
            const upiId = document.getElementById('qrUpiId').value.trim();
            const payeeName = document.getElementById('qrPayeeName').value.trim();
            const narration = document.getElementById('qrNarration').value.trim() || 'Clinic Payment';
            
            // Get patient name (fallback if user didn't use dropdown)
            let patientName = document.getElementById('qrPatientSearch').value.trim() || 'Valued Patient';

            if (!amount || amount <= 0 || !upiId) return alert("Please enter a valid amount and UPI ID.");

            // Generate UPI String
            const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(narration)}`;

            const cvs = document.getElementById('compositeCanvas');
            const ctx = cvs.getContext('2d');
            const width = 500;
            const height = 720; // Increased height to accommodate the 1x1 footer nicely

            // 1. Draw Canvas Base & Border
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
            ctx.strokeStyle = "#E2E8F0";
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, width - 2, height - 2);

            // 2. Draw Top Gradient Header
            const grad = ctx.createLinearGradient(0, 0, width, 0);
            grad.addColorStop(0, "#F8FAFC");
            grad.addColorStop(1, "#E8EEF7");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, 140);

            try {
                // Preload logos
                const mainLogo = await loadCanvasImage('assets/name.png');
                // 3. Draw Header Logo
                const logoW = 200;
                const logoH = 50;
                ctx.drawImage(mainLogo, (width - logoW) / 2, 40, logoW, logoH);

                ctx.textAlign = "center";
                
                // 4. Draw Financial Info
                ctx.fillStyle = "#0B1F4B"; // Primary Blue
                ctx.font = "bold 46px Inter, sans-serif";
                const displayAmount = window.formatCorebiqCurrency
                    ? window.formatCorebiqCurrency(amount)
                    : `₹ ${amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
                ctx.fillText(displayAmount, width / 2, 200);
                
                ctx.fillStyle = "#64748B"; // Muted text
                ctx.font = "600 16px Inter, sans-serif";
                ctx.fillText(`Payment Request for: ${patientName}`, width / 2, 235);

                // 5. Draw Divider
                ctx.beginPath();
                ctx.moveTo(60, 260);
                ctx.lineTo(width - 60, 260);
                ctx.strokeStyle = "#E2E8F0";
                ctx.lineWidth = 1;
                ctx.stroke();

                // 6. Generate QR using QRious
                const qr = new QRious({
                    value: upiString,
                    size: 260,
                    level: 'H'
                });
                const qrImage = await loadCanvasImage(qr.toDataURL());

                // 7. Draw Soft Shadow Box for QR Code
                ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
                ctx.shadowBlur = 20;
                ctx.shadowOffsetY = 10;
                ctx.fillStyle = '#ffffff';
                
                // Rounded rect path for background box
                ctx.beginPath();
                ctx.roundRect((width - 300) / 2, 280, 300, 300, 20);
                ctx.fill();
                
                // Reset shadow before drawing image
                ctx.shadowColor = 'transparent';
                ctx.drawImage(qrImage, (width - 260) / 2, 300, 260, 260);
                
                // 8. Draw Payee Info Below QR
                ctx.fillStyle = "#0F172A";
                ctx.font = "bold 18px Inter, sans-serif";
                ctx.fillText(payeeName, width / 2, 620);
                
                ctx.fillStyle = "#64748B";
                ctx.font = "500 14px Inter, sans-serif";
                ctx.fillText(`UPI ID: ${upiId}`, width / 2, 645);

                // --- 9. MUTED FOOTER WITH COREBIQ WORDMARK ---
                ctx.beginPath();
                ctx.moveTo(0, 680);
                ctx.lineTo(width, 680);
                ctx.strokeStyle = "#F1F5F9";
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.font = "italic 13px Inter, sans-serif";
                ctx.fillStyle = "#94A3B8";
                
                const footerText = "Secure payment generated by";
                const textWidth = ctx.measureText(footerText).width;
                const wordmarkWidth = 48;
                const spacing = 8;
                
                // Calculate total width of elements to center them perfectly
                const totalFooterWidth = textWidth + spacing + wordmarkWidth;
                const startX = (width - totalFooterWidth) / 2;

                // Draw Text
                ctx.textAlign = "left";
                ctx.fillText(footerText, startX, 706);
                
                // Draw COREBIQ beside the security notice.
                ctx.fillStyle = "#0B1F4B";
                ctx.font = "700 11px Outfit, sans-serif";
                ctx.fillText("COREBIQ", startX + textWidth + spacing, 705);

                // Reveal UI
                document.getElementById('preview-placeholder').style.display = 'none';
                cvs.style.display = 'block';
                document.getElementById('qrActionButtons').style.display = 'grid';

            } catch (err) {
                console.error("Canvas Drawing Error:", err);
                alert("Failed to render digital receipt. Please check the clinic logo and try again.");
            }
        };

        // 5. Download Handlers
        window.downloadQR = function(format) {
            const cvs = document.getElementById('compositeCanvas');
            const patientName = document.getElementById('qrPatientSearch').value.split('-')[0].trim().replace(/\s+/g, '_') || 'Patient';
            const fileName = `COREBIQ_Payment_Request_${patientName}`;

            if (format === 'jpeg') {
                const link = document.createElement('a');
                link.download = `${fileName}.jpg`;
                link.href = cvs.toDataURL('image/jpeg', 1.0);
                link.click();
            } else if (format === 'pdf') {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: "portrait", unit: "px", format: [500, 720] });
                const imgData = cvs.toDataURL('image/jpeg', 1.0);
                doc.addImage(imgData, 'JPEG', 0, 0, 500, 720);
                doc.save(`${fileName}.pdf`);
            }
        };

        // 6. Share to WhatsApp
        window.shareToWhatsApp = async function() {
            const cvs = document.getElementById('compositeCanvas');
            const mobile = document.getElementById('qrMobile').value.trim();
            const amount = document.getElementById('qrAmount').value;
            const upiId = document.getElementById('qrUpiId').value.trim();
            
            const displayAmount = window.formatCorebiqCurrency
                ? window.formatCorebiqCurrency(amount)
                : `₹${amount}`;
            const message = `Hello, please find your clinic payment request for ${displayAmount}. You can scan the attached QR code or pay directly using UPI ID: ${upiId}.`;

            if (navigator.canShare) {
                cvs.toBlob(async (blob) => {
                    const file = new File([blob], "CM_Payment_Request.jpg", { type: "image/jpeg" });
                    if (navigator.canShare({ files: [file] })) {
                        try {
                            await navigator.share({
                                files: [file],
                                title: 'CM Payment Request',
                                text: message
                            });
                            return; 
                        } catch (err) {
                            console.log("Share cancelled or failed.", err);
                        }
                    } else { fallbackWA(mobile, message); }
                }, 'image/jpeg', 1.0);
            } else {
                fallbackWA(mobile, message);
            }
        };

        function fallbackWA(mobile, message) {
            alert("Direct image sharing is supported mostly on mobile devices. The receipt will download now. Please attach it manually in WhatsApp.");
            window.downloadQR('jpeg'); 
            
            setTimeout(() => {
                const waUrl = mobile ? `https://wa.me/91${mobile}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;
                window.open(waUrl, '_blank');
            }, 1000);
        }

        initQRModule();
