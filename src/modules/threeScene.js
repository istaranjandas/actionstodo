// Static Vector Architectural Canvas (Zero Animations)
// Pure hairline vector blueprint geometry, coordinate crosshairs, and calibration matrix.

export function createThreeScene(containerEl) {
  if (!containerEl) return null;

  containerEl.innerHTML = '';

  const canvas = document.createElement('canvas');
  canvas.className = 'cinematic-movie-canvas';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '0';
  containerEl.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;
  let theme = document.documentElement.getAttribute('data-theme') || 'dark';
  let progressRatio = 0;

  function isDark() {
    return theme !== 'light';
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderStaticVector();
  }

  function renderStaticVector() {
    ctx.clearRect(0, 0, width, height);

    const dark = isDark();

    // 1. Solid Pure Void Background
    ctx.fillStyle = dark ? '#080a0f' : '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    // 2. Hairline Vector Blueprint Grid (40px)
    const gridSize = 40;
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.04)';

    ctx.beginPath();
    for (let x = 0; x <= width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // 3. Precision Vector Coordinate Crosshairs (+) at 120px intersections
    const crossSize = 3.5;
    ctx.lineWidth = 1;
    ctx.strokeStyle = dark ? 'rgba(212, 175, 55, 0.22)' : 'rgba(180, 140, 40, 0.25)';

    ctx.beginPath();
    for (let x = 120; x < width; x += 120) {
      for (let y = 120; y < height; y += 120) {
        ctx.moveTo(x - crossSize, y);
        ctx.lineTo(x + crossSize, y);
        ctx.moveTo(x, y - crossSize);
        ctx.lineTo(x, y + crossSize);
      }
    }
    ctx.stroke();

    // 4. Focal Static Vector Calibration Geometry (Right-Hand Blueprint Matrix)
    const cx = Math.min(width * 0.72, width - 260);
    const cy = Math.max(height * 0.45, 240);

    ctx.save();
    ctx.translate(cx, cy);

    const goldColor = dark ? 'rgba(212, 175, 55, 0.55)' : 'rgba(179, 143, 42, 0.65)';
    const mutedColor = dark ? 'rgba(148, 163, 184, 0.28)' : 'rgba(100, 116, 139, 0.35)';
    const subtleColor = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

    // Concentric Precision Vector Circles
    const radii = [160, 130, 95, 60, 25];
    radii.forEach((r, idx) => {
      ctx.beginPath();
      ctx.strokeStyle = idx % 2 === 0 ? goldColor : mutedColor;
      ctx.lineWidth = idx === 0 ? 1.2 : 0.75;
      if (idx === 1) {
        ctx.setLineDash([4, 4]); // Dashed technical ring
      } else {
        ctx.setLineDash([]);
      }
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Radial Vector Degree Ticks
    ctx.strokeStyle = goldColor;
    ctx.lineWidth = 1;
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = (deg * Math.PI) / 180;
      const isMajor = deg % 45 === 0;
      const rInner = isMajor ? 148 : 153;
      const rOuter = 160;

      ctx.beginPath();
      ctx.moveTo(Math.cos(rad) * rInner, Math.sin(rad) * rInner);
      ctx.lineTo(Math.cos(rad) * rOuter, Math.sin(rad) * rOuter);
      ctx.stroke();
    }

    // Hairline Axis Crosshair Extensions
    ctx.strokeStyle = subtleColor;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-220, 0);
    ctx.lineTo(220, 0);
    ctx.moveTo(0, -220);
    ctx.lineTo(0, 220);
    ctx.stroke();

    // Central Isometric Vector Cube Wireframe
    const s = 24;
    ctx.strokeStyle = goldColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    // Isometric Top Face
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.86, -s * 0.5);
    ctx.lineTo(0, 0);
    ctx.lineTo(-s * 0.86, -s * 0.5);
    ctx.closePath();
    // Isometric Left Face
    ctx.moveTo(-s * 0.86, -s * 0.5);
    ctx.lineTo(-s * 0.86, s * 0.5);
    ctx.lineTo(0, s);
    ctx.lineTo(0, 0);
    // Isometric Right Face
    ctx.moveTo(0, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(s * 0.86, s * 0.5);
    ctx.lineTo(s * 0.86, -s * 0.5);
    ctx.stroke();

    // Static Vector Telemetry Typography
    ctx.font = '500 9px "Geist Mono", monospace';
    ctx.letterSpacing = '0.08em';
    ctx.fillStyle = mutedColor;
    ctx.textAlign = 'left';
    ctx.fillText('VECTOR REF // 01-A', 172, -145);
    ctx.fillText('CALIBRATION: STATIC', 172, -130);
    ctx.fillText('GRID SPACING: 40PX', 172, -115);

    // Corner Registration Brackets
    const brLen = 14;
    const brDist = 190;
    ctx.strokeStyle = goldColor;
    ctx.lineWidth = 1;

    // Top-Left ⌜
    ctx.beginPath();
    ctx.moveTo(-brDist, -brDist + brLen);
    ctx.lineTo(-brDist, -brDist);
    ctx.lineTo(-brDist + brLen, -brDist);
    ctx.stroke();

    // Top-Right ⌝
    ctx.beginPath();
    ctx.moveTo(brDist - brLen, -brDist);
    ctx.lineTo(brDist, -brDist);
    ctx.lineTo(brDist, -brDist + brLen);
    ctx.stroke();

    // Bottom-Left ⌞
    ctx.beginPath();
    ctx.moveTo(-brDist, brDist - brLen);
    ctx.lineTo(-brDist, brDist);
    ctx.lineTo(-brDist + brLen, brDist);
    ctx.stroke();

    // Bottom-Right ⌟
    ctx.beginPath();
    ctx.moveTo(brDist - brLen, brDist);
    ctx.lineTo(brDist, brDist);
    ctx.lineTo(brDist, brDist - brLen);
    ctx.stroke();

    ctx.restore();
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    triggerPulse() {
      // Pure static vector — zero animation
    },
    updateProgress(completed, total) {
      progressRatio = total ? completed / total : 0;
      renderStaticVector();
    },
    setTheme(nextTheme) {
      theme = nextTheme;
      renderStaticVector();
    },
    destroy() {
      window.removeEventListener('resize', resize);
      if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    }
  };
}
