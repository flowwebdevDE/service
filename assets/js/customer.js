import { setButtonLoading } from "./motion.js?v=7.9";
import { showError, showInfo, showSuccess } from "./banner.js?v=7.10.6";
import {
  confirmCustomer,
  customerPdfUrl,
  getAdminCustomerPreview,
  getCustomerCase,
  getCustomerSession,
  getPortalSession,
  verifyCustomerAccess
} from "./api.js?v=7.14.1";
import {
  confirmationActionLabel,
  confirmationRequirements
} from "./case-confirmations.js?v=7.14.1";


const bootLoader = document.querySelector("#app-boot-loader");
const bootLoaderTitle = document.querySelector("#app-boot-loader-title");
const bootLoaderText = document.querySelector("#app-boot-loader-text");

function finishBoot() {
  document.documentElement.classList.remove("ui-loading");

  if (!bootLoader) return;

  bootLoader.classList.add("is-leaving");
  window.setTimeout(() => bootLoader.remove(), 180);
}

function failBoot(message) {
  document.documentElement.classList.add("ui-loading");

  if (!bootLoader) return;

  bootLoader.classList.add("is-error");
  if (bootLoaderTitle) bootLoaderTitle.textContent = "Vorgang konnte nicht geladen werden";
  if (bootLoaderText) bootLoaderText.textContent = message || "Bitte Seite neu laden.";
}

function revealVerification() {
  setCustomerUnlocked(false);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      finishBoot();
      focusOtpAt();
    });
  });
}

const params = new URLSearchParams(location.search);
const token = params.get("token");
const previewId = params.get("preview");
const previewMode = Boolean(previewId);
const form = document.querySelector("#customer-form");
const verificationPanel = document.querySelector("#customer-verification");
const verificationForm = document.querySelector("#verification-form");
const verificationCode = document.querySelector("#verification-code");
const verificationSubmit = document.querySelector("#verification-submit");
const otpField = document.querySelector("#customer-otp-field");
const otpShell = document.querySelector("#customer-otp-shell");
const otpPasteButton = document.querySelector("#customer-otp-paste");
const otpSlots = Array.from(document.querySelectorAll("[data-otp-index]"));
const customerFrozenView = document.querySelector("#customer-frozen-view");
const customerLiveContent = document.querySelector("#customer-live-content");
const customerRegularHead = document.querySelector(".customer-mobile-head");

const stickyAction = document.querySelector("#sticky-action");
const stickyTitle = document.querySelector("#sticky-action-title");
const stickySubtitle = document.querySelector("#sticky-action-subtitle");
const stickyButton = document.querySelector("#sticky-action-button");

const serviceState = document.querySelector("#service-state");
const confirmState = document.querySelector("#confirm-state");
const confirmRows = document.querySelector("#confirm-rows");


let current;


function setCustomerUnlocked(unlocked) {
  document.documentElement.classList.toggle("customer-pin-locked", !unlocked);
  document.body.classList.toggle("customer-locked", !unlocked);
  verificationPanel?.classList.toggle("hidden", unlocked);

  for (const element of document.querySelectorAll(
    "body > :not(#customer-verification):not(.flow-banner-stack):not(#customer-legal-global)"
  )) {
    if (unlocked) {
      element.removeAttribute("inert");
      element.removeAttribute("aria-hidden");
    } else {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }
  }
}


let otpSubmitting = false;
let otpAutoSubmitTimer = 0;
let lastOtpValue = "";

function normalizedOtpValue() {
  return String(verificationCode?.value || "")
    .replace(/\D/g, "")
    .slice(0, 6);
}

function otpCaretIndex() {
  if (!verificationCode) return 0;

  const value = normalizedOtpValue();
  const start = Number.isInteger(verificationCode.selectionStart)
    ? verificationCode.selectionStart
    : value.length;

  return Math.max(0, Math.min(5, start === 6 ? 5 : start));
}

function renderOtp({ animateNew = true } = {}) {
  if (!verificationCode || !otpSlots.length) return;

  const value = normalizedOtpValue();

  if (verificationCode.value !== value) {
    verificationCode.value = value;
  }

  const focused = document.activeElement === verificationCode;
  const caretIndex = otpCaretIndex();

  otpSlots.forEach((slot, index) => {
    const digit = slot.querySelector(".customer-otp-digit");
    const nextValue = value[index] || "";
    const previousValue = digit?.textContent || "";
    const filled = Boolean(nextValue);
    const active = focused && (
      value.length < 6
        ? index === Math.min(value.length, 5)
        : index === caretIndex
    );

    slot.classList.toggle("is-filled", filled);
    slot.classList.toggle("is-active", active);
    slot.classList.toggle("is-empty", !filled);

    if (digit && previousValue !== nextValue) {
      digit.textContent = nextValue;

      if (animateNew && nextValue) {
        digit.classList.remove("is-entering");
        void digit.offsetWidth;
        digit.classList.add("is-entering");
      }
    }
  });

  otpShell?.classList.toggle("is-complete", value.length === 6);
  verificationSubmit?.classList.toggle("is-ready", value.length === 6);
  lastOtpValue = value;
}

function focusOtpAt(index = null) {
  if (!verificationCode) return;

  verificationCode.focus({ preventScroll: true });

  const value = normalizedOtpValue();
  const position = index === null
    ? value.length
    : Math.max(0, Math.min(value.length, index));

  try {
    verificationCode.setSelectionRange(position, position);
  } catch {}

  renderOtp({ animateNew: false });
}

function resetOtpVisualState() {
  otpShell?.classList.remove(
    "is-error",
    "is-success",
    "is-checking"
  );

  otpSlots.forEach(slot => {
    slot.classList.remove("is-success");
  });
}

function animateOtpError({ clear = false } = {}) {
  if (!otpShell) return;

  otpShell.classList.remove("is-error", "is-checking", "is-success");
  void otpShell.offsetWidth;
  otpShell.classList.add("is-error");

  window.setTimeout(() => {
    otpShell.classList.remove("is-error");

    if (clear && verificationCode) {
      verificationCode.value = "";
      renderOtp({ animateNew: false });
    }

    focusOtpAt();
  }, 430);
}

async function animateOtpSuccess() {
  if (!otpShell) return;

  otpShell.classList.remove("is-error", "is-checking");
  otpShell.classList.add("is-success");

  otpSlots.forEach((slot, index) => {
    window.setTimeout(() => {
      slot.classList.add("is-success");
    }, index * 48);
  });

  await new Promise(resolve => {
    window.setTimeout(resolve, 380);
  });
}

function setOtpChecking(checking) {
  otpShell?.classList.toggle("is-checking", checking);
  verificationCode?.toggleAttribute("readonly", checking);
  otpSubmitting = checking;
}

async function submitOtp() {
  if (otpSubmitting) return;

  const code = normalizedOtpValue();

  if (!/^\d{6}$/.test(code)) {
    animateOtpError();
    showError("Bitte den sechsstelligen Code vollständig eingeben.", {
      title: "Code prüfen",
      id: "customer-verification-error"
    });
    return;
  }

  window.clearTimeout(otpAutoSubmitTimer);
  resetOtpVisualState();
  setOtpChecking(true);
  setButtonLoading(verificationSubmit, true, "Prüfe …");

  try {
    await verifyCustomerAccess(token, code);
    await animateOtpSuccess();
    await loadVerifiedCustomer();
  } catch (error) {
    setOtpChecking(false);
    setButtonLoading(verificationSubmit, false);
    animateOtpError({ clear: true });
    showError(error.message, {
      title: "Code prüfen",
      id: "customer-verification-error"
    });
  }
}

function scheduleOtpAutoSubmit() {
  window.clearTimeout(otpAutoSubmitTimer);

  if (normalizedOtpValue().length !== 6 || otpSubmitting) {
    return;
  }

  otpAutoSubmitTimer = window.setTimeout(() => {
    submitOtp();
  }, 260);
}

verificationCode?.addEventListener("input", event => {
  const inputType = event.inputType || "";
  const valueBefore = lastOtpValue;

  verificationCode.value = normalizedOtpValue();
  renderOtp({
    animateNew:
      inputType !== "deleteContentBackward" &&
      inputType !== "deleteContentForward" &&
      verificationCode.value !== valueBefore
  });

  scheduleOtpAutoSubmit();
});

verificationCode?.addEventListener("focus", () => {
  resetOtpVisualState();
  renderOtp({ animateNew: false });
});

verificationCode?.addEventListener("blur", () => {
  renderOtp({ animateNew: false });
});

verificationCode?.addEventListener("click", () => {
  renderOtp({ animateNew: false });
});

verificationCode?.addEventListener("keyup", event => {
  if (
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight" ||
    event.key === "Home" ||
    event.key === "End"
  ) {
    renderOtp({ animateNew: false });
  }
});

verificationCode?.addEventListener("paste", () => {
  // Let the browser perform the paste first. One input means full-code paste
  // and iOS/Android one-time-code autofill remain reliable.
  requestAnimationFrame(() => {
    verificationCode.value = normalizedOtpValue();
    renderOtp();
    scheduleOtpAutoSubmit();
  });
});

verificationCode?.addEventListener("click", event => {
  if (!otpShell) return;

  const rect = otpShell.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const index = Math.max(0, Math.min(5, Math.floor((x / rect.width) * 6)));
  focusOtpAt(index);
});

otpPasteButton?.addEventListener("click", async () => {
  resetOtpVisualState();

  try {
    if (!navigator.clipboard?.readText) {
      throw new Error("clipboard-api-unavailable");
    }

    const clipboardText = await navigator.clipboard.readText();
    const code = String(clipboardText || "").replace(/\D/g, "").slice(0, 6);

    if (!code) {
      showError("In der Zwischenablage wurde kein Zahlencode gefunden.", {
        title: "Nichts zum Einfügen"
      });
      focusOtpAt();
      return;
    }

    verificationCode.value = code;
    renderOtp();
    focusOtpAt(code.length);
    scheduleOtpAutoSubmit();
  } catch {
    // Fall back to the native mobile paste menu. The real input is deliberately
    // kept fully present over the six visual slots so iOS/Android can long-press it.
    focusOtpAt();
    showInfo("Halte die Code-Felder kurz gedrückt und wähle „Einfügen“.", {
      title: "Code einfügen"
    });
  }
});

function showVerification(messageText = "") {
  setCustomerUnlocked(false);

  if (messageText) {
    showError(messageText, {
      title: "Code prüfen",
      id: "customer-verification-error"
    });
  }

  revealVerification();
}

async function loadVerifiedCustomer() {
  try {
    const item = await getCustomerCase(token);
    setCustomerUnlocked(true);
    fill(item);
    setOtpChecking(false);
    setButtonLoading(verificationSubmit, false);

    requestAnimationFrame(() => {
      requestAnimationFrame(finishBoot);
    });
  } catch (error) {
    if (/Verifizierung erforderlich/i.test(error.message)) {
      showVerification("Bitte gib den Code aus deiner E-Mail ein.");
      return;
    }

    showStickyAction(false);
    failBoot(error.message);
  }
}

verificationForm?.addEventListener("submit", event => {
  event.preventDefault();
  submitOtp();
});

function enableEmployeePreview() {
  document.body.classList.add("customer-preview-mode");

  const banner = document.createElement("div");
  banner.className = "customer-preview-banner";
  banner.innerHTML = `
    <strong>Mitarbeiter-Vorschau</strong>
    <span>So sieht der aktuelle Vorgangsstand für den Kunden aus. Änderungen in dieser Ansicht werden nicht gespeichert.</span>
  `;

  document.body.prepend(banner);
}

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}

const CUSTOMER_CASE_TYPES = Object.freeze({
  warranty: {
    label: "Garantiefall",
    subjectLabel: "Beanstandung",
    subjectPlaceholder: "Beanstandung prüfen oder ergänzen",
    intro: "Wir haben deinen Garantievorgang vorbereitet. Bitte prüfe die Angaben und triff die noch offenen Entscheidungen.",
    deliveryHeading: "Lieferumfang",
    deliveryCopy: "Bitte vollständig mitsenden oder übergeben. Der Lieferumfang wird gemeinsam mit dem Garantievorgang bestätigt.",
    service: true,
    serviceHeading: "Zusätzliche Arbeiten",
    serviceCopy: "Wähle aus, was wir zusätzlich zum Garantiefall ausführen dürfen.",
    noneTitle: "Nur Garantiefall",
    noneCopy: "Keine kostenpflichtigen Zusatzarbeiten",
    inspectionCopy: "Zusätzlich zum Garantiefall",
  },
  repair: {
    label: "Reparatur",
    subjectLabel: "Reparatur / Fehlerbild",
    subjectPlaceholder: "Fehlerbild oder Reparaturwunsch prüfen oder ergänzen",
    intro: "Wir haben deinen Reparaturvorgang vorbereitet. Bitte prüfe Fehlerbild, Lieferumfang und die noch offenen Entscheidungen.",
    deliveryHeading: "Lieferumfang",
    deliveryCopy: "Bitte vollständig mitsenden oder übergeben. Der Lieferumfang wird gemeinsam mit dem Reparaturauftrag bestätigt.",
    service: true,
    serviceHeading: "Zusätzliche Arbeiten",
    serviceCopy: "Prüfe, welche zusätzlichen Arbeiten zusammen mit der Reparatur ausgeführt werden dürfen.",
    noneTitle: "Nur Reparatur",
    noneCopy: "Keine zusätzliche Inspektion beauftragt",
    inspectionCopy: "Zusätzlich zur Reparatur",
  },
  return: {
    label: "Rückgabe",
    subjectLabel: "Grund der Rückgabe",
    subjectPlaceholder: "Grund der Rückgabe prüfen oder ergänzen",
    intro: "Wir haben deine Rückgabe vorbereitet. Bitte prüfe Artikel, Rückgabegrund und den vereinbarten Lieferumfang.",
    deliveryHeading: "Zur Rückgabe mitgeben",
    deliveryCopy: "Dieser Lieferumfang gehört zur Rückgabe und wird gemeinsam mit ihr bestätigt.",
    service: false,
  },
  exchange: {
    label: "Tausch",
    subjectLabel: "Grund für den Tausch",
    subjectPlaceholder: "Grund für den Tausch prüfen oder ergänzen",
    intro: "Wir haben deinen Tauschvorgang vorbereitet. Bitte prüfe Artikel, Tauschgrund und den vereinbarten Lieferumfang.",
    deliveryHeading: "Zum Tausch mitgeben",
    deliveryCopy: "Dieser Lieferumfang gehört zum Tausch und wird gemeinsam mit ihm bestätigt.",
    service: false,
  }
});

function customerCaseType(item = current) {
  return CUSTOMER_CASE_TYPES[item?.case_type] || CUSTOMER_CASE_TYPES.warranty;
}

function caseTypeValue(item = current) {
  return CUSTOMER_CASE_TYPES[item?.case_type] ? item.case_type : "warranty";
}

function requiresServiceChoice(item = current) {
  return customerCaseType(item).service !== false;
}

function applyCustomerCaseType(item) {
  const meta = customerCaseType(item);
  const type = caseTypeValue(item);
  document.body.dataset.caseType = type;
  document.title = `${meta.label} · MYVELO Service`;

  setText("customer-case-type-kicker", meta.label);
  setText("customer-intro-copy", meta.intro);
  setText("customer-subject-label", meta.subjectLabel);
  setText("customer-delivery-heading", meta.deliveryHeading || "Das muss mit");
  setText("customer-delivery-copy", meta.deliveryCopy || "Bitte vollständig mitsenden oder übergeben.");
  setText("customer-service-heading", meta.serviceHeading || "Bearbeitungsumfang");
  setText("customer-service-copy", meta.serviceCopy || "Dieser Vorgang enthält keine zusätzlichen auswählbaren Arbeiten.");
  setText("service-none-title", meta.noneTitle || meta.label);
  setText("service-none-copy", meta.noneCopy || "Keine zusätzliche Leistung vorgesehen");
  setText("service-inspection-copy", meta.inspectionCopy || "Zusätzlich zum Vorgang");

  const subject = byId("customer-case-subject");
  if (subject) subject.placeholder = meta.subjectPlaceholder;

  const serviceSection = byId("section-service");
  serviceSection?.classList.toggle("hidden", !meta.service);
  serviceSection?.toggleAttribute("inert", !meta.service);
  serviceSection?.setAttribute("aria-hidden", meta.service ? "false" : "true");

  const summaryService = byId("summary-service")?.closest("div");
  summaryService?.classList.toggle("hidden", !meta.service);

  setText("section-note-number", meta.service ? "4" : "3");
  setText("section-confirm-number", meta.service ? "5" : "4");

  if (!meta.service && form) {
    const none = form.querySelector('input[name="service_choice"][value="none"]');
    if (none) none.checked = true;
  }
}

function selectedService() {
  return form.querySelector('input[name="service_choice"]:checked')?.value || "";
}

function serviceText(value, item = current) {
  const meta = customerCaseType(item);
  if (!meta.service) return meta.label;

  if (value === "inspection") {
    return "Inspektion · 96 €";
  }

  if (value === "inspection_wear") {
    return "Inspektion + Verschleißteile · 96 € + Material";
  }

  if (value === "none") {
    return meta.noneTitle || "Keine Zusatzleistung";
  }

  return "Noch keine Auswahl";
}

function accessoryList(item) {
  const list = [
    item.item_type === "battery" ? "Akku" : "Komplettes Fahrrad"
  ];

  if (item.required_charger) {
    list.push("Ladegerät");
  }

  if (item.required_keys) {
    list.push("Schlüssel");
  }

  return list;
}

function collect() {
  return {
    customer_name: form.elements.customer_name.value.trim(),
    bike_model: form.elements.bike_model.value.trim(),
    bike_color: form.elements.bike_color.value.trim(),
    case_subject: form.elements.case_subject.value.trim(),
    customer_note: form.elements.customer_note.value.trim(),
    service_choice: selectedService()
  };
}

let confirmationContext = "";

function confirmationInput(key) {
  return confirmRows?.querySelector(`[data-confirmation-key="${key}"]`) || null;
}

function currentConfirmationRequirements() {
  return confirmationRequirements({
    case_type: caseTypeValue(current),
    service_choice: selectedService() || "none"
  });
}

function renderConfirmationRows({ preserve = true } = {}) {
  if (!confirmRows || !current) return;

  const rules = currentConfirmationRequirements();
  const nextContext = `${caseTypeValue(current)}:${selectedService() || "none"}`;
  const oldState = {};

  if (preserve) {
    confirmRows.querySelectorAll("[data-confirmation-key]").forEach(input => {
      oldState[input.dataset.confirmationKey] = input.checked;
    });
  }

  const paidContextChanged = confirmationContext && confirmationContext !== nextContext;
  confirmRows.replaceChildren();

  for (const rule of rules) {
    const label = document.createElement("label");
    label.className = "customer-confirm-row";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.confirmationKey = rule.key;
    input.name = `confirm_${rule.key}`;
    input.checked = Boolean(oldState[rule.key]) && !(paidContextChanged && rule.key === "paid_service");

    const box = document.createElement("span");
    box.className = "customer-confirm-box";
    box.textContent = "✓";

    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = rule.title;
    const copy = document.createElement("small");
    copy.textContent = rule.copy;
    text.append(title, copy);

    label.append(input, box, text);
    confirmRows.append(label);
  }

  confirmationContext = nextContext;
}

function confirmationProgress() {
  const rules = currentConfirmationRequirements();
  const checked = rules.filter(rule => confirmationInput(rule.key)?.checked).length;
  const remaining = rules.length - checked;
  return { rules, checked, remaining, done: remaining === 0 };
}

function confirmationPayload() {
  const state = confirmationProgress();
  const result = {};
  for (const rule of state.rules) {
    result[`confirm_${rule.key}`] = Boolean(confirmationInput(rule.key)?.checked);
  }

  // Legacy fields keep older Worker revisions compatible during a rolling update.
  result.confirm_scope = Boolean(result.confirm_primary);
  result.confirm_accessories = state.done;
  return result;
}

function renderSummary() {
  if (!current) return;

  const data = collect();

  setText("summary-ref", current.shopify_ref);
  setText("summary-item", current.item_type === "battery" ? "Akku" : "Komplettes Fahrrad");
  setText("summary-accessories", accessoryList(current).join(", "));
  setText("summary-service", serviceText(data.service_choice, current));
}

function setSectionAttention(sectionId, active) {
  document.querySelector(sectionId)?.classList.toggle("has-attention", active);
}

function showStickyAction(show) {
  if (!stickyAction) return;

  stickyAction.hidden = !show;
  stickyAction.classList.toggle("hidden", !show);
}

function setDynamicStatus() {
  // Customer header status indicator was intentionally removed in V7.11.1.2.
}

function updateFlowState() {
  if (!current || current.read_only || current.status === "confirmed") {
    return;
  }

  showStickyAction(true);

  const serviceRequired = requiresServiceChoice(current);
  const serviceChosen = !serviceRequired || Boolean(selectedService());
  const confirmation = confirmationProgress();
  const confirmationsDone = confirmation.done;

  if (serviceState) {
    serviceState.textContent = serviceRequired
      ? (serviceChosen ? "Ausgewählt" : "Auswahl erforderlich")
      : "Nicht erforderlich";
    serviceState.classList.toggle("is-done", serviceChosen);
  }

  if (confirmState) {
    confirmState.textContent = confirmationsDone
      ? "Bestätigt"
      : `${confirmation.remaining} Bestätigung${confirmation.remaining === 1 ? "" : "en"} offen`;
    confirmState.classList.toggle("is-done", confirmationsDone);
  }

  setSectionAttention("#section-service", serviceRequired && !serviceChosen);
  setSectionAttention("#section-confirm", serviceChosen && !confirmationsDone);

  if (serviceRequired && !serviceChosen) {
    setDynamicStatus({
      kicker: "Nächster Schritt",
      title: "Zusatzarbeit auswählen",
      detail: "Vorgang und Lieferumfang sind vorbereitet.",
      progress: 38,
      state: "Auswahl offen"
    });

    stickyTitle.textContent = "Auswahl offen";
    stickySubtitle.textContent = "Zusätzliche Arbeiten auswählen";
    stickyButton.textContent = "Auswählen";
    stickyButton.dataset.action = "service";
    setButtonLoading(stickyButton, false);
    return;
  }

  if (!confirmationsDone) {
    setDynamicStatus({
      kicker: "Bestätigung",
      title: confirmation.remaining === 1
        ? confirmation.rules.find(rule => !confirmationInput(rule.key)?.checked)?.title || "Noch eine Bestätigung"
        : "Angaben bestätigen",
      detail: confirmation.remaining === 1
        ? "Ein letzter inhaltlich eigenständiger Punkt ist noch offen."
        : confirmationActionLabel({ case_type: caseTypeValue(current), service_choice: selectedService() || "none" }),
      progress: confirmation.checked > 0 ? 82 : 68,
      state: confirmation.checked > 0 ? "Fast geschafft" : "Prüfung offen"
    });

    stickyTitle.textContent =
      `${confirmation.remaining} Bestätigung${confirmation.remaining === 1 ? "" : "en"} offen`;
    const nextRule = confirmation.rules.find(rule => !confirmationInput(rule.key)?.checked);
    stickySubtitle.textContent = confirmation.remaining === 1
      ? (nextRule?.title || "Vorgang bestätigen")
      : confirmationActionLabel({ case_type: caseTypeValue(current), service_choice: selectedService() || "none" });
    stickyButton.textContent = "Bestätigen";
    stickyButton.dataset.action = "confirm";
    stickyButton.disabled = false;
    return;
  }

  setDynamicStatus({
    kicker: "Bereit",
    title: "Alles geprüft",
    detail: "Der Vorgang kann jetzt verbindlich abgesendet werden.",
    progress: 100,
    state: "Bereit",
    complete: true
  });

  stickyTitle.textContent = "Bereit zum Absenden";
  stickySubtitle.textContent = serviceRequired ? serviceText(selectedService(), current) : customerCaseType(current).label;
  stickyButton.textContent = "Absenden";
  stickyButton.dataset.action = "submit";
  stickyButton.disabled = false;
}

function scrollToSection(id) {
  document.querySelector(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


function frozenServiceDisplay(value, item) {
  const meta = customerCaseType(item);
  if (!meta.service) return [meta.label, "Keine zusätzliche Leistung ausgewählt"];

  return {
    none: [meta.noneTitle || "Keine Zusatzleistung", meta.noneCopy || "Keine zusätzliche kostenpflichtige Arbeit"],
    inspection: ["Inspektion · 96 €", "Zusätzlich von dir beauftragt"],
    inspection_wear: [
      "Inspektion + Verschleißteile",
      "96 € + tatsächlich benötigtes Material"
    ]
  }[value] || ["Keine zusätzliche Arbeit", "–"];
}

function frozenDeliveryDisplay(item) {
  const parts = [];

  if (item.required_charger) parts.push("Ladegerät");
  if (item.required_keys) parts.push("Schlüssel");

  return parts.length ? parts.join(" · ") : "Keine zusätzlichen Teile";
}

function frozenSnapshot(item) {
  return item.pdf_snapshot && typeof item.pdf_snapshot === "object"
    ? { ...item, ...item.pdf_snapshot }
    : item;
}

function renderCustomerFrozen(item) {
  const snapshot = frozenSnapshot(item);
  applyCustomerCaseType(snapshot);
  const meta = customerCaseType(snapshot);
  const type = caseTypeValue(snapshot);
  const [service, serviceNote] = frozenServiceDisplay(snapshot.service_choice, snapshot);

  const confirmedTitle = {
    warranty: "Dein Garantiefall ist bestätigt.",
    repair: "Deine Reparatur ist bestätigt.",
    return: "Deine Rückgabe ist bestätigt.",
    exchange: "Dein Tausch ist bestätigt."
  }[type] || "Dein Vorgang ist bestätigt.";

  setText("frozen-customer-kicker", `${meta.label.toUpperCase()} · BESTÄTIGT`);
  setText("customer-frozen-title", confirmedTitle);

  document.body.classList.add("customer-frozen-mode");

  customerLiveContent?.classList.add("hidden");
  customerLiveContent?.setAttribute("inert", "");
  customerLiveContent?.setAttribute("aria-hidden", "true");

  customerFrozenView?.classList.remove("hidden");
  customerFrozenView?.removeAttribute("inert");
  customerFrozenView?.removeAttribute("aria-hidden");

  showStickyAction(false);
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });

  setText("frozen-customer-order", snapshot.shopify_ref || "–");
  setText("frozen-customer-case", snapshot.public_id || item.public_id || "–");
  setText("frozen-customer-subject", snapshot.case_subject || meta.label);
  const frozenServiceCard = byId("frozen-customer-service-card");
  frozenServiceCard?.classList.toggle("hidden", !meta.service);
  setText("frozen-customer-note-number", meta.service ? "04" : "03");
  setText("frozen-customer-service-label", meta.service ? "Zusätzliche Arbeiten" : "Vorgangsart");

  const bike = [
    snapshot.item_type === "battery" ? "Akku" : "Komplettes Fahrrad",
    snapshot.bike_model,
    snapshot.bike_color
  ].filter(Boolean).join(" · ");

  setText("frozen-customer-bike", bike || "–");
  setText("frozen-customer-delivery", frozenDeliveryDisplay(snapshot));
  setText("frozen-customer-service", service);
  setText("frozen-customer-service-note", serviceNote);
  setText("frozen-customer-note", snapshot.customer_note || "Kein Hinweis hinterlegt.");

  const confirmedAt = snapshot.confirmed_at || item.confirmed_at;
  setText(
    "frozen-customer-confirmed-at",
    confirmedAt
      ? `Bestätigt am ${new Intl.DateTimeFormat("de-DE", {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(new Date(confirmedAt))}`
      : "Bestätigt"
  );

  setDynamicStatus({
    kicker: "Abgeschlossen",
    title: "Vorgang bestätigt",
    detail: "Der bestätigte Stand ist gespeichert.",
    progress: 100,
    state: "Bestätigt",
    complete: true
  });

  const pdf = document.querySelector("#frozen-customer-pdf");

  if (previewMode) {
    pdf?.classList.add("hidden");
  } else if (pdf) {
    customerPdfUrl(token)
      .then(url => {
        pdf.href = url;
        pdf.classList.remove("hidden");
      })
      .catch(error => {
        pdf.classList.add("hidden");
        showError(error.message, { title: "PDF nicht verfügbar" });
      });
  }
}

function renderCustomerEditable() {
  document.body.classList.remove("customer-frozen-mode");

  customerFrozenView?.classList.add("hidden");
  customerFrozenView?.setAttribute("inert", "");
  customerFrozenView?.setAttribute("aria-hidden", "true");

  customerLiveContent?.classList.remove("hidden");
  customerLiveContent?.removeAttribute("inert");
  customerLiveContent?.removeAttribute("aria-hidden");
}

function fill(item) {
  current = item;

  if (item.read_only || item.status === "confirmed") {
    renderCustomerFrozen(item);
    return;
  }

  renderCustomerEditable();
  applyCustomerCaseType(item);

  setText("public-id", item.public_id);
  setText("shopify-ref", item.shopify_ref);
  setText("item-type", item.item_type === "battery" ? "Akku" : "Komplettes Fahrrad");

  const cleanName = (item.customer_name || "").trim();
  const firstName = cleanName.split(/\s+/)[0] || "";

  setText("customer-name-display", cleanName || "–");

  setText("customer-greeting", firstName ? `Hallo ${firstName}` : "Hallo");

  setText("customer-personal-confirm", firstName ? `${firstName}, bitte prüfe abschließend deine Auswahl.` : "Bitte prüfe abschließend deine Auswahl.");

  for (const name of [
    "customer_name",
    "bike_model",
    "bike_color",
    "case_subject",
    "customer_note"
  ]) {
    form.elements[name].value = item[name] || "";
  }

  form.querySelectorAll('input[name="service_choice"]').forEach(input => { input.checked = false; });
  const serviceValue = item.service_choice || "";

  if (!requiresServiceChoice(item)) {
    const noneInput = form.querySelector('input[name="service_choice"][value="none"]');
    if (noneInput) noneInput.checked = true;
  } else if (serviceValue && serviceValue !== "none") {
    const serviceInput = form.querySelector(
      `input[name="service_choice"][value="${serviceValue}"]`
    );

    if (serviceInput) {
      serviceInput.checked = true;
    }
  } else if (item.status === "confirmed" && serviceValue === "none") {
    const noneInput = form.querySelector(
      'input[name="service_choice"][value="none"]'
    );

    if (noneInput) {
      noneInput.checked = true;
    }
  }

  confirmationContext = "";
  renderConfirmationRows({ preserve: false });

  document.querySelector("#accessory-list").innerHTML =
    accessoryList(item)
      .map(text => `
        <div class="delivery-item">
          <span class="delivery-check">✓</span>
          <strong>${text}</strong>
        </div>
      `)
      .join("");

  renderSummary();

  showStickyAction(true);
  updateFlowState();
}

form.addEventListener("input", () => {
  renderSummary();
  updateFlowState();
});

form.addEventListener("change", event => {
  if (event.target?.name === "service_choice") {
    renderConfirmationRows({ preserve: true });
  }
  renderSummary();
  updateFlowState();
});

document.querySelectorAll("[data-scroll-target]").forEach(button => {
  button.addEventListener("click", () => {
    scrollToSection(`#${button.dataset.scrollTarget}`);
  });
});

stickyButton.addEventListener("click", () => {
  const action = stickyButton.dataset.action;

  if (action === "service") {
    scrollToSection("#section-service");
    return;
  }

  if (action === "confirm") {
    scrollToSection("#section-confirm");
    return;
  }

  if (action === "submit") {
    form.requestSubmit();
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  const serviceChoice = selectedService();

  if (requiresServiceChoice(current) && !serviceChoice) {
    scrollToSection("#section-service");
    updateFlowState();
    return;
  }

  if (!confirmationProgress().done) {
    scrollToSection("#section-confirm");
    updateFlowState();
    return;
  }

  if (previewMode) {
    showInfo("Vorschau: Es wurden keine Änderungen gespeichert.", {
      title: "Mitarbeiter-Vorschau"
    });
    return;
  }

  setButtonLoading(stickyButton, true, "Wird gesendet …");

  try {
    const payload = {
      ...collect(),
      ...confirmationPayload()
    };

    const result = await confirmCustomer(token, payload);
    fill(result.case);

    showSuccess("Vorgang verbindlich bestätigt.", {
      title: "Bestätigung gespeichert"
    });
  } catch (error) {
    showError(error.message, { title: "Bestätigung nicht möglich" });

    stickyButton.disabled = false;
    updateFlowState();
  }
});

async function load() {
  if (!previewMode) {
    setCustomerUnlocked(false);
  }
  if (previewMode) {
    if (!getPortalSession()) {
      const next = encodeURIComponent(`customer.html?preview=${previewId}`);
      location.replace(`login.html?next=${next}`);
      return;
    }

    setCustomerUnlocked(true);
    enableEmployeePreview();

    try {
      const item = await getAdminCustomerPreview(previewId);
      fill(item);

      requestAnimationFrame(() => {
        requestAnimationFrame(finishBoot);
      });
    } catch (error) {
      showStickyAction(false);
      failBoot(error.message);
    }

    return;
  }

  if (!token) {
    showStickyAction(false);
    failBoot("Der Kundenlink ist unvollständig.");
    return;
  }

  if (!getCustomerSession(token)) {
    showVerification();
    return;
  }

  await loadVerifiedCustomer();
}

load();
