// Habilidades motoras y geometría básica de la IA (conducir, chutar a un punto, despejar...).
import { CONFIG as C } from '../config.js';

// velocidad punta aproximada de un jugador (v = a·d / (1 - d))
export const TOP_SPEED = (C.PLAYER_ACCEL * C.PLAYER_DAMPING) / (1 - C.PLAYER_DAMPING);
export const CONTACT = C.PLAYER_RADIUS + C.BALL_RADIUS;

export function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l, l];
}

export function edgeToBall(p, ball) {
  return Math.hypot(p.disc.x - ball.x, p.disc.y - ball.y) - CONTACT;
}

export function rand(k) {
  return (Math.random() * 2 - 1) * k;
}

// distancia de un punto al segmento a-b
export function segDist(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const l2 = ex * ex + ey * ey || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2));
  return Math.hypot(px - ax - ex * t, py - ay - ey * t);
}

// holgura de la línea de pase/tiro: distancia libre mínima entre el balón y los rivales
export function laneClearance(ax, ay, bx, by, opps) {
  let min = Infinity;
  for (const o of opps) {
    const d = segDist(o.disc.x, o.disc.y, ax, ay, bx, by) - o.disc.r - C.BALL_RADIUS;
    if (d < min) min = d;
  }
  return min;
}

export function nearestDist(x, y, players) {
  let min = Infinity;
  for (const o of players) min = Math.min(min, Math.hypot(o.disc.x - x, o.disc.y - y));
  return min;
}

export function clampField(x, y, m = 20) {
  return [
    Math.max(-C.FIELD_W + m, Math.min(C.FIELD_W - m, x)),
    Math.max(-C.FIELD_H + m, Math.min(C.FIELD_H - m, y)),
  ];
}

// ir a un punto frenando al llegar y compensando la inercia
export function steer(p, tx, ty, speed = 1, arrive = C.AI_ARRIVE) {
  const d = p.disc;
  const [ex, ey] = norm(tx - d.x - d.vx * 8, ty - d.y - d.vy * 8);
  const m = Math.min(1, Math.hypot(tx - d.x, ty - d.y) / arrive) * speed;
  p.input.x = ex * m;
  p.input.y = ey * m;
}

// posición del balón dentro de t ticks (sin paredes)
export function predictBall(ball, t) {
  const d = C.BALL_DAMPING;
  const k = (d * (1 - Math.pow(d, t))) / (1 - d);
  return clampField(ball.x + ball.vx * k, ball.y + ball.vy * k, C.BALL_RADIUS);
}

// primer punto de la trayectoria del balón al que llega el jugador
export function intercept(p, ball, maxT = 120) {
  for (let t = 0; t <= maxT; t += 3) {
    const [x, y] = predictBall(ball, t);
    const need = Math.max(0, Math.hypot(x - p.disc.x, y - p.disc.y) - CONTACT) / TOP_SPEED + 8;
    if (need <= t) return { t, x, y };
  }
  const [x, y] = predictBall(ball, maxT);
  return { t: maxT + Math.hypot(x - p.disc.x, y - p.disc.y) / TOP_SPEED, x, y };
}

// ángulo entre jugador→balón y balón→objetivo: 0 = ya está detrás, listo para chutar
export function approachAngle(p, ball, tx, ty) {
  const [ax, ay] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
  const [bx, by] = norm(tx - ball.x, ty - ball.y);
  return Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by)));
}

// ¿Chutar ahora (en la dirección jugador→balón) no manda el balón a la propia portería?
export function safeKickDir(p, ball) {
  const [dx, dy] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
  const own = -p.attack * C.FIELD_W;
  // pegado a la línea de fondo propia solo vale chutar claramente hacia fuera
  if (Math.abs(ball.x - own) < 45) return dx * p.attack > 0.25;
  if (dx * p.attack >= 0) return true;
  const t = (own - ball.x) / dx;
  const y = ball.y + dy * t;
  return Math.abs(y) > C.GOAL_HALF + 45;
}

// Despejar desde donde esté: correr al balón y chutar si es seguro
export function clearNow(p, ball) {
  const [bx, by, bl] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
  p.input.x = bx;
  p.input.y = by;
  p.input.kick = bl - CONTACT <= C.KICK_DIST + 2 && p.kickArmed;
}

// Llevar el balón hacia (tx, ty): rodearlo, colocarse detrás y empujar ('push') o chutar ('kick').
export function ballTo(p, ball, tx, ty, { mode = 'push', aimErr = 0, kickAngle = 0.3, speed = 1 } = {}) {
  const d = p.disc;
  const ang = Math.atan2(ty - ball.y, tx - ball.x) + aimErr;
  const nx = Math.cos(ang), ny = Math.sin(ang);
  const [bx, by, bl] = norm(ball.x - d.x, ball.y - d.y);
  const edge = bl - CONTACT;
  const along = (d.x - ball.x) * nx + (d.y - ball.y) * ny; // >0: delante del balón
  const px = -ny, py = nx;
  const lateral = (d.x - ball.x) * px + (d.y - ball.y) * py; // distancia a la línea de tiro
  let kick = false;
  if (along > -CONTACT * 0.5) {
    // delante o al lado del balón: rodearlo por el lado en el que estoy
    const side = lateral >= 0 ? 1 : -1;
    const off = CONTACT + 12;
    steer(p, ball.x - nx * off + px * side * off, ball.y - ny * off + py * side * off, speed, 10);
  } else if ((Math.abs(lateral) > CONTACT * 0.8 && along > -CONTACT * 2.5) ||
    (edge < 16 && Math.acos(Math.max(-1, Math.min(1, bx * nx + by * ny))) > Math.max(kickAngle * 1.5, 0.35))) {
    // detrás pero desplazado (o pegado y mal orientado): ir primero al punto de detrás del balón
    steer(p, ball.x - nx * (CONTACT + 6), ball.y - ny * (CONTACT + 6), speed, 10);
  } else {
    // en la línea: avanzar en la dirección buscada corrigiendo el desvío lateral
    const corr = Math.max(-1, Math.min(1, lateral / 10)) * 0.9;
    const [ix, iy] = norm(nx - px * corr, ny - py * corr);
    const aligned = Math.acos(Math.max(-1, Math.min(1, bx * nx + by * ny)));
    // muy cerca y aún desalineado: frenar para no empujar el balón hacia otro lado
    const s = edge < 6 && aligned > kickAngle ? speed * 0.4 : speed;
    p.input.x = ix * s;
    p.input.y = iy * s;
    if (mode === 'kick' && aligned < kickAngle && edge <= C.KICK_DIST + 2) kick = true;
  }
  p.input.kick = kick && p.kickArmed;
}
