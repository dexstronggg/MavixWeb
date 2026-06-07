/* ============================================================
   Mavix Web — docs.js
   Плавающее оглавление справа на страницах документации.
   1) Клонирует список из .doc-toc в фиксированную панель справа.
   2) Показывает её, когда исходный .doc-toc уходит из вьюпорта.
   3) Подсвечивает активный пункт по мере скролла секций.
   На экранах < 1280px не активируется.
   ============================================================ */

(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    if (!('IntersectionObserver' in window)) return;

    const inlineToc = document.querySelector('.doc-toc');
    if (!inlineToc) return;

    // Узкие экраны — не рисуем боковую панель.
    if (window.matchMedia && !window.matchMedia('(min-width: 1280px)').matches) {
      return;
    }

    const sourceLinks = Array.from(inlineToc.querySelectorAll('a[href^="#"]'));
    if (!sourceLinks.length) return;

    // Боковая панель.
    const aside = document.createElement('aside');
    aside.className = 'floating-toc';
    aside.setAttribute('aria-hidden', 'true');
    const list = document.createElement('ol');
    aside.appendChild(list);

    const linkById = new Map();

    sourceLinks.forEach((src) => {
      const href = src.getAttribute('href') || '';
      const id = href.startsWith('#') ? href.slice(1) : '';
      if (!id || !document.getElementById(id)) return;

      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = href;
      a.textContent = src.textContent.trim();
      li.appendChild(a);
      list.appendChild(li);
      linkById.set(id, a);
    });

    if (!linkById.size) return;
    document.body.appendChild(aside);

    // 1) Видимость inline-оглавления → видимость боковой панели.
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          aside.classList.toggle('is-visible', !entry.isIntersecting);
        });
      },
      { threshold: 0 }
    );
    visibilityObserver.observe(inlineToc);

    // 2) Подсветка активного раздела по позиции при скролле.
    // Надёжнее узкой полосы IntersectionObserver: корректно работает при
    // клике (когда заголовок прыгает к верху вьюпорта, выше любой полосы) и
    // для последних/коротких секций, которые до полосы не доходят.
    let activeId = null;
    const setActive = (id) => {
      if (id === activeId) return;
      if (activeId) {
        const prev = linkById.get(activeId);
        if (prev) prev.classList.remove('is-active');
      }
      activeId = id;
      if (id) {
        const next = linkById.get(id);
        if (next) next.classList.add('is-active');
      }
    };

    const sections = [];
    linkById.forEach((_link, id) => {
      const t = document.getElementById(id);
      if (t) sections.push(t);
    });
    sections.sort((a, b) => a.offsetTop - b.offsetTop);

    // Линия «активности» чуть ниже залипшего хедера (см. scroll-margin-top секций).
    const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10) || 64;
    const OFFSET = headerH + 24;

    function updateActive() {
      const scrollBottom = window.innerHeight + (window.scrollY || window.pageYOffset || 0);
      // У дна страницы активна последняя секция — она может не дойти до линии.
      if (scrollBottom >= document.documentElement.scrollHeight - 2) {
        setActive(sections[sections.length - 1].id);
        return;
      }
      let current = sections[0].id;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top - OFFSET <= 1) current = sections[i].id;
        else break;
      }
      setActive(current);
    }

    // «Замок» на время клик-перехода: при плавной прокрутке к выбранной
    // секции (scroll-behavior: smooth) не пересчитываем активный пункт по
    // скроллу, иначе промежуточные заголовки мигают синим. Снимаем замок,
    // когда прокрутка остановилась (scrollend) или по страховочному таймауту.
    let spyLocked = false;
    let lockTimer = null;
    function unlockSpy() {
      spyLocked = false;
      if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
    }
    function lockSpy() {
      spyLocked = true;
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = setTimeout(() => { unlockSpy(); updateActive(); }, 1000);
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { if (!spyLocked) updateActive(); ticking = false; });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    if ('onscrollend' in window) {
      window.addEventListener('scrollend', () => {
        if (!spyLocked) return;
        unlockSpy();
        updateActive();
      });
    }

    // Клик по пункту: сразу подсвечиваем только целевой и держим его, пока
    // идёт плавная прокрутка (промежуточные пункты не вспыхивают).
    list.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = (a.getAttribute('href') || '').slice(1);
      if (!linkById.has(id)) return;
      lockSpy();
      setActive(id);
    });

    updateActive();
  });
})();
