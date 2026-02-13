// static/js/print-pageno.js
// Inserisce numeri pagina basati sui pagebreak dentro il documento dell'iframe,
// poi stampa e infine pulisce.

(function () {
  'use strict';

  function removeInserted(doc) {
    doc.querySelectorAll('.print-pageno').forEach((el) => el.remove());
  }

  function detectLang(doc) {
    const l = (doc.documentElement && doc.documentElement.lang) || 'it';
    return String(l).toLowerCase().startsWith('en') ? 'en' : 'it';
  }

  function createNode(doc, n, lang) {
    const d = doc.createElement('div');
    d.className = 'print-pageno';
    d.textContent = String(n);
    return d;
  }

  function findWrapper(doc) {
    return doc.querySelector('main, article, .page-content, .content, .page') || doc.body;
  }

  function insertNumbers(doc) {
    removeInserted(doc);

    const lang = detectLang(doc);
    const wrapper = findWrapper(doc);
    if (!wrapper) return;

    let page = 1;

    // Numero per la prima pagina: inseriscilo all'inizio del wrapper
    wrapper.insertBefore(createNode(doc, page, lang), wrapper.firstChild);
    page++;

    // Poi dopo ogni pagebreak
    const breaks = doc.querySelectorAll('.pagebreak, .print-pagebreak');
    breaks.forEach((br) => {
      const pn = createNode(doc, page, lang);
      if (br.parentNode) {
        br.parentNode.insertBefore(pn, br.nextSibling);
      } else {
        wrapper.appendChild(pn);
      }
      page++;
    });
  }

  // API globale: chiamala dal bottone stampa
  window.printWithPageNumbers = function (frame) {
    if (!frame) return;

    const win = frame.contentWindow;
    const doc = frame.contentDocument || (win && win.document);
    if (!win || !doc) return;

    // Inserisci numeri
    insertNumbers(doc);

    // Pulisci dopo stampa
    const cleanup = () => {
      try { removeInserted(doc); } catch (e) {}
      try { win.removeEventListener('afterprint', cleanup); } catch (e) {}
    };
    try { win.addEventListener('afterprint', cleanup); } catch (e) {}

    // Stampa
    try {
      win.focus();
      win.print();
    } catch (e) {
      // fallback: se stampa fallisce, pulisci comunque
      cleanup();
    }
  };
})();
















