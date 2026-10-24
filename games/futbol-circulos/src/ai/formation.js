// Formación zonal para equipos grandes (5v5): además del 1.º (el que va al balón), cada jugador
// tiene un puesto con su zona. El bloque bascula con el balón (como en los juegos de fútbol), así
// siempre hay alguien en cada banda y a cada altura y no se forma una bola alrededor del balón.
// Puestos 2-1-2 sin portero: LI/LD (atrás), MC (medio), EI/ED (arriba, abiertos).

// Puntos base por fase en el marco del equipo: x en unidades de W (positivo = hacia la portería
// rival), y en unidades de H. prio: lo que cuesta dejar el puesto vacío.
const BASE = {
  attack: { LI: [-0.4, -0.5], LD: [-0.4, 0.5], MC: [0.0, 0], EI: [0.5, -0.7], ED: [0.5, 0.7] },
  loose: { LI: [-0.6, -0.48], LD: [-0.6, 0.48], MC: [-0.25, 0], EI: [0.1, -0.72], ED: [0.1, 0.72] },
  defend: { LI: [-0.72, -0.4], LD: [-0.72, 0.4], MC: [-0.45, 0], EI: [-0.2, -0.65], ED: [-0.2, 0.65] },
};
const PRIO = { LI: 220, LD: 220, MC: 140, EI: 70, ED: 70 };
// cuánto sigue el bloque al balón (x, y) y cuánto se estrecha, por fase
const SHIFT = { attack: [0.4, 0.2, 0], loose: [0.45, 0.25, 0.05], defend: [0.45, 0.3, 0.15] };
export const DEFENDERS = new Set(['LI', 'LD', 'MC']);

// Punto del puesto `name` con el balón en (bx, by), para un equipo que ataca hacia `a`.
export function slotPoint(name, kind, ball, a, W, H, k) {
  const [fx, fy] = BASE[kind][name];
  const [sx, sy, squeeze] = SHIFT[kind];
  const bx = ball.x * a;
  let x = fx * W + sx * bx;
  const y = fy * H * (1 - squeeze) + sy * ball.y;
  // los de atrás siempre por detrás del balón (lado de su portería)
  if (DEFENDERS.has(name)) x = Math.min(x, bx - (kind === 'attack' ? 60 : 45) * k);
  x = Math.max(-W + 30, Math.min(W - 30, x));
  return [a * x, Math.max(-H + 25, Math.min(H - 25, y))];
}

// Reparte puestos entre `players` (sin el 1.º) minimizando la distancia a recorrer más el coste de
// los puestos que quedan vacíos (menor cerca del 1.º, que ya ocupa esa zona). Con histéresis.
// Devuelve Map jugador → nombre de puesto.
export function assignSlots(players, kind, ball, a, W, H, k, first, prev) {
  const names = Object.keys(BASE[kind]);
  const pts = Object.fromEntries(names.map((n) => [n, slotPoint(n, kind, ball, a, W, H, k)]));
  const cost = (p, n) => {
    const [x, y] = pts[n];
    let c = Math.hypot(p.disc.x - x, p.disc.y - y);
    if (prev.get(p) === n) c -= 50 * k; // histéresis
    if (p.human) c *= 0.3; // al humano no se le mueve: su puesto es el que le queda cerca
    return c;
  };
  const empty = (n) => {
    const [x, y] = pts[n];
    const d = first ? Math.hypot(first.disc.x - x, first.disc.y - y) : 1e9;
    return PRIO[n] * Math.min(1, d / (160 * k));
  };
  let best = null, bestC = Infinity;
  const used = new Set();
  const cur = [];
  const rec = (i, c) => {
    if (c >= bestC) return;
    if (i === players.length) {
      const total = c + names.filter((n) => !used.has(n)).reduce((s, n) => s + empty(n), 0);
      if (total < bestC) { bestC = total; best = [...cur]; }
      return;
    }
    for (const n of names) {
      if (used.has(n)) continue;
      used.add(n); cur.push(n);
      rec(i + 1, c + cost(players[i], n));
      used.delete(n); cur.pop();
    }
  };
  rec(0, 0);
  return new Map(players.map((p, i) => [p, best ? best[i] : names[i % names.length]]));
}
