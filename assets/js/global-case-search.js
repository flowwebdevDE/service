import { listCases } from "./api-oauth-core.js?v=7.15.50";

const root = document.querySelector("#global-case-search");
const input = document.querySelector("#global-case-search-input");
const clearButton = document.querySelector("#global-case-search-clear");
const shortcut = document.querySelector("#global-case-search-shortcut");
const popover = document.querySelector("#global-case-search-results");
const state = document.querySelector("#global-case-search-state");
const list = document.querySelector("#global-case-search-list");
const footer = document.querySelector("#global-case-search-footer");

if (root && input && clearButton && popover && state && list && footer) {
  let timer = 0;
  let requestId = 0;
  let results = [];
  let activeIndex = -1;
  const RESULT_LIMIT = 8;

  const escapeHtml = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const isArchived = item => ["completed", "resolved"].includes(String(item?.service_status || "").toLowerCase());

  const caseTypeLabel = value => ({
    warranty: "Garantiefall",
    repair: "Reparatur",
    return: "Rückgabe",
    exchange: "Tausch"
  })[String(value || "").toLowerCase()] || "Service";

  const stageLabel = item => {
    const stage = String(item?.internal_stage || "").toLowerCase();
    const status = String(item?.service_status || "").toLowerCase();
    if (["completed", "resolved"].includes(status)) return "Abgeschlossen";
    return ({
      waiting_customer: "Kundenfreigabe",
      customer_confirmed: "Bestätigt",
      arrived: "Eingang",
      in_progress: "Werkstatt",
      ready_for_pickup: "Abholbereit",
      picked_up: "Abgeholt"
    })[stage] || ({
      waiting_customer: "Kundenfreigabe",
      customer_confirmed: "Bestätigt",
      arrived: "Eingang",
      in_progress: "Werkstatt",
      ready_for_pickup: "Abholbereit",
      picked_up: "Abgeholt"
    })[status] || "Offen";
  };

  const reference = item => String(item?.shopify_ref || item?.public_id || "–").trim() || "–";

  const openPopover = () => {
    popover.hidden = false;
    input.setAttribute("aria-expanded", "true");
    root.classList.add("is-open");
  };

  const closePopover = () => {
    popover.hidden = true;
    input.setAttribute("aria-expanded", "false");
    root.classList.remove("is-open");
    activeIndex = -1;
    syncActiveResult();
  };

  const setState = (message, kind = "") => {
    state.textContent = message;
    state.dataset.state = kind;
    state.hidden = false;
  };

  const syncActiveResult = () => {
    list.querySelectorAll("[data-global-search-result]").forEach((element, index) => {
      const active = index === activeIndex;
      element.classList.toggle("is-active", active);
      if (active) element.setAttribute("aria-current", "true");
      else element.removeAttribute("aria-current");
    });
  };

  const renderResults = items => {
    results = Array.isArray(items) ? items : [];
    activeIndex = results.length ? 0 : -1;
    list.innerHTML = "";

    if (!results.length) {
      setState("Keine passenden Vorgänge gefunden.", "empty");
      footer.hidden = true;
      return;
    }

    state.hidden = true;
    const visibleResults = results.slice(0, RESULT_LIMIT);
    list.innerHTML = visibleResults.map((item, index) => {
      const archived = isArchived(item);
      const title = String(item?.customer_name || "Unbekannter Kunde").trim() || "Unbekannter Kunde";
      const model = String(item?.bike_model || (item?.item_type === "battery" ? "Akku" : "Fahrrad")).trim();
      const subject = String(item?.case_subject || "").trim();
      const details = [model, subject].filter(Boolean).join(" · ");
      return `
        <a class="flow-global-result${index === 0 ? " is-active" : ""}" data-global-search-result href="case.html?id=${encodeURIComponent(item.public_id)}">
          <span class="flow-global-result__icon" aria-hidden="true">${archived ? "✓" : "→"}</span>
          <span class="flow-global-result__body">
            <span class="flow-global-result__title-line">
              <strong>${escapeHtml(title)}</strong>
              <span class="flow-global-result__reference">${escapeHtml(reference(item))}</span>
            </span>
            <span class="flow-global-result__detail">${escapeHtml(details || caseTypeLabel(item?.case_type))}</span>
          </span>
          <span class="flow-global-result__meta">
            <span class="flow-global-result__type">${escapeHtml(caseTypeLabel(item?.case_type))}</span>
            <span class="flow-global-result__status${archived ? " is-archived" : ""}">${escapeHtml(stageLabel(item))}</span>
          </span>
        </a>`;
    }).join("");

    footer.hidden = false;
    footer.textContent = results.length > RESULT_LIMIT
      ? `${results.length} Treffer · die ersten ${RESULT_LIMIT} werden angezeigt`
      : `${results.length} ${results.length === 1 ? "Treffer" : "Treffer"}`;
    syncActiveResult();
  };

  const runSearch = async ({ immediate = false } = {}) => {
    window.clearTimeout(timer);
    const query = input.value.trim();
    clearButton.hidden = !query;

    if (query.length < 2) {
      results = [];
      list.innerHTML = "";
      footer.hidden = true;
      if (query.length) setState("Noch ein Zeichen …", "hint");
      else setState("Vorgang, Kunde, E-Mail, Modell oder Betreff suchen.", "hint");
      if (document.activeElement === input) openPopover();
      return;
    }

    const execute = async () => {
      const id = ++requestId;
      openPopover();
      setState("Suche …", "loading");
      list.innerHTML = "";
      footer.hidden = true;
      root.classList.add("is-loading");

      try {
        const payload = await listCases({ search: query });
        if (id !== requestId || input.value.trim() !== query) return;
        renderResults(payload?.items || []);
      } catch (error) {
        if (id !== requestId) return;
        results = [];
        list.innerHTML = "";
        footer.hidden = true;
        setState(error?.message || "Suche momentan nicht verfügbar.", "error");
      } finally {
        if (id === requestId) root.classList.remove("is-loading");
      }
    };

    if (immediate) await execute();
    else timer = window.setTimeout(execute, 180);
  };

  input.addEventListener("focus", () => {
    openPopover();
    void runSearch({ immediate: input.value.trim().length >= 2 });
  });

  input.addEventListener("input", () => {
    activeIndex = -1;
    void runSearch();
  });

  input.addEventListener("keydown", event => {
    const resultElements = [...list.querySelectorAll("[data-global-search-result]")];

    if (event.key === "ArrowDown" && resultElements.length) {
      event.preventDefault();
      activeIndex = Math.min(resultElements.length - 1, activeIndex + 1);
      syncActiveResult();
      resultElements[activeIndex]?.scrollIntoView({ block: "nearest" });
      return;
    }

    if (event.key === "ArrowUp" && resultElements.length) {
      event.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      syncActiveResult();
      resultElements[activeIndex]?.scrollIntoView({ block: "nearest" });
      return;
    }

    if (event.key === "Enter" && resultElements.length) {
      event.preventDefault();
      const target = resultElements[Math.max(0, activeIndex)] || resultElements[0];
      if (target?.href) location.href = target.href;
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (input.value) {
        input.value = "";
        clearButton.hidden = true;
        void runSearch({ immediate: true });
      } else {
        closePopover();
        input.blur();
      }
    }
  });

  clearButton.addEventListener("click", () => {
    input.value = "";
    clearButton.hidden = true;
    results = [];
    list.innerHTML = "";
    footer.hidden = true;
    setState("Vorgang, Kunde, E-Mail, Modell oder Betreff suchen.", "hint");
    openPopover();
    input.focus();
  });

  document.addEventListener("pointerdown", event => {
    if (!root.contains(event.target)) closePopover();
  });

  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      input.focus();
      input.select();
      openPopover();
    }
  });

  shortcut.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K";
}
