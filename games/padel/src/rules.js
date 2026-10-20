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
export function judge(path, hitter) {
  const recv = -hitter;
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
      if (!crossed || side !== recv) return end(e.t, recv, 'red');
      bounces++;
      if (bounces === 1) legalBounceT = e.t;
      if (bounces === 2) return end(e.t, hitter, 'doble bote');
      continue;
    }
    if (e.type === 'wall') {
      if (!crossed || side !== recv) return end(e.t, recv, 'pared propia');
      if (bounces === 0) return end(e.t, recv, 'cristal directo');
      continue;
    }
    if (e.type === 'out') {
      if (bounces === 0) return end(e.t, recv, 'fuera');
      return end(e.t, hitter, e.wall === 'side' ? 'por 3' : 'por 4');
    }
    if (e.type === 'rest') return end(e.t, bounces > 0 ? hitter : recv, 'muere');
  }
  return end(path.duration, bounces > 0 ? hitter : recv, 'muere');
}

/**
 * Busca el primer momento en que algún jugador del equipo receptor puede golpear.
 * players: [{x, z}] posiciones actuales. Devuelve {t, idx, pos, bounced} o null.
 */
export function findContact(path, outcome, recvSide, players, speed = C.PLAYER_SPEED, reaction = C.REACTION) {
  if (outcome.winner === recvSide) return null; // va fuera: no se toca
  const tEnd = outcome.t - 0.02;
  const p = { x: 0, y: 0, z: 0 };
  const candidates = [];
  let crossed = false;
  let bounceT = null;
  const evs = path.events;
  let ei = 0;
  for (let t = 0.05; t < tEnd; t += 1 / 60) {
    while (ei < evs.length && evs[ei].t <= t) {
      const e = evs[ei++];
      if (e.type === 'cross' && e.to === recvSide) crossed = true;
      if (e.type === 'ground' && sideOf(e.z) === recvSide && bounceT === null) bounceT = e.t;
    }
    if (!crossed) continue;
    sampleAt(path, t, p);
    if (sideOf(p.z) !== recvSide || p.y < C.MIN_HIT_H || p.y > C.MAX_HIT_H) continue;
    if (Math.abs(p.z) < 1.2) continue; // demasiado pegado a la red
    const bounced = bounceT !== null && t > bounceT;
    for (let i = 0; i < players.length; i++) {
      const d = Math.hypot(players[i].x - p.x, players[i].z - p.z) - C.REACH;
      if (d <= speed * Math.max(0, t - reaction)) {
        candidates.push({ t, idx: i, pos: { ...p }, bounced, dist: d });
      }
    }
  }
  if (!candidates.length) return null;
  // Preferencia: tras el bote, a buena altura y bajando; si no, volea lo más tarde posible.
  const after = candidates.filter((c) => c.bounced);
  const good = after.find((c) => c.pos.y < 1.4 && c.pos.y > 0.4);
  let pick = good || after[0];
  if (!pick) {
    const vol = candidates.filter((c) => !c.bounced);
    pick = vol[vol.length - 1];
  }
  // Entre los dos jugadores, el más cercano a ese punto
  const same = candidates.filter((c) => Math.abs(c.t - pick.t) < 1e-6);
  same.sort((a, b) => a.dist - b.dist);
  return same[0];
}
