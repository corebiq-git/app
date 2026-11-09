import { auth, db } from '../../../js/firebase-config.js';
        import {
            collection,
            doc,
            getDoc,
            getDocs,
            query,
            where
        } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
        import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

        const contactsList = document.getElementById('contacts-list');
        const searchInput = document.getElementById('contacts-search-input');
        const countElement = document.getElementById('contacts-count');
        const tabs = Array.from(document.querySelectorAll('.contacts-tab'));
        const contactTypes = {
            patients: { collection: 'patients', label: 'patient', idField: 'patientId' },
            staff: { collection: 'staff', label: 'staff', idField: 'empId' },
            therapists: { collection: 'therapists', label: 'therapist', idField: 'therapistId' }
        };
        const contactsByType = { patients: null, staff: null, therapists: null };
        const loadingTypes = new Set();
        let activeType = 'patients';
        let currentAuthUser = null;
        let currentUserProfile = null;

        function showState(message, isError = false) {
            contactsList.replaceChildren();
            const state = document.createElement('div');
            state.className = `contacts-state${isError ? ' error' : ''}`;
            state.textContent = message;
            contactsList.appendChild(state);
            countElement.textContent = isError ? 'Unable to load contacts' : '0 contacts';
        }

        function getInitials(name) {
            return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?';
        }

        function normalizePhone(value) {
            let digits = String(value || '').replace(/\D/g, '');
            if (digits.startsWith('00')) digits = digits.slice(2);
            if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
            if (digits.length === 10) digits = `91${digits}`;
            return digits;
        }

        function appendContact(contact) {
            const row = document.createElement('article');
            row.className = 'contact-row';

            const avatar = document.createElement('span');
            avatar.className = 'contact-avatar';
            avatar.setAttribute('aria-hidden', 'true');
            avatar.textContent = getInitials(contact.name);

            const details = document.createElement('div');
            details.className = 'contact-details';
            const name = document.createElement('span');
            name.className = 'contact-name';
            name.textContent = contact.name;
            const meta = document.createElement('div');
            meta.className = 'contact-meta';
            const mobile = document.createElement('span');
            mobile.textContent = contact.mobile || 'No phone number';
            meta.appendChild(mobile);
            [contact.recordId, contact.detail, contact.branch].filter(Boolean).forEach(value => {
                const item = document.createElement('span');
                item.textContent = value;
                meta.appendChild(item);
            });
            details.append(name, meta);
            row.append(avatar, details);

            const actions = document.createElement('div');
            actions.className = 'contact-actions';
            if (contact.phoneDigits) {
                const call = document.createElement('a');
                call.className = 'contact-action';
                call.href = `tel:+${contact.phoneDigits}`;
                call.setAttribute('aria-label', `Call ${contact.name}`);
                call.title = 'Call';
                call.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">call</span>';
                actions.appendChild(call);

                const whatsapp = document.createElement('a');
                whatsapp.className = 'contact-action whatsapp';
                whatsapp.href = `https://wa.me/${contact.phoneDigits}`;
                whatsapp.target = '_blank';
                whatsapp.rel = 'noopener noreferrer';
                whatsapp.setAttribute('aria-label', `WhatsApp ${contact.name}`);
                whatsapp.title = 'WhatsApp';
                whatsapp.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">chat</span>';
                actions.appendChild(whatsapp);
            }
            row.appendChild(actions);
            contactsList.appendChild(row);
        }

        function renderContacts() {
            const search = searchInput.value.trim().toLocaleLowerCase();
            const contacts = contactsByType[activeType] || [];
            const filtered = contacts.filter(contact =>
                `${contact.name} ${contact.mobile} ${contact.recordId} ${contact.detail} ${contact.branch}`.toLocaleLowerCase().includes(search)
            );
            countElement.textContent = `${filtered.length} ${filtered.length === 1 ? 'contact' : 'contacts'}`;
            contactsList.replaceChildren();
            if (!filtered.length) {
                const state = document.createElement('div');
                state.className = 'contacts-state';
                state.textContent = contacts.length
                    ? 'No contacts match your search.'
                    : `No ${contactTypes[activeType].label} contacts found.`;
                contactsList.appendChild(state);
                return;
            }
            filtered.forEach(appendContact);
        }

        function setActiveType(type) {
            if (!contactTypes[type]) return;
            activeType = type;
            tabs.forEach(tab => {
                const selected = tab.dataset.contactType === type;
                tab.classList.toggle('active', selected);
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
            });
            searchInput.value = '';
            const label = contactTypes[type].label;
            searchInput.placeholder = `Search ${label} name, mobile, ID, or branch...`;
            if (contactsByType[type]) renderContacts();
            else loadContacts(currentAuthUser, type);
        }

        async function loadContacts(user, type) {
            if (!user || !contactTypes[type] || contactsByType[type] || loadingTypes.has(type)) return;
            loadingTypes.add(type);
            const label = contactTypes[type].label;
            if (type === activeType) {
                contactsList.replaceChildren();
                const state = document.createElement('div');
                state.className = 'contacts-state';
                state.textContent = `Loading ${label} contacts...`;
                contactsList.appendChild(state);
                countElement.textContent = 'Loading contacts...';
            }

            try {
                if (!currentUserProfile) {
                    const email = String(user.email || '').toLowerCase();
                    if (!email) throw new Error('Signed-in account has no email address.');
                    const userSnapshot = await getDoc(doc(db, 'users', email));
                    if (!userSnapshot.exists()) throw new Error('User profile was not found.');
                    currentUserProfile = userSnapshot.data();
                }
                const typeConfig = contactTypes[type];
                let contactQuery;
                if (currentUserProfile && currentUserProfile.role !== 'admin') {
                    contactQuery = query(
                        collection(db, typeConfig.collection),
                        where('branch', '==', currentUserProfile.branch)
                    );
                } else {
                    contactQuery = collection(db, typeConfig.collection);
                }
                const snapshot = await getDocs(contactQuery);
                contactsByType[type] = snapshot.docs.map(contactDoc => {
                    const data = contactDoc.data();
                    const mobile = String(data.mobile || data.contact || '').trim();
                    return {
                        name: String(data.name || 'Unnamed contact').trim(),
                        mobile,
                        recordId: String(data[typeConfig.idField] || '').trim(),
                        detail: String(data.role || data.specialisation || '').trim(),
                        branch: String(data.branch || '').trim(),
                        phoneDigits: normalizePhone(mobile)
                    };
                }).sort((a, b) => a.name.localeCompare(b.name));
                if (type === activeType) renderContacts();
            } catch (error) {
                console.error(`Unable to load ${label} contacts:`, error);
                if (type === activeType) showState(`Could not load ${label} contacts: ${error.message}`, true);
            } finally {
                loadingTypes.delete(type);
            }
        }

        searchInput.addEventListener('input', renderContacts);
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => setActiveType(tab.dataset.contactType));
            tab.addEventListener('keydown', event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const offset = event.key === 'ArrowRight' ? 1 : -1;
                const nextTab = tabs[(index + offset + tabs.length) % tabs.length];
                nextTab.focus();
                setActiveType(nextTab.dataset.contactType);
            });
        });
        onAuthStateChanged(auth, user => {
            if (!user) {
                currentAuthUser = null;
                currentUserProfile = null;
                Object.keys(contactsByType).forEach(type => { contactsByType[type] = null; });
                showState('Sign in to view patient contacts.', true);
                return;
            }
            if (currentAuthUser?.uid !== user.uid) {
                currentAuthUser = user;
                currentUserProfile = null;
                Object.keys(contactsByType).forEach(type => { contactsByType[type] = null; });
            }
            loadContacts(user, activeType);
        });
