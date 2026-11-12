import { downloadA4PdfDocument, downloadA4WordDocument } from '../../../js/a4-word-export.js';
        import { db } from '../../../js/firebase-config.js';
        import { collection, doc, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

        const letterheadDocumentSelections = {
            left: { seal: '', signature: '' },
            right: { seal: '', signature: '' }
        };
        let pendingLetterheadDocumentPart = null;
        function closeLetterheadMenus() {
            document.querySelectorAll('#letterhead-module .action-menu').forEach(item => item.classList.remove('visible'));
            document.querySelectorAll('#letterhead-module .action-button[aria-haspopup="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
        }
        window.toggleLetterheadMenu = function(menuName) {
            const menuIds = {
                seal: 'letterheadSealPicker',
                sign: 'letterheadSignMenu',
                download: 'letterheadDownloadMenu'
            };
            const menuId = menuIds[menuName];
            if (!menuId) return;
            const menu = document.getElementById(menuId);
            const shouldOpen = !menu.classList.contains('visible');
            closeLetterheadMenus();
            if (shouldOpen) {
                menu.classList.add('visible');
                menu.previousElementSibling.setAttribute('aria-expanded', 'true');
            }
        };
        window.chooseLetterheadSeal = function(sealType) {
            closeLetterheadMenus();
            pendingLetterheadDocumentPart = { part: 'seal', value: sealType };
            document.getElementById('letterheadPlacementTitle').textContent = `Place ${sealType === 'payment' ? 'payment seal' : `${sealType} seal`}`;
            document.getElementById('letterheadPlacementMessage').textContent = 'Choose left or right side.';
            document.getElementById('letterheadPlacementModal').classList.add('visible');
        };
        window.chooseLetterheadSignature = function(signatureType) {
            closeLetterheadMenus();
            const signatureNames = { signature: 'existing signature', thejaswi: 'Thejaswi signature', shyn: 'Shyn signature' };
            if (!signatureNames[signatureType]) throw new Error(`Unsupported letterhead signature: ${signatureType}`);
            pendingLetterheadDocumentPart = { part: 'signature', value: signatureType };
            document.getElementById('letterheadPlacementTitle').textContent = `Place ${signatureNames[signatureType]}`;
            document.getElementById('letterheadPlacementMessage').textContent = 'Choose left or right side.';
            document.getElementById('letterheadPlacementModal').classList.add('visible');
        };
        window.placeLetterheadDocumentPart = function(side) {
            if (!['left', 'right'].includes(side) || !pendingLetterheadDocumentPart) return;
            letterheadDocumentSelections[side][pendingLetterheadDocumentPart.part] = pendingLetterheadDocumentPart.value;
            pendingLetterheadDocumentPart = null;
            document.getElementById('letterheadPlacementModal').classList.remove('visible');
            renderLetterheadSeals();
        };
        window.cancelLetterheadDocumentPart = function() {
            pendingLetterheadDocumentPart = null;
            document.getElementById('letterheadPlacementModal').classList.remove('visible');
        };
        window.downloadLetterheadPdf = async function() {
            closeLetterheadMenus();
            try {
                await downloadA4PdfDocument(
                    document.querySelector('#letterhead-module .a4-canvas'),
                    'Letterhead'
                );
            } catch (error) {
                console.error('Letterhead PDF download failed:', error);
                alert(`Could not download the PDF letterhead: ${error.message || 'Unknown error'}`);
            }
        };
        window.downloadLetterheadWord = async function() {
            closeLetterheadMenus();
            try {
                await downloadA4WordDocument(
                    document.querySelector('#letterhead-module .a4-canvas'),
                    'Letterhead.doc'
                );
            } catch (error) {
                console.error('Letterhead Word download failed:', error);
                alert(`Could not download the Word letterhead: ${error.message || 'Unknown error'}`);
            }
        };
        const letterheadSealProfile = {
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
                letterheadSealProfile.companyName = String(data.name || '').trim() || 'Company name not set';
                letterheadSealProfile.signatoryName = String(data.authorisedSignatoryName || '').trim() || 'Authorised signatory name not set';
                letterheadSealProfile.designation = String(data.authorisedSignatoryDesignation || '').trim() || 'Designation not set';
                letterheadSealProfile.qualificationLicence = String(data.authorisedSignatoryQualificationLicence || '').trim() || 'Qualification / Licence No. not set';
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
                Object.keys(letterheadSealProfile).forEach(key => {
                    letterheadSealProfile[key] = 'Company details unavailable.';
                });
            }
            renderLetterheadSeals();
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

        function createLetterheadSeal(sealType) {
            const seal = document.createElement('div');
            const addText = (className, text) => {
                const element = document.createElement('div');
                element.className = className;
                element.textContent = text;
                seal.appendChild(element);
            };

            if (sealType === 'company') {
                seal.className = 'seal-box-company';
                addText('seal-name', `FOR ${letterheadSealProfile.companyName}`);
                const signatureLine = document.createElement('div');
                signatureLine.className = 'signature-line';
                seal.appendChild(signatureLine);
                addText('seal-role', letterheadSealProfile.designation);
            } else if (sealType === 'doctor') {
                seal.className = 'seal-box-doctor';
                addText('doc-name', letterheadSealProfile.signatoryName);
                addText('doc-qual', letterheadSealProfile.designation);
                addText('doc-reg', letterheadSealProfile.qualificationLicence);
            } else if (sealType === 'sincerely') {
                seal.className = 'seal-box-sincerely';
                addText('sincerely-title', 'Sincerely');
                const signatureGap = document.createElement('div');
                signatureGap.className = 'sincerely-signature-gap';
                signatureGap.setAttribute('aria-hidden', 'true');
                seal.appendChild(signatureGap);
                addText('sincerely-administration', 'Administration');
                addText('sincerely-company', letterheadSealProfile.companyName);
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
                throw new Error(`Unsupported letterhead seal: ${sealType}`);
            }
            return seal;
        }

        function renderLetterheadSeals() {
            const sealArea = document.getElementById('letterhead-seal-area');
            const { left, right } = letterheadDocumentSelections;
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
                if (selection.signature) slot.appendChild(createLetterheadSeal(selection.signature));
                if (selection.seal) slot.appendChild(createLetterheadSeal(selection.seal));
            });
            sealArea.replaceChildren(leftSlot, rightSlot);
            sealArea.classList.add('visible');
        }

        window.selectLetterheadDocumentPart = function(side, part, value) {
            if (!['left', 'right'].includes(side) || !['seal', 'signature'].includes(part)) {
                throw new Error(`Unsupported letterhead document position: ${side}/${part}`);
            }
            if (part === 'seal' && value && !['company', 'doctor', 'sincerely', 'payment'].includes(value)) {
                throw new Error(`Unsupported letterhead seal: ${value}`);
            }
            if (part === 'signature' && value && !['signature', 'thejaswi', 'shyn'].includes(value)) {
                throw new Error(`Unsupported letterhead signature: ${value}`);
            }
            letterheadDocumentSelections[side][part] = value;
            renderLetterheadSeals();
        };
