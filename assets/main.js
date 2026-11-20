/* ---------- helpers ---------- */
const C = {
  ink: '#13293D', muted: '#586A7C', rule: '#D9DFE6', signal: '#2A6FDB',
  threshold: '#E8A317', alarm: '#D64545', context: '#2F9E6E', grey: '#9AA8B6',
  sensors: ['#8FB3E8', '#B7C4D3', '#9BD3BA']
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function rng(seed) { // mulberry32
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function path(xs, ys, sx, sy) {
  let d = '', pen = false;
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] == null || Number.isNaN(ys[i])) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + sx(xs[i]).toFixed(1) + ' ' + sy(ys[i]).toFixed(1);
    pen = true;
  }
  return d;
}
function text(parent, x, y, str, attrs = {}) {
  const t = el('text', Object.assign({ x, y, 'font-size': 13, fill: C.muted, 'font-family': 'IBM Plex Sans, sans-serif' }, attrs), parent);
  t.textContent = str;
  return t;
}
function events(flags, gap = 3) { // group alarm points into alarm events
  const ev = []; let cur = null;
  flags.forEach((f, i) => {
    if (!f) return;
    if (cur && i - cur.end <= gap) cur.end = i; else { cur = { start: i, end: i }; ev.push(cur); }
  });
  return ev;
}

/* ---------- hero animation ---------- */
(function hero() {
  const cv = document.getElementById('heroCanvas');
  const btn = document.getElementById('heroToggle');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const N = 300, DEG = 205, FAIL = 282, THR = 0.6;
  let data, progress = 0, paused = reduceMotion, last = 0, hold = 0, seed = 7;

  function make(s) {
    const r = rng(s), sig = [[], [], []], score = [];
    for (let i = 0; i < N; i++) {
      const deg = Math.max(0, (i - DEG) / (FAIL - DEG));
      for (let k = 0; k < 3; k++) {
        const base = Math.sin(i / (9 + k * 4) + k) * 0.35 + k * 0.05;
        sig[k].push(base + gauss(r) * (0.12 + deg * 0.35) + deg * deg * (k === 1 ? -0.6 : 0.5));
      }
      score.push(0.28 + Math.abs(gauss(r)) * 0.07 + Math.pow(Math.min(deg, 1.1), 2) * 0.62);
    }
    let warn = score.findIndex((v, i) => i > DEG && v > THR);
    return { sig, score, warn };
  }

  function size() {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    const w = cv.clientWidth, h = cv.clientHeight, pad = 8;
    const top = pad, sigH = h * 0.5, scoreTop = h * 0.6, scoreH = h * 0.36;
    const x = i => pad + (i / (N - 1)) * (w - pad * 2);
    ctx.clearRect(0, 0, w, h);
    const upto = Math.floor(progress);

    // failure line (known after the fact; shown faint until reached)
    ctx.strokeStyle = C.alarm; ctx.globalAlpha = upto >= FAIL ? 1 : 0.18; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x(FAIL), top); ctx.lineTo(x(FAIL), h - 4); ctx.stroke(); ctx.globalAlpha = 1;

    // sensors
    data.sig.forEach((s, k) => {
      ctx.strokeStyle = C.sensors[k]; ctx.lineWidth = 1.4; ctx.beginPath();
      for (let i = 0; i <= Math.min(upto, N - 1); i++) {
        const y = top + sigH / 2 + k * (sigH * 0.18) - s[i] * sigH * 0.32;
        i ? ctx.lineTo(x(i), y) : ctx.moveTo(x(i), y);
      }
      ctx.stroke();
    });

    // score + threshold
    const sy = v => scoreTop + scoreH - Math.min(v, 1.2) / 1.2 * scoreH;
    ctx.strokeStyle = C.threshold; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x(0), sy(THR)); ctx.lineTo(x(N - 1), sy(THR)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = C.signal; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= Math.min(upto, N - 1); i++) i ? ctx.lineTo(x(i), sy(data.score[i])) : ctx.moveTo(x(i), sy(data.score[i]));
    ctx.stroke();

    // warning
    if (data.warn > 0 && upto >= data.warn) {
      const wx = x(data.warn), wy = sy(data.score[data.warn]);
      ctx.fillStyle = C.alarm; ctx.beginPath(); ctx.arc(wx, wy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.ink; ctx.font = '600 13px IBM Plex Sans, sans-serif';
      const label = 'Early warning';
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, Math.max(pad, wx - tw - 10), wy - 10);
      if (upto >= FAIL) {
        const by = h - 10;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(wx, by - 4); ctx.lineTo(wx, by + 2); ctx.lineTo(x(FAIL), by + 2); ctx.lineTo(x(FAIL), by - 4); ctx.stroke();
        ctx.font = '12px IBM Plex Sans, sans-serif'; ctx.fillStyle = C.muted;
        const lt = 'time to act';
        ctx.fillText(lt, wx - ctx.measureText(lt).width - 8, by + 2);
      }
    }
  }

  function frame(t) {
    if (!last) last = t;
    const dt = t - last; last = t;
    if (!paused) {
      if (progress < N) progress = Math.min(N, progress + dt * N / 5200);
      else { hold += dt; if (hold > 2600) { hold = 0; progress = 0; seed++; data = make(seed); } }
    }
    draw();
    requestAnimationFrame(frame);
  }

  data = make(seed);
  size();
  if (reduceMotion) { progress = N; btn.textContent = 'Play'; btn.setAttribute('aria-pressed', 'true'); }
  window.addEventListener('resize', () => { size(); draw(); });
  btn.addEventListener('click', () => {
    paused = !paused;
    btn.textContent = paused ? 'Play' : 'Pause';
    btn.setAttribute('aria-pressed', String(paused));
    if (!paused && progress >= N) { progress = 0; hold = 0; }
  });
  requestAnimationFrame(frame);
})();

/* ---------- demo 1: thresholding under drift ---------- */
(function thresholdDemo() {
  const root = document.getElementById('demoThreshold');
  if (!root) return;
  const svg = root.querySelector('svg');
  const N = 400, DRIFT = 150, DEG = 340, W = 800, H = 240, L = 40, R = 12, T = 14, B = 26;
  const r = rng(42), s = [];
  for (let i = 0; i < N; i++) {
    let v = 1 + gauss(r) * 0.13;
    if (i >= DRIFT) v += 0.8 * Math.min(1, (i - DRIFT) / 12);
    if (i === 62 || i === 233 || i === 291) v += 0.75;
    if (i >= DEG) v += Math.pow((i - DEG) / (N - DEG), 2) * 2.6;
    s.push(v);
  }
  const xs = s.map((_, i) => i);
  const sx = i => L + i / (N - 1) * (W - L - R);
  const sy = v => T + (1 - Math.min(v, 4.6) / 4.6) * (H - T - B);

  const modeInputs = root.querySelectorAll('input[name="thrMode"]');
  const cIn = root.querySelector('#thrConst'), wIn = root.querySelector('#thrWin');
  const cOut = root.querySelector('#thrConstOut'), wOut = root.querySelector('#thrWinOut');
  const readout = root.querySelector('#thrReadout');

  function thresholds(mode) {
    if (mode === 'const') return s.map(() => +cIn.value);
    const win = +wIn.value;
    return s.map((_, i) => {
      if (i < win) return null;
      const w = s.slice(i - win, i);
      const m = a => a.reduce((x, y) => x + y, 0) / a.length;
      const sd = (a, mu) => Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / a.length);
      const mu = m(w), t1 = mu + 2 * sd(w, mu);
      const f = w.filter(v => v <= t1), mu2 = m(f);
      return mu2 + 2 * sd(f, mu2);
    });
  }

  function render() {
    const mode = [...modeInputs].find(i => i.checked).value;
    root.querySelectorAll('.slider').forEach(sl => sl.classList.toggle('hidden', sl.dataset.for !== mode));
    cOut.textContent = (+cIn.value).toFixed(2); wOut.textContent = wIn.value;
    const thr = thresholds(mode);
    const flags = s.map((v, i) => thr[i] != null && v > thr[i]);
    const ev = events(flags);
    const hit = ev.find(e => e.end >= DEG);
    const firstInZone = flags.findIndex((f, i) => f && i >= DEG);

    svg.innerHTML = '';
    el('rect', { x: sx(DEG), y: T, width: sx(N - 1) - sx(DEG), height: H - T - B, fill: '#FBE9E9' }, svg);
    text(svg, sx(DEG) + 6, T + 14, 'warning zone', { fill: C.alarm, 'font-size': 12 });
    el('line', { x1: sx(N - 1), x2: sx(N - 1), y1: T, y2: H - B, stroke: C.alarm, 'stroke-width': 3 }, svg);
    el('line', { x1: sx(DRIFT), x2: sx(DRIFT), y1: T, y2: H - B, stroke: C.grey, 'stroke-dasharray': '3 3' }, svg);
    text(svg, sx(DRIFT) + 6, T + 14, 'setting changed', { 'font-size': 12 });
    el('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: C.rule }, svg);
    text(svg, L, H - 8, 'time', { 'font-size': 12 });
    text(svg, 4, sy(1) + 4, 'score', { 'font-size': 12 });
    el('path', { d: path(xs, s, sx, sy), fill: 'none', stroke: C.signal, 'stroke-width': 1.6 }, svg);
    el('path', { d: path(xs, thr, sx, sy), fill: 'none', stroke: C.threshold, 'stroke-width': 2, 'stroke-dasharray': mode === 'const' ? '7 4' : '' }, svg);
    flags.forEach((f, i) => { if (f) el('circle', { cx: sx(i), cy: sy(s[i]), r: 2.6, fill: i < DEG ? C.alarm : C.ink }, svg); });

    const fa = flags.filter((f, i) => f && i < DEG).length;
    readout.innerHTML =
      `<span class="${fa ? 'bad' : 'good'}">Alarms on ${fa} time step${fa === 1 ? '' : 's'}</span> before the warning zone. ` +
      (hit ? `<span class="good">Failure warned ${N - 1 - firstInZone} steps ahead.</span>` : `<span class="bad">Failure missed.</span>`);
  }
  [...modeInputs, cIn, wIn].forEach(i => i.addEventListener('input', render));
  render();
})();

/* ---------- demo 2: context prunes alarms ---------- */
(function contextDemo() {
  const root = document.getElementById('demoContext');
  if (!root) return;
  const svg = root.querySelector('svg');
  const N = 300, W = 800, H = 270, L = 40, R = 12, T = 14, B = 70, THR = 1.75, DEG = 250;
  const changes = [80, 185];
  const r = rng(11), s = [];
  for (let i = 0; i < N; i++) {
    let v = 1 + gauss(r) * 0.11;
    changes.forEach(c => { if (i >= c) v += 1.2 * Math.exp(-(i - c) / 6); });
    if (i >= DEG) v += Math.pow((i - DEG) / (N - DEG), 2) * 2.2;
    s.push(v);
  }
  const xs = s.map((_, i) => i);
  const sx = i => L + i / (N - 1) * (W - L - R);
  const plotB = H - B;
  const sy = v => T + (1 - Math.min(v, 3.4) / 3.4) * (plotB - T);
  const toggle = root.querySelector('#ctxToggle');
  const readout = root.querySelector('#ctxReadout');
  const ev = events(s.map(v => v > THR));
  ev.forEach(e => { e.cause = changes.find(c => e.start >= c && e.start <= c + 15); });

  function render() {
    const use = toggle.checked;
    svg.innerHTML = '';
    el('line', { x1: L, x2: W - R, y1: sy(THR), y2: sy(THR), stroke: C.threshold, 'stroke-width': 2, 'stroke-dasharray': '7 4' }, svg);
    el('path', { d: path(xs, s, sx, sy), fill: 'none', stroke: C.signal, 'stroke-width': 1.6 }, svg);
    el('line', { x1: sx(N - 1), x2: sx(N - 1), y1: T, y2: plotB, stroke: C.alarm, 'stroke-width': 3 }, svg);
    text(svg, 4, sy(1) + 4, 'score', { 'font-size': 12 });

    // context track
    const trackY = plotB + 30;
    el('line', { x1: L, x2: W - R, y1: trackY, y2: trackY, stroke: C.rule }, svg);
    text(svg, 4, trackY + 4, 'events', { 'font-size': 12 });
    changes.forEach(c => {
      el('rect', { x: sx(c) - 6, y: trackY - 6, width: 12, height: 12, transform: `rotate(45 ${sx(c)} ${trackY})`, fill: use ? C.context : C.grey }, svg);
      text(svg, sx(c) + 12, trackY + 24, 'speed change', { 'font-size': 12, fill: use ? C.context : C.muted });
    });

    let raised = 0, explained = 0;
    ev.forEach(e => {
      const peak = e.start + s.slice(e.start, e.end + 1).indexOf(Math.max(...s.slice(e.start, e.end + 1)));
      const isExplained = use && e.cause != null;
      isExplained ? explained++ : raised++;
      const cx = sx(peak), cy = sy(s[peak]);
      if (isExplained) {
        el('path', { d: `M${sx(e.cause)} ${trackY - 9} C ${sx(e.cause)} ${cy + 40}, ${cx} ${cy + 40}, ${cx} ${cy + 10}`, fill: 'none', stroke: C.context, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
        el('circle', { cx, cy, r: 7, fill: '#fff', stroke: C.context, 'stroke-width': 2 }, svg);
        text(svg, cx + 10, cy - 6, 'explained', { 'font-size': 12, fill: C.context });
      } else {
        el('circle', { cx, cy, r: 7, fill: C.alarm }, svg);
        text(svg, cx - 46, cy - 10, 'alarm', { 'font-size': 12, fill: C.alarm, 'font-weight': 600 });
      }
    });
    readout.innerHTML = use
      ? `<span class="good">${raised} alarm raised, ${explained} explained by context.</span> Only the alarm before the failure remains.`
      : `<span class="bad">${raised} alarms raised.</span> Two of them follow a speed change, not a fault.`;
  }
  toggle.addEventListener('change', render);
  render();
})();

/* ---------- demo 3: RUL <-> survival (TITEUF idea) ---------- */
(function tteDemo() {
  const root = document.getElementById('demoTTE');
  if (!root) return;
  const svg = root.querySelector('svg');
  const W = 800, H = 260, L = 46, R = 14, T = 14, B = 34, TMAX = 100;
  const sx = t => L + t / TMAX * (W - L - R);
  const sy = p => T + (1 - p) * (H - T - B);
  const ts = Array.from({ length: 401 }, (_, i) => i * TMAX / 400);
  const tabs = root.querySelectorAll('[role="tab"]');
  const rv = root.querySelector('#rulVal'), rs = root.querySelector('#rulSpread'), pt = root.querySelector('#survThr');
  const readout = root.querySelector('#tteReadout'), explain = root.querySelector('#tteExplain');
  const LAM = 45, K = 2.2;
  let mode = 'r2s';

  function axes() {
    el('line', { x1: L, x2: W - R, y1: sy(0), y2: sy(0), stroke: C.rule }, svg);
    el('line', { x1: L, x2: L, y1: sy(0), y2: sy(1), stroke: C.rule }, svg);
    [0, 0.5, 1].forEach(p => text(svg, L - 8, sy(p) + 4, p.toFixed(1), { 'text-anchor': 'end', 'font-size': 12 }));
    [0, 20, 40, 60, 80].forEach(t => text(svg, sx(t), H - 14, String(t), { 'text-anchor': 'middle', 'font-size': 12 }));
    text(svg, W - R, H - 14, '100 days', { 'text-anchor': 'end', 'font-size': 12 });
  }

  function render() {
    root.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== mode));
    svg.innerHTML = '';
    axes();
    if (mode === 'r2s') {
      const r = +rv.value, s = +rs.value;
      root.querySelector('#rulValOut').textContent = r;
      root.querySelector('#rulSpreadOut').textContent = s.toFixed(1);
      const S = t => 1 / (1 + Math.exp((t - r) / s));
      el('line', { x1: sx(r), x2: sx(r), y1: sy(0), y2: sy(1), stroke: C.grey, 'stroke-width': 3 }, svg);
      text(svg, sx(r) + 6, sy(1) + 12, 'point prediction', { 'font-size': 12 });
      el('path', { d: path(ts, ts.map(S), sx, sy), fill: 'none', stroke: C.signal, 'stroke-width': 2.5 }, svg);
      const a = Math.max(0, r - 10), b = Math.min(TMAX, r + 10);
      readout.innerHTML = `Probability of surviving past day ${a}: <b>${S(a).toFixed(2)}</b>; past day ${b}: <b>${S(b).toFixed(2)}</b>.`;
      explain.textContent = 'A point prediction is a Dirac distribution. TITEUF approximates it with a logistic distribution, so the survival curve is 1 − its CDF, centred on the predicted RUL.';
    } else {
      const p = +pt.value;
      root.querySelector('#survThrOut').textContent = p.toFixed(2);
      const S = t => Math.exp(-Math.pow(t / LAM, K));
      const rul = LAM * Math.pow(-Math.log(p), 1 / K);
      el('path', { d: path(ts, ts.map(S), sx, sy), fill: 'none', stroke: C.signal, 'stroke-width': 2.5 }, svg);
      el('line', { x1: L, x2: W - R, y1: sy(p), y2: sy(p), stroke: C.threshold, 'stroke-width': 2, 'stroke-dasharray': '7 4' }, svg);
      el('line', { x1: sx(rul), x2: sx(rul), y1: sy(p), y2: sy(0), stroke: C.ink, 'stroke-dasharray': '3 3' }, svg);
      el('circle', { cx: sx(rul), cy: sy(p), r: 5, fill: C.ink }, svg);
      text(svg, sx(rul) + 8, sy(p) - 8, `RUL ≈ ${rul.toFixed(0)} days`, { fill: C.ink, 'font-weight': 600 });
      readout.innerHTML = `The curve drops below ${p.toFixed(2)} on day <b>${rul.toFixed(0)}</b>.`;
      explain.textContent = 'A survival curve becomes a point prediction at the time its probability drops under a threshold. TITEUF calibrates this threshold on a validation set.';
    }
  }
  tabs.forEach(t => t.addEventListener('click', () => {
    mode = t.dataset.mode;
    tabs.forEach(x => x.setAttribute('aria-selected', String(x === t)));
    render();
  }));
  [rv, rs, pt].forEach(i => i.addEventListener('input', render));
  render();
})();

/* ---------- figure lightbox ---------- */
(function lightbox() {
  const G = {
    burst: [
      ['burst-overview.jpg', 'BURST overview. AutoKC clusters each batch with a large k, then merges centres with hierarchical clustering and 2T thresholding. Cluster meta-data is merged across batches.'],
      ['patterns.jpg', 'Different press settings produce different signal patterns, which clustering can recover.'],
      ['burst-eval.jpg', 'BURST evaluation against streaming clustering baselines, with k-Means, k-Shape and k-Medoids.']
    ],
    dkr: [
      ['dkr.jpg', 'Choosing K (neighbours) and R (radius) in each window with an optimization function.'],
      ['dkr-results.jpg', 'Adaptive K and R (DKR) compared with classic distance-based outlier detection (DOD).']
    ],
    thr: [['thresholding.jpg', 'Constant, self-tuning, objective-based and moving 2T thresholds for online anomaly scores.']],
    press: [
      ['early-signs.jpg', 'Hypothesis: anomalous data act as early warnings of forthcoming failures.'],
      ['ADlevels.png',"Adaptation of range based metrics to PdM"],
      ['compare-what.jpg', 'What should the current state be compared to? Fixed reference versus a reference rebuilt after context changes.'],
      ['press.jpg', 'The Philips cold-forming press: settings such as speed change the monitored signals.']
    ],
    flavors: [['flavors.jpg', 'Implementation flavors for anomaly detection and other PdM paradigms.']],
    tecad: [
      ['tecad.jpg', 'TECAD on New York taxi demand. The context generator combines anomaly scores with holidays and temperature, and causal discovery explains anomalies by holidays, daylight saving and extreme weather.'],
      ['tecad-classifier.jpg', 'TECAD with context classification for contextualized decision making.']
    ],
    feedback: [['tecad-pruning.jpg', 'Pruning potential false alarms with context and feedback.']],
    fleet: [
      ['fleet-context.jpg', 'Time context and cluster context in a homogeneous vehicle fleet.']
    ],
    navarchos: [
      ['nav-0.png','Vehicle fleet monitoring.'],
      ['nav-1.png','Framework for detecting behavioral changes.'],
      ['nav-2.png','Anomaly scores and predictive horizon.'],
      ['feature-spaces.jpg', 'Success depends on the feature space: raw signals, aggregates, correlations or delta transformation.']
    ],
    titeuf: [
      ['tte-problem.jpg', 'Time-to-event prediction: RUL regression versus survival analysis.'],
      ['censoring.jpg', 'Right censoring: a replaced machine hides when it would have failed.'],
      ['titeuf.jpg', 'TITEUF: from RUL to survival analysis and back.'],
      ['titeuf-automl.jpg', 'TITEUF towards AutoML: model selection across both paradigms with Bayesian optimization.'],
      ['tte-insights.jpg', 'Experimental insights: which paradigm wins depends on censoring and temporal dependencies.']
    ],
    pdmlabs: [['pdmlabs.jpg', 'PdM-Labs compared with a general-purpose AutoML system.']],
    cesa:[ ['CESA-2.png',"Counterfactial explanations for survival analysis example."] ,
          ['CESA.jpg', 'CESA: Counterfactual Explanations for Survival Analysis using time-series data.']
          ]
  };
  const dlg = document.getElementById('lightbox');
  const img = document.getElementById('lbImg'), cap = document.getElementById('lbCap'), cnt = document.getElementById('lbCount');
  const prev = document.getElementById('lbPrev'), next = document.getElementById('lbNext');
  let set = [], idx = 0;
  function show() {
    const [f, c] = set[idx];
    img.src = 'assets/img/' + f; img.alt = c; cap.textContent = c;
    cnt.textContent = `${idx + 1} / ${set.length}`;
    prev.disabled = next.disabled = set.length < 2;
  }
  document.querySelectorAll('[data-gallery]').forEach(b => b.addEventListener('click', () => {
    set = G[b.dataset.gallery] || []; idx = 0;
    if (!set.length) return;
    show(); dlg.showModal();
  }));
  prev.addEventListener('click', () => { idx = (idx - 1 + set.length) % set.length; show(); });
  next.addEventListener('click', () => { idx = (idx + 1) % set.length; show(); });
  document.getElementById('lbClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') next.click();
    if (e.key === 'ArrowLeft') prev.click();
  });
})();

/* ---------- copy buttons ---------- */
document.querySelectorAll('.copy').forEach(b => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; }
  catch { b.textContent = 'Select and copy'; }
  setTimeout(() => (b.textContent = 'Copy'), 1800);
}));

/* ---------- publications ---------- */
(function pubs() {
  const ME = 'Apostolos Giannoulidis';
  const P = [
    { y: 2027, axis: 3, t: 'CESA: Counterfactual Explanations for Survival Analysis', a: 'Ioannis Iordanis, Apostolos Giannoulidis, Katerina Tzompanaki, Vassilis Christophides', v: 'EDBT 2027', b: 'CORE B', links: [['Code', 'https://github.com/IoannisIordanis/CESA']] },
    { y: 2026, axis: 3, t: 'On Model Selection for Time to Event Tasks', a: 'Apostolos Giannoulidis, Ioannis Iordanis, Katerina Tzompanaki, Vassilis Christophides', v: 'KDD 2026', b: 'CORE A*', links: [['Paper', 'https://doi.org/10.1145/3770855.3818915'], ['Code', 'https://github.com/agiannoul/TITEUF']] },
    { y: 2026, axis: 1, t: 'The Power of Anomaly Detection in Predictive Maintenance [Experiments & Analysis]', a: 'Anastasios Papadopoulos, Apostolos Giannoulidis, Anastasios Gounaris, John Paparrizos', v: 'Proc. ACM Manag. Data (SIGMOD) 2026', b: 'CORE A*', links: [['Paper', 'https://doi.org/10.1145/3802119']] },
    { y: 2026, axis: 2, t: 'Explainable contextualized anomaly detection for heterogeneous time series', a: 'Apostolos Giannoulidis, Anastasios Gounaris', v: 'Journal of Intelligent Information Systems', b: 'IF 3.5', links: [['Paper', 'https://doi.org/10.1007/s10844-026-01087-y'], ['Code', 'https://github.com/agiannoul/TECAD']] },
    { y: 2025, axis: 1, t: 'BURST: Rendering Clustering Techniques Suitable for Evolving Streams', a: 'Apostolos Giannoulidis, Anastasios Gounaris, John Paparrizos', v: 'PVLDB 18(11)', b: 'CORE A*', links: [['Paper', 'https://doi.org/10.14778/3749646.3749675'], ['Code', 'https://github.com/agiannoul/BURST-Clustering']] },
    { y: 2025, axis: 2, t: 'Leveraging Feedback and Causality-Enriched Multimodal Context for Predictive Maintenance', a: 'Apostolos Giannoulidis, Anastasios Gounaris, Athanasios Naskos, Nikodimos Nikolaidis, Daniel Caljouw', v: 'IEEE Access 13', b: 'IF 4.2', links: [['Paper', 'https://doi.org/10.1109/ACCESS.2025.3592775'], ['Code', 'https://github.com/agiannoul/PdMContextFeedback']] },
    { y: 2024, axis: 1, t: 'Engineering and evaluating an unsupervised predictive maintenance solution: a cold-forming press case-study', a: 'Apostolos Giannoulidis, Anastasios Gounaris, Athanasios Naskos, Nikodimos Nikolaidis, Daniel Caljouw', v: 'Journal of Intelligent Manufacturing', b: 'IF 7.4', links: [['Paper', 'https://doi.org/10.1007/s10845-024-02352-z']] },
    { y: 2024, axis: 2, t: 'Exploring unsupervised anomaly detection for vehicle predictive maintenance with partial information', a: 'Apostolos Giannoulidis, Anastasios Gounaris, Ioannis Constantinou', v: 'EDBT 2024, Industrial & Applications track', b: 'CORE A', links: [['Paper', 'https://openproceedings.org/2024/conf/edbt/paper-200.pdf'], ['Code', 'https://github.com/agiannoul/NavarchosPdM']] },
    { y: 2024, axis: 1, t: 'Parameter-free Streaming Distance-based Outlier Detection', a: 'Apostolos Giannoulidis, Nikodimos Nikolaidis, Anastasios Gounaris', v: 'ICDE Workshops 2024', b: '', links: [['Paper', 'https://doi.org/10.1109/ICDEW61823.2024.00019'], ['Code', 'https://github.com/agiannoul/ADBOD']] },
    { y: 2024, axis: 2, t: 'Predictive Maintenance in a Fleet Management System: The Navarchos Case', a: 'Apostolos Giannoulidis, Anna-Valentini Michailidou, Theodoros Toliopoulos, Ioannis Constantinou, Anastasios Gounaris', v: 'CAiSE 2024, Demo track', b: 'CORE A, demo', links: [['Paper', 'https://doi.org/10.1007/978-3-031-61000-4_13']] },
    { y: 2023, axis: 2, t: 'A context-aware unsupervised predictive maintenance solution for fleet management', a: 'Apostolos Giannoulidis, Anastasios Gounaris', v: 'Journal of Intelligent Information Systems 60(2)', b: 'IF 3.5', links: [['Paper', 'https://doi.org/10.1007/s10844-022-00744-2'], ['Code', 'https://github.com/agiannoul/UnsupervisedFleetManagment']] },
    { y: 2023, axis: 0, t: 'Enhanced Edge Prediction, a Case Study: Predicting Links in Wikipedia Sites', a: 'Apostolos Giannoulidis, Ioannis Mavroudopoulos', v: 'DSAA 2023', b: 'CORE B', links: [['Paper', 'https://doi.org/10.1109/DSAA60987.2023.10302537']] },
    { y: 2022, axis: 1, t: 'Investigating thresholding techniques in a real predictive maintenance scenario', a: 'Apostolos Giannoulidis, Anastasios Gounaris, Nikodimos Nikolaidis, Athanasios Naskos, Daniel Caljouw', v: 'SIGKDD Explorations 24(2)', b: '', links: [['Paper', 'https://doi.org/10.1145/3575637.3575651'], ['Code', 'https://github.com/agiannoul/ADThresholding']] }
  ];
  const list = document.getElementById('pubList');
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function render(f) {
    list.innerHTML = P.filter(p => f === 'all' || String(p.axis) === f).map(p => `
      <li><span class="yr">${p.y}</span><div>
        <div class="t">${esc(p.t)}</div>
        <div class="a">${esc(p.a).replace(ME, '<b>' + ME + '</b>')}</div>
        <div class="v"><span>${esc(p.v)}</span>${p.b ? `<span class="badge">${esc(p.b)}</span>` : ''}${p.links.map(([n, u]) => `<a href="${u}">${n}</a>`).join('')}</div>
      </div></li>`).join('');
  }
  document.querySelectorAll('.filters button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.filters button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    render(b.dataset.filter);
  }));
  render('all');
})();
