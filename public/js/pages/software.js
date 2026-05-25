/* ============================================================
   Mavix Web — pages/software.js

   Логика страницы «Скачать ПО»: оба продукта (MavixBoard tarball и
   MavixDesktop pre-built бинарь) качаются через единый API сервера
   `/api/v1/builds/<kind>`. На ошибки — человеческие сообщения,
   никаких голых JSON / alert(error).
   ============================================================ */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    initBuildDownloads();
  });

  function initBuildDownloads() {
    document.querySelectorAll('[data-action="download-board"], [data-action="download-desktop"]')
      .forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          downloadBuild(link).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[software] build download failed', err);
            showNotice('error', err.message || 'Не удалось скачать сборку. Попробуйте позже.');
          });
        });
      });
  }

  async function downloadBuild(link) {
    const href = link.getAttribute('href');
    const url = new URL(href, window.location.origin);
    const kind = url.pathname.includes('/desktop') ? 'desktop' : 'board';
    const buildType = url.searchParams.get('build_type') || 'deb';

    const apiBase = (window.MAVIX_CONFIG && window.MAVIX_CONFIG.apiBaseUrl) || '';
    const apiRoot = `${apiBase.replace(/\/+$/, '')}/api/v1/builds/${kind}`;
    const fullUrl = kind === 'desktop'
      ? `${apiRoot}?build_type=${encodeURIComponent(buildType)}`
      : apiRoot;

    const headers = { 'Accept': 'application/octet-stream' };
    const access = localStorage.getItem('mavix_access');
    if (access) headers['Authorization'] = `Bearer ${access}`;

    setLoading(link, true);
    clearNotice();

    try {
      let res;
      try {
        res = await fetch(fullUrl, { headers });
      } catch (netErr) {
        throw new Error(
          'Сервер недоступен. Проверьте соединение или попробуйте позже.',
        );
      }

      if (!res.ok) {
        throw await buildErrorFromResponse(res, kind, buildType);
      }

      const blob = await res.blob();
      const filename = extractFilename(res.headers.get('content-disposition'))
        || defaultFilename(kind, buildType);

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } finally {
      setLoading(link, false);
    }
  }

  function defaultFilename(kind, buildType) {
    if (kind === 'board') return 'mavixboard.tar.gz';
    if (buildType === 'exe') return 'mavixdesktop.exe';
    return 'mavixdesktop-linux.AppImage';
  }

  /* -------- Ошибки API → человеческие сообщения -------- */

  async function buildErrorFromResponse(res, kind, buildType) {
    // Пытаемся разобрать тело: сервер обычно возвращает {detail: "..."}
    // в JSON, но не гарантирует. Никогда не показываем сырой JSON.
    const raw = await res.text().catch(() => '');
    let detail = '';
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        detail = (parsed && (parsed.detail || parsed.message)) || '';
      } catch (_) {
        // не JSON — оставим как plain text, но не используем как есть,
        // если это похоже на HTML/JSON-обёртку
        if (!/^[\s\{\[<]/.test(raw)) detail = raw;
      }
    }

    // 401: токен истёк или невалиден.
    if (res.status === 401) {
      // мягкий редирект на /login через короткую паузу — пользователь
      // должен успеть увидеть сообщение
      setTimeout(() => { window.location.href = '/login'; }, 1500);
      return new Error('Войдите снова, чтобы скачать сборку.');
    }

    // 403: нет доступа.
    if (res.status === 403) {
      return new Error('У вашего аккаунта нет доступа к этой сборке.');
    }

    // Wheels-директория отсутствует на сервере (известный кейс
    // MavixServer: {"detail":"wheels dir not found: /srv/mavix/wheels/board"}).
    if (detail && /wheels dir not found|no wheels in/i.test(detail)) {
      const subject = kind === 'desktop' ? 'для рабочего стола' : 'для платы';
      return new Error(
        `Сборка ${subject} временно недоступна. ` +
        'Обратитесь к администратору сервера или попробуйте позже.',
      );
    }

    // 404: сборки нет (типично для desktop, когда .exe/.AppImage не залит).
    if (res.status === 404) {
      const subject = kind === 'desktop'
        ? (buildType === 'exe' ? 'Windows (.exe)' : 'Linux (.AppImage)')
        : 'MavixBoard';
      return new Error(
        `Сборка ${subject} ещё не загружена на сервер. ` +
        'Обратитесь к администратору или попробуйте позже.',
      );
    }

    // 5xx: проблема на стороне сервера.
    if (res.status >= 500) {
      return new Error(
        'Сервер не смог собрать пакет. Попробуйте позже или ' +
        'сообщите администратору.',
      );
    }

    // Прочее: показываем краткое описание, если оно нормальное,
    // иначе — общий текст со статусом. Сырого JSON быть не должно.
    if (detail) {
      return new Error(`Не удалось скачать сборку: ${detail}`);
    }
    return new Error(`Не удалось скачать сборку (ошибка ${res.status}).`);
  }

  /* -------- UI-хелперы -------- */

  function setLoading(link, busy) {
    if (busy) {
      link.classList.add('is-loading');
      link.setAttribute('aria-busy', 'true');
    } else {
      link.classList.remove('is-loading');
      link.removeAttribute('aria-busy');
    }
  }

  function extractFilename(disposition) {
    if (!disposition) return null;
    const match = /filename\*?=(?:UTF-8'')?["']?([^;"']+)["']?/i.exec(disposition);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Inline-плашка с сообщением. Контейнер ищется в DOM (если нет —
   * создаётся перед первой .software-grid). Это inline-блок в стиле
   * .info-note, чтобы не вводить отдельный компонент.
   */
  function getNoticeContainer() {
    let el = document.querySelector('[data-role="software-notice"]');
    if (el) return el;
    const grid = document.querySelector('.software-grid');
    if (!grid || !grid.parentNode) return null;
    el = document.createElement('div');
    el.setAttribute('data-role', 'software-notice');
    el.className = 'software-notice is-hidden';
    el.setAttribute('role', 'status');
    grid.parentNode.insertBefore(el, grid);
    return el;
  }

  function showNotice(kind, message) {
    const el = getNoticeContainer();
    if (!el) {
      // запасной канал — но без JSON и без alert(error)
      // eslint-disable-next-line no-alert
      window.alert(message);
      return;
    }
    el.classList.remove('is-hidden');
    el.classList.toggle('software-notice-error', kind === 'error');
    el.classList.toggle('software-notice-info',  kind !== 'error');
    el.textContent = message;
    // скроллим к плашке, чтобы пользователь точно её увидел
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearNotice() {
    const el = document.querySelector('[data-role="software-notice"]');
    if (el) {
      el.classList.add('is-hidden');
      el.textContent = '';
    }
  }
})();
