import { getPortalSession, logoutPortalSession, requirePortalSession } from "./api.js?v=7.15.4";
import { showInfo, showSuccess } from "./banner.js?v=7.15.24";

const session = requirePortalSession();
if (!session) await new Promise(() => {});

const prefsApi = window.MYVELOEmployeePreferences;
const payload = getPortalSession()?.payload;

function formatExpiry() {
  if (!payload?.exp) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(payload.exp * 1000));
}

const expiryText = formatExpiry();
document.querySelectorAll("#profile-session-expiry, #profile-session-expiry-detail").forEach(element => {
  element.textContent = expiryText;
});

function syncPreferenceControls(preferences = prefsApi?.read?.()) {
  if (!preferences) return;
  document.querySelectorAll("[data-profile-setting]").forEach(button => {
    const key = button.dataset.profileSetting;
    const active = preferences[key] === button.dataset.settingValue;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

syncPreferenceControls();

document.querySelectorAll("[data-profile-setting]").forEach(button => {
  button.addEventListener("click", () => {
    const key = button.dataset.profileSetting;
    const value = button.dataset.settingValue;
    const next = prefsApi?.write?.({ [key]: value });
    syncPreferenceControls(next);
    showSuccess("Die Einstellung wurde für dieses Gerät gespeichert.", { title: "Arbeitsplatz aktualisiert", duration: 2200 });
  });
});

function logout() {
  logoutPortalSession();
  location.replace("login.html");
}

document.querySelector("#logout-button")?.addEventListener("click", logout);
document.querySelector("#profile-logout-button")?.addEventListener("click", logout);

document.querySelector("#profile-reset-preferences")?.addEventListener("click", () => {
  const defaults = prefsApi?.reset?.();
  syncPreferenceControls(defaults);
  showInfo("Standardbereich, Dichte und Bewegungen wurden zurückgesetzt.", { title: "Einstellungen zurückgesetzt", duration: 2400 });
});
