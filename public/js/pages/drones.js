/* ============================================================
   Mavix Web — pages/drones.js
   Страница /dashboard/drones.
   Список дронов + скачивание прошивки (.tar.gz) с Bearer-токеном
   через API.downloadBoardTarball() → blob + ссылка на скачивание.
   ============================================================ */
(function () {
  const API = window.MavixAPI;
  if (!API) return;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function esc(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return esc(value);
    return d.toLocaleString('ru-RU');
  }

  function onlineBadge(online) {
    return online
      ? '<span class="badge badge-success"><span class="status-dot online"></span> Онлайн</span>'
      : '<span class="badge badge-muted"><span class="status-dot offline"></span> Не в сети</span>';
  }

  ready(() => {
    const tbody = document.querySelector('[data-role="drones-body"]');
    const btn = document.querySelector('[data-role="download-board"]');
    const btnText = document.querySelector('[data-role="board-btn-text"]');
    const btnSpinner = document.querySelector('[data-role="board-btn-spinner"]');
    const notice = document.querySelector('[data-role="board-notice"]');

    function setNotice(kind, message) {
      if (!notice) return;
      notice.classList.remove('success', 'error', 'info');
      notice.classList.add(kind);
      notice.textContent = message || '';
      notice.setAttribute('data-visible', message ? 'true' : 'false');
    }

    function setLoading(loading) {
      btn.disabled = loading;
      btnSpinner.style.display = loading ? 'inline-block' : 'none';
      btnText.style.opacity = loading ? '0.7' : '1';
    }

    function rowHtml(d) {
      return `
        <tr>
          <td class="is-mono">${esc(d.name)}</td>
          <td class="is-mono">${esc(d.drone_id)}</td>
          <td>${onlineBadge(d.online)}</td>
          <td>${formatDate(d.last_seen_at)}</td>
        </tr>
      `;
    }

    const EMPTY_DRONES = 'Дронов пока нет. Установите прошивку на бортовой компьютер — дрон появится здесь автоматически.';

    const dt = window.MavixDataTable && window.MavixDataTable.create({
      table: tbody.closest('table'),
      renderRow: rowHtml,
      searchPlaceholder: 'Поиск по имени или ID дрона…',
      emptyHtml: EMPTY_DRONES,
      columns: [
        { getText: (d) => d.name, sortable: true },
        { getText: (d) => d.drone_id, sortable: true },
        {
          getText: (d) => (d.online ? 'Онлайн' : 'Не в сети'),
          sortable: true,
          filter: {
            label: 'статус',
            options: [{ value: 'on', label: 'Онлайн' }, { value: 'off', label: 'Не в сети' }],
            match: (d, v) => (v === 'on' ? !!d.online : v === 'off' ? !d.online : true),
          },
        },
        {
          getText: (d) => (d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('ru-RU') : ''),
          sortable: true,
          sortValue: (d) => (d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0),
        },
      ],
    });

    async function loadDrones() {
      try {
        const drones = await API.listDrones();
        if (dt) dt.setData(drones);
        else tbody.innerHTML = (drones && drones.length)
          ? drones.map(rowHtml).join('')
          : `<tr><td colspan="4" class="admin-table-empty">${EMPTY_DRONES}</td></tr>`;
      } catch (err) {
        const msg = esc((err && err.message) || 'Не удалось загрузить дроны.');
        if (dt) dt.setError(msg);
        else tbody.innerHTML = `<tr><td colspan="4" class="admin-table-empty">${msg}</td></tr>`;
      }
    }

    btn.addEventListener('click', async () => {
      setNotice('info', '');
      setLoading(true);
      try {
        const { blob, filename } = await API.downloadBoardTarball();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setNotice('success', 'Архив скачан. Распакуйте его на дроне и запустите установку — дрон зарегистрируется сам.');
      } catch (err) {
        setNotice('error', (err && err.message) || 'Не удалось скачать прошивку. Попробуйте позже.');
      } finally {
        setLoading(false);
      }
    });

    loadDrones();
  });
})();
