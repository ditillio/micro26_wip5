/*
  Search overlay for the textbook.
  - Works with Jekyll baseurl (e.g. /micro26_wip5)
  - Works even when toc_split.html itself is NOT under /it/ or /en/
    (language is inferred from the iframe src or ?load=...)
  - Renders inline LaTeX using KaTeX (via window.katex, already loaded by kg)
*/

(function () {
  'use strict';

  // -------- helpers (baseurl + language) --------

  function inferBaseUrlFromThisScript() {
    const scripts = Array.from(document.scripts || []);
    const me = scripts.find(s => typeof s.src === 'string' && /\/static\/js\/search\.js(\?|$)/.test(s.src));
    if (!me) return '';
    try {
      const p = new URL(me.src, window.location.href).pathname;
      return p.replace(/\/static\/js\/search\.js.*$/, '');
    } catch {
      return '';
    }
  }

  function normalizeBase(base) {
    if (!base) return '';
    if (!base.startsWith('/')) base = '/' + base;
    return base.replace(/\/$/, '');
  }

  function getContentPathHint() {
    try {
      const u = new URL(window.location.href);
      const load = u.searchParams.get('load');
      if (load) return load;
    } catch {}

    const frame = document.getElementById('toc-split-frame');
    if (frame && frame.getAttribute('src')) return frame.getAttribute('src');

    return '';
  }

  function inferLang() {
    const hint = getContentPathHint();
    if (/\/(en)\//.test(hint)) return 'en';
    if (/\/(it)\//.test(hint)) return 'it';

    const htmlLang = (document.documentElement && document.documentElement.lang) ? document.documentElement.lang.toLowerCase() : '';
    if (htmlLang.startsWith('en')) return 'en';
    return 'it';
  }

  function joinPath(a, b) {
    const aa = (a || '').replace(/\/$/, '');
    const bb = (b || '').replace(/^\//, '');
    if (!aa) return '/' + bb;
    return aa + '/' + bb;
  }

  function getIndexUrl() {
    const base = normalizeBase(inferBaseUrlFromThisScript());
    const lang = inferLang();
    return joinPath(base, `${lang}/search.json`);
  }

  function getBasePath() {
    return normalizeBase(inferBaseUrlFromThisScript());
  }

  function pickKatex() {
    if (window.katex) return window.katex;
    const frame = document.getElementById('toc-split-frame');
    try {
      const k = frame && frame.contentWindow && frame.contentWindow.katex;
      if (k) return k;
    } catch (_) {}
    return null;
  }

  function ensureKatexLoaded() {
    return new Promise((resolve) => {
      const k0 = pickKatex();
      if (k0) return resolve(k0);

      const base = getBasePath();
      const kgSrc = joinPath(base, 'static/js/kg.0.3.1.js');

      if (document.querySelector('script[data-search-katex="1"]')) {
        return resolve(pickKatex());
      }

      const s = document.createElement('script');
      s.src = kgSrc;
      s.async = true;
      s.defer = true;
      s.dataset.searchKatex = '1';
      s.onload = () => resolve(pickKatex());
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }

  function toAbsoluteBookUrl(relativeUrl) {
    if (!relativeUrl) return relativeUrl;
    if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;

    const base = getBasePath();
    const rel = (relativeUrl || '').startsWith('/') ? relativeUrl : '/' + relativeUrl;

    if (base && (rel === base || rel.startsWith(base + '/'))) {
      return rel;
    }
    return base ? (base + rel) : rel;
  }

  // -------- helpers (text cleaning + KaTeX) --------

  function stripLiquidAndNoise(text) {
    if (!text) return '';

    // 1) rimuovi costrutti liquid/jekyll
    text = text.replace(/\{\%[\s\S]*?\%\}/g, ' ');
    text = text.replace(/\{\{[\s\S]*?\}\}/g, ' ');

    // 1bis) Collassa le "display equations" salvate come \( \begin{gathered}...\end{gathered} \)
    //       o \( \begin{aligned}...\end{aligned} \) (e anche le versioni \[ ... \]) in un semplice separatore.
    //       Così in search results non compaiono \begin{gathered}/\end{gathered}, che sono lunghi e "brutti".
    text = text.replace(
      /\\\(\s*\\begin\{(gathered|aligned)\}[\s\S]*?\\end\{\1\}\s*\\\)/g,
      ' … '
    );
    text = text.replace(
      /\\\[\s*\\begin\{(gathered|aligned)\}[\s\S]*?\\end\{\1\}\s*\\\]/g,
      ' … '
    );

    // (opzionale ma utile) Se mai compaiono senza \( \) / \[ \], collassa anche queste:
    text = text.replace(
      /\\begin\{(gathered|aligned)\}[\s\S]*?\\end\{\1\}/g,
      ' … '
    );

    // 2) Proteggi le porzioni LaTeX $...$ e $$...$$ con placeholder
    const latexPlaces = [];
    text = text.replace(/(\$\$?)([\s\S]*?)(\1)/g, function(_, open, body, close){
      const id = '<<LATEX' + latexPlaces.length + '>>';
      latexPlaces.push(open + body + close);
      return id;
    });

    // 3) Inserisci separatore tra pezzi incollati:
    //    a) fine frase/signo di interpunzione + parola con Maiuscola (es: ".Paradosso")
    text = text.replace(/([.!?])(\p{Lu})/gu, '$1 … $2');

    //    b) minuscola/numero + Maiuscola+minuscola (es: "rappresentaIl" -> "rappresenta … Il")
    //       nota: qui non tocchiamo sequenze di sole maiuscole (es. "MC")
    text = text.replace(/([\p{Ll}\p{N}])(\p{Lu})(?=\p{Ll})/gu, '$1 … $2');

    // 4) normalizza spazi e ritorna il contenuto ripristinando i latex placeholder
    text = text.replace(/\s+/g, ' ').trim();

    // ripristina i blocchi LaTeX nella posizione originale
    if (latexPlaces.length) {
      for (let i = 0; i < latexPlaces.length; i++) {
        const id = '<<LATEX' + i + '>>';
        text = text.replace(id, latexPlaces[i]);
      }
    }

    return text;
  }

  function escapeHtml(s) {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderLatexInHtml(plainText) {
    const katex = pickKatex();
    const s = escapeHtml(plainText);

    if (!katex || typeof katex.renderToString !== 'function') {
      return s;
    }

    const parts = [];
    let i = 0;

    function pushText(t) {
      if (t) parts.push(t);
    }

    while (i < s.length) {
      const next = s.indexOf('$', i);
      if (next === -1) {
        pushText(s.slice(i));
        break;
      }
      pushText(s.slice(i, next));

      const isDisplay = s.startsWith('$$', next);
      const delim = isDisplay ? '$$' : '$';
      const start = next + delim.length;
      const end = s.indexOf(delim, start);
      if (end === -1) {
        pushText(s.slice(next));
        break;
      }

      const latex = s.slice(start, end).trim();
      if (!latex) {
        pushText(delim + delim);
        i = end + delim.length;
        continue;
      }

      try {
        const html = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: isDisplay,
          strict: 'ignore'
        });
        parts.push(html);
      } catch {
        pushText(escapeHtml(delim) + escapeHtml(latex) + escapeHtml(delim));
      }

      i = end + delim.length;
    }

    return parts.join('');
  }

  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function stripBaseFromUrl(url) {
    const base = getBasePath();
    if (!url) return url;
    if (!base) return url;
    if (url === base) return '/';
    if (url.startsWith(base + '/')) return url.slice(base.length);
    return url;
  }

  // -------- DOM + logic --------

  const searchBtn = document.getElementById('content-search');
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const closeBtn = document.getElementById('search-close');

  if (!searchBtn || !overlay || !input || !results || !closeBtn) {
    return;
  }

  if (searchBtn.dataset.searchBound === '1') return;
  searchBtn.dataset.searchBound = '1';

  let indexData = null;
  let indexPromise = null;

  function setOverlayOpen(open) {
    overlay.style.display = open ? 'block' : 'none';
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      input.focus();
      input.select();
    }
  }

  function clearResults(messageHtml) {
    results.innerHTML = messageHtml ? `<div class="search-error">${messageHtml}</div>` : '';
  }

  function ensureIndexLoaded() {
    if (indexData) return Promise.resolve(indexData);
    if (indexPromise) return indexPromise;

    const url = getIndexUrl();
    indexPromise = fetch(url, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`Cannot load ${url} (${r.status})`);
        return r.json();
      })
      .then(data => {
        if (!Array.isArray(data)) throw new Error('Invalid search index (expected array)');
        indexData = data;
        return indexData;
      })
      .catch(err => {
        clearResults(escapeHtml(`Error: ${err.message}`));
        throw err;
      });

    return indexPromise;
  }

  function occCount(hay, needle) {
    if (!hay || !needle) return 0;
    let n = 0;
    let pos = 0;
    while (true) {
      const j = hay.indexOf(needle, pos);
      if (j === -1) return n;
      n++;
      pos = j + needle.length;
    }
  }

  function scoreMatchAND(haystack, tokens) {
    for (const t of tokens) {
      if (!t) continue;
      if (haystack.indexOf(t) === -1) return -1;
    }

    const idx = Math.min(...tokens.map(t => haystack.indexOf(t)).filter(i => i >= 0));
    let score = 0;
    if (idx >= 0) score += (5000 - idx);
    for (const t of tokens) score += occCount(haystack, t) * 20;
    return score > 0 ? score : -1;
  }

  function makeSnippet(text, q, maxLen) {
    const t = stripLiquidAndNoise(text);
    const lower = t.toLowerCase();
    const qi = q.toLowerCase();
    const i = lower.indexOf(qi);
    if (i === -1) return t.slice(0, maxLen);

    const start = Math.max(0, i - Math.floor(maxLen / 3));
    const end = Math.min(t.length, start + maxLen);

    const SEP = ' … ';

    // prendiamo il “core” senza aggiungere ancora puntini/separatori
    let core = t.slice(start, end);

    // Se il core termina dentro $...$, NON inserire ellissi prima di chiudere.
    const coreDollarCount = (core.match(/\$/g) || []).length;
    if (coreDollarCount % 2 === 1) {
      // prova ad estendere fino al prossimo '$' (max 200 char)
      const rest = t.slice(end, Math.min(t.length, end + 200));
      const nextDollar = rest.indexOf('$');
      if (nextDollar >= 0) {
        core = core + t.slice(end, end + nextDollar + 1);
      } else {
        // fallback: taglia via la parte di LaTeX rimasta aperta
        const lastDollar = core.lastIndexOf('$');
        if (lastDollar >= 0) core = core.slice(0, lastDollar);
      }
    }

    // ora possiamo aggiungere separatori VISIBILI tra pezzi, senza rompere KaTeX
    let snippet = core;
    if (start > 0) snippet = '…' + SEP + snippet;
    if (end < t.length) snippet = snippet + SEP + '…';

    return snippet;
  }

  function renderResults(items, q) {
    if (!items.length) {
      clearResults('<div class="search-empty">Nessun risultato</div>');
      return;
    }

    results.innerHTML = '';

    items.forEach(item => {
      const a = document.createElement('a');
      a.href = toAbsoluteBookUrl(item.url);
      a.className = 'search-result';

      const urlEl = document.createElement('div');
      urlEl.className = 'search-url';
      urlEl.textContent = stripBaseFromUrl(item.url);

      const snippet = makeSnippet(item.content || '', q, 240);
      const snippetEl = document.createElement('div');
      snippetEl.className = 'search-snippet';
      snippetEl.dataset.rawSnippet = snippet;
      snippetEl.innerHTML = renderLatexInHtml(snippet);

      a.appendChild(urlEl);
      a.appendChild(snippetEl);

      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const targetUrl = toAbsoluteBookUrl(item.url);

        const frame = document.getElementById('toc-split-frame');
        if (frame) {
          frame.setAttribute('src', targetUrl);
          try {
            const u = new URL(window.location.href);
            u.searchParams.set('load', stripBaseFromUrl(item.url));
            window.history.pushState({}, '', u.toString());
          } catch {}
        } else {
          window.location.href = targetUrl;
        }

        setOverlayOpen(false);
      });

      results.appendChild(a);
    });

    ensureKatexLoaded().then((k) => {
      if (!k) return;
      document.querySelectorAll('#search-results .search-snippet').forEach((el) => {
        const raw = el.dataset.rawSnippet || el.textContent || '';
        el.innerHTML = renderLatexInHtml(raw);
      });
    }).catch(() => {});
  }

  function isBigTocResult(url) {
    // url nel search index è tipicamente tipo "/it/..." (senza baseurl).
    // In ogni caso, normalizziamo togliendo l’eventuale base e i doppioni di slash.
    const u = (stripBaseFromUrl(url || '') || '').replace(/\/{2,}/g, '/');

    // Escludi home lingua + varianti comuni della big TOC
    // (/it/, /it, /it/index.html, /it/toc-big.html, ecc.)
    return (
      /^\/(it|en)\/?$/.test(u) ||
      /^\/(it|en)\/index(?:\.html)?$/.test(u) ||
      /^\/(it|en)\/toc-big(?:\.html)?$/.test(u) ||
      /^\/(it|en)\/toc_big(?:\.html)?$/.test(u)
    );
  }

  function doSearch(raw) {
    const qRaw = (raw || '').trim();
    if (!qRaw) {
      clearResults('');
      return;
    }

    const qTrim = qRaw.trim();

    const quoted = (qTrim.startsWith('"') && qTrim.endsWith('"') && qTrim.length >= 2);
    const phraseRaw = quoted ? qTrim.slice(1, -1) : qTrim;

    const wantsPhrase = quoted || /\s/.test(phraseRaw);

    const phraseNorm = normalize(phraseRaw);
    const tokens = normalize(qRaw).split(' ').filter(Boolean);

    ensureIndexLoaded().then(data => {
      const scored = [];

      for (const item of data) {
        if (isBigTocResult(item.url)) continue;
        const hay = normalize(stripLiquidAndNoise((item.content || '') + ' ' + (item.title || '')));

        let s = -1;

        if (wantsPhrase) {
          if (!phraseNorm) continue;
          const idx = hay.indexOf(phraseNorm);
          if (idx === -1) continue;
          s = (5000 - idx) + occCount(hay, phraseNorm) * 300;
        } else {
          s = scoreMatchAND(hay, tokens);
          if (s < 0) continue;
        }

        scored.push({ s, item });
      }

      scored.sort((a, b) => b.s - a.s);
      const top = scored.slice(0, 80).map(x => x.item);
      renderResults(top, qRaw);
    }).catch(() => {});
  }

  // -------- events --------

  searchBtn.addEventListener('click', () => {
    setOverlayOpen(true);
    clearResults('');
    ensureIndexLoaded().catch(() => {});
    ensureKatexLoaded().catch(() => {});
  });

  closeBtn.addEventListener('click', () => setOverlayOpen(false));

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) setOverlayOpen(false);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && overlay.style.display !== 'none') {
      setOverlayOpen(false);
    }
  });

  let t = null;
  input.addEventListener('input', () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => doSearch(input.value), 80);
  });

})();
