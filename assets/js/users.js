import {
  createPortalUser,
  deletePortalUser,
  getCurrentPortalUser,
  listPortalUsers,
  logoutPortalSession,
  requirePortalSession,
  updatePortalUser
} from "./api-oauth-core.js?v=7.15.47";
import { showError, showSuccess } from "./banner.js?v=7.15.24";
import { setButtonLoading } from "./motion.js?v=7.11.0";

const session = requirePortalSession();
if (!session) await new Promise(() => {});

const listElement = document.querySelector("#users-list");
const emptyElement = document.querySelector("#users-empty");
const searchInput = document.querySelector("#users-search");
const newDialog = document.querySelector("#new-user-dialog");
const newForm = document.querySelector("#new-user-form");
const deleteDialog = document.querySelector("#delete-user-dialog");
let users = [];
let currentUser = null;
let deleteTarget = null;
let activeFilter = "all";

function initials(user) {
  const source = String(user.display_name || user.email || "MA").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts.length >= 2 ? `${parts[0][0]}${parts.at(-1)[0]}` : source.slice(0, 2)).toUpperCase();
}

function formatDate(value, fallback = "Noch nie") {
  if (!value) return fallback;
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return "–";
  }
}

function roleLabel(value) { return value === "admin" ? "Administrator" : "Mitarbeiter"; }

function safeAvatarUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "googleusercontent.com" || host.endsWith(".googleusercontent.com")) ? url.href : "";
  } catch {
    return "";
  }
}

function avatarMarkup(user) {
  const avatarUrl = safeAvatarUrl(user.avatar_url);
  if (!avatarUrl) return `<span class="flow-user-avatar__fallback">${escapeHtml(initials(user))}</span>`;
  return `<img src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-user-avatar-image><span class="flow-user-avatar__fallback" hidden>${escapeHtml(initials(user))}</span>`;
}

function updateStats() {
  const active = users.filter(user => user.status === "active").length;
  const admins = users.filter(user => user.status === "active" && user.role === "admin").length;
  const pending = users.filter(user => !user.has_google_account).length;
  const disabled = users.filter(user => user.status === "disabled").length;
  document.querySelector("#users-stat-active").textContent = active;
  document.querySelector("#users-stat-admins").textContent = admins;
  document.querySelector("#users-stat-pending").textContent = pending;
  document.querySelector("#users-stat-disabled").textContent = disabled;
}

function matchesFilter(user) {
  if (activeFilter === "active") return user.status === "active";
  if (activeFilter === "admins") return user.role === "admin" && user.status === "active";
  if (activeFilter === "pending") return !user.has_google_account;
  if (activeFilter === "disabled") return user.status === "disabled";
  return true;
}

function identityStatus(user) {
  if (user.status === "disabled") return { label: "Deaktiviert", cls: "is-disabled" };
  if (!user.has_google_account) return { label: "Noch nicht angemeldet", cls: "is-pending" };
  return { label: "Google verbunden", cls: "is-connected" };
}

function userCard(user) {
  const card = document.createElement("article");
  card.className = `flow-user-card${user.status === "disabled" ? " is-disabled" : ""}`;
  card.dataset.userId = user.id;
  const self = currentUser?.id === user.id;
  const state = identityStatus(user);
  const displayName = user.display_name || user.email.split("@")[0];

  card.innerHTML = `
    <div class="flow-user-card__identity">
      <span class="flow-user-avatar${safeAvatarUrl(user.avatar_url) ? " has-photo" : ""}">${avatarMarkup(user)}</span>
      <div class="flow-user-card__identity-copy">
        <div class="flow-user-name-line"><strong>${escapeHtml(displayName)}</strong>${self ? '<span class="flow-user-self">Du</span>' : ""}</div>
        <span class="flow-user-email">${escapeHtml(user.email)}</span>
        <div class="flow-user-badges"><span class="flow-user-badge ${state.cls}"><i></i>${state.label}</span><span class="flow-user-badge is-role">${roleLabel(user.role)}</span></div>
      </div>
    </div>
    <div class="flow-user-card__facts">
      <div><span>Letzter Login</span><strong>${escapeHtml(formatDate(user.last_login_at))}</strong></div>
      <div><span>Freigeschaltet</span><strong>${escapeHtml(formatDate(user.created_at, "–"))}</strong></div>
    </div>
    <div class="flow-user-card__controls">
      <label class="flow-user-role-control"><span>Rolle</span><select data-user-role ${self ? "disabled" : ""}><option value="staff" ${user.role === "staff" ? "selected" : ""}>Mitarbeiter</option><option value="admin" ${user.role === "admin" ? "selected" : ""}>Administrator</option></select></label>
      <button class="flow-user-status ${user.status === "active" ? "is-active" : ""}" type="button" data-user-status ${self ? "disabled" : ""} aria-pressed="${user.status === "active"}"><i></i><span>${user.status === "active" ? "Aktiv" : "Deaktiviert"}</span></button>
      <button class="flow-user-delete" type="button" data-user-delete ${self ? "disabled" : ""} aria-label="${escapeHtml(displayName)} entfernen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M8 10v7M12 10v7M16 10v7M6 7l1 14h10l1-14"/></svg></button>
    </div>`;

  card.querySelector("[data-user-avatar-image]")?.addEventListener("error", event => {
    event.currentTarget.hidden = true;
    event.currentTarget.nextElementSibling.hidden = false;
    event.currentTarget.closest(".flow-user-avatar")?.classList.remove("has-photo");
  });

  const roleSelect = card.querySelector("[data-user-role]");
  roleSelect?.addEventListener("change", async () => {
    roleSelect.disabled = true;
    try {
      const updated = await updatePortalUser(user.id, { role: roleSelect.value, status: user.status });
      users = users.map(item => item.id === updated.id ? updated : item);
      showSuccess(`${updated.email} ist jetzt ${roleLabel(updated.role)}.`, { title: "Rolle aktualisiert" });
      render();
    } catch (error) {
      roleSelect.value = user.role;
      showError(error.message, { title: "Rolle konnte nicht geändert werden" });
      roleSelect.disabled = false;
    }
  });

  card.querySelector("[data-user-status]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    const nextStatus = user.status === "active" ? "disabled" : "active";
    try {
      const updated = await updatePortalUser(user.id, { role: user.role, status: nextStatus });
      users = users.map(item => item.id === updated.id ? updated : item);
      showSuccess(nextStatus === "active" ? "Der Benutzer ist wieder freigeschaltet." : "Der Benutzer wurde deaktiviert.", { title: "Zugriff aktualisiert" });
      render();
    } catch (error) {
      showError(error.message, { title: "Zugriff konnte nicht geändert werden" });
      button.disabled = false;
    }
  });

  card.querySelector("[data-user-delete]")?.addEventListener("click", () => {
    deleteTarget = user;
    document.querySelector("#delete-user-title").textContent = `${displayName} entfernen?`;
    deleteDialog.showModal();
  });

  return card;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
}

function render() {
  const query = String(searchInput?.value || "").trim().toLowerCase();
  const filtered = users.filter(user => {
    const searchable = `${user.display_name || ""} ${user.email} ${roleLabel(user.role)}`.toLowerCase();
    return searchable.includes(query) && matchesFilter(user);
  });
  listElement.replaceChildren(...filtered.map(userCard));
  emptyElement.hidden = filtered.length > 0;
  document.querySelector("#users-list-subtitle").textContent = `${filtered.length} von ${users.length} ${users.length === 1 ? "Konto" : "Konten"}`;
  updateStats();
}

async function reload() {
  try {
    currentUser = await getCurrentPortalUser();
    if (currentUser.role !== "admin") {
      location.replace("profile.html");
      return;
    }
    users = await listPortalUsers();
    render();
  } catch (error) {
    showError(error.message, { title: "Benutzerverwaltung nicht verfügbar" });
  }
}

searchInput?.addEventListener("input", render);
document.querySelectorAll("[data-users-filter]").forEach(button => button.addEventListener("click", () => {
  activeFilter = button.dataset.usersFilter || "all";
  document.querySelectorAll("[data-users-filter]").forEach(item => item.classList.toggle("is-active", item === button));
  render();
}));

document.querySelector("#new-user-button")?.addEventListener("click", () => { newForm.reset(); newDialog.showModal(); });
document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`)?.close()));

newForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = newForm.querySelector('button[type="submit"]');
  const data = new FormData(newForm);
  setButtonLoading(submit, true, "Wird freigeschaltet …");
  try {
    const user = await createPortalUser({ email: data.get("email"), role: data.get("role") });
    users.push(user);
    newDialog.close();
    showSuccess(`${user.email} kann sich jetzt mit Google anmelden.`, { title: "Benutzer freigeschaltet" });
    render();
  } catch (error) {
    showError(error.message, { title: "Benutzer konnte nicht angelegt werden" });
  } finally {
    setButtonLoading(submit, false);
  }
});

document.querySelector("#confirm-delete-user")?.addEventListener("click", async event => {
  event.preventDefault();
  if (!deleteTarget) return;
  const button = event.currentTarget;
  setButtonLoading(button, true, "Wird entfernt …");
  try {
    await deletePortalUser(deleteTarget.id);
    users = users.filter(user => user.id !== deleteTarget.id);
    deleteDialog.close();
    showSuccess("Der Benutzer wurde aus dem Serviceportal entfernt.", { title: "Benutzer entfernt" });
    deleteTarget = null;
    render();
  } catch (error) {
    showError(error.message, { title: "Benutzer konnte nicht entfernt werden" });
  } finally {
    setButtonLoading(button, false);
  }
});

function logout() { logoutPortalSession(); location.replace("login.html"); }
document.querySelector("#logout-button")?.addEventListener("click", logout);

reload();
