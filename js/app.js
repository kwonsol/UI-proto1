/* UI 상태 관리 — 그래픽은 ScentEngine.meanVector(향수 목록) 결과만으로 그려진다. */
(function () {
  'use strict';
  const E = window.ScentEngine;
  const R = window.ScentRender;
  const F = E.FAMILIES;
  const HERO_SIZE = [560, 700];   // 고정 내부 해상도 → 화면 크기와 무관하게 같은 픽셀
  const CARD_SIZE = [360, 450];
  const IS_ARTIFACT = !!window.__SCENT_ARTIFACT__; // 게시판(아티팩트) 빌드: 다운로드·주소 공유 불가
  const MAX_PROFILES = 4;
  const PROFILE_COLORS = ['#6a4c93', '#c0703a', '#2f8a7a', '#b0417a'];

  // 예시 향수 (가상의 제품, 값은 설명용)
  const PRESETS = [
    { name: '화이트 로즈 부케',   f: [0.70, 0.08, 0.05, 0.05, 0.12], c: 0.67, l: 0.60, s: 0.55 },
    { name: '아이리스 머스크',     f: [0.55, 0.25, 0.15, 0.00, 0.05], c: 0.67, l: 0.65, s: 0.35 },
    { name: '샌달우드 & 시더',     f: [0.05, 0.70, 0.15, 0.02, 0.08], c: 0.67, l: 0.80, s: 0.50 },
    { name: '앰버 바닐라 누아',    f: [0.10, 0.15, 0.65, 0.02, 0.08], c: 1.00, l: 0.90, s: 0.75 },
    { name: '오우드 로즈',         f: [0.35, 0.30, 0.35, 0.00, 0.00], c: 1.00, l: 0.95, s: 0.85 },
    { name: '베르가못 네롤리',     f: [0.10, 0.05, 0.00, 0.70, 0.15], c: 0.00, l: 0.20, s: 0.30 },
    { name: '유자 & 진저',         f: [0.05, 0.10, 0.10, 0.65, 0.10], c: 0.33, l: 0.30, s: 0.45 },
    { name: '마린 브리즈',         f: [0.05, 0.05, 0.00, 0.20, 0.70], c: 0.33, l: 0.35, s: 0.45 },
    { name: '피그 리프',           f: [0.10, 0.20, 0.00, 0.10, 0.60], c: 0.33, l: 0.45, s: 0.40 },
    { name: '베티버 스모크',       f: [0.00, 0.60, 0.25, 0.05, 0.10], c: 0.67, l: 0.85, s: 0.60 },
  ];

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const preset = (name) => clone(PRESETS.find((p) => p.name === name));

  function defaultState() {
    return {
      active: 0,
      profiles: [
        { name: '사용자 A', sel: 0, perfumes: [preset('화이트 로즈 부케'), preset('아이리스 머스크')] },
        { name: '사용자 B', sel: 0, perfumes: [preset('화이트 로즈 부케'), preset('오우드 로즈')] },
        { name: '사용자 C', sel: 0, perfumes: [preset('베르가못 네롤리'), preset('마린 브리즈')] },
      ],
    };
  }

  // ── URL 해시에 상태 저장 (공유 시 같은 벡터 → 같은 그래픽) ──
  function encodeState(s) {
    const bytes = new TextEncoder().encode(JSON.stringify(s));
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeState(str) {
    try {
      const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
      const s = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      if (!s || !Array.isArray(s.profiles) || !s.profiles.length) return null;
      s.profiles = s.profiles.slice(0, MAX_PROFILES).map((p, i) => ({
        name: String(p.name || `사용자 ${i + 1}`).slice(0, 24),
        sel: 0,
        perfumes: (Array.isArray(p.perfumes) && p.perfumes.length ? p.perfumes : [preset('화이트 로즈 부케')])
          .slice(0, 20)
          .map((q) => ({ name: String(q.name || '향수').slice(0, 32), ...E.sanitize(q) })),
      }));
      s.active = Math.min(Math.max(0, s.active | 0), s.profiles.length - 1);
      return s;
    } catch (e) {
      return null;
    }
  }
  const round3 = (x) => Math.round(x * 1000) / 1000;
  function compactState() {
    return {
      active: state.active,
      profiles: state.profiles.map((p) => ({
        name: p.name,
        perfumes: p.perfumes.map((q) => ({ name: q.name, f: q.f.map(round3), c: round3(q.c), l: round3(q.l), s: round3(q.s) })),
      })),
    };
  }
  let hashTimer = 0;
  function saveHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      try { history.replaceState(null, '', '#' + encodeState(compactState())); } catch (e) { /* ignore */ }
    }, 250);
  }

  let state = decodeState(location.hash.slice(1)) || defaultState();

  // ── DOM ──
  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'style') n.style.cssText = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) n.append(c);
    return n;
  };
  const fmt = (x, d = 2) => x.toFixed(d);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const shortConc = (c) => E.concentrationLabel(c).split(' (')[1].replace(')', '');

  const profile = () => state.profiles[state.active];
  const perfume = () => profile().perfumes[profile().sel];
  const tasteOf = (p) => E.meanVector(p.perfumes);

  let view = 'single';
  let paramsCache = [];            // 프로필별 computeParams(취향 벡터)
  const refreshParams = () => { paramsCache = state.profiles.map((p) => E.computeParams(tasteOf(p))); };

  // ── 슬라이더 구성 ──
  const famInputs = [], famOutputs = [];
  F.forEach((fam, i) => {
    const input = el('input', { id: `s-f${i}`, type: 'range', min: 0, max: 1, step: 0.01 });
    input.style.setProperty('--fill', fam.colors[0]);
    const out = el('output', { for: `s-f${i}` });
    $('family-sliders').append(el('div', { class: 'slider-row' }, [
      el('label', { for: `s-f${i}` }, [el('span', { class: 'swatch', style: `background:${fam.colors[0]}` }), fam.name]),
      input, out,
    ]));
    input.addEventListener('input', () => setFamily(i, +input.value));
    famInputs.push(input); famOutputs.push(out);
  });

  function setTrackFill(input) {
    const min = +input.min, max = +input.max;
    input.style.setProperty('--pct', `${((+input.value - min) / (max - min)) * 100}%`);
  }

  /** 한 계열을 x로 바꾸고 나머지를 기존 비율대로 재분배해 합 = 1 유지. */
  function setFamily(i, x) {
    const f = perfume().f.slice();
    const rest = 1 - x;
    const othersSum = f.reduce((a, v, j) => (j === i ? a : a + v), 0);
    for (let j = 0; j < f.length; j++) {
      if (j === i) continue;
      f[j] = othersSum > 1e-9 ? (f[j] / othersSum) * rest : rest / (f.length - 1);
    }
    f[i] = x;
    perfume().f = E.normalizeFamilies(f);
    update({ sliders: 'except-family-' + i });
  }

  ['c', 'l', 's'].forEach((k) => {
    $(`s-${k}`).addEventListener('input', (e) => {
      perfume()[k] = +e.target.value;
      update({ sliders: 'except-' + k });
    });
  });

  $('profile-name').addEventListener('input', (e) => { profile().name = e.target.value; update({ sliders: 'none' }); });
  $('perfume-name').addEventListener('input', (e) => { perfume().name = e.target.value; update({ sliders: 'none' }); });

  PRESETS.forEach((p) => $('preset-select').append(el('option', { value: p.name, text: p.name })));
  $('preset-select').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const p = profile();
    if (p.perfumes.length >= 20) return;
    p.perfumes.push(preset(e.target.value));
    p.sel = p.perfumes.length - 1;
    e.target.value = '';
    update();
  });
  $('add-blank').addEventListener('click', () => {
    const p = profile();
    if (p.perfumes.length >= 20) return;
    p.perfumes.push({ name: `새 향수 ${p.perfumes.length + 1}`, f: [0.2, 0.2, 0.2, 0.2, 0.2], c: 0.5, l: 0.5, s: 0.5 });
    p.sel = p.perfumes.length - 1;
    update();
  });
  function addProfile() {
    if (state.profiles.length >= MAX_PROFILES) return;
    const letter = String.fromCharCode(65 + state.profiles.length);
    state.profiles.push({ name: `사용자 ${letter}`, sel: 0, perfumes: [preset(PRESETS[(state.profiles.length * 3) % PRESETS.length].name)] });
    state.active = state.profiles.length - 1;
    update();
  }
  $('reset').addEventListener('click', () => { state = defaultState(); update(); });
  if (IS_ARTIFACT) $('copy-link').remove();
  else {
    $('copy-link').addEventListener('click', async (e) => {
      const url = location.href.split('#')[0] + '#' + encodeState(compactState());
      try { await navigator.clipboard.writeText(url); e.target.textContent = '복사됨'; }
      catch (err) { e.target.textContent = '복사 실패'; }
      setTimeout(() => (e.target.textContent = '링크 복사'), 1400);
    });
  }

  document.querySelectorAll('.segmented button').forEach((b) => {
    b.addEventListener('click', () => setView(b.dataset.view));
  });
  function setView(v) {
    view = v;
    $('app').dataset.view = v;
    document.querySelectorAll('.segmented button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    if (v === 'verify' && !verifyDrawn) { renderVerify(); verifyDrawn = true; }
    update({ sliders: 'none' });
  }
  let verifyDrawn = false;

  // ── 시간 (재생/정지) ──
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = !reduceMotion;
  let t = 0;               // 초. 프레임 = draw(벡터, t)
  let lastNow = 0;
  function syncPlay() {
    $('play').textContent = playing ? '❚❚' : '▶';
    $('play').setAttribute('aria-label', playing ? '일시정지' : '재생');
  }
  $('play').addEventListener('click', () => { playing = !playing; lastNow = 0; syncPlay(); drawFrame(); });
  $('restart').addEventListener('click', () => { t = 0; drawFrame(); });

  // ── 렌더 ──
  function renderTabs() {
    const box = $('profile-tabs');
    box.replaceChildren();
    state.profiles.forEach((p, idx) => {
      box.append(el('button', {
        class: 'profile-tab', type: 'button', role: 'tab', 'aria-selected': String(idx === state.active),
        onclick: () => { state.active = idx; update(); },
      }, [el('span', { class: 'swatch', style: `background:${PROFILE_COLORS[idx]}` }), el('span', { class: 'nm', text: p.name || '(이름 없음)' })]));
    });
    if (state.profiles.length < MAX_PROFILES) {
      box.append(el('button', { class: 'profile-tab add', type: 'button', text: '+ 비교 벡터', onclick: addProfile }));
    }
  }

  function renderPerfumeList() {
    const p = profile();
    const list = $('perfume-list');
    list.replaceChildren();
    p.perfumes.forEach((q, idx) => {
      const pp = E.computeParams(q);
      const select = () => { p.sel = idx; update(); };
      const item = el('li', {
        class: 'perfume-item' + (idx === p.sel ? ' selected' : ''),
        tabindex: 0, role: 'button', 'aria-pressed': String(idx === p.sel),
        onclick: select,
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } },
      }, [
        el('span', { class: 'swatch', style: `background:${F[pp.dominant].colors[0]}` }),
        el('span', { class: 'pname', text: q.name || '(이름 없음)' }),
        el('span', { class: 'pmeta', text: `${pp.dominantName} · ${shortConc(q.c)}` }),
      ]);
      if (p.perfumes.length > 1) {
        item.append(el('button', {
          class: 'remove', type: 'button', 'aria-label': `${q.name} 삭제`, text: '×',
          onclick: (e) => {
            e.stopPropagation();
            p.perfumes.splice(idx, 1);
            p.sel = Math.min(p.sel, p.perfumes.length - 1);
            update();
          },
        }));
      }
      list.append(item);
    });
    $('perfume-count').textContent = `${p.perfumes.length}개의 평균 = 취향 벡터`;
  }

  /** 보이는(가중치 > 3%) 모션 레이어 목록, 지배 계열 먼저. */
  const visibleLayers = (pp) => pp.layerAlpha.map((a, i) => [a, i]).filter(([a]) => a > 0.03).sort((x, y) => y[0] - x[0]);

  function syncSliders(mode) {
    const pp = paramsCache[state.active];
    const v = pp.vector, m = pp.motion;
    if (mode !== 'none') {
      const q = perfume();
      F.forEach((_, i) => {
        if (mode !== 'except-family-' + i) famInputs[i].value = q.f[i];
        famOutputs[i].textContent = pct(q.f[i]);
        setTrackFill(famInputs[i]);
      });
      $('family-sum').textContent = `합계 ${fmt(q.f.reduce((a, b) => a + b, 0))}`;
      ['c', 'l', 's'].forEach((k) => {
        const input = $(`s-${k}`);
        if (mode !== 'except-' + k) input.value = q[k];
        $(`o-${k}`).textContent = fmt(q[k]);
        setTrackFill(input);
      });
      if (document.activeElement !== $('perfume-name')) $('perfume-name').value = q.name;
    }
    // 그래픽에 실제 반영된 값 (취향 평균 기준)
    const S = HERO_SIZE[0];
    const counts = visibleLayers(pp).map(([, i]) => `${F[i].motion.label} <b>${Math.max(1, Math.round(m.counts[i]))}</b>`).join(' · ');
    $('e-c').innerHTML = `평균 ${fmt(v.c)} (${shortConc(v.c)}) → 채도 <b>×${fmt(pp.color.chromaScale)}</b> · 불투명도 <b>${fmt(pp.opacity)}</b> · 선 밀도 <b>${pct(pp.detail)}</b> · 흐림 <b>${fmt(pp.blur * S, 1)}px</b>`;
    $('e-l').innerHTML = `평균 ${fmt(v.l)} → 모션 속도 <b>×${fmt(m.speed)}</b> · 잔상 길이 <b>${pct(m.trail)}</b> · 선 <b>${m.gap * S < 0.8 ? '이어짐' : '끊김'}</b>`;
    $('e-s').innerHTML = `평균 ${fmt(v.s)} → 확산 반경 <b>${fmt(pp.spread.radius)}</b> · 움직임 폭 <b>×${fmt(m.amplitude)}</b><br>반복: ${counts}`;
  }

  function renderSide() {
    const p = profile();
    const pp = paramsCache[state.active];
    const v = pp.vector;
    $('hero-name').textContent = p.name || '(이름 없음)';
    $('profile-dot').style.background = PROFILE_COLORS[state.active];
    $('profile-dot-2').style.background = PROFILE_COLORS[state.active];
    if (document.activeElement !== $('profile-name')) $('profile-name').value = p.name;
    $('hero-canvas').setAttribute('aria-label', `${p.name}의 취향 모션 그래픽: 기본 톤 ${pp.dominantName}`);

    const box = $('taste-vector');
    box.replaceChildren();
    const bar = el('div', { class: 'bar', role: 'img', 'aria-label': '계열 비중 막대' });
    F.forEach((fam, i) => {
      if (v.f[i] > 0.004) bar.append(el('span', { style: `flex:${v.f[i]};background:${fam.colors[0]}`, title: `${fam.name} ${pct(v.f[i])}` }));
    });
    box.append(bar);
    F.forEach((fam, i) => {
      box.append(el('span', { class: 'k' }, [el('span', { class: 'swatch', style: `background:${fam.colors[0]}` }), fam.name.replace('/아쿠아틱', '')]));
      box.append(el('span', { class: 'v', text: fmt(v.f[i]) }));
    });
    [['농도', v.c], ['지속력', v.l], ['실라주', v.s]].forEach(([k, x]) => {
      box.append(el('span', { class: 'k', text: k }), el('span', { class: 'v', text: fmt(x) }));
    });

    const lt = $('layer-table');
    lt.replaceChildren();
    pp.layerAlpha.map((a, i) => [a, i]).sort((x, y) => y[0] - x[0]).forEach(([a, i]) => {
      const fam = F[i];
      lt.append(el('div', { class: 'layer-row' + (a > 0.03 ? '' : ' off') }, [
        el('span', { class: 'swatch', style: `background:${E.rgbCss(pp.color.palettes[i].bg)}; box-shadow: inset 0 0 0 2px ${E.rgbCss(pp.color.palettes[i].line)}` }),
        el('span', { class: 'nm' }, [fam.name, el('small', { text: `${fam.motion.label} × ${Math.max(1, Math.round(pp.motion.counts[i]))}` })]),
        el('span', { class: 'v', text: a > 0.03 ? pct(a) : '숨김' }),
        el('span', { class: 'meter' }, [el('i', { style: `width:${a * 100}%;background:${fam.colors[0]}` })]),
      ]));
    });

    const ro = $('param-readout');
    ro.replaceChildren();
    [
      ['기본 톤', `${pp.dominantName} ${pct(pp.weights[pp.dominant])}`],
      ['모션 속도', `×${fmt(pp.motion.speed)}`],
      ['잔상 길이', pct(pp.motion.trail)],
      ['확산 반경', fmt(pp.spread.radius)],
      ['움직임 폭', `×${fmt(pp.motion.amplitude)}`],
      ['채도', `×${fmt(pp.color.chromaScale)}`],
      ['불투명도', fmt(pp.opacity)],
    ].forEach(([k, x]) => ro.append(el('span', { text: k }), el('span', { class: 'v', text: String(x) })));
  }

  const cardCanvases = [];
  function renderCards() {
    const wrap = $('cards');
    wrap.replaceChildren();
    state.profiles.forEach((p, idx) => {
      if (!cardCanvases[idx]) cardCanvases[idx] = el('canvas', { width: CARD_SIZE[0], height: CARD_SIZE[1], role: 'img' });
      const canvas = cardCanvases[idx];
      const pp = paramsCache[idx];
      const v = pp.vector;
      canvas.setAttribute('aria-label', `${p.name}의 취향 그래픽: 기본 톤 ${pp.dominantName}`);
      canvas.onclick = () => { state.active = idx; update(); };

      const actions = el('div', { class: 'card-actions' }, [
        idx !== state.active ? el('button', { class: 'btn small', type: 'button', text: '편집', onclick: () => { state.active = idx; update(); } }) : null,
        state.profiles.length < MAX_PROFILES ? el('button', {
          class: 'btn small', type: 'button', text: '복제',
          onclick: () => {
            const c = clone(p); c.name = `${p.name} 복제`.slice(0, 24);
            state.profiles.push(c); state.active = state.profiles.length - 1; update();
          },
        }) : null,
        IS_ARTIFACT ? null : el('button', {
          class: 'btn small', type: 'button', text: 'PNG',
          onclick: () => {
            const a = document.createElement('a');
            a.download = `scent-${p.name.replace(/\s+/g, '_')}-t${fmt(t, 1)}.png`;
            a.href = canvas.toDataURL('image/png');
            a.click();
          },
        }),
        state.profiles.length > 1 ? el('button', {
          class: 'btn small', type: 'button', text: '삭제',
          onclick: () => {
            state.profiles.splice(idx, 1);
            cardCanvases.length = 0;
            state.active = Math.min(state.active, state.profiles.length - 1);
            update();
          },
        }) : null,
      ]);

      wrap.append(el('article', { class: 'card' + (idx === state.active ? ' active' : '') }, [
        canvas,
        el('div', { class: 'card-body' }, [
          el('div', { class: 'card-title' }, [
            el('span', { class: 'swatch', style: `background:${PROFILE_COLORS[idx]}` }),
            el('strong', { text: p.name || '(이름 없음)' }),
            el('span', { class: 'tag', text: `${pp.dominantName} · ${shortConc(v.c)}` }),
          ]),
          el('div', { class: 'card-vec', text: `[${v.f.map((x) => fmt(x)).join(', ')}] · c ${fmt(v.c)} · l ${fmt(v.l)} · s ${fmt(v.s)}` }),
          actions,
        ]),
      ]));
    });
  }

  function meterCell(x) {
    return el('td', {}, [fmt(x), el('span', { class: 'meter', 'aria-hidden': 'true' }, [el('i', { style: `width:${x * 100}%` })])]);
  }

  function renderSimilarity() {
    const tb0 = $('sim-table');
    tb0.replaceChildren();
    if (state.profiles.length < 2) {
      tb0.append(el('tbody', {}, [el('tr', {}, [el('td', { class: 'empty', text: '위의 “+ 비교 벡터”로 프로필을 하나 더 추가하세요.' })])]));
      return;
    }
    tb0.append(el('thead', {}, [el('tr', {}, ['비교 쌍', '계열 코사인', '형태', '색상', '확산 범위', '강도'].map((h) => el('th', { scope: 'col', text: h })))]));
    const tb = el('tbody');
    const vs = paramsCache.map((pp) => pp.vector);
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        const r = E.compare(vs[i], vs[j]);
        tb.append(el('tr', {}, [
          el('td', {}, [el('span', { class: 'pair' }, [
            el('span', { class: 'swatch', style: `background:${PROFILE_COLORS[i]}` }), state.profiles[i].name, ' ↔ ',
            el('span', { class: 'swatch', style: `background:${PROFILE_COLORS[j]}` }), state.profiles[j].name,
          ])]),
          meterCell(r.cos), meterCell(r.shape), meterCell(r.color), meterCell(r.spread), meterCell(r.intensity),
        ]));
      }
    }
    tb0.append(tb);
  }

  function drawFrame() {
    $('clock').textContent = `t = ${fmt(t, 1)}s · 같은 벡터와 같은 t는 항상 같은 프레임`;
    if (view === 'single') R.draw($('hero-canvas'), paramsCache[state.active], t);
    else if (view === 'compare') paramsCache.forEach((pp, i) => cardCanvases[i] && R.draw(cardCanvases[i], pp, t));
  }

  // 약 30fps로 제한한 애니메이션 루프
  let lastDraw = 0;
  function loop(now) {
    if (playing) {
      if (lastNow) t += Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      if (now - lastDraw > 30) { lastDraw = now; drawFrame(); }
    } else {
      lastNow = 0;
    }
    requestAnimationFrame(loop);
  }

  // ── 검증 산점도 ──
  function renderVerify() {
    const pairs = E.samplePairs(400, 7);
    const xs = pairs.map((p) => p.cos);
    const box = $('verify-charts');
    const tip = $('tooltip');
    const specs = [
      ['shape', '형태 유사도'],
      ['color', '색상 유사도'],
      ['spread', '확산 범위 유사도'],
    ];
    const NS = 'http://www.w3.org/2000/svg';
    const W = 260, H = 200, m = { l: 30, r: 8, t: 8, b: 28 };
    specs.forEach(([key, label]) => {
      const ys = pairs.map((p) => p[key]);
      const rho = E.spearman(xs, ys);
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `코사인 유사도 대 ${label} 산점도, 스피어만 ρ ${rho.toFixed(3)}`);
      const sx = (x) => m.l + x * (W - m.l - m.r);
      const sy = (y) => H - m.b - y * (H - m.t - m.b);
      const mk = (tag, attrs, text) => {
        const n = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
        if (text !== undefined) n.textContent = text;
        svg.append(n);
        return n;
      };
      [0, 0.5, 1].forEach((g) => {
        mk('line', { class: 'grid', x1: sx(0), x2: sx(1), y1: sy(g), y2: sy(g) });
        mk('text', { x: m.l - 6, y: sy(g) + 3, 'text-anchor': 'end' }, g.toFixed(1));
        mk('text', { x: sx(g), y: H - m.b + 14, 'text-anchor': 'middle' }, g.toFixed(1));
      });
      mk('line', { class: 'axis', x1: sx(0), x2: sx(1), y1: sy(0), y2: sy(0) });
      mk('text', { x: sx(0.5), y: H - 2, 'text-anchor': 'middle' }, '계열 코사인 유사도');
      const dots = pairs.map((p) => mk('circle', { class: 'dot', cx: sx(p.cos), cy: sy(p[key]), r: 2.4 }));
      let hot = null;
      svg.addEventListener('pointermove', (e) => {
        const rect = svg.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W, py = ((e.clientY - rect.top) / rect.height) * H;
        let best = -1, bd = Infinity;
        pairs.forEach((p, i) => {
          const d = (sx(p.cos) - px) ** 2 + (sy(p[key]) - py) ** 2;
          if (d < bd) { bd = d; best = i; }
        });
        if (hot) hot.classList.remove('hot');
        if (best < 0 || bd > 400) { tip.hidden = true; hot = null; return; }
        hot = dots[best]; hot.classList.add('hot');
        tip.textContent = `코사인 ${fmt(pairs[best].cos, 3)} → ${label} ${fmt(pairs[best][key], 3)}`;
        tip.hidden = false;
        tip.style.left = `${e.clientX + 12}px`;
        tip.style.top = `${e.clientY + 12}px`;
      });
      svg.addEventListener('pointerleave', () => { tip.hidden = true; if (hot) hot.classList.remove('hot'); hot = null; });
      box.append(el('div', { class: 'chart' }, [
        el('h3', { text: label }),
        el('div', { class: 'rho', text: `스피어만 ρ = ${rho.toFixed(4)}` }),
        svg,
      ]));
    });
  }

  let pending = null;
  let frameReq = 0;
  function update(opts = {}) {
    pending = opts;
    if (frameReq) return;
    frameReq = requestAnimationFrame(() => {
      frameReq = 0;
      const o = pending;
      refreshParams();
      syncSliders(o.sliders || 'all');
      renderTabs();
      renderPerfumeList();
      renderSide();
      if (view === 'compare') { renderCards(); renderSimilarity(); }
      drawFrame();
      saveHash();
    });
  }

  window.addEventListener('hashchange', () => {
    const s = decodeState(location.hash.slice(1));
    if (s && encodeState(compactState()) !== location.hash.slice(1)) { state = s; cardCanvases.length = 0; update(); }
  });

  syncPlay();
  update();
  requestAnimationFrame(loop);
})();
