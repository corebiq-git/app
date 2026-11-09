import '../../../js/corebiq-locale.js';
        import { db } from "../../../js/firebase-config.js";
        import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
        
        // Target Document: A single document holding the global company configuration
        const companyDocRef = doc(db, "settings", "company_profile");

        const companyStates = {
            IN: ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry'],
            AE: ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras Al Khaimah', 'Sharjah', 'Umm Al Quwain'],
            US: ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'],
            CA: ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'],
            AU: ['Australian Capital Territory', 'New South Wales', 'Northern Territory', 'Queensland', 'South Australia', 'Tasmania', 'Victoria', 'Western Australia'],
            GB: ['England', 'Northern Ireland', 'Scotland', 'Wales']
        };

        function populateCompanyCurrencies() {
            const currencySelect = document.getElementById('compCurrency');
            if (typeof Intl.supportedValuesOf !== 'function') return;
            const selected = currencySelect.value || 'INR';
            let currencies;
            let displayNames = null;
            try {
                currencies = Intl.supportedValuesOf('currency');
                if (typeof Intl.DisplayNames === 'function') {
                    displayNames = new Intl.DisplayNames(['en'], { type: 'currency' });
                }
            } catch (error) {
                console.warn('Unable to load the full currency list:', error);
                return;
            }
            currencySelect.replaceChildren();
            currencies.forEach(code => {
                const name = displayNames?.of(code) || code;
                currencySelect.add(new Option(`${code} — ${name}`, code));
            });
            if (!currencies.includes(selected)) currencySelect.add(new Option(`${selected} — ${selected}`, selected));
            currencySelect.value = selected;
        }

        populateCompanyCurrencies();

        window.updateCompanyStates = function(selectedState = '') {
            const stateSelect = document.getElementById('compState');
            const country = document.getElementById('compCountry').value;
            const states = companyStates[country] || ['Other / not listed'];
            stateSelect.replaceChildren(new Option('Select state / region', ''));
            states.forEach(state => stateSelect.add(new Option(state, state)));
            if (selectedState && !states.includes(selectedState)) {
                stateSelect.add(new Option(selectedState, selectedState));
            }
            stateSelect.value = selectedState;
        };
        window.updateCompanyStates('Kerala');

        function parseLegacyAddress(address) {
            const result = { floor: '', buildingNo: '', buildingName: '', area: '', district: '', postalCode: '', state: '', countryCode: 'IN' };
            const parts = String(address || '').split(',').map(part => part.trim()).filter(Boolean);
            if (!parts.length) return result;
            result.postalCode = String(address).match(/\b\d{5,6}\b/)?.[0] || '';
            const floorIndex = parts.findIndex(part => /\bfloor\b/i.test(part));
            if (floorIndex >= 0) result.floor = parts.splice(floorIndex, 1)[0];
            const buildingNoIndex = parts.findIndex(part => /(?:building\s*)?(?:no\.?|number)\s*[:#-]?\s*\w+/i.test(part));
            if (buildingNoIndex >= 0) result.buildingNo = parts.splice(buildingNoIndex, 1)[0].replace(/^(?:building\s*)?(?:no\.?|number)\s*[:#-]?\s*/i, '');
            const districtIndex = parts.findIndex(part => /\bdistrict\b|\bdist\.?\b/i.test(part));
            if (districtIndex >= 0) result.district = parts.splice(districtIndex, 1)[0].replace(/\s*(?:district|dist\.?)\s*/ig, '').trim();
            const stateIndex = parts.findIndex(part => /\b(kerala|karnataka|tamil nadu|maharashtra|goa|gujarat|delhi|punjab|rajasthan|uttar pradesh|telangana|andhra pradesh)\b/i.test(part));
            if (stateIndex >= 0) result.state = parts.splice(stateIndex, 1)[0].replace(/[-\s]+\d{5,6}\s*$/, '').trim();
            if (parts.length) result.buildingName = parts.shift();
            if (parts.length) result.area = parts.shift();
            if (result.state || /india/i.test(address)) result.countryCode = 'IN';
            return result;
        }

        function getCompanyAddress() {
            return [
                document.getElementById('compFloor').value.trim(),
                document.getElementById('compBuildingNo').value.trim(),
                document.getElementById('compBuildingName').value.trim(),
                document.getElementById('compArea').value.trim(),
                document.getElementById('compDistrict').value.trim(),
                document.getElementById('compState').value.trim(),
                document.getElementById('compPostalCode').value.trim(),
                document.getElementById('compCountry').selectedOptions[0]?.textContent.trim()
            ].filter(Boolean).join(', ');
        }

        // --- 1. LOAD DATA ON MOUNT ---
        window.loadCompanyData = async function() {
            try {
                const docSnap = await getDoc(companyDocRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const legacyAddress = parseLegacyAddress(data.address);
                    document.getElementById('compFloor').value = data.floor || legacyAddress.floor || '';
                    document.getElementById('compBuildingNo').value = data.buildingNo || legacyAddress.buildingNo || '';
                    document.getElementById('compBuildingName').value = data.buildingName || legacyAddress.buildingName || '';
                    document.getElementById('compArea').value = data.area || legacyAddress.area || '';
                    document.getElementById('compDistrict').value = data.district || legacyAddress.district || '';
                    document.getElementById('compPostalCode').value = data.postalCode || legacyAddress.postalCode || '';
                    const countryCode = data.countryCode || legacyAddress.countryCode || 'IN';
                    const countrySelect = document.getElementById('compCountry');
                    if (!Array.from(countrySelect.options).some(option => option.value === countryCode)) {
                        countrySelect.add(new Option(data.country || countryCode, countryCode));
                    }
                    countrySelect.value = countryCode;
                    window.updateCompanyStates(data.state || legacyAddress.state || '');
                    const currencyCode = String(data.currencyCode || data.currency || 'INR').toUpperCase();
                    const currencySelect = document.getElementById('compCurrency');
                    if (!Array.from(currencySelect.options).some(option => option.value === currencyCode)) {
                        currencySelect.add(new Option(`${currencyCode} — ${currencyCode}`, currencyCode));
                    }
                    currencySelect.value = currencyCode;
                    document.getElementById('compLanguage').value = data.preferredLanguage || 'en';
                    window.applyCorebiqSettings?.({
                        currencyCode: document.getElementById('compCurrency').value,
                        countryCode,
                        preferredLanguage: document.getElementById('compLanguage').value
                    });
                    if(typeof data.name === 'string' && data.name.trim()) {
                        const companyName = data.name.trim();
                        document.getElementById('compName').value = companyName;
                        try {
                            localStorage.setItem('corebiq-company-name', companyName);
                        } catch (storageError) {
                            console.warn('Unable to cache the company name:', storageError);
                        }
                    }
                    if(data.tagline) document.getElementById('compTagline').value = data.tagline;
                    if(data.phone1) document.getElementById('compPhone1').value = data.phone1;
                    if(data.phone2) document.getElementById('compPhone2').value = data.phone2;
                    if(data.email) document.getElementById('compEmail').value = data.email;
                    if(data.website) document.getElementById('compWebsite').value = data.website;
                    document.getElementById('compSignatoryName').value = data.authorisedSignatoryName || '';
                    document.getElementById('compSignatoryDesignation').value = data.authorisedSignatoryDesignation || '';
                    document.getElementById('compSignatoryQualification').value = data.authorisedSignatoryQualificationLicence || '';

                    if(data.bankName) document.getElementById('compBankName').value = data.bankName;
                    if(data.accName) document.getElementById('compAccName').value = data.accName;
                    if(data.accNo) document.getElementById('compAccNo').value = data.accNo;
                    if(data.ifsc) document.getElementById('compIfsc').value = data.ifsc;
                    if(data.upi) document.getElementById('compUpi').value = data.upi;
                    try {
                        localStorage.setItem('corebiq-company-bank-card-profile', JSON.stringify({
                            clinicName: data.name || '',
                            accountName: data.accName || '',
                            bankName: data.bankName || '',
                            accountNumber: data.accNo || '',
                            ifsc: data.ifsc || '',
                            upi: data.upi || '',
                            phone: data.phone1 || ''
                        }));
                    } catch (storageError) {
                        console.warn('Unable to cache company bank details locally:', storageError);
                    }
                }
            } catch (error) {
                console.error("Error fetching company details:", error);
            }

            // ROLE-BASED ACCESS CONTROL (RBAC)
            // If the user is NOT an admin, hide the edit button so they cannot modify the profile
            if (window.currentUser && window.currentUser.role !== 'admin') {
                const editBtn = document.getElementById('editCompanyBtn');
                if(editBtn) editBtn.style.display = 'none';
            }
        };

        window.loadCompanyData();

        // --- 2. TOGGLE EDIT MODE ---
        window.companyOriginalValues = null;

        window.toggleEditMode = function(editing) {
            const inputs = document.querySelectorAll('#company-overview-form .readonly-input');
            const saveActions = document.getElementById('save-actions');
            const editButton = document.getElementById('editCompanyBtn');
            const isEditing = typeof editing === 'boolean'
                ? editing
                : inputs.length > 0 && inputs[0].hasAttribute('readonly');

            if (isEditing) {
                window.companyOriginalValues = Array.from(inputs, input => [input.id, input.value]);
            }

            inputs.forEach(input => {
                input.classList.toggle('editable', isEditing);
                if (input instanceof HTMLSelectElement) input.disabled = !isEditing;
                else input.toggleAttribute('readonly', !isEditing);
            });

            saveActions.hidden = !isEditing;
            editButton.hidden = isEditing;
        };

        window.cancelCompanyEdit = function() {
            if (window.companyOriginalValues) {
                const originalValues = Object.fromEntries(window.companyOriginalValues);
                window.companyOriginalValues.forEach(([id, value]) => {
                    if (id === 'compState') return;
                    const input = document.getElementById(id);
                    if (input) input.value = value;
                });
                window.updateCompanyStates(originalValues.compState || '');
            }
            window.toggleEditMode(false);
        };

        // --- 3. SAVE DATA TO FIREBASE ---
        window.saveCompanyDetails = async function() {
            const btn = document.getElementById('saveCompanyBtn');
            const saveLabel = document.getElementById('save-company-label');
            saveLabel.innerText = "Saving...";
            btn.disabled = true;

            const payload = {
                name: document.getElementById('compName').value.trim(),
                tagline: document.getElementById('compTagline').value,
                floor: document.getElementById('compFloor').value.trim(),
                buildingNo: document.getElementById('compBuildingNo').value.trim(),
                buildingName: document.getElementById('compBuildingName').value.trim(),
                area: document.getElementById('compArea').value.trim(),
                district: document.getElementById('compDistrict').value.trim(),
                postalCode: document.getElementById('compPostalCode').value.trim(),
                state: document.getElementById('compState').value,
                countryCode: document.getElementById('compCountry').value,
                country: document.getElementById('compCountry').selectedOptions[0]?.textContent.trim() || '',
                currencyCode: document.getElementById('compCurrency').value,
                preferredLanguage: document.getElementById('compLanguage').value,
                address: getCompanyAddress(),
                phone1: document.getElementById('compPhone1').value,
                phone2: document.getElementById('compPhone2').value,
                email: document.getElementById('compEmail').value,
                website: document.getElementById('compWebsite').value,
                authorisedSignatoryName: document.getElementById('compSignatoryName').value.trim(),
                authorisedSignatoryDesignation: document.getElementById('compSignatoryDesignation').value.trim(),
                authorisedSignatoryQualificationLicence: document.getElementById('compSignatoryQualification').value.trim(),
                bankName: document.getElementById('compBankName').value.trim(),
                accName: document.getElementById('compAccName').value,
                accNo: document.getElementById('compAccNo').value,
                ifsc: document.getElementById('compIfsc').value,
                upi: document.getElementById('compUpi').value,
                updatedAt: new Date()
            };

            try {
                // Using merge: true so it creates the document if it doesn't exist, or updates it if it does
                await setDoc(companyDocRef, payload, { merge: true });
                try {
                    localStorage.setItem('corebiq-company-bank-card-profile', JSON.stringify({
                        clinicName: payload.name,
                        accountName: payload.accName,
                        bankName: payload.bankName,
                        accountNumber: payload.accNo,
                        ifsc: payload.ifsc,
                        upi: payload.upi,
                        phone: payload.phone1
                    }));
                } catch (storageError) {
                    console.warn('Unable to cache company bank details locally:', storageError);
                }
                window.applyCorebiqSettings?.(payload);
                try {
                    localStorage.setItem('corebiq-company-name', payload.name.trim());
                } catch (storageError) {
                    console.warn('Unable to cache the updated company name:', storageError);
                }
                alert("Company details updated successfully!");
                window.toggleEditMode(false);
            } catch (error) {
                console.error("Firebase Save Error:", error);
                alert("Failed to save changes. Please check your connection or database rules.");
            }

            saveLabel.innerText = "Save changes";
            btn.disabled = false;
        };
