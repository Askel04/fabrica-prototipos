// Evaluación del juego: predicción del balón (como el motor), tiempos de intercepción,
// seguridad de pase por tiempos de llegada, hueco angular a puerta y amenaza de cada zona.
import { CONFIG as C } from '../config.js';
import { CONTACT, norm, segDist } from './skills.js';

// medidas del campo actual (las actualiza syncEvaluate al cambiar de estadio)
let W = C.FIELD_W, H = C.FIELD_H, G = C.GOAL_HALF;
export function syncEvaluate() {
  W = C.FIELD_W; H = C.FIELD_H; G = C.GOAL_HALF;
}
const RB = C.BALL_RADIUS;
export const KICK_SPEED = C.KICK_STRENGTH * C.BALL_INV_MASS;
export const PUSH_SPEED = 2.2; // velocidad típica del balón tras un empujón en carrera

// Distancia que recorre un jugador partiendo de parado en t ticks (integra igual que el motor).
const REACH = [0];
{
  let v = 0, d = 0;
  for (let t = 1; t <= 240; t++) {
    v = (v + C.PLAYER_ACCEL) * C.PLAYER_DAMPING;
    d += v;
    REACH.push(d);
  }
}
const DP = C.PLAYER_DAMPING;
const COAST = REACH.map((_, i) => (DP * (1 - DP ** i)) / (1 - DP)); // lo que aporta la velocidad inicial
// distancia alcanzable en t ticks con velocidad inicial v0 hacia el objetivo
export function reach(t, v0 = 0) {
  const i = Math.min(240, Math.max(0, Math.round(t)));
  return REACH[i] + Math.max(0, v0) * COAST[i];
}

// ticks que tarda un jugador en tocar un punto (borde con borde)
export function timeToReach(p, x, y) {
  const d = p.disc;
  const [ux, uy, l] = norm(x - d.x, y - d.y);
  const need = Math.max(0, l - CONTACT);
  if (need === 0) return 0;
  const v0 = d.vx * ux + d.vy * uy;
  const v = Math.max(0, v0);
  let lo = 0, hi = 240;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (REACH[mid] + v * COAST[mid] >= need) hi = mid; else lo = mid;
  }
  return hi;
}

// Trayectoria del balón tick a tick: damping, rebotes en bandas y fondo, boca de gol abierta.
export function trajectory(x, y, vx, vy, maxT = 120) {
  const e = C.BALL_BCOEF * C.WALL_BCOEF;
  const pts = [{ t: 0, x, y, goal: 0 }];
  for (let t = 1; t <= maxT; t++) {
    vx *= C.BALL_DAMPING;
    vy *= C.BALL_DAMPING;
    x += vx;
    y += vy;
    if (y < -H + RB) { y = -H + RB; vy = -vy * e; }
    if (y > H - RB) { y = H - RB; vy = -vy * e; }
    if (Math.abs(x) > W - RB) {
      if (Math.abs(y) < G) { pts.push({ t, x, y, goal: Math.sign(x) }); break; }
      x = Math.sign(x) * (W - RB);
      vx = -vx * e;
    }
    pts.push({ t, x, y, goal: 0 });
    if (vx * vx + vy * vy < 0.02) break;
  }
  return pts;
}

// trayectoria de un balón lanzado desde (x, y) hacia (tx, ty)
export function shotPath(x, y, tx, ty, speed, maxT = 120) {
  const [ux, uy] = norm(tx - x, ty - y);
  return trajectory(x, y, ux * speed, uy * speed, maxT);
}

// Tiempo de intercepción dentro del horizonte de predicción. Más allá del horizonte la IA
// "no lo ve venir": va a donde está el balón ahora (es lo que hace llegar tarde a los niveles bajos).
export function intercept(p, path, horizon) {
  const last = Math.min(path.length - 1, horizon);
  for (let i = 0; i <= last; i += 2) {
    const pt = path[i];
    if (timeToReach(p, pt.x, pt.y) <= pt.t) return { t: pt.t, x: pt.x, y: pt.y, seen: true };
  }
  const now = path[0];
  const end = path[last];
  return { t: Math.max(end.t, timeToReach(p, now.x, now.y)) + 10, x: now.x, y: now.y, seen: false };
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// Seguridad de un pase (0..1): para cada rival, ¿llega a algún punto de la trayectoria antes que
// el balón llegue al receptor (más el margen de seguridad)? Devuelve también dónde recibe.
export function passSafety(path, receiver, opps, marginTicks) {
  let tR = Infinity, at = null;
  for (let i = 2; i < path.length; i += 2) {
    const pt = path[i];
    if (timeToReach(receiver, pt.x, pt.y) <= pt.t) { tR = pt.t; at = pt; break; }
  }
  if (!at) {
    at = path[path.length - 1];
    tR = Math.max(at.t, timeToReach(receiver, at.x, at.y));
  }
  let tO = Infinity;
  for (let i = 2; i < path.length && path[i].t <= tR; i += 2) {
    const pt = path[i];
    for (const o of opps) if (timeToReach(o, pt.x, pt.y) <= pt.t) { tO = pt.t; break; }
    if (tO !== Infinity) break;
  }
  const p = tO === Infinity ? 0.97 : sigmoid((tO - tR - marginTicks) / 4);
  return { p, x: at.x, y: at.y, t: tR };
}

// Hueco angular a puerta (como ShootToGoal de RoboCup SSL): se muestrean puntos entre postes,
// se marcan los libres (ningún rival llega a la trayectoria antes de que cruce la línea) y se
// apunta al centro del rango libre más ancho, lo más lejos posible del portero.
export function bestShot(ball, opps, attack, n = 9) {
  // Para cada punto de la portería: probabilidad de que el tiro pase sin que ningún rival lo toque.
  // El rival necesita reaccionar (REACT ticks) y el bloqueo es gradual (sigmoide), no todo o nada:
  // con 5 rivales y tiros largos el criterio estricto daba siempre "ningún hueco".
  const REACT = 8;
  const gx = attack * (W + 4);
  const lo = -G + RB + 4, hi = G - RB - 4;
  const ks = W / 370;
  let best = null;
  for (let i = 0; i < n; i++) {
    const gy = lo + ((hi - lo) * i) / (n - 1);
    const path = shotPath(ball.x, ball.y, gx, gy, KICK_SPEED);
    const end = path[path.length - 1];
    if (end.goal !== attack) continue;
    let free = 1;
    for (const o of opps) {
      let margin = -Infinity; // ventaja (ticks) del rival sobre el balón en el punto donde mejor llega
      for (let k = 2; k < path.length; k += 2) margin = Math.max(margin, path[k].t - (timeToReach(o, path[k].x, path[k].y) + REACT));
      free *= 1 - 1 / (1 + Math.exp(-margin / 4)); // margin > 0 → el rival llega: bloqueo probable
    }
    // a igualdad, mejor cerca de los palos (lejos del centro, donde suele estar el último hombre)
    const s = free * (0.85 + 0.15 * Math.abs(gy) / G);
    if (!best || s > best.s) best = { s, free, gy };
  }
  const dist = Math.hypot(gx - ball.x, ball.y);
  if (!best) return { quality: 0, x: gx, y: 0, dist };
  // menos calidad desde lejos y desde ángulos cerrados
  const quality = best.free * Math.exp(-Math.max(0, dist - 150 * ks) / (300 * ks));
  return { quality, x: gx, y: best.gy, dist };
}

// Amenaza (tipo xT): 0..1 según distancia y ángulo a la portería que se ataca.
export function threat(x, y, attack) {
  const d = Math.hypot(attack * W - x, y);
  const centred = 1 - 0.5 * Math.min(1, Math.abs(y) / H);
  return Math.exp(-d / (230 * (W / 370))) * centred;
}

// Probabilidad rápida de que un pase a (x, y) llegue (línea libre de rivales y distancia razonable).
export function laneProb(bx, by, x, y, opps) {
  let clear = Infinity;
  for (const o of opps) clear = Math.min(clear, segDist(o.disc.x, o.disc.y, bx, by, x, y) - o.disc.r - RB);
  const d = Math.hypot(x - bx, y - by);
  return sigmoid((clear - 6) / 6) * (d < 280 ? 1 : 0.6);
}
