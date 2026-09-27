/*
 * 캔버스 렌더러 — ScentEngine.computeParams() 결과만을 입력으로 그린다.
 * 난수를 쓰지 않으며, 내부 해상도가 고정되어 있어 같은 벡터는 같은 픽셀을 만든다.
 */
(function (root) {
  'use strict';
  const E = root.ScentEngine;
  const TAU = Math.PI * 2;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const PHI_FRAC = 0.6180339887498949;
  const BG = [0.075, 0.071, 0.086];

  function mixRgb(a, b, t) { return a.map((x, i) => x + (b[i] - x) * t); }

  function supportsFilter(ctx) { return typeof ctx.filter === 'string'; }

  /** 형태 경로: r(θ)를 반경 R, 회전 rot, 스케일 k로 그린다. */
  function shapePath(ctx, shape, cx, cy, R, rot) {
    const n = shape.length;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const th = (idx / n) * TAU + rot;
      const r = R * shape[idx];
      const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function render(canvas, params) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const S = Math.min(W, H);
    const cx = W / 2, cy = H / 2;
    const { color, spread, trail, stroke, shape, opacity, vector } = params;
    const P = color.primary, Q = color.secondary;
    const canFilter = supportsFilter(ctx);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (canFilter) ctx.filter = 'none';
    ctx.setLineDash([]);

    // 1. 배경 — 기본 톤이 아주 옅게 스민 어두운 바탕
    ctx.fillStyle = E.rgbCss(mixRgb(BG, P, 0.07));
    ctx.fillRect(0, 0, W, H);

    // 2. 확산 글로우 (실라주)
    const Rs = spread.radius * S;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rs * 1.35);
    glow.addColorStop(0, E.rgbCss(P, spread.glow * (0.4 + 0.6 * opacity)));
    glow.addColorStop(0.55, E.rgbCss(Q, spread.glow * 0.35 * (0.4 + 0.6 * opacity)));
    glow.addColorStop(1, E.rgbCss(Q, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // 3. 확산 입자 — 보겔 나선 + 형태 r(θ) 변조, 계열 색은 구성 비율 pᵢ에 따라 배정
    ctx.globalCompositeOperation = 'lighter';
    const N = spread.particles;
    const whole = Math.floor(N);
    const dotR = S * (0.0022 + 0.0026 * vector.c);
    const nShape = shape.length;
    for (let i = 0; i <= whole; i++) {
      const partial = i === whole ? N - whole : 1;
      if (partial <= 0) break;
      const t = (i + 0.5) / N;
      const th = i * GOLDEN_ANGLE;
      const idx = Math.floor((((th % TAU) + TAU) % TAU) / TAU * nShape) % nShape;
      const rho = Rs * Math.pow(Math.min(t, 1), spread.exponent) * shape[idx];
      const fam = E.pickFamily(params.weights, (i * PHI_FRAC) % 1);
      const col = E.familyColor(fam, Math.min(1, rho / Rs), vector.c);
      const a = partial * (0.25 + 0.6 * opacity) * (1 - 0.55 * Math.min(1, rho / (Rs * 1.3)));
      ctx.fillStyle = E.rgbCss(col, a);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(th) * rho, cy + Math.sin(th) * rho, dotR * (1.2 - 0.6 * t), 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    const Rc = spread.core * S;
    const blurPx = params.blur * S;

    // 4. 잔상 트레일 (지속력) — 회전하며 번지는 그라데이션 레이어
    const trailTotal = trail.count + (trail.frac > 0 ? 1 : 0);
    for (let j = trailTotal; j >= 1; j--) {
      const partial = j === trailTotal && trail.frac > 0 ? trail.frac : 1;
      const k = j / (trail.count + 1);
      const a = partial * opacity * 0.42 * Math.pow(1 - k * 0.92, trail.decay);
      if (a <= 0.001) continue;
      const R = Rc * 1.35 * (1 + trail.grow * j * 2);
      if (canFilter) ctx.filter = `blur(${(blurPx + S * 0.0035 * j).toFixed(2)}px)`;
      const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.3);
      g.addColorStop(0, E.rgbCss(P, 0));
      g.addColorStop(0.6, E.rgbCss(mixRgb(P, Q, k), a));
      g.addColorStop(1, E.rgbCss(Q, a * 0.3));
      ctx.fillStyle = g;
      shapePath(ctx, shape, cx, cy, R, -trail.rotate * j * 2);
      ctx.fill();
    }
    if (canFilter) ctx.filter = 'none';

    // 5. 코어 레이어 (농도: 채도·불투명도·흐림)
    if (canFilter && blurPx > 0.05) ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
    for (let k = 0; k < params.layers; k++) {
      const t = k / (params.layers - 1);        // 0 바깥 → 1 안쪽
      const R = Rc * 1.35 * (1 - 0.72 * t);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.3);
      g.addColorStop(0, E.rgbCss(mixRgb(P, [1, 1, 1], 0.18 * t), opacity * (0.5 + 0.5 * t)));
      g.addColorStop(1, E.rgbCss(mixRgb(Q, P, 0.55 + 0.45 * t), opacity * 0.55));
      ctx.fillStyle = g;
      shapePath(ctx, shape, cx, cy, R, t * 0.35);
      ctx.fill();
    }
    if (canFilter) ctx.filter = 'none';

    // 6. 윤곽선 — 지속력이 짧을수록 끊어지고 또렷한 선
    const gap = stroke.gap * S;
    ctx.setLineDash(gap < 0.6 ? [] : [stroke.dash * S, gap]);
    ctx.lineWidth = stroke.width * S;
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const R = Rc * 1.35 * (1 - 0.3 * k);
      ctx.strokeStyle = E.rgbCss(mixRgb(Q, [1, 1, 1], 0.35), (0.3 + 0.6 * opacity) * (1 - 0.25 * k));
      shapePath(ctx, shape, cx, cy, R, k * 0.12);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 7. 중심 하이라이트
    const hl = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rc * 0.45);
    hl.addColorStop(0, E.rgbCss(mixRgb(P, [1, 1, 1], 0.55), 0.35 + 0.4 * opacity));
    hl.addColorStop(1, E.rgbCss(P, 0));
    ctx.fillStyle = hl;
    ctx.fillRect(cx - Rc, cy - Rc, Rc * 2, Rc * 2);

    ctx.restore();
  }

  root.ScentRender = { render };
})(window);
