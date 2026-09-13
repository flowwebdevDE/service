import {
  adminCasePdfUrl,
  deleteAdminCase,
  getAdminCase,
  getAdminCustomerLink,
  updateAdminCase,
  updateAdminCaseStatus,
  logoutPortalSession,
  requirePortalSession
} from "./api.js?v=7.10.5";
import { initModelPopup } from "./model-picker.js?v=7.6.1";
import { setButtonLoading, pulseElement, beginGlobalBusy, endGlobalBusy, transitionSurface } from "./motion.js?v=7.11.0";
import { showError, showInfo, showSuccess } from "./banner.js?v=7.10.6";


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

const portalSession = requirePortalSession();
if (!portalSession) {
  await new Promise(() => {});
}

document.querySelector("#logout-button")?.addEventListener("click", () => {
  logoutPortalSession();
  location.replace("login.html");
});

const id = new URLSearchParams(location.search).get("id");
const form = document.querySelector("#case-form");
const modelPopup = await initModelPopup({
  trigger: document.querySelector("#case-model-trigger"),
  input: form.elements.bike_model,
  label: document.querySelector("#case-model-label"),
  itemType: form.elements.item_type
});

const frozenView = document.querySelector("#employee-frozen-view");
const serviceStatusLabel = document.querySelector("#service-status-label");
const serviceStatusDropdown = document.querySelector("#service-status-dropdown");
const serviceStatusTrigger = document.querySelector("#service-status-trigger");
const serviceStatusTriggerText = document.querySelector("#service-status-trigger-text");
const serviceStatusMenu = document.querySelector("#service-status-menu");
const deleteDialog = document.querySelector("#deleteCaseDialog");
const deleteConfirmInput = document.querySelector("#delete-confirm-id");
const confirmDeleteButton = document.querySelector("#confirmDeleteCase");
const customerLinkDialog = document.querySelector("#customerLinkDialog");
const customerLinkValue = document.querySelector("#customer-link-value");
const customerVerificationCode = document.querySelector("#customer-verification-code");
const customerLinkNote = document.querySelector("#customer-link-note");
let currentItem = null;


function statusLabel(value) {
  return {
    waiting_customer: "Wartet auf Kundenbestätigung",
    customer_confirmed: "Bestätigt · Status noch offen",
    arrived: "Angekommen",
    in_progress: "In Bearbeitung",
    completed: "Abgeschlossen",
    resolved: "Abgeschlossen"
  }[value] || "Wartet auf Kundenbestätigung";
}

function statusActionLabel(status, confirmed) {
  if (!confirmed) return "Erst nach Kundenbestätigung";

  return {
    arrived: "Angekommen",
    in_progress: "In Bearbeitung",
    completed: "Abgeschlossen",
    resolved: "Abgeschlossen"
  }[status] || "Status setzen";
}

function closeStatusMenu() {
  serviceStatusMenu?.classList.add("hidden");
  serviceStatusTrigger?.setAttribute("aria-expanded", "false");
}

function renderServiceStatus(item) {
  const status = item?.service_status || (
    item?.status === "confirmed"
      ? "customer_confirmed"
      : "waiting_customer"
  );

  const confirmed = item?.status === "confirmed";
  serviceStatusTrigger.disabled = !confirmed;
  serviceStatusTriggerText.textContent = statusActionLabel(status, confirmed);

  if (serviceStatusLabel) {
    serviceStatusLabel.textContent = statusLabel(status);
  }

  serviceStatusMenu?.querySelectorAll("[data-service-status]").forEach(button => {
    const normalized = status === "resolved" ? "completed" : status;
    const selected = button.dataset.serviceStatus === normalized;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  });

  const panel = document.querySelector(".flow-status-panel");
  panel.dataset.status = status === "resolved" ? "completed" : status;

  if (!confirmed) closeStatusMenu();
}

function collect() {
  return {
    customer_name: form.elements.customer_name.value.trim(),
    bike_model: form.elements.bike_model.value.trim(),
    bike_color: form.elements.bike_color.value.trim(),
    case_subject: form.elements.case_subject.value.trim(),
    item_type: form.elements.item_type.value,
    required_charger: form.elements.required_charger.checked,
    required_keys: form.elements.required_keys.checked,
    customer_note: form.elements.customer_note.value.trim(),
    service_choice: form.elements.service_choice.value
  };
}


function serviceDisplay(value) {
  return {
    none: ["Nur Garantiefall", "Keine zusätzliche kostenpflichtige Arbeit"],
    inspection: ["Inspektion · 96 €", "Vom Kunden zusätzlich beauftragt"],
    inspection_wear: [
      "Inspektion + Verschleißteile",
      "96 € + tatsächlich benötigtes Material"
    ]
  }[value] || ["Keine Auswahl", "–"];
}

function deliveryDisplay(item) {
  const parts = [];

  if (item.required_charger) parts.push("Ladegerät");
  if (item.required_keys) parts.push("Schlüssel");

  return parts.length ? parts.join(" · ") : "Keine zusätzlichen Teile";
}

function confirmedSnapshot(item) {
  return item.pdf_snapshot && typeof item.pdf_snapshot === "object"
    ? { ...item, ...item.pdf_snapshot }
    : item;
}

function renderEmployeeFrozen(item) {
  const snapshot = confirmedSnapshot(item);
  const [service, serviceNote] = serviceDisplay(snapshot.service_choice);

  document.querySelector("#frozen-employee-customer").textContent =
    snapshot.customer_name || "–";

  const modelParts = [
    snapshot.bike_model,
    snapshot.bike_color
  ].filter(Boolean);

  document.querySelector("#frozen-employee-model").textContent =
    modelParts.length ? modelParts.join(" · ") : "Kein Modell ergänzt";

  document.querySelector("#frozen-employee-subject").textContent =
    snapshot.case_subject || "Kein Betreff hinterlegt";

  document.querySelector("#frozen-employee-item").textContent =
    snapshot.item_type === "battery" ? "Akku" : "Komplettes Fahrrad";

  document.querySelector("#frozen-employee-delivery").textContent =
    deliveryDisplay(snapshot);

  document.querySelector("#frozen-employee-service").textContent = service;
  document.querySelector("#frozen-employee-service-note").textContent = serviceNote;

  document.querySelector("#frozen-employee-note").textContent =
    snapshot.customer_note || "Kein Hinweis hinterlegt.";

  const confirmedAt = snapshot.confirmed_at || item.confirmed_at;
  document.querySelector("#frozen-employee-confirmed-at").textContent =
    confirmedAt
      ? new Intl.DateTimeFormat("de-DE", {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(new Date(confirmedAt))
      : "Bestätigt";
}

function fill(item) {
  document.querySelector("#case-title")?.replaceChildren(document.createTextNode(item.public_id));
  document.querySelector("#sidebarCaseRef")?.replaceChildren(document.createTextNode(item.shopify_ref));
  document.querySelector("#shopify-ref")?.replaceChildren(document.createTextNode(item.shopify_ref));
  renderServiceStatus(item);

  for (const name of [
    "customer_name",
    "bike_model",
    "bike_color",
    "case_subject",
    "item_type",
    "customer_note",
    "service_choice"
  ]) {
    form.elements[name].value = item[name] ?? "";
  }

  form.elements.required_charger.checked = Boolean(item.required_charger);
  form.elements.required_keys.checked = Boolean(item.required_keys);
  modelPopup?.sync();


  currentItem = item;

  const saveButton = document.querySelector("#save");

  if (item.status === "confirmed") {
    form.classList.add("hidden");
    frozenView?.classList.remove("hidden");
    renderEmployeeFrozen(item);

    if (saveButton) {
      saveButton.classList.add("hidden");
    }
  } else {
    form.classList.remove("hidden");
    frozenView?.classList.add("hidden");

    for (const element of form.elements) {
      element.disabled = false;
    }

    if (saveButton) {
      saveButton.classList.remove("hidden");
      saveButton.textContent = "Speichern";
    }
  }

  const previewLink = document.querySelector("#customer-preview");
  if (previewLink) {
    previewLink.href = new URL(
      `customer.html?preview=${encodeURIComponent(item.public_id)}`,
      location.href
    ).href;
  }

  const pdfButton = document.querySelector("#internal-print");
  if (pdfButton) {
    pdfButton.textContent =
      item.status === "confirmed"
        ? "Bestätigungs-PDF"
        : "Vorgangs-PDF";
  }

  transitionSurface(item.status === "confirmed" ? frozenView : form);

  if (deleteConfirmInput) {
    deleteConfirmInput.value = "";
    deleteConfirmInput.placeholder = item.public_id;
  }
  if (confirmDeleteButton) {
    confirmDeleteButton.disabled = true;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  const saveButton = document.querySelector("#save");
  setButtonLoading(saveButton, true, "Speichere …");
  beginGlobalBusy();

  try {
    const updated = await updateAdminCase(id, collect());
    fill(updated);
    showSuccess("Änderungen gespeichert.", { title: "Gespeichert" });
  } catch (error) {
    showError(error.message);
  } finally {
    setButtonLoading(saveButton, false);
    endGlobalBusy();
  }
});

try {
  const item = await getAdminCase(id);
  fill(item);

  requestAnimationFrame(() => {
    requestAnimationFrame(finishBoot);
  });
} catch (error) {
  failBoot(error.message);
}


serviceStatusTrigger?.addEventListener("click", event => {
  event.stopPropagation();
  if (serviceStatusTrigger.disabled) return;

  const isOpen = !serviceStatusMenu.classList.contains("hidden");
  serviceStatusMenu.classList.toggle("hidden", isOpen);
  serviceStatusTrigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
});

serviceStatusMenu?.querySelectorAll("[data-service-status]").forEach(button => {
  button.addEventListener("click", async () => {
    const next = button.dataset.serviceStatus;
    if (!next || currentItem?.status !== "confirmed") return;

    closeStatusMenu();
    serviceStatusTrigger.disabled = true;
    setButtonLoading(serviceStatusTrigger, true, "Aktualisiere …");
    beginGlobalBusy();

    try {
      const item = await updateAdminCaseStatus(id, next);
      currentItem = item;
      renderServiceStatus(item);
      pulseElement(document.querySelector(".flow-status-panel"));

      showSuccess(
        next === "completed"
          ? "Rückversand erfasst. Auftrag abgeschlossen und ins Archiv verschoben."
          : "Bearbeitungsstatus aktualisiert.",
        { title: "Status aktualisiert" }
      );
    } catch (error) {
      showError(error.message);

      try {
        const item = await getAdminCase(id);
        currentItem = item;
        renderServiceStatus(item);
      } catch {}
    } finally {
      setButtonLoading(serviceStatusTrigger, false);
      serviceStatusTrigger.disabled = currentItem?.status !== "confirmed";
      endGlobalBusy();
    }
  });
});

document.addEventListener("click", event => {
  if (!serviceStatusDropdown?.contains(event.target)) {
    closeStatusMenu();
  }
});


document.querySelector("#internal-print")?.addEventListener("click", async event => {
  event.preventDefault();

  const button = event.currentTarget;
  setButtonLoading(button, true, "Erstelle PDF …");
  beginGlobalBusy();

  const popup = window.open("", "_blank");

  try {
    const url = await adminCasePdfUrl(id);

    if (popup) {
      popup.location.href = url;
    } else {
      window.location.href = url;
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    popup?.close();
    showError(error.message);
  } finally {
    setButtonLoading(button, false);
    endGlobalBusy();
  }
});


document.querySelector("#customer-link-button")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  setButtonLoading(button, true, "Lade Link …");
  beginGlobalBusy();

  try {
    const result = await getAdminCustomerLink(id);

    if (!customerLinkValue) {
      throw new Error("Kundenlink-Dialog ist nicht vollständig geladen.");
    }

    customerLinkValue.value = result.customer_url || "";

    if (customerVerificationCode) {
      customerVerificationCode.textContent =
        result.verification_code || "••••••";
    }

    showInfo(
      result.rotated
        ? "Link wurde sicher neu erzeugt. Der bisherige Link ist damit ungültig."
        : "Link und Code wurden wieder geladen.",
      { title: "Kundenzugang" }
    );

    customerLinkNote.textContent = result.rotated
      ? "Der gespeicherte Kundenlink konnte nicht sicher wiederhergestellt werden. Deshalb wurde automatisch ein neuer Link erzeugt. Bitte nur noch diesen Link verwenden."
      : "Das ist derselbe aktive Kundenlink, der bereits für diesen Vorgang erzeugt wurde.";

    if (!customerLinkDialog.open) {
      customerLinkDialog.showModal();
    }
  } catch (error) {
    showError(error.message);
  } finally {
    setButtonLoading(button, false);
    endGlobalBusy();
  }
});

document.querySelector("#closeCustomerLinkDialog")?.addEventListener("click", () => {
  if (customerLinkDialog?.open) customerLinkDialog.close();
});

document.querySelector("#copyCustomerLink")?.addEventListener("click", async event => {
  if (!customerLinkValue.value) return;
  const button = event.currentTarget;
  setButtonLoading(button, true, "Kopiere …");

  try {
    await navigator.clipboard.writeText(customerLinkValue.value);
    showSuccess("Kundenlink kopiert.", { title: "Kopiert" });
  } catch {
    customerLinkValue.select();
    document.execCommand("copy");
    showSuccess("Kundenlink kopiert.", { title: "Kopiert" });
  } finally {
    setButtonLoading(button, false);
  }
});


document.querySelector("#copyCustomerCode")?.addEventListener("click", async event => {
  const code = customerVerificationCode?.textContent?.trim();

  if (!code || code.includes("•")) {
    showError("Der Verifizierungscode ist noch nicht verfügbar.", {
      title: "Code nicht verfügbar"
    });
    return;
  }

  const button = event.currentTarget;
  setButtonLoading(button, true, "Kopiere …");
  try {
    await navigator.clipboard.writeText(code);
    showSuccess("Verifizierungscode kopiert.", { title: "Kopiert" });
  } finally {
    setButtonLoading(button, false);
  }
});

document.querySelector("#openCustomerLink")?.addEventListener("click", () => {
  if (!customerLinkValue.value) return;
  window.open(customerLinkValue.value, "_blank", "noopener");
});

const caseMoreTrigger = document.querySelector("#case-more-trigger");
const caseMoreMenu = document.querySelector("#case-more-menu");

function closeCaseMoreMenu() {
  caseMoreMenu?.classList.add("hidden");
  caseMoreTrigger?.setAttribute("aria-expanded", "false");
}

caseMoreTrigger?.addEventListener("click", event => {
  event.stopPropagation();
  const isOpen = !caseMoreMenu.classList.contains("hidden");
  caseMoreMenu.classList.toggle("hidden", isOpen);
  caseMoreTrigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
});

document.addEventListener("click", event => {
  if (!event.target.closest(".flow-more-menu")) {
    closeCaseMoreMenu();
  }
});

document.querySelector("#delete-case")?.addEventListener("click", () => {
  closeCaseMoreMenu();
  if (!currentItem) return;

  deleteConfirmInput.value = "";
  deleteConfirmInput.placeholder = currentItem.public_id;
  confirmDeleteButton.disabled = true;

  if (!deleteDialog.open) {
    deleteDialog.showModal();
  }

  deleteConfirmInput.focus();
});

function closeDeleteDialog() {
  if (deleteDialog?.open) deleteDialog.close();
}

document.querySelector("#closeDeleteCaseDialog")?.addEventListener("click", closeDeleteDialog);
document.querySelector("#cancelDeleteCase")?.addEventListener("click", closeDeleteDialog);

deleteConfirmInput?.addEventListener("input", () => {
  confirmDeleteButton.disabled =
    !currentItem ||
    deleteConfirmInput.value.trim() !== currentItem.public_id;
});

confirmDeleteButton?.addEventListener("click", async () => {
  if (
    !currentItem ||
    deleteConfirmInput.value.trim() !== currentItem.public_id
  ) {
    return;
  }

  setButtonLoading(confirmDeleteButton, true, "Lösche …");
  beginGlobalBusy();

  try {
    await deleteAdminCase(currentItem.public_id);
    location.replace("index.html");
  } catch (error) {
    showError(error.message);
    closeDeleteDialog();
  } finally {
    setButtonLoading(confirmDeleteButton, false);
    endGlobalBusy();
  }
});
