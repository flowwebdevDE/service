let bannerCounter = 0;

function activeHost() {
  const openDialogs = Array.from(document.querySelectorAll("dialog[open]"));
  return openDialogs.at(-1) || document.body;
}

function stack() {
  const host = activeHost();
  let element = host.querySelector?.(":scope > .flow-banner-stack") || null;

  if (!element) {
    element = document.createElement("div");
    element.className = "flow-banner-stack";
    element.setAttribute("aria-live", "polite");
    element.setAttribute("aria-relevant", "additions");
    host.appendChild(element);
  }

  return element;
}

function typeLabel(type) {
  if (type === "success") return "Erledigt";
  if (type === "error") return "Hinweis";
  if (type === "warning") return "Achtung";
  return "Info";
}

export function dismissBanner(id) {
  const banner = document.querySelector(`[data-flow-banner-id="${CSS.escape(String(id))}"]`);
  if (!banner || banner.classList.contains("is-leaving")) return;

  banner.classList.add("is-leaving");

  window.setTimeout(() => {
    const container = banner.parentElement;
    banner.remove();
    if (container?.classList.contains("flow-banner-stack") && !container.children.length) {
      container.remove();
    }
  }, 180);
}

export function showBanner(message, {
  type = "info",
  title = "",
  duration = 3600,
  id = "",
  actionLabel = "",
  onAction = null
} = {}) {
  const text = String(message || "").trim();
  if (!text) return null;

  const bannerId = id || `flow-banner-${++bannerCounter}`;

  if (id) {
    document.querySelector(
      `[data-flow-banner-id="${CSS.escape(String(id))}"]`
    )?.remove();
  }

  const banner = document.createElement("div");
  banner.className = `flow-banner flow-banner--${type}`;
  banner.dataset.flowBannerId = bannerId;
  banner.setAttribute("role", type === "error" ? "alert" : "status");

  const marker = document.createElement("span");
  marker.className = "flow-banner__marker";
  marker.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  content.className = "flow-banner__content";

  const heading = document.createElement("strong");
  heading.className = "flow-banner__title";
  heading.textContent = title || typeLabel(type);

  const body = document.createElement("span");
  body.className = "flow-banner__message";
  body.textContent = text;

  content.append(heading, body);

  if (actionLabel && typeof onAction === "function") {
    const action = document.createElement("button");
    action.className = "flow-banner__action";
    action.type = "button";
    action.textContent = actionLabel;
    action.addEventListener("click", () => {
      dismissBanner(bannerId);
      onAction();
    });
    content.append(action);
  }

  const close = document.createElement("button");
  close.className = "flow-banner__close";
  close.type = "button";
  close.setAttribute("aria-label", "Meldung schließen");
  close.textContent = "×";
  close.addEventListener("click", () => dismissBanner(bannerId));

  banner.append(marker, content, close);
  stack().appendChild(banner);

  requestAnimationFrame(() => banner.classList.add("is-visible"));

  if (duration > 0) {
    window.setTimeout(() => dismissBanner(bannerId), duration);
  }

  return bannerId;
}

export function showSuccess(message, options = {}) {
  return showBanner(message, { ...options, type: "success" });
}

export function showError(message, options = {}) {
  return showBanner(message, {
    duration: 5600,
    ...options,
    type: "error"
  });
}

export function showWarning(message, options = {}) {
  return showBanner(message, {
    duration: 5200,
    ...options,
    type: "warning"
  });
}

export function showInfo(message, options = {}) {
  return showBanner(message, { ...options, type: "info" });
}
