/* ============================================================
   Mavix Web — auth-guard.js
   Подключается на страницах кабинета. Логика входа:
     1. Если в localStorage вообще ничего нет (ни access, ни refresh) —
        моментально редиректим на /login.
     2. Если есть refresh, но access истёк или скоро истечёт — пробуем
        тихо обновить через /auth/refresh. Только если refresh-токен
        тоже мёртв — редиректим на /login.
     3. Запускаем фоновый refresh-таймер, чтобы access не успевал
        протухать, пока пользователь сидит на странице.
   Цель: после возврата в браузер через час/день пользователь видит
   кабинет, а не форму логина (пока его 30-дневный refresh ещё жив).
   ============================================================ */

(function () {
  const API = window.MavixAPI;
  if (!API) {
    window.location.href = '/login';
    return;
  }

  function goLogin() {
    try { API.stopBackgroundRefresh && API.stopBackgroundRefresh(); } catch (_) {}
    window.location.href = '/login';
  }

  // Нет ни access, ни refresh — заходить нечем.
  if (!API.session.isAuthenticated()) {
    goLogin();
    return;
  }

  // Если access ещё жив с запасом — ничего синхронно не блокируем,
  // просто запускаем фоновый таймер. Парсинг exp дёшев, страницу не
  // тормозит и не зависит от сети.
  if (!API.tokens.isAccessStale()) {
    API.startBackgroundRefresh();
    return;
  }

  // Access истёк или почти истёк. Пытаемся восстановить сессию
  // одним запросом к /auth/refresh. До завершения этого запроса
  // не редиректим — пользователь не должен моргать формой логина,
  // если у него ещё валидный refresh.
  API.ensureFreshAccess().then((ok) => {
    if (!ok) {
      // Refresh не помог: либо его нет, либо сервер ответил 401/403
      // и ensureFreshAccess уже почистил localStorage.
      goLogin();
      return;
    }
    API.startBackgroundRefresh();
  }).catch(() => {
    // Сеть прилегла. Не выкидываем пользователя — оставляем то, что
    // есть в localStorage, чтобы при восстановлении связи он не
    // потерял сессию. visibilitychange/следующий 401 перезапустит
    // механизм.
  });
})();
