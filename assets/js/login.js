import { setButtonLoading, beginGlobalBusy, endGlobalBusy } from "./motion.js?v=7.11.0";
import { showError } from "./banner.js?v=7.10.6";
import {
  getPortalSession,
  loginWithCompanyKey
} from "./api.js?v=7.9.3";

const form = document.querySelector("#login-form");

function targetAfterLogin() {
  const next = new URLSearchParams(location.search).get("next");

  if (!next || next.includes("login.html") || next.startsWith("http")) {
    return "index.html";
  }

  return next;
}

if (getPortalSession()) {
  location.replace(targetAfterLogin());
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  const button = form.querySelector('button[type="submit"]');
  const keyInput = form.elements.company_key;

  setButtonLoading(button, true, "Anmelden …");
  beginGlobalBusy();

  try {
    await loginWithCompanyKey(keyInput.value);
    keyInput.value = "";
    location.replace(targetAfterLogin());
  } catch (error) {
    showError(error.message, { title: "Anmeldung nicht möglich" });
    keyInput.select();
  } finally {
    setButtonLoading(button, false);
    endGlobalBusy();
  }
});
