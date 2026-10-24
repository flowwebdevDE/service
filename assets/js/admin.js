import {
  createCase,
  listCases,
  logoutPortalSession,
  requirePortalSession
} from "./api.js?v=7.15.4";
import { initModelPopup } from "./model-picker.js?v=7.6.1";
import { setButtonLoading, renderCaseSkeleton, pulseElement, beginGlobalBusy, endGlobalBusy, transitionSurface } from "./motion.js?v=7.15.1";
import { showError, showInfo, showSuccess } from "./banner.js?v=7.15.24";

const form = document.querySelector("#create-form");
const createModelPopup = await initModelPopup({
  trigger: document.querySelector("#create-model-trigger"),
  input: form.elements.bike_model,
  label: document.querySelector("#create-model-label"),
  itemType: form.elements.item_type
});

const caseList = document.querySelector("#case-rows");

const newCaseDialog = document.querySelector("#newCaseDialog");
const linkDialog = document.querySelector("#linkDialog");

const createdLink = document.querySelector("#createdLink");
const createdVerificationCode = document.querySelector("#createdVerificationCode");
let lastCreatedPublicId = "";
const dashboardLoader = document.querySelector("#employee-dashboard-loader");
const dashboardSurface = document.querySelector("#employee-data-surface");
let initialDashboardLoad = true;
const createPriceSettings = document.querySelector("#create-price-settings");
const createPriceMode = document.querySelector("#create-service-price-mode");
const createPriceAmountField = document.querySelector("#create-service-price-amount-field");
const internalReferenceToggle = form.elements.use_internal_reference;
const shopifyRefInput = form.elements.shopify_ref;

const CASE_TYPE_META = Object.freeze({
  warranty: {
    label: "Garantiefall",
    subjectLabel: "Garantiefall / Betreff",
    subjectPlaceholder: "Beanstandung oder Fehlerbild",
    service: true,
    serviceLabel: "Zusatzleistung zum Garantiefall",
    noneLabel: "Nur Garantiefall"
  },
  repair: {
    label: "Reparatur",
    subjectLabel: "Reparatur / Fehlerbild",
    subjectPlaceholder: "Was soll repariert werden?",
    service: true,
    serviceLabel: "Zusatzleistung zur Reparatur",
    noneLabel: "Nur Reparatur"
  },
  return: {
    label: "Rückgabe",
    subjectLabel: "Grund der Rückgabe",
    subjectPlaceholder: "Rückgabe kurz beschreiben",
    service: false,
    noneLabel: "Keine Zusatzleistung"
  },
  exchange: {
    label: "Tausch",
    subjectLabel: "Grund für den Tausch",
    subjectPlaceholder: "Tausch kurz beschreiben",
    service: false,
    noneLabel: "Keine Zusatzleistung"
  }
});


function visibleCaseReference(item) {
  return String(item?.shopify_ref || "").trim() || String(item?.public_id || "–").trim() || "–";
}

function syncShopifyReferenceMode() {
  const useInternal = Boolean(internalReferenceToggle?.checked);
  if (!shopifyRefInput) return;

  shopifyRefInput.disabled = useInternal;
  shopifyRefInput.required = !useInternal;
  shopifyRefInput.closest(".flow-shopify-reference-field")?.classList.toggle("is-disabled", useInternal);
  document.querySelector("#internal-reference-exception")?.classList.toggle("is-active", useInternal);

  if (useInternal) shopifyRefInput.value = "";
}

function caseTypeMeta(value) {
  return CASE_TYPE_META[value] || CASE_TYPE_META.warranty;
}

function caseTypeLabel(value) {
  return caseTypeMeta(value).label;
}

function dashboardSubject(item) {
  const raw = String(item?.case_subject || "").trim();
  if (!raw) return "";
  const normalized = raw.toLocaleLowerCase("de-DE").replace(/[\s_-]+/g, "");
  const typeNormalized = caseTypeLabel(item?.case_type).toLocaleLowerCase("de-DE").replace(/[\s_-]+/g, "");
  if (["servicebericht", "servicereport", typeNormalized].includes(normalized)) return "";
  return raw;
}

function parseEuroToCents(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function syncCreatePriceControls() {
  const supportsService = Boolean(caseTypeMeta(new FormData(form).get("case_type")).service && new FormData(form).get("case_type"));
  const serviceChoice = form.elements.service_choice?.value || "";
  const paidService = supportsService && ["inspection", "inspection_wear"].includes(serviceChoice);

  createPriceSettings?.classList.toggle("hidden", !paidService);
  if (!paidService && createPriceMode) createPriceMode.value = "hidden";

  const showAmount = paidService && createPriceMode?.value === "known";
  createPriceAmountField?.classList.toggle("hidden", !showAmount);
  if (form.elements.service_price_eur) {
    form.elements.service_price_eur.required = showAmount;
    if (!showAmount) form.elements.service_price_eur.value = "";
  }
}

function applyCreateCaseType(value = "") {
  const meta = value ? caseTypeMeta(value) : null;
  const subjectLabel = document.querySelector("#create-case-subject-label");
  const subject = document.querySelector("#create-case-subject");
  const serviceField = document.querySelector("#create-service-choice-field");
  const serviceLabel = document.querySelector("#create-service-choice-label");
  const serviceSelect = document.querySelector("#create-service-choice");

  if (subjectLabel) subjectLabel.textContent = meta?.subjectLabel || "Betreff";
  if (subject) subject.placeholder = meta?.subjectPlaceholder || "Kurzbeschreibung";
  if (serviceLabel) serviceLabel.textContent = meta?.serviceLabel || "Zusatzleistung";

  if (serviceSelect) {
    const none = serviceSelect.querySelector('option[value="none"]');
    if (none) none.textContent = meta?.noneLabel || "Keine Zusatzleistung";
    if (meta && !meta.service) serviceSelect.value = "none";
  }

  serviceField?.classList.toggle("hidden", !meta || !meta.service);
  syncCreatePriceControls();
}

document.querySelectorAll('input[name="case_type"]').forEach(input => {
  input.addEventListener("change", () => applyCreateCaseType(input.value));
});

form.elements.service_choice?.addEventListener("change", syncCreatePriceControls);
createPriceMode?.addEventListener("change", syncCreatePriceControls);

function setDashboardLoading(loading, message = "Die aktuelle Übersicht wird synchronisiert.") {
  if (dashboardSurface) dashboardSurface.classList.toggle("is-loading", loading);
  if (dashboardLoader) {
    dashboardLoader.setAttribute("aria-hidden", loading ? "false" : "true");
    const copy = dashboardLoader.querySelector("span:last-child");
    if (copy) copy.textContent = message;
  }
}

function finishDashboardBoot() {
  document.documentElement.classList.remove("employee-booting");
  setDashboardLoading(false);
}


const portalSession = requirePortalSession();
if (!portalSession) {
  await new Promise(() => {});
}

document.querySelector("#logout-button")?.addEventListener("click", () => {
  logoutPortalSession();
  location.replace("login.html");
});


function setAdminText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function openDialog(dialog) {
  if (!dialog?.open) {
    dialog?.showModal();
  }
}

function closeDialog(dialog) {
  if (dialog?.open) {
    dialog.close();
  }
}

document.querySelector("#newCaseButton")?.addEventListener("click", () => {
  openDialog(newCaseDialog);
});

document.querySelector("#sidebarNewCase")?.addEventListener("click", event => {
  event.preventDefault();
  openDialog(newCaseDialog);
});

document.querySelector("#closeDialogButton")?.addEventListener("click", () => {
  closeDialog(newCaseDialog);
});

document.querySelector("#cancelDialogButton")?.addEventListener("click", () => {
  closeDialog(newCaseDialog);
});

document.querySelector("#reload")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  setButtonLoading(button, true, "Aktualisiere …");
  try {
    await renderCases();
  } finally {
    setButtonLoading(button, false);
  }
});

document.querySelector("#closeCreatedLinkDialog")?.addEventListener("click", () => closeDialog(linkDialog));

document.querySelector("#openCreatedCase")?.addEventListener("click", () => {
  if (!lastCreatedPublicId) return;
  location.href = `case.html?id=${encodeURIComponent(lastCreatedPublicId)}`;
});

document.querySelector("#openCreatedLink")?.addEventListener("click", () => {
  if (!lastCreatedPublicId) return;
  location.href = `customer.html?preview=${encodeURIComponent(lastCreatedPublicId)}`;
});

document.querySelector("#copyCreatedCode")?.addEventListener("click", async event => {
  const code = createdVerificationCode?.textContent?.trim();
  if (!code || code.includes("•")) return;
  const button = event.currentTarget;
  setButtonLoading(button, true, "Kopiere …");
  try {
    await navigator.clipboard.writeText(code);
    showSuccess("Verifizierungscode kopiert.", { title: "Kopiert" });
  } finally {
    setButtonLoading(button, false);
  }
});

document.querySelector("#copyCreatedLink")?.addEventListener("click", async () => {
  if (!createdLink.value) return;

  try {
    await navigator.clipboard.writeText(createdLink.value);
    showSuccess("Kundenlink kopiert.", { title: "Kopiert" });
  } catch {
    createdLink.select();
    document.execCommand("copy");
    showSuccess("Kundenlink kopiert.", { title: "Kopiert" });
  }
});

function selectedCaseType() {
  const checked = form.querySelector('input[name="case_type"]:checked');
  return String(checked?.value || "").trim().toLowerCase();
}

function dataFromForm(caseType = selectedCaseType()) {
  const data = new FormData(form);

  return {
    // Read the selected radio directly instead of relying on a second FormData lookup.
    // This also keeps the payload stable if controls are changed/disabled while submitting.
    case_type: caseType,
    shopify_ref: shopifyRefInput?.disabled ? "" : (data.get("shopify_ref")?.trim() || ""),
    use_internal_reference: Boolean(internalReferenceToggle?.checked),
    customer_name: data.get("customer_name")?.trim(),
    bike_model: data.get("bike_model")?.trim(),
    bike_color: data.get("bike_color")?.trim(),
    case_subject: data.get("case_subject")?.trim(),
    item_type: data.get("item_type"),
    required_charger: form.elements.required_charger.checked,
    required_keys: form.elements.required_keys.checked,
    customer_note: data.get("customer_note")?.trim(),
    service_choice: data.get("service_choice"),
    service_price_mode: data.get("service_price_mode") === "known" ? "known" : "hidden",
    service_price_amount_cents: data.get("service_price_mode") === "known"
      ? parseEuroToCents(data.get("service_price_eur"))
      : null
  };
}

internalReferenceToggle?.addEventListener("change", syncShopifyReferenceMode);
syncShopifyReferenceMode();

form.addEventListener("submit", async event => {
  event.preventDefault();

  const customerName = form.elements.customer_name.value.trim();
  const caseType = selectedCaseType();

  if (!CASE_TYPE_META[caseType]) {
    document.querySelector("#create-case-type-picker")?.scrollIntoView({ behavior: "smooth", block: "center" });
    showError("Bitte zuerst Rückgabe, Tausch, Reparatur oder Garantiefall auswählen.", { title: "Vorgangsart fehlt" });
    return;
  }

  if (!internalReferenceToggle?.checked && !shopifyRefInput?.value.trim()) {
    shopifyRefInput?.focus();
    shopifyRefInput?.reportValidity();
    showError("Bitte die Shopify-Auftragsnummer eintragen oder den Ausnahmefall ohne Shopify-Auftrag markieren.", { title: "Auftragsnummer fehlt" });
    return;
  }

  if (!customerName) {
    form.elements.customer_name.focus();
    form.elements.customer_name.reportValidity();
    return;
  }
const submitButton = form.querySelector('button[type="submit"]');
  setButtonLoading(submitButton, true, "Erstelle Link …");
  beginGlobalBusy();

  try {
    const result = await createCase(dataFromForm(caseType));

    if (!result?.customer_url) {
      throw new Error("Das Backend hat keinen Kundenlink zurückgegeben.");
    }

    createdLink.value = result.customer_url;
    lastCreatedPublicId = result.public_id;
    closeDialog(newCaseDialog);
    openDialog(linkDialog);

    createdVerificationCode.textContent =
      result.verification_code || "••••••";

    showSuccess("Link und 6-stelliger Code sind bereit zum Kopieren.", {
      title: "Kundenzugang bereit"
    });

    form.reset();
    syncShopifyReferenceMode();
    applyCreateCaseType("");
    syncCreatePriceControls();
    createModelPopup?.sync();

    await setWorkView(activeWorkView, { updateUrl: false });
    renderCases();
  } catch (error) {
    createdLink.value = "";
    showError(error.message, { title: "Vorgang konnte nicht erstellt werden" });
  } finally {
    setButtonLoading(submitButton, false);
    endGlobalBusy();
  }
});

function serviceStatus(item) {
  if (item.service_status === "resolved") return "completed";

  return item.service_status || (
    item.status === "confirmed"
      ? "customer_confirmed"
      : "waiting_customer"
  );
}

function statusLabel(value) {
  return {
    waiting_customer: "Wartet auf Kunde",
    customer_confirmed: "Bestätigt",
    arrived: "Angekommen",
    in_progress: "In Bearbeitung",
    completed: "Abgeschlossen"
  }[value] || "Wartet auf Kunde";
}

function internalStageInfo(item) {
  const fallback = serviceStatus(item) === "completed"
    ? "completed"
    : serviceStatus(item) === "arrived"
      ? "received"
      : serviceStatus(item) === "in_progress"
        ? "work_in_progress"
        : serviceStatus(item) === "customer_confirmed"
          ? "customer_confirmed"
          : "awaiting_customer";
  const stage = item?.internal_stage || fallback;
  return {
    awaiting_customer: { label: "Wartet auf Kunde", progress: 8 },
    customer_confirmed: { label: "Kunde bestätigt", progress: 18 },
    received: { label: "Eingegangen", progress: 32 },
    diagnosis: { label: "Diagnose", progress: 44 },
    waiting_parts: { label: "Wartet auf Teile", progress: 52 },
    work_in_progress: { label: "In Bearbeitung", progress: 66 },
    quality_check: { label: "Qualitätsprüfung", progress: 80 },
    ready_for_handover: { label: "Abholbereit", progress: 92 },
    completed: { label: "Abgeschlossen", progress: 100 }
  }[stage] || { label: statusLabel(serviceStatus(item)), progress: 20 };
}

function isArchived(item) {
  return serviceStatus(item) === "completed";
}

function updateStats(items) {
  const activeItems = items.filter(item => !isArchived(item));
  const archiveItems = items.filter(isArchived);

  const counts = {
    all: activeItems.length,
    waiting_customer: 0,
    customer_confirmed: 0,
    arrived: 0,
    in_progress: 0
  };

  for (const item of activeItems) {
    const value = serviceStatus(item);
    counts[value] = (counts[value] || 0) + 1;
  }

  setAdminText("stat-total", String(counts.all));
  setAdminText("stat-waiting", String(counts.waiting_customer));
  setAdminText("stat-confirmed", String(counts.customer_confirmed));
  setAdminText("stat-arrived", String(counts.arrived));
  setAdminText("stat-progress", String(counts.in_progress));
  setAdminText("sidebar-active-count", String(activeItems.length));
  setAdminText("sidebar-archive-count", String(archiveItems.length));
}

let activeWorkView =
  new URLSearchParams(location.search).get("view") === "archive"
    ? "archive"
    : "active";
let activeStatusFilter = "all";
let cachedItems = [];
const CASES_PER_PAGE = 15;
let activePage = Math.max(1, Number.parseInt(new URLSearchParams(location.search).get("page") || "1", 10) || 1);

const casePagination = document.querySelector("#case-pagination");
const casePageState = document.querySelector("#case-page-state");
const casePageCount = document.querySelector("#case-page-count");
const casePageButtons = document.querySelector("#case-page-buttons");
const casePagePrev = document.querySelector("#case-page-prev");
const casePageNext = document.querySelector("#case-page-next");

function currentVisibleItems(items = cachedItems) {
  const scopedItems =
    activeWorkView === "archive"
      ? items.filter(isArchived)
      : items.filter(item => !isArchived(item));

  return activeWorkView === "archive" || activeStatusFilter === "all"
    ? scopedItems
    : scopedItems.filter(item => serviceStatus(item) === activeStatusFilter);
}

function paginationSequence(totalPages, currentPage) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const sequence = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) sequence.push("ellipsis-start");
  for (let page = start; page <= end; page += 1) sequence.push(page);
  if (end < totalPages - 1) sequence.push("ellipsis-end");
  sequence.push(totalPages);
  return sequence;
}

function syncPageUrl() {
  const url = new URL(location.href);
  if (activePage > 1) url.searchParams.set("page", String(activePage));
  else url.searchParams.delete("page");
  history.replaceState(null, "", url);
}

function renderPagination(totalItems, totalPages) {
  if (!casePagination) return;

  casePageState.textContent = `Seite ${activePage} von ${totalPages}`;
  casePageCount.textContent = `${totalItems} ${totalItems === 1 ? "Vorgang" : "Vorgänge"} · maximal ${CASES_PER_PAGE} pro Seite`;
  casePagePrev.disabled = activePage <= 1;
  casePageNext.disabled = activePage >= totalPages;
  casePagination.classList.toggle("is-active", totalPages > 1);

  if (casePageButtons) {
    casePageButtons.innerHTML = paginationSequence(totalPages, activePage).map(entry => {
      if (typeof entry !== "number") return '<span class="flow-pagination__ellipsis" aria-hidden="true">•••</span>';
      return `<button class="flow-pagination__page${entry === activePage ? " is-current" : ""}" type="button" data-case-page="${entry}" ${entry === activePage ? 'aria-current="page"' : ""}>${entry}</button>`;
    }).join("");
  }
}

function setCasePage(page, { scrollToList = true } = {}) {
  const totalPages = Math.max(1, Math.ceil(currentVisibleItems().length / CASES_PER_PAGE));
  activePage = Math.min(totalPages, Math.max(1, Number(page) || 1));
  syncPageUrl();
  renderCaseList(cachedItems);

  if (scrollToList) {
    document.querySelector(".flow-case-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

casePagePrev?.addEventListener("click", () => setCasePage(activePage - 1));
casePageNext?.addEventListener("click", () => setCasePage(activePage + 1));
casePageButtons?.addEventListener("click", event => {
  const button = event.target.closest("[data-case-page]");
  if (button) setCasePage(Number(button.dataset.casePage));
});

function updateListSubtitle() {
  const subtitle = document.querySelector("#case-list-subtitle");
  if (!subtitle) return;

  if (activeWorkView === "archive") {
    subtitle.textContent = "Abgeschlossene Servicevorgänge";
    return;
  }

  subtitle.textContent =
    activeStatusFilter === "all"
      ? "Aktive Servicevorgänge"
      : statusLabel(activeStatusFilter);
}

function setWorkView(view, { updateUrl = true } = {}) {
  activeWorkView = view === "archive" ? "archive" : "active";

  document.querySelectorAll("[data-work-view]").forEach(item => {
    item.classList.toggle(
      "is-active",
      item.dataset.workView === activeWorkView
    );
  });

  const activeDashboard = document.querySelector("#active-dashboard");
  activeDashboard?.classList.toggle(
    "hidden",
    activeWorkView === "archive"
  );
  activeDashboard?.closest(".flow-dashboard-section")?.classList.toggle(
    "hidden",
    activeWorkView === "archive"
  );

  if (updateUrl) {
    const url = new URL(location.href);
    if (activeWorkView === "archive") {
      url.searchParams.set("view", "archive");
    } else {
      url.searchParams.delete("view");
    }
    history.replaceState(null, "", url);
  }

  activePage = 1;
  syncPageUrl();
  updateListSubtitle();
  renderCaseList(cachedItems);
  transitionSurface(document.querySelector(".flow-panel"));
  setFlowSidebar(false);
}

document.querySelectorAll("[data-work-view]").forEach(button => {
  button.addEventListener("click", () => {
    setWorkView(button.dataset.workView);
  });
});

document.querySelectorAll("[data-status-filter]").forEach(button => {
  button.addEventListener("click", () => {
    activeStatusFilter = button.dataset.statusFilter;

    document.querySelectorAll("[data-status-filter]").forEach(item => {
      item.classList.toggle("is-active", item === button);
    });

    activePage = 1;
    syncPageUrl();
    updateListSubtitle();
    renderCaseList(cachedItems);
    transitionSurface(document.querySelector(".flow-panel"));
  });
});

function renderCaseList(items) {
  const visibleItems = currentVisibleItems(items);
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / CASES_PER_PAGE));
  activePage = Math.min(totalPages, Math.max(1, activePage));
  syncPageUrl();
  const pageStart = (activePage - 1) * CASES_PER_PAGE;
  const pageItems = visibleItems.slice(pageStart, pageStart + CASES_PER_PAGE);
  renderPagination(visibleItems.length, totalPages);

  if (!visibleItems.length) {
    caseList.innerHTML = `
      <div class="flow-case-row flow-case-row--empty">
        <div class="flow-case-main">
          <strong>${
            activeWorkView === "archive"
              ? "Noch keine archivierten Vorgänge."
              : "Keine Vorgänge in diesem Bereich."
          }</strong>
          <span>${
            activeWorkView === "archive"
              ? "Abgeschlossene Vorgänge erscheinen automatisch hier."
              : "Wähle oben einen anderen Bereich."
          }</span>
        </div>
      </div>
    `;
    return;
  }

  caseList.innerHTML = pageItems.map(item => {
    const currentStatus = serviceStatus(item);
    const stage = internalStageInfo(item);

    return `
      <div class="flow-case-row">
        <a class="flow-case-row__open" href="case.html?id=${encodeURIComponent(item.public_id)}" aria-label="${item.customer_name || "Vorgang"} öffnen"></a>
        <div class="flow-case-main">
          <strong>${item.customer_name || "Unbekannter Kunde"}</strong>
          <span class="flow-reference-tag">${visibleCaseReference(item)}</span>
        </div>

        <div class="flow-case-kind">
          <strong>Vorgangsart</strong>
          <div class="flow-case-tag-row">
            <span class="flow-case-tag">${caseTypeLabel(item.case_type)}</span>
            ${dashboardSubject(item) ? `<span class="flow-case-tag flow-case-tag--subject">${dashboardSubject(item)}</span>` : ""}
          </div>
        </div>

        <div class="flow-case-meta">
          <strong>Artikel</strong>
          <div class="flow-case-tag-row">
            <span class="flow-case-tag">${item.bike_model || (item.item_type === "battery" ? "Akku" : "Fahrrad")}</span>
          </div>
        </div>

        <span class="flow-status flow-status--${currentStatus}" title="Interner Bearbeitungsstand">
          <span>${stage.label}</span>
          <span class="flow-status-progress" aria-hidden="true"><i style="width:${stage.progress}%"></i></span>
        </span>

        <span class="flow-case-actions">
          <a class="flow-case-open-button" href="case.html?id=${encodeURIComponent(item.public_id)}" aria-label="${item.customer_name || "Vorgang"} öffnen">
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M7.25 4.75 12.5 10l-5.25 5.25"/>
            </svg>
          </a>
        </span>
      </div>
    `;
  }).join("");
  transitionSurface(caseList);
}

async function renderCases() {
  setDashboardLoading(true, initialDashboardLoad
    ? "Die aktuelle Übersicht wird synchronisiert."
    : "Vorgänge werden aktualisiert.");

  if (initialDashboardLoad) renderCaseSkeleton(caseList, 5);

  try {
    const { items } = await listCases();
    cachedItems = items;
    updateStats(items);
    document.querySelectorAll(".flow-dashboard-card strong").forEach(pulseElement);
    updateListSubtitle();
    renderCaseList(items);
  } catch (error) {
    caseList.innerHTML = `<div class="flow-case-row flow-case-row--error"><div class="flow-case-main"><strong>Vorgänge konnten nicht geladen werden</strong><span>${error.message}</span></div></div>`;
  } finally {
    if (initialDashboardLoad) {
      initialDashboardLoad = false;
      requestAnimationFrame(() => requestAnimationFrame(finishDashboardBoot));
    } else {
      setDashboardLoading(false);
    }
  }
}

const dashboardFilterSection = document.querySelector(".flow-dashboard-section");
const dashboardFilterSentinel = document.querySelector("#dashboard-filter-sentinel");
const employeeTopbar = document.querySelector(".flow-topbar");
let dashboardScrollFrame = 0;
let dashboardCompactState = false;
let dashboardCollapseAt = Number.POSITIVE_INFINITY;
let dashboardExpandAt = 0;
let dashboardThresholdsReady = false;

function measureDashboardFilterThresholds() {
  if (!dashboardFilterSection || !dashboardFilterSentinel || window.innerWidth <= 860) {
    dashboardThresholdsReady = false;
    return;
  }

  const stickyTop = Math.round((employeeTopbar?.getBoundingClientRect().height || 62) + 10);
  const sentinelDocumentTop = window.scrollY + dashboardFilterSentinel.getBoundingClientRect().top;
  const stickyStart = Math.max(0, sentinelDocumentTop - stickyTop);

  // V7.15.27: the dashboard intro was removed, so the filter now reaches the
  // sticky edge almost immediately. A fixed hysteresis window prevents tiny
  // trackpad movements around that edge from toggling compact mode repeatedly.
  dashboardCollapseAt = stickyStart + 44;
  dashboardExpandAt = stickyStart + 12;
  dashboardThresholdsReady = true;
  dashboardFilterSection.style.setProperty("--dashboard-sticky-top", `${stickyTop}px`);
}

function syncDashboardFilterState() {
  dashboardScrollFrame = 0;
  if (!dashboardFilterSection) return;

  if (window.innerWidth <= 860 || dashboardFilterSection.classList.contains("hidden")) {
    dashboardCompactState = false;
    dashboardFilterSection.classList.remove("is-compact");
    dashboardThresholdsReady = false;
    return;
  }

  if (!dashboardThresholdsReady) measureDashboardFilterThresholds();

  const scrollY = Math.max(0, window.scrollY || 0);
  const shouldCompact = dashboardCompactState
    ? scrollY > dashboardExpandAt
    : scrollY >= dashboardCollapseAt;

  if (shouldCompact !== dashboardCompactState) {
    dashboardCompactState = shouldCompact;
    dashboardFilterSection.classList.toggle("is-compact", shouldCompact);
  }
}

function requestDashboardFilterSync() {
  if (dashboardScrollFrame) return;
  dashboardScrollFrame = requestAnimationFrame(syncDashboardFilterState);
}

function refreshDashboardFilterThresholds() {
  dashboardThresholdsReady = false;
  requestDashboardFilterSync();
}

window.addEventListener("scroll", requestDashboardFilterSync, { passive: true });
window.addEventListener("resize", refreshDashboardFilterThresholds);
window.addEventListener("pageshow", refreshDashboardFilterThresholds);
requestAnimationFrame(() => requestAnimationFrame(refreshDashboardFilterThresholds));

renderCases();






const flowSidebar = document.querySelector("#flowSidebar");
const flowBackdrop = document.querySelector("#flowBackdrop");
const mobileMenuButton = document.querySelector("#mobileMenuButton");

function setFlowSidebar(open) {
  flowSidebar?.classList.toggle("is-open", open);
  flowBackdrop?.classList.toggle("is-open", open);
  document.body.style.overflow = open ? "hidden" : "";
}

mobileMenuButton?.addEventListener("click", () => setFlowSidebar(true));
flowBackdrop?.addEventListener("click", () => setFlowSidebar(false));


