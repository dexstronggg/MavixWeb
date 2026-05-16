(function () {
  const API = window.MavixAPI;
  if (!API) return;

  function maskId(id) {
    if (!id) return '—';
    if (id.length <= 16) return id;
    return `${id.slice(0, 8)}…${id.slice(-8)}`;
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    const email = API.session.email || 'оператор';
    const userId = API.session.userId || '';

    const helloEl = document.querySelector('[data-role="hello-email"]');
    if (helloEl) helloEl.textContent = email;

    const avatarEl = document.querySelector('[data-role="avatar"]');
    if (avatarEl) avatarEl.textContent = (email[0] || 'M').toUpperCase();

    const emailEl = document.querySelector('[data-role="email"]');
    if (emailEl) emailEl.textContent = email;

    const idEl = document.querySelector('[data-role="user-id"]');
    if (idEl) idEl.textContent = maskId(userId);
  });
})();
