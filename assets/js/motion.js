
export function setButtonLoading(button, loading, label = "Lädt …") {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = `<span class="flow-spinner" aria-hidden="true"></span><span>${label}</span>`;
  } else {
    button.disabled = false;
    button.classList.remove("is-loading");
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

export function pulseElement(element) {
  if (!element) return;
  element.classList.remove("flow-pulse");
  void element.offsetWidth;
  element.classList.add("flow-pulse");
}

export function reveal(element) {
  if (!element) return;
  element.classList.add("flow-reveal");
}

export function renderCaseSkeleton(container, count = 5) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="flow-case-row flow-skeleton-row" aria-hidden="true">
      <div class="flow-case-main">
        <span class="flow-skeleton flow-skeleton--title"></span>
        <span class="flow-skeleton flow-skeleton--text"></span>
      </div>
      <div class="flow-case-meta">
        <span class="flow-skeleton flow-skeleton--meta"></span>
        <span class="flow-skeleton flow-skeleton--tiny"></span>
      </div>
      <span class="flow-skeleton flow-skeleton--pill"></span>
      <span class="flow-skeleton flow-skeleton--arrow"></span>
    </div>
  `).join("");
}


let globalBusyDepth = 0;
let globalProgressElement = null;

function ensureGlobalProgress() {
  if (globalProgressElement?.isConnected) return globalProgressElement;

  globalProgressElement = document.createElement("div");
  globalProgressElement.className = "flow-global-progress";
  globalProgressElement.setAttribute("aria-hidden", "true");
  document.body.appendChild(globalProgressElement);
  return globalProgressElement;
}

export function beginGlobalBusy() {
  globalBusyDepth += 1;
  document.documentElement.setAttribute("aria-busy", "true");
  ensureGlobalProgress().classList.add("is-active");
}

export function endGlobalBusy() {
  globalBusyDepth = Math.max(0, globalBusyDepth - 1);
  if (globalBusyDepth > 0) return;

  document.documentElement.removeAttribute("aria-busy");
  globalProgressElement?.classList.remove("is-active");
}

export function transitionSurface(element) {
  if (!element) return;
  element.classList.remove("flow-surface-transition");
  void element.offsetWidth;
  element.classList.add("flow-surface-transition");
}
