const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("backdrop");
    const search = document.getElementById("module-search");
    const cards = [...document.querySelectorAll(".module-card")];
    const noModules = document.getElementById("no-modules");
    const overviewContent = document.getElementById("overview-content");
    const moduleView = document.getElementById("module-view");
    const moduleFrame = document.getElementById("module-frame");
    const moduleViewTitle = document.getElementById("module-view-title");
    const moduleSearch = document.querySelector(".topbar .search");
    const bottomMenuButton = document.getElementById("bottom-menu-button");
    const moduleNames = {
      Accounts: "Accounts", AI: "AI", CRM: "CRM", Data: "Data", HR: "HR",
      Inventory: "Inventory", More: "More", Overview: "Overview", Reports: "Reports",
      Settings: "Settings", Tax: "Tax", Templates: "Templates", tools: "Tools"
    };

    document.getElementById("today-label").textContent = new Intl.DateTimeFormat("en", {
      weekday: "short", day: "numeric", month: "short", year: "numeric"
    }).format(new Date());

    search.addEventListener("input", () => {
      if (!overviewContent.hidden) filterModules();
    });

    function filterModules() {
      const query = search.value.trim().toLowerCase();
      let visibleCount = 0;
      cards.forEach((card) => {
        const matches = `${card.textContent} ${card.dataset.search}`.toLowerCase().includes(query);
        card.hidden = !matches;
        if (matches) visibleCount += 1;
      });
      noModules.hidden = visibleCount > 0;
    }

    function setActiveModule(module) {
      document.querySelectorAll(".nav a[data-module]").forEach((link) => {
        const isActive = link.dataset.module === (module || "Overview");
        link.classList.toggle("active", isActive);
        if (isActive) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
      document.querySelectorAll("#mobile-bottom-nav [data-module]").forEach((link) => {
        const isActive = link.dataset.module === (module || "Overview");
        link.classList.toggle("active", isActive);
        if (isActive) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    }

    function showModule(folder, updateHistory = true) {
      const name = moduleNames[folder];
      if (!name) return showOverview(updateHistory);
      overviewContent.hidden = true;
      moduleView.hidden = false;
      moduleSearch.hidden = true;
      moduleViewTitle.textContent = name;
      setActiveModule(name);
      const frameUrl = new URL(`./modules/${folder}/index.html?embed=1`, window.location.href);
      if (moduleFrame.src !== frameUrl.href) {
        window.CMLoading?.show();
        moduleFrame.src = frameUrl.href;
      }
      if (updateHistory) history.pushState({ module: folder }, "", `?module=${encodeURIComponent(folder)}`);
      closeSidebar();
      window.scrollTo(0, 0);
    }

    function showOverview(updateHistory = true) {
      overviewContent.hidden = false;
      moduleView.hidden = true;
      moduleSearch.hidden = false;
      setActiveModule(null);
      if (updateHistory) history.pushState({}, "", window.location.pathname);
      closeSidebar();
      window.scrollTo(0, 0);
      filterModules();
    }

    moduleFrame.addEventListener("load", () => {
      window.CMLoading?.hide();
      const frameDocument = moduleFrame.contentDocument;
      if (frameDocument) {
        moduleFrame.style.height = `${Math.max(frameDocument.documentElement.scrollHeight, window.innerHeight - 235)}px`;
      }
    });

    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link || link.target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const targetUrl = new URL(link.href, window.location.href);
      if (targetUrl.origin !== window.location.origin) return;
      const moduleMatch = targetUrl.pathname.match(/\/modules\/([^/]+)\/?$/i);
      if (moduleMatch) {
        event.preventDefault();
        showModule(decodeURIComponent(moduleMatch[1]));
      } else if (link.closest(".brand") || link.closest(".nav") || link.dataset.module === "Overview") {
        event.preventDefault();
        showOverview();
      }
    });

    document.getElementById("back-to-overview").addEventListener("click", () => showOverview());
    window.addEventListener("popstate", () => {
      const module = new URLSearchParams(window.location.search).get("module");
      if (module) showModule(module, false);
      else showOverview(false);
    });

    const initialModule = new URLSearchParams(window.location.search).get("module");
    if (initialModule) showModule(initialModule, false);
    else filterModules();

    function openSidebar() {
      sidebar.classList.add("open");
      backdrop.classList.add("show");
      bottomMenuButton.classList.add("active");
      bottomMenuButton.setAttribute("aria-expanded", "true");
    }
    function closeSidebar() {
      sidebar.classList.remove("open");
      backdrop.classList.remove("show");
      bottomMenuButton.classList.remove("active");
      bottomMenuButton.setAttribute("aria-expanded", "false");
    }
    document.getElementById("menu-button").addEventListener("click", openSidebar);
    bottomMenuButton.addEventListener("click", openSidebar);
    backdrop.addEventListener("click", closeSidebar);
    document.querySelectorAll(".nav a").forEach((link) => link.addEventListener("click", closeSidebar));
    document.getElementById("help-button").addEventListener("click", () => {
      window.alert("Choose a module from the menu or search the module cards to open it in your workspace.");
    });