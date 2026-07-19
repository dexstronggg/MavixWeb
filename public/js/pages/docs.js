(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    if (!('IntersectionObserver' in window)) return;

    const inlineToc = document.querySelector('.doc-toc');
    if (!inlineToc) return;

    if (window.matchMedia && !window.matchMedia('(min-width: 1280px)').matches) {
      return;
    }

    const sourceLinks = Array.from(inlineToc.querySelectorAll('a[href^="#"]'));
    if (!sourceLinks.length) return;

    const aside = document.createElement('aside');
    aside.className = 'floating-toc';
    aside.setAttribute('aria-hidden', 'true');
    const list = document.createElement('ol');
    aside.appendChild(list);

    const linkById = new Map();

    sourceLinks.forEach((src) => {
      const href = src.getAttribute('href') || '';
      const id = href.startsWith('#') ? href.slice(1) : '';
      if (!id || !document.getElementById(id)) return;

      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = href;
      a.textContent = src.textContent.trim();
      li.appendChild(a);
      list.appendChild(li);
      linkById.set(id, a);
    });

    if (!linkById.size) return;
    document.body.appendChild(aside);

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          aside.classList.toggle('is-visible', !entry.isIntersecting);
        });
      },
      { threshold: 0 }
    );
    visibilityObserver.observe(inlineToc);

    let activeId = null;
    const setActive = (id) => {
      if (id === activeId) return;
      if (activeId) {
        const prev = linkById.get(activeId);
        if (prev) prev.classList.remove('is-active');
      }
      activeId = id;
      if (id) {
        const next = linkById.get(id);
        if (next) next.classList.add('is-active');
      }
    };

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => ({ id: e.target.id, top: e.boundingClientRect.top }));
        if (visible.length) {
          visible.sort((a, b) => a.top - b.top);
          setActive(visible[0].id);
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );

    linkById.forEach((_link, id) => {
      const target = document.getElementById(id);
      if (target) sectionObserver.observe(target);
    });
  });
})();