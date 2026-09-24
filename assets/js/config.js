export const CONFIG = {
  // Supabase project settings. Replace these two values after creating the project.
  supabaseUrl: "https://dsjhaivwhjtcynwkthiu.supabase.co",
  supabasePublishableKey: "sb_publishable_mHE1oltS8ARXKbwSHNGT7g_jA_0gf3N",
  edgeFunctionName: "portal-api",

  // Local browser state.
  authSessionStorage: "garantieportal_company_session"
};

export function hasSupabaseConfig() {
  return Boolean(
    CONFIG.supabaseUrl &&
    CONFIG.supabasePublishableKey &&
    !CONFIG.supabaseUrl.includes("YOUR_PROJECT_REF") &&
    !CONFIG.supabasePublishableKey.includes("YOUR_PUBLISHABLE_KEY")
  );
}
