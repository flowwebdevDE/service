import {
  adminCasePdfUrl,
  casePdfFilename,
  deleteAdminCase,
  getAdminCase,
  getAdminCustomerLink,
  updateAdminCase,
  updateAdminCaseReport,
  updateAdminCaseStage,
  logoutPortalSession,
  requirePortalSession
} from "./api-oauth-core.js?v=7.15.47";
import { initModelPopup } from "./model-picker.js?v=7.6.1";
import { setButtonLoading, pulseElement, beginGlobalBusy, endGlobalBusy, transitionSurface } from "./motion.js?v=7.15.1";
import { showError, showInfo, showSuccess } from "./banner.js?v=7.15.24";


const bootLoader = document.querySelector("#app-boot-loader");
const bootLoaderTitle = document.querySelector("#app-boot-loader-title");
const bootLoaderText = document.querySelector("#app-boot-loader-text");

function finishBoot() {
  document.documentElement.classList.remove("employee-content-loading");

  if (!bootLoader) return;

  bootLoader.classList.add("is-leaving");
  window.setTimeout(() => bootLoader.remove(), 180);
}

function failBoot(message) {
  document.documentElement.classList.add("employee-content-loading");

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
const stageProgressBar = document.querySelector("#internal-stage-progress-bar");
const stageProgressCopy = document.querySelector("#internal-stage-progress-copy");
const priceSettings = document.querySelector("#case-price-settings");
const priceMode = document.querySelector("#case-service-price-mode");
const priceAmountField = document.querySelector("#case-service-price-amount-field");
const reportForm = document.querySelector("#service-report-form");
const reportSaveButton = document.querySelector("#report-save");
const reportState = document.querySelector("#service-report-state");
const batteryTestEnabled = reportForm?.elements.battery_test_enabled;
const batteryTestFields = document.querySelector("#battery-test-fields");
let currentItem = null;

function visibleCaseReference(item) {
  const shopify = String(item?.shopify_ref || "").trim();
  return {
    label: shopify ? "Shopify" : "Service-Referenz",
    value: shopify || String(item?.public_id || "–").trim() || "–",
    fallback: !shopify
  };
}

const CASE_TYPE_META = Object.freeze({
  warranty: {
    label: "Garantiefall",
    subject: "Garantiefall / Betreff",
    service: true,
    serviceHeading: "Zusatzauftrag",
    serviceLabel: "Zusatzleistung zum Garantiefall",
    frozenServiceLabel: "Zusatzauftrag",
    none: "Nur Garantiefall"
  },
  repair: {
    label: "Reparatur",
    subject: "Reparatur / Fehlerbild",
    service: true,
    serviceHeading: "Zusätzliche Arbeiten",
    serviceLabel: "Zusatzleistung zur Reparatur",
    frozenServiceLabel: "Zusätzliche Arbeiten",
    none: "Nur Reparatur"
  },
  return: { label: "Rückgabe", subject: "Grund der Rückgabe", service: false, none: "Keine Zusatzleistung" },
  exchange: { label: "Tausch", subject: "Grund für den Tausch", service: false, none: "Keine Zusatzleistung" }
});

function caseTypeMeta(value) {
  return CASE_TYPE_META[value] || CASE_TYPE_META.warranty;
}

function applyCaseTypeUi(value) {
  const meta = caseTypeMeta(value);
  document.querySelector("#case-type-label")?.replaceChildren(document.createTextNode(meta.label));
  document.querySelector("#case-subject-label")?.replaceChildren(document.createTextNode(meta.subject));
  document.querySelector("#case-service-heading")?.replaceChildren(document.createTextNode(meta.serviceHeading || "Zusatzauftrag"));
  document.querySelector("#case-service-label")?.replaceChildren(document.createTextNode(meta.serviceLabel || "Zusatzleistung"));
  document.querySelector("#case-service-panel")?.classList.toggle("hidden", !meta.service);
  const serviceSelect = form.elements.service_choice;
  const noneOption = serviceSelect?.querySelector('option[value="none"]');
  if (noneOption) noneOption.textContent = meta.none;
  if (!meta.service && serviceSelect) serviceSelect.value = "none";
}


const INTERNAL_STAGE_META = Object.freeze({
  awaiting_customer: { label: "Wartet auf Kundenbestätigung", action: "Erst nach Kundenbestätigung", progress: 8 },
  customer_confirmed: { label: "Kunde hat bestätigt", action: "Interne Stufe setzen", progress: 18 },
  received: { label: "Eingegangen", action: "Eingegangen", progress: 32 },
  diagnosis: { label: "Prüfung / Diagnose", action: "Prüfung / Diagnose", progress: 44 },
  waiting_parts: { label: "Wartet auf Teile", action: "Wartet auf Teile", progress: 52 },
  work_in_progress: { label: "In Bearbeitung", action: "In Bearbeitung", progress: 66 },
  quality_check: { label: "Qualitätsprüfung", action: "Qualitätsprüfung", progress: 80 },
  ready_for_handover: { label: "Abholbereit / Versandbereit", action: "Abholbereit", progress: 92 },
  completed: { label: "Abgeschlossen", action: "Abgeschlossen", progress: 100 }
});

function internalStage(item) {
  if (item?.internal_stage && INTERNAL_STAGE_META[item.internal_stage]) return item.internal_stage;
  if (item?.service_status === "completed" || item?.service_status === "resolved") return "completed";
  if (item?.service_status === "arrived") return "received";
  if (item?.service_status === "in_progress") return "work_in_progress";
  if (item?.status === "confirmed") return "customer_confirmed";
  return "awaiting_customer";
}

function parseEuroToCents(value) {
  const normalized = String(value || "").trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function centsToEuroInput(value) {
  const cents = Number(value);
  if (!Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function customerPriceText(item, suffix = "") {
  if (item?.service_price_mode !== "known") return "Preis nach Vereinbarung";
  const cents = Number(item?.service_price_amount_cents);
  if (!Number.isFinite(cents)) return "Preis nach Vereinbarung";
  const amount = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
  return suffix ? `${amount} ${suffix}` : amount;
}

function syncPriceControls() {
  const meta = caseTypeMeta(form.elements.case_type?.value);
  const service = form.elements.service_choice?.value || "";
  const paid = meta.service && ["inspection", "inspection_wear"].includes(service);
  priceSettings?.classList.toggle("hidden", !paid);
  if (!paid && priceMode) priceMode.value = "hidden";
  const showAmount = paid && priceMode?.value === "known";
  priceAmountField?.classList.toggle("hidden", !showAmount);
  if (form.elements.service_price_eur) {
    form.elements.service_price_eur.required = showAmount;
    if (!showAmount) form.elements.service_price_eur.value = "";
  }
}

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

function statusActionLabel(stage, confirmed) {
  if (!confirmed) return "Erst nach Kundenbestätigung";
  return INTERNAL_STAGE_META[stage]?.action || "Interne Stufe setzen";
}

function closeStatusMenu() {
  serviceStatusMenu?.classList.add("hidden");
  serviceStatusTrigger?.setAttribute("aria-expanded", "false");
}

function renderServiceStatus(item) {
  const stage = internalStage(item);
  const meta = INTERNAL_STAGE_META[stage] || INTERNAL_STAGE_META.awaiting_customer;
  const confirmed = item?.status === "confirmed";

  serviceStatusTrigger.disabled = !confirmed;
  serviceStatusTriggerText.textContent = statusActionLabel(stage, confirmed);

  if (serviceStatusLabel) serviceStatusLabel.textContent = meta.label;
  if (stageProgressBar) stageProgressBar.style.width = `${meta.progress}%`;
  if (stageProgressCopy) {
    stageProgressCopy.textContent = confirmed
      ? "Interner Bearbeitungsfortschritt · nur für Mitarbeiter sichtbar"
      : "Kundenbestätigung ausstehend";
  }

  serviceStatusMenu?.querySelectorAll("[data-internal-stage]").forEach(button => {
    const selected = button.dataset.internalStage === stage;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  });

  const panel = document.querySelector(".flow-status-panel");
  if (panel) panel.dataset.status = stage === "completed" ? "completed" : (stage === "received" ? "arrived" : stage);

  if (!confirmed) closeStatusMenu();
}

function collect() {
  return {
    case_type: form.elements.case_type.value,
    customer_name: form.elements.customer_name.value.trim(),
    bike_model: form.elements.bike_model.value.trim(),
    bike_color: form.elements.bike_color.value.trim(),
    case_subject: form.elements.case_subject.value.trim(),
    item_type: form.elements.item_type.value,
    required_charger: form.elements.required_charger.checked,
    required_keys: form.elements.required_keys.checked,
    customer_note: form.elements.customer_note.value.trim(),
    service_choice: form.elements.service_choice.value,
    service_price_mode: priceMode?.value === "known" ? "known" : "hidden",
    service_price_amount_cents: priceMode?.value === "known"
      ? parseEuroToCents(form.elements.service_price_eur?.value)
      : null
  };
}


function serviceDisplay(value, caseType = "warranty", item = currentItem) {
  const meta = caseTypeMeta(caseType);
  if (!meta.service) return [meta.label, "Keine zusätzliche Leistung vorgesehen"];
  return {
    none: [meta.none, "Keine zusätzliche kostenpflichtige Arbeit"],
    inspection: ["Inspektion", customerPriceText(item)],
    inspection_wear: [
      "Inspektion + Verschleißteile",
      item?.service_price_mode === "known"
        ? `${customerPriceText(item)} · Material nach tatsächlichem Aufwand`
        : "Preis und Material nach Vereinbarung"
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

function optionalNumberInput(element) {
  if (!element || element.value === "") return null;
  const value = Number(element.value);
  return Number.isFinite(value) ? value : null;
}

function hasServiceReport(item) {
  return Boolean(
    String(item?.work_performed || "").trim() ||
    String(item?.work_result || "").trim() ||
    item?.battery_test_enabled
  );
}

function syncBatteryTestFields() {
  const enabled = Boolean(batteryTestEnabled?.checked);
  batteryTestFields?.classList.toggle("hidden", !enabled);
  batteryTestFields?.querySelectorAll("input, select, textarea").forEach(element => {
    element.disabled = !enabled;
  });
}

function fillServiceReport(item) {
  if (!reportForm) return;
  const confirmed = item?.status === "confirmed";
  reportForm.classList.toggle("hidden", !confirmed);
  if (!confirmed) return;

  reportForm.elements.work_performed.value = item.work_performed || "";
  reportForm.elements.work_result.value = item.work_result || "";
  reportForm.elements.battery_test_enabled.checked = Boolean(item.battery_test_enabled);
  reportForm.elements.battery_test_nominal_wh.value = item.battery_test_nominal_wh ?? "";
  reportForm.elements.battery_test_measured_wh.value = item.battery_test_measured_wh ?? "";
  reportForm.elements.battery_test_soh_percent.value = item.battery_test_soh_percent ?? "";
  reportForm.elements.battery_test_voltage_v.value = item.battery_test_voltage_v ?? "";
  reportForm.elements.battery_test_cycles.value = item.battery_test_cycles ?? "";
  reportForm.elements.battery_test_status.value = item.battery_test_status || "";
  reportForm.elements.battery_test_note.value = item.battery_test_note || "";
  syncBatteryTestFields();

  if (reportState) {
    if (item.service_report_updated_at) {
      const stamp = new Intl.DateTimeFormat("de-DE", {
        dateStyle: "short",
        timeStyle: "short"
      }).format(new Date(item.service_report_updated_at));
      reportState.textContent = `Gespeichert · ${stamp}`;
      reportState.classList.add("is-saved");
    } else {
      reportState.textContent = "Noch nicht dokumentiert";
      reportState.classList.remove("is-saved");
    }
  }
}

function collectServiceReport() {
  return {
    work_performed: reportForm.elements.work_performed.value.trim(),
    work_result: reportForm.elements.work_result.value.trim(),
    battery_test_enabled: Boolean(reportForm.elements.battery_test_enabled.checked),
    battery_test_nominal_wh: optionalNumberInput(reportForm.elements.battery_test_nominal_wh),
    battery_test_measured_wh: optionalNumberInput(reportForm.elements.battery_test_measured_wh),
    battery_test_soh_percent: optionalNumberInput(reportForm.elements.battery_test_soh_percent),
    battery_test_voltage_v: optionalNumberInput(reportForm.elements.battery_test_voltage_v),
    battery_test_cycles: optionalNumberInput(reportForm.elements.battery_test_cycles),
    battery_test_status: reportForm.elements.battery_test_status.value || "",
    battery_test_note: reportForm.elements.battery_test_note.value.trim()
  };
}

function renderEmployeeFrozen(item) {
  const snapshot = confirmedSnapshot(item);
  const meta = caseTypeMeta(snapshot.case_type);
  const [service, serviceNote] = serviceDisplay(snapshot.service_choice, snapshot.case_type, snapshot);

  document.querySelector("#frozen-employee-customer").textContent =
    snapshot.customer_name || "–";

  const modelParts = [
    snapshot.bike_model,
    snapshot.bike_color
  ].filter(Boolean);

  document.querySelector("#frozen-employee-model").textContent =
    modelParts.length ? modelParts.join(" · ") : "Kein Modell ergänzt";

  document.querySelector("#frozen-employee-type-label").textContent = meta.label;
  document.querySelector("#frozen-employee-subject").textContent =
    snapshot.case_subject || "Kein Betreff hinterlegt";

  document.querySelector("#frozen-employee-item").textContent =
    snapshot.item_type === "battery" ? "Akku" : "Komplettes Fahrrad";

  document.querySelector("#frozen-employee-delivery").textContent =
    deliveryDisplay(snapshot);

  const frozenServiceCard = document.querySelector("#frozen-employee-service-card");
  frozenServiceCard?.classList.toggle("hidden", !meta.service);
  document.querySelector("#frozen-employee-service-label")?.replaceChildren(
    document.createTextNode(meta.frozenServiceLabel || "Zusatzauftrag")
  );
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
  const visibleRef = visibleCaseReference(item);
  document.querySelector("#case-title")?.replaceChildren(document.createTextNode(visibleRef.value));
  applyCaseTypeUi(item.case_type);
  document.querySelector("#sidebarCaseRef")?.replaceChildren(document.createTextNode(visibleRef.value));
  renderServiceStatus(item);

  for (const name of [
    "case_type",
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

  if (priceMode) priceMode.value = item.service_price_mode === "known" ? "known" : "hidden";
  if (form.elements.service_price_eur) {
    form.elements.service_price_eur.value = centsToEuroInput(item.service_price_amount_cents);
  }
  syncPriceControls();

  form.elements.required_charger.checked = Boolean(item.required_charger);
  form.elements.required_keys.checked = Boolean(item.required_keys);
  modelPopup?.sync();


  currentItem = item;
  fillServiceReport(item);

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
    if (form.elements.case_type) {
      form.elements.case_type.disabled = true;
      form.elements.case_type.title = "Die Vorgangsart wird beim Anlegen festgelegt.";
    }

    if (saveButton) {
      saveButton.classList.remove("hidden");
      saveButton.querySelector("span")?.replaceChildren(document.createTextNode("Speichern"));
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
    const pdfLabel = pdfButton.querySelector("span");
    if (pdfLabel) {
      pdfLabel.textContent = item.status === "confirmed"
        ? (hasServiceReport(item) ? "Service-PDF" : "Bestätigungs-PDF")
        : "Vorgangs-PDF";
    }
  }

  transitionSurface(item.status === "confirmed" ? frozenView : form);

  if (deleteConfirmInput) {
    deleteConfirmInput.value = "";
    deleteConfirmInput.placeholder = visibleRef.value;
    document.querySelector("#delete-reference-label")?.replaceChildren(
      document.createTextNode(`Zur Bestätigung ${visibleRef.label === "Shopify" ? "Auftragsnummer" : "Service-Referenz"} eingeben`)
    );
  }
  if (confirmDeleteButton) {
    confirmDeleteButton.disabled = true;
  }
}

batteryTestEnabled?.addEventListener("change", syncBatteryTestFields);

reportForm?.addEventListener("submit", async event => {
  event.preventDefault();
  if (currentItem?.status !== "confirmed") return;

  setButtonLoading(reportSaveButton, true, "Speichere …");
  beginGlobalBusy();

  try {
    const updated = await updateAdminCaseReport(id, collectServiceReport());
    fill(updated);
    showSuccess("Arbeitsdokumentation gespeichert.", { title: "Gespeichert" });
  } catch (error) {
    showError(error.message, { title: "Dokumentation nicht gespeichert" });
  } finally {
    setButtonLoading(reportSaveButton, false);
    endGlobalBusy();
  }
});

form.elements.service_choice?.addEventListener("change", syncPriceControls);
priceMode?.addEventListener("change", syncPriceControls);

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

if (!id) {
  failBoot("Keine Vorgangs-ID übergeben.");
} else {
  try {
    const item = await getAdminCase(id);
    fill(item);

    requestAnimationFrame(() => {
      requestAnimationFrame(finishBoot);
    });
  } catch (error) {
    failBoot(error.message);
  }
}


serviceStatusTrigger?.addEventListener("click", event => {
  event.stopPropagation();
  if (serviceStatusTrigger.disabled) return;

  const isOpen = !serviceStatusMenu.classList.contains("hidden");
  serviceStatusMenu.classList.toggle("hidden", isOpen);
  serviceStatusTrigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
});

serviceStatusMenu?.querySelectorAll("[data-internal-stage]").forEach(button => {
  button.addEventListener("click", async () => {
    const next = button.dataset.internalStage;
    if (!next || currentItem?.status !== "confirmed") return;

    closeStatusMenu();
    serviceStatusTrigger.disabled = true;
    setButtonLoading(serviceStatusTrigger, true, "Aktualisiere …");
    beginGlobalBusy();

    try {
      const item = await updateAdminCaseStage(id, next);
      currentItem = item;
      renderServiceStatus(item);
      pulseElement(document.querySelector(".flow-status-panel"));

      showSuccess(
        next === "completed"
          ? "Vorgang abgeschlossen und ins Archiv verschoben."
          : "Interne Bearbeitungsstufe aktualisiert.",
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

  try {
    const url = await adminCasePdfUrl(id);
    const link = document.createElement("a");
    link.href = url;
    link.download = casePdfFilename(currentItem, currentItem?.status === "confirmed" ? "confirmation" : "draft");
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
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
  const visibleRef = visibleCaseReference(currentItem);
  deleteConfirmInput.placeholder = visibleRef.value;
  document.querySelector("#delete-reference-label")?.replaceChildren(
    document.createTextNode(`Zur Bestätigung ${visibleRef.label === "Shopify" ? "Auftragsnummer" : "Service-Referenz"} eingeben`)
  );
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
    deleteConfirmInput.value.trim() !== visibleCaseReference(currentItem).value;
});

confirmDeleteButton?.addEventListener("click", async () => {
  if (
    !currentItem ||
    deleteConfirmInput.value.trim() !== visibleCaseReference(currentItem).value
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
