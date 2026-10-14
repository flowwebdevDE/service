const runtimeConfig = window.MYVELO_PORTAL_CONFIG || {};

export const CONFIG = {
  // Public Cloudflare Worker URL. No secret belongs in this file.
  apiBaseUrl: String(runtimeConfig.apiBaseUrl || "").replace(/\/$/, ""),

  // Local browser state.
  authSessionStorage: "garantieportal_company_session",
  demoStorage: "garantieportal_demo_v2",
  demoToken: "demo-customer-token"
};

export function hasBackendConfig() {
  return Boolean(
    CONFIG.apiBaseUrl &&
    /^https:\/\//i.test(CONFIG.apiBaseUrl)
  );
}
