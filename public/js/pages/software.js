/* ============================================================
   Mavix Web — pages/software.js

   Логика страницы «Скачать ПО»:
     • Скачивание MavixDesktop (.exe / .AppImage) с собственных
       /downloads/* маршрутов. Если файла нет — показываем
       inline-notice прямо на странице, без перехода на 404.
     • Скачивание MavixBoard через API сервера. На ошибки —
       человеческие сообщения, никаких голых JSON-`alert`.
   ============================================================ */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    initDesktopDownloads();
    initBoardDownload();
  });

  /* -------- Desktop (.exe / .AppImage) -------- */

  function initDesktopDownloads() {
    const links = document.querySelectorAll('a[href^="/downloads/"]');
    links.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        downloadDesktop(link).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[software] desktop download failed', err);
          showNotice('error', err.message || 'Не удалось скачать файл. Попробуйте позже.');
        });
      });
    });
  }

  async function downloadDesktop(link) {
    const href = link.getAttribute('href');
    const filename = href.split('/').pop() || 'mavix-desktop';

    setLoading(link, true);
    clearNotice();

    try {
      // Проверяем доступность файла через HEAD: если 404 — показываем
      // понятный notice, а не открываем новую вкладку с голым текстом.
      const head = await fetch(href, { method: 'HEAD' });
      if (!head.ok) {
        if (head.status === 404) {
          throw new Error(
            'Сборка для рабочего стола ещё не загружена на сервер. ' +
            'Обратитесь к администратору или попробуйте позже.',
          );
        }
        throw new Error(`Не удалось скачать файл (ошибка ${head.status}).`);
      }

      // Файл есть — запускаем штатное скачивание через скрытую ссылку.
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setLoading(link, false);
    }
  }

  /* -------- Board (.deb через API) -------- */

  function initBoardDownload() {
    const links = document.querySelectorAll('[data-action="download-board"]');
    links.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        downloadBoardBuild(link).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[software] board download failed', err);
          showNotice('error', err.message || 'Не удалось скачать сборку. Попробуйте позже.');
        });
      });
    });
  }

  async function downloadBoardBuild(link) {
    const url = new URL(link.getAttribute('href'), window.location.origin);
    const buildType = url.searchParams.get('build_type') || 'deb';

    const apiBase = (window.MAVIX_CONFIG && window.MAVIX_CONFIG.apiBaseUrl) || '';
    const fullUrl = `${apiBase.replace(/\/+$/, '')}/api/v1/builds/board?build_type=${encodeURIComponent(buildType)}`;

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
        throw await buildErrorFromResponse(res);
      }

      const blob = await res.blob();
      const filename = extractFilename(res.headers.get('content-disposition'))
        || `mavixboard.${buildType}`;

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

  /* -------- Ошибки API → человеческие сообщения -------- */

  async function buildErrorFromResponse(res) {
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
    if (detail && detail.toLowerCase().includes('wheels dir not found')) {
      return new Error(
        'Сборка для платы временно недоступна. ' +
        'Обратитесь к администратору сервера или попробуйте позже.',
      );
    }

    // 404: сборки нет.
    if (res.status === 404) {
      return new Error(
        'Сборка не найдена на сервере. ' +
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
