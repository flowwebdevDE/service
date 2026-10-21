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

  function redirectToLogin(reason = "login") {
    if (redirecting) return;
    redirecting = true;

    hideEmployeeUi();
    sessionStorage.removeItem(STORAGE_KEY);

    const next = encodeURIComponent(currentTarget());
    const reasonQuery = reason === "expired"
      ? "&reason=expired"
      : "";
    location.replace(`login.html?next=${next}${reasonQuery}`);
  }

  function sessionState() {
    const token = sessionStorage.getItem(STORAGE_KEY) || "";
    const payload = decodePayload(token);
    const expiresAt = typeof payload?.exp === "number" ? payload.exp * 1000 : 0;

    const valid = Boolean(
      token &&
      payload?.typ === "company-session" &&
      expiresAt > Date.now()
    );

    return {
      token,
      payload,
      hadToken: Boolean(token),
      valid,
      expiresAt: valid ? expiresAt : 0
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
        redirectToLogin(state.hadToken ? "expired" : "login");
        return;
      }

      scheduleExpiry(state.expiresAt);
    }, remaining);
  }

  function checkSession({ reveal = false } = {}) {
    const state = sessionState();

    if (!state.valid) {
      redirectToLogin(state.hadToken ? "expired" : "login");
      return false;
    }

    scheduleExpiry(state.expiresAt);

    if (reveal) {
      document.documentElement.classList.remove("auth-pending");
      document.documentElement.classList.add("auth-ready");
    }

    return true;
  }

  if (!checkSession({ reveal: true })) return;

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

  window.addEventListener("pageshow", () => {
    hideEmployeeUi();

    if (checkSession()) {
      document.documentElement.classList.remove("auth-pending");
      document.documentElement.classList.add("auth-ready");
    }
  });
})();
