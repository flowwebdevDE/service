import { setButtonLoading, beginGlobalBusy, endGlobalBusy } from "./motion.js?v=7.11.0";
import { showError, showInfo } from "./banner.js?v=7.15.24";
import {
  exchangeGoogleOAuthCode,
  getPortalSession,
  startGoogleOAuth
} from "./api-oauth-core.js?v=7.15.47";

const button = document.querySelector("#google-login-button");
const params = new URLSearchParams(location.search);
const reason = params.get("reason");
const oauthCode = params.get("oauth_code");
const oauthError = params.get("oauth_error");

function targetAfterLogin() {
  const next = params.get("next");
  if (!next || next.includes("login.html") || /^https?:/i.test(next)) return "index.html";
  return next;
}

function cleanLoginUrl() {
  const url = new URL(location.href);
  url.searchParams.delete("oauth_code");
  url.searchParams.delete("oauth_error");
  history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
}

if (reason === "expired") {
  showInfo("Deine Sitzung ist beendet. Bitte erneut mit deinem Firmen-Google-Konto anmelden.", {
    title: "Erneute Anmeldung erforderlich",
    duration: 3600,
    id: "employee-session-expired"
  });
}

if (oauthError) {
  const messages = {
    access_denied: "Die Google-Anmeldung wurde abgebrochen.",
    not_authorized: "Dieses Konto ist noch nicht für das Serviceportal freigeschaltet.",
    user_disabled: "Dieser Benutzer ist für das Serviceportal deaktiviert.",
    identity_conflict: "Das Google-Konto konnte dem Benutzer nicht eindeutig zugeordnet werden.",
    state_invalid: "Die Anmeldung konnte nicht sicher fortgesetzt werden. Bitte erneut versuchen.",
    missing_code: "Google hat keinen gültigen Anmeldecode zurückgegeben.",
    login_failed: "Die Google-Anmeldung konnte nicht abgeschlossen werden."
  };
  showError(messages[oauthError] || "Die Google-Anmeldung konnte nicht abgeschlossen werden.", {
    title: "Anmeldung nicht möglich"
  });
  cleanLoginUrl();
}

if (oauthCode) {
  if (button) setButtonLoading(button, true, "Anmeldung wird abgeschlossen …");
  beginGlobalBusy();
  try {
    await exchangeGoogleOAuthCode(oauthCode);
    location.replace(targetAfterLogin());
  } catch (error) {
    showError(error.message, { title: "Anmeldung nicht möglich" });
    cleanLoginUrl();
  } finally {
    if (button) setButtonLoading(button, false);
    endGlobalBusy();
  }
} else if (getPortalSession()) {
  location.replace(targetAfterLogin());
}

button?.addEventListener("click", () => {
  try {
    setButtonLoading(button, true, "Weiter zu Google …");
    startGoogleOAuth();
  } catch (error) {
    setButtonLoading(button, false);
    showError(error.message, { title: "Anmeldung nicht möglich" });
  }
});
