import { db } from '../../../js/firebase-config.js';
        import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

        async function loadSealCompanyDetails() {
            try {
                const snapshot = await getDoc(doc(db, 'settings', 'company_profile'));
                if (!snapshot.exists()) throw new Error('Company profile has not been configured.');
                const data = snapshot.data();
                const companyName = String(data.name || '').trim();
                const signatoryName = String(data.authorisedSignatoryName || '').trim();
                const designation = String(data.authorisedSignatoryDesignation || '').trim();
                const qualificationLicence = String(data.authorisedSignatoryQualificationLicence || '').trim();

                document.getElementById('seal-company-name').textContent = `FOR ${companyName || 'Company name not set'}`;
                document.getElementById('seal-company-designation').textContent = designation || 'Designation not set';
                document.getElementById('seal-signatory-name').textContent = signatoryName || 'Authorised signatory name not set';
                document.getElementById('seal-signatory-designation').textContent = designation || 'Designation not set';
                document.getElementById('seal-signatory-qualification').textContent = qualificationLicence || 'Qualification / Licence No. not set';
                document.getElementById('seal-sincerely-company').textContent = companyName || 'Company name not set';
            } catch (error) {
                console.error('Could not load seal details from the company profile:', error);
                document.getElementById('seal-company-name').textContent = 'FOR Company details unavailable';
                document.getElementById('seal-company-designation').textContent = 'Company details unavailable';
                document.getElementById('seal-signatory-name').textContent = 'Company details unavailable';
                document.getElementById('seal-signatory-designation').textContent = 'Company details unavailable';
                document.getElementById('seal-signatory-qualification').textContent = 'Company details unavailable';
                document.getElementById('seal-sincerely-company').textContent = 'Company details unavailable';
            }
        }

        loadSealCompanyDetails();

        window.selectSeal = function(sealType) {
            const sealDisplays = {
                company: 'block',
                doctor: 'flex',
                sincerely: 'block',
                payment: 'flex',
                signature: 'flex'
            };
            const display = sealDisplays[sealType];
            if (!display) throw new Error(`Unsupported seal type: ${sealType}`);

            ['company', 'doctor', 'sincerely', 'payment', 'signature'].forEach(type => {
                document.getElementById(`opt-${type}`).classList.toggle('active', type === sealType);
                document.getElementById(`opt-${type}`).querySelector('input').checked = type === sealType;
                document.getElementById(`seal-${type}`).style.display = type === sealType ? display : 'none';
            });
        }
