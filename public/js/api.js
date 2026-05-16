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
    userId: 'mavix_user_id',
  };

  const LIMITS = {
    PASSWORD_MIN: 8,
    PASSWORD_MAX: 72,
  };

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
  };

  const session = {
    saveProfile(email, userId) {
      if (email) localStorage.setItem(STORAGE_KEYS.email, email);
      if (userId) localStorage.setItem(STORAGE_KEYS.userId, userId);
    },
    get email() { return localStorage.getItem(STORAGE_KEYS.email) || ''; },
    get userId() { return localStorage.getItem(STORAGE_KEYS.userId) || ''; },
    isAuthenticated() { return Boolean(tokens.access); },
  };

  // ---------- HTTP ----------

  const REQUEST_TIMEOUT_MS = 10000;

  async function request(path, { method = 'GET', body, auth = false, retry = true, timeout = REQUEST_TIMEOUT_MS } = {}) {
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

  async function tryRefresh() {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ refresh_token: tokens.refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || !data.access_token) return false;
      tokens.save(data.access_token, null);
      return true;
    } catch (_) {
      return false;
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
    if (data && data.email) {
      session.saveProfile(data.email, data.user_id);
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
    // На сервере нет /auth/logout — просто чистим локальное состояние.
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
  };
})();
