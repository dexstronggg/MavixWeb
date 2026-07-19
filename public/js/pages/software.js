(function () {
  document.addEventListener('DOMContentLoaded', () => {
    initBuildDownloads();
  });

  function initBuildDownloads() {
    document.querySelectorAll('[data-action="download-board"], [data-action="download-desktop"]')
      .forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const kindAttr = link.getAttribute('data-action') || '';
          const kind = kindAttr.endsWith('desktop') ? 'desktop' : 'board';
          const handler = kind === 'desktop' ? downloadDesktop : downloadBoard;
          handler(link).catch((err) => {
            console.error('[software] build download failed', err);
            showNotice('error', err.message || 'Не удалось скачать сборку. Попробуйте позже.');
          });
        });
      });
  }

  async function downloadDesktop(link) {
    const href = link.getAttribute('href');
    const url = new URL(href, window.location.origin);
    const buildType = url.searchParams.get('build_type') || 'deb';

    const apiBase = (window.MAVIX_CONFIG && window.MAVIX_CONFIG.apiBaseUrl) || '';
    const fullUrl = `${apiBase.replace(/\/+$/, '')}/api/v1/builds/desktop?build_type=${encodeURIComponent(buildType)}`;

    clearNotice();
    setLoading(link, true);
    try {
      const head = await fetch(fullUrl, { method: 'HEAD' });
      if (head.status === 405) {
      } else if (!head.ok) {
        if (head.status === 404) {
          const label = buildType === 'exe' ? 'Windows (.exe)' : 'Linux (.AppImage)';
          throw new Error(
            `Сборка ${label} ещё не загружена на сервер. ` +
            'Обратитесь к администратору или попробуйте позже.',
          );
        }
        throw new Error(`Не удалось скачать сборку (ошибка ${head.status}).`);
      }
    } catch (netErr) {
      if (netErr.message) throw netErr;
      throw new Error('Сервер недоступен. Проверьте соединение или попробуйте позже.');
    } finally {
      setLoading(link, false);
    }

    showNotice(
      'info',
      'Скачивание началось. Прогресс смотрите в downloads-меню браузера.',
    );
    const a = document.createElement('a');
    a.href = fullUrl;
    a.download = '';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadBoard(link) {
    const apiBase = (window.MAVIX_CONFIG && window.MAVIX_CONFIG.apiBaseUrl) || '';
    const fullUrl = `${apiBase.replace(/\/+$/, '')}/api/v1/builds/board`;

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
        throw new Error('Сервер недоступен. Проверьте соединение или попробуйте позже.');
      }

      if (!res.ok) {
        throw await buildErrorFromResponse(res, 'board', 'deb');
      }

      const total = Number(res.headers.get('content-length')) || 0;
      const filename = extractFilename(res.headers.get('content-disposition')) || 'mavixboard.tar.gz';

      const blob = await readWithProgress(res, total);

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);

      hideProgress();
      showNotice('info', 'Установщик скачан — распакуйте архив и запустите sudo ./install.sh.');
    } finally {
      setLoading(link, false);
    }
  }

  async function readWithProgress(response, total) {
    const reader = response.body && response.body.getReader && response.body.getReader();
    if (!reader) {
      return await response.blob();
    }
    const chunks = [];
    let received = 0;
    showProgress(0, total);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      showProgress(received, total);
    }
    return new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
  }

  function getProgressContainer() {
    let el = document.querySelector('[data-role="software-progress"]');
    if (el) return el;
    const grid = document.querySelector('.software-grid');
    if (!grid || !grid.parentNode) return null;
    el = document.createElement('div');
    el.setAttribute('data-role', 'software-progress');
    el.className = 'software-progress';
    el.innerHTML = `
      <div class="software-progress-label" data-role="label">Скачивание...</div>
      <div class="software-progress-track">
        <div class="software-progress-fill" data-role="fill" style="width:0%"></div>
      </div>
    `;
    Object.assign(el.style, {
      margin: '0 0 16px', padding: '12px 16px', borderRadius: '10px',
      background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.25)',
      color: '#E8EEF5', fontSize: '13px',
    });
    const track = el.querySelector('.software-progress-track');
    Object.assign(track.style, {
      marginTop: '8px', height: '6px', borderRadius: '3px',
      background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
    });
    const fill = el.querySelector('[data-role="fill"]');
    Object.assign(fill.style, {
      height: '100%', background: '#22d3ee', transition: 'width 0.15s ease',
    });
    grid.parentNode.insertBefore(el, grid);
    return el;
  }

  function showProgress(received, total) {
    const el = getProgressContainer();
    if (!el) return;
    el.style.display = 'block';
    const label = el.querySelector('[data-role="label"]');
    const fill = el.querySelector('[data-role="fill"]');
    const mb = (n) => (n / (1024 * 1024)).toFixed(1);
    if (total > 0) {
      const pct = Math.min(100, Math.round((received / total) * 100));
      fill.style.width = pct + '%';
      label.textContent = `Скачивание установщика: ${mb(received)} / ${mb(total)} МБ (${pct}%)`;
    } else {
      fill.style.width = '100%';
      fill.style.opacity = '0.4';
      label.textContent = `Скачивание установщика: ${mb(received)} МБ`;
    }
  }

  function hideProgress() {
    const el = document.querySelector('[data-role="software-progress"]');
    if (el) el.style.display = 'none';
  }

  async function buildErrorFromResponse(res, kind, buildType) {
    const raw = await res.text().catch(() => '');
    let detail = '';
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        detail = (parsed && (parsed.detail || parsed.message)) || '';
      } catch (_) {
        if (!/^[\s\{\[<]/.test(raw)) detail = raw;
      }
    }

    if (res.status === 401) {
      setTimeout(() => { window.location.href = '/login'; }, 1500);
      return new Error('Войдите снова, чтобы скачать сборку.');
    }
    if (res.status === 403) {
      return new Error('У вашего аккаунта нет доступа к этой сборке.');
    }
    if (detail && /wheels dir not found|no wheels in/i.test(detail)) {
      const subject = kind === 'desktop' ? 'для рабочего стола' : 'для платы';
      return new Error(
        `Сборка ${subject} временно недоступна. ` +
        'Обратитесь к администратору сервера или попробуйте позже.',
      );
    }
    if (res.status === 404) {
      const subject = kind === 'desktop'
        ? (buildType === 'exe' ? 'Windows (.exe)' : 'Linux (.AppImage)')
        : 'MavixBoard';
      return new Error(
        `Сборка ${subject} ещё не загружена на сервер. ` +
        'Обратитесь к администратору или попробуйте позже.',
      );
    }
    if (res.status >= 500) {
      return new Error(
        'Сервер не смог собрать пакет. Попробуйте позже или сообщите администратору.',
      );
    }
    if (detail) {
      return new Error(`Не удалось скачать сборку: ${detail}`);
    }
    return new Error(`Не удалось скачать сборку (ошибка ${res.status}).`);
  }

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
      window.alert(message);
      return;
    }
    el.classList.remove('is-hidden');
    el.classList.toggle('software-notice-error', kind === 'error');
    el.classList.toggle('software-notice-info',  kind !== 'error');
    el.textContent = message;
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