import {
  createCase,
  listCases,
  logoutPortalSession,
  requirePortalSession
} from "./api.js?v=7.4.2";

const form = document.querySelector("#create-form");
const caseList = document.querySelector("#case-rows");

const newCaseDialog = document.querySelector("#newCaseDialog");
const linkDialog = document.querySelector("#linkDialog");

const createdLink = document.querySelector("#createdLink");

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

document.querySelector("#copyCreatedLink")?.addEventListener("click", async () => {
  if (!createdLink.value) return;

  try {
    await navigator.clipboard.writeText(createdLink.value);
  } catch {
    createdLink.select();
    document.execCommand("copy");
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
    key_count: Number(data.get("key_count") || 0),
    staff_note: data.get("staff_note")?.trim(),
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
  submitButton.disabled = true;

  try {
    const result = await createCase(dataFromForm());

    if (!result?.customer_url) {
      throw new Error("Das Backend hat keinen Kundenlink zurückgegeben.");
    }

    createdLink.value = result.customer_url;
    closeDialog(newCaseDialog);
    openDialog(linkDialog);
    form.reset();

    await renderCases();
  } catch (error) {
    createdLink.value = "";
    alert(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

function serviceStatus(item) {
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
    in_progress: "In Bearbeitung",
    resolved: "Abgeschlossen"
  }[value] || "Wartet auf Kunde";
}

function updateStats(items) {
  const counts = {
    all: items.length,
    waiting_customer: 0,
    customer_confirmed: 0,
    in_progress: 0,
    resolved: 0
  };

  items.forEach(item => {
    const value = serviceStatus(item);
    counts[value] = (counts[value] || 0) + 1;
  });

  setAdminText("stat-total", String(counts.all));
  setAdminText("stat-waiting", String(counts.waiting_customer));
  setAdminText("stat-confirmed", String(counts.customer_confirmed));
  setAdminText("stat-progress", String(counts.in_progress));
  setAdminText("stat-resolved", String(counts.resolved));
}

let activeStatusFilter = "all";
let cachedItems = [];

document.querySelectorAll("[data-status-filter]").forEach(button => {
  button.addEventListener("click", () => {
    activeStatusFilter = button.dataset.statusFilter;

    document.querySelectorAll("[data-status-filter]").forEach(item => {
      item.classList.toggle("is-active", item === button);
    });

    const subtitle = document.querySelector("#case-list-subtitle");
    if (subtitle) {
      subtitle.textContent =
        activeStatusFilter === "all"
          ? "Alle Garantiefälle"
          : statusLabel(activeStatusFilter);
    }

    renderCaseList(cachedItems);
  });
});

function renderCaseList(items) {
  if (!items.length) {
    caseList.innerHTML = `
      <div class="flow-case-row flow-case-row--empty">
        <div class="flow-case-main">
          <strong>Noch keine Vorgänge.</strong>
        </div>
      </div>
    `;
    return;
  }

  const visibleItems = activeStatusFilter === "all"
    ? items
    : items.filter(item => serviceStatus(item) === activeStatusFilter);

  if (!visibleItems.length) {
    caseList.innerHTML = `
      <div class="flow-case-row flow-case-row--empty">
        <div class="flow-case-main">
          <strong>Keine Vorgänge in diesem Status</strong>
          <span>Wähle oben einen anderen Bereich.</span>
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
  caseList.innerHTML = `<div class="flow-case-row"><div class="flow-case-main"><strong>Lade Vorgänge …</strong></div></div>`;

  try {
const { items } = await listCases();
    cachedItems = items;
    updateStats(items);

    if (!items.length) {
      caseList.innerHTML = `<div class="flow-case-row"><div class="flow-case-main"><strong>Noch keine Vorgänge.</strong></div></div>`;
      return;
    }

    cachedItems = items;
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

document.querySelector('[data-nav="cases"]')?.addEventListener("click", () => {
  document.querySelector("#cases")?.scrollIntoView({ behavior: "smooth" });
  setFlowSidebar(false);
});

const requiredKeysToggle = form?.elements?.required_keys;
const keyCountField = document.querySelector("#keyCountField");

function syncKeyCountVisibility() {
  if (!requiredKeysToggle || !keyCountField) return;

  keyCountField.style.display = requiredKeysToggle.checked ? "" : "none";

  if (!requiredKeysToggle.checked) {
    form.elements.key_count.value = "0";
  }
}

requiredKeysToggle?.addEventListener("change", syncKeyCountVisibility);
syncKeyCountVisibility();
