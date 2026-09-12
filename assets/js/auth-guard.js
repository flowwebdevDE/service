(() => {
  const STORAGE_KEY = "garantieportal_company_session";

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

  const token = sessionStorage.getItem(STORAGE_KEY) || "";
  const payload = decodePayload(token);
  const valid = Boolean(
    token &&
    payload?.typ === "company-session" &&
    typeof payload?.exp === "number" &&
    payload.exp * 1000 > Date.now()
  );

  if (!valid) {
    sessionStorage.removeItem(STORAGE_KEY);

    const current = location.pathname.split("/").pop() || "index.html";
    const next = encodeURIComponent(current + location.search);
    location.replace(`login.html?next=${next}`);
    return;
  }

  document.documentElement.classList.remove("auth-pending");
  document.documentElement.classList.add("auth-ready");
})();
