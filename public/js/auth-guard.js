/* ============================================================
   Mavix Web — auth-guard.js
   Подключается на страницах кабинета. Если нет access-токена,
   моментально редиректит на /login.
   ============================================================ */

(function () {
  if (!window.MavixAPI) {
    window.location.href = '/login';
    return;
  }
  if (!window.MavixAPI.session.isAuthenticated()) {
    window.location.href = '/login';
  }
})();
