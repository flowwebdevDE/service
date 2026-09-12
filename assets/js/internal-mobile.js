
const sidebar = document.querySelector("#flowSidebar");
const backdrop = document.querySelector("#flowBackdrop");
const button = document.querySelector("#mobileMenuButton");

function setOpen(open) {
  sidebar?.classList.toggle("is-open", open);
  backdrop?.classList.toggle("is-open", open);
  document.body.style.overflow = open ? "hidden" : "";
}

button?.addEventListener("click", () => setOpen(true));
backdrop?.addEventListener("click", () => setOpen(false));
sidebar?.querySelectorAll("a").forEach(link => link.addEventListener("click", () => setOpen(false)));
