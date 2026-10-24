// Puntos de apoyo (desmarque), al estilo del SupportSpotCalculator de Buckland con control del
// espacio por tiempo de llegada (pitch control de Spearman). Se puntúa una rejilla de candidatos
// más muestras alrededor de cada jugador y se reparten los mejores sin repetir zona.
import { CONFIG as C } from '../config.js';
import { clampField } from './skills.js';
import { timeToReach, threat, laneProb, KICK_SPEED, PUSH_SPEED } from './evaluate.js';

let W = C.FIELD_W, H = C.FIELD_H;
export function syncSupport() {
  W = C.FIELD_W; H = C.FIELD_H;
}
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// ¿Llega un pase desde el balón hasta S antes que cualquier rival (con margen)? 0..1
// Analítico: para cada rival, el punto de la línea de pase más cercano a él, cuándo pasa el balón
// por ahí (recorrido con rozamiento) y cuándo llegaría el rival.
const DB = C.BALL_DAMPING;
function ballTimeTo(dist, speed) {
  const k = 1 - (dist * (1 - DB)) / (speed * DB);
  return k <= 0 ? Infinity : Math.log(k) / Math.log(DB);
}
export function passSafetyTo(ball, x, y, opps, marginTicks) {
  const ex = x - ball.x, ey = y - ball.y;
  const d = Math.hypot(ex, ey) || 1;
  const speed = d > 130 ? KICK_SPEED : PUSH_SPEED;
  let lead = Infinity;
  for (const o of opps) {
    const t = Math.max(0, Math.min(1, ((o.disc.x - ball.x) * ex + (o.disc.y - ball.y) * ey) / (d * d)));
    const qx = ball.x + ex * t, qy = ball.y + ey * t;
    const tB = ballTimeTo(d * t, speed);
    if (tB === Infinity) continue;
    lead = Math.min(lead, timeToReach(o, qx, qy) - tB);
  }
  if (ballTimeTo(d, speed) === Infinity) return 0.2; // no llega con esa fuerza
  if (lead === Infinity) return 0.97;
  return sigmoid((lead - marginTicks) / 4) * (d < 300 ? 1 : 0.7);
}

// Lo que no depende del jugador (seguridad del pase, tiro, llegada de rivales) se calcula una vez por punto.
function pointInfo(brain, x, y, ball, cache) {
  const key = `${Math.round(x)},${Math.round(y)}`;
  let info = cache?.get(key);
  if (!info) {
    const opps = brain.oppsV;
    info = {
      pass: passSafetyTo(ball, x, y, opps, brain.P.passMarginTicks),
      shot: threat(x, y, brain.attack) * laneProb(x, y, brain.attack * W, 0, opps),
      tOpp: Math.min(...opps.map((o) => timeToReach(o, x, y))),
    };
    cache?.set(key, info);
  }
  return info;
}

export function scoreSpot(brain, p, x, y, ball, taken, cache = null) {
  const { w, attack: a, P } = brain;
  const dCarrier = Math.hypot(x - ball.x, y - ball.y);
  const { pass, shot, tOpp } = pointInfo(brain, x, y, ball, cache);
  const ks = W / 370; // distancia ideal de pase escalada con el campo
  const dist = Math.exp(-((dCarrier - 160 * ks) ** 2) / (2 * (70 * ks) ** 2));
  const tMe = timeToReach(p, x, y);
  const space = sigmoid((tOpp - tMe) / 8);
  const progress = (x * a + W) / (2 * W);
  let crowd = 0;
  for (const q of brain.players) if (q !== p) crowd += Math.max(0, 1 - Math.hypot(q.disc.x - x, q.disc.y - y) / 100);
  for (const t of taken) crowd += Math.max(0, 1 - Math.hypot(t.x - x, t.y - y) / 100);
    let outside = 0;
  if (p.job === 'support3') {
    // 3.º con posesión: por detrás del balón, sin pasar de su profundidad máxima ni del último rival
    const lastOpp = Math.min(...brain.oppsV.map((o) => o.disc.x * a));
    const maxX = Math.max(-W + 40, Math.min(ball.x * a - 90, -W + P.lastManDepth * (W / 370), lastOpp - 30));
    brain.thirdMaxX = maxX;
    outside = Math.max(0, x * a - maxX) / 25;
  }
  const move = Math.hypot(x - p.disc.x, y - p.disc.y) / 300;
  return w.supPass * pass + w.supShot * shot + w.supDist * dist + w.supSpace * space +
    w.supAdv * progress - w.supMate * crowd - w.supRole * outside - w.supMove * move;
}

// Reparte puntos de apoyo entre `supporters`. Fácil (sin muestras): zonas fijas detrás del balón.
export function assignSpots(brain, supporters, ball) {
  const { P, attack: a } = brain;
  const result = new Map();
  if (P.supportSamples === 0) {
    supporters.forEach((p, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const third = p.job === 'support3';
      const x = third ? ball.x - a * 140 : ball.x - a * 50;
      result.set(p, { x, y: third ? ball.y * 0.3 : ball.y + side * 80, s: 0 });
    });
    for (const [p, s] of result) [s.x, s.y] = clampField(s.x, s.y, 25);
    return result;
  }
  // rejilla repartida por la zona útil + muestras alrededor de cada jugador
  const n = P.supportSamples;
  const cols = Math.max(3, Math.round(Math.sqrt(n * 2.2))), rows = Math.max(2, Math.round(n / cols));
  const cands = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      cands.push(clampField(-W + 30 + ((2 * W - 60) * (i + 0.5)) / cols, -H + 25 + ((2 * H - 50) * (j + 0.5)) / rows, 25));
    }
  }
  for (const p of supporters) {
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      cands.push(clampField(p.disc.x + Math.cos(ang) * 60, p.disc.y + Math.sin(ang) * 60, 25));
    }
  }
  // asignación voraz: el mejor par (jugador, punto) primero
  const taken = [];
  const left = [...supporters];
  const cache = new Map();
  const scored = new Map(left.map((p) => [p, cands.map(([x, y]) => ({ x, y, s: scoreSpot(brain, p, x, y, ball, [], cache) }))]));
  const shown = left.find((p) => p.job === 'support') || left[0];
  brain.debugSpots = scored.get(shown) || null;
  while (left.length) {
    let bestP = null, best = null;
    for (const p of left) {
      for (const c of scored.get(p)) {
        if (taken.some((t) => Math.hypot(t.x - c.x, t.y - c.y) < 70)) continue;
        if (!best || c.s > best.s) { best = c; bestP = p; }
      }
    }
    if (!bestP) break;
    // histéresis: quedarse con el punto anterior si el nuevo no es claramente mejor (> 12 %)
    const prev = brain.spots.get(bestP);
    let chosen = best;
    if (prev && !taken.some((t) => Math.hypot(t.x - prev.x, t.y - prev.y) < 70)) {
      const prevS = scoreSpot(brain, bestP, prev.x, prev.y, ball, taken, cache);
      if (best.s - prevS < 0.12 * Math.abs(best.s)) chosen = { x: prev.x, y: prev.y, s: prevS };
    }
    // límite duro del líbero (la penalización sola no basta si todos los puntos están fuera)
    if (bestP.job === 'support3' && brain.thirdMaxX !== undefined && chosen.x * a > brain.thirdMaxX) {
      chosen = { ...chosen, x: brain.thirdMaxX * a };
    }
    result.set(bestP, chosen);
    brain.spots.set(bestP, chosen);
    taken.push(chosen);
    left.splice(left.indexOf(bestP), 1);
  }
  return result;
}
