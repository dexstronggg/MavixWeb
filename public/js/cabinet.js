/* ============================================================
   Mavix Web — cabinet.js
   Подставляет email/USER_ID/инициал в шапку и сайдбар на всех
   страницах личного кабинета. Снимает скелетоны, когда значения
   проставлены. Подключается на dashboard, docs-*, software.
   ============================================================ */

(function () {
  const API = window.MavixAPI;
  if (!API) return;

  function maskId(id) {
    if (!id) return '';
    if (id.length <= 16) return id;
    return `${id.slice(0, 8)}…${id.slice(-8)}`;
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    if (value) el.textContent = value;
    el.classList.remove('is-skeleton');
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    const email = API.session.email || '';
    const userId = API.session.userId || '';
    const initial = (email[0] || 'M').toUpperCase();

    setText('[data-role="header-email"]', email || '—');
    setText('[data-role="avatar"]', initial);
    setText('[data-role="email"]', email || '—');
    setText('[data-role="user-id"]', maskId(userId) || '—');
    setText('[data-role="hello-email"]', email || 'оператор');
  });
})();
