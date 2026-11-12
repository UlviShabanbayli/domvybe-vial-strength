// DV93 VIAL STRENGTH · the strength estimate. An entropy-style score (character pool × effective length) with
// penalties for repeats, keyboard/alphabet runs, common passwords and the user's own email name. 0 … 1.
// Nothing leaves the page: it is pure arithmetic on the string.

const COMMON = ['password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'football',
  'baseball', 'sunshine', 'princess', 'master', 'shadow', 'trustno1', 'abc123', '111111', '123123', '654321', 'superman',
  'starwars', 'login', 'hello', 'freedom', 'whatever', 'qazwsx', 'zaq12wsx', 'secret', 'verdance', 'changeme'];
const RUNS = ['abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '0123456789'];

const inRun = (a, b) => RUNS.some((r) => { const i = r.indexOf(a); return i >= 0 && (r[i + 1] === b || r[i - 1] === b); });

export const MARKS = [0.25, 0.5, 0.75, 0.9];             // WEAK, FAIR, GOOD, STRONG on the vial
export const VERY = 0.97;
export const MIN_OK = 0.5;                                // the form accepts Fair and up

export function score(pw, email = '') {
  const rules = { len: pw.length >= 12, case: /[a-z]/.test(pw) && /[A-Z]/.test(pw), num: /\d/.test(pw), sym: /[^A-Za-z0-9]/.test(pw) };
  if (!pw) return { s: 0, rules, flags: [] };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  const lb = Math.log2(Math.max(pool, 10));
  const low = pw.toLowerCase();
  let eff = 0;
  for (let i = 0; i < pw.length; i++) {
    const c = low[i], p = i ? low[i - 1] : '', pp = i > 1 ? low[i - 2] : '';
    eff += c === p ? 0.25 : pp && inRun(pp, p) && inRun(p, c) ? 0.35 : 1;   // only runs of three (abc, 123, qwe) count
  }
  let bits = eff * lb;
  const flags = [];
  for (const w of COMMON) if (low.includes(w)) { bits -= w.length * lb * 0.85; flags.push('common'); break; }
  const name = (email.split('@')[0] || '').toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 3);
  for (const n of name) if (low.includes(n)) { bits -= n.length * lb * 0.8; flags.push('email'); break; }
  const s = Math.max(0.03, Math.min(1, bits / 120));
  return { s, rules, flags };
}

export function label(s, empty) {
  if (empty) return 'Empty';
  if (s >= VERY) return 'Very strong';
  if (s >= MARKS[3]) return 'Strong';
  if (s >= MARKS[2]) return 'Good';
  if (s >= MARKS[1]) return 'Fair';
  if (s >= MARKS[0]) return 'Weak';
  return 'Too weak';
}

// the liquid's colour ramp (linear RGB), shared with the shader: ruby → amber → lime → green → emerald → teal-emerald
export const STOPS = [
  [0.0, [0.62, 0.012, 0.05]],
  [0.28, [0.95, 0.2, 0.015]],
  [0.52, [0.62, 0.62, 0.012]],
  [0.72, [0.12, 0.6, 0.02]],
  [0.9, [0.012, 0.6, 0.24]],
  [1.0, [0.008, 0.5, 0.42]],
];
export function colAt(s) {
  s = Math.max(0, Math.min(1, s));
  for (let i = 1; i < STOPS.length; i++) if (s <= STOPS[i][0]) {
    const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], k = (s - a) / (b - a);
    return ca.map((x, j) => x + (cb[j] - x) * k);
  }
  return STOPS[STOPS.length - 1][1].slice();
}
// a readable text/accent colour for the ramp on the dark page (sRGB hex, ≥ 4.5:1 on #232524)
export function accentHex(s) {
  const c = colAt(s), m = Math.max(...c);
  return '#' + c.map((x) => {
    const v = Math.pow(Math.max(0, x / m), 1 / 2.2);      // normalised hue, display space
    return Math.round(Math.min(1, 0.22 + v * 0.76) * 255).toString(16).padStart(2, '0');
  }).join('');
}
