// MYVELO OAuth login V7.15.43 — standalone, deliberately independent from api.js.
import { setButtonLoading, beginGlobalBusy, endGlobalBusy } from "./motion.js?v=7.11.0";
import { showError, showInfo } from "./banner.js?v=7.15.24";

const SESSION_KEY = "garantieportal_company_session";
const CLIENT_VERSION = "7.15.44-oauth";
const button = document.querySelector("#google-login-button");
const params = new URLSearchParams(location.search);
const reason = params.get("reason");
const oauthCode = params.get("oauth_code");
const oauthError = params.get("oauth_error");

function apiBase() {
  return String(window.MYVELO_PORTAL_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");
}

function ensureBackend() {
  const base = apiBase();
  if (!base || !/^https:\/\//i.test(base)) {
    throw new Error("Cloudflare-Backend ist im Frontend noch nicht konfiguriert.");
  }
  return base;
}

function apiUrl(path) {
  return `${ensureBackend()}/api/${String(path || "").replace(/^\/+/, "")}`;
}

function decodeSessionPayload(token) {
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

function getPortalSession() {
  const token = sessionStorage.getItem(SESSION_KEY) || "";
  const payload = decodeSessionPayload(token);
  const validType = payload?.typ === "staff-session" || payload?.typ === "company-session";
  if (!token || !validType || !payload?.exp || payload.exp * 1000 <= Date.now()) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  return { token, payload };
}

function startGoogleOAuth() {
  const returnTo = new URL(location.href);
  returnTo.searchParams.delete("oauth_code");
  returnTo.searchParams.delete("oauth_error");
  const target = new URL(apiUrl("auth/google/start"));
  target.searchParams.set("return_to", returnTo.toString());
  location.assign(target.toString());
}

async function readJson(response, fallback) {
  const text = await response.text();
  let result = null;
  try { result = text ? JSON.parse(text) : null; } catch { /* ignore invalid JSON */ }

  if (!response.ok) {
    throw new Error(result?.error || result?.message || fallback || `HTTP ${response.status}`);
  }
  return result;
}

async function exchangeGoogleOAuthCode(code) {
  console.info("[MYVELO OAuth] exchange:start");
  const response = await fetch(apiUrl("auth/google/exchange"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-portal-client-version": CLIENT_VERSION
    },
    body: JSON.stringify({ code: String(code || "") })
  });

  const result = await readJson(response, "Google-Anmeldung konnte nicht abgeschlossen werden.");
  console.info("[MYVELO OAuth] exchange:response", response.status, Boolean(result?.session_token));
  if (!result?.session_token) {
    throw new Error("Das Backend hat keine gültige Sitzung zurückgegeben.");
  }

  sessionStorage.setItem(SESSION_KEY, result.session_token);
  console.info("[MYVELO OAuth] session:stored");

  // Verify locally that the token is usable before redirecting.
  if (!getPortalSession()) {
    sessionStorage.removeItem(SESSION_KEY);
    throw new Error("Die erhaltene Portal-Sitzung ist ungültig oder bereits abgelaufen.");
  }

  return result;
}

function targetAfterLogin() {
  const next = params.get("next");
  if (!next || next.includes("login.html") || /^https?:/i.test(next)) return "index.html";
  return next;
}

function cleanLoginUrl() {
  const url = new URL(location.href);
  url.searchParams.delete("oauth_code");
  url.searchParams.delete("oauth_error");
  history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
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

async function completeOauthReturn() {
  if (!oauthCode) return false;

  if (button) setButtonLoading(button, true, "Anmeldung wird abgeschlossen …");
  beginGlobalBusy();
  try {
    await exchangeGoogleOAuthCode(oauthCode);
    console.info("[MYVELO OAuth] redirect", targetAfterLogin());
    location.replace(targetAfterLogin());
    return true;
  } catch (error) {
    showError(error?.message || "Google-Anmeldung konnte nicht abgeschlossen werden.", {
      title: "Anmeldung nicht möglich"
    });
    cleanLoginUrl();
    return false;
  } finally {
    if (button) setButtonLoading(button, false);
    endGlobalBusy();
  }
}

if (oauthCode) {
  await completeOauthReturn();
} else if (getPortalSession()) {
  location.replace(targetAfterLogin());
}

button?.addEventListener("click", () => {
  try {
    setButtonLoading(button, true, "Weiter zu Google …");
    startGoogleOAuth();
  } catch (error) {
    setButtonLoading(button, false);
    showError(error?.message || "Anmeldung konnte nicht gestartet werden.", {
      title: "Anmeldung nicht möglich"
    });
  }
});
