import '../../../js/corebiq-locale.js';
        import { db } from '../../../js/firebase-config.js';
        import { addDoc, collection, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

        const form = document.getElementById('publicBookingForm');
        const branchSelect = document.getElementById('bookingBranch');
        const submitButton = document.getElementById('submitBooking');
        const notice = document.getElementById('bookingNotice');
        const mobileInput = document.getElementById('bookingMobile');

        const localToday = () => {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        };
        document.getElementById('bookingDate').min = localToday();

        function showNotice(message, isError = false) {
            notice.textContent = message;
            notice.className = `notice show ${isError ? 'error' : 'success'}`;
        }

        mobileInput.addEventListener('input', () => {
            mobileInput.value = mobileInput.value.replace(/\D/g, '').slice(0, 10);
        });

        async function loadBranches() {
            try {
                const snapshot = await getDocs(collection(db, 'branches'));
                const branches = [...new Set(snapshot.docs.map(branch => String(branch.data().name || '').trim()).filter(Boolean))]
                    .sort((a, b) => a.localeCompare(b));
                branchSelect.innerHTML = '<option value="">Select a branch</option>';
                branches.forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    branchSelect.appendChild(option);
                });
                if (!branches.length) {
                    branchSelect.disabled = true;
                    showNotice('No booking branches are currently available. Please contact the clinic.', true);
                }
            } catch (error) {
                console.error('Could not load public booking branches:', error);
                branchSelect.innerHTML = '<option value="">Branches could not be loaded</option>';
                branchSelect.disabled = true;
                document.getElementById('branchHint').textContent = 'Please refresh the page or contact the clinic.';
                showNotice('Unable to load branches. Please try again later.', true);
            }
        }
        loadBranches();

        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (!form.reportValidity()) return;

            const name = document.getElementById('bookingName').value.trim();
            const mobile = mobileInput.value.trim();
            const branch = branchSelect.value;
            const date = document.getElementById('bookingDate').value;
            const time = document.getElementById('bookingTime').value;
            const notes = document.getElementById('bookingNotes').value.trim();
            if (name.length < 2 || !/^\d{10}$/.test(mobile) || !branch || date < localToday() || !time || !/^(0[9]|1\d|20):[0-5]\d$|^21:00$/.test(time)) {
                showNotice('Please check the patient name, 10-digit mobile, branch, future date, and time between 9:00 AM and 9:00 PM.', true);
                return;
            }

            submitButton.disabled = true;
            submitButton.lastChild.textContent = ' Sending…';
            try {
                await addDoc(collection(db, 'booking_requests'), {
                    name,
                    mobile,
                    branch,
                    date,
                    time,
                    notes,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });
                form.reset();
                document.getElementById('bookingDate').min = localToday();
                showNotice('Your request has been sent. Our team will contact you to confirm your appointment.');
            } catch (error) {
                console.error('Could not submit public appointment request:', error);
                showNotice('We could not send your request. Please try again or contact the clinic.', true);
            } finally {
                submitButton.disabled = false;
                submitButton.lastChild.textContent = ' Send booking request';
            }
        });
