// Pure Vector Cursor & Optical Reticle Engine (Zero Extraneous Animations)
// Minimalist, razor-sharp vector targeting reticle that follows the cursor and responds to clicks.

export function setupInteractiveEffects() {
  if (typeof window === 'undefined') return;

  // 1. Full-screen Vector Reticle Canvas
  let canvas = document.getElementById('fxCanvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'fxCanvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '99999';
    document.body.appendChild(canvas);
  }

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const isDark = () => document.documentElement.getAttribute('data-theme') !== 'light';

  // Vector Reticle State
  const mouse = { x: -100, y: -100, isHovering: false, isDown: false };
  const reticle = {
    x: -100,
    y: -100,
    size: 20,
    targetSize: 20,
    color: '#d4af37'
  };

  const clickRipples = [];

  // Audio Haptic Synthesizer (Subtle Vector Tactile Click)
  let audioCtx = null;
  function playVectorClick() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.03);
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.03);
    } catch (_) {}
  }

  // Pointer Movement Tracking
  window.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;

    if (reticle.x === -100) {
      reticle.x = mouse.x;
      reticle.y = mouse.y;
    }

    // Interactive Element Magnetic Vector Snap
    const target = e.target;
    const isInteractive = target && target.closest && (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input') ||
      target.closest('.task-row') ||
      target.closest('.chip-btn') ||
      target.closest('.sidebar-item') ||
      target.closest('.cal-cell') ||
      target.closest('[role="button"]')
    );

    if (isInteractive) {
      reticle.targetSize = 32;
      reticle.color = '#d4af37'; // Precision gold
      mouse.isHovering = true;
    } else {
      reticle.targetSize = 18;
      reticle.color = isDark() ? 'rgba(255, 255, 255, 0.55)' : 'rgba(15, 23, 42, 0.65)';
      mouse.isHovering = false;
    }
  }, { passive: true });

  window.addEventListener('pointerdown', (e) => {
    mouse.isDown = true;
    playVectorClick();

    // Single instantaneous hairline vector shockwave ring
    clickRipples.push({
      x: e.clientX,
      y: e.clientY,
      radius: 4,
      maxRadius: 28,
      life: 1.0,
      decay: 0.12,
      color: isDark() ? '#d4af37' : '#b38f2a'
    });
  });

  window.addEventListener('pointerup', () => {
    mouse.isDown = false;
  });

  // Vector Reticle Draw Loop
  let animId;
  function renderVectorReticle() {
    animId = requestAnimationFrame(renderVectorReticle);
    ctx.clearRect(0, 0, width, height);

    if (mouse.x < 0 || mouse.y < 0) return;

    // Direct, tight vector tracking
    reticle.x += (mouse.x - reticle.x) * 0.35;
    reticle.y += (mouse.y - reticle.y) * 0.35;
    reticle.size += (reticle.targetSize - reticle.size) * 0.25;

    // 1. Render Instant Hairline Vector Click Ripples
    for (let i = clickRipples.length - 1; i >= 0; i--) {
      const r = clickRipples[i];
      r.radius += (r.maxRadius - r.radius) * 0.35;
      r.life -= r.decay;

      if (r.life <= 0) {
        clickRipples.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = r.life;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Render Optical Precision Vector Cursor
    ctx.save();
    ctx.translate(reticle.x, reticle.y);

    // Center Vector Dot
    ctx.fillStyle = isDark() ? '#f8fafc' : '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Concentric Hairline Vector Circle
    const radius = reticle.size / 2;
    ctx.strokeStyle = reticle.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Four Optical Corner Vector Brackets (⌜ ⌝ ⌞ ⌟)
    const tickLen = 3.5;
    const tickOffset = radius + 2.5;

    ctx.strokeStyle = isDark() ? 'rgba(212, 175, 55, 0.75)' : 'rgba(180, 140, 40, 0.75)';
    ctx.lineWidth = 1;

    for (let a = 0; a < 4; a++) {
      ctx.save();
      ctx.rotate((Math.PI / 2) * a);
      ctx.beginPath();
      ctx.moveTo(0, tickOffset);
      ctx.lineTo(0, tickOffset + tickLen);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  animId = requestAnimationFrame(renderVectorReticle);

  return {
    spawnBurst(x, y) {
      clickRipples.push({
        x,
        y,
        radius: 4,
        maxRadius: 28,
        life: 1.0,
        decay: 0.12,
        color: isDark() ? '#d4af37' : '#b38f2a'
      });
    },
    spawnCelebration(x, y) {
      clickRipples.push({
        x,
        y,
        radius: 6,
        maxRadius: 36,
        life: 1.0,
        decay: 0.1,
        color: '#d4af37'
      });
    },
    destroy() {
      if (animId) cancelAnimationFrame(animId);
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  };
}
