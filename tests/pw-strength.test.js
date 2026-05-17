/** @jest-environment jsdom */

const fs = require('fs');
const path = require('path');

const PW_JS = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'pw-strength.js'),
  'utf8'
);

function loadPwStrength() {
  const script = document.createElement('script');
  script.textContent = PW_JS;
  document.head.appendChild(script);
}

function setPassword(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function strengthLevel() {
  const wrap = document.querySelector('.pw-strength');
  if (!wrap || wrap.hidden) return null;
  return wrap.getAttribute('data-level');
}

describe('pw-strength.js', () => {
  let input;

  beforeEach(() => {
    document.body.innerHTML =
      '<input type="password" data-strength id="pw">';
    input = document.querySelector('#pw');
    loadPwStrength();
  });

  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  test('инициализация прицепляет блок .pw-strength после input', () => {
    expect(document.querySelector('.pw-strength')).not.toBeNull();
  });

  test('пустой пароль — блок скрыт, уровня нет', () => {
    setPassword(input, '');
    expect(strengthLevel()).toBeNull();
    expect(document.querySelector('.pw-strength').hidden).toBe(true);
  });

  test('короткий пароль (3 символа) — weak', () => {
    setPassword(input, 'abc');
    expect(strengthLevel()).toBe('weak');
  });

  test('одни строчные 8 символов — weak (score 1)', () => {
    setPassword(input, 'abcdefgh');
    expect(strengthLevel()).toBe('weak');
  });

  test('буквы и цифры, 8 символов — medium (score 2)', () => {
    setPassword(input, 'abcdef12');
    expect(strengthLevel()).toBe('medium');
  });

  test('смешанный регистр + цифры, 10 символов — medium (score 3)', () => {
    setPassword(input, 'AbcDefGh12');
    expect(strengthLevel()).toBe('medium');
  });

  test('смешанный регистр + цифры + спецсимвол, 11 символов — strong (score 4)', () => {
    setPassword(input, 'AbcDefGh12!');
    expect(strengthLevel()).toBe('strong');
  });

  test('всё сразу + длина ≥ 12 — strong (score 5)', () => {
    setPassword(input, 'AbcDefGhij12!');
    expect(strengthLevel()).toBe('strong');
  });

  test('label обновляется вместе с уровнем', () => {
    setPassword(input, 'abc');
    expect(document.querySelector('.pw-strength-label').textContent).toBe(
      'Слабый'
    );

    setPassword(input, 'abcdef12');
    expect(document.querySelector('.pw-strength-label').textContent).toBe(
      'Средний'
    );

    setPassword(input, 'AbcDefGh12!');
    expect(document.querySelector('.pw-strength-label').textContent).toBe(
      'Надёжный'
    );
  });

  test('после очистки поля блок снова скрывается', () => {
    setPassword(input, 'AbcDefGh12!');
    expect(document.querySelector('.pw-strength').hidden).toBe(false);
    setPassword(input, '');
    expect(document.querySelector('.pw-strength').hidden).toBe(true);
  });
});
