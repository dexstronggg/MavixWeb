/* ============================================================
   Mavix Web — cabinet.js
   Общая логика для всех страниц личного кабинета:
   1) Подстановка email/USER_ID/инициала в шапку и сайдбар,
      снятие скелетонов.
   2) Health-check сервера при загрузке. Если /api/v1/health не
      ответил за 5 секунд — показываем мягкий жёлтый баннер.
   Подключается на dashboard, docs-*, software, settings.
   ============================================================ */

(function () {
  const API = window.MavixAPI;
  if (!API) return;

  const HEALTH_TIMEOUT_MS = 5000;
  const BANNER_DISMISS_KEY = 'mavix_health_banner_dismissed_at';
  const BANNER_DISMISS_WINDOW_MS = 5 * 60 * 1000; // не показывать 5 минут после дисмисса

  // ---------- Профиль в шапке/сайдбаре ----------

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

  function fillProfile() {
    const email = API.session.email || '';
    const userId = API.session.userId || '';
    const initial = (email[0] || 'M').toUpperCase();

    setText('[data-role="header-email"]', email || '—');
    setText('[data-role="avatar"]', initial);
    setText('[data-role="email"]', email || '—');
    setText('[data-role="hello-email"]', email || 'оператор');

    // USER_ID: показываем только если действительно есть значение;
    // иначе скрываем элемент, чтобы под «онлайн» не висело тире.
    const idEl = document.querySelector('[data-role="user-id"]');
    if (idEl) {
      if (userId) {
        idEl.textContent = maskId(userId);
        idEl.classList.remove('is-skeleton');
      } else {
        idEl.style.display = 'none';
      }
    }
  }

  // ---------- Health-баннер ----------

  function showHealthBanner() {
    if (document.querySelector('[data-role="health-banner"]')) return;

    const banner = document.createElement('div');
    banner.className = 'banner-top';
    banner.setAttribute('role', 'status');
    banner.setAttribute('data-role', 'health-banner');
    banner.innerHTML =
      '<span>⚠ Сервер Mavix не отвечает. Часть функций — вход, скачивание, ' +
      'смена пароля — сейчас недоступна.</span>' +
      '<button type="button" class="banner-top-close" aria-label="Закрыть">✕</button>';

    document.body.insertBefore(banner, document.body.firstChild);

    banner.querySelector('.banner-top-close').addEventListener('click', () => {
      banner.remove();
      try { sessionStorage.setItem(BANNER_DISMISS_KEY, String(Date.now())); } catch (_) {}
    });
  }

  function bannerRecentlyDismissed() {
    try {
      const ts = Number(sessionStorage.getItem(BANNER_DISMISS_KEY) || 0);
      return ts && (Date.now() - ts < BANNER_DISMISS_WINDOW_MS);
    } catch (_) {
      return false;
    }
  }

  function checkHealth() {
    if (bannerRecentlyDismissed()) return;

    let settled = false;
    const timeout = new Promise((_, reject) => {
      setTimeout(() => {
        if (!settled) reject(new Error('health-timeout'));
      }, HEALTH_TIMEOUT_MS);
    });

    Promise.race([API.health(), timeout])
      .then(() => { settled = true; })
      .catch(() => {
        settled = true;
        showHealthBanner();
      });
  }

  // ---------- Старт ----------

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    fillProfile();
    checkHealth();
  });
})();
