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
} from "./api.js?v=7.10.5";


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

const flowStatus = document.querySelector("#flow-status");
const flowStatusKicker = document.querySelector("#flow-status-kicker");
const flowStatusTitle = document.querySelector("#flow-status-title");
const flowStatusDetail = document.querySelector("#flow-status-detail");
const flowStatusState = document.querySelector("#flow-status-state");
const flowStatusProgress = document.querySelector("#flow-status-progress");

let current;


function setCustomerUnlocked(unlocked) {
  document.documentElement.classList.toggle("customer-pin-locked", !unlocked);
  document.body.classList.toggle("customer-locked", !unlocked);
  verificationPanel?.classList.toggle("hidden", unlocked);

  for (const element of document.querySelectorAll(
    "body > :not(#customer-verification):not(.flow-banner-stack)"
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

otpSlots.forEach(slot => {
  slot.addEventListener("pointerdown", event => {
    event.preventDefault();
    const index = Number(slot.dataset.otpIndex);
    focusOtpAt(Number.isFinite(index) ? index : null);
  });
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

function selectedService() {
  return form.querySelector('input[name="service_choice"]:checked')?.value || "";
}

function serviceText(value) {
  if (value === "inspection") {
    return "Inspektion · 96 €";
  }

  if (value === "inspection_wear") {
    return "Inspektion + Verschleißteile · 96 € + Material";
  }

  if (value === "none") {
    return "Nur Garantiefall";
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

function confirmationCount() {
  let count = 0;

  if (form.elements.confirm_scope.checked) {
    count += 1;
  }

  if (form.elements.confirm_accessories.checked) {
    count += 1;
  }

  return count;
}

function renderSummary() {
  if (!current) return;

  const data = collect();

  setText("summary-ref", current.shopify_ref);
  setText("summary-item", current.item_type === "battery" ? "Akku" : "Komplettes Fahrrad");
  setText("summary-accessories", accessoryList(current).join(", "));
  setText("summary-service", serviceText(data.service_choice));
}

function setSectionAttention(sectionId, active) {
  document.querySelector(sectionId)?.classList.toggle("has-attention", active);
}

function showStickyAction(show) {
  if (!stickyAction) return;

  stickyAction.hidden = !show;
  stickyAction.classList.toggle("hidden", !show);
}

function setDynamicStatus({
  kicker,
  title,
  detail,
  progress,
  state,
  complete = false
}) {
  const normalized = Math.max(0, Math.min(100, Number(progress) || 0));

  if (flowStatusKicker) flowStatusKicker.textContent = kicker;
  if (flowStatusTitle) flowStatusTitle.textContent = title;
  if (flowStatusDetail) flowStatusDetail.textContent = detail;
  if (flowStatusState) flowStatusState.textContent = state;

  if (flowStatusProgress) {
    flowStatusProgress.style.width = `${normalized}%`;
  }

  if (flowStatus) {
    flowStatus.classList.toggle("is-complete", complete);
  }
}

function updateFlowState() {
  if (!current || current.read_only || current.status === "confirmed") {
    return;
  }

  showStickyAction(true);

  const serviceChosen = Boolean(selectedService());
  const confirms = confirmationCount();
  const confirmationsDone = confirms === 2;

  if (serviceState) {
    serviceState.textContent = serviceChosen
      ? "Ausgewählt"
      : "Auswahl erforderlich";
    serviceState.classList.toggle("is-done", serviceChosen);
  }

  if (confirmState) {
    confirmState.textContent = confirmationsDone
      ? "Bestätigt"
      : `${2 - confirms} Bestätigung${2 - confirms === 1 ? "" : "en"} offen`;
    confirmState.classList.toggle("is-done", confirmationsDone);
  }

  setSectionAttention("#section-service", !serviceChosen);
  setSectionAttention("#section-confirm", serviceChosen && !confirmationsDone);

  if (!serviceChosen) {
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
      title: confirms === 1
        ? "Noch eine Bestätigung"
        : "Angaben bestätigen",
      detail: confirms === 1
        ? "Ein Punkt ist bereits bestätigt."
        : "Bitte Auftrag und Lieferumfang bestätigen.",
      progress: confirms === 1 ? 82 : 68,
      state: confirms === 1 ? "Fast geschafft" : "Prüfung offen"
    });

    stickyTitle.textContent =
      `${2 - confirms} Bestätigung${2 - confirms === 1 ? "" : "en"} offen`;
    stickySubtitle.textContent = "Auftrag und Lieferumfang bestätigen";
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
  stickySubtitle.textContent = serviceText(selectedService());
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


function frozenServiceDisplay(value) {
  return {
    none: ["Nur Garantiefall", "Keine zusätzliche kostenpflichtige Arbeit"],
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
  const [service, serviceNote] = frozenServiceDisplay(snapshot.service_choice);

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
  setText("frozen-customer-subject", snapshot.case_subject || "Garantiefall");

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

  const serviceValue = item.service_choice || "";

  if (serviceValue && serviceValue !== "none") {
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

form.addEventListener("change", () => {
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

  if (!serviceChoice) {
    scrollToSection("#section-service");
    updateFlowState();
    return;
  }

  if (!form.elements.confirm_scope.checked || !form.elements.confirm_accessories.checked) {
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
      confirm_scope: form.elements.confirm_scope.checked,
      confirm_accessories: form.elements.confirm_accessories.checked
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
