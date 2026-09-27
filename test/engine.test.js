// 실행: npm test  (node --test test/*.test.js)
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');

const sortedBy = (arr, k) => [...arr].sort((a, b) => a[k] - b[k]);

test('같은 벡터는 항상 같은 파라미터를 만든다', () => {
  const v = { f: [0.3, 0.2, 0.2, 0.2, 0.1], c: 0.4, l: 0.7, s: 0.6 };
  assert.deepStrictEqual(JSON.stringify(E.computeParams(v)), JSON.stringify(E.computeParams({ ...v })));
});

test('취향 벡터는 향수 벡터의 평균이고 계열 합은 1', () => {
  const m = E.meanVector([
    { f: [1, 0, 0, 0, 0], c: 0, l: 0.2, s: 0.4 },
    { f: [0, 0, 0, 1, 0], c: 1, l: 0.6, s: 0.8 },
  ]);
  assert.deepStrictEqual(m.f, [0.5, 0, 0, 0.5, 0]);
  assert.ok(Math.abs(m.c - 0.5) < 1e-12 && Math.abs(m.l - 0.4) < 1e-12 && Math.abs(m.s - 0.6) < 1e-12);
});

test('가장 높은 계열이 기본 톤을 결정한다', () => {
  E.FAMILIES.forEach((_, i) => {
    const f = [0.1, 0.1, 0.1, 0.1, 0.1]; f[i] = 0.6;
    const p = E.computeParams({ f, c: 0.5, l: 0.5, s: 0.5 });
    assert.strictEqual(p.dominant, i);
    assert.ok(p.weights[i] > 0.5, `${i}: 기본 톤 비중 ${p.weights[i]}`);
  });
});

test('형태·색상·확산 유사도는 계열 코사인 유사도에 대해 단조 증가', () => {
  const pairs = E.samplePairs(1500, 11);
  for (const k of ['shape', 'color', 'spread']) {
    const s = sortedBy(pairs, 'cos');
    for (let i = 1; i < s.length; i++) {
      assert.ok(s[i][k] >= s[i - 1][k] - 1e-9, `${k} 역전: cos ${s[i - 1].cos}→${s[i].cos}`);
    }
    assert.ok(E.spearman(pairs.map((p) => p.cos), pairs.map((p) => p[k])) > 0.9999);
  }
});

test('형태 유사도는 해석적으로 1 − √(1 − cos), 색상 유사도는 cos', () => {
  for (const p of E.samplePairs(200, 3)) {
    assert.ok(Math.abs(p.shape - (1 - Math.sqrt(1 - p.cos))) < 1e-9);
    assert.ok(Math.abs(p.color - p.cos) < 1e-9);
  }
});

test('농도·지속력·실라주 → 모션 매핑 방향', () => {
  const at = (o) => E.computeParams({ f: [0.2, 0.2, 0.2, 0.2, 0.2], c: 0.5, l: 0.5, s: 0.5, ...o });
  // 농도: 채도·불투명도·선 밀도 ↑, 흐림 ↓
  assert.ok(at({ c: 1 }).opacity > at({ c: 0 }).opacity);
  assert.ok(at({ c: 1 }).color.chromaScale > at({ c: 0 }).color.chromaScale);
  assert.ok(at({ c: 1 }).detail > at({ c: 0 }).detail);
  assert.ok(at({ c: 1 }).blur < at({ c: 0 }).blur);
  // 지속력: 느린 모션, 긴 잔상, 끊김 없음
  assert.ok(at({ l: 1 }).motion.speed < at({ l: 0 }).motion.speed);
  assert.ok(at({ l: 1 }).motion.trail > at({ l: 0 }).motion.trail);
  assert.ok(at({ l: 1 }).motion.gap === 0 && at({ l: 0 }).motion.gap > 0);
  // 실라주: 확산 반경·반복 횟수·움직임 폭 ↑
  assert.ok(at({ s: 1 }).spread.radius > at({ s: 0 }).spread.radius);
  assert.ok(at({ s: 1 }).motion.amplitude > at({ s: 0 }).motion.amplitude);
  at({ s: 1 }).motion.counts.forEach((n, i) => assert.ok(n > at({ s: 0 }).motion.counts[i]));
});

test('지배 계열의 모션 레이어가 가장 진하다', () => {
  const p = E.computeParams({ f: [0.1, 0.5, 0.2, 0.1, 0.1], c: 0.5, l: 0.5, s: 0.5 });
  assert.strictEqual(p.layerAlpha[1], 1);
  p.layerAlpha.forEach((a, i) => { if (i !== 1) assert.ok(a < 1); });
});

test('엔진에 난수 호출이 없다', () => {
  const src = require('fs').readFileSync(require.resolve('../js/engine.js'), 'utf8')
    + require('fs').readFileSync(require.resolve('../js/render.js'), 'utf8');
  assert.ok(!/Math\.random|crypto\.|Date\.now|performance\.now/.test(src));
});
