/** @jest-environment jsdom */

const fs = require('fs');
const path = require('path');

const APP_JS = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app.js'),
  'utf8'
);

// Запускаем app.js в текущем jsdom-окне как inline-скрипт.
// document.readyState в jsdom — 'complete', поэтому ready(fn) внутри
// сразу вызывает setupVideoFallback и setupVideoPlayer.
function runAppJs() {
  const script = document.createElement('script');
  script.textContent = APP_JS;
  document.head.appendChild(script);
}

// Ждём резолва микротасок (fetch().then(...)).
function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

function setupVideoDom() {
  document.body.innerHTML = `
    <div>
      <video data-role="demo-video">
        <source src="/videos/demo.mp4" type="video/mp4">
      </video>
      <button data-role="video-play"></button>
      <div data-role="video-placeholder" hidden>placeholder</div>
    </div>
  `;
}

describe('setupVideoFallback', () => {
  beforeEach(() => {
    setupVideoDom();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  test('HEAD 200 — плеер остаётся, placeholder скрыт', async () => {
    global.fetch.mockResolvedValue({ ok: true });
    runAppJs();
    await flush();

    expect(document.querySelector('[data-role="demo-video"]')).not.toBeNull();
    expect(document.querySelector('[data-role="video-play"]')).not.toBeNull();
    expect(document.querySelector('[data-role="video-placeholder"]').hidden).toBe(
      true
    );
    expect(global.fetch).toHaveBeenCalledWith(
      '/videos/demo.mp4',
      expect.objectContaining({ method: 'HEAD' })
    );
  });

  test('HEAD 404 — видео и кнопка удаляются, виден placeholder', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404 });
    runAppJs();
    await flush();

    expect(document.querySelector('[data-role="demo-video"]')).toBeNull();
    expect(document.querySelector('[data-role="video-play"]')).toBeNull();
    expect(document.querySelector('[data-role="video-placeholder"]').hidden).toBe(
      false
    );
  });

  test('сетевая ошибка — тоже падаем на placeholder', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    runAppJs();
    await flush();

    expect(document.querySelector('[data-role="demo-video"]')).toBeNull();
    expect(document.querySelector('[data-role="video-placeholder"]').hidden).toBe(
      false
    );
  });
});

describe('setupVideoPlayer', () => {
  let video;
  let playSpy;
  let pauseSpy;

  beforeEach(async () => {
    setupVideoDom();
    // setupVideoFallback всё равно дёрнет fetch — пусть будет ok.
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    video = document.querySelector('[data-role="demo-video"]');

    // jsdom не реализует play()/pause() полноценно — мокаем.
    playSpy = jest
      .spyOn(video, 'play')
      .mockImplementation(() => Promise.resolve());
    pauseSpy = jest.spyOn(video, 'pause').mockImplementation(() => {});

    runAppJs();
    await flush();
  });

  afterEach(() => {
    delete global.fetch;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('клик по кнопке play вызывает video.play()', () => {
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });

    document.querySelector('[data-role="video-play"]').click();
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).not.toHaveBeenCalled();
  });

  test('клик по играющему видео — pause', () => {
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });

    video.click();
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).not.toHaveBeenCalled();
  });

  test('клик по поставленному на паузу видео — play', () => {
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });

    video.click();
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).not.toHaveBeenCalled();
  });
});
