/* ============================================================
   Mavix Web — pages/operators.js
   Страница /dashboard/operators.
   Список операторов, создание (логин/пароль показываются один
   раз), блокировка/разблокировка (PATCH is_active), удаление.
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

  function toast(message, kind) {
    const stack = document.querySelector('[data-role="toast-stack"]');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ` toast-${kind}` : '');
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  ready(() => {
    const form = document.querySelector('[data-role="create-form"]');
    const btn = document.querySelector('[data-role="create-btn"]');
    const btnText = document.querySelector('[data-role="create-btn-text"]');
    const btnSpinner = document.querySelector('[data-role="create-btn-spinner"]');
    const formError = document.querySelector('[data-role="form-error"]');
    const credsBox = document.querySelector('[data-role="creds-box"]');
    const credUsername = document.querySelector('[data-role="cred-username"]');
    const credPassword = document.querySelector('[data-role="cred-password"]');
    const tbody = document.querySelector('[data-role="operators-body"]');

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

    function bindCopy(role, getValue) {
      const el = document.querySelector(`[data-role="${role}"]`);
      if (!el) return;
      el.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(getValue());
          const prev = el.textContent;
          el.textContent = 'Скопировано';
          setTimeout(() => { el.textContent = prev; }, 1500);
        } catch (_) {
          toast('Не удалось скопировать. Скопируйте вручную.', 'error');
        }
      });
    }
    bindCopy('copy-username', () => credUsername.textContent);
    bindCopy('copy-password', () => credPassword.textContent);

    function statusBadge(isActive) {
      return isActive
        ? '<span class="badge badge-success">Активен</span>'
        : '<span class="badge badge-warning">Заблокирован</span>';
    }

    function rowHtml(op) {
      const id = esc(op.operator_id);
      const toggleLabel = op.is_active ? 'Заблокировать' : 'Разблокировать';
      return `
          <tr data-id="${id}">
            <td class="is-mono">${esc(op.full_name)}</td>
            <td class="is-mono">${esc(op.username)}</td>
            <td>${esc(op.passport)}</td>
            <td>${esc(op.address)}</td>
            <td>${statusBadge(op.is_active)}</td>
            <td>
              <span class="admin-row-actions">
                <button class="btn btn-secondary btn-sm" type="button"
                  data-action="toggle" data-active="${op.is_active ? '1' : '0'}">${toggleLabel}</button>
                <button class="btn btn-ghost btn-sm" type="button" data-action="delete">Удалить</button>
              </span>
            </td>
          </tr>
        `;
    }

    const dt = window.MavixDataTable && window.MavixDataTable.create({
      table: tbody.closest('table'),
      renderRow: rowHtml,
      searchPlaceholder: 'Поиск по ФИО, логину, паспорту, адресу…',
      emptyHtml: 'Операторов пока нет.',
      columns: [
        { getText: (o) => o.full_name, sortable: true },
        { getText: (o) => o.username, sortable: true },
        { getText: (o) => o.passport, sortable: true },
        { getText: (o) => o.address, sortable: true },
        {
          getText: (o) => (o.is_active ? 'Активен' : 'Заблокирован'),
          sortable: true,
          filter: {
            label: 'статус',
            options: [{ value: 'active', label: 'Активен' }, { value: 'blocked', label: 'Заблокирован' }],
            match: (o, v) => (v === 'active' ? !!o.is_active : v === 'blocked' ? !o.is_active : true),
          },
        },
        {},
      ],
    });

    async function loadOperators() {
      try {
        const operators = await API.listOperators();
        if (dt) dt.setData(operators);
        else tbody.innerHTML = (operators && operators.length)
          ? operators.map(rowHtml).join('')
          : '<tr><td colspan="6" class="admin-table-empty">Операторов пока нет.</td></tr>';
      } catch (err) {
        const msg = esc((err && err.message) || 'Не удалось загрузить операторов.');
        if (dt) dt.setError(msg);
        else tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty">${msg}</td></tr>`;
      }
    }

    tbody.addEventListener('click', async (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;
      const row = button.closest('tr[data-id]');
      if (!row) return;
      const id = row.getAttribute('data-id');
      const action = button.getAttribute('data-action');

      if (action === 'toggle') {
        const willActivate = button.getAttribute('data-active') === '0';
        button.disabled = true;
        try {
          await API.setOperatorActive(id, willActivate);
          toast(willActivate ? 'Оператор разблокирован.' : 'Оператор заблокирован.', 'success');
          await loadOperators();
        } catch (err) {
          toast((err && err.message) || 'Не удалось изменить статус.', 'error');
          button.disabled = false;
        }
      } else if (action === 'delete') {
        if (!window.confirm('Удалить оператора? Действие необратимо.')) return;
        button.disabled = true;
        try {
          await API.deleteOperator(id);
          toast('Оператор удалён.', 'success');
          await loadOperators();
        } catch (err) {
          toast((err && err.message) || 'Не удалось удалить оператора.', 'error');
          button.disabled = false;
        }
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError('');

      const fullName = form.full_name.value.trim();
      const passport = form.passport.value.trim();
      const address = form.address.value.trim();

      if (!fullName || !passport || !address) {
        setError('Заполните все поля.');
        return;
      }

      setLoading(true);
      try {
        const created = await API.createOperator({
          full_name: fullName,
          passport,
          address,
        });
        if (credUsername) credUsername.textContent = created.username || '';
        if (credPassword) credPassword.textContent = created.password || '';
        if (credsBox) credsBox.style.display = 'block';
        form.reset();
        toast('Оператор создан.', 'success');
        await loadOperators();
      } catch (err) {
        setError((err && err.message) || 'Не удалось создать оператора.');
      } finally {
        setLoading(false);
      }
    });

    loadOperators();
  });
})();
