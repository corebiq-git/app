import './corebiq-locale.js';
import { auth, db } from './firebase-config.js';
import { APP_METADATA } from './app-metadata.js';
import {
    doc,
    getDoc,
    collection,
    getDocs,
    query,
    where,
    setDoc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

/* -------------------------------------------------------
   GLOBAL STATE
------------------------------------------------------- */
window.currentUser = null;
window.allApts = [];
window.aptDatesSet = new Set();
window.apptChartInstance = null;

/* Local-date helper: avoids UTC date shifting in India/other timezones. */
window.getLocalDateString = function(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

/* -------------------------------------------------------
   MODULE MAP
------------------------------------------------------- */
document.title = `${APP_METADATA.name} | Clinic Management Dashboard`;
window.cmAppFileMap = APP_METADATA.moduleRoutes;

/* -------------------------------------------------------
   ERROR BANNER
------------------------------------------------------- */
window.onerror = function(message, source, lineno) {
    const errDiv = document.getElementById('dash-error-banner');
    const errText = document.getElementById('dash-error-text');

    if (errDiv && errText) {
        errDiv.style.display = 'flex';
        errText.innerText = `Error at Line ${lineno || '?'}: ${message}`;
    }
    return false;
};

/* -------------------------------------------------------
   LOGOUT / AUTH GATE
------------------------------------------------------- */
window.handleLogout = async function() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
        alert("Unable to sign out. Please try again.");
    }
};

window.deferredInstallPrompt = null;

window.isAppInstalled = function() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        navigator.standalone === true;
};

window.updateInstallButton = function() {
    const button = document.getElementById('install-app-button');
    if (button) button.hidden = window.isAppInstalled();
};

window.installApp = async function() {
    if (window.isAppInstalled()) {
        window.updateInstallButton();
        return;
    }

    if (!window.deferredInstallPrompt) {
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        window.alert(isIOS
            ? 'To install COREBIQ BUSINESS FLOW APP, tap the Share button in Safari and choose "Add to Home Screen".'
            : 'To install COREBIQ BUSINESS FLOW APP, use your browser menu and choose "Install app" or "Add to Home screen".');
        return;
    }

    const installPrompt = window.deferredInstallPrompt;
    window.deferredInstallPrompt = null;
    window.updateInstallButton();

    try {
        await installPrompt.prompt();
        await installPrompt.userChoice;
    } catch (error) {
        console.error('Unable to open the app installation prompt:', error);
        window.alert('The install prompt could not be opened. Please try again from your browser menu.');
    } finally {
        window.updateInstallButton();
    }
};

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    window.deferredInstallPrompt = event;
    window.updateInstallButton();
});

window.addEventListener('appinstalled', () => {
    window.deferredInstallPrompt = null;
    window.updateInstallButton();
});

window.matchMedia('(display-mode: standalone)').addEventListener?.('change', window.updateInstallButton);
window.updateInstallButton();

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('./login.html');
        return;
    }

    try {
        const emailLower = (user.email || '').toLowerCase();
        if (!emailLower) throw new Error("Authenticated account has no email.");

        const userDocRef = doc(db, "users", emailLower);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            throw new Error("No database access found. Contact Administrator.");
        }

        const userData = userDoc.data();

        window.currentUser = {
            email: emailLower,
            name: userData.name || userData.fullName || user.displayName || emailLower,
            role: userData.role || "user",
            branch: userData.branch || "Unknown"
        };
        window.updateHeaderProfile();

        const app = document.getElementById('app-container');
        if (app) app.style.visibility = 'visible';
        const startupSplash = document.getElementById('startup-splash');
        if (startupSplash) {
            startupSplash.classList.add('is-hidden');
            window.setTimeout(() => startupSplash.remove(), 400);
        }
        await window.switchView('view-dashboard');

        /* Sidebar is loaded separately; hide the Users item after it appears too. */
        window.applyRoleVisibility();

    } catch (error) {
        console.error(error);
        try { await signOut(auth); } catch (_) {}
        alert(error.message || "Unable to authenticate.");
    }
});

/* -------------------------------------------------------
   ROLE VISIBILITY
------------------------------------------------------- */
window.applyRoleVisibility = function() {
    const restrictedSelectors = [
        '#nav-users-btn',
        '#nav-usage-btn',
        '[data-target="view-users"]',
        '[onclick*="view-users"]',
        '[onclick*="usage.html"]'
    ];
    const isAdmin = window.currentUser?.role === 'admin';
    restrictedSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
            element.style.display = isAdmin ? '' : 'none';
        });
    });
    document.querySelectorAll('#sidebar-nav .sidebar-nav-group, #sidebar-nav .sidebar-nav-subgroup').forEach(group => {
        const hasAvailableModules = [...group.querySelectorAll('.nav-link')]
            .some(link => link.style.display !== 'none');
        group.hidden = !hasAvailableModules;
    });
    document.querySelectorAll('#top-module-nav .top-nav-group:not([data-category="Dashboard"])').forEach(group => {
        const hasAvailableModules = [...group.querySelectorAll('.top-nav-link')]
            .some(link => link.style.display !== 'none');
        group.hidden = !hasAvailableModules;
    });
    document.querySelectorAll('#top-module-nav .top-nav-submenu-group').forEach(group => {
        const hasAvailableModules = [...group.querySelectorAll('.top-nav-link')]
            .some(link => link.style.display !== 'none');
        group.hidden = !hasAvailableModules;
    });
};

window.updateMobileSidebarSelectionStyle = function() {
    const links = document.querySelectorAll('#sidebar-container .nav-link');
    links.forEach(link => {
        link.classList.remove('mobile-selected');
        if (link.dataset.mobileSelectedStyle !== 'true') return;
        link.style.removeProperty('background-color');
        link.style.removeProperty('color');
        link.style.removeProperty('box-shadow');
        delete link.dataset.mobileSelectedStyle;
    });

    if (window.innerWidth > 768) return;
    const selected = document.querySelector('#sidebar-container .nav-link.active');
    if (!selected) return;
    selected.classList.add('mobile-selected');
    selected.dataset.mobileSelectedStyle = 'true';
    selected.style.setProperty('background-color', 'transparent', 'important');
    selected.style.setProperty('color', '#071630', 'important');
    selected.style.setProperty('box-shadow', 'none', 'important');
};

window.addEventListener('resize', window.updateMobileSidebarSelectionStyle);

window.buildSidebarNavigation = function() {
    const nav = document.querySelector('#sidebar-container #sidebar-nav');
    if (!nav || nav.dataset.grouped === 'true') return;

    const categoryByTarget = {
        'view-contacts': ['CRM'],
        'view-my-tasks': ['CRM'],
        'view-patients': ['CRM'],
        'view-appointments': ['CRM'],
        'view-public-booking': ['CRM'],
        'view-transaction': ['Accounts'],
        'view-cash-ledger': ['Accounts'],
        'view-bank-ledger': ['Accounts'],
        'view-ledgers': ['Accounts'],
        'view-qr': ['Accounts'],
        'view-therapist': ['HR'],
        'view-staff': ['HR'],
        'view-attendance': ['HR'],
        'view-calc': ['More', 'Tools'],
        'view-invoice': ['Templates'],
        'view-letterhead': ['Templates'],
        'view-bank-card': ['Templates'],
        'view-report': ['Templates'],
        'view-backup': ['More', 'More'],
        'view-branches': ['More', 'Settings'],
        'view-company': ['More', 'Settings'],
        'view-users': ['More', 'Settings'],
        'view-updates': ['More', 'App Info'],
        'view-licenceinfo': ['More', 'App Info'],
        'view-aboutapp': ['More', 'App Info'],
        'view-privacy': ['More', 'More']
    };
    const icons = {
        CRM: 'groups',
        Accounts: 'account_balance_wallet',
        HR: 'badge',
        Templates: 'description',
        More: 'more_horiz',
        Tools: 'build',
        Settings: 'settings',
        'App Info': 'info'
    };
    const sourceLinks = [...nav.querySelectorAll('.nav-link')];
    const dashboard = sourceLinks.find(link => link.dataset.target === 'view-dashboard');
    const email = sourceLinks.find(link => link.dataset.target === 'view-email');
    const entries = new Map();
    if (dashboard) dashboard.dataset.iconCategory = '';
    if (email) email.dataset.iconCategory = '';

    sourceLinks.forEach(link => {
        if (link === dashboard || link === email) return;
        const categoryPath = categoryByTarget[link.dataset.target] ||
            (link.id === 'nav-usage-btn' ? ['More', 'Settings'] : ['More', 'More']);
        const [category, subcategory] = categoryPath;
        link.dataset.iconCategory = ['CRM', 'Accounts', 'HR'].includes(category) ? category : '';
        if (!entries.has(category)) entries.set(category, new Map());
        const submenus = entries.get(category);
        const key = subcategory || category;
        if (!submenus.has(key)) submenus.set(key, []);
        submenus.get(key).push(link);
    });

    const createGroup = (label, icon, links, groupClass, contentClass) => {
        const group = document.createElement('div');
        group.className = groupClass;
        group.dataset.category = label;

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = groupClass === 'sidebar-nav-group'
            ? 'sidebar-nav-trigger'
            : 'sidebar-nav-submenu-trigger';
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-haspopup', 'true');
        trigger.onclick = () => window.toggleSidebarNavGroup(trigger);

        const iconElement = document.createElement('span');
        iconElement.className = 'material-symbols-rounded';
        iconElement.setAttribute('aria-hidden', 'true');
        iconElement.textContent = icon;

        const labelElement = document.createElement('span');
        labelElement.textContent = label;

        const chevron = document.createElement('span');
        chevron.className = `material-symbols-rounded ${groupClass === 'sidebar-nav-group' ? 'sidebar-nav-chevron' : 'sidebar-nav-submenu-chevron'}`;
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = 'expand_more';
        trigger.append(iconElement, labelElement, chevron);

        const content = document.createElement('div');
        content.className = contentClass;
        links.forEach(link => content.appendChild(link));
        group.append(trigger, content);
        return group;
    };

    const allOriginalLinks = sourceLinks;
    nav.replaceChildren();
    if (dashboard) nav.appendChild(dashboard);

    ['CRM', 'Accounts', 'HR', 'Templates'].forEach(category => {
        const links = entries.get(category)?.get(category) || [];
        if (links.length) {
            nav.appendChild(createGroup(category, icons[category], links, 'sidebar-nav-group', 'sidebar-nav-content'));
        }
    });
    if (email) nav.appendChild(email);

    const moreEntries = entries.get('More');
    if (moreEntries?.size) {
        const moreGroup = createGroup('More', icons.More, [], 'sidebar-nav-group', 'sidebar-nav-content');
        const content = moreGroup.querySelector('.sidebar-nav-content');
        ['Tools', 'Settings', 'App Info', 'More'].forEach(subcategory => {
            const links = moreEntries.get(subcategory);
            if (!links?.length) return;
            const label = subcategory === 'More' ? 'More modules' : subcategory;
            content.appendChild(createGroup(
                label,
                icons[subcategory],
                links,
                'sidebar-nav-subgroup',
                'sidebar-submenu-content'
            ));
        });
        nav.appendChild(moreGroup);
    }

    nav.dataset.grouped = 'true';
    window.updateMobileSidebarSelectionStyle();
    allOriginalLinks.forEach(link => {
        if (link !== dashboard && link !== email && !nav.contains(link)) {
            console.error('A sidebar module link was not assigned to a navigation group:', link);
        }
    });
};

window.buildTopNavigation = function() {
    const source = document.querySelector('#sidebar-container #sidebar-nav');
    const nav = document.getElementById('top-module-nav');
    if (!source || !nav) return;

    const categoryByTarget = {
        'view-contacts': 'CRM',
        'view-my-tasks': 'CRM',
        'view-patients': 'CRM',
        'view-appointments': 'CRM',
        'view-public-booking': 'CRM',
        'view-transaction': 'Accounts',
        'view-cash-ledger': 'Accounts',
        'view-bank-ledger': 'Accounts',
        'view-ledgers': 'Accounts',
        'view-qr': 'Accounts',
        'view-therapist': 'HR',
        'view-staff': 'HR',
        'view-attendance': 'HR',
        'view-email': 'Email',
        'view-calc': 'Tools',
        'view-invoice': 'Templates',
        'view-letterhead': 'Templates',
        'view-bank-card': 'Templates',
        'view-report': 'Templates',
        'view-branches': 'Settings',
        'view-company': 'Settings',
        'view-users': 'Settings',
        'view-updates': 'App Info',
        'view-licenceinfo': 'App Info',
        'view-aboutapp': 'App Info',
        'view-backup': 'More',
        'view-privacy': 'More'
    };
    const menus = new Map([...nav.querySelectorAll('.top-nav-group[data-category]')]
        .map(group => [group.dataset.category, group]));
    const moreMenu = menus.get('More')?.querySelector('.top-nav-menu');
    menus.forEach(group => {
        const menu = group.querySelector('.top-nav-menu');
        menu?.querySelectorAll('.top-nav-link').forEach(link => link.remove());
    });

    source.querySelectorAll('.nav-link').forEach(sourceLink => {
        const target = sourceLink.dataset.target;
        const category = categoryByTarget[target] || (sourceLink.id === 'nav-usage-btn' ? 'Settings' : '');
        if (category === 'Email') return;
        const submenuGroup = category === 'Tools' || category === 'Settings' || category === 'App Info'
            ? [...(moreMenu?.querySelectorAll('.top-nav-submenu-group') || [])]
                .find(item => item.dataset.subcategory === category)
            : null;
        const group = menus.get(category);
        const menu = submenuGroup?.querySelector('.top-nav-submenu-menu') ||
            (category === 'More' ? group?.querySelector('.top-nav-submenu-menu') : group?.querySelector('.top-nav-menu'));
        if (!menu) return;

        const link = sourceLink.cloneNode(true);
        link.removeAttribute('id');
        link.removeAttribute('title');
        link.removeAttribute('aria-label');
        link.className = 'top-nav-link';
        link.setAttribute('role', 'menuitem');
        menu.appendChild(link);
    });

    window.applyRoleVisibility();
};

window.closeTopNavMenus = function() {
    document.querySelectorAll('#top-module-nav .top-nav-menu.open').forEach(menu => menu.classList.remove('open'));
    document.querySelectorAll('#top-module-nav .top-nav-trigger[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    document.querySelectorAll('#top-module-nav .top-nav-submenu-menu.open').forEach(menu => menu.classList.remove('open'));
    document.querySelectorAll('#top-module-nav .top-nav-submenu-trigger[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
};

window.toggleSidebarNavGroup = function(trigger) {
    const group = trigger.closest('.sidebar-nav-group, .sidebar-nav-subgroup');
    if (!group) return;
    const shouldOpen = !group.classList.contains('open');
    const parent = group.parentElement;
    [...parent.children].forEach(sibling => {
        if (!sibling.matches('.sidebar-nav-group, .sidebar-nav-subgroup') || sibling === group) return;
        sibling.classList.remove('open');
        sibling.querySelector(':scope > .sidebar-nav-trigger, :scope > .sidebar-nav-submenu-trigger')
            ?.setAttribute('aria-expanded', 'false');
    });
    group.classList.toggle('open', shouldOpen);
    trigger.setAttribute('aria-expanded', String(shouldOpen));
};

window.toggleTopNavMenu = function(category, trigger) {
    const group = [...document.querySelectorAll('#top-module-nav .top-nav-group[data-category]')]
        .find(item => item.dataset.category === category);
    const menu = group?.querySelector('.top-nav-menu');
    if (!menu) return;
    const shouldOpen = !menu.classList.contains('open');
    window.closeTopNavMenus();
    if (shouldOpen) {
        menu.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        const triggerRect = trigger.getBoundingClientRect();
        const menuWidth = menu.getBoundingClientRect().width;
        const left = Math.max(8, Math.min(triggerRect.left, window.innerWidth - menuWidth - 8));
        menu.style.left = `${left}px`;
        menu.style.top = `${triggerRect.bottom + 6}px`;
    }
};

window.toggleTopNavSubmenu = function(trigger) {
    const submenu = trigger.parentElement?.querySelector('.top-nav-submenu-menu');
    if (!submenu) return;
    const shouldOpen = !submenu.classList.contains('open');
    const parentMenu = trigger.closest('.top-nav-menu');
    parentMenu?.querySelectorAll('.top-nav-submenu-menu.open').forEach(menu => {
        menu.classList.remove('open');
        menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
    });
    submenu.classList.toggle('open', shouldOpen);
    trigger.setAttribute('aria-expanded', String(shouldOpen));
};

document.addEventListener('click', event => {
    if (!(event.target instanceof Element) ||
        !event.target.closest('#top-module-nav') ||
        event.target.closest('.top-nav-link')) {
        window.closeTopNavMenus();
    }
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') window.closeTopNavMenus();
});
window.addEventListener('resize', window.closeTopNavMenus);

window.updateSidebarCollapseControl = function() {
    const sidebar = document.getElementById('sidebar-container');
    const button = document.getElementById('sidebar-toggle-button');
    if (!sidebar || !button) return;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const isExpanded = isMobile
        ? sidebar.classList.contains('open')
        : !sidebar.classList.contains('is-collapsed');
    const icon = button.querySelector('.material-symbols-rounded');
    button.setAttribute('aria-expanded', String(isExpanded));
    const actionLabel = isMobile
        ? (isExpanded ? 'Close navigation' : 'Open navigation')
        : (isExpanded ? 'Collapse navigation' : 'Expand navigation');
    button.setAttribute('aria-label', actionLabel);
    button.title = actionLabel;
    if (icon) {
        icon.textContent = isMobile
            ? (isExpanded ? 'menu_open' : 'menu')
            : (isExpanded ? 'left_panel_close' : 'left_panel_open');
    }

    sidebar.querySelectorAll('.nav-link[data-target]').forEach(link => {
        const label = link.cloneNode(true);
        label.querySelectorAll('.material-symbols-rounded').forEach(item => item.remove());
        const text = label.textContent.trim().replace(/\s+/g, ' ');
        link.setAttribute('aria-label', text);
        if (!isMobile && sidebar.classList.contains('is-collapsed')) {
            link.title = text;
        } else {
            link.removeAttribute('title');
        }
    });
};

window.toggleSidebarCollapse = function() {
    const sidebar = document.getElementById('sidebar-container');
    if (!sidebar) return;

    if (window.matchMedia('(max-width: 768px)').matches) {
        sidebar.classList.toggle('open');
    } else {
        sidebar.classList.toggle('is-collapsed');
    }
    window.updateSidebarCollapseControl();
};

/* -------------------------------------------------------
   MENU
------------------------------------------------------- */
window.toggleMobileNavigationMenu = function(forceOpen) {
    const sidebar = document.getElementById('sidebar-container');
    const backdrop = document.getElementById('mobile-nav-backdrop');
    const menuButton = document.querySelector('.bottom-nav-menu-button');
    if (!sidebar) return;

    if (!window.matchMedia('(max-width: 768px)').matches) {
        sidebar.classList.toggle('is-collapsed');
        window.updateSidebarCollapseControl();
        return;
    }

    const isOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', isOpen);
    backdrop?.classList.toggle('visible', isOpen);
    menuButton?.setAttribute('aria-expanded', String(isOpen));
    menuButton?.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    const menuIcon = menuButton?.querySelector('.bottom-nav-icon');
    if (menuIcon instanceof SVGElement) {
        menuIcon.innerHTML = isOpen
            ? '<path d="m18 6-12 12M6 6l12 12"/>'
            : '<path d="M4 6h16M4 12h16M4 18h16"/>';
    }
    window.applyLucideIcons(document.getElementById('bottomnav-container'));
};
window.toggleSidebar = window.toggleMobileNavigationMenu;

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('sidebar-container')?.classList.contains('open')) {
        window.toggleMobileNavigationMenu(false);
    }
});

/* -------------------------------------------------------
   DATE FORMATTERS
   Internal values remain YYYY-MM-DD.
   Display values are DD-MM-YYYY.
------------------------------------------------------- */
window.formatIndianDate = function(dateStr) {
    if (!dateStr) return '';

    if (dateStr instanceof Date) {
        const d = dateStr;
        return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    }

    const value = String(dateStr);

    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
    }

    const slashMatch = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (slashMatch) {
        return `${slashMatch[1].padStart(2,'0')}-${slashMatch[2].padStart(2,'0')}-${slashMatch[3]}`;
    }

    return value;
};

/* -------------------------------------------------------
   COMPONENT LOADER
   Cache-busted so changed header/sidebar/bottomnav files
   are not trapped behind browser/CDN cache.
------------------------------------------------------- */
window.fetchFresh = async function(filename) {
    const separator = filename.includes('?') ? '&' : '?';
    const url = `${filename}${separator}v=${Date.now()}`;

    return fetch(url, {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache'
        }
    });
};

window.applyLucideIcons = function(root = document) {
    const categoryColors = {
        CRM: '#34A853',
        Accounts: '#4285F4',
        HR: '#8E5AE8'
    };
    const defaultColor = '#80868B';
    const icons = {
        dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
        contact_page: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M6 16c.8-1.6 1.8-2.4 3-2.4s2.2.8 3 2.4M15 9h3M15 13h3"/>',
        contacts: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1zM16 5.2a3 3 0 0 1 0 5.6M18 14a5 5 0 0 1 3 4.6V20"/>',
        task_alt: '<path d="m3 7 2 2 4-4M13 7h8M3 17l2 2 4-4M13 17h8"/>',
        groups: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
        event_note: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h3M8 18h7"/>',
        calendar_month: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01"/>',
        calendar_today: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
        event_available: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m2 3-4 4-2-2"/>',
        event_busy: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m5 3 4 4m0-4-4 4"/>',
        language: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
        receipt_long: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM8 8h8M8 12h8M8 16h5"/>',
        payments: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="12" cy="14" r="2"/><path d="M7 15h.01M17 13h.01"/>',
        account_balance_wallet: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h2"/><path d="M7 5V3h11"/>',
        account_balance: '<path d="m3 10 9-7 9 7M4 10h16M6 10v9M10 10v9M14 10v9M18 10v9M3 21h18"/>',
        account_tree: '<rect x="3" y="3" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><path d="M6 8v4h12v4M6 12v4"/>',
        qr_code_scanner: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="4" height="4" rx=".5"/><path d="M17 7h-2v4h4M7 17h4v-2M15 15h2v2h-2zM19 19h.01"/>',
        medical_services: '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><path d="M12 11v6M9 14h6"/>',
        badge: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="10" r="2.5"/><path d="M7.5 17a5 5 0 0 1 9 0"/>',
        how_to_reg: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
        calculate: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8v4H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
        mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
        description: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
        cloud_download: '<path d="M20 16.2A4.5 4.5 0 0 0 18 7.5 6 6 0 0 0 6 9a4 4 0 0 0 0 8h2"/><path d="M12 12v9m-4-4 4 4 4-4"/>',
        monitoring: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/>',
        apartment: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 21V9h6v12M7 7h.01M11 7h.01M15 7h.01M7 11h.01M17 11h.01M17 15h.01"/>',
        domain: '<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/>',
        manage_accounts: '<circle cx="10" cy="8" r="4"/><path d="M3 21v-2a7 7 0 0 1 11-5.7M19 16v6M16 19h6"/><path d="M17.5 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
        campaign: '<path d="m3 11 18-5v12L3 13v-2zM11.6 15.8 13 21l4-1-2-5.5M5 14v4a2 2 0 0 0 2 2h2"/>',
        workspace_premium: '<path d="m12 15 3.5 2 1-4 3-2.5-3-2.5-1-4-3.5 2-3.5-2-1 4-3 2.5 3 2.5 1 4z"/><path d="m8 16-1 6 5-2 5 2-1-6"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 11v5M12 8h.01"/>',
        schedule: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        auto_awesome: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3zM19 14l1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14z"/>',
        grid_view: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/>',
        open_in_new: '<path d="M14 3h7v7M10 14 21 3"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/>',
        south_west: '<path d="M7 7 17 17M17 7v10H7"/>',
        north_east: '<path d="M7 17 17 7M7 7h10v10"/>',
        today: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h3"/>',
        arrow_forward: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
        error: '<circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/>',
        checklist: '<path d="m3 6 2 2 3-3M11 7h10M3 13l2 2 3-3m3 1h10M3 20l2 2 3-3m3 1h10"/>',
        menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
        privacy_tip: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/>',
        business: '<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/>',
        build: '<path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L14 13l-3-3z"/>',
        settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8z" transform="translate(-1 -1) scale(.92)"/>',
        more_horiz: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
        expand_more: '<path d="m6 9 6 6 6-6"/>',
        close: '<path d="m18 6-12 12M6 6l12 12"/>',
        apps: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'
    };
    const moduleHeaderSelector = [
        '.patients-title-icon',
        '.contacts-title-icon',
        '.task-title-icon',
        '.company-page-icon .material-symbols-rounded',
        '.ledger-title-icon .material-symbols-rounded',
        '.page-title-icon .material-symbols-rounded',
        '.title-icon .material-symbols-rounded',
        '.hero-icon .material-symbols-rounded',
        '.bank-card-title .material-symbols-rounded'
    ].map(selector => `.module-container ${selector}`).join(',');
    const selector = [
        '#sidebar-container .nav-link > .material-symbols-rounded:first-child',
        '#sidebar-container .sidebar-nav-trigger > .material-symbols-rounded:first-child',
        '#sidebar-container .sidebar-nav-submenu-trigger > .material-symbols-rounded:first-child',
        '#top-module-nav .top-nav-category-icon',
        '#top-module-nav .top-nav-link > .material-symbols-rounded:first-child',
        '#top-module-nav .top-nav-submenu-trigger > .material-symbols-rounded:first-child',
        '#bottomnav-container .bottom-nav-icon.material-symbols-rounded',
        moduleHeaderSelector
    ].join(',');
    const targets = [];
    if (root instanceof Element && root.matches(selector)) targets.push(root);
    targets.push(...root.querySelectorAll(selector));
    const activeView = root instanceof Element && root.matches('.view-section')
        ? root
        : root instanceof Element
            ? root.closest('.view-section')
            : document.querySelector('.view-section.active');
    const activeNavLink = activeView
        ? [...document.querySelectorAll('#sidebar-container .nav-link')]
            .find(link => link.dataset.target === activeView.id)
        : null;
    const moduleCategory = activeNavLink?.dataset.iconCategory || '';
    targets.forEach(icon => {
        const navLink = icon.closest('.nav-link, .top-nav-link, .bottom-nav-item');
        const navGroup = icon.closest('.sidebar-nav-group');
        const topNavGroup = icon.closest('.top-nav-group');
        const category = navLink?.dataset.iconCategory ||
            (icon.classList.contains('top-nav-category-icon') ? topNavGroup?.dataset.category : '') ||
            (navGroup?.dataset.category === 'CRM' || navGroup?.dataset.category === 'Accounts' || navGroup?.dataset.category === 'HR'
                ? navGroup.dataset.category
                : moduleCategory);
        const isChevron = icon.classList.contains('sidebar-nav-chevron') ||
            icon.classList.contains('sidebar-nav-submenu-chevron') ||
            icon.classList.contains('top-nav-chevron') ||
            icon.classList.contains('top-nav-submenu-chevron');
        const isBottomNav = navLink?.classList.contains('bottom-nav-item');
        const isSelectedBottomNav = isBottomNav &&
            (navLink.classList.contains('active') || navLink.getAttribute('aria-expanded') === 'true');
        const color = isSelectedBottomNav
            ? '#FFFFFF'
            : isBottomNav
                ? 'rgba(11, 31, 75, .55)'
                : isChevron ? defaultColor : categoryColors[category] || defaultColor;
        icon.style.setProperty('color', color, 'important');
        if (!(icon instanceof SVGElement)) {
            icon.style.setProperty('font-variation-settings', '"FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24', 'important');
        }
        if (icon instanceof SVGElement || icon.dataset.lucideIcon === 'true') return;
        const paths = icons[icon.textContent.trim()];
        if (!paths) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '1em');
        svg.setAttribute('height', '1em');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        svg.dataset.lucideIcon = 'true';
        svg.setAttribute('class', icon.getAttribute('class') || '');
        svg.style.setProperty('color', color, 'important');
        svg.innerHTML = paths;
        icon.replaceWith(svg);
    });
};

window.moduleHtmlCache = new Map();
window.getModuleHtml = function(filename) {
    if (!window.moduleHtmlCache.has(filename)) {
        const request = window.fetchFresh(filename)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`File fetch failed: HTTP ${response.status}`);
                }
                return response.text();
            })
            .catch(error => {
                window.moduleHtmlCache.delete(filename);
                throw error;
            });
        window.moduleHtmlCache.set(filename, request);
    }
    return window.moduleHtmlCache.get(filename);
};

window.prefetchModule = function(targetId) {
    const filename = window.cmAppFileMap[targetId];
    if (filename && !window.moduleHtmlCache.has(filename)) {
        window.getModuleHtml(filename).catch(error => {
            console.error(`Error preloading ${filename}:`, error);
        });
    }
};

document.addEventListener('pointerover', event => {
    const link = event.target.closest('#top-module-nav [data-target^="view-"]');
    if (link) window.prefetchModule(link.dataset.target);
});
document.addEventListener('focusin', event => {
    const link = event.target.closest('#top-module-nav [data-target^="view-"]');
    if (link) window.prefetchModule(link.dataset.target);
});

window.loadComponent = async function(elementId, filename) {
    try {
        const response = await window.fetchFresh(filename);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const element = document.getElementById(elementId);
        if (!element) return;

        element.innerHTML = await response.text();
        window.applyRoleVisibility();

        if (filename === 'components/header.html') {
            window.buildTopNavigation();
            window.applyLucideIcons(document);
            window.updateGlobalClock?.();
            window.updateHeaderProfile();
            window.updateSidebarCollapseControl();
            window.updateNotificationBell();
            window.updateInstallButton();
        }

        if (filename === 'components/bottomnav.html') {
            window.applyLucideIcons(document);
        }

        if (filename === 'components/sidebar.html') {
            window.buildSidebarNavigation();
            window.buildTopNavigation();
            window.applyLucideIcons(document);
            window.updateSidebarCollapseControl();
        }
    } catch (error) {
        console.error(`Error loading ${filename}:`, error);
    }
};

window.COREBIQ_APP_VERSION = 'v1.2';
window.COREBIQ_UPDATES_READ_KEY = 'corebiq-updates-viewed-version';
window.updateNotificationBell = function() {
    const button = document.getElementById('notification-button');
    const badge = document.getElementById('notif-badge');
    if (!button || !badge) return;

    let isUnread = true;
    try {
        isUnread = localStorage.getItem(window.COREBIQ_UPDATES_READ_KEY) !== window.COREBIQ_APP_VERSION;
    } catch (error) {
        console.error('Could not read app update notification state:', error);
    }

    button.classList.toggle('has-unread', isUnread);
    button.setAttribute('aria-label', isUnread ? 'App updates: new update' : 'App updates');
    button.title = isUnread ? 'New app update' : 'App updates';
    badge.hidden = !isUnread;
};

window.openAppUpdates = function() {
    window.switchView('view-updates', null);
};

window.addEventListener('storage', event => {
    if (event.key === window.COREBIQ_UPDATES_READ_KEY) {
        window.updateNotificationBell();
    }
});

window.updateHeaderProfile = function() {
    const user = window.currentUser;
    if (!user) return;

    const values = {
        'profile-name': user.name || user.email,
        'profile-email': user.email,
        'profile-role': user.role,
        'profile-branch': user.branch
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value || '—';
    });
};

window.toggleProfileMenu = function(forceOpen) {
    const menu = document.getElementById('profile-menu');
    const button = document.getElementById('profile-button');
    if (!menu || !button) return;

    const shouldOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : !menu.classList.contains('open');
    menu.classList.toggle('open', shouldOpen);
    button.setAttribute('aria-expanded', String(shouldOpen));
};

window.searchModules = function(query) {
    const results = document.getElementById('module-search-results');
    const input = document.getElementById('module-search-input');
    if (!results || !input) return;

    const normalizedQuery = query.trim().toLocaleLowerCase();
    results.replaceChildren();

    if (!normalizedQuery) {
        results.classList.remove('open');
        input.setAttribute('aria-expanded', 'false');
        return;
    }

    const links = Array.from(
        document.querySelectorAll('#top-module-nav [data-target^="view-"]')
    ).filter(link => link.style.display !== 'none' && !link.closest('.top-nav-group')?.hidden);
    const matches = links.map(link => {
        const labelElement = link.cloneNode(true);
        labelElement.querySelectorAll('.material-symbols-rounded').forEach(icon => icon.remove());

        return {
            id: link.getAttribute('data-target'),
            label: labelElement.textContent.trim().replace(/\s+/g, ' '),
            icon: link.querySelector('.material-symbols-rounded')?.textContent.trim() || 'apps'
        };
    }).filter(item => item.id && item.label.toLocaleLowerCase().includes(normalizedQuery));

    if (!matches.length) {
        const empty = document.createElement('div');
        empty.className = 'module-search-empty';
        empty.textContent = 'No matching modules found.';
        results.appendChild(empty);
    } else {
        matches.forEach(item => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'module-search-result';
            option.setAttribute('role', 'option');

            const icon = document.createElement('span');
            icon.className = 'material-symbols-rounded';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = item.icon;

            const label = document.createElement('span');
            label.textContent = item.label;

            option.append(icon, label);
            option.addEventListener('click', () => window.openModuleFromSearch(item.id));
            results.appendChild(option);
        });
    }

    results.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
};

window.toggleModuleSearch = function(forceOpen) {
    const container = document.querySelector('.module-search');
    const button = document.getElementById('module-search-toggle');
    const input = document.getElementById('module-search-input');
    if (!container || !button || !input) return;

    const shouldOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : !container.classList.contains('open');
    container.classList.toggle('open', shouldOpen);
    button.setAttribute('aria-expanded', String(shouldOpen));

    if (shouldOpen) {
        input.focus();
    } else {
        input.value = '';
        window.searchModules('');
        input.blur();
    }
};

window.clearModuleSearch = function() {
    const input = document.getElementById('module-search-input');
    if (!input) return;

    input.value = '';
    window.searchModules('');
    input.focus();
};

window.openModuleFromSearch = function(targetId) {
    const navElement = document.querySelector(
        `#top-module-nav [data-target="${targetId}"]`
    );

    if (navElement && (navElement.style.display === 'none' || navElement.closest('.top-nav-group')?.hidden)) return;

    window.switchView(targetId, navElement || null);
    window.toggleModuleSearch(false);
};

window.handleModuleSearchKeydown = function(event) {
    if (event.key === 'Escape') {
        window.toggleModuleSearch(false);
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault();
        const firstResult = document.querySelector(
            '#module-search-results .module-search-result'
        );
        firstResult?.click();
    }
};

/* -------------------------------------------------------
   CALCULATOR POPUP
------------------------------------------------------- */
window.toggleCalculator = function() {
    const popup = document.getElementById('calc-popup-container');
    if (!popup) return;

    if (popup.style.display === 'flex') {
        popup.style.display = 'none';
        document.querySelector('[data-nav-action="calculator"]')?.setAttribute('aria-pressed', 'false');
        return;
    }

    popup.style.display = 'flex';
    document.querySelector('[data-nav-action="calculator"]')?.setAttribute('aria-pressed', 'true');

    const contentDiv = document.getElementById('calc-popup-content');

    if (contentDiv && contentDiv.innerHTML.trim() === '') {
        contentDiv.innerHTML =
            '<iframe src="modules/tools/calc/calc.html?v=' + Date.now() +
            '" style="width:100%;height:100%;border:none;background:transparent"></iframe>';
    }
};

window.toggleSupportMenu = function(event) {
    event?.stopPropagation();
    const button = document.getElementById('support-button');
    const menu = document.getElementById('support-menu');
    if (!button || !menu) return;
    const isOpen = menu.classList.toggle('open');
    button.setAttribute('aria-expanded', String(isOpen));
};

window.openDashboardPendingDues = async function() {
    window.dashboardPendingDuesRequested = true;
    await window.switchView(
        'view-appointments',
        document.querySelector('#top-module-nav [data-target="view-appointments"]')
    );
    if (
        window.dashboardPendingDuesRequested &&
        typeof window.showPendingDues === 'function'
    ) {
        window.dashboardPendingDuesRequested = false;
        window.showPendingDues();
    }
};

function dragElement(elmnt) {
    if (!elmnt) return;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = document.getElementById(elmnt.id + "-header");

    if (!header) return;

    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        if (window.innerWidth <= 768) return;

        e = e || window.event;
        e.preventDefault();

        pos3 = e.clientX;
        pos4 = e.clientY;

        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();

        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;

        pos3 = e.clientX;
        pos4 = e.clientY;

        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
        elmnt.style.bottom = "auto";
        elmnt.style.right = "auto";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

/* -------------------------------------------------------
   DYNAMIC MODULE LOADER
   Loads module HTML on demand and reuses its in-memory fetch cache.
   Keeps relative imports working from /development/.
------------------------------------------------------- */
window.switchView = async function(targetId, navElement) {
    window.closeTopNavMenus();

    if (targetId === 'view-calc') {
        window.toggleCalculator();
        return;
    }

    document
        .querySelectorAll('.nav-link, .top-nav-link, .nav-item, .bottom-nav-item')
        .forEach(el => {
            el.classList.remove('active');
            el.classList.remove('mobile-selected');
        });

    if (
        navElement &&
        !navElement.classList.contains('close-menu-btn')
    ) {
        navElement.classList.add('active');
    }
    window.updateMobileSidebarSelectionStyle();
    document.querySelectorAll('#top-module-nav [data-target]').forEach(link => {
        if (link.dataset.target === targetId) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });
    const activeTopModule = document.querySelector(`#top-module-nav [data-target="${targetId}"]`);
    document.querySelectorAll('#top-module-nav .top-nav-trigger').forEach(button => button.classList.remove('active'));
    const activeGroup = navElement?.closest('.top-nav-group');
    const activeCategoryTrigger = activeGroup?.querySelector('.top-nav-trigger[aria-haspopup="true"]');
    if (activeCategoryTrigger) activeCategoryTrigger.classList.add('active');
    if (activeTopModule?.closest('.top-nav-group')?.dataset.category === 'Email') {
        activeTopModule.classList.add('active');
    }
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        const target = item.getAttribute('onclick')?.match(/switchView\('([^']+)'/)?.[1];
        const isActive = target === targetId;
        item.classList.toggle('active', isActive);
        if (isActive) {
            item.setAttribute('aria-current', 'page');
        } else {
            item.removeAttribute('aria-current');
        }
    });
    window.applyLucideIcons(document.getElementById('bottomnav-container'));

    document
        .querySelectorAll('.view-section')
        .forEach(el => el.classList.remove('active'));

    const targetDiv = document.getElementById(targetId);
    if (!targetDiv) return;
    const mainContent = document.getElementById('main-content');
    mainContent?.classList.toggle('dashboard-main-active', targetId === 'view-dashboard');
    mainContent?.classList.toggle('patient-main-active', targetId === 'view-patients');

    if (
        window.innerWidth <= 768 &&
        document.getElementById('sidebar-container')?.classList.contains('open')
    ) {
        window.toggleMobileNavigationMenu();
    }

    if (targetId === 'view-invoice') {
        targetDiv.classList.add('active');
        window.dispatchInvoicePayload();
        return;
    }

    if (targetDiv.querySelector('iframe')) {
        targetDiv.classList.add('active');
        return;
    }

    const filename = window.cmAppFileMap[targetId];

    if (!filename) {
        targetDiv.innerHTML =
            '<div style="padding:40px;text-align:center;color:var(--danger)">Module mapping not found.</div>';
        targetDiv.classList.add('active');
        return;
    }

    /* First load: fetch the module. */
    if (
        targetDiv.dataset.loaded !== 'true' &&
        targetDiv.dataset.loading !== 'true'
    ) {

        targetDiv.innerHTML =
            '<div style="text-align:center;padding:40px;color:var(--primary)">Loading module...</div>';

        targetDiv.classList.add('active');
        targetDiv.dataset.loading = 'true';

        try {
            const htmlText = await window.getModuleHtml(filename);

            if (!targetDiv.classList.contains('active')) {
                delete targetDiv.dataset.loading;
                return;
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');
            const moduleUrl = new URL(filename, document.baseURI);
            doc.querySelectorAll('[src], [href], [poster], [action]').forEach(element => {
                ['src', 'href', 'poster', 'action'].forEach(attribute => {
                    const value = element.getAttribute(attribute);
                    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return;
                    element.setAttribute(attribute, new URL(value, moduleUrl).href);
                });
            });

            const moduleContent =
                doc.querySelector('.module-container') || doc.body;

            targetDiv.innerHTML = '';
            doc.head.querySelectorAll('link[data-module-style]').forEach(stylesheet => {
                targetDiv.appendChild(stylesheet.cloneNode(true));
            });

            /* Move children instead of accidentally losing body content. */
            if (moduleContent === doc.body) {
                Array.from(moduleContent.childNodes).forEach(node => {
                    targetDiv.appendChild(node);
                });
            } else {
                targetDiv.appendChild(moduleContent);
            }
            window.applyLucideIcons(targetDiv);

            /* Preserve module-specific styles declared in the fetched page head. */
            doc.head.querySelectorAll('style').forEach(style => {
                targetDiv.prepend(style.cloneNode(true));
            });

            const moduleRoot = targetDiv.querySelector('.module-container');
            const isInteractiveDataModule = /\/modules\/(?:accounts|crm|hr|settings)\//i.test(moduleUrl.pathname);
            const formViewRoot = moduleRoot || targetDiv;
            if (isInteractiveDataModule && formViewRoot.querySelector('form, table, .form-card, input:not([type="hidden"]), select, textarea')) {
                formViewRoot.classList.add('form-view');
                const sharedFormStyle = document.createElement('link');
                sharedFormStyle.rel = 'stylesheet';
                sharedFormStyle.href = new URL('components/form-view.css', document.baseURI).href;
                sharedFormStyle.dataset.sharedFormView = '';
                targetDiv.appendChild(sharedFormStyle);
            }

            /* Re-create scripts so dynamically inserted modules execute. */
            for (const oldScript of targetDiv.querySelectorAll('script')) {
                if (oldScript.type === 'module' && oldScript.src) {
                    await import(oldScript.src);
                    oldScript.remove();
                    continue;
                }

                const newScript = document.createElement('script');

                Array.from(oldScript.attributes).forEach(attr => {
                    newScript.setAttribute(attr.name, attr.value);
                });
                if (newScript.src && newScript.type !== 'module') {
                    newScript.async = false;
                }

                newScript.appendChild(
                    document.createTextNode(oldScript.innerHTML)
                );

                oldScript.parentNode.replaceChild(newScript, oldScript);
            }

            targetDiv.dataset.loaded = 'true';
            delete targetDiv.dataset.loading;

        } catch (error) {

            delete targetDiv.dataset.loading;
            console.error(`Error loading ${filename}:`, error);

            targetDiv.innerHTML = `
                <div style="
                    text-align:center;
                    padding:40px;
                    color:var(--danger);
                    background:#FEF2F2;
                    border-radius:12px;
                    border:1px solid #FEE2E2;
                ">
                    <span class="material-symbols-rounded" style="font-size:32px;margin-bottom:8px">error</span>
                    <br>
                    <b>Module Not Found.</b>
                    <br>
                    Ensure the file <b>${filename}</b> exists in the /development/ folder.
                    <br><br>
                    <button
                        onclick="window.switchView('${targetId}',null)"
                        style="
                            border:1px solid var(--border);
                            background:#fff;
                            border-radius:8px;
                            padding:8px 14px;
                            cursor:pointer;
                            font-weight:600;
                        ">
                        Retry
                    </button>
                </div>
            `;
        }

    } else {
        targetDiv.classList.add('active');
    }

    if (targetId === 'view-dashboard') window.fetchDashboardData?.();
};

/* -------------------------------------------------------
   BOOTSTRAP
------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('resize', window.updateSidebarCollapseControl);

    document.addEventListener('click', event => {
        if (!event.target.closest('.support-actions')) {
            const supportMenu = document.getElementById('support-menu');
            const supportButton = document.getElementById('support-button');
            supportMenu?.classList.remove('open');
            supportButton?.setAttribute('aria-expanded', 'false');
        }

        if (!event.target.closest('.header-actions')) {
            window.toggleProfileMenu(false);
        }

        if (!event.target.closest('.module-search')) {
            window.toggleModuleSearch(false);
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            document.getElementById('support-menu')?.classList.remove('open');
            document.getElementById('support-button')?.setAttribute('aria-expanded', 'false');
            window.toggleProfileMenu(false);
            window.toggleModuleSearch(false);
        }

    });

    dragElement(
        document.getElementById(
            "calc-popup-container"
        )
    );

    /*
       Load shared components with cache-busting.
       These do NOT render the appointment module.
       modules/crm/appointments/appointments.html is loaded only by switchView().
    */
    window.loadComponent(
        'header-container',
        'components/header.html'
    );

    window.loadComponent(
        'sidebar-container',
        'components/sidebar.html'
    );

    window.loadComponent(
        'bottomnav-container',
        'components/bottomnav.html'
    );

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('./sw.js').catch(error => {
            console.error('Service worker registration failed:', error);
        });
    }

    /* If sidebar finishes after authentication, apply role again. */
    setTimeout(
        window.applyRoleVisibility,
        300
    );
    setTimeout(
        window.applyRoleVisibility,
        1000
    );
});