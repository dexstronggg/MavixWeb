(function () {
  const API = window.MavixAPI;
  if (!API) return;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function setFb(node, message) {
    if (!node) return;
    node.textContent = message || '';
    node.setAttribute('data-visible', message ? 'true' : 'false');
  }

  ready(() => {
    const btn = document.querySelector('[data-role="reset-btn"]');
    const btnText = document.querySelector('[data-role="reset-btn-text"]');
    const btnSpinner = document.querySelector('[data-role="reset-btn-spinner"]');
    const fbSuccess = document.querySelector('[data-role="form-success"]');
    const fbError = document.querySelector('[data-role="form-error"]');
    const emailLabel = document.querySelector('[data-role="user-email"]');

    const email = API.session.email || '';
    if (emailLabel && email) emailLabel.textContent = email;

    if (!btn) return;

    function setLoading(loading) {
      btn.disabled = loading;
      btnSpinner.style.display = loading ? 'inline-block' : 'none';
      btnText.style.opacity = loading ? '0.7' : '1';
    }

    btn.addEventListener('click', async () => {
      setFb(fbSuccess, '');
      setFb(fbError, '');

      if (!email) {
        setFb(fbError, 'Не удалось определить ваш email. Войдите заново.');
        return;
      }

      setLoading(true);
      try {
        await API.passwordResetRequest(email);
        setFb(
          fbSuccess,
          `Письмо со ссылкой для смены пароля отправлено на ${email}. ` +
          'Ссылка действительна один час.'
        );
      } catch (err) {
        setFb(fbError, (err && err.message) || 'Не удалось отправить запрос. Попробуйте позже.');
      } finally {
        setLoading(false);
      }
    });
  });
})();