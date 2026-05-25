const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { app, PAGES } = require('../server');

describe('Express server', () => {
  describe.each(Object.entries(PAGES))('маршрут %s', (route) => {
    test('возвращает 200 и HTML', async () => {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });
  });

  test('несуществующий маршрут возвращает 404', async () => {
    const res = await request(app).get('/no-such-page-' + Date.now());
    expect(res.status).toBe(404);
  });

  describe('GET /config.js', () => {
    let res;

    beforeAll(async () => {
      res = await request(app).get('/config.js');
    });

    test('200 OK', () => {
      expect(res.status).toBe(200);
    });

    test('Content-Type application/javascript', () => {
      expect(res.headers['content-type']).toMatch(/javascript/);
    });

    test('тело — JS-присваивание window.MAVIX_CONFIG валидным объектом', () => {
      // Формат: window.MAVIX_CONFIG = { "apiBaseUrl": "..." };
      const match = res.text.match(
        /^window\.MAVIX_CONFIG\s*=\s*(\{.*\});$/s
      );
      expect(match).not.toBeNull();
      const cfg = JSON.parse(match[1]);
      expect(typeof cfg.apiBaseUrl).toBe('string');
      expect(cfg.apiBaseUrl.length).toBeGreaterThan(0);
    });

    test('не кешируется', () => {
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('GET /downloads/*', () => {
    const DOWNLOADS_DIR = path.join(__dirname, '..', 'public', 'downloads');
    const DEB = path.join(DOWNLOADS_DIR, 'mavix-desktop-linux.deb');
    const EXE = path.join(DOWNLOADS_DIR, 'mavix-desktop-windows.exe');

    test('.deb отдаёт 200 и application/vnd.debian.binary-package, если файл есть', async () => {
      if (!fs.existsSync(DEB)) {
        // в CI без артефакта пропускаем — поведение проверяется
        // отдельным тестом «404 на отсутствующий файл»
        return;
      }
      const res = await request(app)
        .get('/downloads/mavix-desktop-linux.deb')
        .buffer(false);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/debian\.binary-package/);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect(res.headers['content-disposition']).toMatch(/mavix-desktop-linux\.deb/);
    });

    test('.exe → 404 plain-text для XHR (Accept: application/octet-stream), если файла нет', async () => {
      if (fs.existsSync(EXE)) return; // в локальной разработке файла обычно нет
      const res = await request(app)
        .get('/downloads/mavix-desktop-windows.exe')
        .set('Accept', 'application/octet-stream');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toMatch(/не загружен на сервер/);
    });

    test('.exe → 404 HTML-страница для браузера (Accept: text/html), если файла нет', async () => {
      if (fs.existsSync(EXE)) return;
      const res = await request(app)
        .get('/downloads/mavix-desktop-windows.exe')
        .set('Accept', 'text/html');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toMatch(/404/);
    });
  });
});
