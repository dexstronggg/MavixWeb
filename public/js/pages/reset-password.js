(function () {
  const form = document.getElementById('reset-form');
  if (!form) return;
  const API = window.MavixAPI;

  const passwordInput = form.querySelector('#password');
  const confirmInput = form.querySelector('#confirm');
  const submitBtn = form.querySelector('[data-role="submit"]');
  const submitText = form.querySelector('[data-role="submit-text"]');
  const submitSpinner = form.querySelector('[data-role="submit-spinner"]');
  const formSuccess = form.querySelector('[data-role="form-success"]');
  const formError = form.querySelector('[data-role="form-error"]');
  const passwordError = form.querySelector('[data-role="error-password"]');
  const confirmError = form.querySelector('[data-role="error-confirm"]');

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  function setFb(node, message) {
    node.textContent = message || '';
    node.setAttribute('data-visible', message ? 'true' : 'false');
  }

  function setFieldError(input, errorNode, message) {
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      errorNode.textContent = message;
      errorNode.setAttribute('data-visible', 'true');
    } else {
      input.removeAttribute('aria-invalid');
      errorNode.removeAttribute('data-visible');
    }
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitSpinner.style.display = loading ? 'inline-block' : 'none';
    submitText.style.opacity = loading ? '0.7' : '1';
  }

  if (!token) {
    setFb(formError, 'Ссылка для сброса пароля некорректна или истекла. Запросите новую.');
    submitBtn.disabled = true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFb(formSuccess, '');
    setFb(formError, '');

    if (!token) return;

    const password = passwordInput.value;
    const confirm = confirmInput.value;

    const pErr = API.validatePassword(password);
    const cErr = confirm !== password ? 'Пароли не совпадают' : null;
    setFieldError(passwordInput, passwordError, pErr);
    setFieldError(confirmInput, confirmError, cErr);
    if (pErr || cErr) return;

    setLoading(true);
    try {
      await API.passwordResetConfirm(token, password);
      try { API.logout(); } catch (_) {}
      setFb(formSuccess, 'Пароль успешно обновлён. Сейчас вы будете перенаправлены на страницу входа.');
      submitBtn.disabled = true;
      setTimeout(() => { window.location.href = '/login?password-reset=success'; }, 1800);
    } catch (err) {
      setFb(formError, err.message || 'Не удалось обновить пароль');
    } finally {
      setLoading(false);
    }
  });
})();