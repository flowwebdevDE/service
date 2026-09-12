import { setButtonLoading } from "./motion.js?v=7.9";
import {
  confirmCustomer,
  customerPdfUrl,
  getAdminCustomerPreview,
  getCustomerCase,
  getPortalSession
} from "./api.js?v=7.9.2";

const params = new URLSearchParams(location.search);
const token = params.get("token");
const previewId = params.get("preview");
const previewMode = Boolean(previewId);
const form = document.querySelector("#customer-form");
const message = document.querySelector("#message");

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

function fill(item) {
  current = item;

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

  if (item.read_only || item.status === "confirmed") {
    setReadOnly(item);
  } else {
    showStickyAction(true);
    updateFlowState();
  }
}

function setReadOnly(item) {
  for (const element of form.elements) {
    element.disabled = true;
  }

  // Keep the frozen form state internally consistent as well. This prevents
  // any later UI refresh from interpreting a confirmed case as "0 of 2".
  if (form.elements.confirm_scope) {
    form.elements.confirm_scope.checked = true;
  }

  if (form.elements.confirm_accessories) {
    form.elements.confirm_accessories.checked = true;
  }

  document.querySelector("#confirm-area")?.classList.add("hidden");
  document.querySelector("#confirmed-panel")?.classList.remove("hidden");

  showStickyAction(false);

  if (serviceState) {
    serviceState.textContent = "Ausgewählt";
    serviceState.classList.add("is-done");
  }

  if (confirmState) {
    confirmState.textContent = "Bestätigt";
    confirmState.classList.add("is-done");
  }

  setDynamicStatus({
    kicker: "Abgeschlossen",
    title: "Vorgang bestätigt",
    detail: "Die Bestätigung ist gespeichert und die PDF ist verfügbar.",
    progress: 100,
    state: "Bestätigt",
    complete: true
  });

  if (!previewMode) {
    customerPdfUrl(token).then(url => {
      const link = document.querySelector("#pdf-link");
      if (link) link.href = url;
    });
  } else {
    document.querySelector("#pdf-link")?.classList.add("hidden");
  }
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
    message.textContent = "Vorschau: Es wurden keine Änderungen gespeichert.";
    message.className = "notice notice--success";
    message.classList.remove("hidden");
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

    message.textContent = "Vorgang verbindlich bestätigt.";
    message.className = "notice notice--success";
    message.classList.remove("hidden");
  } catch (error) {
    message.textContent = error.message;
    message.className = "notice notice--danger";
    message.classList.remove("hidden");

    stickyButton.disabled = false;
    updateFlowState();
  }
});

async function load() {
  if (previewMode) {
    if (!getPortalSession()) {
      const next = encodeURIComponent(`customer.html?preview=${previewId}`);
      location.replace(`login.html?next=${next}`);
      return;
    }

    enableEmployeePreview();

    try {
      const item = await getAdminCustomerPreview(previewId);
      fill(item);
    } catch (error) {
      message.textContent = error.message;
      message.className = "notice notice--danger";
      message.classList.remove("hidden");
      showStickyAction(false);
    }

    return;
  }

  if (!token) {
    message.textContent = "Kundenlink unvollständig.";
    message.className = "notice notice--danger";
    message.classList.remove("hidden");
    showStickyAction(false);
    return;
  }

  try {
    const item = await getCustomerCase(token);
    fill(item);
  } catch (error) {
    message.textContent = error.message;
    message.className = "notice notice--danger";
    message.classList.remove("hidden");
    showStickyAction(false);
  }
}

load();
