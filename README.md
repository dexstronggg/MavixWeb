# MavixWeb

Веб-приложение проекта Mavix: публичный лендинг и личный кабинет
пользователя (документация, скачивание ПО, смена пароля). Тонкий
Express-сервер поверх статических HTML/CSS/JS.

## Стек

- **Node.js 18+**, Express 4
- **dotenv** — управление переменными окружения
- **Vanilla HTML + CSS + JavaScript** в браузере, без фреймворков и сборщиков
- **Inter + JetBrains Mono** — шрифты с Google Fonts
- Runtime-конфиг: сервер отдаёт `/config.js`, инжектящий
  `window.MAVIX_CONFIG.apiBaseUrl` — адрес MavixServer без пересборки клиента

## Установка и запуск локально

```bash
cp .env.example .env
npm install
npm start
```

Откройте `http://localhost:3001`.

## Переменные окружения

| Переменная     | По умолчанию            | Описание                                                                       |
|----------------|-------------------------|--------------------------------------------------------------------------------|
| `PORT`         | `3001`                  | Порт веб-сервера                                                               |
| `API_BASE_URL` | `http://localhost:8000` | Адрес MavixServer. Клиент сам дописывает `/api/v1` к этому значению            |

Адрес из `API_BASE_URL` должен присутствовать в `CORS_ALLOW_ORIGINS`
сервера MavixServer — иначе браузер заблокирует кросс-доменные запросы.

## Маршруты

| URL                              | Назначение                       |
|----------------------------------|----------------------------------|
| `/`                              | Лендинг                          |
| `/login`                         | Вход                             |
| `/register`                      | Регистрация                      |
| `/forgot-password`               | Запрос ссылки для сброса пароля  |
| `/reset-password?token=…`        | Установка нового пароля          |
| `/dashboard`                     | Главная личного кабинета         |
| `/dashboard/settings`            | Настройки (смена пароля)         |
| `/dashboard/docs/user`           | Пользовательская документация    |
| `/dashboard/docs/technical`      | Техническая документация         |
| `/dashboard/software`            | Скачивание клиентского ПО        |
| `/config.js`                     | Runtime-конфиг для браузера      |

## API

MavixWeb — клиент к MavixServer. Использует следующие endpoint-ы
(`API_BASE_URL` + `/api/v1`):

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh` — автоматически при ответе `401` на защищённом запросе
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `GET  /health` — проверка доступности (для баннера «сервер не отвечает»)

Полная Swagger-схема — `/docs` запущенного MavixServer.

Access- и refresh-токены хранятся в `localStorage` (`mavix_access`,
`mavix_refresh`). Очистка хранилища или смена браузера требует повторного
входа.

## Тесты

```bash
npm install
npm test
```

Покрытие:

- `tests/server.test.js` — Express-сервер (supertest): все маршруты
  из `PAGES` возвращают 200 HTML, несуществующий URL — 404,
  `/config.js` отдаёт валидный JS с `window.MAVIX_CONFIG.apiBaseUrl`.
- `tests/video.test.js` — `setupVideoFallback` и `setupVideoPlayer`
  из `js/app.js` (jsdom): HEAD 200 оставляет плеер, 404/сетевая
  ошибка показывают placeholder, клики по кнопке и видео корректно
  играют/паузят.
- `tests/pw-strength.test.js` — `js/pw-strength.js` (jsdom): уровни
  weak/medium/strong для эталонных паролей, скрытие блока при пустом
  значении, обновление подписи.

## Документация

- [TECHNICAL.md](./TECHNICAL.md) — техническое описание программы
  (ГОСТ 19.402-78).
- [USER_GUIDE.md](./USER_GUIDE.md) — руководство оператора
  (ГОСТ 19.505-79).
