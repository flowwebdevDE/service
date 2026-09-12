import {
  adminCasePdfUrl,
  deleteAdminCase,
  getAdminCase,
  updateAdminCase,
  updateAdminCaseStatus,
  logoutPortalSession,
  requirePortalSession
} from "./api.js?v=7.5";

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
const notice = document.querySelector("#notice");
const readonly = document.querySelector("#readonly");
const serviceStatusSelect = document.querySelector("#service-status-select");
const serviceStatusLabel = document.querySelector("#service-status-label");
const deleteDialog = document.querySelector("#deleteCaseDialog");
const deleteConfirmInput = document.querySelector("#delete-confirm-id");
const confirmDeleteButton = document.querySelector("#confirmDeleteCase");
let currentItem = null;


function statusLabel(value) {
  return {
    waiting_customer: "Wartet auf Kunde",
    customer_confirmed: "Vom Kunden bestätigt",
    in_progress: "In Bearbeitung",
    resolved: "Abgeschlossen"
  }[value] || "Wartet auf Kunde";
}

function renderServiceStatus(value) {
  const status = value || "waiting_customer";
  serviceStatusSelect.value = status;
  if (serviceStatusLabel) serviceStatusLabel.textContent = statusLabel(status);

  const panel = document.querySelector(".flow-status-panel");
  panel.dataset.status = status;
}

function collect() {
  return {
    customer_name: form.elements.customer_name.value.trim(),
    customer_email: form.elements.customer_email.value.trim(),
    bike_model: form.elements.bike_model.value.trim(),
    bike_color: form.elements.bike_color.value.trim(),
    case_subject: form.elements.case_subject.value.trim(),
    item_type: form.elements.item_type.value,
    required_charger: form.elements.required_charger.checked,
    required_keys: form.elements.required_keys.checked,
    key_count: Number(form.elements.key_count.value || 0),
    staff_note: form.elements.staff_note.value.trim(),
    customer_note: form.elements.customer_note.value.trim(),
    service_choice: form.elements.service_choice.value
  };
}

function fill(item) {
  document.querySelector("#case-title")?.replaceChildren(document.createTextNode(item.public_id));
  document.querySelector("#sidebarCaseRef")?.replaceChildren(document.createTextNode(item.shopify_ref));
  document.querySelector("#shopify-ref")?.replaceChildren(document.createTextNode(item.shopify_ref));
  renderServiceStatus(item.service_status);

  for (const name of [
    "customer_name",
    "customer_email",
    "bike_model",
    "bike_color",
    "case_subject",
    "item_type",
    "key_count",
    "staff_note",
    "customer_note",
    "service_choice"
  ]) {
    form.elements[name].value = item[name] ?? "";
  }

  form.elements.required_charger.checked = Boolean(item.required_charger);
  form.elements.required_keys.checked = Boolean(item.required_keys);

  currentItem = item;

  const saveButton = document.querySelector("#save");

  if (item.status === "confirmed") {
    readonly.classList.remove("hidden");

    for (const element of form.elements) {
      element.disabled = element.name !== "staff_note";
    }

    if (saveButton) {
      saveButton.classList.remove("hidden");
      saveButton.textContent = "Interne Notiz speichern";
    }
  } else {
    readonly.classList.add("hidden");

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

  try {
    const updated = await updateAdminCase(id, collect());
    fill(updated);
    notice.textContent = "Gespeichert.";
    notice.className = "notice notice--success";
    notice.classList.remove("hidden");
  } catch (error) {
    notice.textContent = error.message;
    notice.className = "notice notice--danger";
    notice.classList.remove("hidden");
  }
});

try {
  const item = await getAdminCase(id);
  fill(item);
} catch (error) {
  notice.textContent = error.message;
  notice.className = "notice notice--danger";
    notice.classList.remove("hidden");
}


serviceStatusSelect?.addEventListener("change", async () => {
  const next = serviceStatusSelect.value;
  serviceStatusSelect.disabled = true;

  try {
    const item = await updateAdminCaseStatus(id, next);
    renderServiceStatus(item.service_status);

    notice.textContent = "Garantiefall-Status aktualisiert.";
    notice.className = "notice notice--success";
    notice.classList.remove("hidden");
  } catch (error) {
    notice.textContent = error.message;
    notice.className = "notice notice--danger";
    notice.classList.remove("hidden");

    try {
      const item = await getAdminCase(id);
      renderServiceStatus(item.service_status);
    } catch {}
  } finally {
    serviceStatusSelect.disabled = false;
  }
});


document.querySelector("#internal-print")?.addEventListener("click", async event => {
  event.preventDefault();

  const button = event.currentTarget;

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

    notice.textContent = error.message;
    notice.className = "notice notice--danger";
    notice.classList.remove("hidden");
  }
});


document.querySelector("#delete-case")?.addEventListener("click", () => {
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

  confirmDeleteButton.disabled = true;
  confirmDeleteButton.textContent = "Wird gelöscht …";

  try {
    await deleteAdminCase(currentItem.public_id);
    location.replace("index.html");
  } catch (error) {
    notice.textContent = error.message;
    notice.className = "notice notice--danger";
    notice.classList.remove("hidden");
    closeDeleteDialog();
  } finally {
    confirmDeleteButton.textContent = "Endgültig löschen";
  }
});
