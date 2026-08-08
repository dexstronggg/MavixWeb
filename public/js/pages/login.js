(function () {
  const form = document.getElementById('login-form');
  if (!form) return;
  const API = window.MavixAPI;

  const emailInput = form.querySelector('#email');
  const passwordInput = form.querySelector('#password');
  const submitBtn = form.querySelector('[data-role="submit"]');
  const submitText = form.querySelector('[data-role="submit-text"]');
  const submitSpinner = form.querySelector('[data-role="submit-spinner"]');
  const formSuccess = form.querySelector('[data-role="form-success"]');
  const formError = form.querySelector('[data-role="form-error"]');
  const emailError = form.querySelector('[data-role="error-email"]');
  const passwordError = form.querySelector('[data-role="error-password"]');

  function setError(node, message) {
    node.textContent = message || '';
    node.setAttribute('data-visible', message ? 'true' : 'false');
  }

  if (!API) {
    setError(formError, 'Конфигурация приложения не загружена. Обновите страницу или обратитесь к администратору.');
    submitBtn.disabled = true;
    return;
  }

  (function showPostResetNotice() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('password-reset') === 'success' && formSuccess) {
      setError(formSuccess, 'Пароль успешно изменён. Войдите с новым паролем.');
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  })();

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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError(formError, '');
    if (formSuccess) setError(formSuccess, '');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const eErr = API.validateEmail(email);
    const pErr = API.validatePassword(password);
    setFieldError(emailInput, emailError, eErr);
    setFieldError(passwordInput, passwordError, pErr);
    if (eErr || pErr) return;

    setLoading(true);
    try {
      await API.login(email, password);
      if (typeof API.startBackgroundRefresh === 'function') {
        try { API.startBackgroundRefresh(); } catch (_) {}
      }
      window.location.href = '/dashboard';
    } catch (err) {
      setError(formError, err.message || 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  });
})();