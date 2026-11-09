(() => {
  const scriptUrl = document.currentScript?.src;
  if (!scriptUrl) {
    throw new Error("Unable to determine the loading asset directory.");
  }

  const style = document.createElement("style");
  style.textContent = `
    .cm-loading-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: grid;
      place-items: center;
      background: rgb(247 247 244 / 88%);
      opacity: 0;
      pointer-events: none;
      -webkit-backdrop-filter: blur(3px);
      backdrop-filter: blur(3px);
    }
    .cm-loading-overlay[hidden] { display: none; }
    .cm-loading-overlay.is-visible {
      opacity: 1;
      pointer-events: auto;
    }
    .cm-loading-logo {
      width: 64px;
      height: 64px;
      object-fit: contain;
      animation: cm-loading-spin 1.2s linear infinite;
    }
    @keyframes cm-loading-spin { to { transform: rotate(360deg); } }
  `;
  document.head.append(style);

  let overlay;
  let hideTimer;
  let showFrame;

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    if (!document.body) return null;

    overlay = document.createElement("div");
    overlay.className = "cm-loading-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-label", "Loading");
    overlay.innerHTML = `
      <img class="cm-loading-logo" alt="" src="${new URL("./processing.png", scriptUrl).href}">
    `;
    document.body.append(overlay);
    return overlay;
  }

  function show() {
    window.clearTimeout(hideTimer);
    const element = ensureOverlay();
    if (!element) {
      document.addEventListener("DOMContentLoaded", show, { once: true });
      return;
    }

    element.hidden = false;
    window.cancelAnimationFrame(showFrame);
    showFrame = window.requestAnimationFrame(() => {
      element.classList.add("is-visible");
      showFrame = 0;
    });
  }

  function hide() {
    window.clearTimeout(hideTimer);
    if (!overlay?.isConnected || overlay.hidden) return;

    window.cancelAnimationFrame(showFrame);
    showFrame = 0;
    overlay.classList.remove("is-visible");
    hideTimer = window.setTimeout(() => {
      if (overlay && !overlay.classList.contains("is-visible")) overlay.hidden = true;
    }, 200);
  }

  async function run(task) {
    show();
    try {
      return await task();
    } finally {
      hide();
    }
  }

  window.CMLoading = { show, hide, run };

  function showStartupLoader() {
    show();
    window.setTimeout(hide, 320);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showStartupLoader, { once: true });
  } else {
    showStartupLoader();
  }
})();
