/* ============================================================
   Mavix Web — bg.js
   Canvas-фон для auth-страниц: плавающие точки + линии между близкими.
   Низкая нагрузка, отключается при prefers-reduced-motion.
   ============================================================ */

(function () {
  const canvas = document.getElementById('auth-bg');
  if (!canvas) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let particles = [];

  const COLOR = { r: 0, g: 217, b: 255 };
  const LINK_DIST = 160;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.min(60, Math.floor((width * height) / 26000));
    particles = Array.from({ length: count }, () => spawn());
  }

  function spawn() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: 1 + Math.random() * 1.5,
    };
  }

  function step() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${COLOR.r}, ${COLOR.g}, ${COLOR.b}, 0.45)`;
      ctx.fill();
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < LINK_DIST * LINK_DIST) {
          const alpha = (1 - Math.sqrt(dist2) / LINK_DIST) * 0.18;
          ctx.strokeStyle = `rgba(${COLOR.r}, ${COLOR.g}, ${COLOR.b}, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(step);
  }

  window.addEventListener('resize', resize);
  resize();
  step();
})();
