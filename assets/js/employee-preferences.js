(() => {
  const STORAGE_KEY = "myvelo_employee_preferences_v1";
  const DEFAULTS = Object.freeze({
    defaultView: "active",
    density: "comfortable",
    motion: "full"
  });

  function normalize(value = {}) {
    return {
      defaultView: value.defaultView === "archive" ? "archive" : "active",
      density: value.density === "compact" ? "compact" : "comfortable",
      motion: value.motion === "reduced" ? "reduced" : "full"
    };
  }

  function read() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return normalize({ ...DEFAULTS, ...stored });
    } catch {
      return { ...DEFAULTS };
    }
  }

  function write(next) {
    const normalized = normalize({ ...read(), ...next });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    apply(normalized);
    window.dispatchEvent(new CustomEvent("myvelo:employee-preferences", { detail: normalized }));
    return normalized;
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    const defaults = { ...DEFAULTS };
    apply(defaults);
    window.dispatchEvent(new CustomEvent("myvelo:employee-preferences", { detail: defaults }));
    return defaults;
  }

  function apply(preferences = read()) {
    const root = document.documentElement;
    root.classList.toggle("employee-density-compact", preferences.density === "compact");
    root.classList.toggle("employee-motion-reduced", preferences.motion === "reduced");
    root.dataset.employeeDefaultView = preferences.defaultView;
    root.dataset.employeeDensity = preferences.density;
    root.dataset.employeeMotion = preferences.motion;
  }

  window.MYVELOEmployeePreferences = { read, write, reset, apply, defaults: DEFAULTS };
  apply();
})();
