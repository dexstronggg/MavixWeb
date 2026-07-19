(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof IntersectionObserver === 'undefined') return;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    const sections = document.querySelectorAll('main > section');
    if (!sections.length) return;

    const viewport = window.innerHeight;
    const toReveal = [];

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.top < viewport * 0.85) return;
      section.classList.add('reveal');
      toReveal.push(section);
    });

    if (!toReveal.length) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    toReveal.forEach((s) => io.observe(s));
  });
})();