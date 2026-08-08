const fs = require('fs');
const request = require('supertest');
const { app, PAGES } = require('../server');

describe('Express server', () => {
  describe.each(Object.entries(PAGES))('маршрут %s', (route) => {
    test('возвращает 200 и HTML', async () => {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });

    test('Cache-Control: no-cache и без ETag/Last-Modified', async () => {
      const res = await request(app).get(route);
      expect(res.headers['cache-control']).toContain('no-cache');
      expect(res.headers.etag).toBeUndefined();
      expect(res.headers['last-modified']).toBeUndefined();
    });
  });

  test('несуществующий маршрут возвращает 404', async () => {
    const res = await request(app).get('/no-such-page-' + Date.now());
    expect(res.status).toBe(404);
    expect(res.headers.etag).toBeUndefined();
    expect(res.headers['last-modified']).toBeUndefined();
  });

  describe('error-handler', () => {
    test('ошибка отдачи файла страницы → 500 с русским сообщением', async () => {
      const statSpy = jest.spyOn(fs, 'stat').mockImplementation((p, cb) => {
        const err = new Error('EACCES: permission denied');
        err.code = 'EACCES';
        cb(err);
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const res = await request(app).get('/login');
        expect(res.status).toBe(500);
        expect(res.text).toBe('Внутренняя ошибка сервера');
      } finally {
        statSpy.mockRestore();
        consoleSpy.mockRestore();
      }
    });
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
});