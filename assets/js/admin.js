import {
  createCase,
  listCases,
  logoutPortalSession,
  requirePortalSession
} from "./api.js?v=7.10.5";
import { initModelPopup } from "./model-picker.js?v=7.6.1";
import { setButtonLoading, renderCaseSkeleton, pulseElement } from "./motion.js?v=7.9";
import { showError, showInfo, showSuccess } from "./banner.js?v=7.10.6";

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

document.querySelector("#reload")?.addEventListener("click", renderCases);

document.querySelector("#openCreatedLink")?.addEventListener("click", () => {
  if (createdLink.value) {
    window.open(createdLink.value, "_blank", "noopener");
  }
});

document.querySelector("#copyCreatedCode")?.addEventListener("click", async () => {
  const code = createdVerificationCode?.textContent?.trim();
  if (!code || code.includes("•")) return;
  await navigator.clipboard.writeText(code);
  showSuccess("Verifizierungscode kopiert.", { title: "Kopiert" });
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

function dataFromForm() {
  const data = new FormData(form);

  return {
    shopify_ref: data.get("shopify_ref")?.trim(),
    customer_name: data.get("customer_name")?.trim(),
    customer_email: data.get("customer_email")?.trim(),
    bike_model: data.get("bike_model")?.trim(),
    bike_color: data.get("bike_color")?.trim(),
    case_subject: data.get("case_subject")?.trim(),
    item_type: data.get("item_type"),
    required_charger: form.elements.required_charger.checked,
    required_keys: form.elements.required_keys.checked,
    customer_note: data.get("customer_note")?.trim(),
    service_choice: data.get("service_choice")
  };
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  const customerName = form.elements.customer_name.value.trim();

  if (!customerName) {
    form.elements.customer_name.focus();
    form.elements.customer_name.reportValidity();
    return;
  }
const submitButton = form.querySelector('button[type="submit"]');
  setButtonLoading(submitButton, true, "Erstelle Link …");

  try {
    const result = await createCase(dataFromForm());

    if (!result?.customer_url) {
      throw new Error("Das Backend hat keinen Kundenlink zurückgegeben.");
    }

    createdLink.value = result.customer_url;
    lastCreatedPublicId = result.public_id;
    showInfo("Link und Code wurden erzeugt.", {
      title: "Kundenzugang bereit"
    });
    closeDialog(newCaseDialog);
    openDialog(linkDialog);

    createdVerificationCode.textContent =
      result.verification_code || "••••••";

    showSuccess("Link und 6-stelliger Code sind bereit zum Kopieren.", {
      title: "Kundenzugang bereit"
    });

    form.reset();
    createModelPopup?.sync();

    await setWorkView(activeWorkView, { updateUrl: false });
    renderCases();
  } catch (error) {
    createdLink.value = "";
    showError(error.message, { title: "Vorgang konnte nicht erstellt werden" });
  } finally {
    setButtonLoading(submitButton, false);
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

function updateListSubtitle() {
  const subtitle = document.querySelector("#case-list-subtitle");
  if (!subtitle) return;

  if (activeWorkView === "archive") {
    subtitle.textContent = "Zurückgesendete / abgeschlossene Vorgänge";
    return;
  }

  subtitle.textContent =
    activeStatusFilter === "all"
      ? "Aktive Garantiefälle"
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

  document.querySelector("#active-dashboard")?.classList.toggle(
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

  updateListSubtitle();
  renderCaseList(cachedItems);
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

    updateListSubtitle();
    renderCaseList(cachedItems);
  });
});

function renderCaseList(items) {
  const scopedItems =
    activeWorkView === "archive"
      ? items.filter(isArchived)
      : items.filter(item => !isArchived(item));

  const visibleItems =
    activeWorkView === "archive" || activeStatusFilter === "all"
      ? scopedItems
      : scopedItems.filter(item => serviceStatus(item) === activeStatusFilter);

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
              ? "Nach dem Rückversand abgeschlossene Aufträge erscheinen automatisch hier."
              : "Wähle oben einen anderen Bereich."
          }</span>
        </div>
      </div>
    `;
    return;
  }

  caseList.innerHTML = visibleItems.map(item => {
    const currentStatus = serviceStatus(item);

    return `
      <a class="flow-case-row" href="case.html?id=${encodeURIComponent(item.public_id)}">
        <div class="flow-case-main">
          <strong>${item.customer_name || "Unbekannter Kunde"}</strong>
          <span>${item.shopify_ref} · ${item.case_subject || "Kein Betreff"}</span>
        </div>

        <div class="flow-case-meta">
          <strong>${item.bike_model || (item.item_type === "battery" ? "Akku" : "Fahrrad")}</strong>
          <span>${item.item_type === "battery" ? "Akku" : "Fahrrad"}</span>
        </div>

        <span class="flow-status flow-status--${currentStatus}">
          ${statusLabel(currentStatus)}
        </span>

        <span class="flow-case-arrow">›</span>
      </a>
    `;
  }).join("");
}

async function renderCases() {
  renderCaseSkeleton(caseList, 5);

  try {
    const { items } = await listCases();
    cachedItems = items;
    updateStats(items);
    document.querySelectorAll(".flow-dashboard-card strong").forEach(pulseElement);
    updateListSubtitle();
    renderCaseList(items);
  } catch (error) {
    caseList.innerHTML = `<div class="flow-case-row"><div class="flow-case-main"><strong>Fehler</strong><span>${error.message}</span></div></div>`;
  }
}

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


