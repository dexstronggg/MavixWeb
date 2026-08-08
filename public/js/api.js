(function () {
  const CFG = (typeof window !== 'undefined' && window.MAVIX_CONFIG) || {};
  const configMissing = !CFG.apiBaseUrl;
  const BASE = (CFG.apiBaseUrl ? CFG.apiBaseUrl.replace(/\/+$/, '') : '') + '/api/v1';

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

  const ACCESS_REFRESH_LEEWAY_SEC = 60;

  class ApiError extends Error {
    constructor(message, status, payload) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.payload = payload;
    }
  }

  function decodeJwtPayload(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
      const json = atob(b64 + pad);
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
    accessExpiresInSec() {
      return tokenExpiresInSec(this.access);
    },
    isAccessStale(leewaySec = ACCESS_REFRESH_LEEWAY_SEC) {
      const left = this.accessExpiresInSec();
      if (left === null) return false;
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
    isAuthenticated() { return Boolean(tokens.access || tokens.refresh); },
  };

  const REQUEST_TIMEOUT_MS = 10000;

  async function request(path, { method = 'GET', body, auth = false, retry = true, timeout = REQUEST_TIMEOUT_MS } = {}) {
    if (configMissing) {
      throw new ApiError('Не загружен /config.js: настройте API_BASE_URL на сервере.', 0, null);
    }
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

  let refreshInFlight = null;

  function tryRefresh() {
    if (refreshInFlight) return refreshInFlight;
    if (configMissing) return Promise.resolve(false);

    const currentRefresh = tokens.refresh;
    if (!currentRefresh) return Promise.resolve(false);

    refreshInFlight = (async () => {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ refresh_token: currentRefresh }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            tokens.clear();
          }
          return false;
        }
        const data = await res.json();
        if (!data || !data.access_token) return false;
        tokens.save(data.access_token, data.refresh_token || null);
        return true;
      } catch (_) {
        return false;
      } finally {
        clearTimeout(timeoutId);
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  }

  async function ensureFreshAccess() {
    const access = tokens.access;
    const refresh = tokens.refresh;
    if (!access && !refresh) return false;
    if (!access && refresh) {
      return tryRefresh();
    }
    if (tokens.isAccessStale()) {
      if (!refresh) return false;
      return tryRefresh();
    }
    return true;
  }

  let refreshTimerId = null;
  function scheduleNextRefresh() {
    if (refreshTimerId) {
      clearTimeout(refreshTimerId);
      refreshTimerId = null;
    }
    if (!tokens.refresh) return;
    const left = tokens.accessExpiresInSec();
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
      if (ok) scheduleNextRefresh();
    }, delayMs);
  }

  function startBackgroundRefresh() {
    if (typeof window === 'undefined') return;
    scheduleNextRefresh();
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

  async function register(email, password) {
    const data = await request('/auth/register', {
      method: 'POST',
      body: { email, password },
    });
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
      session.saveProfile(data.email || email, data.user_id || session.userId);
    }
    return data;
  }

  function logout() {
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
    ensureFreshAccess,
    tryRefresh,
    startBackgroundRefresh,
    stopBackgroundRefresh,
  };
})();