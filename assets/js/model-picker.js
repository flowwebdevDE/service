let catalogPromise;
let popup;
let activeInstance = null;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function loadCatalog() {
  if (!catalogPromise) {
    const url = new URL("../data/models.json", import.meta.url);
    catalogPromise = fetch(url, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Modellkatalog konnte nicht geladen werden.");
      const payload = await response.json();
      return Array.isArray(payload?.models) ? payload.models : [];
    });
  }
  return catalogPromise;
}

function categories(models) {
  return [...new Set(models.map(model => model.category || "Weitere"))];
}

function modelMatches(model, query) {
  const q = normalize(query);
  if (!q) return true;

  return [
    model.name,
    model.category,
    ...(model.aliases || [])
  ].some(value => normalize(value).includes(q));
}

function createPopup() {
  if (popup) return popup;

  const dialog = document.createElement("dialog");
  dialog.className = "model-popup";
  dialog.innerHTML = `
    <div class="model-popup__shell">
      <div class="model-popup__head">
        <div>
          <span class="model-popup__kicker">MYVELO Modell</span>
          <strong id="model-popup-title">Modell auswählen</strong>
        </div>
        <button class="model-popup__close" type="button" aria-label="Schließen">×</button>
      </div>

      <div class="model-popup__search-wrap">
        <input class="model-popup__search" type="search" placeholder="Modell suchen …" autocomplete="off">
      </div>

      <div class="model-popup__categories" role="tablist"></div>
      <div class="model-popup__grid"></div>

      <div class="model-popup__manual">
        <span>Modell nicht dabei?</span>
        <div>
          <input class="model-popup__manual-input" type="text" placeholder="Modell frei eingeben">
          <button class="flow-action secondary model-popup__manual-save" type="button">Übernehmen</button>
        </div>
      </div>
    </div>
  `;

  document.body.append(dialog);

  dialog.querySelector(".model-popup__close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    activeInstance = null;
  });

  popup = dialog;
  return dialog;
}

function setTriggerText(instance, value) {
  const text = value?.trim() || "Modell auswählen";
  instance.trigger.querySelector(".flow-model-trigger__value").textContent = text;
  instance.trigger.classList.toggle("has-value", Boolean(value?.trim()));
}

function syncLabel(instance) {
  const battery = instance.itemType?.value === "battery";
  instance.label.textContent = battery ? "Akku von Modell" : "Modell";

  const title = createPopup().querySelector("#model-popup-title");
  if (activeInstance === instance) {
    title.textContent = battery ? "Akku von Modell auswählen" : "Modell auswählen";
  }
}

function renderPopup(instance, selectedCategory = "Alle", query = "") {
  const dialog = createPopup();
  const categoryBar = dialog.querySelector(".model-popup__categories");
  const grid = dialog.querySelector(".model-popup__grid");
  const allCategories = categories(instance.models);

  categoryBar.replaceChildren();
  for (const category of ["Alle", ...allCategories]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "model-popup__category";
    button.classList.toggle("is-active", category === selectedCategory);
    button.textContent = category;
    button.addEventListener("click", () => {
      instance.category = category;
      renderPopup(instance, category, dialog.querySelector(".model-popup__search").value);
    });
    categoryBar.append(button);
  }

  const visible = instance.models.filter(model => {
    const categoryOk = selectedCategory === "Alle" || model.category === selectedCategory;
    return categoryOk && modelMatches(model, query);
  });

  grid.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "model-popup__empty";
    empty.textContent = "Kein passendes Modell gefunden.";
    grid.append(empty);
    return;
  }

  for (const model of visible) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "model-popup__model";
    button.classList.toggle("is-selected", normalize(instance.input.value) === normalize(model.name));
    button.innerHTML = `
      <span>${model.category}</span>
      <strong>${model.name}</strong>
    `;
    button.addEventListener("click", () => {
      instance.input.value = model.name;
      setTriggerText(instance, model.name);
      instance.input.dispatchEvent(new Event("input", { bubbles: true }));
      dialog.close();
    });
    grid.append(button);
  }
}

export async function initModelPopup({
  trigger,
  input,
  label,
  itemType
}) {
  if (!trigger || !input || !label) return null;

  const models = await loadCatalog();
  const instance = {
    trigger,
    input,
    label,
    itemType,
    models,
    category: "Alle"
  };

  setTriggerText(instance, input.value);
  syncLabel(instance);

  itemType?.addEventListener("change", () => syncLabel(instance));

  trigger.addEventListener("click", () => {
    activeInstance = instance;
    const dialog = createPopup();
    const search = dialog.querySelector(".model-popup__search");
    const manual = dialog.querySelector(".model-popup__manual-input");

    search.value = "";
    manual.value = input.value || "";
    instance.category = "Alle";

    syncLabel(instance);
    renderPopup(instance);

    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => search.focus());
  });

  const dialog = createPopup();
  dialog.querySelector(".model-popup__search").addEventListener("input", event => {
    if (!activeInstance) return;
    renderPopup(activeInstance, activeInstance.category, event.target.value);
  });

  if (!dialog.dataset.manualBound) {
    dialog.dataset.manualBound = "true";
    dialog.querySelector(".model-popup__manual-save").addEventListener("click", () => {
      if (!activeInstance) return;
      const manual = dialog.querySelector(".model-popup__manual-input").value.trim();
      if (!manual) return;
      activeInstance.input.value = manual;
      setTriggerText(activeInstance, manual);
      activeInstance.input.dispatchEvent(new Event("input", { bubbles: true }));
      dialog.close();
    });
  }

  return {
    sync() {
      setTriggerText(instance, input.value);
      syncLabel(instance);
    }
  };
}
