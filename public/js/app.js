/* ============================================================
   Mavix Web — app.js
   Общие хелперы: мобильное меню, помощник логаута, активные ссылки.
   ============================================================ */

(function () {
  function setupMenuToggle() {
    const toggle = document.getElementById('menu-toggle');
    const nav = document.getElementById('nav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
      const isOpen = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', String(!isOpen));
      toggle.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  function highlightCurrentNavLinks() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    document.querySelectorAll('.nav-link, .sidebar-link').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      const normalized = href.replace(/\/+$/, '') || '/';
      if (normalized === path) {
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  function setupLogoutButtons() {
    document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.MavixAPI) window.MavixAPI.logout();
        window.location.href = '/login';
      });
    });
  }

  function setupCardGlow() {
    document.querySelectorAll('.card-glow').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const rect = card.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * 100;
        const my = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mx', `${mx}%`);
        card.style.setProperty('--my', `${my}%`);
      });
    });
  }

  function setupVideoFallback() {
    const video = document.querySelector('[data-role="demo-video"]');
    const placeholder = document.querySelector('[data-role="video-placeholder"]');
    if (!video || !placeholder) return;
    const source = video.querySelector('source');
    if (!source) return;
    const showFallback = () => {
      if (video.parentNode) video.parentNode.removeChild(video);
      placeholder.hidden = false;
    };
    source.addEventListener('error', showFallback);
    video.addEventListener('error', showFallback);
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    setupMenuToggle();
    highlightCurrentNavLinks();
    setupLogoutButtons();
    setupCardGlow();
    setupVideoFallback();
  });
})();
