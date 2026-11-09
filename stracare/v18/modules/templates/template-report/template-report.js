import { downloadA4PdfDocument, downloadA4WordDocument } from '../../../js/a4-word-export.js';
        import { db } from '../../../js/firebase-config.js';
        import { collection, doc, getDoc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

        const reportDocumentSelections = {
            left: { seal: '', signature: '' },
            right: { seal: '', signature: '' }
        };
        let pendingReportDocumentPart = null;
        function closeReportMenus() {
            document.querySelectorAll('#letterhead-module .action-menu').forEach(item => item.classList.remove('visible'));
            document.querySelectorAll('#letterhead-module .action-button[aria-haspopup="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
        }
        window.toggleReportMenu = function(menuName) {
            const menuIds = {
                seal: 'reportSealPicker',
                sign: 'reportSignMenu',
                download: 'reportDownloadMenu'
            };
            const menuId = menuIds[menuName];
            if (!menuId) return;
            const menu = document.getElementById(menuId);
            const shouldOpen = !menu.classList.contains('visible');
            closeReportMenus();
            if (shouldOpen) {
                menu.classList.add('visible');
                menu.previousElementSibling.setAttribute('aria-expanded', 'true');
            }
        };
        window.chooseReportSeal = function(sealType) {
            closeReportMenus();
            pendingReportDocumentPart = { part: 'seal', value: sealType };
            document.getElementById('reportPlacementTitle').textContent = `Place ${sealType === 'payment' ? 'payment seal' : `${sealType} seal`}`;
            document.getElementById('reportPlacementMessage').textContent = 'Choose left or right side.';
            document.getElementById('reportPlacementModal').classList.add('visible');
        };
        window.chooseReportSignature = function(signatureType) {
            closeReportMenus();
            const signatureNames = { signature: 'existing signature', thejaswi: 'Thejaswi signature', shyn: 'Shyn signature' };
            if (!signatureNames[signatureType]) throw new Error(`Unsupported report signature: ${signatureType}`);
            pendingReportDocumentPart = { part: 'signature', value: signatureType };
            document.getElementById('reportPlacementTitle').textContent = `Place ${signatureNames[signatureType]}`;
            document.getElementById('reportPlacementMessage').textContent = 'Choose left or right side.';
            document.getElementById('reportPlacementModal').classList.add('visible');
        };
        window.placeReportDocumentPart = function(side) {
            if (!['left', 'right'].includes(side) || !pendingReportDocumentPart) return;
            reportDocumentSelections[side][pendingReportDocumentPart.part] = pendingReportDocumentPart.value;
            pendingReportDocumentPart = null;
            document.getElementById('reportPlacementModal').classList.remove('visible');
            renderReportSeals();
        };
        window.cancelReportDocumentPart = function() {
            pendingReportDocumentPart = null;
            document.getElementById('reportPlacementModal').classList.remove('visible');
        };
        window.downloadReportPdf = async function() {
            closeReportMenus();
            try {
                await downloadA4PdfDocument(
                    document.querySelector('#letterhead-module .a4-canvas'),
                    'Physiotherapy_Report'
                );
            } catch (error) {
                console.error('Report PDF download failed:', error);
                alert(`Could not download the PDF report: ${error.message || 'Unknown error'}`);
            }
        };
        window.downloadReportWord = async function() {
            closeReportMenus();
            try {
                await downloadA4WordDocument(
                    document.querySelector('#letterhead-module .a4-canvas'),
                    'Physiotherapy_Report.doc'
                );
            } catch (error) {
                console.error('Report Word download failed:', error);
                alert(`Could not download the Word report: ${error.message || 'Unknown error'}`);
            }
        };
        const reportSealProfile = {
            companyName: 'Company name not set',
            signatoryName: 'Authorised signatory name not set',
            designation: 'Designation not set',
            qualificationLicence: 'Qualification / Licence No. not set'
        };

        async function loadLetterheadCompanyDetails() {
            try {
                const snapshot = await getDoc(doc(db, 'settings', 'company_profile'));
                if (!snapshot.exists()) throw new Error('Company profile has not been configured.');
                const data = snapshot.data();
                reportSealProfile.companyName = String(data.name || '').trim() || 'Company name not set';
                reportSealProfile.signatoryName = String(data.authorisedSignatoryName || '').trim() || 'Authorised signatory name not set';
                reportSealProfile.designation = String(data.authorisedSignatoryDesignation || '').trim() || 'Designation not set';
                reportSealProfile.qualificationLicence = String(data.authorisedSignatoryQualificationLicence || '').trim() || 'Qualification / Licence No. not set';
                const formatAddressParts = values => values
                    .filter(value => typeof value === 'string' && value.trim())
                    .map(value => value.trim())
                    .join(', ');
                const addressLine1 = formatAddressParts([
                    data.buildingNo,
                    data.buildingName,
                    data.area
                ]);
                const addressLine2 = formatAddressParts([
                    data.district,
                    data.state,
                    data.country,
                    data.postalCode
                ]);
                const fallbackAddress = String(data.address || '').trim();
                const details = [
                    ['letterhead-email', data.email],
                    ['letterhead-phone', [data.phone1, data.phone2]
                        .filter(value => typeof value === 'string' && value.trim())
                        .map(value => value.trim())
                        .join(' | ')],
                    ['letterhead-website', data.website]
                ];
                document.getElementById('letterhead-address-line-1').textContent =
                    addressLine1 || fallbackAddress || 'Not provided in Company settings.';
                document.getElementById('letterhead-address-line-2').textContent = addressLine2;
                details.forEach(([id, value]) => {
                    document.getElementById(id).textContent = value || 'Not provided in Company settings.';
                });
            } catch (error) {
                console.error('Could not load letterhead company details:', error);
                ['letterhead-address-line-1', 'letterhead-email', 'letterhead-phone', 'letterhead-website'].forEach(id => {
                    document.getElementById(id).textContent = 'Company details unavailable.';
                });
                document.getElementById('letterhead-address-line-2').textContent = '';
                Object.keys(reportSealProfile).forEach(key => {
                    reportSealProfile[key] = 'Company details unavailable.';
                });
            }
            renderReportSeals();
        }

        loadLetterheadCompanyDetails();

        async function loadLetterheadBranchNames() {
            const branchNames = document.getElementById('letterhead-branch-names');
            try {
                const snapshot = await getDocs(collection(db, 'branches'));
                const names = snapshot.docs
                    .filter(branch => String(branch.data().branchId || '').trim().toUpperCase() !== 'B6')
                    .map(branch => branch.data().name)
                    .filter(name => typeof name === 'string' && name.trim())
                    .map(name => name.trim())
                    .sort((a, b) => a.localeCompare(b));
                branchNames.textContent = names.join(' | ');
            } catch (error) {
                console.error('Could not load letterhead branch names:', error);
                branchNames.textContent = 'Branch names unavailable.';
            }
        }

        loadLetterheadBranchNames();

        async function loadReportTherapists() {
            const therapistList = document.getElementById('report-therapist-list');
            try {
                let therapistQuery = query(collection(db, 'therapists'));
                if (window.currentUser && window.currentUser.role !== 'admin') {
                    therapistQuery = query(
                        collection(db, 'therapists'),
                        where('branch', '==', window.currentUser.branch)
                    );
                }
                const snapshot = await getDocs(therapistQuery);
                const names = snapshot.docs
                    .map(therapist => therapist.data().name)
                    .filter(name => typeof name === 'string' && name.trim())
                    .map(name => name.trim())
                    .sort((a, b) => a.localeCompare(b));
                therapistList.replaceChildren(...names.map(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    return option;
                }));
            } catch (error) {
                console.error('Could not load report therapist names:', error);
                therapistList.replaceChildren();
                document.getElementById('report-therapist-name').placeholder = 'Therapist names unavailable.';
            }
        }

        loadReportTherapists();

        function createReportSeal(sealType) {
            const seal = document.createElement('div');
            const addText = (className, text) => {
                const element = document.createElement('div');
                element.className = className;
                element.textContent = text;
                seal.appendChild(element);
            };

            if (sealType === 'company') {
                seal.className = 'seal-box-company';
                addText('seal-name', `FOR ${reportSealProfile.companyName}`);
                const signatureLine = document.createElement('div');
                signatureLine.className = 'signature-line';
                seal.appendChild(signatureLine);
                addText('seal-role', reportSealProfile.designation);
            } else if (sealType === 'doctor') {
                seal.className = 'seal-box-doctor';
                addText('doc-name', reportSealProfile.signatoryName);
                addText('doc-qual', reportSealProfile.designation);
                addText('doc-reg', reportSealProfile.qualificationLicence);
            } else if (sealType === 'sincerely') {
                seal.className = 'seal-box-sincerely';
                addText('sincerely-title', 'Sincerely');
                const signatureGap = document.createElement('div');
                signatureGap.className = 'sincerely-signature-gap';
                signatureGap.setAttribute('aria-hidden', 'true');
                seal.appendChild(signatureGap);
                addText('sincerely-administration', 'Administration');
                addText('sincerely-company', reportSealProfile.companyName);
            } else if (sealType === 'payment') {
                seal.className = 'seal-box-payment';
                seal.textContent = 'Payment Received';
            } else if (['signature', 'thejaswi', 'shyn'].includes(sealType)) {
                seal.className = 'seal-box-signature';
                const image = document.createElement('img');
                const signatureAssets = {
                    signature: { src: 'assets/sign.png', label: 'Authorised signature' },
                    thejaswi: { src: 'assets/sign-thejaswi.png', label: 'Thejaswi signature' },
                    shyn: { src: 'assets/sign-shyn.png', label: 'Shyn signature' }
                };
                const signature = signatureAssets[sealType];
                image.src = signature.src;
                image.alt = signature.label;
                seal.appendChild(image);
            } else {
                throw new Error(`Unsupported report seal: ${sealType}`);
            }
            return seal;
        }

        function renderReportSeals() {
            const sealArea = document.getElementById('letterhead-seal-area');
            const { left, right } = reportDocumentSelections;
            if (![left, right].some(selection => selection.seal || selection.signature)) {
                sealArea.replaceChildren();
                sealArea.classList.remove('visible');
                return;
            }

            const leftSlot = document.createElement('div');
            leftSlot.className = 'letterhead-seal-slot letterhead-seal-slot-left';
            const rightSlot = document.createElement('div');
            rightSlot.className = 'letterhead-seal-slot letterhead-seal-slot-right';
            [left, right].forEach((selection, index) => {
                const slot = index === 0 ? leftSlot : rightSlot;
                if (selection.signature) slot.appendChild(createReportSeal(selection.signature));
                if (selection.seal) slot.appendChild(createReportSeal(selection.seal));
            });
            sealArea.replaceChildren(leftSlot, rightSlot);
            sealArea.classList.add('visible');
        }

        window.selectReportDocumentPart = function(side, part, value) {
            if (!['left', 'right'].includes(side) || !['seal', 'signature'].includes(part)) {
                throw new Error(`Unsupported report document position: ${side}/${part}`);
            }
            if (part === 'seal' && value && !['company', 'doctor', 'sincerely', 'payment'].includes(value)) {
                throw new Error(`Unsupported report seal: ${value}`);
            }
            if (part === 'signature' && value && !['signature', 'thejaswi', 'shyn'].includes(value)) {
                throw new Error(`Unsupported report signature: ${value}`);
            }
            reportDocumentSelections[side][part] = value;
            renderReportSeals();
        };
