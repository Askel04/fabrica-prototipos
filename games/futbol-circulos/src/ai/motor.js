// Habilidades motoras por planificación (fase 1 del plan de IA): antes de mover, el jugador ensaya
// decenas de secuencias de mando con la MISMA física del juego (jugador + balón + los que estén
// cerca) y ejecuta la que mejor cumple el objetivo: controlar, pasar/tirar, conducir, superar.
// Optimizador: entropía cruzada (CEM) sobre 3 nudos de dirección + el instante en que se pulsa el
// chute. Replanifica cada pocos ticks partiendo del plan anterior.
import { CONFIG as C } from '../config.js';
import { World, makeDisc } from '../physics.js';
import { trajectory, intercept, timeToReach } from './evaluate.js';
import { CONTACT, norm, steer, edgeToBall } from './skills.js';

const H = 40; // horizonte del ensayo por defecto (ticks); conducir mira más lejos (H_DRIB)
const H_DRIB = 56;
const KNOTS = 3; // nudos de mando (inicio, mitad, final), interpolados
const REPLAN = 3; // cada cuántos ticks se replanifica (con un rival cerca)
const REPLAN_CALM = 5; // sin rivales a menos de CALM_DIST del balón: el plan aguanta más
const NO_KICK = 1e9;
const CALM_DIST = 120;
// Tope de ensayos por tick entre todos los jugadores (evita tirones cuando varios replanifican a la
// vez): agotado, quien tenga plan lo sigue un tick más y quien no lo tenga planifica en pequeño.
const TICK_BUDGET = 50;
let spent = 0;
export function motorTick() {
  spent = 0;
}

// ---------------- simulador de ensayo (misma física que el partido) ----------------
let world = null, worldKey = '';
const SP = makeDisc(0, 0, C.PLAYER_RADIUS, C.PLAYER_INV_MASS, C.PLAYER_DAMPING, C.PLAYER_BCOEF);
const SB = makeDisc(0, 0, C.BALL_RADIUS, C.BALL_INV_MASS, C.BALL_DAMPING, C.BALL_BCOEF);
SB.isBall = true;
const POOL = Array.from({ length: 10 }, () => makeDisc(0, 0, C.PLAYER_RADIUS, C.PLAYER_INV_MASS, 0.99, C.PLAYER_BCOEF));

function sandbox() {
  const key = `${C.FIELD_W},${C.FIELD_H},${C.GOAL_HALF}`;
  if (key !== worldKey) { world = new World(); worldKey = key; }
  return world;
}

// Estado inicial del ensayo: copia del jugador, el balón y los (como mucho 4) más cercanos, que son
// los que pueden intervenir en el horizonte de ensayo (menos discos = ensayos más baratos).
const NEAR_MAX = 4, NEAR_DIST = 120;
function snapshot(p, ball, others) {
  const cand = [];
  for (const o of others) {
    if (o === p) continue;
    const d = Math.min(Math.hypot(o.disc.x - ball.x, o.disc.y - ball.y), Math.hypot(o.disc.x - p.disc.x, o.disc.y - p.disc.y));
    if (d < NEAR_DIST) cand.push([d, o]);
  }
  const near = cand.sort((a, b) => a[0] - b[0]).slice(0, NEAR_MAX).map((c) => c[1]);
  return {
    ball, // referencia al balón real (para los planes-controlador al ejecutarse)
    p: { x: p.disc.x, y: p.disc.y, vx: p.disc.vx, vy: p.disc.vy, armed: p.kickArmed },
    b: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy },
    o: near.map((o) => ({ x: o.disc.x, y: o.disc.y, vx: o.disc.vx, vy: o.disc.vy, team: o.team, ref: o })),
  };
}

// mando del plan en el tick t (interpolación lineal entre nudos, módulo ≤ 1); h = horizonte del plan
function planInput(plan, t, out, h = H) {
  const f = (Math.min(t, h) / h) * (KNOTS - 1);
  const i = Math.min(KNOTS - 2, Math.floor(f)), w = f - i;
  let x = plan[i * 2] * (1 - w) + plan[i * 2 + 2] * w;
  let y = plan[i * 2 + 1] * (1 - w) + plan[i * 2 + 3] * w;
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  out[0] = x; out[1] = y;
}

const inp = [0, 0];
// Ensaya `plan` durante H ticks y devuelve su coste (lo calcula `obj`).
// model(o, ball): mando que se supone a cada jugador cercano (por defecto, sigue su inercia).
function rollout(s, plan, obj, h = H) {
  const w = sandbox();
  Object.assign(SP, { x: s.p.x, y: s.p.y, vx: s.p.vx, vy: s.p.vy });
  Object.assign(SB, { x: s.b.x, y: s.b.y, vx: s.b.vx, vy: s.b.vy });
  const discs = [SP, SB];
  for (let i = 0; i < s.o.length; i++) {
    const o = s.o[i], d = POOL[i];
    Object.assign(d, { x: o.x, y: o.y, vx: o.vx, vy: o.vy, damping: C.PLAYER_DAMPING });
    discs.push(d);
  }
  w.discs = discs;
  let armed = s.p.armed;
  const pol = plan.policy || null;
  const kickAt = pol ? 0 : plan[KNOTS * 2];
  obj.reset(s);
  for (let t = 0; t < h; t++) {
    let kick;
    if (pol) kick = pol(t, SP, SB, inp);
    else { planInput(plan, t, inp, h); kick = t >= kickAt; }
    const acc = kick ? C.PLAYER_KICK_ACCEL : C.PLAYER_ACCEL;
    SP.damping = kick ? C.PLAYER_KICK_DAMPING : C.PLAYER_DAMPING;
    SP.vx += inp[0] * acc;
    SP.vy += inp[1] * acc;
    let kicked = false;
    if (!kick) armed = true;
    else if (armed) {
      const dx = SB.x - SP.x, dy = SB.y - SP.y, dist = Math.hypot(dx, dy);
      if (dist - SP.r - SB.r <= C.KICK_DIST && dist > 0) {
        const k = C.KICK_STRENGTH * SB.invMass;
        SB.vx += (dx / dist) * k;
        SB.vy += (dy / dist) * k;
        armed = false;
        kicked = true;
      }
    }
    // los demás: el defensor que presiona va al balón por su lado; el resto sigue su inercia
    for (let i = 0; i < s.o.length; i++) if (obj.model) obj.model(POOL[i], s.o[i], SB);
    if (kicked) obj.onKick?.(t, SP, SB);
    w.step();
    if (obj.step(t, SP, SB) === false) break;
  }
  return obj.cost(SP, SB);
}

// ---------------- optimizador (entropía cruzada) ----------------
const DIM = KNOTS * 2 + 1;
function gaussian() {
  return Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
}

function optimize(s, obj, seeds, { pop = 18, elite = 5, iters = 2, kick = false, h = H } = {}) {
  let best = null, bestC = Infinity;
  const evalPlan = (plan) => {
    spent++;
    const c = rollout(s, plan, obj, h);
    if (c < bestC) { bestC = c; best = plan; }
    return c;
  };
  const scored = seeds.map((pl) => ({ pl, c: evalPlan(pl) })).filter((e) => !e.pl.policy);
  scored.sort((a, b) => a.c - b.c);
  const mean = Float64Array.from(scored[0].pl);
  const sig = new Float64Array(DIM).fill(0.6);
  sig[DIM - 1] = kick ? 10 : 0;
  if (!kick) mean[DIM - 1] = NO_KICK;
  for (let it = 0; it < iters; it++) {
    // optimización interrumpible: con el tope del tick agotado se queda con lo mejor hasta ahora
    // (la siguiente replanificación parte de este plan, así que el trabajo no se pierde)
    if (spent >= TICK_BUDGET) break;
    const cand = [];
    for (let k = 0; k < pop; k++) {
      const pl = new Float64Array(DIM);
      for (let d = 0; d < DIM; d++) pl[d] = mean[d] + sig[d] * gaussian();
      if (!kick) pl[DIM - 1] = NO_KICK;
      else pl[DIM - 1] = Math.max(0, pl[DIM - 1]);
      cand.push({ pl, c: evalPlan(pl) });
    }
    cand.push(...scored.slice(0, 2));
    cand.sort((a, b) => a.c - b.c);
    const el = cand.slice(0, elite);
    for (let d = 0; d < DIM; d++) {
      let m = 0;
      for (const e of el) m += e.pl[d];
      m /= el.length;
      let v = 0;
      for (const e of el) v += (e.pl[d] - m) ** 2;
      mean[d] = m;
      sig[d] = Math.max(d === DIM - 1 ? (kick ? 1 : 0) : 0.05, Math.sqrt(v / el.length) * 1.1);
    }
  }
  return { plan: best, cost: bestC };
}

// planes semilla: ir en línea recta hacia un punto (con o sin chute desde el tick k)
function towards(p, x, y, k = NO_KICK, speed = 1) {
  const [ux, uy] = norm(x - p.disc.x, y - p.disc.y);
  const pl = new Float64Array(DIM);
  for (let i = 0; i < KNOTS; i++) { pl[i * 2] = ux * speed; pl[i * 2 + 1] = uy * speed; }
  pl[DIM - 1] = k;
  return pl;
}

// semilla que pasa por varios puntos (un nudo por tramo): sirve para rodear el balón
function via(p, pts, k = NO_KICK) {
  const pl = new Float64Array(DIM);
  let x = p.disc.x, y = p.disc.y;
  for (let i = 0; i < KNOTS; i++) {
    const q = pts[Math.min(i, pts.length - 1)];
    const [ux, uy] = norm(q[0] - x, q[1] - y);
    pl[i * 2] = ux; pl[i * 2 + 1] = uy;
    [x, y] = q;
  }
  pl[DIM - 1] = k;
  return pl;
}

// semillas para colocarse detrás del balón en la dirección d (rodeándolo por cada lado)
function aroundSeeds(p, ball, dx, dy, ks) {
  const qx = ball.x - dx * (CONTACT + 4), qy = ball.y - dy * (CONTACT + 4);
  const out = [];
  for (const side of [-1, 1]) {
    const sx = ball.x - dy * side * (CONTACT + 16) - dx * 8, sy = ball.y + dx * side * (CONTACT + 16) - dy * 8;
    for (const k of ks) out.push(via(p, [[sx, sy], [qx, qy], [ball.x + dx * 20, ball.y + dy * 20]], k));
  }
  return out;
}

// Dirección en la que hay que golpear un balón que va a velocidad v para que salga hacia u
// (el chute suma KICK_SPEED en la dirección jugador→balón): v + K·d ∥ u.
export function kickDirFor(vx, vy, ux, uy) {
  const K = C.KICK_STRENGTH * C.BALL_INV_MASS;
  const uv = ux * vx + uy * vy;
  const disc = uv * uv - (vx * vx + vy * vy) + K * K;
  if (disc < 0) return null;
  const sp = uv + Math.sqrt(disc);
  if (sp <= 0) return null;
  return [(sp * ux - vx) / K, (sp * uy - vy) / K, sp];
}

// Semillas de golpeo para un balón en movimiento: para varios instantes futuros t, el punto exacto
// desde el que chutar (según la trayectoria prevista y la velocidad que llevará el balón entonces),
// llegando por la línea de golpeo y con el chute pulsado poco antes.
function timedKickSeeds(p, ball, tx, ty) {
  const path = trajectory(ball.x, ball.y, ball.vx, ball.vy, H + 2);
  const out = [];
  for (const t of [8, 16, 24, 32]) {
    const a = path[t], b = path[t + 1];
    if (!b) break; // la trayectoria se corta (gol o balón parado)
    const vx = b.x - a.x, vy = b.y - a.y;
    const [ux, uy] = norm(tx - a.x, ty - a.y);
    const d = kickDirFor(vx, vy, ux, uy);
    if (!d) continue;
    const qx = a.x - d[0] * (CONTACT + 3), qy = a.y - d[1] * (CONTACT + 3);
    out.push(via(p, [[qx - d[0] * 14, qy - d[1] * 14], [qx, qy], [a.x + d[0] * 20, a.y + d[1] * 20]], Math.max(0, t - 6)));
  }
  return out;
}

// Plan-controlador "llegar y golpear": en el instante T del ensayo el balón estará en path[T]; el
// jugador va primero a un punto `lead` por detrás de la línea de golpeo y, al acercarse T, entra por
// esa línea con el chute pulsado. Se evalúa en lazo cerrado (con el estado de cada tick), así que
// corrige pequeñas desviaciones, en ensayo y en la ejecución real.
function arriveKick(qx, qy, dx, dy, T, lead) {
  const policy = (t, P, B, out) => {
    const pre = t < T - 8;
    const tx = pre ? qx - dx * lead : qx + dx * 14, ty = pre ? qy - dy * lead : qy + dy * 14;
    const ex = tx - P.x - P.vx * 8, ey = ty - P.y - P.vy * 8;
    const l = Math.hypot(ex, ey) || 1;
    const m = Math.min(1, Math.hypot(tx - P.x, ty - P.y) / (pre ? 14 : 4));
    out[0] = (ex / l) * m;
    out[1] = (ey / l) * m;
    return t >= T - 5;
  };
  return { policy };
}

function arriveKickPlans(ball, tx, ty, h = H) {
  const path = trajectory(ball.x, ball.y, ball.vx, ball.vy, h + 2);
  const out = [];
  for (let T = 6; T <= h - 2; T += 4) {
    const a = path[T], b = path[T + 1];
    if (!b) break;
    const [ux, uy] = norm(tx - a.x, ty - a.y);
    const d = kickDirFor(b.x - a.x, b.y - a.y, ux, uy);
    if (!d) continue;
    const qx = a.x - d[0] * (CONTACT + 3), qy = a.y - d[1] * (CONTACT + 3);
    for (const lead of [6, 20]) out.push(arriveKick(qx, qy, d[0], d[1], T, lead));
  }
  return out;
}

// Plan-controlador "rodear y salir": orbita alrededor del balón por el lado `side` (radio CONTACT+gap,
// avanzando `step` rad por tick de mira) hasta quedar detrás respecto a (tx, ty), y entonces empuja
// hacia allí. Es el giro con balón: darse la vuelta pegado a él sin perderlo.
function orbit(tx, ty, side, step, gap) {
  const policy = (t, P, B, out) => {
    const [ux, uy] = norm(tx - B.x, ty - B.y);
    const want = Math.atan2(-uy, -ux); // ángulo (desde el balón) del punto de detrás
    const cur = Math.atan2(P.y - B.y, P.x - B.x);
    let diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    let gx, gy;
    if (Math.abs(diff) < 0.35) {
      // ya detrás: empujar hacia el objetivo
      gx = B.x + ux * 20; gy = B.y + uy * 20;
    } else {
      // seguir rodeando por el lado elegido (o por el corto si ya casi está)
      const dir = Math.abs(diff) > 2.6 ? side : Math.sign(diff);
      const a = cur + dir * Math.min(step, Math.abs(diff));
      const r = CONTACT + gap;
      gx = B.x + Math.cos(a) * r + B.vx * 6; gy = B.y + Math.sin(a) * r + B.vy * 6;
    }
    const ex = gx - P.x - P.vx * 6, ey = gy - P.y - P.vy * 6;
    const l = Math.hypot(ex, ey) || 1;
    out[0] = ex / l; out[1] = ey / l;
    return false;
  };
  return { policy };
}

function orbitPlans(tx, ty) {
  const out = [];
  for (const side of [-1, 1]) for (const step of [0.5, 0.9]) for (const gap of [2, 8]) out.push(orbit(tx, ty, side, step, gap));
  return out;
}

// ---------------- objetivos (costes) de cada habilidad ----------------
const relSpeed = (P, B) => Math.hypot(B.vx - P.vx, B.vy - P.vy);
const edgePB = (P, B) => Math.hypot(B.x - P.x, B.y - P.y) - P.r - B.r;

// Controlar: quedar pegado al balón con poca velocidad relativa cuanto antes (y que siga así);
// out (opcional): hacia dónde quiere salir → el balón debe quedar de ese lado.
function controlObj(out) {
  let tc, lost;
  return {
    reset() { tc = -1; lost = false; },
    step(t, P, B) {
      const e = edgePB(P, B);
      if (tc < 0 && e <= 5 && relSpeed(P, B) < 0.5) tc = t;
      if (tc >= 0 && e > 12) lost = true;
      return !(tc >= 0 && t > tc + 8);
    },
    cost(P, B) {
      if (tc < 0) return H + 30 + Math.max(0, edgePB(P, B)) * 0.4 + relSpeed(P, B) * 8;
      let c = tc + (lost ? 25 : 0);
      if (out) {
        const [bx, by] = norm(B.x - P.x, B.y - P.y);
        c += (1 - (bx * out[0] + by * out[1])) * 6;
      }
      return c;
    },
  };
}

// Pasar/tirar a (tx, ty): chutar cuanto antes con el balón saliendo en la dirección buscada.
// aimW: coste por grado de error; maxErr: error a partir del cual el golpeo cuenta como fallido.
// rush: prisa (≥ 1): multiplica el coste del tiempo cuando un rival está a punto de llegar.
function kickObj(tx, ty, aimW = 3, minSpeed = 0, maxErr = 6, rush = 1) {
  let kt, err, spd;
  return {
    reset() { kt = -1; err = 0; spd = 0; },
    onKick(t, P, B) {
      kt = t;
      const a = Math.atan2(B.vy, B.vx) - Math.atan2(ty - B.y, tx - B.x);
      err = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * (180 / Math.PI);
      spd = Math.hypot(B.vx, B.vy);
    },
    step() { return kt < 0; },
    result: () => ({ kt: kt >= 0 && err <= maxErr && spd >= minSpeed ? kt : Infinity, err }),
    cost(P, B) {
      if (kt >= 0 && err <= maxErr) return kt * rush + err * aimW + (spd < minSpeed ? (minSpeed - spd) * 25 : 0);
      if (kt >= 0) return H + 150 + err * 3; // golpeo malo: peor que seguir buscándolo
      // sin chute en el horizonte: acercarse al punto desde el que se chutaría bien, ya orientado
      const [ux, uy] = norm(tx - B.x, ty - B.y);
      const d = kickDirFor(B.vx, B.vy, ux, uy) || [ux, uy];
      const qx = B.x - d[0] * (CONTACT + 3), qy = B.y - d[1] * (CONTACT + 3);
      const [px, py] = norm(B.x - P.x, B.y - P.y);
      return H + 60 + Math.hypot(P.x - qx, P.y - qy) * 1.5 + (1 - (px * d[0] + py * d[1])) * 40;
    },
  };
}

// Tirar a puerta (portería en x = gx): lo que cuenta es que el balón entre (trayectoria prevista
// con rebotes, lejos de los palos); el punto de mira (tx, ty) solo desempata.
// tol: unidades de margen que se aceptan fuera de la zona limpia (con presión o tras esperar).
function shotObj(gx, tx, ty, tol = 0) {
  let kt, inGoal, miss, err;
  return {
    reset() { kt = -1; },
    onKick(t, P, B) {
      kt = t;
      const path = trajectory(B.x, B.y, B.vx, B.vy, 150);
      const end = path[path.length - 1];
      // entra limpio: sin tocar el poste (radio del poste + del balón, con un pequeño margen)
      const clear = C.GOAL_HALF - C.POST_RADIUS - C.BALL_RADIUS - 2;
      inGoal = end.goal === Math.sign(gx) && Math.abs(end.y) < clear;
      miss = inGoal ? 0 : end.goal ? Math.abs(end.y) - clear : 200;
      if (!inGoal && miss <= tol) { inGoal = true; } // casi limpio: vale si hay prisa
      const a = Math.atan2(B.vy, B.vx) - Math.atan2(ty - B.y, tx - B.x);
      err = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * (180 / Math.PI);
    },
    step() { return kt < 0; },
    result: () => ({ kt: kt >= 0 && inGoal ? kt : Infinity, err }),
    cost(P, B) {
      if (kt >= 0) return inGoal ? kt + err * 0.5 + miss * 3 : H + 150 + miss;
      const [ux, uy] = norm(tx - B.x, ty - B.y);
      const d = kickDirFor(B.vx, B.vy, ux, uy) || [ux, uy];
      const qx = B.x - d[0] * (CONTACT + 3), qy = B.y - d[1] * (CONTACT + 3);
      const [px, py] = norm(B.x - P.x, B.y - P.y);
      return H + 60 + Math.hypot(P.x - qx, P.y - qy) * 1.5 + (1 - (px * d[0] + py * d[1])) * 40;
    },
  };
}

// Conducir en dirección a (tx, ty): avanzar con el balón pegado y el cuerpo detrás de él, sin
// frenar al llegar (es una dirección, no un punto de parada) y sin que el balón se vaya de lado.
// next (opcional): el punto que viene después. Con él el ensayo mide el avance por todo el recorrido
// (al pasar a menos de REACH de (tx, ty) sigue hacia next), así que el jugador se anticipa al giro
// (frena o se perfila antes) en vez de maniobrar cuando ya se ha pasado.
// def (opcional): { p, gx, gy, delay } defensor que hay que evitar (protege la portería en gx, gy);
// en el ensayo se supone que va al balón por su lado con su retardo, y robo = balón pegado a él.
const REACH = 40;
function dribbleObj(tx, ty, def = null, next = null) {
  const side = def ? 0 : 1; // para superar a un defensor hay que poder salir de lado
  const leg = next ? Math.hypot(next[0] - tx, next[1] - ty) : 0;
  let ux, uy, bx0, by0, lost, stolen, minDef, di, flow, seg, rem0, turnBonus;
  const seen = []; // posiciones del balón que "ve" el defensor (con su retardo)
  // lo que queda de recorrido desde el balón (si hay siguiente punto)
  const remaining = (B) => (seg === 0 ? Math.hypot(tx - B.x, ty - B.y) + leg : Math.hypot(next[0] - B.x, next[1] - B.y));
  return {
    reset(s) {
      [ux, uy] = norm(tx - s.b.x, ty - s.b.y);
      bx0 = s.b.x; by0 = s.b.y;
      lost = 0; stolen = 0; minDef = Infinity; flow = 0; seg = 0; turnBonus = 0;
      rem0 = next ? remaining(s.b) : 0;
      di = def ? s.o.findIndex((o) => o.ref === def.p) : -1;
      seen.length = 0;
      const k = def?.delay || 0;
      for (let i = k; i >= 0; i--) seen.push([s.b.x - s.b.vx * i, s.b.y - s.b.vy * i]);
    },
    model: def ? (d, o, B) => {
      if (o.ref !== def.p) return;
      seen.push([B.x, B.y]);
      const [bx, by] = seen.shift();
      const [gx, gy] = norm(def.gx - bx, def.gy - by);
      const qx = bx + gx * (CONTACT - 2), qy = by + gy * (CONTACT - 2);
      const [ex, ey] = norm(qx - d.x - d.vx * 8, qy - d.y - d.vy * 8);
      const m = Math.min(1, Math.hypot(qx - d.x, qy - d.y) / 8);
      d.vx += ex * m * C.PLAYER_ACCEL;
      d.vy += ey * m * C.PLAYER_ACCEL;
      d.damping = C.PLAYER_DAMPING;
    } : null,
    step(t, P, B) {
      const e = edgePB(P, B);
      if (e > 45) lost++;
      if (next) {
        // tramo actual: hacia (tx, ty) y, al llegar con el balón controlado, hacia next
        if (seg === 0 && Math.hypot(tx - B.x, ty - B.y) < REACH) { seg = 1; if (e < 15) turnBonus = 6; }
        [ux, uy] = seg === 0 ? norm(tx - B.x, ty - B.y) : norm(next[0] - B.x, next[1] - B.y);
      }
      flow += (B.vx * ux + B.vy * uy) * 0.12 - Math.abs(-B.vx * uy + B.vy * ux) * 0.25 * side;
      if (di >= 0) {
        const dd = POOL[di];
        const de = Math.hypot(B.x - dd.x, B.y - dd.y) - dd.r - B.r;
        minDef = Math.min(minDef, de);
        if (de < 3 && e > 8) stolen++;
      }
      return true;
    },
    cost(P, B) {
      const [bx, by] = norm(B.x - P.x, B.y - P.y);
      const behind = (1 - (bx * ux + by * uy)) * 12;
      const tail = Math.max(0, edgePB(P, B) - 12) * 0.8 + behind + lost * 2;
      if (next) return -(rem0 - remaining(B)) * 0.4 - flow - turnBonus + tail;
      const prog = (B.x - bx0) * ux + (B.y - by0) * uy;
      const off = Math.abs(-(B.x - bx0) * uy + (B.y - by0) * ux);
      let c = -prog * 0.4 - flow + off * 0.1 * side + tail;
      if (di >= 0) {
        c += stolen * 6 + Math.max(0, 12 - minDef) * 1.5;
        // superado: el balón (controlado) ya está por delante del defensor hacia la portería
        const dd = POOL[di];
        const ahead = (B.x - dd.x) * ux + (B.y - dd.y) * uy;
        if (ahead > 20 && edgePB(P, B) < 20) c -= 30 + ahead * 0.3;
      }
      return c;
    },
  };
}

// ---------------- habilidades (lo que llaman la IA y los ejercicios) ----------------
// Estado de plan por jugador: { key, plan, tick }. El reloj (p.motorT) avanza una vez por llamada
// (las habilidades se llaman una vez por tick); un plan de otra habilidad u objetivo se descarta.
function runPlan(p, key, build, replan = REPLAN) {
  p.motorT = (p.motorT || 0) + 1;
  const st = p.motor;
  if (st && st.key === key && p.motorT - st.tick < replan && st.plan) return apply(p, st, p.motorT);
  const over = spent >= TICK_BUDGET;
  if (over && st && st.key === key && st.plan && p.motorT - st.tick < replan + 4) return apply(p, st, p.motorT);
  const { s, obj, seeds, kick, h = H, budget: b = null } = build();
  const budget = over ? { pop: 6, iters: 1, elite: 3 } : b;
  // plan anterior desplazado (sigue siendo buena semilla si el objetivo no ha cambiado)
  if (st && st.key === key && st.plan && !st.plan.policy) seeds.push(shift(st.plan, p.motorT - st.tick));
  const { plan } = optimize(s, obj, seeds, { kick, h, ...(budget || {}) });
  const since = st && st.key === key ? st.since : p.motorT;
  p.motor = { key, plan, tick: p.motorT, h, since, ball: s.ball };
  return apply(p, p.motor, p.motorT);
}

function shift(plan, dt) {
  const pl = Float64Array.from(plan);
  pl[DIM - 1] = plan[DIM - 1] >= NO_KICK ? NO_KICK : Math.max(0, plan[DIM - 1] - dt);
  return pl;
}

function apply(p, st, tick) {
  const t = tick - st.tick;
  if (st.plan.policy) {
    // plan-controlador: se evalúa con el estado real (mismo código que en el ensayo)
    const kick = st.plan.policy(t, p.disc, st.ball, inp);
    p.input.x = inp[0]; p.input.y = inp[1]; p.input.kick = kick;
    return;
  }
  planInput(st.plan, t, inp, st.h);
  p.input.x = inp[0];
  p.input.y = inp[1];
  p.input.kick = t >= st.plan[DIM - 1];
}

// ¿El balón llega a esta zona dentro del horizonte? Si no, ir al punto de intercepción sin ensayar.
// aim (opcional): a dónde se va a jugar el balón. Entonces no espera de cara al balón sino en el
// punto desde el que podrá golpearlo de primeras hacia aim (perfilado para el pase).
function farApproach(p, ball, horizonTicks = 120, aim = null) {
  const path = trajectory(ball.x, ball.y, ball.vx, ball.vy, horizonTicks);
  const it = intercept(p, path, horizonTicks);
  if (it.t <= H - 6 || edgeToBall(p, ball) < 60) return false;
  if (aim) {
    for (let t = Math.max(1, it.t); t < path.length - 1; t++) {
      const a = path[t], b = path[t + 1];
      const [ux, uy] = norm(aim[0] - a.x, aim[1] - a.y);
      const d = kickDirFor(b.x - a.x, b.y - a.y, ux, uy);
      if (!d) continue;
      const qx = a.x - d[0] * (CONTACT + 4), qy = a.y - d[1] * (CONTACT + 4);
      if (timeToReach(p, qx, qy) + 4 <= t) {
        steer(p, qx, qy, 1, 12);
        p.input.kick = false;
        p.motor = null;
        return true;
      }
    }
  }
  // esperar al balón un poco por detrás del punto de corte (para amortiguar)
  const [vx, vy] = norm(ball.vx, ball.vy);
  steer(p, it.x + vx * (CONTACT + 6), it.y + vy * (CONTACT + 6), 1, 10);
  p.input.kick = false;
  p.motor = null;
  return true;
}

// Cuántos ticks tardaría en golpear hacia (tx, ty) con la precisión necesaria (Infinity si no lo
// consigue en el horizonte). Ensayo pequeño (solo semillas); lo usa la decisión para no elegir
// pases que no le da tiempo a ejecutar antes de que llegue el rival.
export function estimateKick(p, ball, others, tx, ty, shot = false) {
  const [ux, uy, dist] = norm(tx - ball.x, ty - ball.y);
  const d = kickDirFor(ball.vx, ball.vy, ux, uy) || [ux, uy];
  const qx = ball.x - d[0] * (CONTACT + 4), qy = ball.y - d[1] * (CONTACT + 4);
  const s = snapshot(p, ball, others);
  const tol = Math.min(10, (Math.atan2(28, dist) * 180) / Math.PI);
  const obj = shot ? shotObj(Math.sign(tx) * C.FIELD_W, tx, ty)
    : kickObj(tx, ty, 3, (dist * (1 - C.BALL_DAMPING)) / C.BALL_DAMPING + 0.6, tol);
  const seeds = [towards(p, qx, qy, 6), towards(p, ball.x, ball.y, 0), ...aroundSeeds(p, ball, d[0], d[1], [14]), ...arriveKickPlans(ball, tx, ty)];
  let best = Infinity;
  for (const pl of seeds) {
    spent++;
    rollout(s, pl, obj);
    best = Math.min(best, obj.result().kt);
  }
  return best;
}

// others(): jugadores que hay en el campo (para meterlos en el ensayo si están cerca)
export function makeMotor(others) {
  // sin rivales cerca del balón no hace falta replanificar tan a menudo
  const replanFor = (p, ball) => {
    for (const o of others()) {
      if (o.team !== p.team && Math.hypot(o.disc.x - ball.x, o.disc.y - ball.y) < CALM_DIST) return REPLAN;
    }
    return REPLAN_CALM;
  };
  return {
    control(p, ball, out = null) {
      if (farApproach(p, ball)) return;
      runPlan(p, 'control', () => ({
        s: snapshot(p, ball, others()),
        obj: controlObj(out),
        seeds: [towards(p, ball.x, ball.y), towards(p, ball.x + ball.vx * 10, ball.y + ball.vy * 10, NO_KICK, 0.5), new Float64Array(DIM).fill(0).map((v, i) => (i === DIM - 1 ? NO_KICK : 0))],
        kick: false,
        budget: { pop: 12, iters: 2, elite: 4 },
      }), replanFor(p, ball));
    },
    // tOpp: ticks que tardaría el rival más cercano en llegar al balón (presión): con un rival
    // encima se suelta antes y con más margen de error, como haría un jugador.
    pass(p, ball, tx, ty, aimW = 3, maxErr = null, tOpp = Infinity) {
      if (farApproach(p, ball, 120, [tx, ty])) return;
      const key = `kick:${Math.round(tx / 60)},${Math.round(ty / 60)}`;
      runPlan(p, key, () => {
        // cuanto más tiempo lleva buscando el golpeo, más error acepta (no esperar eternamente)
        const waited = p.motor?.key === key ? p.motorT - p.motor.since : 0;
        const press = Math.max(0, Math.min(1, (45 - tOpp) / 35)); // 0 = sin presión, 1 = encima
        const w = aimW / (1 + waited / 45) / (1 + press);
        // error admisible: que el balón pase a pie del receptor (≈ 28 de margen a esa distancia)
        const base = maxErr ?? Math.min(10, (Math.atan2(28, Math.hypot(tx - ball.x, ty - ball.y)) * 180) / Math.PI);
        const tol = Math.min(12, base * Math.min(1.5, 1 + waited / 90) * (1 + press));
        const [ux, uy, dist] = norm(tx - ball.x, ty - ball.y);
        const d = kickDirFor(ball.vx, ball.vy, ux, uy) || [ux, uy];
        const qx = ball.x - d[0] * (CONTACT + 4), qy = ball.y - d[1] * (CONTACT + 4);
        // velocidad de salida necesaria para que llegue (rozamiento del balón)
        const minSpeed = (dist * (1 - C.BALL_DAMPING)) / C.BALL_DAMPING + 0.6;
        return {
          s: snapshot(p, ball, others()),
          obj: kickObj(tx, ty, w, minSpeed, tol, 1 + press * 3),
          seeds: [towards(p, qx, qy, 6), towards(p, qx, qy, 15), towards(p, ball.x, ball.y, 0), towards(p, qx, qy, NO_KICK),
            ...aroundSeeds(p, ball, d[0], d[1], [14, 26]), ...timedKickSeeds(p, ball, tx, ty), ...arriveKickPlans(ball, tx, ty)],
          kick: true,
        };
      }, replanFor(p, ball));
    },
    shoot(p, ball, tx, ty, tOpp = Infinity) {
      if (farApproach(p, ball, 120, [tx, ty])) return;
      const key = `shot:${Math.sign(tx)}`;
      runPlan(p, key, () => {
        const waited = p.motor?.key === key ? p.motorT - p.motor.since : 0;
        const press = Math.max(0, Math.min(1, (45 - tOpp) / 35));
        const tol = Math.min(16, waited / 4 + press * 12);
        const [ux, uy] = norm(tx - ball.x, ty - ball.y);
        const d = kickDirFor(ball.vx, ball.vy, ux, uy) || [ux, uy];
        const qx = ball.x - d[0] * (CONTACT + 4), qy = ball.y - d[1] * (CONTACT + 4);
        return {
          s: snapshot(p, ball, others()),
          obj: shotObj(Math.sign(tx) * C.FIELD_W, tx, ty, tol),
          seeds: [towards(p, qx, qy, 6), towards(p, qx, qy, 15), towards(p, ball.x, ball.y, 0),
            ...aroundSeeds(p, ball, d[0], d[1], [14, 26]), ...timedKickSeeds(p, ball, tx, ty), ...arriveKickPlans(ball, tx, ty)],
          kick: true,
        };
      });
    },
    dribble(p, ball, tx, ty, def = null, next = null) {
      if (edgeToBall(p, ball) > 40 && farApproach(p, ball)) return;
      const [ux, uy] = norm(tx - ball.x, ty - ball.y);
      // darse la vuelta con el balón es la maniobra más difícil: planes de rodear el balón, más
      // ensayos y replanificar más a menudo
      const turning = (ball.x - p.disc.x) * ux + (ball.y - p.disc.y) * uy < 0.5 * Math.hypot(ball.x - p.disc.x, ball.y - p.disc.y);
      const nk = next ? `>${Math.round(next[0] / 60)},${Math.round(next[1] / 60)}` : '';
      runPlan(p, `drib:${Math.round(tx / 60)},${Math.round(ty / 60)}${nk}`, () => {
        return {
          s: snapshot(p, ball, others()),
          obj: dribbleObj(tx, ty, def, next),
          h: H_DRIB,
          budget: turning ? { pop: 28, iters: 3, elite: 6 } : { pop: 14, iters: 2, elite: 4 },
          seeds: [towards(p, ball.x - ux * CONTACT, ball.y - uy * CONTACT), towards(p, tx, ty), towards(p, ball.x, ball.y, NO_KICK, 0.6),
            ...aroundSeeds(p, ball, ux, uy, [NO_KICK]), ...(turning ? orbitPlans(tx, ty) : [])],
          kick: false,
        };
      }, turning ? 1 : replanFor(p, ball));
    },
  };
}
