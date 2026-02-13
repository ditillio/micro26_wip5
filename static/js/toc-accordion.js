/* toc-accordion.js
 *
 * TOC split:
 * - Chapter click toggles accordion (no navigation)
 * - Section click loads into right iframe (id="toc-split-frame")
 * - Clicking EN/IT inside the iframe switches BOTH:
 *   - parent page (/it/index <-> /en/index)
 *   - iframe content (same section translated)
 *
 * IMPORTANT: do nothing when running inside the iframe.
 */
(function () {
  // If we're inside the iframe, do nothing.
  if (window.self !== window.top) return;

  const chapterEls = Array.from(document.querySelectorAll('.chapter_link'));
  if (!chapterEls.length) return; // not a TOC page

  // Right iframe in split layout
  const frame =
    document.querySelector('#toc-split-frame') ||
    document.querySelector('#content-frame') ||
    document.querySelector('iframe.toc-split-frame') ||
    document.querySelector('iframe[data-toc-split]');

  const isSplit = !!frame;

  function isModifiedClick(ev) {
    return ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button === 1;
  }

  function absUrl(href, base) {
    try { return new URL(href, base).toString(); }
    catch { return href; }
  }

  function ensureTrailingSlash(urlStr) {
    try {
      const u = new URL(urlStr, window.location.href);
      if (!u.pathname.endsWith('/')) u.pathname += '/';
      return u.toString();
    } catch {
      return urlStr;
    }
  }

  // -----------------------------------------
  // 0) If parent URL has ?load=..., load it into iframe
  // -----------------------------------------
  if (isSplit) {
    try {
      const params = new URLSearchParams(window.location.search);
      const load = params.get('load');
      if (load) frame.src = absUrl(load, window.location.href);
    } catch (_) {}
  }

  // -----------------------------------------
  // 1) Accordion: fetch chapter TOC and build sections list
  // -----------------------------------------
  const sectionsCache = new Map();

  function extractSectionLinksFromChapterTOC(htmlDoc, chapterAbsHref) {
    const links = Array.from(htmlDoc.querySelectorAll('a[href]'));
    const out = [];

    for (const a of links) {
      const href = a.getAttribute('href');
      if (!href) continue;
      if (href.startsWith('#')) continue;

      const full = absUrl(href, chapterAbsHref);

      try {
        const u = new URL(full);
        const ch = new URL(chapterAbsHref);

        // must be inside the chapter path and deeper
        const chPath = ch.pathname.endsWith('/') ? ch.pathname : (ch.pathname + '/');
        if (!u.pathname.startsWith(chPath)) continue;
        if (u.pathname === chPath || u.pathname === chPath.slice(0, -1)) continue;

        // accept only paths ending with /<digit> or /<digit>/<digit>
        if (!/\/\d+(\/\d+)?\/?$/.test(u.pathname)) continue;

        const title = (a.textContent || '').trim();
        if (!title) continue;

        out.push({ href: u.toString(), title });
      } catch (_) {}
    }

    // De-duplicate by href
    const seen = new Set();
    return out.filter(x => (seen.has(x.href) ? false : (seen.add(x.href), true)));
  }

  function makeSectionsList(chapterNumberText, sections) {
    const wrap = document.createElement('div');
    wrap.className = 'chapter_sections';

    const ul = document.createElement('ul');
    ul.className = 'chapter_sections_list';

    for (const s of sections) {
      let secNum = '';
      try {
        const u = new URL(s.href);
        const parts = u.pathname.split('/').filter(Boolean);
        secNum = parts[parts.length - 1];
      } catch (_) {}

      const li = document.createElement('li');
      li.className = 'section_link';

      const num = document.createElement('span');
      num.className = 'section_number';
      num.textContent = chapterNumberText + '.' + secNum;

      const a = document.createElement('a');
      a.href = s.href;
      a.textContent = s.title;

      if (isSplit) {
        a.addEventListener('click', (ev) => {
          if (isModifiedClick(ev)) return;
          ev.preventDefault();
          frame.src = absUrl(a.getAttribute('href'), window.location.href);
        });
      }

      li.appendChild(num);
      li.appendChild(a);
      ul.appendChild(li);
    }

    wrap.appendChild(ul);
    return wrap;
  }

  async function toggleChapter(chapterEl) {
    if (chapterEl.dataset.busy === '1') return; // evita doppi click ravvicinati
    chapterEl.dataset.busy = '1';

    try {
      const a = chapterEl.querySelector('a[href]');
      const numEl = chapterEl.querySelector('.number');
      if (!a || !numEl) return;

      const chapterNum = (numEl.textContent || '').trim();
      const chapterAbsHref = ensureTrailingSlash(absUrl(a.getAttribute('href'), window.location.href));

      // If already open -> close
      const existing = chapterEl.nextElementSibling;
      if (existing && existing.classList && existing.classList.contains('chapter_sections')) {
        existing.remove();
        chapterEl.classList.remove('open');
        return;
      }

      // IMPORTANT: NON chiudiamo gli altri capitoli aperti.
      chapterEl.classList.add('open');

      // Fetch or use cache
      let htmlDoc;
      if (sectionsCache.has(chapterAbsHref)) {
        htmlDoc = new DOMParser().parseFromString(sectionsCache.get(chapterAbsHref), 'text/html');
      } else {
        const res = await fetch(chapterAbsHref, { credentials: 'same-origin' });
        const html = await res.text();
        sectionsCache.set(chapterAbsHref, html);
        htmlDoc = new DOMParser().parseFromString(html, 'text/html');
      }

      const sections = extractSectionLinksFromChapterTOC(htmlDoc, chapterAbsHref);
      if (!sections.length) return;

      const list = makeSectionsList(chapterNum, sections);
      chapterEl.insertAdjacentElement('afterend', list);
    } finally {
      chapterEl.dataset.busy = '0';
    }
  }

  // Bind click on chapter rows: toggle accordion, DO NOT navigate.
  for (const ch of chapterEls) {
    const a = ch.querySelector('a[href]');
    if (!a) continue;

    a.addEventListener('click', async (ev) => {
      if (isModifiedClick(ev)) return;
      ev.preventDefault();
      try {
        await toggleChapter(ch);
      } catch (e) {
        console.error(e);
      }
    });
  }

  // Preface / Prefazione in split mode should load inside iframe
  if (isSplit) {
    const prefaceLink =
      document.querySelector('a[href$="pr.html"]') ||
      document.querySelector('a[href$="/pr.html"]');

    if (prefaceLink) {
      prefaceLink.addEventListener('click', (ev) => {
        if (isModifiedClick(ev)) return;
        ev.preventDefault();
        frame.src = absUrl(prefaceLink.getAttribute('href'), window.location.href);
      });

      // Default initial page if iframe is empty
      if (!frame.getAttribute('src')) {
        frame.src = absUrl(prefaceLink.getAttribute('href'), window.location.href);
      }
    }
  }

  // -----------------------------------------
  // 2) Language sync:
  //    clicking EN/IT inside iframe navigates parent TOC page too
  // -----------------------------------------
  function mapSectionUrlToLang(sectionUrl, targetLang) {
    try {
      const u = new URL(sectionUrl, window.location.href);
      u.pathname = u.pathname.replace(/\/(it|en)\//, `/${targetLang}/`);
      return u.toString();
    } catch (_) {
      return sectionUrl;
    }
  }

  function parentIndexUrlForLang(targetLang) {
    const u = new URL(window.location.href);
    u.pathname = u.pathname.replace(/\/(it|en)\//, `/${targetLang}/`);
    return u;
  }

  function installIframeLanguageHook() {
    if (!isSplit) return;

    frame.addEventListener('load', () => {
      let doc;
      try { doc = frame.contentDocument; } catch (_) { return; }
      if (!doc) return;

      const langLinks = Array.from(doc.querySelectorAll('a[href]'))
        .filter(a => {
          const t = (a.textContent || '').trim().toUpperCase();
          return (t === 'EN' || t === 'IT');
        });

      if (!langLinks.length) return;

      langLinks.forEach(a => {
        if (a.__splitLangHooked) return;
        a.__splitLangHooked = true;

        a.addEventListener('click', (ev) => {
          if (isModifiedClick(ev)) return;
          ev.preventDefault();

          const targetLang = ((a.textContent || '').trim().toLowerCase() === 'en') ? 'en' : 'it';

          const currentIframeUrl = frame.contentWindow ? frame.contentWindow.location.href : frame.src;
          const mapped = mapSectionUrlToLang(currentIframeUrl, targetLang);

          const parentUrl = parentIndexUrlForLang(targetLang);
          parentUrl.search = '';
          parentUrl.searchParams.set('load', mapped);

          window.location.href = parentUrl.toString();
        });
      });
    });
  }

  installIframeLanguageHook();
})();
