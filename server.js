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
//
// Если файла нет:
//   • для прямого перехода в браузере (Accept: text/html) — отдаём
//     красивую 404.html-страницу, а не голый «Not found»;
//   • для XHR (Accept: application/octet-stream и т.п.) — отдаём
//     plain-text 404, чтобы фронт мог показать notice локально.
const DOWNLOADS = {
  '/downloads/mavix-desktop-windows.exe': {
    filename: 'mavix-desktop-windows.exe',
    mime:     'application/octet-stream',
  },
  '/downloads/mavix-desktop-linux.AppImage': {
    filename: 'mavix-desktop-linux.AppImage',
    mime:     'application/octet-stream',
  },
};
const DOWNLOADS_DIR = path.join(__dirname, 'public', 'downloads');

for (const [route, { filename, mime }] of Object.entries(DOWNLOADS)) {
  app.get(route, (req, res) => {
    const filepath = path.resolve(DOWNLOADS_DIR, filename);
    res.download(filepath, filename, {
      headers: {
        'Content-Type':        mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    }, (err) => {
      if (!err || res.headersSent) return;
      const wantsHtml = (req.headers.accept || '').includes('text/html');
      if (wantsHtml) {
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (e) => {
          if (e) {
            res.status(404).type('text/plain; charset=utf-8').send(
              `Файл ${filename} ещё не загружен на сервер.\n` +
              `Свяжитесь с администратором или повторите попытку позже.`,
            );
          }
        });
      } else {
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
