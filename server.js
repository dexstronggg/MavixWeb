require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000';

app.disable('x-powered-by');
app.disable('etag');

app.get('/config.js', (_req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send(`window.MAVIX_CONFIG = ${JSON.stringify({ apiBaseUrl: API_BASE_URL })};`);
});

const PAGES = {
  '/': 'index.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/forgot-password': 'forgot-password.html',
  '/reset-password': 'reset-password.html',
  '/dashboard': 'dashboard.html',
  '/dashboard/settings': 'settings.html',
  '/dashboard/docs/user': 'docs-user.html',
  '/dashboard/docs/technical': 'docs-technical.html',
  '/dashboard/software': 'software.html',
};

for (const [route, file] of Object.entries(PAGES)) {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', file));
  });
}

// Скачивание дистрибутивов MavixDesktop. Whitelisted-маршруты — каждый
// явно перечислен, никакой подстановки имени файла из URL: исключает
// path traversal. Файлы кладутся в public/downloads/ из CI/CD сборки
// MavixDesktop-UI (scripts/build_windows.ps1 + scripts/build_linux.sh).
// Если файла нет — отдаём 404 с понятным сообщением вместо стандартной
// HTML-страницы.
const DOWNLOADS = {
  '/downloads/mavix-desktop-windows.exe': 'mavix-desktop-windows.exe',
  '/downloads/mavix-desktop-linux.deb':   'mavix-desktop-linux.deb',
};
const DOWNLOADS_DIR = path.join(__dirname, 'public', 'downloads');

for (const [route, filename] of Object.entries(DOWNLOADS)) {
  app.get(route, (_req, res) => {
    const filepath = path.join(DOWNLOADS_DIR, filename);
    res.download(filepath, filename, (err) => {
      if (err && !res.headersSent) {
        res.status(404).type('text/plain; charset=utf-8').send(
          `Файл ${filename} ещё не загружен на сервер.\n` +
          `Свяжитесь с администратором или повторите попытку позже.`,
        );
      }
    });
  });
}

app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));

app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
    if (err) res.status(404).send('Not found');
  });
});

// Поднимаем сервер только если файл запущен напрямую — иначе он
// импортируется тестами, и app.listen() занимал бы порт.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[mavix-web] listening on http://localhost:${PORT}`);
    console.log(`[mavix-web] proxying API to ${API_BASE_URL}`);
  });
}

module.exports = { app, PAGES };
