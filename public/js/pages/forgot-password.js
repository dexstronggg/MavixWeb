(function () {
  const form = document.getElementById('forgot-form');
  if (!form) return;
  const API = window.MavixAPI;

  const emailInput = form.querySelector('#email');
  const submitBtn = form.querySelector('[data-role="submit"]');
  const submitText = form.querySelector('[data-role="submit-text"]');
  const submitSpinner = form.querySelector('[data-role="submit-spinner"]');
  const formInfo = form.querySelector('[data-role="form-info"]');
  const formError = form.querySelector('[data-role="form-error"]');
  const emailError = form.querySelector('[data-role="error-email"]');

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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFb(formInfo, '');
    setFb(formError, '');

    const email = emailInput.value.trim();
    const eErr = API.validateEmail(email);
    setFieldError(emailInput, emailError, eErr);
    if (eErr) return;

    setLoading(true);
    try {
      await API.passwordResetRequest(email);
      setFb(formInfo, 'Если такой email зарегистрирован, на него отправлена ссылка для сброса пароля. Проверьте почту.');
      emailInput.value = '';
    } catch (err) {
      setFb(formError, err.message || 'Не удалось отправить запрос');
    } finally {
      setLoading(false);
    }
  });
})();
