import { renderWarrantyFlowPdf } from "./pdf/warranty-flowpdf.js?v=7.5.2";
import { CONFIG, hasSupabaseConfig } from "./config.js?v=7.5.2";
let backendAvailable;
let brandLogoPromise;

async function loadBrandLogoBytes() {
  if (!brandLogoPromise) {
    const logoUrl = new URL("../brand/myvelo-logo.png?v=7.0", import.meta.url);

    brandLogoPromise = fetch(logoUrl, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) return null;
        return new Uint8Array(await response.arrayBuffer());
      })
      .catch(() => null);
  }

  return brandLogoPromise;
}

function apiBase() {
  return `${CONFIG.supabaseUrl.replace(/\/$/, "")}/functions/v1/${CONFIG.edgeFunctionName}`;
}

function apiUrl(path = "") {
  const url = new URL(apiBase());

  if (path) {
    url.searchParams.set("route", String(path).replace(/^\/+/, ""));
  }

  // Keep portal API processing in the same German region as the project database.
  url.searchParams.set("forceFunctionRegion", "eu-central-1");

  return url.toString();
}

export function buildCustomerUrl(token) {
  const url = new URL("customer.html", location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("token", token);
  return url.href;
}

function commonHeaders() {
  return {
    apikey: CONFIG.supabasePublishableKey,
    "x-portal-client-version": "7.10.5"
  };
}

function authStorageKey() {
  return CONFIG.authSessionStorage || "garantieportal_company_session";
}

function readPortalSession() {
  return sessionStorage.getItem(authStorageKey()) || "";
}

function writePortalSession(token) {
  if (token) {
    sessionStorage.setItem(authStorageKey(), token);
  } else {
    sessionStorage.removeItem(authStorageKey());
  }
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

export function getPortalSession() {
  const token = readPortalSession();
  const payload = decodeSessionPayload(token);

  if (!token || !payload?.exp || payload.exp * 1000 <= Date.now()) {
    writePortalSession("");
    return null;
  }

  return { token, payload };
}

export function requirePortalSession() {
  const session = getPortalSession();

  if (!session) {
    const current = location.pathname.split("/").pop() || "index.html";
    const next = encodeURIComponent(current + location.search);
    location.replace(`login.html?next=${next}`);
    return null;
  }

  return session;
}

export async function loginWithCompanyKey(companyKey) {
  const key = String(companyKey || "");

  if (!key) {
    throw new Error("Login-Key fehlt.");
  }

  const response = await fetch(apiUrl("auth/login"), {
    method: "POST",
    headers: {
      ...commonHeaders(),
      "content-type": "application/json"
    },
    body: JSON.stringify({ key })
  });

  const result = await readJson(response, "Anmeldung fehlgeschlagen.");

  if (!result?.session_token) {
    throw new Error("Das Backend hat keine gültige Sitzung zurückgegeben.");
  }

  writePortalSession(result.session_token);
  return result;
}

export function logoutPortalSession() {
  writePortalSession("");
}

async function adminHeaders(json = false) {
  const session = getPortalSession();

  return {
    ...commonHeaders(),
    ...(json ? { "content-type": "application/json" } : {}),
    ...(session?.token
      ? { authorization: `Bearer ${session.token}` }
      : {})
  };
}

function customerSessionStorageKey(token) {
  const normalized = String(token || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `garantieportal_customer_session:${normalized}`;
}

function readCustomerSession(token) {
  return sessionStorage.getItem(customerSessionStorageKey(token)) || "";
}

function writeCustomerSession(token, sessionToken) {
  const key = customerSessionStorageKey(token);

  if (sessionToken) {
    sessionStorage.setItem(key, sessionToken);
  } else {
    sessionStorage.removeItem(key);
  }
}

export function getCustomerSession(token) {
  const sessionToken = readCustomerSession(token);
  const payload = decodeSessionPayload(sessionToken);

  if (
    !sessionToken ||
    payload?.typ !== "customer-session" ||
    !payload?.exp ||
    payload.exp * 1000 <= Date.now()
  ) {
    writeCustomerSession(token, "");
    return null;
  }

  return { token: sessionToken, payload };
}

function customerHeaders(token, json = false) {
  const session = getCustomerSession(token);

  return {
    ...commonHeaders(),
    ...(json ? { "content-type": "application/json" } : {}),
    ...(session?.token ? { authorization: `Bearer ${session.token}` } : {})
  };
}

export async function verifyCustomerAccess(token, code) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(
    apiUrl(`customer/${encodeURIComponent(token)}/verify`),
    {
      method: "POST",
      headers: {
        ...commonHeaders(),
        "content-type": "application/json"
      },
      body: JSON.stringify({ code: String(code || "") })
    }
  );

  const result = await readJson(response, "Verifizierung fehlgeschlagen.");

  if (!result?.session_token) {
    throw new Error("Backend hat keine Kundensitzung zurückgegeben.");
  }

  writeCustomerSession(token, result.session_token);
  return result;
}

export function clearCustomerSession(token) {
  writeCustomerSession(token, "");
}

async function readJson(response, fallbackMessage) {
  let result = null;

  try {
    result = await response.json();
  } catch {
    // handled below
  }

  if (!response.ok) {
    throw new Error(result?.error || fallbackMessage);
  }

  return result;
}

export async function hasBackend(force = false) {
  if (!hasSupabaseConfig()) {
    backendAvailable = false;
    return false;
  }

  if (!force && backendAvailable !== undefined) return backendAvailable;

  try {
    const response = await fetch(apiUrl("health"), {
      headers: commonHeaders(),
      cache: "no-store"
    });

    backendAvailable = response.ok;
  } catch {
    backendAvailable = false;
  }

  return backendAvailable;
}

export async function listCases() {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(apiUrl("admin/cases"), {
    headers: await adminHeaders()
  });

  return readJson(response, "Vorgänge konnten nicht geladen werden.");
}

export async function createCase(data) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(apiUrl("admin/cases"), {
    method: "POST",
    headers: await adminHeaders(true),
    body: JSON.stringify(data)
  });

  const result = await readJson(response, "Vorgang konnte nicht erstellt werden.");

  if (!result?.customer_token || !result?.public_id) {
    throw new Error(
      "Backend-Antwort unvollständig. Kundencode oder Vorgangs-ID fehlt."
    );
  }

  return {
    ...result,
    customer_url: buildCustomerUrl(result.customer_token)
  };
}

export async function getAdminCase(id) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(apiUrl(`admin/cases/${encodeURIComponent(id)}`), {
    headers: await adminHeaders()
  });

  return readJson(response, "Vorgang nicht gefunden.");
}

export async function updateAdminCase(id, data) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(apiUrl(`admin/cases/${encodeURIComponent(id)}`), {
    method: "PUT",
    headers: await adminHeaders(true),
    body: JSON.stringify(data)
  });

  return readJson(response, "Speichern fehlgeschlagen.");
}

export async function updateAdminCaseStatus(id, serviceStatus) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(
    apiUrl(`admin/cases/${encodeURIComponent(id)}/status`),
    {
      method: "PUT",
      headers: await adminHeaders(true),
      body: JSON.stringify({ service_status: serviceStatus })
    }
  );

  return readJson(response, "Status konnte nicht gespeichert werden.");
}

export async function deleteAdminCase(id) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(apiUrl(`admin/cases/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: await adminHeaders()
  });

  return readJson(response, "Vorgang konnte nicht gelöscht werden.");
}

export async function getAdminCustomerLink(id) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(
    apiUrl(`admin/cases/${encodeURIComponent(id)}/customer-link`),
    {
      method: "POST",
      headers: await adminHeaders(true),
      body: "{}"
    }
  );

  const result = await readJson(
    response,
    "Kundenlink konnte nicht geladen werden."
  );

  if (!result?.customer_token) {
    throw new Error("Das Backend hat keinen Kundencode zurückgegeben.");
  }

  return {
    ...result,
    customer_url: buildCustomerUrl(result.customer_token)
  };
}


export async function getAdminCustomerAccess(id) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(
    apiUrl(`admin/cases/${encodeURIComponent(id)}/customer-access`),
    {
      method: "GET",
      headers: await adminHeaders()
    }
  );

  return readJson(response, "Kundenzugang konnte nicht geladen werden.");
}

export async function getAdminCustomerPreview(id) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(
    apiUrl(`admin/cases/${encodeURIComponent(id)}/customer-preview`),
    { headers: await adminHeaders() }
  );

  return readJson(response, "Kundenvorschau konnte nicht geladen werden.");
}

export async function getCustomerCase(token) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(
    apiUrl(`customer/${encodeURIComponent(token)}`),
    { headers: customerHeaders(token) }
  );

  return readJson(response, "Kundenlink ungültig.");
}

export async function saveCustomerDraft(token, data) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(
    apiUrl(`customer/${encodeURIComponent(token)}`),
    {
      method: "PUT",
      headers: customerHeaders(token, true),
      body: JSON.stringify(data)
    }
  );

  return readJson(response, "Speichern fehlgeschlagen.");
}

export async function confirmCustomer(token, data) {
  if (!(await hasBackend())) throw new Error("Backend nicht erreichbar. Kein Demo-Fallback im produktiven Betrieb.");

  const response = await fetch(
    apiUrl(`customer/${encodeURIComponent(token)}/confirm`),
    {
      method: "POST",
      headers: customerHeaders(token, true),
      body: JSON.stringify(data)
    }
  );

  return readJson(response, "Bestätigung fehlgeschlagen.");
}

function frozenPdfData(item) {
  return item?.pdf_snapshot || item;
}

export async function customerPdfUrl(token) {
  const item = await getCustomerCase(token);

  if (!item || item.status !== "confirmed") {
    throw new Error("PDF erst nach Bestätigung verfügbar.");
  }

  const bytes = await renderWarrantyFlowPdf(
    frozenPdfData(item),
    { logoBytes: await loadBrandLogoBytes() }
  );

  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export async function adminCasePdfUrl(id) {
  const item = await getAdminCase(id);

  if (!item) {
    throw new Error("Vorgang nicht gefunden.");
  }

  const confirmed = item.status === "confirmed";
  const source = confirmed ? frozenPdfData(item) : item;

  const bytes = await renderWarrantyFlowPdf(
    source,
    {
      logoBytes: await loadBrandLogoBytes(),
      mode: confirmed ? "confirmation" : "draft"
    }
  );

  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}
