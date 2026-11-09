import { auth } from '../../../js/firebase-config.js';
        import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

        const taskForm = document.getElementById('task-form');
        const taskFormPanel = document.getElementById('task-form-panel');
        const taskList = document.getElementById('task-list');
        const taskItems = new Map();
        let activeUser = null;
        let editingTaskId = null;

        function taskStorageKey() {
            if (!activeUser?.uid) throw new Error('Sign in again to access your personal tasks.');
            return `corebiq.myTasks.v1:${encodeURIComponent(activeUser.uid)}`;
        }

        function readStoredTasks() {
            let stored;
            try {
                stored = localStorage.getItem(taskStorageKey());
            } catch (error) {
                throw new Error(`Could not access local task storage: ${error.message}`);
            }
            if (!stored) return [];
            try {
                const tasks = JSON.parse(stored);
                if (!Array.isArray(tasks) || tasks.some(task =>
                    !task || typeof task.id !== 'string' || typeof task.title !== 'string'
                )) {
                    throw new Error('Saved task data has an invalid format.');
                }
                return tasks;
            } catch (error) {
                throw new Error(`Could not read local tasks: ${error.message}`);
            }
        }

        function writeStoredTasks(tasks) {
            try {
                localStorage.setItem(taskStorageKey(), JSON.stringify(tasks));
            } catch (error) {
                throw new Error(`Could not save tasks in this browser: ${error.message}`);
            }
        }

        function getLocalDateString(date = new Date()) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function showMessage(message, isError = false) {
            taskList.replaceChildren();
            const element = document.createElement('div');
            element.className = `task-message${isError ? ' error' : ''}`;
            element.textContent = message;
            taskList.appendChild(element);
        }

        function formatDueDate(dateValue) {
            if (!dateValue) return 'No due date';
            const date = new Date(`${dateValue}T00:00:00`);
            return Number.isNaN(date.getTime())
                ? 'Invalid due date'
                : `Due ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)}`;
        }

        function setCount(id, count) {
            document.getElementById(id).textContent = String(count);
        }

        function updateSummary() {
            const items = Array.from(taskItems.values());
            const completed = items.filter(item => item.status === 'completed').length;
            const open = items.length - completed;
            const today = getLocalDateString();
            const dueToday = items.filter(item =>
                item.status !== 'completed' && item.dueDate === today
            ).length;

            setCount('task-open-count', open);
            setCount('task-today-count', dueToday);
            setCount('task-completed-count', completed);
        }

        function makeBadge(text, extraClass = '') {
            const badge = document.createElement('span');
            badge.className = `task-badge ${extraClass}`.trim();
            badge.textContent = text;
            return badge;
        }

        function renderTasks() {
            const searchValue = document.getElementById('task-search').value.trim().toLowerCase();
            const statusFilter = document.getElementById('task-filter-status').value;
            const today = getLocalDateString();
            const filtered = Array.from(taskItems.values())
                .filter(task => statusFilter === 'all' || task.status === statusFilter)
                .filter(task => `${task.title} ${task.description}`.toLowerCase().includes(searchValue))
                .sort((a, b) => {
                    if ((a.status === 'completed') !== (b.status === 'completed')) {
                        return a.status === 'completed' ? 1 : -1;
                    }
                    if (!a.dueDate) return b.dueDate ? 1 : 0;
                    if (!b.dueDate) return -1;
                    return a.dueDate.localeCompare(b.dueDate);
                });

            taskList.replaceChildren();
            if (!filtered.length) {
                const empty = document.createElement('div');
                empty.className = 'task-empty';
                empty.textContent = taskItems.size
                    ? 'No tasks match your search or filter.'
                    : 'No tasks yet. Create one to get started.';
                taskList.appendChild(empty);
                return;
            }

            filtered.forEach(task => {
                const card = document.createElement('article');
                card.className = `task-card${task.status === 'completed' ? ' completed' : ''}`;

                const top = document.createElement('div');
                top.className = 'task-card-top';
                const title = document.createElement('h3');
                title.className = 'task-card-title';
                title.textContent = task.title;

                const badges = document.createElement('div');
                badges.className = 'task-badges';
                badges.appendChild(makeBadge(task.priority, `priority-${task.priority}`));
                if (task.status === 'completed') {
                    badges.appendChild(makeBadge('Completed', 'status-completed'));
                }
                top.append(title, badges);

                const description = document.createElement('p');
                description.className = 'task-description';
                description.textContent = task.description || 'No notes added.';

                const footer = document.createElement('div');
                footer.className = 'task-card-footer';
                const due = document.createElement('span');
                due.className = 'task-due';
                due.textContent = formatDueDate(task.dueDate);
                if (task.dueDate && task.dueDate < today && task.status !== 'completed') {
                    due.classList.add('overdue');
                    due.textContent = `Overdue · ${formatDueDate(task.dueDate).replace(/^Due /, '')}`;
                }

                const actions = document.createElement('div');
                actions.className = 'task-card-actions';
                const status = document.createElement('select');
                status.className = 'task-status-select';
                status.setAttribute('aria-label', `Status for ${task.title}`);
                [
                    ['todo', 'To do'],
                    ['in-progress', 'In progress'],
                    ['completed', 'Completed']
                ].forEach(([value, label]) => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = label;
                    status.appendChild(option);
                });
                status.value = task.status;
                status.addEventListener('change', () => updateTask(task.id, { status: status.value }));

                const edit = document.createElement('button');
                edit.type = 'button';
                edit.className = 'task-icon-button';
                edit.setAttribute('aria-label', `Edit ${task.title}`);
                edit.title = 'Edit task';
                edit.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">edit</span>';
                edit.addEventListener('click', () => openForm(task));

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'task-icon-button delete';
                remove.setAttribute('aria-label', `Delete ${task.title}`);
                remove.title = 'Delete task';
                remove.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">delete</span>';
                remove.addEventListener('click', () => removeTask(task.id));

                actions.append(status, edit, remove);
                footer.append(due, actions);
                card.append(top, description, footer);
                taskList.appendChild(card);
            });
        }

        function openForm(task = null) {
            editingTaskId = task?.id || null;
            document.getElementById('task-form-heading').textContent = task ? 'Edit task' : 'Create task';
            document.getElementById('task-save-button').textContent = task ? 'Save changes' : 'Save task';
            document.getElementById('task-title').value = task?.title || '';
            document.getElementById('task-description').value = task?.description || '';
            document.getElementById('task-due-date').value = task?.dueDate || '';
            document.getElementById('task-priority').value = task?.priority || 'medium';
            document.getElementById('task-status').value = task?.status || 'todo';
            taskFormPanel.hidden = false;
            document.getElementById('task-title').focus();
            taskFormPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function closeForm() {
            editingTaskId = null;
            taskForm.reset();
            document.getElementById('task-priority').value = 'medium';
            document.getElementById('task-status').value = 'todo';
            document.getElementById('task-form-heading').textContent = 'Create task';
            document.getElementById('task-save-button').textContent = 'Save task';
            taskFormPanel.hidden = true;
        }

        async function loadTasks() {
            if (!activeUser) return;
            taskList.replaceChildren();
            const loading = document.createElement('div');
            loading.className = 'task-empty';
            loading.textContent = 'Loading your tasks...';
            taskList.appendChild(loading);

            try {
                const tasks = readStoredTasks();
                taskItems.clear();
                tasks.forEach(task => {
                    taskItems.set(task.id, {
                        id: task.id,
                        title: task.title || '',
                        description: task.description || '',
                        dueDate: task.dueDate || '',
                        priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium',
                        status: ['todo', 'in-progress', 'completed'].includes(task.status) ? task.status : 'todo'
                    });
                });
                updateSummary();
                renderTasks();
            } catch (error) {
                console.error('Unable to load local personal tasks:', error);
                showMessage(`Could not load tasks: ${error.message}`, true);
            }
        }

        async function updateTask(taskId, changes) {
            if (!activeUser) {
                showMessage('Sign in again to update tasks.', true);
                return;
            }
            try {
                const task = taskItems.get(taskId);
                if (!task) throw new Error('Task is no longer available.');
                taskItems.set(taskId, { ...task, ...changes });
                writeStoredTasks(Array.from(taskItems.values()));
                updateSummary();
                renderTasks();
            } catch (error) {
                console.error('Unable to update local task:', error);
                window.alert(`Could not update task: ${error.message}`);
                await loadTasks();
            }
        }

        async function removeTask(taskId) {
            const task = taskItems.get(taskId);
            if (!task || !window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;

            try {
                taskItems.delete(taskId);
                writeStoredTasks(Array.from(taskItems.values()));
                updateSummary();
                renderTasks();
            } catch (error) {
                console.error('Unable to delete local task:', error);
                window.alert(`Could not delete task: ${error.message}`);
                await loadTasks();
            }
        }

        taskForm.addEventListener('submit', async event => {
            event.preventDefault();
            if (!activeUser) {
                window.alert('Sign in again to save tasks.');
                return;
            }

            const title = document.getElementById('task-title').value.trim();
            if (!title) {
                document.getElementById('task-title').focus();
                return;
            }

            const saveButton = document.getElementById('task-save-button');
            saveButton.disabled = true;
            try {
                const payload = {
                    id: editingTaskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
                    title,
                    description: document.getElementById('task-description').value.trim(),
                    dueDate: document.getElementById('task-due-date').value,
                    priority: document.getElementById('task-priority').value,
                    status: document.getElementById('task-status').value
                };
                if (editingTaskId) {
                    if (!taskItems.has(editingTaskId)) throw new Error('Task is no longer available.');
                    taskItems.set(editingTaskId, payload);
                } else {
                    taskItems.set(payload.id, payload);
                }
                writeStoredTasks(Array.from(taskItems.values()));
                closeForm();
                updateSummary();
                await loadTasks();
            } catch (error) {
                console.error('Unable to save local task:', error);
                window.alert(`Could not save task: ${error.message}`);
            } finally {
                saveButton.disabled = false;
            }
        });

        document.getElementById('task-new-button').addEventListener('click', () => openForm());
        document.getElementById('task-close-form').addEventListener('click', closeForm);
        document.getElementById('task-cancel-button').addEventListener('click', closeForm);
        document.getElementById('task-search').addEventListener('input', renderTasks);
        document.getElementById('task-filter-status').addEventListener('change', renderTasks);

        onAuthStateChanged(auth, user => {
            if (!user) {
                activeUser = null;
                showMessage('Sign in to view your personal tasks.', true);
                return;
            }
            activeUser = user;
            loadTasks();
        });
