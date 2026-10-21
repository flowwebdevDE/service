import { getPortalSession, logoutPortalSession, requirePortalSession } from "./api.js?v=7.15.1";

const session = requirePortalSession();
if (!session) await new Promise(() => {});

const expiry = document.querySelector("#profile-session-expiry");
const payload = getPortalSession()?.payload;

if (expiry && payload?.exp) {
  expiry.textContent = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(payload.exp * 1000));
}

document.querySelector("#logout-button")?.addEventListener("click", () => {
  logoutPortalSession();
  location.replace("login.html");
});
