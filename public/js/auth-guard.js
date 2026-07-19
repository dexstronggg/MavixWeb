(function () {
  const API = window.MavixAPI;
  if (!API) {
    window.location.href = '/login';
    return;
  }

  function goLogin() {
    try { API.stopBackgroundRefresh && API.stopBackgroundRefresh(); } catch (_) {}
    window.location.href = '/login';
  }

  if (!API.session.isAuthenticated()) {
    goLogin();
    return;
  }

  if (!API.tokens.isAccessStale()) {
    API.startBackgroundRefresh();
    return;
  }

  API.ensureFreshAccess().then((ok) => {
    if (!ok) {
      goLogin();
      return;
    }
    API.startBackgroundRefresh();
  }).catch(() => {
  });
})();