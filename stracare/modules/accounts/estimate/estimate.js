import { db } from "../../../js/firebase-config.js";
import { collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

        // FIXED DATE BUG
        document.getElementById("estDate").value = new Date().toISOString().split('T')[0];

        // --- 0. SAFE DYNAMIC BRANCH LOADER (WITH RBAC) ---
        window.loadBranchesForEst = async function() {
            const select = document.getElementById('estBranch');
            
            // SECURITY: If standard user, lock the dropdown to their branch only
            if (window.currentUser && window.currentUser.role !== 'admin') {
                const userBranch = window.currentUser.branch;
                select.innerHTML = `<option value="${userBranch}">${userBranch}</option>`;
                select.style.pointerEvents = 'none';
                select.style.background = 'var(--grey-med)';
                window.syncPreview();
                return; 
            }

            try {
                const snap = await getDocs(collection(db, "branches"));
                let branchList = [];
                snap.forEach(doc => {
                    const bName = doc.data().name;
                    if(bName) branchList.push(bName);
                });
                branchList.sort();

                let bHtml = '<option value="">Select Branch</option>';
                branchList.forEach(bName => {
                    bHtml += `<option value="${bName}">${bName}</option>`;
                });
                
                select.innerHTML = bHtml;
                window.syncPreview();
            } catch(e) {
                console.error("Error loading branches", e);
                select.innerHTML = '<option value="">Select Branch</option>';
            }
        };
        window.loadBranchesForEst();

        // --- 1. LIVE SYNC ENGINE ---
        window.syncPreview = function() {
            document.getElementById('prevName').innerText = document.getElementById('estName').value || '---';
            document.getElementById('prevMobile').innerText = document.getElementById('estMobile').value || '----------';
            document.getElementById('prevDate').innerText = document.getElementById('estDate').value || 'YYYY-MM-DD';
            document.getElementById('prevBranch').innerText = document.getElementById('estBranch').value || '---';
            document.getElementById('prevDesc').innerText = document.getElementById('estDesc').value || 'Consultation & Therapy Service';
            
            const fee = parseFloat(document.getElementById('estFee').value) || 0;
            const advance = parseFloat(document.getElementById('estAdvance').value) || 0;
            const balance = fee - advance;
            
            document.getElementById('estBalance').value = balance.toFixed(2);
            
            document.getElementById('prevFee').innerText = '₹' + fee.toFixed(2);
            document.getElementById('prevAdvance').innerText = '₹' + advance.toFixed(2);
            document.getElementById('prevBalance').innerText = '₹' + balance.toFixed(2);
        }

        window.syncPreview();

        // --- 2. SAVE TO FIREBASE WORKFLOW ---
        window.saveEstimate = async function() {
            const btn = document.getElementById('saveEstBtn');
            const name = document.getElementById('estName').value;
            const mobile = document.getElementById('estMobile').value;
            const date = document.getElementById('estDate').value;
            const fee = document.getElementById('estFee').value;
            const branch = document.getElementById('estBranch').value;

            if(!name || !mobile || !fee || !branch) {
                return alert("Patient Name, Mobile, Branch, and Fee are required before saving!");
            }

            btn.innerText = "Saving to Database...";
            btn.disabled = true;

            try {
                await addDoc(collection(db, "estimates"), {
                    name: name,
                    mobile: mobile,
                    date: date,
                    branch: branch,
                    description: document.getElementById('estDesc').value,
                    fee: parseFloat(fee) || 0,
                    advance: parseFloat(document.getElementById('estAdvance').value) || 0,
                    balance: parseFloat(document.getElementById('estBalance').value) || 0,
                    createdAt: new Date()
                });

                alert("Estimate Saved Successfully!");
                btn.style.display = "none";
                document.getElementById('actionButtonsRow').style.display = "flex";

            } catch(e) {
                console.error("Firebase Error:", e);
                alert("Failed to save. Check your connection or database rules.");
                btn.innerText = "Save to Database & Export";
                btn.disabled = false;
            }
        }

        // --- 3. EXPORT ACTIONS ---
        window.printEstimate = function() {
            window.print(); 
        }

        window.downloadJPEG = function() {
            const element = document.getElementById('printable-estimate');
            const name = document.getElementById('estName').value || 'Patient';
            
            html2canvas(element, { scale: 2, useCORS: true }).then(canvas => {
                const link = document.createElement('a');
                link.download = `STRA_CARE_Estimate_${name}.jpg`;
                link.href = canvas.toDataURL('image/jpeg', 0.9);
                link.click();
            }).catch(err => {
                console.error("JPEG Render Error:", err);
                alert("Failed to generate JPEG. Try printing as PDF instead.");
            });
        }

        window.sendEstimateWA = function() {
            const mobile = document.getElementById('estMobile').value;
            const name = document.getElementById('estName').value;
            const fee = document.getElementById('estFee').value || 0;
            const advance = document.getElementById('estAdvance').value || 0;
            const balance = document.getElementById('estBalance').value || 0;
            
            const formatMoney = value => window.formatCorebiqCurrency
                ? window.formatCorebiqCurrency(value)
                : `₹${Number(value || 0).toFixed(2)}`;
            const waText = encodeURIComponent(`Hello ${name}, here is your service estimate from STRA CARE. Total Fee: ${formatMoney(fee)}, Advance: ${formatMoney(advance)}, Balance Pending: ${formatMoney(balance)}. Let us know if you have any questions!`);
            window.open(`https://wa.me/91${mobile}?text=${waText}`, '_blank');
        }
