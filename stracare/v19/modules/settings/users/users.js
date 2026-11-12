import { auth, db } from '../../../js/firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js';

const moduleContainer = document.querySelector('.module-container');
const functions = getFunctions(undefined, 'us-central1');
const createManagedUser = httpsCallable(functions, 'createManagedUser');
const updateManagedUser = httpsCallable(functions, 'updateManagedUser');
const deleteManagedUser = httpsCallable(functions, 'deleteManagedUser');
let editingEmail = null;
let usersByEmail = new Map();

if (!window.currentUser || window.currentUser.role !== 'admin') {
    moduleContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--danger);"><h3>Access Denied. Admins Only.</h3></div>';
} else {
    const emailInput = document.getElementById('editUserEmail');
    const passwordInput = document.getElementById('editUserPassword');
    const roleInput = document.getElementById('editUserRole');
    const branchInput = document.getElementById('editUserBranch');
    const saveButton = document.getElementById('saveUserBtn');
    const message = document.getElementById('userMsg');

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[character]);
    }

    function showMessage(text, isError = false) {
        message.textContent = text;
        message.style.color = isError ? 'var(--danger)' : 'var(--success)';
    }

    window.toggleBranchInput = function() {
        const isAdmin = roleInput.value === 'admin';
        if (isAdmin) branchInput.value = 'ALL';
        else if (branchInput.value === 'ALL') branchInput.value = '';
        branchInput.disabled = isAdmin;
        branchInput.style.background = isAdmin ? '#f0f0f0' : 'white';
    };

    window.clearUserForm = function() {
        editingEmail = null;
        emailInput.value = '';
        emailInput.disabled = false;
        passwordInput.value = '';
        passwordInput.required = true;
        passwordInput.placeholder = 'Required for new users';
        roleInput.value = 'user';
        branchInput.value = '';
        document.getElementById('userFormTitle').textContent = 'Add User';
        saveButton.textContent = 'Create User';
        window.toggleBranchInput();
        showMessage('');
    };

    window.loadUsers = async function() {
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Loading users...</td></tr>';
        try {
            const querySnapshot = await getDocs(collection(db, 'users'));
            usersByEmail = new Map();
            querySnapshot.forEach(snapshot => usersByEmail.set(snapshot.id, snapshot.data()));
            if (querySnapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">No users found.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            querySnapshot.forEach(snapshot => {
                const data = snapshot.data();
                const email = snapshot.id;
                const isSelf = email.toLowerCase() === auth.currentUser?.email?.toLowerCase();
                const badgeStyle = data.role === 'admin'
                    ? 'background: #ECFDF5; color: #10B981;'
                    : 'background: #E8EEF7; color: #0B1F4B;';
                tbody.insertAdjacentHTML('beforeend', `
                    <tr style="border-bottom: 1px solid var(--border);">
                        <td data-label="Email" style="padding: 12px; font-weight: bold;">${escapeHtml(email)}</td>
                        <td data-label="Role" style="padding: 12px;"><span style="padding: 4px 8px; border-radius: 6px; font-size: 11px; text-transform: uppercase; font-weight: bold; ${badgeStyle}">${escapeHtml(data.role || 'user')}</span></td>
                        <td data-label="Branch" style="padding: 12px; font-weight: 600;">${escapeHtml(data.branch || '-')}</td>
                        <td data-label="Actions" class="users-actions-cell" style="padding: 12px; text-align: right;">
                            ${isSelf ? '<span style="color: var(--text-muted);">Signed-in account</span>' : `
                                <div class="users-actions">
                                    <button type="button" data-action="edit" data-email="${escapeHtml(email)}" aria-label="Edit ${escapeHtml(email)}"><span class="material-symbols-rounded" aria-hidden="true">edit</span>Edit</button>
                                    <button type="button" data-action="delete" data-email="${escapeHtml(email)}" aria-label="Delete ${escapeHtml(email)}"><span class="material-symbols-rounded" aria-hidden="true">delete</span>Delete</button>
                                </div>
                            `}
                        </td>
                    </tr>
                `);
            });
        } catch (error) {
            console.error('Unable to load users:', error);
            tbody.innerHTML = `<tr><td colspan="4" style="color: var(--danger); padding: 20px;">Error loading users: ${escapeHtml(error.message || 'Please try again.')}</td></tr>`;
        }
    };

    window.editUserRow = function(email) {
        const user = usersByEmail.get(email);
        if (!user) {
            showMessage('This user could not be found. Refresh the list and try again.', true);
            return;
        }
        editingEmail = email;
        emailInput.value = email;
        emailInput.disabled = false;
        passwordInput.value = '';
        passwordInput.required = false;
        passwordInput.placeholder = 'Leave blank to keep current password';
        roleInput.value = user.role || 'user';
        branchInput.value = user.branch || '';
        document.getElementById('userFormTitle').textContent = `Edit ${email}`;
        saveButton.textContent = 'Save Changes';
        window.toggleBranchInput();
        showMessage('');
        document.getElementById('main-content').scrollTo({ top: 0, behavior: 'smooth' });
    };

    async function saveUser() {
        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;
        const role = roleInput.value;
        const branch = role === 'admin' ? 'ALL' : branchInput.value.trim();

        if (!email || !emailInput.checkValidity()) {
            showMessage('Enter a valid email address.', true);
            emailInput.focus();
            return;
        }
        if (!editingEmail && password.length < 6) {
            showMessage('Password must be at least 6 characters.', true);
            passwordInput.focus();
            return;
        }
        if (password && password.length < 6) {
            showMessage('Password must be at least 6 characters.', true);
            passwordInput.focus();
            return;
        }
        if (!branch) {
            showMessage('Branch assignment cannot be empty.', true);
            branchInput.focus();
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = editingEmail ? 'Saving...' : 'Creating...';
        try {
            let successMessage;
            if (editingEmail) {
                await updateManagedUser({ currentEmail: editingEmail, email, password, role, branch });
                successMessage = `Successfully updated ${email}.`;
            } else {
                await createManagedUser({ email, password, role, branch });
                successMessage = `Successfully created ${email}.`;
            }
            window.clearUserForm();
            showMessage(successMessage);
            await window.loadUsers();
        } catch (error) {
            console.error('Unable to save user:', error);
            showMessage(error.message || 'Unable to save this user. Please try again.', true);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = editingEmail ? 'Save Changes' : 'Create User';
        }
    }

    async function removeUser(email) {
        if (!window.confirm(`Delete ${email} and their sign-in account? This cannot be undone.`)) return;
        try {
            await deleteManagedUser({ email });
            showMessage(`Successfully deleted ${email}.`);
            if (editingEmail === email) window.clearUserForm();
            await window.loadUsers();
        } catch (error) {
            console.error('Unable to delete user:', error);
            showMessage(error.message || 'Unable to delete this user. Please try again.', true);
        }
    }

    document.getElementById('usersTableBody').addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        if (button.dataset.action === 'edit') window.editUserRow(button.dataset.email);
        if (button.dataset.action === 'delete') removeUser(button.dataset.email);
    });
    roleInput.addEventListener('change', window.toggleBranchInput);
    saveButton.addEventListener('click', saveUser);
    document.getElementById('clearUserBtn').addEventListener('click', window.clearUserForm);

    window.toggleBranchInput();
    window.loadUsers();
}
