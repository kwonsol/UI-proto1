/*
 * 모션 렌더러 — 한 프레임 = draw(canvas, ScentEngine.computeParams(v), t).
 * 입력은 취향 벡터에서 나온 파라미터와 시간 t(초)뿐이다. 난수·시계 호출이 없어서
 * 같은 벡터·같은 t는 항상 같은 프레임을 만든다. 배치에 쓰이는 "무작위처럼 보이는" 값은
 * 모두 요소 번호의 정수 해시다.
 *
 * 계열별 모션 (레이어는 구성 비율에 따라 겹쳐 그림):
 *   우디       fiber  — 흐름장을 따라 휘날리는 외곽선 섬유 다발
 *   플로럴     shell  — 가는 선이 부채꼴로 퍼지는 조개껍질 꽃잎
 *   오리엔탈   smoke  — 소용돌이치며 풀리는 연기 리본과 페이즐리 컬
 *   시트러스   blob   — 서로 붙었다 떨어지는 과즙 방울(메타볼)
 *   그린/아쿠아 ripple — 겹치며 번지는 물결 파문
 */
(function (root) {
  'use strict';
  const E = root.ScentEngine;
  const TAU = Math.PI * 2;
  const GOLDEN = 2.399963229728653;

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const css = (rgb, a = 1) => E.rgbCss(rgb, a);

  /** 정수 해시 → [0,1). 결정론적이며 엔진·플랫폼과 무관. */
  function hash(i, salt) {
    let x = (Math.imul(i + 1, 374761393) + Math.imul(salt + 1, 668265263)) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }

  /** 요소 i의 존재도: 반복 횟수(실수)의 소수부로 마지막 요소를 서서히 나타나게 → 연속 변화. */
  const presence = (count, i) => clamp01(count - i);

  const buffers = new WeakMap();
  function bufferFor(canvas) {
    let b = buffers.get(canvas);
    if (!b) {
      b = { main: document.createElement('canvas'), field: document.createElement('canvas') };
      buffers.set(canvas, b);
    }
    if (b.main.width !== canvas.width || b.main.height !== canvas.height) {
      b.main.width = canvas.width;
      b.main.height = canvas.height;
    }
    return b;
  }

  function setDash(g, L) {
    const gap = L.gap * L.S;
    g.setLineDash(gap < 0.8 ? [] : [L.dash * L.S, gap]);
  }

  /** 확산 경계 ρ(θ) = R·r(θ) 안쪽이면 1, 바깥으로 갈수록 0 (실라주가 약하면 중심에 응축). */
  function envelope(L, x, y) {
    const dx = x - L.cx, dy = y - L.cy;
    const rho = L.R * E.shapeRadius(L.u, Math.atan2(dy, dx));
    return 1 - smooth(rho * 0.72, rho * 1.08, Math.hypot(dx, dy));
  }

  /** 경계 안쪽의 결정론적 위치 (반지름 비율 rr, 각 ang). */
  function inside(L, ang, rr) {
    const rho = L.R * E.shapeRadius(L.u, ang) * rr;
    return [L.cx + Math.cos(ang) * rho, L.cy + Math.sin(ang) * rho];
  }

  // ── 우디: 섬유 다발 ───────────────────────────────────────
  const FLOW_BASE = -1.05;
  function flowAngle(x, y, tau, S, amp) {
    const X = x / S, Y = y / S;
    return FLOW_BASE
      + amp * (0.75 * Math.sin(X * 3.1 + tau * 0.35)
             + 0.6 * Math.cos(Y * 2.6 - tau * 0.27)
             + 0.35 * Math.sin((X + Y) * 5.3 + tau * 0.5));
  }

  function drawFiber(g, L) {
    const n = Math.ceil(L.count);
    const step = L.S * 0.009;
    const steps = Math.round(6 + 44 * L.trail);        // 지속력 → 섬유 길이(잔상)
    const w = L.S * (0.0055 + 0.006 * L.detail);      // 농도 → 굵기
    const edge = L.S * 0.0026;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    setDash(g, L);
    for (let i = 0; i < n; i++) {
      const pres = presence(L.count, i);
      const life = (L.tau * 0.07 + hash(i, 3)) % 1;     // 흐름을 따라 흘러갔다 다시 태어나는 주기
      const fade = Math.sin(Math.PI * life);
      // 섬유는 다발(12가닥)로 모여 자란다
      const b = Math.floor(i / 12);
      const [bx, by] = inside(L, hash(b, 1) * TAU, Math.sqrt(hash(b, 2)));
      const sx = bx + (hash(i, 19) - 0.5) * L.S * 0.09, sy = by + (hash(i, 20) - 0.5) * L.S * 0.09;
      const drift = (life - 0.5) * L.S * 0.22 * L.amp;
      let x = sx + Math.cos(FLOW_BASE) * drift;
      let y = sy + Math.sin(FLOW_BASE) * drift;
      const a = pres * fade * envelope(L, x, y);
      if (a < 0.02) continue;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < steps; k++) {
        const th = flowAngle(x, y, L.tau, L.S, 0.6 + 0.4 * L.amp);
        x += Math.cos(th) * step;
        y += Math.sin(th) * step;
        g.lineTo(x, y);
      }
      g.globalAlpha = L.alpha * a;
      g.strokeStyle = css(L.pal.line);
      g.lineWidth = w + edge * 2;
      g.stroke();
      g.strokeStyle = css(L.pal.fill);
      g.lineWidth = w;
      g.stroke();
    }
    g.setLineDash([]);
  }

  // ── 플로럴: 조개껍질 꽃잎 부채 ─────────────────────────────
  function drawShell(g, L) {
    const n = Math.ceil(L.count);
    const K = 5;
    const lines = Math.round(10 + 18 * L.detail);        // 농도 → 부채 선 밀도
    const echoes = Math.round(L.trail * 3);              // 지속력 → 꽃잎 잔상
    const span = (TAU / K) * 0.94;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const pres = presence(L.count, i);
      const q = n > 1 ? Math.sqrt(i / Math.max(1, L.count - 1)) : 0;
      const ang = i * GOLDEN + 0.4;
      const [fx, fy] = i === 0 ? [L.cx, L.cy] : inside(L, ang, 0.62 * q);
      const Rf = L.R * (0.5 - 0.2 * q) * (0.7 + 0.3 * pres);
      const env = envelope(L, fx, fy);
      const dir = hash(i, 6) > 0.5 ? 1 : -1;
      for (let e = echoes; e >= 0; e--) {
        const te = L.tau - e * 0.45;
        const ea = e === 0 ? 1 : 0.4 * (1 - e / (echoes + 1));
        const rot = hash(i, 5) * TAU + dir * te * 0.12;
        const a = L.alpha * pres * env * ea;
        if (a < 0.01) continue;
        for (let k = 0; k < K; k++) {
          const a0 = rot + (k * TAU) / K;
          const breathe = 1 + 0.08 * L.amp * Math.sin(te * 1.25 + k * 1.7 + i);
          const bend = dir * (0.45 + 0.35 * Math.sin(te * 0.8 + k + i));
          const rim = [];
          const ghost = e > 0;                            // 잔상은 테두리만
          g.beginPath();
          for (let j = 0; j <= lines; j++) {
            const sj = j / lines;
            const al = a0 + (sj - 0.5) * span;
            const rr = Rf * breathe * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * sj), 0.45))
              * (1 + 0.025 * Math.sin(sj * 46 + te));   // 가리비 가장자리
            const ex = fx + Math.cos(al) * rr, ey = fy + Math.sin(al) * rr;
            const cx = fx + Math.cos(al + bend * (0.5 - Math.abs(sj - 0.5))) * rr * 0.55;
            const cy = fy + Math.sin(al + bend * (0.5 - Math.abs(sj - 0.5))) * rr * 0.55;
            if (!ghost) {
              g.moveTo(fx + Math.cos(a0) * Rf * 0.07, fy + Math.sin(a0) * Rf * 0.07);
              g.quadraticCurveTo(cx, cy, ex, ey);
            }
            rim.push(ex, ey);
          }
          g.strokeStyle = css(L.pal.line);
          if (!ghost) {
            setDash(g, L);
            g.globalAlpha = a * 0.75;
            g.lineWidth = L.S * (0.0012 + 0.001 * L.detail);
            g.stroke();
          }
          // 꽃잎 테두리
          g.beginPath();
          g.moveTo(fx, fy);
          for (let j = 0; j < rim.length; j += 2) g.lineTo(rim[j], rim[j + 1]);
          g.closePath();
          if (!ghost) {
            g.globalAlpha = a * 0.16;
            g.fillStyle = css(L.pal.fill);
            g.fill();
          }
          g.setLineDash([]);
          g.globalAlpha = a;
          g.lineWidth = L.S * (0.0025 + 0.0015 * L.detail);
          g.stroke();
        }
        if (e === 0) {                                     // 꽃 중심의 눈
          g.globalAlpha = L.alpha * pres * env;
          g.beginPath();
          g.arc(fx, fy, Rf * 0.08, 0, TAU);
          g.fillStyle = css(L.bg);
          g.fill();
          g.lineWidth = L.S * 0.003;
          g.stroke();
          g.beginPath();
          g.arc(fx, fy, Rf * 0.03, 0, TAU);
          g.stroke();
        }
      }
    }
  }

  // ── 오리엔탈: 연기 리본 ────────────────────────────────────
  function drawSmoke(g, L) {
    const n = Math.ceil(L.count);
    const strands = 3 + Math.round(5 * L.detail);        // 농도 → 리본 가닥 수
    const len = 0.4 + 0.6 * L.trail;                     // 지속력 → 리본 길이
    const steps = 70;
    const gapN = L.S * 0.0065;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    setDash(g, L);
    for (let i = 0; i < n; i++) {
      const pres = presence(L.count, i);
      const dir = hash(i, 11) > 0.5 ? 1 : -1;
      const th0 = hash(i, 10) * TAU + dir * L.tau * 0.09;
      const twist = dir * (1.4 + 1.6 * hash(i, 12));
      const pts = [];
      for (let k = 0; k <= steps; k++) {
        const s = 0.08 + 0.12 * hash(i, 21) + (k / steps) * len;
        const th = th0 + twist * s + 0.35 * L.amp * Math.sin(L.tau * 0.7 + s * 5 + i);
        const rr = L.R * E.shapeRadius(L.u, th) * s * 0.95;
        pts.push([L.cx + Math.cos(th) * rr, L.cy + Math.sin(th) * rr]);
      }
      // 끝의 페이즐리 컬
      const [ex, ey] = pts[pts.length - 1];
      const [px, py] = pts[pts.length - 2];
      let ca = Math.atan2(ey - py, ex - px);
      const cr = L.S * (0.03 + 0.03 * hash(i, 13)) * (0.8 + 0.4 * Math.sin(L.tau * 0.6 + i));
      let x = ex, y = ey;
      for (let k = 1; k <= 30; k++) {
        const q = k / 30;
        ca += dir * 0.26;
        x += Math.cos(ca) * cr * 0.16 * (1 - q * 0.7);
        y += Math.sin(ca) * cr * 0.16 * (1 - q * 0.7);
        pts.push([x, y]);
      }
      for (let sIdx = 0; sIdx < strands; sIdx++) {
        const off = (sIdx - (strands - 1) / 2) * gapN;
        g.beginPath();
        for (let k = 0; k < pts.length; k++) {
          const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
          const nx = -(b[1] - a[1]), ny = b[0] - a[0];
          const nl = Math.hypot(nx, ny) || 1;
          const taper = Math.min(1, k / 12);
          const X = pts[k][0] + (nx / nl) * off * taper, Y = pts[k][1] + (ny / nl) * off * taper;
          if (k === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
        }
        const mid = sIdx === Math.floor(strands / 2);
        g.globalAlpha = L.alpha * pres * (mid ? 1 : 0.7);
        g.strokeStyle = css(mid ? L.pal.accent : L.pal.line);
        g.lineWidth = L.S * (mid ? 0.0028 : 0.0016);
        g.stroke();
      }
    }
    g.setLineDash([]);
  }

  // ── 시트러스: 과즙 방울 (메타볼) ───────────────────────────
  function drawBlob(g, L, fieldCanvas) {
    const scale = 3;
    const gw = Math.max(40, Math.round(L.W / scale)), gh = Math.max(40, Math.round(L.H / scale));
    if (fieldCanvas.width !== gw || fieldCanvas.height !== gh) { fieldCanvas.width = gw; fieldCanvas.height = gh; }
    const fctx = fieldCanvas.getContext('2d');
    const img = fctx.createImageData(gw, gh);
    const data = img.data;

    const n = Math.ceil(L.count);
    const ghosts = Math.round(5 * L.trail);            // 지속력 → 방울이 끌고 가는 잔상
    const balls = [];
    const pos = (i, t) => {
      const ang = hash(i, 7) * TAU;
      const [bx, by] = inside(L, ang, 0.1 + 0.6 * Math.sqrt(hash(i, 8)));
      const r = L.S * 0.07 * L.amp;
      return [
        (bx + Math.sin(t * (0.5 + 0.5 * hash(i, 14)) + hash(i, 15) * TAU) * r) / scale,
        (by + Math.cos(t * (0.4 + 0.5 * hash(i, 16)) + hash(i, 17) * TAU) * r) / scale,
      ];
    };
    // 3개 중 1개는 앞 방울에 목으로 매달린 작은 위성 방울
    const radius = (i, pres) => L.S * (i % 3 === 2 ? 0.04 : 0.07 + 0.08 * hash(i, 9)) * (0.4 + 0.6 * pres) / scale;
    const place = (i, t) => {
      if (i % 3 !== 2) return pos(i, t);
      const [px, py] = pos(i - 1, t);
      const ang = hash(i, 22) * TAU + 0.4 * Math.sin(t * 0.8 + i);
      const d = radius(i - 1, 1) * 1.75 + radius(i, 1);
      return [px + Math.cos(ang) * d, py + Math.sin(ang) * d];
    };
    for (let i = 0; i < n; i++) {
      const pres = presence(L.count, i);
      const rad = radius(i, pres);
      const [x, y] = place(i, L.tau);
      balls.push(x, y, rad * rad);
      for (let j = 1; j <= ghosts; j++) {
        const [gx, gy] = place(i, L.tau - j * 0.3);
        const gr = rad * (1 - j / (ghosts + 1)) * 0.85;
        balls.push(gx, gy, gr * gr);
      }
    }
    // 컴팩트 커널 (1 − d²/4r²)² — 가까운 방울끼리만 목(neck)으로 이어진다
    const th = 0.5 + 0.18 * (1 - L.trail);             // 지속력이 짧으면 방울이 잘 끊어짐
    const fill = L.pal.fill.map((v) => v * 255), edge = L.pal.line.map((v) => v * 255), mid = L.pal.accent.map((v) => v * 255);
    const A = 255 * L.alpha;
    const m = balls.length;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        let F = 0;
        for (let k = 0; k < m; k += 3) {
          const dx = x - balls[k], dy = y - balls[k + 1];
          const q = 1 - (dx * dx + dy * dy) / (4 * balls[k + 2]);
          if (q > 0) F += q * q;
        }
        if (F < th - 0.06) continue;
        const o = (y * gw + x) * 4;
        const t1 = smooth(th + 0.03, th + 0.2, F), t2 = smooth(th + 0.14, th + 0.45, F);
        for (let c = 0; c < 3; c++) {
          const band = edge[c] + (mid[c] - edge[c]) * t1;
          data[o + c] = band + (fill[c] - band) * t2;
        }
        data[o + 3] = A * smooth(th - 0.06, th, F);
      }
    }
    fctx.putImageData(img, 0, 0);
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(fieldCanvas, 0, 0, L.W, L.H);
  }

  // ── 그린/아쿠아틱: 물결 파문 ───────────────────────────────
  function drawRipple(g, L) {
    const n = Math.ceil(L.count);
    const rings = 2 + Math.round(8 * L.trail);         // 지속력 → 남아 있는 파문 수
    const spacing = L.S * (0.03 + 0.025 * L.amp);
    const reach = rings * spacing;
    g.lineCap = 'round';
    setDash(g, L);
    for (let i = 0; i < n; i++) {
      const pres = presence(L.count, i);
      const q = Math.sqrt(i / Math.max(1, L.count - 1));
      const [ex, ey] = i === 0 ? [L.cx, L.cy] : inside(L, i * GOLDEN + 1.1, 0.7 * q);
      const env = envelope(L, ex, ey);
      const base = ((L.tau * L.S * 0.045 + hash(i, 18) * spacing) % spacing + spacing) % spacing;
      for (let k = 0; k < rings; k++) {
        const r = base + k * spacing;
        const a = L.alpha * pres * env * Math.pow(1 - r / (reach + spacing), 1.3) * smooth(0, spacing, r);
        if (a < 0.01) continue;
        g.beginPath();
        for (let j = 0; j <= 72; j++) {
          const t = (j / 72) * TAU;
          const rr = r * (1 + 0.05 * Math.sin(t * 4 + L.tau + i) + 0.03 * Math.sin(t * 7 - L.tau * 1.3));
          const X = ex + Math.cos(t) * rr, Y = ey + Math.sin(t) * rr;
          if (j === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
        }
        g.globalAlpha = a;
        g.strokeStyle = css(k % 3 === 0 ? L.pal.accent : L.pal.line);
        g.lineWidth = L.S * (0.0018 + 0.0022 * L.detail);
        g.stroke();
      }
    }
    g.setLineDash([]);
  }

  const DRAWERS = { fiber: drawFiber, shell: drawShell, smoke: drawSmoke, blob: drawBlob, ripple: drawRipple };

  /** 한 프레임 그리기. t는 초 단위 시간 — 호출자가 넘겨준다. */
  function draw(canvas, params, t = 0) {
    const W = canvas.width, H = canvas.height, S = Math.min(W, H);
    const buf = bufferFor(canvas);
    const g = buf.main.getContext('2d');
    const { motion, color } = params;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.setLineDash([]);
    g.fillStyle = css(color.background);
    g.fillRect(0, 0, W, H);

    const common = {
      W, H, S, cx: W / 2, cy: H / 2,
      R: params.spread.radius * S,
      u: params.u,
      tau: t * motion.speed,
      trail: motion.trail,
      gap: motion.gap,
      dash: motion.dash,
      amp: motion.amplitude,
      detail: params.detail,
      bg: color.background,
    };
    // 옅은 계열부터 그리고 지배 계열을 맨 위에
    const order = params.layerAlpha.map((a, i) => [a, i]).filter(([a]) => a > 0.03).sort((p, q) => p[0] - q[0]);
    for (const [a, i] of order) {
      const fam = E.FAMILIES[i];
      g.save();
      DRAWERS[fam.motion.kind](g, {
        ...common,
        alpha: a * params.opacity,
        count: motion.counts[i],
        pal: color.palettes[i],
      }, buf.field);
      g.restore();
    }

    const ctx = canvas.getContext('2d');
    const blur = params.blur * S;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = css(color.background);
    ctx.fillRect(0, 0, W, H);
    if (blur > 0.3 && typeof ctx.filter === 'string') ctx.filter = `blur(${blur.toFixed(2)}px)`;
    ctx.drawImage(buf.main, 0, 0);
    ctx.restore();
  }

  root.ScentRender = { draw, render: (canvas, params) => draw(canvas, params, 0) };
})(window);
