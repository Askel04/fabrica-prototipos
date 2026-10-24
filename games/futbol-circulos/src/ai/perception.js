// Percepción: la IA ve el mundo como era hace `reactionTicks` (balón y rivales), con ruido gaussiano.
// Sus compañeros los conoce al momento (comunicación de equipo). La ejecución con el balón en los
// pies usa el balón real: el retardo afecta a leer el juego y decidir, no al control del balón.
import { gauss } from './skills.js';

export function perceive(match, team, P, noise) {
  const snap = match.snapshot(P.reactionTicks);
  // ruido suave: cambia poco a poco, como una estimación imperfecta
  noise.x = noise.x * 0.6 + gauss(P.noise) * 0.4;
  noise.y = noise.y * 0.6 + gauss(P.noise) * 0.4;
  noise.vx = noise.vx * 0.6 + gauss(P.noise * 0.03) * 0.4;
  noise.vy = noise.vy * 0.6 + gauss(P.noise * 0.03) * 0.4;
  const b = snap.ball;
  const ball = { x: b.x + noise.x, y: b.y + noise.y, vx: b.vx + noise.vx, vy: b.vy + noise.vy };
  // rivales "fantasma": su posición retrasada (con algo de ruido), misma interfaz que un jugador
  const opps = [];
  match.players.forEach((p, i) => {
    if (p.team === team) return;
    const d = snap.discs[i];
    opps.push({
      ref: p, team: p.team, attack: p.attack, human: p.human,
      disc: { x: d.x + gauss(P.noise * 0.5), y: d.y + gauss(P.noise * 0.5), vx: d.vx, vy: d.vy, r: p.disc.r },
    });
  });
  return { ball, opps };
}
