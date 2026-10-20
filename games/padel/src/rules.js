// Reglas simplificadas sobre un camino simulado.
// La bola debe pasar la red y botar en campo rival antes de tocar cristal; tras el bote vale todo
// hasta el segundo bote o salir de la pista (punto para quien golpeó; si sale por el lateral es "por 3").
import { CONFIG as C } from './config.js';
import { sideOf, sampleAt } from './physics.js';

/**
 * Devuelve el desenlace del golpe si nadie lo devuelve:
 * {t, winner, reason, legalBounceT, events}
 * hitter: 1 (jugador) o -1 (rival)
 */
export function judge(path, hitter, opts = {}) {
  const recv = -hitter;
  const serve = opts.serve; // {boxSign}: signo de x del cuadro de saque cruzado
  let crossed = false;
  let bounces = 0;
  let legalBounceT = null;
  const end = (t, winner, reason) => ({ t, winner, reason, legalBounceT });

  for (const e of path.events) {
    const side = sideOf(e.z);
    if (e.type === 'cross') {
      if (e.to === recv) crossed = true;
      else if (bounces > 0) return end(e.t, hitter, 'vuelve'); // tras botar vuelve a nuestro campo
      continue;
    }
    if (e.type === 'net') continue;
    if (e.type === 'ground') {
      if (!crossed || side !== recv) return end(e.t, recv, serve ? 'falta' : 'red');
      bounces++;
      // Saque: el primer bote dentro del cuadro de saque cruzado
      if (serve && bounces === 1 && (Math.abs(e.z) > C.SERVICE_LINE || Math.sign(e.x || 1e-9) !== serve.boxSign)) {
        return end(e.t, recv, 'falta');
      }
      if (bounces === 1) legalBounceT = e.t;
      if (bounces === 2) return end(e.t, hitter, 'doble bote');
      continue;
    }
    if (e.type === 'wall') {
      if (!crossed || side !== recv) return end(e.t, recv, serve ? 'falta' : 'pared propia');
      if (bounces === 0) return end(e.t, recv, serve ? 'falta' : 'cristal directo');
      // Saque: tocar la malla antes del segundo bote es falta (el cristal sí vale)
      if (serve && e.wall === 'mesh') return end(e.t, recv, 'falta');
      continue;
    }
    if (e.type === 'out') {
      if (bounces === 0 || serve) return end(e.t, recv, serve ? 'falta' : 'fuera');
      return end(e.t, hitter, e.wall === 'side' ? 'por 3' : 'por 4');
    }
    if (e.type === 'rest') return end(e.t, bounces > 0 ? hitter : recv, 'muere');
  }
  return end(path.duration, bounces > 0 ? hitter : recv, 'muere');
}

/** Tiempo para recorrer d metros desde parado con aceleración a y velocidad máxima vmax. */
export function travelTime(d, vmax, a) {
  if (d <= 0) return 0;
  const dAcc = (vmax * vmax) / (2 * a);
  return d < dAcc ? Math.sqrt((2 * d) / a) : vmax / a + (d - dAcc) / vmax;
}

/**
 * Busca dónde golpea el equipo receptor, como lo haría un buen jugador:
 * en la red volea o remata; en el fondo deja botar y, si la bola va al cristal, la juega a la salida de la pared.
 * players: [{x, z}] puntos de golpeo actuales; move: {vmax, accel, reaction}.
 * Devuelve {t, idx, pos, bounced, afterWall} o null.
 */
export function findContact(path, outcome, recvSide, players, move, opts = {}) {
  if (outcome.winner === recvSide) return null; // va fuera: no se toca
  const vmax = move?.vmax ?? C.PLAYER_SPEED;
  const accel = move?.accel ?? C.PLAYER_ACCEL;
  const reaction = move?.reaction ?? C.REACTION;
  const tEnd = outcome.t - 0.02;
  const p = { x: 0, y: 0, z: 0 };
  const q = { x: 0, y: 0, z: 0 };
  const candidates = [];
  let crossed = false;
  let bounceT = null;
  let wallT = null;
  const evs = path.events;
  let ei = 0;
  for (let t = 0.05; t < tEnd; t += 1 / 60) {
    while (ei < evs.length && evs[ei].t <= t) {
      const e = evs[ei++];
      if (e.type === 'cross' && e.to === recvSide) crossed = true;
      if (e.type === 'ground' && sideOf(e.z) === recvSide && bounceT === null) bounceT = e.t;
      if (e.type === 'wall' && bounceT !== null && wallT === null && sideOf(e.z) === recvSide) wallT = e.t;
    }
    if (!crossed) continue;
    sampleAt(path, t, p);
    if (sideOf(p.z) !== recvSide || p.y < C.MIN_HIT_H || p.y > C.MAX_HIT_H) continue;
    if (Math.abs(p.z) < 1.2 || Math.abs(p.z) > 9.6) continue; // pegado a la red o al cristal
    const bounced = bounceT !== null && t > bounceT;
    if (opts.mustBounce && !bounced) continue; // el resto del saque no se puede volear
    sampleAt(path, t + 1 / 60, q);
    const vy = (q.y - p.y) * 60;
    for (let i = 0; i < players.length; i++) {
      const d = Math.hypot(players[i].x - p.x, players[i].z - p.z) - C.REACH;
      if (travelTime(d, vmax, accel) <= t - reaction) {
        candidates.push({ t, idx: i, pos: { ...p }, bounced, afterWall: wallT !== null && t > wallT, vy, dist: d, atNet: Math.abs(players[i].z) < 5.5 });
      }
    }
  }
  if (!candidates.length) return null;
  // Una situación guionizada puede imponer el tipo de golpe (p. ej. bandeja en vez de remate)
  if (opts.pick) {
    const forced = opts.pick(candidates);
    if (forced) return forced;
  }
  const pre = candidates.filter((c) => !c.bounced);
  const after = candidates.filter((c) => c.bounced);
  let pick = null;
  // 1) Remate: bola alta antes del bote cerca de la red, a la altura ideal de golpeo por encima de la cabeza
  const over = pre.filter((c) => c.pos.y >= C.SMASH_MIN_H && Math.abs(c.pos.z) <= C.SMASH_MAX_DNET + 0.5);
  if (over.length) pick = over.reduce((a, c) => (Math.abs(c.pos.y - 2.6) < Math.abs(a.pos.y - 2.6) ? c : a));
  // 2) En la red se volea
  if (!pick) pick = pre.find((c) => c.atNet && c.pos.y >= 0.8 && c.pos.y <= 1.9);
  // 3) Lectura de pared: si la bola va al cristal, se juega a la salida
  if (!pick && wallT !== null) pick = after.find((c) => c.afterWall && c.pos.y > 0.45 && c.pos.y < 1.5);
  // 4) Tras el bote, a buena altura y bajando
  if (!pick) pick = after.find((c) => !c.afterWall && c.pos.y < 1.4 && c.pos.y > 0.4 && c.vy <= 0.5);
  if (!pick) pick = after[0];
  if (!pick) pick = pre[pre.length - 1];
  // Entre los dos jugadores, el más cercano a ese punto
  const same = candidates.filter((c) => Math.abs(c.t - pick.t) < 1e-6);
  same.sort((a, b) => a.dist - b.dist);
  return same[0];
}
