(() => {
  "use strict";

  // GitHub Pages cannot emit X-Frame-Options / CSP frame-ancestors.
  // This is only a client-side fallback until production is served from a host
  // that applies public/_headers.
  if (window.top !== window.self) {
    document.documentElement.style.display = "none";
    try {
      window.top.location = window.self.location;
    } catch {
      // Cross-origin frame access is expected to fail. Keeping the document
      // hidden prevents interaction with the embedded application.
    }
  }
})();
