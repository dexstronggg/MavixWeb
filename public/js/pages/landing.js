(function () {
  const API = window.MavixAPI;
  if (!API) return;

  function $(selector, root) { return (root || document).querySelector(selector); }

  function applyGuestState() {
    const guest = $('[data-role="header-actions-guest"]');
    const auth = $('[data-role="header-actions-auth"]');
    if (guest) guest.hidden = false;
    if (auth) auth.hidden = true;

    document.querySelectorAll('[data-cta-guest-href]').forEach((cta) => {
      const href = cta.getAttribute('data-cta-guest-href');
      const text = cta.getAttribute('data-cta-guest-text');
      if (href) cta.setAttribute('href', href);
      if (text) {
        const textEl = cta.querySelector('[data-role$="-text"]');
        if (textEl) textEl.textContent = text;
      }
    });

    const secondary = $('[data-role="footer-cta-secondary"]');
    if (secondary) secondary.hidden = false;
  }

  function applyAuthState() {
    const guest = $('[data-role="header-actions-guest"]');
    const auth = $('[data-role="header-actions-auth"]');
    if (guest) guest.hidden = true;
    if (auth) auth.hidden = false;

    document.querySelectorAll('[data-cta-auth-href]').forEach((cta) => {
      const href = cta.getAttribute('data-cta-auth-href');
      const text = cta.getAttribute('data-cta-auth-text');
      if (href) cta.setAttribute('href', href);
      if (text) {
        const textEl = cta.querySelector('[data-role$="-text"]');
        if (textEl) textEl.textContent = text;
      }
    });

    const secondary = $('[data-role="footer-cta-secondary"]');
    if (secondary) secondary.hidden = true;
  }

  function bindLogout() {
    document.querySelectorAll('[data-action="logout-landing"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        API.logout();
        window.location.reload();
      });
    });
  }

  function init() {
    bindLogout();

    const authenticated = API.session.isAuthenticated();
    if (authenticated) {
      applyAuthState();

      API.ensureFreshAccess().then((ok) => {
        if (!ok) applyGuestState();
      }).catch(() => applyGuestState());
    } else {
      applyGuestState();
    }
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();