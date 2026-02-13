document.addEventListener("DOMContentLoaded", () => {
  const frame = document.getElementById("content-frame");
  if (!frame) return;

  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href) return;

    // Prefazione
    if (href.endsWith("pr.html")) {
      e.preventDefault();
      frame.src = href;
      return;
    }

    // Sezioni: pattern .../I/1/1 , .../II/3/2 ecc.
    const isSection = /\/[IVX]+\/\d+\/\d+\/?$/.test(href);
    if (!isSection) return;

    // Carica la sezione a destra invece di navigare
    e.preventDefault();
    frame.src = href;
  });
});
