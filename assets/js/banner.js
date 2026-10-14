const STACK_ID = "flow-banner-stack";
let bannerCounter = 0;

function stack() {
  let element = document.getElementById(STACK_ID);

  if (!element) {
    element = document.createElement("div");
    element.id = STACK_ID;
    element.className = "flow-banner-stack";
    element.setAttribute("aria-live", "polite");
    element.setAttribute("aria-relevant", "additions");
    document.body.appendChild(element);
  }

  return element;
}

function typeLabel(type) {
  if (type === "success") return "Erledigt";
  if (type === "error") return "Hinweis";
  return "Info";
}

export function dismissBanner(id) {
  const banner = document.querySelector(`[data-flow-banner-id="${CSS.escape(String(id))}"]`);
  if (!banner || banner.classList.contains("is-leaving")) return;

  banner.classList.add("is-leaving");

  window.setTimeout(() => {
    banner.remove();
    const container = document.getElementById(STACK_ID);
    if (container && !container.children.length) container.remove();
  }, 220);
}

export function showBanner(message, {
  type = "info",
  title = "",
  duration = 3400,
  id = ""
} = {}) {
  const text = String(message || "").trim();
  if (!text) return null;

  const bannerId = id || `flow-banner-${++bannerCounter}`;

  if (id) {
    const existing = document.querySelector(
      `[data-flow-banner-id="${CSS.escape(String(id))}"]`
    );
    existing?.remove();
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

  const close = document.createElement("button");
  close.className = "flow-banner__close";
  close.type = "button";
  close.setAttribute("aria-label", "Meldung schließen");
  close.textContent = "×";
  close.addEventListener("click", () => dismissBanner(bannerId));

  content.append(heading, body);
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
    duration: 5200,
    ...options,
    type: "error"
  });
}

export function showInfo(message, options = {}) {
  return showBanner(message, { ...options, type: "info" });
}
