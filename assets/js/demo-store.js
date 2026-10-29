import { CONFIG } from "./config.js";

const CASE_TYPES = new Set(["warranty", "repair", "return", "exchange"]);
const SERVICE_CHOICES = new Set(["none", "inspection", "inspection_wear"]);

function normalizeCaseType(value) {
  return CASE_TYPES.has(value) ? value : "warranty";
}

function serviceChoiceForCaseType(caseType, value) {
  const type = normalizeCaseType(caseType);
  if (type === "return" || type === "exchange") return "none";
  return SERVICE_CHOICES.has(value) ? value : "none";
}

function publicIdPrefix(caseType) {
  return {
    warranty: "GAR",
    repair: "REP",
    return: "RET",
    exchange: "TAU"
  }[normalizeCaseType(caseType)];
}

function referenceSlug(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/^#+/, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18) || "DEMO";
}

function uniquePublicId(state, caseType, shopifyRef) {
  const base = `${publicIdPrefix(caseType)}-${referenceSlug(shopifyRef)}`;
  let candidate = base;
  let suffix = 2;
  while (state.cases.some(item => item.public_id === candidate)) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

function initialState() {
  return {
    cases: [
      {
        public_id: "GAR-4832",
        shopify_ref: "#4832",
        status: "draft",
        service_status: "waiting_customer",
        internal_stage: "awaiting_customer",
        customer_name: "Max Mustermann",
        customer_email: "max@example.com",
        bike_model: "Modell Platzhalter",
        bike_color: "Schwarz",
        case_subject: "Garantiefall bereits telefonisch besprochen",
        case_type: "warranty",
        item_type: "bike",
        required_charger: true,
        required_keys: false,
        key_count: 0,
        staff_note: "",
        customer_note: "",
        service_choice: "",
        service_price_mode: "hidden",
        service_price_amount_cents: null,
        service_price_note: "",
        work_performed: "",
        work_result: "",
        battery_test_enabled: false,
        battery_test_nominal_wh: null,
        battery_test_measured_wh: null,
        battery_test_soh_percent: null,
        battery_test_voltage_v: null,
        battery_test_cycles: null,
        battery_test_status: "",
        battery_test_note: "",
        service_report_updated_at: null,
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
  const caseType = normalizeCaseType(data.case_type);

  const item = {
    public_id: uniquePublicId(state, caseType, data.shopify_ref),
    shopify_ref: String(data.shopify_ref || "").trim(),
    status: "draft",
    service_status: "waiting_customer",
    internal_stage: "awaiting_customer",
    customer_name: data.customer_name || "",
    customer_email: data.customer_email || "",
    bike_model: data.bike_model || "",
    bike_color: data.bike_color || "",
    case_subject: data.case_subject || "",
    case_type: caseType,
    item_type: data.item_type || "bike",
    required_charger: Boolean(data.required_charger),
    required_keys: Boolean(data.required_keys),
    key_count: Number(data.key_count || 0),
    staff_note: data.staff_note || "",
    customer_note: data.customer_note || "",
    service_choice: serviceChoiceForCaseType(caseType, data.service_choice),
    service_price_mode: data.service_price_mode === "known" ? "known" : "hidden",
    service_price_amount_cents: Number.isFinite(Number(data.service_price_amount_cents)) ? Math.round(Number(data.service_price_amount_cents)) : null,
    service_price_note: String(data.service_price_note || ""),
    work_performed: "",
    work_result: "",
    battery_test_enabled: false,
    battery_test_nominal_wh: null,
    battery_test_measured_wh: null,
    battery_test_soh_percent: null,
    battery_test_voltage_v: null,
    battery_test_cycles: null,
    battery_test_status: "",
    battery_test_note: "",
    service_report_updated_at: null,
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

  const current = state.cases[index];
  const caseType = normalizeCaseType(current.case_type);

  state.cases[index] = {
    ...current,
    ...patch,
    case_type: caseType,
    service_choice: serviceChoiceForCaseType(
      caseType,
      patch.service_choice === undefined ? current.service_choice : patch.service_choice
    ),
    service_price_mode: patch.service_price_mode === undefined
      ? (current.service_price_mode || "hidden")
      : (patch.service_price_mode === "known" ? "known" : "hidden"),
    service_price_amount_cents: patch.service_price_amount_cents === undefined
      ? (current.service_price_amount_cents ?? null)
      : (Number.isFinite(Number(patch.service_price_amount_cents)) ? Math.round(Number(patch.service_price_amount_cents)) : null),
    service_price_note: patch.service_price_note === undefined
      ? (current.service_price_note || "")
      : String(patch.service_price_note || "")
  };

  setState(state);
  return state.cases[index];
}

export function updateDemoCaseByToken(token, patch) {
  const state = getState();
  const index = state.cases.findIndex(item => item.token === token);

  if (index < 0) return null;
  if (state.cases[index].status === "confirmed") return state.cases[index];

  const current = state.cases[index];
  const caseType = normalizeCaseType(current.case_type);

  state.cases[index] = {
    ...current,
    ...patch,
    case_type: caseType,
    service_choice: serviceChoiceForCaseType(
      caseType,
      patch.service_choice === undefined ? current.service_choice : patch.service_choice
    ),
    service_price_mode: patch.service_price_mode === undefined
      ? (current.service_price_mode || "hidden")
      : (patch.service_price_mode === "known" ? "known" : "hidden"),
    service_price_amount_cents: patch.service_price_amount_cents === undefined
      ? (current.service_price_amount_cents ?? null)
      : (Number.isFinite(Number(patch.service_price_amount_cents)) ? Math.round(Number(patch.service_price_amount_cents)) : null),
    service_price_note: patch.service_price_note === undefined
      ? (current.service_price_note || "")
      : String(patch.service_price_note || "")
  };

  setState(state);
  return state.cases[index];
}

export function confirmDemoCase(token, patch) {
  const state = getState();
  const index = state.cases.findIndex(item => item.token === token);

  if (index < 0) return null;

  const current = state.cases[index];
  const caseType = normalizeCaseType(current.case_type);

  state.cases[index] = {
    ...current,
    ...patch,
    case_type: caseType,
    service_choice: serviceChoiceForCaseType(
      caseType,
      patch.service_choice === undefined ? current.service_choice : patch.service_choice
    ),
    status: "confirmed",
    service_status: "customer_confirmed",
    internal_stage: "customer_confirmed",
    confirmed_at: new Date().toISOString(),
    read_only: true
  };

  setState(state);
  return state.cases[index];
}


export function updateDemoCaseReport(publicId, patch) {
  const state = getState();
  const index = state.cases.findIndex(item => item.public_id === publicId);
  if (index < 0) return null;
  if (state.cases[index].status !== "confirmed") return state.cases[index];

  const enabled = patch.battery_test_enabled === true;
  const optionalNumber = value => value === "" || value === null || value === undefined || !Number.isFinite(Number(value))
    ? null
    : Number(value);

  state.cases[index] = {
    ...state.cases[index],
    work_performed: String(patch.work_performed || ""),
    work_result: String(patch.work_result || ""),
    battery_test_enabled: enabled,
    battery_test_nominal_wh: enabled ? optionalNumber(patch.battery_test_nominal_wh) : null,
    battery_test_measured_wh: enabled ? optionalNumber(patch.battery_test_measured_wh) : null,
    battery_test_soh_percent: enabled ? optionalNumber(patch.battery_test_soh_percent) : null,
    battery_test_voltage_v: enabled ? optionalNumber(patch.battery_test_voltage_v) : null,
    battery_test_cycles: enabled ? optionalNumber(patch.battery_test_cycles) : null,
    battery_test_status: enabled ? String(patch.battery_test_status || "") : "",
    battery_test_note: enabled ? String(patch.battery_test_note || "") : "",
    service_report_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  setState(state);
  return state.cases[index];
}

export function updateDemoCaseStatus(publicId, serviceStatus, internalStage = "") {
  const state = getState();
  const index = state.cases.findIndex(item => item.public_id === publicId);

  if (index < 0) return null;

  state.cases[index] = {
    ...state.cases[index],
    service_status: serviceStatus,
    internal_stage: internalStage || (serviceStatus === "completed"
      ? "completed"
      : serviceStatus === "arrived"
        ? "received"
        : serviceStatus === "customer_confirmed"
          ? "customer_confirmed"
          : "work_in_progress"),
    updated_at: new Date().toISOString()
  };

  setState(state);
  return state.cases[index];
}
