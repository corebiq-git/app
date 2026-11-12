import { db } from '../../../js/firebase-config.js';
        import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

        const formatAddressParts = parts => parts
            .filter(value => typeof value === 'string' && value.trim())
            .map(value => value.trim());
        const profileText = value => typeof value === 'string' ? value.trim() : '';

        async function loadCompanyDetails() {
            try {
                const snapshot = await getDoc(doc(db, 'settings', 'company_profile'));
                if (!snapshot.exists()) throw new Error('Company profile has not been configured.');

                const profile = snapshot.data();
                const addressLine1 = formatAddressParts([
                    profileText(profile.floor),
                    profileText(profile.buildingNo),
                    profileText(profile.buildingName),
                    profileText(profile.area)
                ]).join(', ');
                const addressLine2 = formatAddressParts([
                    profileText(profile.district),
                    profileText(profile.state),
                    profileText(profile.country),
                    profileText(profile.postalCode)
                ]).join(', ');
                const address = [addressLine1 || profileText(profile.address), addressLine2].filter(Boolean);
                const contacts = [
                    [profileText(profile.phone1), profileText(profile.phone2)].filter(Boolean).join(' | '),
                    profileText(profile.email),
                    profileText(profile.website)
                ].filter(Boolean);
                const businessDetails = [...address, ...contacts].join('\n');

                if (profileText(profile.name)) document.getElementById('business-name').value = profileText(profile.name);
                if (profileText(profile.tagline)) document.getElementById('business-tagline').value = profileText(profile.tagline);
                if (businessDetails) document.getElementById('business-details').value = businessDetails;
                document.querySelectorAll('[data-output]').forEach(field => field.dispatchEvent(new Event('input')));
                document.getElementById('status').textContent = 'Company details loaded from the company profile.';
            } catch (error) {
                console.error('Could not load receipt company details:', error);
                document.getElementById('status').textContent = `Company details could not be loaded: ${error.message}`;
            }
        }

        loadCompanyDetails();
