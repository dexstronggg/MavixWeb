#!/bin/bash
# Запуск тестов веб-части (Jest).
set -e
cd "$(dirname "$0")"
npm test
