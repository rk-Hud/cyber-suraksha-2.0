"use strict";
// Progressive enhancement; all core pages function without JavaScript.
document.addEventListener("DOMContentLoaded", () => {
  const query = document.querySelector("[data-incident-filter]");
  const rows = document.querySelectorAll("[data-incident-row]");
  if (!query || !rows.length) return;
  query.addEventListener("input", () => {
    const term = query.value.trim().toLocaleLowerCase();
    for (const row of rows) {
      row.hidden = !row.textContent.toLocaleLowerCase().includes(term);
    }
  });
});
