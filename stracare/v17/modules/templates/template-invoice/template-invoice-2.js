import { db } from '../../../js/firebase-config.js';
        import { collection, doc, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

        const loadCompanyProfile = async () => {
            const cachedProfile = window.invoicePayload?.company;
            if (cachedProfile) window.applyCompanyProfile(cachedProfile);
            try {
                const profile = await getDoc(doc(db, 'settings', 'company_profile'));
                if (!profile.exists()) {
                    if (!cachedProfile) window.showToast('Company profile was not found.', true);
                } else {
                    window.applyCompanyProfile(profile.data());
                }
            } catch (error) {
                console.error('Company profile could not be loaded:', error);
                window.showToast(cachedProfile
                    ? 'Using company profile loaded with this invoice; refresh failed.'
                    : 'Company profile could not be loaded.', true);
            }
        };
        loadCompanyProfile();

        const loadInvoiceBranches = async () => {
            try {
                const branches = await getDocs(collection(db, 'branches'));
                const names = branches.docs
                    .filter(branch => String(branch.data().branchId || '').trim().toUpperCase() !== 'B6')
                    .map(branch => branch.data().name)
                    .filter(name => typeof name === 'string' && name.trim())
                    .map(name => name.trim())
                    .sort((a, b) => a.localeCompare(b));
                document.getElementById('invoice-branches').textContent = names.join(' | ');
            } catch (error) {
                console.error('Invoice branch names could not be loaded:', error);
                document.getElementById('invoice-branches').textContent = 'Branch names unavailable.';
                window.showToast('Branch names could not be loaded.', true);
            }
        };
        loadInvoiceBranches();
