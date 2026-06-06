/* ============================================================
   Mavix Web — api.js
   Клиент к MavixServer (FastAPI, http://localhost:8000).
   Все запросы идут на API_BASE_URL + '/api/v1/...'.
   ============================================================ */

(function () {
  const CFG = (typeof window !== 'undefined' && window.MAVIX_CONFIG) || {};
  const BASE = (CFG.apiBaseUrl || 'http://localhost:8000').replace(/\/+$/, '') + '/api/v1';

  const STORAGE_KEYS = {
    access: 'mavix_access',
    refresh: 'mavix_refresh',
    email: 'mavix_email',
    // Ключ хранилища оставляем прежним для совместимости, но кладём в него
    // admin_id (бэкенд переименовал user_id → admin_id в /auth/register).
    userId: 'mavix_user_id',
  };

  const LIMITS = {
    PASSWORD_MIN: 8,
    PASSWORD_MAX: 72,
  };

  // Окно, за которое мы считаем access «почти истёкшим» и пытаемся
  // обновить его проактивно. JWT access живёт 15 минут, поэтому 60 секунд —
  // комфортный буфер, чтобы запрос не успел уйти со старым токеном.
  const ACCESS_REFRESH_LEEWAY_SEC = 60;

  // Парсим payload JWT без верификации подписи — нам нужен только exp.
  // Подпись проверяет сервер; задача клиента — просто не тянуть запросы
  // с заведомо мёртвым токеном.
  function decodeJwtPayload(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
      // base64url -> base64
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
      const json = atob(b64 + pad);
      // atob возвращает binary string; для UTF-8 нужен decodeURIComponent-трюк,
      // но в нашем access payload только ASCII (email/uuid), поэтому достаточно.
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  function tokenExpiresInSec(token) {
    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload.exp !== 'number') return null;
    return payload.exp - Math.floor(Date.now() / 1000);
  }

  const tokens = {
    get access() { return localStorage.getItem(STORAGE_KEYS.access) || ''; },
    get refresh() { return localStorage.getItem(STORAGE_KEYS.refresh) || ''; },
    save(access, refresh) {
      if (access) localStorage.setItem(STORAGE_KEYS.access, access);
      if (refresh) localStorage.setItem(STORAGE_KEYS.refresh, refresh);
    },
    clear() {
      localStorage.removeItem(STORAGE_KEYS.access);
      localStorage.removeItem(STORAGE_KEYS.refresh);
      localStorage.removeItem(STORAGE_KEYS.email);
      localStorage.removeItem(STORAGE_KEYS.userId);
    },
    // Возвращает сколько секунд осталось у текущего access. null — если
    // токен невалидный/без exp.
    accessExpiresInSec() {
      return tokenExpiresInSec(this.access);
    },
    // Истёк ли access прямо сейчас (или истечёт в ближайший leeway).
    isAccessStale(leewaySec = ACCESS_REFRESH_LEEWAY_SEC) {
      const left = this.accessExpiresInSec();
      if (left === null) return false; // не можем распарсить — не трогаем
      return left <= leewaySec;
    },
  };

  const session = {
    saveProfile(email, userId) {
      if (email) localStorage.setItem(STORAGE_KEYS.email, email);
      if (userId) localStorage.setItem(STORAGE_KEYS.userId, userId);
    },
    get email() { return localStorage.getItem(STORAGE_KEYS.email) || ''; },
    get userId() { return localStorage.getItem(STORAGE_KEYS.userId) || ''; },
    // Авторизованным считаем, если есть хоть какой-то материал для
    // восстановления сессии: либо живой access, либо refresh — по
    // refresh мы умеем добыть новый access.
    isAuthenticated() { return Boolean(tokens.access || tokens.refresh); },
  };

  // ---------- HTTP ----------

  const REQUEST_TIMEOUT_MS = 10000;

  async function request(path, { method = 'GET', body, auth = false, retry = true, timeout = REQUEST_TIMEOUT_MS } = {}) {
    // Для защищённых запросов сначала пробуем обновить access, если он
    // уже истёк/почти истёк. Это убирает гарантированный лишний раунд
    // 401 → refresh → повтор, когда пользователь долго ничего не делал.
    if (auth && tokens.isAccessStale() && tokens.refresh) {
      await tryRefresh();
    }

    const headers = { 'Accept': 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && tokens.access) headers['Authorization'] = `Bearer ${tokens.access}`;

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), timeout);

    let response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (networkErr) {
      clearTimeout(timeoutId);
      if (networkErr && networkErr.name === 'AbortError') {
        throw new ApiError('Сервер не отвечает. Проверьте, что MavixServer запущен на ' + BASE.replace('/api/v1', '') + '.', 0, null);
      }
      throw new ApiError('Не удалось подключиться к серверу. Проверьте сеть.', 0, null);
    }
    clearTimeout(timeoutId);

    if (auth && response.status === 401 && retry && tokens.refresh) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return request(path, { method, body, auth, retry: false });
      }
      tokens.clear();
    }

    let payload = null;
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { payload = await response.json(); } catch (_) {}
    } else {
      try { payload = await response.text(); } catch (_) {}
    }

    if (!response.ok) {
      const message = extractErrorMessage(payload, response.status);
      throw new ApiError(message, response.status, payload);
    }

    return payload;
  }

  // Singleton-промис: если refresh уже летит, второй параллельный вызов
  // (например, из auth-guard и фонового таймера одновременно) подождёт тот
  // же промис, а не дёрнет сервер второй раз с тем же refresh-токеном.
  let refreshInFlight = null;

  function tryRefresh() {
    if (refreshInFlight) return refreshInFlight;

    const currentRefresh = tokens.refresh;
    if (!currentRefresh) return Promise.resolve(false);

    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ refresh_token: currentRefresh }),
        });
        if (!res.ok) {
          // 401/403 — refresh-токен мёртв (отозван/истёк). Чистим всё, чтобы
          // дальше код пошёл по пути «нужно логиниться заново».
          if (res.status === 401 || res.status === 403) {
            tokens.clear();
          }
          return false;
        }
        const data = await res.json();
        if (!data || !data.access_token) return false;
        // Сервер может (и в нашей реализации — будет) ротировать refresh.
        // Сохраняем оба, если оба пришли; иначе обновляем только access.
        tokens.save(data.access_token, data.refresh_token || null);
        return true;
      } catch (_) {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  }

  // Гарантирует, что access свежий: если до истечения осталось мало или
  // он уже мёртв — пробует refresh. Возвращает true, если после вызова у
  // нас есть пригодный access (или мы уверены, что он ещё жив). false —
  // refresh не получился и пользователю нужен повторный логин.
  async function ensureFreshAccess() {
    const access = tokens.access;
    const refresh = tokens.refresh;
    if (!access && !refresh) return false;
    if (!access && refresh) {
      // Access потеряли, но refresh есть — пытаемся восстановить.
      return tryRefresh();
    }
    // Access есть. Если exp непарсимый — считаем, что жив; если истекает
    // в ближайшую минуту — обновляем заранее.
    if (tokens.isAccessStale()) {
      if (!refresh) return false;
      return tryRefresh();
    }
    return true;
  }

  // Фоновый таймер. Запускается ровно один раз для всего приложения и
  // тикает по графику «обновись за минуту до истечения текущего access».
  // На /login и /landing смысла нет — там нет защищённого UI; вызывает
  // его явно auth-guard на защищённых страницах.
  let refreshTimerId = null;
  function scheduleNextRefresh() {
    if (refreshTimerId) {
      clearTimeout(refreshTimerId);
      refreshTimerId = null;
    }
    if (!tokens.refresh) return;
    const left = tokens.accessExpiresInSec();
    // Если exp непарсимый или уже истёк — обновим через секунду; иначе —
    // за ACCESS_REFRESH_LEEWAY_SEC до истечения, но не позже 12 минут
    // (страховка от очень долгих токенов в будущем).
    let delayMs;
    if (left === null) {
      delayMs = 12 * 60 * 1000;
    } else {
      const target = Math.max(1, left - ACCESS_REFRESH_LEEWAY_SEC);
      delayMs = Math.min(target, 12 * 60) * 1000;
    }
    refreshTimerId = setTimeout(async () => {
      refreshTimerId = null;
      const ok = await tryRefresh();
      // Если refresh жив — планируем следующий тик. Если умер — таймер
      // остановится сам, дальше следующий 401 или auth-guard вышвырнет.
      if (ok) scheduleNextRefresh();
    }, delayMs);
  }

  function startBackgroundRefresh() {
    if (typeof window === 'undefined') return;
    scheduleNextRefresh();
    // Если пользователь свернул вкладку на час и вернулся — access точно
    // протух. На visibilitychange сразу гарантируем свежий токен и
    // переинициализируем таймер.
    if (!startBackgroundRefresh._bound) {
      startBackgroundRefresh._bound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && tokens.refresh) {
          ensureFreshAccess().then((ok) => {
            if (ok) scheduleNextRefresh();
          });
        }
      });
      window.addEventListener('beforeunload', () => {
        if (refreshTimerId) clearTimeout(refreshTimerId);
      });
    }
  }

  function stopBackgroundRefresh() {
    if (refreshTimerId) {
      clearTimeout(refreshTimerId);
      refreshTimerId = null;
    }
  }

  function extractErrorMessage(payload, status) {
    if (payload && typeof payload === 'object') {
      if (typeof payload.detail === 'string') return payload.detail;
      if (Array.isArray(payload.detail) && payload.detail.length) {
        const first = payload.detail[0];
        if (first && first.msg) return first.msg;
      }
      if (payload.message) return payload.message;
    }
    if (typeof payload === 'string' && payload) return payload;

    switch (status) {
      case 401: return 'Неверный email или пароль.';
      case 403: return 'Доступ запрещён.';
      case 404: return 'Не найдено.';
      case 409: return 'Email уже зарегистрирован.';
      case 422: return 'Проверьте корректность введённых данных.';
      case 429: return 'Слишком много попыток. Попробуйте позже.';
      case 500:
      case 502:
      case 503:
      case 504: return 'Сервер временно недоступен. Попробуйте позже.';
      default: return 'Произошла ошибка. Попробуйте ещё раз.';
    }
  }

  class ApiError extends Error {
    constructor(message, status, payload) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.payload = payload;
    }
  }

  // ---------- Валидация ----------

  // Совместимо с EmailStr из Pydantic (RFC 5322 в упрощённом виде).
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateEmail(email) {
    if (!email) return 'Введите email';
    if (email.length > 254) return 'Email слишком длинный';
    if (!EMAIL_RE.test(email)) return 'Введите корректный email';
    return null;
  }

  function validatePassword(pw) {
    if (!pw) return 'Введите пароль';
    if (pw.length < LIMITS.PASSWORD_MIN) return `Минимум ${LIMITS.PASSWORD_MIN} символов`;
    if (pw.length > LIMITS.PASSWORD_MAX) return `Максимум ${LIMITS.PASSWORD_MAX} символов`;
    return null;
  }

  // ---------- API ----------

  async function register(email, password) {
    const data = await request('/auth/register', {
      method: 'POST',
      body: { email, password },
    });
    // Авто-логин после регистрации: сервер не возвращает токены — логинимся отдельно.
    // Сервер теперь отдаёт admin_id (а не user_id).
    if (data && data.email) {
      session.saveProfile(data.email, data.admin_id);
    }
    const loginData = await login(email, password);
    return loginData;
  }

  async function login(email, password) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    if (data && data.access_token) {
      tokens.save(data.access_token, data.refresh_token);
      session.saveProfile(email, session.userId);
    }
    return data;
  }

  function logout() {
    // На сервере нет /auth/logout — просто чистим локальное состояние
    // и останавливаем фоновый refresh, если он был запущен.
    stopBackgroundRefresh();
    tokens.clear();
  }

  async function passwordResetRequest(email) {
    return request('/auth/password-reset/request', {
      method: 'POST',
      body: { email },
    });
  }

  async function passwordResetConfirm(token, newPassword) {
    return request('/auth/password-reset/confirm', {
      method: 'POST',
      body: { token, new_password: newPassword },
    });
  }

  async function health() {
    return request('/health');
  }

  // ---------- Операторы ----------

  async function listOperators() {
    return request('/operators', { auth: true });
  }

  async function createOperator({ full_name, passport, address }) {
    return request('/operators', {
      method: 'POST',
      auth: true,
      body: { full_name, passport, address },
    });
  }

  async function setOperatorActive(id, isActive) {
    return request(`/operators/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      auth: true,
      body: { is_active: Boolean(isActive) },
    });
  }

  async function deleteOperator(id) {
    return request(`/operators/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  // ---------- Дроны ----------

  async function listDrones() {
    return request('/drones', { auth: true });
  }

  // ---------- Доставки ----------

  async function listDeliveries(status) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request(`/deliveries${qs}`, { auth: true });
  }

  async function createDelivery(body) {
    return request('/deliveries', {
      method: 'POST',
      auth: true,
      body,
    });
  }

  async function cancelDelivery(id) {
    return request(`/deliveries/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      auth: true,
    });
  }

  // ---------- Сборка для дрона (Board) ----------

  // Скачивание .tar.gz требует Bearer-токена, поэтому простой <a href> не
  // подходит — тянем через fetch с заголовком Authorization и возвращаем
  // { blob, filename } для последующего создания objectURL на странице.
  async function downloadBoardTarball() {
    // Гарантируем свежий access перед скачиванием — запрос идёт мимо
    // общего request(), значит авто-refresh на 401 здесь не сработает.
    await ensureFreshAccess();

    const url = `${BASE}/builds/board`;
    const headers = { 'Accept': 'application/octet-stream' };
    if (tokens.access) headers['Authorization'] = `Bearer ${tokens.access}`;

    let res;
    try {
      res = await fetch(url, { headers });
    } catch (_) {
      throw new ApiError('Сервер недоступен. Проверьте соединение или попробуйте позже.', 0, null);
    }

    if (!res.ok) {
      let payload = null;
      try { payload = await res.text(); } catch (_) {}
      throw new ApiError(extractErrorMessage(payload, res.status), res.status, payload);
    }

    const blob = await res.blob();
    const filename = extractFilenameFromDisposition(res.headers.get('content-disposition'))
      || 'mavixboard.tar.gz';
    return { blob, filename };
  }

  function extractFilenameFromDisposition(disposition) {
    if (!disposition) return null;
    const match = /filename\*?=(?:UTF-8'')?["']?([^;"']+)["']?/i.exec(disposition);
    return match ? decodeURIComponent(match[1]) : null;
  }

  // ---------- WebSocket уведомлений администратора ----------

  // Строит ws(s)-URL для /ws/admin в КОРНЕ сервера (не под /api/v1).
  function adminWsUrl() {
    const httpBase = (CFG.apiBaseUrl || 'http://localhost:8000').replace(/\/+$/, '');
    const wsBase = httpBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    return `${wsBase}/ws/admin`;
  }

  // ---------- Экспорт ----------

  window.MavixAPI = {
    BASE,
    LIMITS,
    ApiError,
    tokens,
    session,
    validateEmail,
    validatePassword,
    register,
    login,
    logout,
    passwordResetRequest,
    passwordResetConfirm,
    health,
    // Админ-панель: операторы, дроны, доставки, сборка, WS.
    listOperators,
    createOperator,
    setOperatorActive,
    deleteOperator,
    listDrones,
    listDeliveries,
    createDelivery,
    cancelDelivery,
    downloadBoardTarball,
    adminWsUrl,
    // Session lifecycle helpers (используются auth-guard.js на защищённых
    // страницах кабинета). Не зови их с публичных страниц — на /login и
    // /landing фоновый рефреш не нужен.
    ensureFreshAccess,
    tryRefresh,
    startBackgroundRefresh,
    stopBackgroundRefresh,
  };
})();
