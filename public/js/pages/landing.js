/* ============================================================
   Mavix Web — landing.js
   Логика лендинга для авторизованного пользователя.
   - Если в localStorage есть access/refresh токен — в шапке
     показываем email + ссылку «Личный кабинет» + «Выйти»
     вместо кнопок «Войти/Зарегистрироваться».
   - Hero и нижний CTA «Создать аккаунт» превращаются
     в «Перейти в кабинет» с href=/dashboard.
   - Чтобы не было мигания, оба header-блока в HTML по умолчанию
     скрыты (hidden), и нужный мы показываем синхронно по факту
     наличия токена в localStorage. Проверка refresh-токена
     уходит в фон: если refresh умер — откатываемся на гостя.
   ============================================================ */

(function () {
  const API = window.MavixAPI;
  if (!API) return;

  function $(selector, root) { return (root || document).querySelector(selector); }

  function applyGuestState() {
    const guest = $('[data-role="header-actions-guest"]');
    const auth = $('[data-role="header-actions-auth"]');
    if (guest) guest.hidden = false;
    if (auth) auth.hidden = true;

    // CTA в hero и нижней секции — гостевой вариант (исходный).
    document.querySelectorAll('[data-cta-guest-href]').forEach((cta) => {
      const href = cta.getAttribute('data-cta-guest-href');
      const text = cta.getAttribute('data-cta-guest-text');
      if (href) cta.setAttribute('href', href);
      if (text) {
        const textEl = cta.querySelector('[data-role$="-text"]');
        if (textEl) textEl.textContent = text;
      }
    });

    // Вторая кнопка нижнего CTA («У меня уже есть аккаунт») — показать.
    const secondary = $('[data-role="footer-cta-secondary"]');
    if (secondary) secondary.hidden = false;
  }

  function applyAuthState(email) {
    const guest = $('[data-role="header-actions-guest"]');
    const auth = $('[data-role="header-actions-auth"]');
    if (guest) guest.hidden = true;
    if (auth) auth.hidden = false;

    const emailEl = $('[data-role="header-email"]', auth);
    if (emailEl) emailEl.textContent = email || '—';

    // CTA в hero и нижней секции — auth-вариант (в кабинет).
    document.querySelectorAll('[data-cta-auth-href]').forEach((cta) => {
      const href = cta.getAttribute('data-cta-auth-href');
      const text = cta.getAttribute('data-cta-auth-text');
      if (href) cta.setAttribute('href', href);
      if (text) {
        const textEl = cta.querySelector('[data-role$="-text"]');
        if (textEl) textEl.textContent = text;
      }
    });

    // «У меня уже есть аккаунт» в нижнем CTA для авторизованного
    // пользователя избыточен — он уже вошёл.
    const secondary = $('[data-role="footer-cta-secondary"]');
    if (secondary) secondary.hidden = true;
  }

  function bindLogout() {
    document.querySelectorAll('[data-action="logout-landing"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        API.logout();
        // Остаёмся на лендинге, но уже как гость — перезагружаем, чтобы
        // вся UI-логика страницы перерисовалась с нуля.
        window.location.reload();
      });
    });
  }

  function init() {
    bindLogout();

    // Синхронная проверка по наличию токена в localStorage — мгновенная,
    // мигания нет. Это «оптимистичное» решение: если refresh мёртв,
    // фоновая проверка ниже откатит на гостя.
    const authenticated = API.session.isAuthenticated();
    if (authenticated) {
      applyAuthState(API.session.email);

      // Фоном валидируем refresh. Если он мёртв — ensureFreshAccess()
      // вернёт false и сам очистит токены через tryRefresh(). Тогда
      // показываем гостевой блок обратно.
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
