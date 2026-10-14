(() => {
  const STORAGE_KEY = "garantieportal_company_session";
  const EXPIRY_SAFETY_MS = 250;
  let expiryTimer = 0;
  let redirecting = false;

  function decodePayload(token) {
    try {
      const [payload] = String(token || "").split(".");
      if (!payload) return null;

      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }

  function currentTarget() {
    const current = location.pathname.split("/").pop() || "index.html";
    return current + location.search + location.hash;
  }

  function hideEmployeeUi() {
    document.documentElement.classList.add("auth-pending");
    document.documentElement.classList.remove("auth-ready");
  }

  function redirectToLogin(reason = "expired") {
    if (redirecting) return;
    redirecting = true;

    // Hide first, redirect second. This prevents even a single stale frame
    // when a background tab is brought back after the session expired.
    hideEmployeeUi();
    sessionStorage.removeItem(STORAGE_KEY);

    const next = encodeURIComponent(currentTarget());
    const reasonParam = encodeURIComponent(reason);
    location.replace(`login.html?next=${next}&reason=${reasonParam}`);
  }

  function sessionState() {
    const token = sessionStorage.getItem(STORAGE_KEY) || "";
    const payload = decodePayload(token);

    const valid = Boolean(
      token &&
      payload?.typ === "company-session" &&
      typeof payload?.exp === "number" &&
      payload.exp * 1000 > Date.now()
    );

    return {
      token,
      payload,
      valid,
      expiresAt: valid ? payload.exp * 1000 : 0
    };
  }

  function scheduleExpiry(expiresAt) {
    window.clearTimeout(expiryTimer);

    const remaining = Math.max(
      0,
      expiresAt - Date.now() + EXPIRY_SAFETY_MS
    );

    expiryTimer = window.setTimeout(() => {
      const state = sessionState();

      if (!state.valid) {
        redirectToLogin("expired");
        return;
      }

      // Browser timers can be heavily throttled in background tabs.
      scheduleExpiry(state.expiresAt);
    }, remaining);
  }

  function checkSession({ reveal = false } = {}) {
    const state = sessionState();

    if (!state.valid) {
      redirectToLogin("expired");
      return false;
    }

    scheduleExpiry(state.expiresAt);

    if (reveal) {
      document.documentElement.classList.remove("auth-pending");
      document.documentElement.classList.add("auth-ready");
    }

    return true;
  }

  // Initial synchronous gate. Employee UI stays hidden until this passes.
  if (!checkSession({ reveal: true })) return;

  // Background-tab protection. These checks run synchronously when the tab
  // becomes visible/focused, before the next normal interaction.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      hideEmployeeUi();

      if (checkSession()) {
        document.documentElement.classList.remove("auth-pending");
        document.documentElement.classList.add("auth-ready");
      }
    }
  });

  window.addEventListener("focus", () => {
    hideEmployeeUi();

    if (checkSession()) {
      document.documentElement.classList.remove("auth-pending");
      document.documentElement.classList.add("auth-ready");
    }
  });

  // Covers browser back/forward cache restores.
  window.addEventListener("pageshow", () => {
    hideEmployeeUi();

    if (checkSession()) {
      document.documentElement.classList.remove("auth-pending");
      document.documentElement.classList.add("auth-ready");
    }
  });
})();
