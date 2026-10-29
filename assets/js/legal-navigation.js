const LEGAL_FILES = new Set(["privacy.html", "imprint.html"]);
const PORTAL_FILES = new Set(["index.html", "case.html", "customer.html", "login.html", "profile.html", "privacy.html", "imprint.html"]);

function currentFile() {
  return location.pathname.split("/").pop() || "index.html";
}

function currentRelativeUrl() {
  return `${currentFile()}${location.search}${location.hash}`;
}

function safeRelativeTarget(value) {
  if (!value) return null;

  try {
    // URLSearchParams.get() already returns the decoded parameter value.
    // Do not decode again: customer tokens and other query values must stay byte-for-byte stable.
    const url = new URL(value, location.href);

    if (url.origin !== location.origin) return null;

    const file = url.pathname.split("/").pop();
    if (!file || !PORTAL_FILES.has(file)) return null;

    return `${file}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function inheritedReturnTarget() {
  if (!LEGAL_FILES.has(currentFile())) return null;
  const params = new URLSearchParams(location.search);
  return safeRelativeTarget(params.get("from"));
}

function returnTargetForLegalLink() {
  // If the user already came from a portal page into a legal page, preserve that
  // original context while moving between Datenschutz and Impressum.
  return inheritedReturnTarget() || currentRelativeUrl();
}

function withReturnTarget(href) {
  try {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return href;

    const file = url.pathname.split("/").pop();
    if (!LEGAL_FILES.has(file)) return href;

    url.searchParams.set("from", returnTargetForLegalLink());
    return `${file}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function decorateLegalLinks() {
  document.querySelectorAll('a[href]').forEach(link => {
    const rawHref = link.getAttribute("href");
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return;

    const nextHref = withReturnTarget(rawHref);
    if (nextHref !== rawHref) link.setAttribute("href", nextHref);
  });
}

function setupContextBrandLinks() {
  const file = currentFile();
  let destination = null;

  if (file === "customer.html") {
    // In customer mode, the MYVELO logo is never a portal/dashboard link.
    // It always resolves to the exact currently opened customer order, including token/query/hash.
    destination = currentRelativeUrl();
  } else if (LEGAL_FILES.has(file)) {
    const source = inheritedReturnTarget();
    if (source && source.split(/[?#]/, 1)[0] === "customer.html") {
      // Legal pages opened from a customer order keep that order as their context-home.
      destination = source;
    } else {
      // Outside customer mode, preserve the normal portal context or use the internal overview.
      destination = source || "index.html";
    }
  }

  if (!destination) return;

  document.querySelectorAll("a.brand").forEach(link => {
    link.setAttribute("href", destination);
    link.setAttribute("aria-label", "Zurück zum Auftrag");
  });
}

function setupBackButton() {
  const button = document.querySelector("[data-legal-back]");
  if (!button) return;

  const params = new URLSearchParams(location.search);
  const target = safeRelativeTarget(params.get("from"));
  const fallback = "index.html";
  const destination = target || fallback;

  button.setAttribute("href", destination);

  const label = button.querySelector("[data-legal-back-label]");
  if (label) {
    label.textContent = destination.split(/[?#]/, 1)[0] === "customer.html"
      ? "Zurück zum Auftrag"
      : "Zurück";
  }
}

decorateLegalLinks();
setupContextBrandLinks();
setupBackButton();
