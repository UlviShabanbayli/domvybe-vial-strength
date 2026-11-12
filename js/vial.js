// DV93 VIAL STRENGTH · the vial. A thick clear glass cylinder with a heavy base and a champagne-brass screw cap, filled
// with a glowing dyed liquid, standing on a dark studio table. Two programs share one scene description:
//  · VIAL (full resolution, only the vial's box): each pixel is traced ANALYTICALLY (ray–cylinder/plane roots; only the
//    liquid surface, a height field, is searched, and only inside the thin slab it can occupy): cap or outer wall →
//    glass → inner wall → air or liquid → surface → far wall → base → table, with Fresnel, refraction (1.5 / 1.36),
//    total internal reflection, absorption + glow of the dye, the dye front, wisps, a silver meniscus, etched
//    graduations, the focus glow, the success light band and the frosted disabled look. Pixels that miss are transparent.
//  · BG (low resolution, the whole hero): the table and wall the vial stands in, i.e. the key-light pool, the vial's
//    liquid-tinted shadow with its focused caustic line, the contact shadow, the glow around the base and the halo on
//    the wall. It is composited over the page colour (premultiplied: light adds, shadow darkens), so the page colour is
//    the CSS colour and the same function is what the vial refracts.
import { createGL, program } from './gl.js';
import { STOPS } from './strength.js';

// world units (≈ px at fl 1). y up, z toward the camera.
export const RO = 65, RI = 57, RC = 68.5, CB = 478, CT = 552, BASE = 34, LMAX = 430;
export const CAM = [0, 610, 2700], TG = [0, 272, 0];
export const SH = [0.42, 0.40];                          // floor shadow per unit of height (key light behind-left)
export const levelOf = (s) => BASE + (LMAX - BASE) * Math.max(0, Math.min(1, s));
export const tickY = (i) => BASE + (LMAX - BASE) * i / 20;

const glslStops = () => {
  const c = STOPS.map(([, v]) => `vec3(${v.map((x) => x.toFixed(4)).join(',')})`), s = STOPS.map(([k]) => k.toFixed(3));
  let src = `vec3 colAt(float s){ s = clamp(s, 0., 1.);\n`;
  for (let i = 1; i < STOPS.length; i++) src += `  if (s <= ${s[i]}) return mix(${c[i - 1]}, ${c[i]}, (s - ${s[i - 1]})/(${s[i]} - ${s[i - 1]}));\n`;
  return src + `  return ${c[c.length - 1]};\n}\n`;
};

const COMMON = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uC; uniform float uFl, uPix, uSeed;
uniform vec3 uRo, uFw, uRt, uUp, uP;
uniform float uLevel, uTx, uTz, uSwirl, uPhase, uAmp;
uniform float uSNew, uSOld, uMix, uFill;
uniform vec3 uGlow;
uniform float uFocus, uBloom, uDis, uHalo;
uniform int uSpp;
const float RO = ${RO}., RI = ${RI}., RC = ${RC}, CB = ${CB}., CT = ${CT}., BASE = ${BASE}., LMAX = ${LMAX}.;
const float ZW = 520.;
const vec2 SHD = vec2(${SH[0]}, ${SH[1]});
const float PI = 3.14159265;

float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3. - 2.*f);
  return mix(mix(h12(i), h12(i + vec2(1., 0.)), u.x), mix(h12(i + vec2(0., 1.)), h12(i + vec2(1., 1.)), u.x), u.y); }
${glslStops()}
// display transform: identity (then gamma) below 0.7, a soft shoulder above, so the page colour maps to itself
vec3 tone(vec3 c){
  c = max(c, 0.);
  vec3 k = 0.7 + 0.3*(1. - exp(-(c - 0.7)/0.3));
  c = mix(c, k, step(0.7, c));
  return pow(c, vec3(1./2.2));
}
float liquidOn(){ return smoothstep(BASE + 0.2, BASE + 3., uLevel); }

// the dye: the colour index at a point. Below the front the old colour, above it the new one; the front starts at the
// surface and sinks through the column while uMix runs 0 → 1, warped so it curls like dye in water. At rest the column
// keeps a gentle gradient: the bottom sits a little lower on the ramp than the top (lime under emerald at Strong).
float dyeW(vec3 p, out float n2){
  float n1 = vn(vec2(p.x*0.011 + p.z*0.007 + uPhase*0.11, p.y*0.0062 - uPhase*0.17));
  n2 = vn(vec2(p.z*0.013 - p.x*0.009 + 4.1, p.y*0.0115 + 3.7 + uPhase*0.07));
  float yF = uLevel + 70. - (uLevel - BASE + 200.)*uMix;
  return smoothstep(yF - 70., yF + 70., p.y + (n1 - 0.5)*130. + (n2 - 0.5)*50.);
}
float gradS(vec3 p){ return 0.24*pow(clamp((uLevel - p.y)/(LMAX - BASE), 0., 1.), 1.7); }
// the colour index of the column (for the shadow): the blend in index space is fine there
float sAt(vec3 p){ float n2; float w = dyeW(p, n2); return clamp(mix(uSOld, uSNew, w) - gradS(p) + (n2 - 0.5)*0.035, 0., 1.); }
// the dye colour: the old and the new colour are mixed as colours (dye in water), not walked along the ramp, so a drop
// from emerald to ruby never passes through a yellow band
vec3 liqCol(vec3 p){
  float n2; float w = dyeW(p, n2);
  float g = gradS(p) - (n2 - 0.5)*0.035;
  if (w >= 0.999) return colAt(uSNew - g);
  if (w <= 0.001) return colAt(uSOld - g);
  return mix(colAt(uSOld - g), colAt(uSNew - g), w);
}

// pale veils of brighter dye drifting in the column (stretched vertically, no blobs, no bubbles)
float wisp(vec3 p){
  vec2 u = vec2(p.x*0.017 + p.z*0.012 + 0.4*sin(p.y*0.009 + uPhase*0.4), p.y*0.0042 - uPhase*0.05);
  float n = vn(u)*0.62 + vn(u*vec2(2.3, 1.7) + 5.1)*0.38;
  return smoothstep(0.46, 0.82, n);
}

// the studio the glass and the cap reflect. az 0 = toward the camera, ±PI = behind the vial. soft widens the boxes.
vec3 env(vec3 d, float soft){
  float az = atan(d.x, d.z), el = d.y;
  vec3 c = vec3(0.010, 0.011, 0.011) + vec3(0.034, 0.036, 0.035)*smoothstep(-0.05, 0.9, el);
  float tall = smoothstep(-0.5 - soft, -0.35, el)*smoothstep(0.92 + soft, 0.78, el);
  // a tall strip front-left: the long highlight down the left of the glass; a narrower one front-right
  c += vec3(7.5, 7.6, 7.7)*smoothstep(0.075 + soft, 0.05, abs(az + 0.72))*tall;
  c += vec3(3.6, 3.7, 3.9)*smoothstep(0.04 + soft, 0.022, abs(az - 0.9))*tall;
  // the key soft box overhead (lights the cap top) and the rim lights low behind (crisp silhouettes)
  c += vec3(2.2, 2.15, 2.05)*smoothstep(0.62 - soft, 0.8, el);
  float back = PI - abs(az);
  c += vec3(1.25, 1.3, 1.35)*smoothstep(0.42 + soft, 0.24, abs(back - 0.62))*smoothstep(-0.05, 0.08, el)*smoothstep(0.6 + soft, 0.4, el);
  // the table, seen in reflection: dark, with the liquid's glow
  c = mix(c, uP*1.4 + uGlow*uFill*0.05, smoothstep(0.0, -0.08, el));
  return c;
}

// key light reaching the table at P (1 = unshadowed). The vial is a cylinder lens: under the liquid the light is tinted
// and focused into a bright line down the middle of the shadow.
vec3 tableT(vec3 P){
  vec3 LD = normalize(vec3(-SHD.x, 1., -SHD.y));
  float tc = -dot(P.xz, LD.xz)/dot(LD.xz, LD.xz);
  if (tc <= 0.) return vec3(1.);
  vec3 M = P + LD*tc; float off = length(M.xz)/RO, ym = M.y;
  float pen = 0.05 + tc*0.0007;
  float inside = (1. - smoothstep(1. - pen, 1. + pen, off))*(1. - smoothstep(CT - 6. - ym*0.03, CT + 6. + ym*0.03, ym));
  if (inside <= 0.) return vec3(1.);
  float foc = exp(-off*off*36.)*2.4 + exp(-off*off*4.5)*0.55;
  // the four bands the light can pass (base, liquid, clear glass, cap), blended over a penumbra that grows with distance
  float w = 3. + tc*0.06, lv = mix(BASE, uLevel, liquidOn());
  vec3 tBase = vec3(0.42) + vec3(0.85)*exp(-off*off*25.);
  vec3 lc = liqCol(vec3(0., clamp(ym, BASE, lv), 0.));
  vec3 tLiq = lc*(0.22 + foc*2.1)*(1. - 0.75*uDis);
  vec3 tClear = vec3(0.56) + vec3(0.62)*exp(-off*off*30.);
  vec3 tr = mix(mix(mix(tBase, tLiq, smoothstep(BASE - w, BASE + w, ym)), tClear, smoothstep(lv - w, lv + w, ym)), vec3(0.05), smoothstep(CB - w, CB + w, ym));
  tr = mix(tr, tr*0.35, smoothstep(0.72, 1., off));
  return mix(vec3(1.), tr, inside);
}
vec3 floorCol(vec3 P){
  float r = length(P.xz);
  vec2 pc = (P.xz - vec2(-60., 80.))/vec2(980., 640.);
  float pool = exp(-dot(pc, pc));
  vec3 c = uP*1.04 + vec3(0.075, 0.074, 0.071)*pool*tableT(P);
  c *= 1. - 0.6*exp(-max(r - RO, 0.)/6.5);                                  // contact shadow
  c += uGlow*uFill*(0.07*exp(-max(r - RO, 0.)/80.) + 0.022*exp(-r*r/160000.))*uHalo;
  return c;
}
vec3 wallCol(vec3 W){
  vec2 q = vec2(W.x + 40., W.y - 330.)/vec2(1150., 720.);
  vec3 c = uP + vec3(0.020, 0.021, 0.020)*exp(-dot(q, q));
  float h = exp(-pow((W.x + 70.)/250., 2.) - pow((W.y - uLevel*0.55 - 70.)/330., 2.));
  float h2 = exp(-pow((W.x + 40.)/120., 2.) - pow((W.y - uLevel*0.5 - 40.)/260., 2.));
  c += uGlow*uFill*(0.08*h + 0.06*h2)*uHalo;
  return c;
}
// the room seen along a ray: the table that sweeps up into the wall
vec3 bgCol(vec3 ro, vec3 rd){
  vec3 wc = uP;
  if (rd.z < -0.02) { float tw = (-ZW - ro.z)/rd.z; wc = wallCol(ro + rd*tw); }
  if (rd.y >= -1e-4) return wc;
  vec3 P = ro + rd*(-ro.y/rd.y);
  float sw = smoothstep(-ZW + 380., -ZW - 40., P.z);
  if (sw >= 1.) return wc;
  return mix(floorCol(P), wc, sw);
}
`;

const BG_FS = COMMON + `
void main(){
  vec2 q = gl_FragCoord.xy - uC;
  vec3 rd = normalize(uFw*uFl + uRt*q.x + uUp*q.y);
  vec3 T = tone(bgCol(uRo, rd)), P = tone(uP);
  T += (h12(gl_FragCoord.xy + uSeed) - 0.5)/255.;
  vec3 m = T/max(P, vec3(1e-3));
  float a = clamp(1. - min(min(m.r, m.g), m.b), 0., 1.);
  o = vec4(max(T - P*(1. - a), 0.), a);
}`;

const VIAL_FS = COMMON + `
float surfY(vec2 q){
  float r2 = dot(q, q)/(RI*RI), r = sqrt(r2);
  float y = uLevel + uTx*q.x + uTz*q.y;
  y -= uSwirl*16.*(0.5 - r2);                                  // the vortex funnel (volume kept)
  y += uSwirl*2.6*sin(3.*atan(q.y, q.x) + r*7. - uPhase*3.)*r; // spiral arms
  y += 2.4*exp(-(1. - r)*RI/2.6)*liquidOn();                   // the meniscus climbing the glass
  return y;
}
vec3 surfN(vec2 q){
  float e = 0.6, h = surfY(q);
  return normalize(vec3(-(surfY(q + vec2(e, 0.)) - h)/e, 1., -(surfY(q + vec2(0., e)) - h)/e));
}
float surfHit(vec3 p, vec3 d, float tmax, float sgn){
  if (uLevel < BASE + 0.2) return -1.;
  float y0 = uLevel - uAmp - 1., y1 = uLevel + uAmp + 3.;
  float ta = 0., tb = tmax;
  if (abs(d.y) > 1e-5) {
    float t0 = (y0 - p.y)/d.y, t1 = (y1 - p.y)/d.y;
    ta = max(0., min(t0, t1)); tb = min(tmax, max(t0, t1));
  } else if (p.y < y0 || p.y > y1) return -1.;
  if (tb <= ta) return -1.;
  float tp = ta;
  for (int i = 1; i <= 10; i++) {
    float t = mix(ta, tb, float(i)/10.);
    vec3 q = p + d*t;
    if ((q.y - surfY(q.xz))*sgn < 0.) {
      float a = tp, b = t;
      for (int k = 0; k < 6; k++) { float m = 0.5*(a + b); vec3 qq = p + d*m; if ((qq.y - surfY(qq.xz))*sgn < 0.) b = m; else a = m; }
      return b;
    }
    tp = t;
  }
  return -1.;
}
float cylT(vec3 p, vec3 d, float r, bool far){
  float a = dot(d.xz, d.xz), b = dot(p.xz, d.xz), c = dot(p.xz, p.xz) - r*r;
  float disc = b*b - a*c;
  if (disc < 0. || a < 1e-9) return -1.;
  float s = sqrt(disc);
  return far ? (-b + s)/a : (-b - s)/a;
}
float iorOf(int m){ return m == 1 ? 1.5 : m == 3 ? 1.36 : 1.; }
void crossI(inout vec3 rd, inout int med, int nm, vec3 n, inout vec3 col, inout vec3 thr, float rk){
  if (dot(n, rd) > 0.) n = -n;
  float n1 = iorOf(med), n2 = iorOf(nm);
  float ci = clamp(-dot(rd, n), 0., 1.);
  float r0 = (n1 - n2)/(n1 + n2); r0 *= r0;
  float F = r0 + (1. - r0)*pow(1. - ci, 5.);
  vec3 rf = refract(rd, n, n1/n2);
  if (dot(rf, rf) < 1e-4) { rd = reflect(rd, n); return; }
  col += thr*F*env(reflect(rd, n), 0.)*rk;
  thr *= 1. - F;
  rd = normalize(rf); med = nm;
}

// the cap: champagne brass, a knurled band, a rounded top edge, the dark thread line where it meets the glass
vec3 capShade(vec3 p, vec3 rd, bool top){
  vec3 F0 = vec3(0.86, 0.68, 0.42);
  vec3 n; float soft = 0.05, groove = 0.;
  if (top) {
    float r = length(p.xz), e = smoothstep(RC - 7., RC, r);
    n = normalize(vec3(p.x/max(r, 1e-3)*e*1.5, 1., p.z/max(r, 1e-3)*e*1.5));
    soft = 0.1 + 0.05*sin(r*1.9);                                 // machined rings
  } else {
    float th = atan(p.x, p.z);
    vec3 nr = vec3(p.x, 0., p.z)/RC, tg = vec3(nr.z, 0., -nr.x);
    float face = clamp(-dot(rd, nr), 0., 1.);
    float band = smoothstep(CB + 8., CB + 10., p.y)*smoothstep(CT - 6., CT - 8., p.y);
    float k = sin(th*64.);
    groove = band*smoothstep(0.08, 0.35, face);
    n = normalize(nr + tg*k*0.2*groove);
    n = normalize(n + vec3(0., smoothstep(CT - 5., CT, p.y)*1.5, 0.) - vec3(0., smoothstep(CB + 4., CB, p.y)*0.8, 0.));
    groove *= 0.5 - 0.5*cos(th*128.);                             // dark valleys between the ridges
  }
  vec3 r = reflect(rd, n);
  float cv = clamp(dot(-rd, n), 0., 1.);
  vec3 F = F0 + (1. - F0)*pow(1. - cv, 5.);
  vec3 c = (env(r, soft)*0.6 + env(r, 0.4)*0.35)*F;
  c += F*(0.07 + 0.2*smoothstep(-0.35, 0.95, r.y))*(0.75 + 0.25*smoothstep(-1., 0.2, r.x));   // the brushed sheen of the room
  c *= 1. - 0.22*groove;
  if (!top) {
    c *= 1. - 0.75*smoothstep(CB + 3., CB + 1., p.y);             // the thread line
    c += F0*0.05*smoothstep(CB + 8., CB + 5., p.y)*smoothstep(CB + 3., CB + 5., p.y);
  }
  return mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2)))*0.8, uDis*0.6);
}

vec4 shade(vec2 frag){
  vec2 q = frag - uC;
  vec3 rd = normalize(uFw*uFl + uRt*q.x + uUp*q.y), ro = uRo;
  // ---- primary hit: the cap, the outer wall, or nothing ----
  float tc = 1e9; bool ctop = false;
  float t = cylT(ro, rd, RC, false);
  if (t > 0.) { float y = ro.y + rd.y*t; if (y > CB && y < CT) tc = t; }
  if (rd.y < 0.) { float tt = (CT - ro.y)/rd.y; vec3 pc = ro + rd*tt; if (tt > 0. && tt < tc && dot(pc.xz, pc.xz) < RC*RC) { tc = tt; ctop = true; } }
  float ts = cylT(ro, rd, RO, false);
  vec3 p = ro + rd*ts;
  bool glass = ts > 0. && p.y >= 0. && p.y <= CB;
  if (tc < 1e8 && (!glass || tc < ts)) return vec4(tone(capShade(ro + rd*tc, rd, ctop)), 1.);
  if (!glass) return vec4(0.);
  vec3 col = vec3(0.), thr = vec3(1.);
  vec3 n = vec3(p.x/RO, 0., p.z/RO);
  n.y -= 0.9*smoothstep(4., 0., p.y); n = normalize(n);          // the rounded foot
  // etched graduations on the front: 20 short ticks, the four marks long
  float th = atan(p.x, p.z);
  float sTick = (p.y - BASE)/((LMAX - BASE)/20.), si = floor(sTick + 0.5), dy = abs(sTick - si)*(LMAX - BASE)/20.;
  if (si >= 1. && si <= 20.) {
    bool major = si == 5. || si == 10. || si == 15. || si == 18.;
    float len = major ? 0.46 : 0.2, hw = major ? 0.95 : 0.65, th0 = 0.03, aa = uPix/RO;
    float inU = smoothstep(th0 - aa, th0 + aa, th)*smoothstep(th0 + len + aa, th0 + len - aa, th);
    float line = inU*clamp((hw - dy)/uPix + 0.5, 0., 1.);
    col += vec3(0.95, 0.97, 0.96)*line*0.55*(1. - 0.5*uDis); thr *= 1. - line*0.6;
  }
  int med = 0;
  crossI(rd, med, 1, n, col, thr, 1.1);
  p += rd*0.05;
  // ---- follow the transmitted path ----
  vec3 absG = vec3(0.0016, 0.0005, 0.0009);
  for (int ev = 0; ev < 11; ev++) {
    float best = 1e9; vec3 bn = vec3(0.); int bm = -1;   // bm: 0 out, 1 glass, 2 inner air, 3 liquid, 4 table, 5 cap
    if (med == 1) {
      float tt = cylT(p, rd, RO, true);
      if (tt > 1e-3) { vec3 qq = p + rd*tt; if (qq.y >= 0.) { best = tt; bn = vec3(qq.x/RO, 0., qq.z/RO); bm = qq.y > CB ? 5 : 0; } }
      if (rd.y < 0.) { tt = -p.y/rd.y; if (tt > 1e-3 && tt < best) { vec3 qq = p + rd*tt; if (dot(qq.xz, qq.xz) < RO*RO) { best = tt; bn = vec3(0., -1., 0.); bm = 4; } } }
      tt = cylT(p, rd, RI, false);
      if (tt > 1e-3 && tt < best) { vec3 qq = p + rd*tt; if (qq.y > BASE) { best = tt; bn = vec3(qq.x/RI, 0., qq.z/RI); bm = qq.y > CB ? 5 : qq.y < surfY(qq.xz) && liquidOn() > 0. ? 3 : 2; } }
      if (rd.y > 0. && p.y < BASE) { tt = (BASE - p.y)/rd.y; if (tt > 1e-3 && tt < best) { vec3 qq = p + rd*tt; if (dot(qq.xz, qq.xz) < RI*RI) { best = tt; bn = vec3(0., 1., 0.); bm = BASE < surfY(qq.xz) - 0.5 && liquidOn() > 0. ? 3 : 2; } } }
    } else if (med == 2) {
      float tt = cylT(p, rd, RI, true);
      vec3 qq = p + rd*tt;
      best = tt; bn = vec3(qq.x/RI, 0., qq.z/RI); bm = qq.y > CB ? 5 : 1;
      if (rd.y < 0.) { float tb = (BASE - p.y)/rd.y; if (tb > 0. && tb < best) { best = tb; bn = vec3(0., -1., 0.); bm = 1; } }
      float tsf = surfHit(p, rd, best, 1.);
      if (tsf > 0.) { best = tsf; bm = 3; bn = surfN((p + rd*tsf).xz); }
    } else if (med == 3) {
      float tt = cylT(p, rd, RI, true);
      best = tt; vec3 qq = p + rd*tt; bn = vec3(qq.x/RI, 0., qq.z/RI); bm = 1;
      if (rd.y < 0.) { float tb = (BASE - p.y)/rd.y; if (tb > 0. && tb < best) { best = tb; bn = vec3(0., -1., 0.); bm = 1; } }
      float tsf = surfHit(p, rd, best, -1.);
      if (tsf > 0.) { best = tsf; bm = 2; bn = surfN((p + rd*tsf).xz); }
    }
    if (bm < 0) break;
    if (med == 3) {
      // the dyed liquid: absorption of what the dye does not pass, plus its glow and the pale veils
      vec3 a = p + rd*best*0.3, b = p + rd*best*0.72;
      vec3 lc = 0.5*(liqCol(a) + liqCol(b));
      float wv = 0.5*(wisp(a) + wisp(b));
      float lift = 1. + 0.35*smoothstep(BASE + 140., BASE, 0.5*(a.y + b.y));   // light piped up from the base
      lift *= 0.84 + 0.28*(0.5 - 0.5*clamp((a.x + b.x)*0.5/RI, -1., 1.));      // the key light comes from the left: a rounder column
      vec3 tr = exp(-((vec3(1.) - lc)*0.032 + 0.001)*best);
      vec3 emit = lc*(0.98*lift + 0.6*wv) + mix(lc, vec3(1.), 0.3)*wv*0.1;
      col += thr*emit*(1. - exp(-best*0.016))*(1. - 0.8*uDis);
      if (uBloom > 0.) {
        float yb = BASE - 40. + (uLevel - BASE + 90.)*uBloom, bl = 0.;
        for (int k = 0; k < 3; k++) { vec3 s3 = p + rd*best*(0.2 + 0.3*float(k)); bl += exp(-pow((s3.y - yb)/22., 2.)); }
        col += thr*mix(lc, vec3(1.), 0.55)*bl*0.42*sin(PI*uBloom)*(1. - exp(-best*0.012));
      }
      thr *= mix(tr, vec3(dot(tr, vec3(0.3, 0.5, 0.2))), 0.85*uDis);
    } else if (med == 1) {
      thr *= exp(-absG*best);
      // the heavy base glows with light piped down from the liquid
      float my = p.y + rd.y*best*0.5;
      if (my < BASE + 2.) col += thr*liqCol(vec3(0., BASE + 8., 0.))*liquidOn()*0.0042*best*(1. - 0.8*uDis);
    }
    p += rd*best;
    if (bm == 5) { col += thr*vec3(0.035, 0.028, 0.018)*(1. - 0.5*uDis); return vec4(tone(col), 1.); }
    if (bm == 4) { col += thr*floorCol(p)*1.05; return vec4(tone(col), 1.); }
    // the meniscus: where the liquid meets the glass, a thin silver line with a dark lip; it glows on focus
    if (med == 1 && (bm == 2 || bm == 3) && bn.y == 0. && liquidOn() > 0.) {
      float dd = p.y - surfY(p.xz);
      float band = smoothstep(-3.6, -1.4, dd)*smoothstep(2., 0.2, dd);
      float under = exp(-pow((dd + 5.)/2.4, 2.));
      vec3 lc = liqCol(vec3(p.x, uLevel - 4., p.z));
      col += thr*band*(vec3(0.8, 0.86, 0.84)*0.75 + mix(lc, vec3(1.), 0.3)*(0.25 + uFocus*1.5));
      thr *= (1. - band*0.8)*(1. - under*0.3);
    }
    crossI(rd, med, bm, bn, col, thr, 1.0);
    if (med == 0) { col += thr*bgCol(p, rd); return vec4(tone(col), 1.); }
    p += rd*0.04;
  }
  col += thr*uP;
  return vec4(tone(col), 1.);
}

void main(){
  vec4 acc = vec4(0.);
  for (int s = 0; s < 4; s++) {
    if (s >= uSpp) break;
    vec2 j = uSpp == 1 ? vec2(0.) : vec2(fract(0.25 + 0.5*float(s) + 0.125*float(s/2)), fract(0.125 + 0.25*float(s) + 0.5*float(s/2))) - 0.5;
    acc += shade(gl_FragCoord.xy + j);
  }
  acc /= float(uSpp);
  vec4 c = acc;
  if (uDis > 0. && c.a > 0.) {
    float g = dot(c.rgb, vec3(0.3, 0.55, 0.15));
    c.rgb = mix(c.rgb, vec3(g)*0.9 + 0.05*c.a, uDis*0.6);
  }
  c.rgb += (h12(gl_FragCoord.xy + uSeed) - 0.5)/255.*c.a;
  o = c;
}`;

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };

// the camera, shared by both shaders, the DOM overlays, the pointer mapping and the CSS fallback (hero css px)
export class View {
  constructor() {
    this.fw = nrm(sub(TG, CAM)); this.rt = nrm(crs(this.fw, [0, 1, 0])); this.up = crs(this.rt, this.fw);
    this.cx = 0; this.cy = 0; this.fl = 1;
  }
  set(cx, cy, fl) { this.cx = cx; this.cy = cy; this.fl = fl; return this; }
  project(P) {
    const d = sub(P, CAM), z = dot(d, this.fw);
    return [this.cx + dot(d, this.rt) / z * this.fl, this.cy - dot(d, this.up) / z * this.fl];
  }
  cylBox(y0, y1, r, pad = 3) {
    let x0 = 1e9, ya = 1e9, x1 = -1e9, yb = -1e9;
    for (let k = 0; k < 32; k++) {
      const a = k / 32 * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r;
      for (const y of [y0, y1]) { const s = this.project([x, y, z]); x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); ya = Math.min(ya, s[1]); yb = Math.max(yb, s[1]); }
    }
    return [x0 - pad, ya - pad, x1 + pad, yb + pad];
  }
  // the whole vial (cap included)
  box(pad = 3) {
    const g = this.cylBox(0, CB, RO, pad), c = this.cylBox(CB, CT, RC, pad);
    return [Math.min(g[0], c[0]), Math.min(g[1], c[1]), Math.max(g[2], c[2]), Math.max(g[3], c[3])];
  }
}

export class Scene {
  constructor(canvas, bgCanvas) {
    this.canvas = canvas; this.bgCanvas = bgCanvas;
    const gl = this.gl = createGL(canvas);
    if (!gl) throw new Error('no webgl2');
    this.prog = program(gl, VIAL_FS).use();
    if (bgCanvas) {
      const g2 = this.gl2 = createGL(bgCanvas);
      if (!g2) throw new Error('no webgl2');
      this.bgProg = program(g2, BG_FS).use();
    }
    this.draws = 0; this.bgDraws = 0; this.px = 0;
    this.dpr = 1; this.ox = 0; this.oy = 0; this.w = 1; this.h = 1;
    this.bgScale = 0.5; this.bgW = 1; this.bgH = 1;
    this.page = [0.0168, 0.0185, 0.0177];
  }
  // the vial canvas covers hero box [ox, oy, ox + w, oy + h] (css px)
  size(ox, oy, w, h, dpr) {
    const c = this.canvas, W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    this.ox = ox; this.oy = oy; this.w = w; this.h = h; this.dpr = W / w;
  }
  // the background canvas covers the hero (w × h css px) at a low scale
  sizeBg(w, h, scale) {
    const c = this.bgCanvas; if (!c) return;
    const W = Math.max(1, Math.round(w * scale)), H = Math.max(1, Math.round(h * scale));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    this.bgW = w; this.bgH = h; this.bgScale = W / w;
  }
  uni(p, view, s, d, ox, oy, H) {
    p.f('uC', (view.cx - ox) * d, H - (view.cy - oy) * d).f('uFl', view.fl * d).f('uPix', 2700 / (view.fl * d))
      .f('uRo', ...CAM).f('uFw', ...view.fw).f('uRt', ...view.rt).f('uUp', ...view.up).f('uP', ...this.page)
      .f('uLevel', s.lev).f('uTx', s.tx).f('uTz', s.tz).f('uSwirl', s.swirl).f('uPhase', s.phase).f('uAmp', amp(s))
      .f('uSNew', s.sNew).f('uSOld', s.sOld).f('uMix', s.mix).f('uFill', s.fill).f('uGlow', ...s.glow)
      .f('uFocus', s.focus).f('uBloom', s.bloom).f('uDis', s.dis).f('uHalo', s.halo);
  }
  renderBg(view, s) {
    const gl = this.gl2; if (!gl || gl.isContextLost()) return;
    const c = this.bgCanvas, p = this.bgProg;
    gl.viewport(0, 0, c.width, c.height);
    this.uni(p, view, s, this.bgScale, 0, 0, c.height);
    p.f('uSeed', (this.bgDraws % 64) * 1.3).draw();
    this.bgDraws++;
  }
  // rects: null = everything, else hero css boxes [x0, y0, x1, y1]; spp 1 or 4
  render(view, s, rects, spp = 1) {
    const gl = this.gl, p = this.prog, d = this.dpr, c = this.canvas;
    if (gl.isContextLost()) return 0;
    gl.viewport(0, 0, c.width, c.height);
    this.uni(p, view, s, d, this.ox, this.oy, c.height);
    p.f('uSeed', (this.draws % 64) * 1.7).i('uSpp', spp);
    let px = 0;
    if (!rects) { gl.disable(gl.SCISSOR_TEST); p.draw(); px = c.width * c.height; }
    else {
      gl.enable(gl.SCISSOR_TEST);
      for (const r of rects) {
        const x0 = Math.max(0, Math.floor((r[0] - this.ox) * d)), x1 = Math.min(c.width, Math.ceil((r[2] - this.ox) * d));
        const y0 = Math.max(0, Math.floor((r[1] - this.oy) * d)), y1 = Math.min(c.height, Math.ceil((r[3] - this.oy) * d));
        if (x1 <= x0 || y1 <= y0) continue;
        gl.scissor(x0, c.height - y1, x1 - x0, y1 - y0); p.draw(); px += (x1 - x0) * (y1 - y0);
      }
    }
    this.px += px * spp; this.draws++;
    return px;
  }
}

// how far the surface can stray from the mean level (the shader searches only that slab)
export function amp(s) { return Math.abs(s.tx) * RI + Math.abs(s.tz) * RI + s.swirl * 10.6 + 2.8; }
