/** @type {import('jest').Config} */
module.exports = {
  // Стандартное окружение — Node (для server-тестов).
  // Тесты, которым нужен DOM, объявляют /** @jest-environment jsdom */
  // в шапке файла.
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Не подбирать тесты из node_modules.
  testPathIgnorePatterns: ['/node_modules/'],
};
