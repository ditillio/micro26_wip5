(function () {
  'use strict';

  // Non eseguire dentro l'iframe
  if (window.self !== window.top) return;

  const frame =
    document.getElementById('toc-split-frame') ||
    document.getElementById('content-frame') ||
    document.querySelector('iframe.toc-split-frame') ||
    document.querySelector('iframe[data-toc-split]');

  if (!frame) return;

  // --- Helpers ---------------------------------------------------------------

  function getLangRootPath() {
    const p = window.location.pathname;
    const m = p.match(/^(.*\/)(it|en)\/(?:index(?:\.html)?)?$/);
    if (m) return m[1] + m[2] + '/';

    const idxIt = p.indexOf('/it/');
    const idxEn = p.indexOf('/en/');
    const idx = idxIt >= 0 ? idxIt : idxEn;
    if (idx >= 0) return p.slice(0, idx + 4);

    return p.endsWith('/') ? p : (p + '/');
  }

  const LANG_ROOT = getLangRootPath();
  const LANG = (LANG_ROOT.match(/\/(it|en)\/$/) || [null, 'it'])[1];

  function isAbsHttp(u) {
    return /^https?:\/\//i.test(u);
  }

  function toCleanLoad(href) {
    if (!href) return null;
    // Se arriva una stringa percent-encoded (es. http%3A%2F%2F...), decodifica subito
    let raw = href;
    try {
      if (/%[0-9A-Fa-f]{2}/.test(raw)) raw = decodeURIComponent(raw);
    } catch (e) {
      // se decode fallisce, continua con raw originale
    }
    const h = raw.split('#')[0].split('?')[0];

    if (isAbsHttp(h)) {
      try {
        const u = new URL(h);
        const m = u.pathname.match(/\/(it|en)\/(.*)$/);
        if (m) return '/' + m[1] + '/' + m[2].replace(/\/+$/, '');
        return h;
      } catch (e) {
        return h;
      }
    }

    let s = h;
    if (s.startsWith('./')) s = s.slice(2);

    if (s.startsWith('/')) {
      const m = s.match(/\/(it|en)\/(.*)$/);
      if (m) {
        s = '/' + m[1] + '/' + m[2];
      } else if (s.startsWith(LANG_ROOT)) {
        s = '/' + LANG + '/' + s.slice(LANG_ROOT.length);
      } else {
        s = '/' + LANG + '/' + s.replace(/^\/+/, '');
      }
    } else {
      s = '/' + LANG + '/' + s;
    }

    s = s.replace(/\/+$/, '');
    return s || null;
  }

  function loadToFrameUrl(loadVal) {
    if (!loadVal) return null;
    if (isAbsHttp(loadVal)) return loadVal;

    let v = loadVal;
    try { v = decodeURIComponent(v); } catch (e) {}
    v = v.replace(/^\/+/, '');

    const m = v.match(/^(it|en)\/(.*)$/);
    let rel;
    if (m) rel = m[2];
    else rel = v;

    rel = (rel || '').replace(/^\/+/, '').replace(/\/+$/, '');
    // Se loadVal include una lingua, usa la root corretta per quella lingua
    let root = LANG_ROOT;
    const mm = String(loadVal).match(/^\/?(it|en)\//);
    if (mm) {
      root = LANG_ROOT.replace(/\/(it|en)\//, `/${mm[1]}/`);
    }
    return new URL(rel, window.location.origin + root).toString();
  }

  function setParentLoadParamClean(cleanVal, mode = 'replace') {
    // Se cleanVal è di un'altra lingua, sposta anche il parent su quella lingua
    const mLang = String(cleanVal || '').match(/^\/(it|en)\//);
    if (mLang) {
      const targetLang = mLang[1];
      const cur = window.location.pathname;
      const curLang = (cur.match(/\/(it|en)\//) || [null, null])[1];

      if (curLang && curLang !== targetLang) {
        const newPath = cur.replace(/\/(it|en)\//, `/${targetLang}/`);
        // ricarica il parent nella lingua giusta, mantenendo lo stesso load
        window.location.href = newPath + `?load=${cleanVal}`;
        return;
      }
    }
    try {
      const u = new URL(window.location.href);
      const base = u.pathname;
      const hash = u.hash || '';

      const params = [];
      u.search
        .replace(/^\?/, '')
        .split('&')
        .filter(Boolean)
        .forEach((kv) => {
          const [k] = kv.split('=');
          if (k !== 'load') params.push(kv);
        });

      params.push('load=' + cleanVal);
      const newUrl = base + '?' + params.join('&') + hash;

      if (mode === 'push') history.pushState({}, '', newUrl);
      else history.replaceState({}, '', newUrl);

      try { sessionStorage.setItem('toc_last_load', cleanVal); } catch (e) {}
    } catch (e) {}
  }

  function getLoadFromUrl() {
    try {
      const raw = window.location.search.replace(/^\?/, '');
      if (!raw) return null;

      const parts = raw.split('&');
      for (const p of parts) {
        const eq = p.indexOf('=');
        if (eq < 0) continue;
        const k = p.slice(0, eq);
        const v = p.slice(eq + 1);
        if (k === 'load') return v || null;
      }
    } catch (e) {}
    return null;
  }

  // helper unica: carica frame + sincronizza URL
  function goToClean(clean, mode = 'push') {
    if (!clean) return;

    const frameUrl = loadToFrameUrl(clean);

    if (frameUrl) {
      // Evita di accumulare history dentro l'iframe:
      // - se same-origin e contentWindow accessibile, usa location.replace()
      // - fallback: src
      try {
        if (frame.contentWindow && frame.contentWindow.location) {
          frame.contentWindow.location.replace(frameUrl);
        } else {
          frame.src = frameUrl;
        }
      } catch (e) {
        frame.src = frameUrl;
      }
    }

    setParentLoadParamClean(clean, mode);
  }

  function defaultCleanLoad() {
    return `/${LANG}/toc-big.html`;
  }

  // --- Intercetta click su sezioni/prefazione nella TOC ----------------------

  document.addEventListener(
    'click',
    (ev) => {
      const a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
      if (!a) return;

      const href = a.getAttribute('href');
      if (!href) return;

      const inSections =
        !!a.closest('.chapter_sections') ||
        !!a.closest('.chapter_section_row') ||
        !!a.closest('.chapter_sections_list');

      const looksLikeSection = /\/\d+\/\d+\/?$/.test(href);
      const isPreface = href.endsWith('pr.html') || href.endsWith('/pr.html');

      if (!(inSections || looksLikeSection || isPreface)) return;

      ev.preventDefault();
      ev.stopPropagation();

      const clean = toCleanLoad(href);
      if (!clean) return;

      goToClean(clean, 'push');
    },
    true
  );

  // --- Bootstrap: carica iframe da ?load=... --------------------------------

  window.addEventListener('DOMContentLoaded', () => {
    const load = getLoadFromUrl();

    if (load) {
      const clean = toCleanLoad(load) || load;
      goToClean(clean, 'replace');
      return;
    }

    // default: toc-big (senza creare entry nuova)
    goToClean(defaultCleanLoad(), 'replace');
  });

  // --- popstate: back/forward deve sincronizzare anche l'URL/iframe ----------

  window.addEventListener('popstate', () => {
    const load = getLoadFromUrl();

    if (load) {
      const clean = toCleanLoad(load) || load;
      goToClean(clean, 'replace');
      return;
    }

    // Se siamo tornati a /it/ o /en/ senza load, mostriamo toc-big
    goToClean(defaultCleanLoad(), 'replace');
  });

  // --- listener per messaggi provenienti dall'iframe (toc-big) ---------------

  window.addEventListener('message', function(ev) {
    try {
      if (ev.origin !== window.location.origin) return;
    } catch (err) {
      return;
    }

    var data = ev.data;
    if (!data || data.type !== 'toc-load' || typeof data.path !== 'string') return;

    var clean = null;
    try {
      clean = toCleanLoad(data.path);
    } catch (e) {
      try {
        var u = new URL(data.path, window.location.origin + window.location.pathname);
        clean = toCleanLoad(u.pathname + u.search + u.hash);
      } catch (ee) {
        clean = null;
      }
    }

    if (!clean) return;

    goToClean(clean, 'push');

    try { localStorage.setItem('toc_sidebar_hidden', "0"); } catch (e) {}
  }, false);

})();


// ---------------------------
// Sidebar toggle (sempre nel pannello di destra, top-left)
// - quando la sidebar è VISIBILE: mostra ✕
// - quando la sidebar è NASCOSTA: mostra ☰
// ---------------------------
(function () {
  const el = document.getElementById("toc-sidebar-toggle");
  if (!el) return;

  const KEY = "toc_sidebar_hidden";

  const rightCol = document.querySelector(".toc-split-right");
  if (!rightCol) return;

  function labelWhenHidden() { return "☰"; }
  function labelWhenVisible() { return "✕"; }

  function apply(hidden) {
    document.body.classList.toggle("sidebar-hidden", hidden);
    if (el.parentElement !== rightCol) rightCol.appendChild(el);
    el.textContent = hidden ? labelWhenHidden() : labelWhenVisible();
    const m = window.location.pathname.match(/\/(it|en)\//);
    const lang = m ? m[1] : "it";

    const showLabel = (lang === "it") ? "Mostra indice" : "Show table of contents";
    const hideLabel = (lang === "it") ? "Nascondi indice" : "Hide table of contents";

    el.setAttribute("aria-label", hidden ? showLabel : hideLabel);
    el.setAttribute("title", hidden ? showLabel : hideLabel);
  }

  // restore state
  const isLangHome = /\/(it|en)\/(?:index(?:\.html)?)?$/.test(window.location.pathname);

  // NUOVO: se load contiene toc-big, forza sidebar nascosta
  let forceHiddenForBigToc = false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    const load = params.get("load") || "";
    forceHiddenForBigToc = /toc-big\.html/.test(load);
  } catch (e) {}

  const raw = localStorage.getItem(KEY);

  // default: nascosta al primo avvio (raw === null -> true)
  // ma sulla home: SEMPRE nascosta
  // e su ?load=...toc-big.html: SEMPRE nascosta
  const saved = (isLangHome || forceHiddenForBigToc) ? true : (raw === null ? true : (raw === "1"));

  apply(saved);

  function toggle() {
    const wasHidden = document.body.classList.contains("sidebar-hidden"); // prima del toggle
    const willHide = !wasHidden; // se era visibile, ora nascondi
    const willShow = wasHidden;  // se era nascosta, ora mostra

    // Applica toggle sidebar
    localStorage.setItem(KEY, willHide ? "1" : "0");
    apply(willHide);

    // Se stiamo MOSTRANDO la sidebar e siamo su toc-big, allora passa a Prefazione
    if (willShow) {
      let load = "";
      try {
        const params = new URLSearchParams(window.location.search || "");
        load = params.get("load") || "";
        try {
          if (/%[0-9A-Fa-f]{2}/.test(load)) load = decodeURIComponent(load);
        } catch (e) {}
      } catch (e) {}

      if (/toc-big\.html/.test(load)) {
        // lingua corrente dal pathname
        const m = window.location.pathname.match(/\/(it|en)\//);
        const lang = m ? m[1] : "it";
        const clean = `/${lang}/pr.html`;

        // calcola lang root tipo /micro26_wip3/it/
        const p = window.location.pathname;
        const mm = p.match(/^(.*\/)(it|en)\//);
        const langRoot = mm ? (mm[1] + lang + "/") : ("/" + lang + "/");

        // carica la prefazione nel frame SENZA accumulare history dell'iframe
        const frame =
          document.getElementById("toc-split-frame") ||
          document.querySelector(".toc-split-right iframe");

        if (frame) {
          const frameUrl = new URL("pr.html", window.location.origin + langRoot).toString();
          try {
            if (frame.contentWindow && frame.contentWindow.location) {
              frame.contentWindow.location.replace(frameUrl);
            } else {
              frame.src = frameUrl;
            }
          } catch (e) {
            frame.src = frameUrl;
          }
        }

        // aggiorna URL del parent con PUSH (azione utente)
        try {
          const newUrl = window.location.pathname + `?load=${clean}` + (window.location.hash || "");
          history.pushState({}, "", newUrl);
          try { sessionStorage.setItem("toc_last_load", clean); } catch (e) {}
        } catch (e) {}
      }
    }
  }

  el.addEventListener("click", toggle);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
})();









// ---------------------------
// Reload iframe content only (robusto: usa ?load= del parent)
// ---------------------------
(function () {
  const btn = document.getElementById("content-reload");
  if (!btn) return;

  const frame =
    document.getElementById("content-frame") ||
    document.getElementById("toc-split-frame") ||
    document.querySelector(".toc-split-right iframe");

  if (!frame) return;

  function getLoadFromUrl() {
    try {
      const raw = window.location.search.replace(/^\?/, '');
      if (!raw) return null;
      for (const p of raw.split('&')) {
        const eq = p.indexOf('=');
        if (eq < 0) continue;
        const k = p.slice(0, eq);
        const v = p.slice(eq + 1);
        if (k === 'load') return v || null;
      }
    } catch (e) {}
    return null;
  }

  function getLangRootPath() {
    const p = window.location.pathname;
    const m = p.match(/^(.*\/)(it|en)\//);
    if (m) return m[1] + m[2] + '/';
    return p.endsWith('/') ? p : (p + '/');
  }

  const LANG_ROOT = getLangRootPath();
  const LANG = (LANG_ROOT.match(/\/(it|en)\/$/) || [null, 'it'])[1];

  function isAbsHttp(u) {
    return /^https?:\/\//i.test(u);
  }

  function loadToFrameUrl(loadVal) {
    if (!loadVal) return null;
    if (isAbsHttp(loadVal)) return loadVal;

    let v = loadVal;
    try { v = decodeURIComponent(v); } catch (e) {}
    v = v.replace(/^\/+/, '');

    const m = v.match(/^(it|en)\/(.*)$/);
    let rel;
    if (m) rel = m[2];
    else rel = v;

    rel = (rel || '').replace(/^\/+/, '').replace(/\/+$/, '');
    return new URL(rel, window.location.origin + LANG_ROOT).toString();
  }

  function defaultCleanLoad() {
    return `/${LANG}/toc-big.html`;
  }

  function reloadFrame() {
    const load = getLoadFromUrl();
    const clean = load ? load : defaultCleanLoad();
    const frameUrl = loadToFrameUrl(clean);
    if (!frameUrl) return;

    // ricarica senza accumulare history nell'iframe
    try {
      if (frame.contentWindow && frame.contentWindow.location) {
        frame.contentWindow.location.replace(frameUrl);
      } else {
        frame.src = frameUrl;
      }
    } catch (e) {
      frame.src = frameUrl;
    }
  }

  btn.addEventListener("click", reloadFrame);

  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      reloadFrame();
    }
  });
})();










// ---------------------------
// Home button: torna a TOC grande
// ---------------------------
(function () {
  const btn = document.getElementById("go-big-toc");
  if (!btn) return;

  function goHome() {
    const m = window.location.pathname.match(/\/(it|en)\//);
    const lang = m ? m[1] : "it";
    const clean = `/${lang}/toc-big.html`;

    // Aggiorna URL del parent (azione utente)
    try {
      history.pushState({}, "", window.location.pathname + `?load=${clean}` + (window.location.hash || ""));
      try { sessionStorage.setItem("toc_last_load", clean); } catch (e) {}
    } catch (e) {}

    // (opzionale ma consigliato): quando vai all'indice grande, nascondi la sidebar
    try {
      localStorage.setItem("toc_sidebar_hidden", "1");
      document.body.classList.add("sidebar-hidden");
      const toggle = document.getElementById("toc-sidebar-toggle");
      if (toggle) toggle.textContent = "☰";
    } catch (e) {}

    // Carica toc-big nel frame senza history dell'iframe
    const frame =
      document.getElementById("toc-split-frame") ||
      document.querySelector(".toc-split-right iframe");
    if (!frame) return;

    const p = window.location.pathname;
    const mm = p.match(/^(.*\/)(it|en)\//);
    const langRoot = mm ? (mm[1] + lang + "/") : ("/" + lang + "/");

    const frameUrl = new URL("toc-big.html", window.location.origin + langRoot).toString();

    try {
      if (frame.contentWindow && frame.contentWindow.location) {
        frame.contentWindow.location.replace(frameUrl);
      } else {
        frame.src = frameUrl;
      }
    } catch (e) {
      frame.src = frameUrl;
    }
  }

  btn.addEventListener("click", goHome);
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goHome();
    }
  });
})();







// ---------------------------
// Print iframe content only (pagina corrente)
// ---------------------------
(function () {
  const btn = document.getElementById("content-print");
  if (!btn) return;

  const frame =
    document.getElementById("content-frame") ||
    document.getElementById("toc-split-frame") ||
    document.querySelector(".toc-split-right iframe");

  if (!frame) return;

  function printFrame() {
    // Se disponibile la stampa con numeri pagina (basata su pagebreak), usala
    if (window.printWithPageNumbers) {
      window.printWithPageNumbers(frame);
      return;
    }

    // Fallback: comportamento precedente
    try {
      if (frame.contentWindow) {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        return;
      }
    } catch (e) {}

    try {
      const url = frame.src;
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) return;
      w.addEventListener("load", () => {
        try { w.focus(); w.print(); } catch (e) {}
      });
    } catch (e) {}
  }

  btn.addEventListener("click", printFrame);
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      printFrame();
    }
  });
})();




