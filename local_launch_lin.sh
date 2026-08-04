#!/usr/bin/env bash
# Локальный запуск MavixWeb на Linux (лендинг + личный кабинет).
# Требуется работающий MavixServer на http://localhost:8000.
#
# Использование:  ./local_launch_lin.sh
# Полный сброс:   rm -rf node_modules .env && ./local_launch_lin.sh

set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

command -v node >/dev/null 2>&1 || { echo "ОШИБКА: не найден node (нужен >= 18)" >&2; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "ОШИБКА: не найден npm" >&2; exit 1; }

if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "==> устанавливаю зависимости"
  if [ -f package-lock.json ]; then
    npm ci --silent
  else
    npm install --silent
  fi
fi

if [ ! -f .env ]; then
  echo "==> .env не найден — создаю локальный"
  cat > .env <<'EOF'
# Локальная конфигурация. Создана local_launch_lin.sh, в git не попадает.

PORT=3001
# Адрес отдаётся браузеру через GET /config.js — должен быть достижим
# из браузера, поэтому именно localhost, а не имя контейнера.
API_BASE_URL=http://localhost:8000
EOF
fi

echo "==> старт: http://localhost:3001"
exec npm start
