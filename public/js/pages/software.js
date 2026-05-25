/* ============================================================
   Mavix Web — pages/software.js

   Скачивание MavixBoard через API сервера.
   Сервер принимает build_type=deb|exe и собирает пакет
   с встроенным токеном пользователя.
   ============================================================ */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const links = document.querySelectorAll('[data-action="download-board"]');
    links.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        downloadBoardBuild(link).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[software] download failed', err);
          alert(err.message || 'Не удалось скачать сборку. Попробуйте позже.');
        });
      });
    });
  });

  async function downloadBoardBuild(link) {
    const url = new URL(link.getAttribute('href'), window.location.origin);
    const buildType = url.searchParams.get('build_type') || 'deb';

    const apiBase = (window.MAVIX_CONFIG && window.MAVIX_CONFIG.apiBaseUrl) || '';
    const fullUrl = `${apiBase.replace(/\/+$/, '')}/api/v1/builds/board?build_type=${encodeURIComponent(buildType)}`;

    const headers = { 'Accept': 'application/octet-stream' };
    const access = localStorage.getItem('mavix_access');
    if (access) headers['Authorization'] = `Bearer ${access}`;

    const original = link.textContent;
    link.classList.add('is-loading');
    link.setAttribute('aria-busy', 'true');

    try {
      const res = await fetch(fullUrl, { headers });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Ошибка сервера: ${res.status}`);
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
      link.classList.remove('is-loading');
      link.removeAttribute('aria-busy');
      link.textContent = original;
    }
  }

  function extractFilename(disposition) {
    if (!disposition) return null;
    const match = /filename\*?=(?:UTF-8'')?["']?([^;"']+)["']?/i.exec(disposition);
    return match ? decodeURIComponent(match[1]) : null;
  }
})();
