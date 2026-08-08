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
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', file), { etag: false, lastModified: false });
  });
}

app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));

app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), { etag: false, lastModified: false }, (err) => {
    if (err) res.status(404).send('Not found');
  });
});

app.use((err, _req, res, next) => {
  console.error('[mavix-web] ошибка:', err);
  if (res.headersSent) return next(err);
  res.status(500).send('Внутренняя ошибка сервера');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[mavix-web] listening on http://localhost:${PORT}`);
    console.log(`[mavix-web] API_BASE_URL=${API_BASE_URL} (браузер получает через /config.js)`);
  });
}

module.exports = { app, PAGES };
