import { getCurrentPortalUser, logoutPortalSession } from "./api-oauth-core.js?v=7.15.47";

function initials(user) {
  const source = String(user?.display_name || user?.email || "MA").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function roleLabel(role) {
  return role === "admin" ? "Administrator" : "Mitarbeiter";
}

async function loadUserContext() {
  try {
    const user = await getCurrentPortalUser();
    window.MYVELOCurrentUser = user;
    document.querySelectorAll("[data-current-user-name]").forEach(el => {
      el.textContent = user.display_name || user.email || "Mitarbeiter";
    });
    document.querySelectorAll("[data-current-user-email]").forEach(el => { el.textContent = user.email || "–"; });
    document.querySelectorAll("[data-current-user-role]").forEach(el => { el.textContent = roleLabel(user.role); });
    document.querySelectorAll("[data-current-user-initials]").forEach(el => {
      const fallback = initials(user);
      el.textContent = fallback;
      el.classList.remove("has-google-avatar");
      el.style.removeProperty("background-image");
      if (user.avatar_url) {
        try {
          const url = new URL(user.avatar_url);
          const host = url.hostname.toLowerCase();
          if (url.protocol === "https:" && (host === "googleusercontent.com" || host.endsWith(".googleusercontent.com"))) {
            el.textContent = "";
            el.classList.add("has-google-avatar");
            el.style.backgroundImage = `url("${url.href.replace(/"/g, "%22")}")`;
          }
        } catch {}
      }
    });
    document.querySelectorAll("[data-admin-only]").forEach(el => { el.hidden = user.role !== "admin"; });
    document.documentElement.dataset.userRole = user.role || "staff";
    window.dispatchEvent(new CustomEvent("myvelo:user-ready", { detail: user }));
    return user;
  } catch (error) {
    console.error("User context failed", error);
    logoutPortalSession();
    const current = location.pathname.split("/").pop() || "index.html";
    location.replace(`login.html?next=${encodeURIComponent(current + location.search)}&reason=expired`);
    return null;
  }
}

window.MYVELOUserContext = { load: loadUserContext };
loadUserContext();
