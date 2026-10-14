import { CONFIG } from "./config.js";

function initialState() {
  return {
    cases: [
      {
        public_id: "GAR-2026-DEMO01",
        shopify_ref: "#4832",
        status: "draft",
    service_status: "waiting_customer",
        service_status: "waiting_customer",
        customer_name: "Max Mustermann",
        customer_email: "max@example.com",
        bike_model: "Modell Platzhalter",
        bike_color: "Schwarz",
        case_subject: "Garantiefall bereits telefonisch besprochen",
        item_type: "bike",
        required_charger: true,
        required_keys: false,
        key_count: 0,
        staff_note: "",
        customer_note: "",
        service_choice: "",
        confirmed_at: null,
        read_only: false,
        token: CONFIG.demoToken,
        created_at: new Date().toISOString()
      }
    ]
  };
}

export function getState() {
  const raw = localStorage.getItem(CONFIG.demoStorage);

  if (!raw) {
    const state = initialState();
    localStorage.setItem(CONFIG.demoStorage, JSON.stringify(state));
    return state;
  }

  return JSON.parse(raw);
}

export function setState(state) {
  localStorage.setItem(CONFIG.demoStorage, JSON.stringify(state));
}

export function listDemoCases() {
  return getState().cases;
}

export function createDemoCase(data) {
  const state = getState();
  const token = crypto.randomUUID().replaceAll("-", "");
  const suffix = crypto.randomUUID().split("-")[0].toUpperCase();

  const item = {
    public_id: `GAR-${new Date().getFullYear()}-${suffix}`,
    shopify_ref: data.shopify_ref,
    status: "draft",
    customer_name: data.customer_name || "",
    customer_email: data.customer_email || "",
    bike_model: data.bike_model || "",
    bike_color: data.bike_color || "",
    case_subject: data.case_subject || "",
    item_type: data.item_type || "bike",
    required_charger: Boolean(data.required_charger),
    required_keys: Boolean(data.required_keys),
    key_count: Number(data.key_count || 0),
    staff_note: data.staff_note || "",
    customer_note: data.customer_note || "",
    service_choice: data.service_choice || "none",
    confirmed_at: null,
    read_only: false,
    token,
    created_at: new Date().toISOString()
  };

  state.cases.unshift(item);
  setState(state);

  return {
    ok: true,
    public_id: item.public_id,
    customer_url: new URL(`customer.html?token=${token}`, location.href).href
  };
}

export function getDemoCaseByToken(token) {
  return getState().cases.find(item => item.token === token) || null;
}

export function getDemoCaseById(publicId) {
  return getState().cases.find(item => item.public_id === publicId) || null;
}

export function updateDemoCaseById(publicId, patch) {
  const state = getState();
  const index = state.cases.findIndex(item => item.public_id === publicId);

  if (index < 0) return null;
  if (state.cases[index].status === "confirmed") return state.cases[index];

  state.cases[index] = {
    ...state.cases[index],
    ...patch
  };

  setState(state);
  return state.cases[index];
}

export function updateDemoCaseByToken(token, patch) {
  const state = getState();
  const index = state.cases.findIndex(item => item.token === token);

  if (index < 0) return null;
  if (state.cases[index].status === "confirmed") return state.cases[index];

  state.cases[index] = {
    ...state.cases[index],
    ...patch
  };

  setState(state);
  return state.cases[index];
}

export function confirmDemoCase(token, patch) {
  const state = getState();
  const index = state.cases.findIndex(item => item.token === token);

  if (index < 0) return null;

  state.cases[index] = {
    ...state.cases[index],
    ...patch,
    status: "confirmed",
    service_status: "customer_confirmed",
    confirmed_at: new Date().toISOString(),
    read_only: true
  };

  setState(state);
  return state.cases[index];
}


export function updateDemoCaseStatus(publicId, serviceStatus) {
  const state = getState();
  const index = state.cases.findIndex(item => item.public_id === publicId);

  if (index < 0) return null;

  state.cases[index] = {
    ...state.cases[index],
    service_status: serviceStatus,
    updated_at: new Date().toISOString()
  };

  setState(state);
  return state.cases[index];
}
