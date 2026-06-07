/* ============================================================
   Mavix Web — data-table.js
   Клиентская обвязка для таблиц .admin-table: поиск, фильтры по
   колонкам, сортировка по клику на заголовок и постраничный вывод
   с выбором размера страницы. Данные грузит сама страница и отдаёт
   массивом через setData() — пагинация/поиск/сортировка считаются
   на клиенте.

   Использование:
     const dt = MavixDataTable.create({
       table: <table.admin-table>,
       columns: [{ getText(row), sortable, filter }, ...] // по одной на <th>
       renderRow: (row) => '<tr>…</tr>',
       searchPlaceholder, emptyHtml, noMatchHtml,
       pageSizes: [10,20,50,100], defaultPageSize: 10,
     });
     dt.setData(rows);            // после загрузки с API
     dt.setError('<сообщение>');  // при ошибке загрузки
   ============================================================ */
(function () {
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  const DD_CHEVRON =
    '<svg class="dd-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  // Превращает нативный <select> в кастомный дропдаун .dd — тот же вид, что
  // у выбора дрона на странице доставок (тёмное меню, серый ховер опции).
  // Нативный select остаётся в DOM (скрыт), value синхронизируется, событие
  // change по-прежнему стреляет — поэтому существующие обработчики работают.
  function enhanceSelect(select, minWidth) {
    select.classList.add('dd-native');
    const dd = el('div', 'dd dd-inline');
    if (minWidth) dd.style.minWidth = minWidth;

    const trigger = el('button', 'dd-trigger input');
    trigger.type = 'button';
    const label = el('span', 'dd-trigger-label');
    trigger.appendChild(label);
    trigger.insertAdjacentHTML('beforeend', DD_CHEVRON);

    const menu = el('div', 'dd-menu');

    function syncLabel() {
      const sel = select.options[select.selectedIndex];
      label.textContent = sel ? sel.textContent : '';
      trigger.classList.toggle('dd-placeholder', !select.value);
    }

    Array.from(select.options).forEach((opt) => {
      const item = el('div', 'dd-option');
      item.textContent = opt.textContent;
      if (opt.value === select.value) item.classList.add('is-selected');
      item.addEventListener('click', () => {
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        menu.querySelectorAll('.dd-option').forEach((o) => o.classList.remove('is-selected'));
        item.classList.add('is-selected');
        syncLabel();
        dd.classList.remove('is-open');
      });
      menu.appendChild(item);
    });

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.dd.is-open').forEach((o) => { if (o !== dd) o.classList.remove('is-open'); });
      dd.classList.toggle('is-open');
    });

    dd.appendChild(trigger);
    dd.appendChild(menu);
    select.after(dd);
    syncLabel();
  }

  // Закрытие открытых дропдаунов по клику вне (вешается один раз на документ).
  if (!window.__mavixDdOutside) {
    window.__mavixDdOutside = true;
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.dd.is-open').forEach((dd) => {
        if (!dd.contains(e.target)) dd.classList.remove('is-open');
      });
    });
  }

  function create(opts) {
    const table = opts.table;
    const thead = table.tHead;
    const tbody = table.tBodies[0];
    const wrap = table.closest('.admin-table-wrap');
    const section = table.closest('.admin-section') || (wrap ? wrap.parentElement : table.parentElement);
    const columns = opts.columns || [];
    const colCount = columns.length || (thead ? thead.rows[0].cells.length : 1);
    const renderRow = opts.renderRow;
    const pageSizes = opts.pageSizes || [10, 20, 50, 100];
    const emptyHtml = opts.emptyHtml || 'Нет записей.';
    const noMatchHtml = opts.noMatchHtml || 'Ничего не найдено по заданным условиям.';

    let data = [];
    let query = '';
    const filterState = {};        // индекс колонки -> выбранное значение
    let sortIndex = -1;
    let sortDir = 1;               // 1 — по возрастанию, -1 — по убыванию
    let pageSize = opts.defaultPageSize || pageSizes[0];
    let page = 1;

    /* -------- Панель управления (поиск, фильтры, размер страницы) -------- */
    const toolbar = el('div', 'table-toolbar');

    const searchWrap = el('div', 'table-toolbar-search input-wrap');
    searchWrap.innerHTML =
      '<svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    const searchInput = el('input', 'input');
    searchInput.type = 'search';
    searchInput.placeholder = opts.searchPlaceholder || 'Поиск…';
    searchWrap.appendChild(searchInput);
    toolbar.appendChild(searchWrap);

    const filtersWrap = el('div', 'table-toolbar-filters');
    columns.forEach((col, i) => {
      if (!col || !col.filter) return;
      const sel = el('select', 'input table-filter-select');
      sel.appendChild(new Option(col.filter.allLabel || ('Все' + (col.filter.label ? ' · ' + col.filter.label : '')), ''));
      (col.filter.options || []).forEach((o) => sel.appendChild(new Option(o.label, o.value)));
      sel.addEventListener('change', () => { filterState[i] = sel.value; page = 1; render(); });
      filtersWrap.appendChild(sel);
      enhanceSelect(sel, '160px');
    });
    if (filtersWrap.children.length) toolbar.appendChild(filtersWrap);

    const sizeWrap = el('label', 'table-toolbar-size');
    sizeWrap.appendChild(el('span', 'table-toolbar-size-label', 'На странице'));
    const sizeSel = el('select', 'input table-size-select');
    pageSizes.forEach((n) => sizeSel.appendChild(new Option(String(n), String(n))));
    sizeSel.value = String(pageSize);
    sizeSel.addEventListener('change', () => { pageSize = parseInt(sizeSel.value, 10) || pageSize; page = 1; render(); });
    sizeWrap.appendChild(sizeSel);
    enhanceSelect(sizeSel, '92px');
    toolbar.appendChild(sizeWrap);

    if (wrap) section.insertBefore(toolbar, wrap);
    else table.parentElement.insertBefore(toolbar, table);

    /* -------- Сортируемые заголовки -------- */
    if (thead) {
      const ths = thead.rows[0].cells;
      columns.forEach((col, i) => {
        if (!col || !col.sortable || !ths[i]) return;
        const th = ths[i];
        th.classList.add('is-sortable');
        th.innerHTML = '<span class="th-sort">' + th.innerHTML + '<span class="th-sort-caret" aria-hidden="true"></span></span>';
        th.addEventListener('click', () => {
          if (sortIndex === i) sortDir = -sortDir;
          else { sortIndex = i; sortDir = 1; }
          updateSortIndicators();
          page = 1;
          render();
        });
      });
    }

    function updateSortIndicators() {
      if (!thead) return;
      const ths = thead.rows[0].cells;
      columns.forEach((col, i) => {
        if (!ths[i]) return;
        ths[i].classList.remove('is-sorted-asc', 'is-sorted-desc');
        if (i === sortIndex) ths[i].classList.add(sortDir === 1 ? 'is-sorted-asc' : 'is-sorted-desc');
      });
    }

    /* -------- Пагинация -------- */
    const pager = el('div', 'table-pager');
    const pagerInfo = el('div', 'table-pager-info');
    const pagerNav = el('div', 'table-pager-nav');
    pager.appendChild(pagerInfo);
    pager.appendChild(pagerNav);
    if (wrap && wrap.nextSibling) section.insertBefore(pager, wrap.nextSibling);
    else section.appendChild(pager);

    function textOf(col, row) {
      if (!col || typeof col.getText !== 'function') return '';
      const v = col.getText(row);
      return v == null ? '' : String(v);
    }

    function computeFiltered() {
      const q = query.trim().toLowerCase();
      return data.filter((row) => {
        for (const idx in filterState) {
          const v = filterState[idx];
          if (!v) continue;
          const col = columns[idx];
          if (col && col.filter && typeof col.filter.match === 'function' && !col.filter.match(row, v)) return false;
        }
        if (!q) return true;
        return columns.some((col) => textOf(col, row).toLowerCase().includes(q));
      });
    }

    function sortRows(rows) {
      if (sortIndex < 0) return rows;
      const col = columns[sortIndex];
      const copy = rows.slice();
      copy.sort((a, b) => {
        let av, bv;
        if (col && typeof col.sortValue === 'function') { av = col.sortValue(a); bv = col.sortValue(b); }
        else { av = textOf(col, a); bv = textOf(col, b); }
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
        return String(av).localeCompare(String(bv), 'ru', { numeric: true, sensitivity: 'base' }) * sortDir;
      });
      return copy;
    }

    function render() {
      const filtered = sortRows(computeFiltered());
      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      if (page > pages) page = pages;
      if (page < 1) page = 1;
      const start = (page - 1) * pageSize;
      const slice = filtered.slice(start, start + pageSize);

      if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="' + colCount + '" class="admin-table-empty">' + emptyHtml + '</td></tr>';
      } else if (!total) {
        tbody.innerHTML = '<tr><td colspan="' + colCount + '" class="admin-table-empty">' + noMatchHtml + '</td></tr>';
      } else {
        tbody.innerHTML = slice.map(renderRow).join('');
      }
      renderPager(total, pages, start, slice.length);
    }

    function renderPager(total, pages, start, count) {
      if (!total) { pagerInfo.textContent = ''; pagerNav.innerHTML = ''; pager.style.display = 'none'; return; }
      pager.style.display = '';
      pagerInfo.textContent = (start + 1) + '–' + (start + count) + ' из ' + total;
      pagerNav.innerHTML = '';
      const mk = (label, p, state) => {
        const b = el('button', 'table-pager-btn' + (state && state.active ? ' is-active' : '') + (state && state.ellipsis ? ' is-ellipsis' : ''));
        b.type = 'button';
        b.innerHTML = label;
        if (state && (state.disabled || state.ellipsis)) b.disabled = true;
        else if (!(state && state.active)) b.addEventListener('click', () => { page = p; render(); });
        return b;
      };
      pagerNav.appendChild(mk('‹', page - 1, { disabled: page <= 1 }));
      pageList(page, pages).forEach((n) => {
        if (n === '…') pagerNav.appendChild(mk('…', 0, { ellipsis: true }));
        else pagerNav.appendChild(mk(String(n), n, { active: n === page }));
      });
      pagerNav.appendChild(mk('›', page + 1, { disabled: page >= pages }));
    }

    function pageList(cur, total) {
      const out = [];
      if (total <= 7) { for (let i = 1; i <= total; i++) out.push(i); return out; }
      out.push(1);
      if (cur > 3) out.push('…');
      const s = Math.max(2, cur - 1);
      const e = Math.min(total - 1, cur + 1);
      for (let i = s; i <= e; i++) out.push(i);
      if (cur < total - 2) out.push('…');
      out.push(total);
      return out;
    }

    searchInput.addEventListener('input', () => { query = searchInput.value; page = 1; render(); });

    function setData(rows) { data = Array.isArray(rows) ? rows : []; render(); }
    function setError(html) {
      data = [];
      tbody.innerHTML = '<tr><td colspan="' + colCount + '" class="admin-table-empty">' + html + '</td></tr>';
      pager.style.display = 'none';
    }

    render();
    return { setData: setData, setError: setError, refresh: render };
  }

  window.MavixDataTable = { create: create };
})();
