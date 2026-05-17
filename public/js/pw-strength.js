/* ============================================================
   Mavix Web — pw-strength.js
   Индикатор силы пароля для register.html и reset-password.html.
   На input[type=password][data-strength] показывает полоску
   weak/medium/strong и подпись.
   ============================================================ */

(function () {
  function score(pw) {
    if (!pw) return 0;
    let s = 0;
    if (pw.length >= 8) s += 1;
    if (pw.length >= 12) s += 1;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 1;
    if (/\d/.test(pw)) s += 1;
    if (/[^A-Za-z0-9]/.test(pw)) s += 1;
    return s;
  }

  function level(s) {
    if (s <= 1) return { key: 'weak', label: 'Слабый', width: 33 };
    if (s <= 3) return { key: 'medium', label: 'Средний', width: 66 };
    return { key: 'strong', label: 'Надёжный', width: 100 };
  }

  function attach(input) {
    const wrap = document.createElement('div');
    wrap.className = 'pw-strength';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="pw-strength-bar"><div class="pw-strength-fill"></div></div>' +
      '<div class="pw-strength-label"></div>';

    // Вставляем сразу после .input-wrap, если есть; иначе после самого input.
    const anchor = input.closest('.input-wrap') || input;
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);

    const fill = wrap.querySelector('.pw-strength-fill');
    const labelEl = wrap.querySelector('.pw-strength-label');

    function update() {
      const v = input.value || '';
      if (!v) {
        wrap.hidden = true;
        return;
      }
      const lvl = level(score(v));
      wrap.hidden = false;
      wrap.setAttribute('data-level', lvl.key);
      fill.style.width = lvl.width + '%';
      labelEl.textContent = lvl.label;
    }

    input.addEventListener('input', update);
    update();
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    document.querySelectorAll('input[type="password"][data-strength]').forEach(attach);
  });
})();
