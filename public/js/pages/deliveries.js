/* ============================================================
   Mavix Web — pages/deliveries.js
   Страница /dashboard/deliveries.
     • Форма создания заявки: выбор дрона, адрес + координаты
       назначения, карта Leaflet для выбора точки сброса кликом.
     • Журнал заявок с авто-обновлением и кнопкой «Отменить».
     • WS /ws/admin: тосты delivery_accepted / delivery_delivered
       и обновление журнала.
   ============================================================ */
(function () {
  const API = window.MavixAPI;
  if (!API) return;

  const REFRESH_INTERVAL_MS = 15000;
  // Москва — стартовый центр карты, если у браузера нет геолокации.
  const DEFAULT_CENTER = [55.751244, 37.618423];
  const DEFAULT_ZOOM = 11;

  const STATUS_LABELS = {
    offered: 'Предложена',
    accepted: 'Принята',
    in_flight: 'В пути',
    delivered: 'Доставлена',
    cancelled: 'Отменена',
  };
  const STATUS_BADGE = {
    offered: 'badge-muted',
    accepted: 'badge-accent',
    in_flight: 'badge-warning',
    delivered: 'badge-success',
    cancelled: 'badge-danger',
  };
  // Заявки в финальных статусах отменять нельзя.
  const FINAL_STATUSES = ['delivered', 'cancelled'];

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function esc(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function toast(message, kind, title) {
    const stack = document.querySelector('[data-role="toast-stack"]');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ` toast-${kind}` : '');
    el.innerHTML = (title ? `<div class="toast-title">${esc(title)}</div>` : '') + esc(message);
    stack.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  ready(() => {
    const form = document.querySelector('[data-role="delivery-form"]');
    const droneSelect = document.querySelector('[data-role="drone-select"]');
    const btn = document.querySelector('[data-role="create-btn"]');
    const btnText = document.querySelector('[data-role="create-btn-text"]');
    const btnSpinner = document.querySelector('[data-role="create-btn-spinner"]');
    const formError = document.querySelector('[data-role="form-error"]');
    const latInput = form.destination_lat;
    const lonInput = form.destination_lon;
    const addrInput = form.destination_address;
    const coordsHint = document.querySelector('[data-role="coords-hint"]');
    const tbody = document.querySelector('[data-role="deliveries-body"]');
    const mapEl = document.querySelector('[data-role="map"]');

    let map = null;
    let marker = null;
    // токен последнего reverse-geocode: ответы более старых кликов игнорируем
    let geocodeToken = 0;

    function setError(message) {
      if (!formError) return;
      formError.textContent = message || '';
      formError.setAttribute('data-visible', message ? 'true' : 'false');
    }

    function setLoading(loading) {
      btn.disabled = loading;
      btnSpinner.style.display = loading ? 'inline-block' : 'none';
      btnText.style.opacity = loading ? '0.7' : '1';
    }

    /* -------- Карта (Leaflet) -------- */

    function setPoint(lat, lon) {
      latInput.value = Number(lat).toFixed(6);
      lonInput.value = Number(lon).toFixed(6);
      if (coordsHint) {
        coordsHint.textContent = `Точка назначения: ${latInput.value}, ${lonInput.value}`;
      }
      if (map) {
        const ll = [lat, lon];
        if (marker) marker.setLatLng(ll);
        else marker = L.marker(ll).addTo(map);
      }
    }

    // Обратное геокодирование через Nominatim (OSM): по координатам клика
    // подставляем человекочитаемый адрес в поле «Адрес назначения».
    async function reverseGeocode(lat, lon) {
      const token = ++geocodeToken;
      if (coordsHint) {
        coordsHint.textContent = `Точка назначения: ${lat.toFixed(6)}, ${lon.toFixed(6)} · определяем адрес…`;
      }
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=ru&zoom=18`;
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (token !== geocodeToken) return;     // пришёл устаревший ответ
        if (!resp.ok) throw new Error(`geocode HTTP ${resp.status}`);
        const data = await resp.json();
        if (token !== geocodeToken) return;
        const address = data && data.display_name ? data.display_name : '';
        if (address && addrInput) addrInput.value = address;
        if (coordsHint) {
          coordsHint.textContent = address
            ? `Точка назначения: ${address}`
            : `Точка назначения: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        }
      } catch (_err) {
        if (token !== geocodeToken) return;
        if (coordsHint) {
          coordsHint.textContent = `Точка назначения: ${lat.toFixed(6)}, ${lon.toFixed(6)} · адрес не определён, впишите вручную`;
        }
      }
    }

    function initMap() {
      if (typeof L === 'undefined' || !mapEl) {
        if (coordsHint) coordsHint.textContent = 'Карта недоступна — введите координаты вручную.';
        return;
      }
      map = L.map(mapEl, { attributionControl: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '',
      }).addTo(map);
      map.on('click', (e) => {
        setPoint(e.latlng.lat, e.latlng.lng);
        reverseGeocode(e.latlng.lat, e.latlng.lng);
      });
      // Если оператор уже вписал координаты руками — синхронизируем маркер.
      [latInput, lonInput].forEach((inp) => {
        inp.addEventListener('change', () => {
          const lat = parseFloat(latInput.value);
          const lon = parseFloat(lonInput.value);
          if (!isNaN(lat) && !isNaN(lon)) {
            setPoint(lat, lon);
            map.setView([lat, lon]);
          }
        });
      });
    }

    /* -------- Дроны -------- */

    async function loadDrones() {
      try {
        const drones = await API.listDrones();
        if (!drones || !drones.length) {
          droneSelect.innerHTML = '<option value="">Нет доступных дронов</option>';
          return;
        }
        droneSelect.innerHTML = '<option value="">Выберите дрон</option>' +
          drones.map((d) => `<option value="${esc(d.drone_id)}">${esc(d.name)} (${esc(d.online ? 'онлайн' : 'не в сети')})</option>`).join('');
      } catch (err) {
        droneSelect.innerHTML = '<option value="">Не удалось загрузить дроны</option>';
      } finally {
        buildDropdown();
      }
    }

    // Кастомный дропдаун поверх скрытого <select>: ховер опции серый
    // (var(--card-hover)), как у пунктов меню сайдбара, а не системный синий.
    function buildDropdown() {
      const old = droneSelect.parentElement.querySelector('.dd');
      if (old) old.remove();
      droneSelect.classList.add('dd-native');

      const dd = document.createElement('div');
      dd.className = 'dd';

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'dd-trigger input';
      const label = document.createElement('span');
      label.className = 'dd-trigger-label';
      trigger.appendChild(label);
      trigger.insertAdjacentHTML(
        'beforeend',
        '<svg class="dd-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
      );

      const menu = document.createElement('div');
      menu.className = 'dd-menu';

      function syncLabel() {
        const sel = droneSelect.options[droneSelect.selectedIndex];
        label.textContent = sel ? sel.textContent : '';
        trigger.classList.toggle('dd-placeholder', !droneSelect.value);
      }

      Array.from(droneSelect.options).forEach((opt) => {
        // плейсхолдер/служебные опции с пустым value в меню не дублируем —
        // их текст и так показывается в самом триггере (syncLabel)
        if (!opt.value) return;
        const item = document.createElement('div');
        item.className = 'dd-option';
        item.textContent = opt.textContent;
        if (opt.value === droneSelect.value) item.classList.add('is-selected');
        item.addEventListener('click', () => {
          droneSelect.value = opt.value;
          droneSelect.dispatchEvent(new Event('change', { bubbles: true }));
          menu.querySelectorAll('.dd-option').forEach((o) => o.classList.remove('is-selected'));
          item.classList.add('is-selected');
          syncLabel();
          dd.classList.remove('is-open');
        });
        menu.appendChild(item);
      });

      trigger.addEventListener('click', () => dd.classList.toggle('is-open'));
      dd.appendChild(trigger);
      dd.appendChild(menu);
      droneSelect.after(dd);
      syncLabel();
    }

    // закрываем меню по клику вне дропдауна (вешается один раз)
    document.addEventListener('click', (e) => {
      const dd = form.querySelector('.dd');
      if (dd && !dd.contains(e.target)) dd.classList.remove('is-open');
    });

    /* -------- Журнал заявок -------- */

    function statusBadge(status) {
      const cls = STATUS_BADGE[status] || 'badge-muted';
      const label = STATUS_LABELS[status] || status || '—';
      return `<span class="badge ${cls}">${esc(label)}</span>`;
    }

    function destinationText(d) {
      if (d.destination_address) return esc(d.destination_address);
      if (d.destination_lat != null && d.destination_lon != null) {
        return `${esc(d.destination_lat)}, ${esc(d.destination_lon)}`;
      }
      return '—';
    }

    function renderRows(deliveries) {
      if (!deliveries || !deliveries.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty">Заявок пока нет.</td></tr>';
        return;
      }
      tbody.innerHTML = deliveries.map((d) => {
        const id = esc(d.delivery_id);
        const canCancel = FINAL_STATUSES.indexOf(d.status) === -1;
        const cancelBtn = canCancel
          ? `<button class="btn btn-ghost btn-sm" type="button" data-action="cancel">Отменить</button>`
          : '<span class="form-hint">—</span>';
        return `
          <tr data-id="${id}">
            <td>${statusBadge(d.status)}</td>
            <td class="is-mono">${esc(d.drone_name || d.drone_id || '—')}</td>
            <td>${esc(d.operator_name || '—')}</td>
            <td>${destinationText(d)}</td>
            <td>${esc(d.cargo_description || '—')}</td>
            <td>${cancelBtn}</td>
          </tr>
        `;
      }).join('');
    }

    async function loadDeliveries() {
      try {
        const deliveries = await API.listDeliveries();
        renderRows(deliveries);
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty">${esc((err && err.message) || 'Не удалось загрузить заявки.')}</td></tr>`;
      }
    }

    tbody.addEventListener('click', async (e) => {
      const button = e.target.closest('button[data-action="cancel"]');
      if (!button) return;
      const row = button.closest('tr[data-id]');
      if (!row) return;
      if (!window.confirm('Отменить заявку на доставку?')) return;
      button.disabled = true;
      try {
        await API.cancelDelivery(row.getAttribute('data-id'));
        toast('Заявка отменена.', 'success');
        await loadDeliveries();
      } catch (err) {
        toast((err && err.message) || 'Не удалось отменить заявку.', 'error');
        button.disabled = false;
      }
    });

    /* -------- Создание заявки -------- */

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError('');

      const droneId = droneSelect.value;
      if (!droneId) {
        setError('Выберите дрон.');
        return;
      }

      const body = { drone_id: droneId };
      const depAddress = form.departure_address.value.trim();
      const destAddress = form.destination_address.value.trim();
      const cargo = form.cargo_description.value.trim();
      const lat = parseFloat(latInput.value);
      const lon = parseFloat(lonInput.value);

      if (depAddress) body.departure_address = depAddress;
      if (destAddress) body.destination_address = destAddress;
      if (cargo) body.cargo_description = cargo;
      if (!isNaN(lat)) body.destination_lat = lat;
      if (!isNaN(lon)) body.destination_lon = lon;

      if (!destAddress && (isNaN(lat) || isNaN(lon))) {
        setError('Укажите адрес назначения или выберите точку на карте.');
        return;
      }

      setLoading(true);
      try {
        await API.createDelivery(body);
        toast('Заявка создана и предложена оператору.', 'success');
        form.reset();
        if (coordsHint) coordsHint.textContent = 'Кликните по карте, чтобы выбрать координаты сброса.';
        if (marker && map) { map.removeLayer(marker); marker = null; }
        await loadDeliveries();
      } catch (err) {
        setError((err && err.message) || 'Не удалось создать заявку.');
      } finally {
        setLoading(false);
      }
    });

    /* -------- WebSocket уведомлений администратора -------- */

    let ws = null;
    let wsReconnectTimer = null;

    function connectWs() {
      const token = API.tokens.access;
      if (!token) return;
      let url;
      try { url = API.adminWsUrl(); } catch (_) { return; }

      try {
        ws = new WebSocket(url);
      } catch (_) {
        return;
      }

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'auth', token: API.tokens.access }));
      });

      ws.addEventListener('message', (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        if (!msg || !msg.type) return;

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        if (msg.type === 'delivery_accepted') {
          toast(`Оператор ${msg.operator_name || ''} принял заявку.`.trim(), 'success', 'Заявка принята');
          loadDeliveries();
        } else if (msg.type === 'delivery_delivered') {
          toast(`Груз доставлен: ${msg.cargo_description || 'без описания'}.`, 'success', 'Доставка завершена');
          loadDeliveries();
        } else if (msg.type === 'drone_enrolled') {
          toast('Новый дрон зарегистрирован в системе.', 'success', 'Новый дрон');
        }
      });

      ws.addEventListener('close', () => {
        ws = null;
        // Пытаемся переподключиться, пока пользователь на странице.
        if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
        wsReconnectTimer = setTimeout(connectWs, 5000);
      });

      ws.addEventListener('error', () => {
        // Закрытие обработает reconnect.
        try { ws.close(); } catch (_) {}
      });
    }

    window.addEventListener('beforeunload', () => {
      if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
      if (ws) { try { ws.close(); } catch (_) {} }
    });

    /* -------- Старт -------- */

    initMap();
    loadDrones();
    loadDeliveries();
    setInterval(loadDeliveries, REFRESH_INTERVAL_MS);
    connectWs();
  });
})();
