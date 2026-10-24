// Evaluación del juego (las "utilidades"): amenaza de cada zona, trayectoria del balón
// y carrera de pase/tiro (¿llega antes el receptor o un rival?).
import { CONFIG as C } from '../config.js';
import { CONTACT, TOP_SPEED, norm, segDist } from './skills.js';

const W = C.FIELD_W, H = C.FIELD_H, G = C.GOAL_HALF;
export const KICK_SPEED = C.KICK_STRENGTH * C.BALL_INV_MASS;
export const PUSH_SPEED = 2.2; // velocidad típica del balón tras un empujón en carrera

// Amenaza (tipo xT): 0..1 según distancia y ángulo a la portería que se ataca.
export function threat(x, y, attack) {
  const gx = attack * W;
  const d = Math.hypot(gx - x, y);
  const centred = 1 - 0.5 * Math.min(1, Math.abs(y) / H);
  return Math.exp(-d / 230) * centred;
}

// Trayectoria del balón lanzado desde (x, y) hacia (tx, ty) a cierta velocidad.
// Rebota en las bandas y en el fondo (salvo la boca de gol). Devuelve puntos cada 2 ticks.
export function ballPath(x, y, tx, ty, speed, maxT = 90) {
  let [vx, vy] = norm(tx - x, ty - y);
  vx *= speed;
  vy *= speed;
  const r = C.BALL_RADIUS;
  const e = C.BALL_BCOEF * C.WALL_BCOEF;
  const pts = [];
  let goal = 0;
  for (let t = 1; t <= maxT; t++) {
    vx *= C.BALL_DAMPING;
    vy *= C.BALL_DAMPING;
    x += vx;
    y += vy;
    if (y < -H + r) { y = -H + r; vy = -vy * e; }
    if (y > H - r) { y = H - r; vy = -vy * e; }
    if (Math.abs(x) > W - r) {
      if (Math.abs(y) < G) { goal = Math.sign(x); pts.push({ t, x, y, goal }); break; }
      x = Math.sign(x) * (W - r);
      vx = -vx * e;
    }
    if (t % 2 === 0) pts.push({ t, x, y, goal: 0 });
    if (vx * vx + vy * vy < 0.05) break;
  }
  return pts;
}

// ticks que tarda un jugador en tocar un punto (con un pequeño retardo de reacción)
export function reachTime(p, x, y, react = 6) {
  const d = Math.max(0, Math.hypot(x - p.disc.x, y - p.disc.y) - CONTACT);
  return d / TOP_SPEED + react;
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// Carrera de pase: ¿quién toca antes el balón en su trayectoria, el receptor o un rival?
export function passRace(path, receiver, opps, oppReact = 6) {
  let tR = Infinity, at = null, tO = Infinity;
  for (const pt of path) {
    if (tR === Infinity && reachTime(receiver, pt.x, pt.y, 4) <= pt.t) {
      tR = pt.t;
      at = pt;
    }
    if (tO === Infinity) {
      for (const o of opps) if (reachTime(o, pt.x, pt.y, oppReact) <= pt.t) { tO = pt.t; break; }
    }
    if (tR !== Infinity) break;
  }
  if (!at) at = path[path.length - 1] || { x: receiver.disc.x, y: receiver.disc.y, t: 90 };
  const margin = Math.min(tO, 120) - Math.min(tR, 120);
  return { p: tR === Infinity ? 0.05 : sigmoid(margin / 5), x: at.x, y: at.y, t: tR };
}

// Tiro: probabilidad de que el balón cruce la línea de gol antes de que un rival lo toque.
export function shotChance(path, opps, attack) {
  const end = path[path.length - 1];
  if (!end || end.goal !== attack) return 0;
  let tO = Infinity;
  for (const pt of path) {
    for (const o of opps) if (reachTime(o, pt.x, pt.y, 3) <= pt.t) { tO = pt.t; break; }
    if (tO !== Infinity) break;
  }
  return tO === Infinity ? 0.95 : sigmoid((tO - end.t) / 4);
}

// Probabilidad rápida de que un pase a (x, y) llegue (línea libre de rivales y distancia razonable).
export function laneProb(bx, by, x, y, opps) {
  let clear = Infinity;
  for (const o of opps) clear = Math.min(clear, segDist(o.disc.x, o.disc.y, bx, by, x, y) - o.disc.r - C.BALL_RADIUS);
  const d = Math.hypot(x - bx, y - by);
  return sigmoid((clear - 6) / 6) * (d < 280 ? 1 : 0.6);
}
