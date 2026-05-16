# MavixWeb

Лендинг и личный кабинет проекта Mavix — системы удалённого управления дронами через WebRTC.

## Стек

- Чистый **HTML + CSS + JavaScript** без фронтенд-фреймворков.
- Тонкий **Express**-сервер раздаёт статику и инжектит runtime-конфиг
  (`API_BASE_URL`) в браузер через `/config.js`, чтобы менять адрес бэка
  без пересборки клиента.
- Шрифты: Inter и JetBrains Mono с Google Fonts.

## Структура

```
MavixWeb/
├── server.js              # Express: статика + инжект /config.js + роуты
├── package.json
├── .env.example
└── public/
    ├── index.html         # /  — лендинг
    ├── login.html         # /login
    ├── register.html      # /register
    ├── forgot-password.html
    ├── reset-password.html
    ├── dashboard.html     # /dashboard — кабинет
    ├── docs-user.html     # /dashboard/docs/user
    ├── docs-technical.html# /dashboard/docs/technical
    ├── software.html      # /dashboard/software
    ├── 404.html
    ├── css/
    │   ├── base.css       # переменные, reset, типографика
    │   ├── components.css # кнопки, формы, карточки, бейджи
    │   ├── layout.css     # шапка, футер, сайдбар, auth-карточка
    │   └── pages.css      # стили страниц (hero, features, docs, …)
    └── js/
        ├── api.js         # MavixAPI — клиент к MavixServer
        ├── app.js         # общие хелперы (меню, logout, current page)
        ├── auth-guard.js  # редирект на /login для приватных страниц
        ├── bg.js          # canvas-фон auth-страниц
        └── pages/         # скрипты конкретных страниц
            ├── login.js
            ├── register.js
            ├── forgot-password.js
            ├── reset-password.js
            └── dashboard.js
```

## Запуск

```bash
npm install
npm start
```

Откройте `http://localhost:3001`.

## Конфигурация

Скопируйте `.env.example` в `.env` и при необходимости отредактируйте.

| Переменная     | По умолчанию              | Назначение                                                       |
|----------------|---------------------------|------------------------------------------------------------------|
| `PORT`         | `3001`                    | Порт веб-сервера.                                                |
| `API_BASE_URL` | `http://localhost:8000`   | Адрес MavixServer. К нему добавляется префикс `/api/v1` клиентом. |

Запросы из браузера идут напрямую на `API_BASE_URL`, поэтому он должен быть
указан в `CORS_ALLOW_ORIGINS` MavixServer.

## API

Клиент общается с MavixServer по REST. Реализованы вызовы:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh` — автоматически при ответе 401 на защищённом запросе.
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`
- `GET  /api/v1/health`

Токены хранятся в `localStorage` (`mavix_access`, `mavix_refresh`).
При смене браузера или очистке хранилища потребуется повторный вход.

## Документация

Полная Swagger-схема сервера доступна по адресу `/docs` запущенного MavixServer.
