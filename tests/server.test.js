const request = require('supertest');
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
});
