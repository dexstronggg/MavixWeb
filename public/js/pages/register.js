(function () {
  const form = document.getElementById('register-form');
  if (!form) return;
  const API = window.MavixAPI;

  const emailInput = form.querySelector('#email');
  const passwordInput = form.querySelector('#password');
  const confirmInput = form.querySelector('#confirm');
  const submitBtn = form.querySelector('[data-role="submit"]');
  const submitText = form.querySelector('[data-role="submit-text"]');
  const submitSpinner = form.querySelector('[data-role="submit-spinner"]');
  const formError = form.querySelector('[data-role="form-error"]');
  const emailError = form.querySelector('[data-role="error-email"]');
  const passwordError = form.querySelector('[data-role="error-password"]');
  const confirmError = form.querySelector('[data-role="error-confirm"]');

  function setError(node, message) {
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError(formError, '');

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;

    const eErr = API.validateEmail(email);
    const pErr = API.validatePassword(password);
    const cErr = confirm !== password ? 'Пароли не совпадают' : null;
    setFieldError(emailInput, emailError, eErr);
    setFieldError(passwordInput, passwordError, pErr);
    setFieldError(confirmInput, confirmError, cErr);
    if (eErr || pErr || cErr) return;

    setLoading(true);
    try {
      await API.register(email, password);
      if (typeof API.startBackgroundRefresh === 'function') {
        try { API.startBackgroundRefresh(); } catch (_) {}
      }
      window.location.href = '/dashboard';
    } catch (err) {
      setError(formError, err.message || 'Не удалось создать аккаунт');
    } finally {
      setLoading(false);
    }
  });
})();