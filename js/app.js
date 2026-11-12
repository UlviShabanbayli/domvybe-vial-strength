// DV93 VIAL STRENGTH · Verdance sign-up. Form logic (validation, show/hide, Caps Lock, submit flow), the strength →
// liquid mapping, layout (fits the vial into its stage, places every overlay), liquid physics and the render scheduler.
// The form is a real <form>; the vial is decoration (aria-hidden) driven by role=meter + a polite live region.
import { Scene, View, RO, RI, RC, CB, CT, BASE, LMAX, levelOf, amp } from './vial.js';
import { score, label, colAt, accentHex, MARKS, MIN_OK } from './strength.js';

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = reduceMQ.matches;
const STILL = qs.has('still');
const disabled = qs.has('disabled');
const SEEN = 'dv93.v1.seen';
const SHOWCASE = 'Kestrel-harbour-29';

const els = {
  hero: $('#hero'), form: $('#form'), stage: $('#stage'), fx: $('#fx'), bgfx: $('#bgfx'), hit: $('#vialhit'),
  em: $('#em'), emErr: $('#em-err'), pw: $('#pw'), pwErr: $('#pw-err'), show: $('#show'), caps: $('#caps'),
  meter: $('#meter'), lvl: $('#lvl'), reqs: $('#reqs'), go: $('#go'), goLbl: $('#go-lbl'), again: $('#again'),
  status: $('#status'), announce: $('#announce'), cv: $('#cv'), cvLiquid: $('#cv-liquid'),
};
const grads = [...document.querySelectorAll('#grads span')];
const reqLis = [...els.reqs.querySelectorAll('li')];

// ---------- state ----------
let phase = 'idle';                 // idle | busy | done
let sTarget = 0, emptyPw = true;
const st = {
  lev: BASE, vel: 0, tx: 0, tz: 0, vtx: 0, vtz: 0, swirl: 0, phase: 0, lean: 0,
  sNew: 0, sOld: 0, mix: 1, sShown: 0, fill: 0, glow: [0, 0, 0], focus: 0, bloom: 0, dis: disabled ? 1 : 0, halo: 1,
};
let bloomOn = false, focusOn = false, hoverLean = 0;

// ---------- WebGL (or the CSS fallback) ----------
let scene = null;
const view = new View();
if (!document.documentElement.classList.contains('no-fx')) {
  try { scene = new Scene(els.fx, els.bgfx); } catch (e) { scene = null; document.documentElement.classList.add('no-fx'); }
}
const lose = (e) => { e.preventDefault(); document.documentElement.classList.add('no-fx'); scene = null; layout(); wake(); };
els.fx.addEventListener('webglcontextlost', lose);
els.bgfx.addEventListener('webglcontextlost', lose);
if (scene) {
  const m = getComputedStyle(document.documentElement).getPropertyValue('--page').trim().match(/^#(..)(..)(..)$/);
  if (m) scene.page = [1, 2, 3].map((i) => Math.pow(parseInt(m[i], 16) / 255, 2.2));
}

// ---------- strength ----------
let announceT = 0;
function update({ kick = true } = {}) {
  const pw = els.pw.value, r = score(pw, els.em.value);
  const s = pw ? r.s : 0;
  emptyPw = !pw;
  if (Math.abs(s - sTarget) > 1e-4) {
    // a new dye front starts at the surface; what is in the column now becomes the "old" colour
    st.sOld = st.sOld + (st.sNew - st.sOld) * easeMix(st.mix);
    st.sNew = s; st.mix = reduced ? 1 : 0;
    if (kick && !reduced) { st.vtx += (s > sTarget ? 1 : -1) * (0.05 + 0.04 * Math.random()) * (Math.random() < 0.5 ? -1 : 1); st.vtz += (Math.random() - 0.5) * 0.06; }
  }
  sTarget = s;
  const lab = label(s, emptyPw);
  els.lvl.textContent = lab;
  els.meter.setAttribute('aria-valuenow', String(Math.round(s * 100)));
  els.meter.setAttribute('aria-valuetext', lab);
  reqLis.forEach((li) => { const okR = !!r.rules[li.dataset.r]; li.classList.toggle('ok', okR); li.querySelector('.st').textContent = okR ? ' (done)' : ' (not yet)'; });
  grads.forEach((g, i) => g.classList.toggle('on', !emptyPw && s >= MARKS[i]));
  if (els.pw.getAttribute('aria-invalid') === 'true' && s >= MIN_OK) clearErr('pw');
  clearTimeout(announceT);
  announceT = setTimeout(() => { if (document.activeElement === els.pw) els.announce.textContent = `Password strength: ${lab}`; }, 700);
  wake();
}
const easeMix = (m) => m * m * (3 - 2 * m);

// ---------- form ----------
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function setErr(which, msg) {
  const inp = which === 'em' ? els.em : els.pw, out = which === 'em' ? els.emErr : els.pwErr;
  inp.setAttribute('aria-invalid', 'true'); out.textContent = msg; inp.closest('.f').classList.add('bad');
  els.meter.classList.toggle('has-err', which === 'pw');
}
function clearErr(which) {
  const inp = which === 'em' ? els.em : els.pw, out = which === 'em' ? els.emErr : els.pwErr;
  inp.removeAttribute('aria-invalid'); out.textContent = ''; inp.closest('.f').classList.remove('bad');
  if (which === 'pw') els.meter.classList.remove('has-err');
}
els.pw.addEventListener('input', () => { stopIntro(); update(); });
els.em.addEventListener('input', () => { if (els.em.getAttribute('aria-invalid') === 'true' && EMAIL.test(els.em.value.trim())) clearErr('em'); update({ kick: false }); });
els.show.addEventListener('click', () => {
  const on = els.pw.type === 'password';
  els.pw.type = on ? 'text' : 'password';
  els.show.textContent = on ? 'Hide' : 'Show';
  els.show.setAttribute('aria-pressed', String(on));
  els.show.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
  els.pw.focus({ preventScroll: true });
});
els.show.setAttribute('aria-label', 'Show password');
const caps = (e) => { if (e.getModifierState) els.caps.hidden = !e.getModifierState('CapsLock'); };
els.pw.addEventListener('keydown', caps); els.pw.addEventListener('keyup', caps);
els.pw.addEventListener('blur', () => { els.caps.hidden = true; });
els.pw.addEventListener('focus', () => { focusOn = true; wake(); });
els.pw.addEventListener('blur', () => { focusOn = demoRing; wake(); });

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  stopIntro();
  if (phase !== 'idle' || disabled) return;
  const emOk = EMAIL.test(els.em.value.trim());
  const s = els.pw.value ? score(els.pw.value, els.em.value).s : 0;
  let first = null;
  if (!emOk) { setErr('em', els.em.value.trim() ? 'Enter a valid email' : 'Enter your email'); first = first || els.em; } else clearErr('em');
  if (s < MIN_OK) {
    setErr('pw', !els.pw.value ? 'Enter a password' : 'Too weak · aim for Fair');
    first = first || els.pw;
    if (!reduced) { st.vtx += 0.42; st.vtz += 0.12; }
  } else clearErr('pw');
  if (first) {
    els.status.textContent = '';
    if (!reduced) { els.form.classList.remove('shake'); void els.form.offsetWidth; els.form.classList.add('shake'); }
    first.focus({ preventScroll: true }); wake(); return;
  }
  phase = 'busy';
  els.form.classList.add('is-busy');
  [els.em, els.pw, els.show].forEach((x) => (x.disabled = true));
  els.go.setAttribute('aria-busy', 'true'); els.go.setAttribute('aria-disabled', 'true');
  els.goLbl.textContent = 'Creating account…'; els.status.textContent = '';
  wake();
  setTimeout(() => {
    phase = 'done';
    els.form.classList.remove('is-busy'); els.form.classList.add('is-done');
    els.go.removeAttribute('aria-busy');
    els.goLbl.textContent = 'Account created';
    const name = (els.em.value.split('@')[0] || '').split(/[._-]/)[0];
    els.status.textContent = `Welcome to Verdance${name ? ', ' + name.charAt(0).toUpperCase() + name.slice(1) : ''}. Check ${els.em.value.trim()} to confirm.`;
    els.again.hidden = false;
    if (!reduced) { st.bloom = 0.0001; bloomOn = true; }
    wake();
  }, reduced ? 300 : 950);
});
els.again.addEventListener('click', () => {
  phase = 'idle';
  els.form.classList.remove('is-done');
  [els.em, els.pw, els.show].forEach((x) => (x.disabled = false));
  els.go.removeAttribute('aria-disabled');
  els.goLbl.textContent = 'Create account'; els.again.hidden = true; els.status.textContent = '';
  els.pw.value = ''; els.pw.type = 'password'; els.show.textContent = 'Show'; els.show.setAttribute('aria-pressed', 'false'); els.show.setAttribute('aria-label', 'Show password');
  update(); els.pw.focus();
});

// ---------- the vial under the pointer: lean toward it, press to swirl ----------
let vialC = 0, vialHW = 1;
els.hit.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || reduced || disabled) return;
  const r = els.hero.getBoundingClientRect();
  hoverLean = Math.max(-1, Math.min(1, (e.clientX - r.left - vialC) / (vialHW * 2.2)));
  wake();
});
els.hit.addEventListener('pointerleave', () => { hoverLean = 0; wake(); });
els.hit.addEventListener('pointerdown', (e) => {
  if (disabled) return;
  stopIntro();
  if (!reduced && st.lev > BASE + 2) { st.swirl = Math.min(1, st.swirl + 0.75); st.vtz -= 0.05; }
  if (e.pointerType !== 'touch' && phase === 'idle') { e.preventDefault(); els.pw.focus({ preventScroll: true }); }
  wake();
});

// ---------- layout ----------
let phone = false, vialBox = [0, 0, 1, 1], heroW = 1, heroH = 1;
function fitDpr(w, h) {
  const f = parseFloat(qs.get('fxdpr'));
  if (f > 0) return f;
  const dpr = devicePixelRatio || 1, budget = phone ? 0.62e6 : 1.05e6;
  return Math.max(1, Math.min(dpr, 2, Math.sqrt(budget / (w * h))));
}
function layout() {
  const hr = els.hero.getBoundingClientRect(), sr = els.stage.getBoundingClientRect();
  heroW = hr.width; heroH = hr.height;
  phone = document.documentElement.clientWidth < 700;
  const stacked = getComputedStyle(els.form).getPropertyValue('--stacked').trim() === '1';
  const sx = sr.left - hr.left, sy = sr.top - hr.top, sw = sr.width;
  // side by side on a short screen the stage is taller than the window (the page scrolls): keep the vial on the first screen
  const sh = stacked ? sr.height : Math.max(120, Math.min(sr.height, innerHeight - sy - 14));
  const gw = grads[0].offsetWidth || 70;
  view.set(0, 0, 1);
  const b = view.box(0), bw = b[2] - b[0], bh = b[3] - b[1];
  // as big as the stage allows; the shadow runs to the lower right, the labels sit right of the glass
  const room = stacked ? sw - gw - 14 : sw * 0.5;
  let fl = Math.min(sh * (stacked ? 0.97 : 0.985) / bh, room / bw);
  fl = Math.min(fl, (innerHeight * (stacked ? 0.62 : 0.9)) / bh);
  const vw = bw * fl, vh = bh * fl;
  const left = stacked ? sx + Math.max(0, (sw - gw - 14 - vw) * 0.5) : sx + sw * 0.4 - vw / 2;
  const top = sy + Math.max(0, (sh - vh) * (stacked ? 0.5 : 0.42));
  view.set(left - b[0] * fl, top - b[1] * fl, fl);
  vialBox = view.box(2);
  const [x0, y0, x1, y1] = [Math.floor(vialBox[0]), Math.floor(vialBox[1]), Math.ceil(vialBox[2]), Math.ceil(vialBox[3])];
  vialBox = [x0, y0, x1, y1];
  Object.assign(els.fx.style, { left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' });
  const hb = view.box(8);
  Object.assign(els.hit.style, { left: hb[0] + 'px', top: hb[1] + 'px', width: Math.max(44, hb[2] - hb[0]) + 'px', height: Math.max(44, hb[3] - hb[1]) + 'px' });
  vialC = view.project([0, CB / 2, 0])[0]; vialHW = (x1 - x0) / 2;
  // the graduation labels: right of the glass at each mark
  const k = fl / 2700;   // css px per world unit at the vial
  const fs = Math.max(9, Math.min(11, k * 9.5));
  grads.forEach((g, i) => {
    const y = levelOf(MARKS[i]), p = [view.project([RO, y, 0])[0], view.project([0, y, RO])[1]];   // beside the glass, level with the etched tick
    g.style.fontSize = fs.toFixed(1) + 'px';
    g.style.transform = `translate(${(p[0] + Math.max(10, k * 24)).toFixed(1)}px, ${p[1].toFixed(1)}px) translateY(-50%)`;
  });
  if (scene) {
    scene.size(x0, y0, x1 - x0, y1 - y0, fitDpr(x1 - x0, y1 - y0));
    scene.sizeBg(heroW, heroH, phone ? 0.75 : heroW * heroH > 2.2e6 ? 0.4 : 0.5);
    lastDrawn = null; hqRects = [];
  }
  layoutFallback();
}

// ---------- CSS fallback ----------
function layoutFallback() {
  const g = view.cylBox(0, CB, RO, 0), c = view.cylBox(CB, CT, RC, 0);
  els.cv.style.cssText = `left:${g[0]}px;top:${c[1]}px;width:${g[2] - g[0]}px;height:${g[3] - c[1]}px;--capw:${c[2] - c[0]}px;--caph:${c[3] - c[1] - (c[2] - c[0]) * 0.06}px`;
  moveFallback();
}
function moveFallback() {
  const g = view.cylBox(0, CB, RO, 0), c = view.cylBox(CB, CT, RC, 0);
  const top = view.project([0, st.lev, RO])[1], bot = view.project([0, BASE, RO])[1];
  els.cvLiquid.style.top = (top - c[1]).toFixed(1) + 'px';
  els.cvLiquid.style.height = Math.max(0, bot - top).toFixed(1) + 'px';
  els.cvLiquid.style.opacity = st.lev > BASE + 1 ? '1' : '0';
  void g;
}

// ---------- physics ----------
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function ease(cur, target, rate, dt) { const d = target - cur; return Math.abs(d) < 1e-3 ? target : cur + d * Math.min(1, dt * rate); }
const hexOf = (c) => accentHex(c);
let accShown = '';
function step(dt) {
  let moving = false, flow = false;
  const tgt = levelOf(sTarget);
  if (reduced) { st.lev = tgt; st.vel = 0; st.tx = st.tz = st.vtx = st.vtz = 0; st.swirl = 0; st.mix = 1; st.sOld = st.sNew; }
  else {
    const h = 1 / 480; let tt = dt;
    const leanT = hoverLean * 0.028;
    while (tt > 1e-6) {
      const s = Math.min(h, tt); tt -= s;
      const a = 38 * (tgt - st.lev) - 8.6 * st.vel;
      st.vel += a * s; st.lev += st.vel * s;
      // slosh: the surface leans with the flow (and toward the pointer) and rocks back (≈ 1.75 Hz, light damping)
      const tzD = Math.max(-0.03, Math.min(0.03, -st.vel * 0.00007)), txD = leanT + Math.max(-0.02, Math.min(0.02, st.vel * 0.00003));
      st.vtz += (-120 * (st.tz - tzD) - 2.1 * st.vtz) * s; st.tz += st.vtz * s;
      st.vtx += (-120 * (st.tx - txD) - 2.1 * st.vtx) * s; st.tx += st.vtx * s;
    }
    st.tx = Math.max(-0.07, Math.min(0.07, st.tx)); st.tz = Math.max(-0.06, Math.min(0.06, st.tz));
    if (Math.abs(tgt - st.lev) < 0.03 && Math.abs(st.vel) < 0.05) { st.lev = tgt; st.vel = 0; }
    const restTx = leanT;
    if (st.vel === 0 && Math.abs(st.tx - restTx) < 3e-4 && Math.abs(st.tz) < 3e-4 && Math.abs(st.vtx) < 5e-3 && Math.abs(st.vtz) < 5e-3) { st.tx = restTx; st.tz = 0; st.vtx = st.vtz = 0; }
    st.swirl *= Math.exp(-dt * 1.25); if (st.swirl < 0.01) st.swirl = 0;
    if (st.mix < 1) { st.mix = Math.min(1, st.mix + dt / 1.6); if (st.mix >= 1) st.sOld = st.sNew; }
    flow = st.lev !== tgt || st.vel !== 0 || st.mix < 1 || st.swirl > 0;
    if (flow) st.phase += dt * (0.55 + 2.2 * st.swirl + Math.min(1, Math.abs(st.vel) * 0.01));
  }
  if (flow || st.tx !== hoverLean * 0.028 * (reduced ? 0 : 1) || st.tz || st.vtx || st.vtz) moving = true;
  // the shown strength (accent colour, glow) follows the dye
  const sVis = st.sOld + (st.sNew - st.sOld) * easeMix(st.mix);
  st.sShown = sVis;
  st.fill = Math.max(0, Math.min(1, (st.lev - BASE) / (LMAX - BASE)));
  st.glow = colAt(Math.max(0, sVis - 0.06));
  // the accent is a :root custom property (a whole-document style recalc): step it in 1/60ths, CSS transitions smooth it
  const acc = hexOf(Math.round(sVis * 60) / 60);
  if (acc !== accShown) { accShown = acc; document.documentElement.style.setProperty('--acc', acc); }
  const r = reduced ? 1000 : 1;
  const f0 = st.focus, d0 = st.dis;
  const fT = focusOn && phase === 'idle' ? 1 : 0;
  st.focus = ease(st.focus, fT, 8 * r, dt); st.dis = ease(st.dis, disabled ? 1 : 0, 6 * r, dt);
  if (st.focus !== f0 || st.dis !== d0 || st.focus !== fT) moving = true;
  if (bloomOn) { st.bloom += dt / 1.8; moving = true; if (st.bloom >= 1) { st.bloom = 0; bloomOn = false; } }
  return moving;
}

// ---------- render scheduler: sleeps at rest, redraws only what changed, refines once at 4 spp ----------
const snap = () => ({ lev: st.lev, tx: st.tx, tz: st.tz, swirl: st.swirl, phase: st.phase, sNew: st.sNew, sOld: st.sOld, mix: st.mix,
  fill: st.fill, glow: st.glow.slice(), focus: st.focus, bloom: st.bloom, dis: st.dis, halo: st.halo });
let lastDrawn = null, hqRects = [], raf = 0, last = 0, lastMoving = true, visible = !document.hidden;
const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const ne = (a, b, e = 1e-6) => Math.abs(a - b) > e;
const surfBox = (s) => { const a = amp(s); return view.cylBox(s.lev - a - 6, s.lev + a + 6, RO + 3); };
function mergeRects(rects) {
  let merged = true;
  while (merged) {
    merged = false;
    for (let a = 0; a < rects.length && !merged; a++) for (let b = a + 1; b < rects.length; b++) if (overlap(rects[a], rects[b])) { rects[a] = union(rects[a], rects[b]); rects.splice(b, 1); merged = true; break; }
  }
  return rects;
}
// what the last frame changed: 'full' (the dye, the level, the glow…), a list of rects (surface / bloom), or []
function dirty(p, c) {
  const glowCh = ne(p.glow[0], c.glow[0]) || ne(p.glow[1], c.glow[1]) || ne(p.glow[2], c.glow[2]);
  if (ne(p.lev, c.lev) || ne(p.phase, c.phase) || ne(p.sNew, c.sNew) || ne(p.sOld, c.sOld) || ne(p.mix, c.mix) || ne(p.dis, c.dis) || ne(p.fill, c.fill) || glowCh || ne(p.halo, c.halo)) return { full: true, bg: true };
  const rects = [];
  if (ne(p.tx, c.tx, 1e-7) || ne(p.tz, c.tz, 1e-7) || ne(p.swirl, c.swirl) || ne(p.focus, c.focus)) rects.push(union(surfBox(p), surfBox(c)));
  if (ne(p.bloom, c.bloom)) rects.push(view.cylBox(0, c.lev + amp(c) + 8, RO + 3));
  return { full: false, bg: false, rects: mergeRects(rects) };
}
const clipC = (r) => [Math.max(vialBox[0], r[0]), Math.max(vialBox[1], r[1]), Math.min(vialBox[2], r[2]), Math.min(vialBox[3], r[3])];
const HQ_BUDGET = 46000;   // device px per frame at 4 spp
const queueHQ = (rs) => { hqRects = mergeRects(hqRects.concat(rs.map(clipC).filter((r) => r[2] > r[0] && r[3] > r[1]))); };
function hqStep() {
  const d = scene.dpr, r = hqRects[0], w = Math.max(1, (r[2] - r[0]) * d);
  const rows = Math.max(4, Math.floor(HQ_BUDGET / w)) / d;
  const strip = [r[0], r[1], r[2], Math.min(r[3], r[1] + rows)];
  scene.render(view, st, [strip], 4);
  if (strip[3] >= r[3] - 0.01) hqRects.shift(); else hqRects[0] = [r[0], strip[3], r[2], r[3]];
}
function frame(now) {
  raf = 0;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 120); last = now;
  const moving = step(dt); lastMoving = moving;
  if (scene) {
    const cur = snap();
    if (!lastDrawn) { scene.renderBg(view, st); scene.render(view, st, null, STILL ? 4 : 1); lastDrawn = cur; hqRects = STILL ? [] : [vialBox.slice()]; }
    else {
      const dd = dirty(lastDrawn, cur);
      if (dd.bg) scene.renderBg(view, st);
      if (dd.full) { scene.render(view, st, null, 1); hqRects = [vialBox.slice()]; lastDrawn = cur; }
      else if (dd.rects.length) { const rc = dd.rects.map(clipC); scene.render(view, st, rc, 1); queueHQ(rc); lastDrawn = cur; }
      else if (!moving && hqRects.length) hqStep();
    }
  } else moveFallback();
  if (moving || (scene && hqRects.length && visible)) raf = requestAnimationFrame(frame); else last = 0;
}
function wake() { lastMoving = true; if (!raf && visible) raf = requestAnimationFrame(frame); }
document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) wake(); });
reduceMQ.addEventListener('change', (e) => { reduced = e.matches; wake(); });
let rz = 0;
addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { layout(); wake(); }); });

// ---------- intro: the showcase password types itself in, the liquid rises and turns emerald ----------
let introT = 0, intro = false;
function stopIntro() { if (intro) { clearTimeout(introT); intro = false; } }
function runIntro(from) {
  intro = true;
  let i = from;
  const tick = () => {
    if (!intro) return;
    i++; els.pw.value = SHOWCASE.slice(0, i); update();
    if (i < SHOWCASE.length) introT = setTimeout(tick, 70 + Math.random() * 40); else intro = false;
  };
  introT = setTimeout(tick, 260);
}

// ---------- boot ----------
if (disabled) {
  els.form.classList.add('is-disabled');
  [els.em, els.pw, els.show].forEach((x) => (x.disabled = true));
  els.go.setAttribute('aria-disabled', 'true');
  els.status.textContent = 'Sign-ups are paused for maintenance. Please try again later.';
}
let seen = false; try { seen = localStorage.getItem(SEEN) === '1'; localStorage.setItem(SEEN, '1'); } catch (e) {}
const demo = qs.get('demo') !== '0';
const animate = demo && !reduced && !STILL && !disabled;
const from = animate ? (seen ? 'Kestrel-harbour'.length : 'Kestrel'.length) : SHOWCASE.length;
if (demo) els.pw.value = SHOWCASE.slice(0, from);
update({ kick: false });
// the first frame is already filled at the starting strength, with no dye front running
st.lev = levelOf(sTarget); st.sNew = st.sOld = sTarget; st.mix = 1;
// the showcase is "being typed": the password field wears its ring (and the meniscus glows) until the visitor does anything
let demoRing = false;
function endDemoRing() {
  if (!demoRing) return;
  demoRing = false; els.pw.closest('.inp').classList.remove('still-focus');
  focusOn = document.activeElement === els.pw; wake();
  ['pointerdown', 'keydown', 'focusin'].forEach((t) => removeEventListener(t, endDemoRing, true));
}
if (demo && !disabled) {
  demoRing = true; focusOn = true; els.pw.closest('.inp').classList.add('still-focus');
  ['pointerdown', 'keydown', 'focusin'].forEach((t) => addEventListener(t, endDemoRing, true));
}
try { await document.fonts.ready; } catch (e) {}
layout();
let readyResolve; const ready = new Promise((r) => (readyResolve = r));
wake();
if (animate) runIntro(from);
requestAnimationFrame(() => requestAnimationFrame(() => readyResolve(true)));

window.__vial = {
  ready, levelOf, score,
  get phase() { return phase; }, get busy() { return raf !== 0; }, get moving() { return lastMoving; }, get fx() { return !!scene; },
  get intro() { return intro; },
  type: (v) => { stopIntro(); els.pw.value = v; update(); },
  state: () => ({ phase, s: sTarget, label: els.lvl.textContent, lev: +st.lev.toFixed(3), tgt: levelOf(sTarget), vel: st.vel, tx: st.tx, tz: st.tz, swirl: st.swirl,
    mix: st.mix, sNew: st.sNew, sOld: st.sOld, focus: st.focus, bloom: st.bloom, dis: st.dis, fill: st.fill, intro,
    draws: scene ? scene.draws : 0, bgDraws: scene ? scene.bgDraws : 0, px: scene ? scene.px : 0, dpr: scene ? scene.dpr : 0,
    canvas: scene ? [els.fx.width, els.fx.height] : null, bgCanvas: scene ? [els.bgfx.width, els.bgfx.height] : null, vialBox, hq: hqRects.length, sleeping: raf === 0, fl: view.fl }),
  view, scene: () => scene, st,
  redraw: (spp = 1) => { if (scene) { scene.renderBg(view, st); scene.render(view, st, null, spp); lastDrawn = snap(); hqRects = []; } },
};
