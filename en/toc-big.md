---
layout: big-toc
title: Indice (grande)
---

<script>
(function(){
  // Questo script serve SOLO quando toc-big è caricato dentro l'iframe dello split.
  if (window.self === window.top) return;

  function isModifiedClick(ev){
    return ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button === 1;
  }

  document.addEventListener('click', function(ev){
    var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if (!a) return;
    if (a.target === '_blank') return;
    if (isModifiedClick(ev)) return;

    var href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) return;

    // intercetta solo link interni (prefazione/capitoli/sezioni)
    var isPreface = href.endsWith('pr.html') || href.endsWith('/pr.html');
    var looksLikeSection = /\/\d+$/.test(href);          // es. ./I/1/1
    var looksLikeChapter = /\/[^\/]+\/[^\/]+$/.test(href) && !looksLikeSection; // es. ./I/1

    if (!(isPreface || looksLikeChapter || looksLikeSection)) return;

    ev.preventDefault();
    ev.stopPropagation();

    // IMPORTANTISSIMO: same-origin
    window.parent.postMessage({ type: 'toc-load', path: href }, window.location.origin);
  }, true);
})();
</script>
