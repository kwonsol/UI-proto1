/*
 * ScentEngine — 향 취향 벡터 → 시각 파라미터 결정론적 매핑.
 *
 * 입력은 오직 취향 벡터 v = { f:[floral, woody, oriental, citrus, green], c, l, s } 뿐이다.
 *   f : 계열 비중 (합 = 1)
 *   c : 농도 (오 드 코롱 0 → 퍼퓸 1)
 *   l : 지속력 (0 → 1)
 *   s : 실라주 (0 → 1)
 * 이 파일에는 난수가 없다. 모든 출력은 v의 순수 함수다.
 * 브라우저에서는 window.ScentEngine, Node에서는 module.exports 로 노출된다.
 */
(function (root) {
  'use strict';

  // ── 계열 정의 ─────────────────────────────────────────────
  // colors: [주 톤, 보조 톤] — 스와치·색 구성 지표용.
  // palette: 모션 그래픽 2톤 팔레트 (바탕 bg, 채움 fill, 선 line, 강조 accent).
  // motion: 모션 종류와 반복 횟수 = base + range·실라주.
  // k: 확산 경계 r(θ)의 고조파 주파수(계열마다 서로 달라야 직교).
  const FAMILIES = [
    { key: 'floral', name: '플로럴', colors: ['#F7B5CC', '#BFA8EE'], k: 5, phase: 0.0,
      palette: { bg: '#B7A1E4', fill: '#F9C6D8', line: '#FFF3F7', accent: '#F59BC0' },
      motion: { kind: 'shell', label: '꽃잎 부채', base: 1, range: 6 } },
    { key: 'woody', name: '우디', colors: ['#7E4A2A', '#8F8752'], k: 3, phase: 0.9,
      palette: { bg: '#8C8350', fill: '#EEDFC0', line: '#2E1C10', accent: '#B07A4A' },
      motion: { kind: 'fiber', label: '나뭇결 섬유', base: 48, range: 216 } },
    { key: 'oriental', name: '오리엔탈', colors: ['#8E1A3E', '#B98B2C'], k: 2, phase: 1.7,
      palette: { bg: '#5C0F25', fill: '#9E2346', line: '#E2B24C', accent: '#F6DC96' },
      motion: { kind: 'smoke', label: '연기 리본', base: 3, range: 9 } },
    { key: 'citrus', name: '시트러스', colors: ['#F6DC3A', '#A6DB35'], k: 7, phase: 2.6,
      palette: { bg: '#ECEAE2', fill: '#D9F33F', line: '#F2A900', accent: '#F4E23A' },
      motion: { kind: 'blob', label: '과즙 방울', base: 4, range: 12 } },
    { key: 'green', name: '그린/아쿠아틱', colors: ['#8EE6C6', '#4A9EDC'], k: 4, phase: 3.4,
      palette: { bg: '#1C78AE', fill: '#57C9B8', line: '#A9F4DA', accent: '#E3FFF4' },
      motion: { kind: 'ripple', label: '물결 파문', base: 1, range: 5 } },
  ];

  const CONCENTRATIONS = [
    { value: 0,     label: '오 드 코롱 (EdC)' },
    { value: 1 / 3, label: '오 드 뚜왈렛 (EdT)' },
    { value: 2 / 3, label: '오 드 퍼퓸 (EdP)' },
    { value: 1,     label: '퍼퓸 (Parfum)' },
  ];

  // ── 고정 상수 (매핑 규칙) ──────────────────────────────────
  const SHAPE_AMPLITUDE = 0.26; // r(θ) = 1 + A·Σ uᵢ cos(kᵢθ + φᵢ)
  // 색 구성 비율 pᵢ = uᵢ² (Σ = 1). 제곱으로 지배 계열이 기본 톤을 차지하면서도 연속적이고,
  // 두 구성 비율의 바타차리야 계수 Σ√(pᵢqᵢ) = Σ uᵢvᵢ = 코사인 유사도가 된다.
  const SAMPLES = 360;          // 형태 샘플 수

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ── 벡터 연산 ─────────────────────────────────────────────
  function normalizeFamilies(f) {
    const g = f.map((x) => Math.max(0, +x || 0));
    const sum = g.reduce((a, b) => a + b, 0);
    if (sum <= 0) return g.map(() => 1 / g.length);
    return g.map((x) => x / sum);
  }

  function sanitize(v) {
    return {
      f: normalizeFamilies(v.f),
      c: clamp01(+v.c || 0),
      l: clamp01(+v.l || 0),
      s: clamp01(+v.s || 0),
    };
  }

  /** 여러 향수 벡터의 산술 평균 = 사용자 취향 벡터. 계열 비중은 평균해도 합이 1로 유지된다. */
  function meanVector(list) {
    if (!list.length) return sanitize({ f: [1, 1, 1, 1, 1], c: 0.5, l: 0.5, s: 0.5 });
    const n = list.length;
    const acc = { f: [0, 0, 0, 0, 0], c: 0, l: 0, s: 0 };
    for (const raw of list) {
      const v = sanitize(raw);
      v.f.forEach((x, i) => (acc.f[i] += x / n));
      acc.c += v.c / n;
      acc.l += v.l / n;
      acc.s += v.s / n;
    }
    return sanitize(acc);
  }

  function norm(a) { return Math.sqrt(a.reduce((s, x) => s + x * x, 0)); }

  function cosine(a, b) {
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return 0;
    let d = 0;
    for (let i = 0; i < a.length; i++) d += a[i] * b[i];
    return clamp01(d / (na * nb));
  }

  /** 계열 방향 단위벡터 u = f / ‖f‖. 형태와 색은 방향(u)에만 의존 → 코사인 유사도와 정렬. */
  function unitDirection(f) {
    const n = norm(f) || 1;
    return f.map((x) => x / n);
  }

  // ── 색 공간 (OKLab) ───────────────────────────────────────
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const fromLin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  function rgbToOklab([r, g, b]) {
    r = toLin(r); g = toLin(g); b = toLin(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
  }

  function oklabToRgb([L, a, b]) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ].map((c) => clamp01(fromLin(c)));
  }

  function rgbCss(rgb, alpha) {
    const [r, g, b] = rgb.map((x) => Math.round(x * 255));
    return alpha === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${+alpha.toFixed(4)})`;
  }

  const ANCHORS = FAMILIES.map((fam) => fam.colors.map((hex) => rgbToOklab(hexToRgb(hex))));

  /** 팔레트 구성 비율 pᵢ = uᵢ². 입자·잔상의 계열 색 분포이자 기본 톤 혼합 가중치. */
  function colorWeights(u) {
    return u.map((x) => x * x);
  }

  /** 누적 구성 비율에서 t∈[0,1)이 속한 계열 인덱스. */
  function pickFamily(weights, t) {
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (t < acc) return i;
    }
    return weights.length - 1;
  }

  /** 계열 i의 앵커 색을 주/보조 톤 사이 t 지점에서 농도 적용 후 반환. */
  function familyColor(i, t, c) {
    const a = ANCHORS[i][0], b = ANCHORS[i][1];
    return oklabToRgb(applyConcentration([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)], c));
  }

  function blendLab(weights, which) {
    const out = [0, 0, 0];
    weights.forEach((w, i) => {
      for (let j = 0; j < 3; j++) out[j] += w * ANCHORS[i][which][j];
    });
    return out;
  }

  /** 농도 → 채도/명도 조정 (OKLCh 상에서 채도 배율, 낮은 농도는 밝고 옅게). */
  function applyConcentration(lab, c) {
    const [L, a, b] = lab;
    const chroma = 0.5 + 0.65 * c;          // 0.5 ~ 1.15
    const L2 = L + (1 - c) * 0.14 * (1 - L); // 옅어짐
    return [L2, a * chroma, b * chroma];
  }

  // ── 형태 ──────────────────────────────────────────────────
  /** 형태 반경 함수 r(θ). 서로 다른 주파수의 코사인은 직교하므로 ‖r_a − r_b‖ = A·‖u_a − u_b‖/√2. */
  function shapeRadius(u, theta) {
    let r = 1;
    for (let i = 0; i < FAMILIES.length; i++) {
      r += SHAPE_AMPLITUDE * u[i] * Math.cos(FAMILIES[i].k * theta + FAMILIES[i].phase);
    }
    return r;
  }

  function shapeSamples(u, n = SAMPLES) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = shapeRadius(u, (i / n) * Math.PI * 2);
    return out;
  }

  // ── 확산 (실라주) ─────────────────────────────────────────
  // 캔버스 한 변을 1로 두는 정규화 좌표.
  const spreadRadius = (s) => 0.22 + 0.58 * s;  // 확산 경계 반경 (캔버스 짧은 변 대비)

  // ── 파라미터 계산 ─────────────────────────────────────────
  function computeParams(input) {
    const v = sanitize(input);
    const { f, c, l, s } = v;
    const u = unitDirection(f);
    const weights = colorWeights(u);

    let dominant = 0;
    f.forEach((x, i) => { if (x > f[dominant]) dominant = i; });

    const baseLab = [blendLab(weights, 0), blendLab(weights, 1)];
    const primaryLab = applyConcentration(baseLab[0], c);
    const secondaryLab = applyConcentration(baseLab[1], c);

    // 레이어 가중치: 지배 계열 = 1, 나머지는 구성 비율에 따라 옅게.
    const wMax = Math.max(...weights);
    const layerAlpha = weights.map((w) => Math.pow(w / wMax, 0.7));
    const tone = (hex) => oklabToRgb(applyConcentration(rgbToOklab(hexToRgb(hex)), c));
    const palettes = FAMILIES.map((fam) => ({
      bg: tone(fam.palette.bg), fill: tone(fam.palette.fill),
      line: tone(fam.palette.line), accent: tone(fam.palette.accent),
    }));
    const bgLab = [0, 0, 0];
    FAMILIES.forEach((fam, i) => {
      const lab = applyConcentration(rgbToOklab(hexToRgb(fam.palette.bg)), c);
      for (let j = 0; j < 3; j++) bgLab[j] += weights[i] * lab[j];
    });

    return {
      vector: v,
      u,
      weights,
      layerAlpha,
      dominant,
      dominantName: FAMILIES[dominant].name,
      color: {
        baseLab,
        primaryLab,
        secondaryLab,
        primary: oklabToRgb(primaryLab),
        secondary: oklabToRgb(secondaryLab),
        chromaScale: 0.5 + 0.65 * c,
        background: oklabToRgb(bgLab),
        palettes,
      },
      opacity: 0.35 + 0.65 * c,          // 레이어 불투명도
      blur: (1 - c) * 0.007,             // 흐림 (캔버스 비율)
      detail: c,                          // 선 밀도·굵기
      motion: {
        speed: 1.6 - 1.3 * l,             // 모션 배속 — 지속력이 길수록 느리고 오래 머무름
        trail: l,                         // 잔상 길이 0–1
        gap: 0.03 * Math.pow(Math.max(0, (0.6 - l) / 0.6), 1.5), // 선 끊김 간격 — 지속력 0.6 이상이면 이어진 선
        dash: 0.01 + 0.05 * l,            // 끊긴 선분 길이
        amplitude: 0.5 + 0.8 * s,         // 움직임 폭
        counts: FAMILIES.map((fam) => fam.motion.base + fam.motion.range * s), // 반복 횟수(실수)
      },
      spread: {
        radius: spreadRadius(s),          // 확산 경계 반경
      },
      shape: shapeSamples(u),
    };
  }

  // ── 그래픽 유사도 지표 ────────────────────────────────────
  /** 형태 유사도: 샘플링된 r(θ) 간 RMS 거리로 계산. 해석적으로 1 − √(1 − cos). */
  function shapeSimilarity(pa, pb) {
    let d = 0;
    for (let i = 0; i < pa.shape.length; i++) d += (pa.shape[i] - pb.shape[i]) ** 2;
    const rms = Math.sqrt(d / pa.shape.length);
    return clamp01(1 - rms / SHAPE_AMPLITUDE);
  }

  /**
   * 색상 유사도: 그래픽에 쓰인 계열 색 구성 비율(pᵢ = uᵢ²)의 바타차리야 계수 Σ√(pᵢ·qᵢ).
   * 색 히스토그램 유사도의 표준 척도이며, 이 매핑에서는 정확히 코사인 유사도와 같다.
   */
  function colorSimilarity(pa, pb) {
    let bc = 0;
    for (let i = 0; i < pa.weights.length; i++) bc += Math.sqrt(pa.weights[i] * pb.weights[i]);
    return clamp01(bc);
  }

  /** 기본 톤(혼합 주 톤) 사이의 OKLab 거리 — 참고용 지표. */
  function baseToneDistance(pa, pb) {
    const a = pa.color.baseLab[0], b = pb.color.baseLab[0];
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  /**
   * 확산 범위 유사도: 할로 경계 ρ(θ) = R(s)·r(θ) 사이 RMS 거리를 (R(1)·A + 실라주 반경 범위)로 정규화.
   * 실라주가 같으면 RMS = R·A·√(1 − cos) 이므로 코사인 유사도에 대해 엄밀히 단조.
   */
  const SPREAD_NORM = spreadRadius(1) * SHAPE_AMPLITUDE + (spreadRadius(1) - spreadRadius(0));
  function spreadSimilarity(pa, pb) {
    const Ra = pa.spread.radius, Rb = pb.spread.radius;
    let d = 0;
    for (let i = 0; i < pa.shape.length; i++) d += (Ra * pa.shape[i] - Rb * pb.shape[i]) ** 2;
    return clamp01(1 - Math.sqrt(d / pa.shape.length) / SPREAD_NORM);
  }

  function compare(va, vb) {
    const pa = computeParams(va), pb = computeParams(vb);
    const cos = cosine(pa.vector.f, pb.vector.f);
    return {
      cos,
      shape: shapeSimilarity(pa, pb),
      color: colorSimilarity(pa, pb),
      toneDelta: baseToneDistance(pa, pb),
      spread: spreadSimilarity(pa, pb),
      intensity: 1 - Math.hypot(pa.vector.c - pb.vector.c, pa.vector.l - pb.vector.l, pa.vector.s - pb.vector.s) / Math.sqrt(3),
    };
  }

  // ── 검증용 결정론적 표본 (그래픽 생성에는 쓰이지 않음) ────
  function lcg(seed) {
    let x = seed >>> 0;
    return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  }

  function samplePairs(n = 400, seed = 7) {
    const rnd = lcg(seed);
    const fam = () => {
      // 디리클레(α<1) 근사: 한두 계열이 두드러지는 현실적 분포
      const g = FAMILIES.map(() => Math.pow(rnd(), 2.2));
      return normalizeFamilies(g);
    };
    const pairs = [];
    for (let i = 0; i < n; i++) {
      const base = { c: 0.5, l: 0.5, s: 0.5 };
      const a = { ...base, f: fam() }, b = { ...base, f: fam() };
      pairs.push({ a, b, ...compare(a, b) });
    }
    return pairs;
  }

  function spearman(xs, ys) {
    const rank = (arr) => {
      const idx = arr.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
      const r = new Array(arr.length);
      idx.forEach(([, i], k) => (r[i] = k));
      return r;
    };
    const rx = rank(xs), ry = rank(ys), n = xs.length;
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2;
    return 1 - (6 * d2) / (n * (n * n - 1));
  }

  function concentrationLabel(c) {
    let best = CONCENTRATIONS[0];
    for (const x of CONCENTRATIONS) if (Math.abs(x.value - c) < Math.abs(best.value - c)) best = x;
    return best.label;
  }

  const api = {
    FAMILIES, CONCENTRATIONS, SHAPE_AMPLITUDE, spreadRadius,
    normalizeFamilies, sanitize, meanVector, cosine, unitDirection,
    computeParams, shapeRadius, compare, shapeSimilarity, colorSimilarity, spreadSimilarity,
    samplePairs, spearman, pickFamily, familyColor, concentrationLabel, rgbCss, oklabToRgb,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScentEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
