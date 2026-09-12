import { setButtonLoading } from "./motion.js?v=7.9";
import {
  getPortalSession,
  loginWithCompanyKey
} from "./api.js?v=7.9.3";

const form = document.querySelector("#login-form");
const errorBox = document.querySelector("#login-error");

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

  errorBox.classList.add("hidden");
  setButtonLoading(button, true, "Anmelden …");

  try {
    await loginWithCompanyKey(keyInput.value);
    keyInput.value = "";
    location.replace(targetAfterLogin());
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
    keyInput.select();
  } finally {
    setButtonLoading(button, false);
  }
});
