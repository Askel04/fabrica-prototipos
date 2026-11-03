// Camisetas y dorsales: solo afectan al dibujo (por dentro los equipos siguen siendo red/blue).
import { CONFIG as C } from './config.js';

export const kitById = (id) => C.KITS.find((k) => k.id === id) || C.KITS[0];

// pares que se confunden aunque estén lejos en RGB
const CLASH = new Set(['blanco|celeste', 'amarillo|naranja', 'rojo|naranja']);

export function kitsClash(a, b) {
  if (a === b) return true;
  if (CLASH.has(`${a}|${b}`) || CLASH.has(`${b}|${a}`)) return true;
  const ka = kitById(a).body, kb = kitById(b).body;
  const d = Math.hypot(((ka >> 16) & 255) - ((kb >> 16) & 255), ((ka >> 8) & 255) - ((kb >> 8) & 255), (ka & 255) - (kb & 255));
  return d < 110;
}

// camiseta del rival: una al azar que no choque con la propia
export function rivalKit(mine, rng = Math.random) {
  const ok = C.KITS.filter((k) => !kitsClash(mine, k.id));
  return ok[Math.floor(rng() * ok.length)].id;
}

// siguiente camiseta (en orden) que no choque con `other`
export function nextKit(cur, other) {
  const ids = C.KITS.map((k) => k.id);
  let i = ids.indexOf(cur);
  for (let n = 0; n < ids.length; n++) {
    i = (i + 1) % ids.length;
    if (!kitsClash(ids[i], other)) return ids[i];
  }
  return cur;
}

export const clampNumber = (n) => Math.min(99, Math.max(1, Math.round(Number(n) || 10)));

// dorsales de un equipo: los pedidos (null = bot) sin repetir; los que faltan, al azar en 1–99
export function pickNumbers(wanted, rng = Math.random) {
  const used = new Set();
  const out = wanted.map((w) => {
    if (w == null) return null;
    let n = clampNumber(w);
    if (used.has(n)) n = null; // repetido: recibe uno libre
    if (n) used.add(n);
    return n;
  });
  return out.map((n) => {
    if (n) return n;
    let r;
    do r = 1 + Math.floor(rng() * 99); while (used.has(r));
    used.add(r);
    return r;
  });
}

export const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
