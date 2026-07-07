document.querySelectorAll("[data-nav]").forEach(el => {
  el.addEventListener("click", () => { location.href = el.dataset.nav; });
});
