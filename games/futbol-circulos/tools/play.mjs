// Partidos IA contra IA sin dibujar: node tools/play.mjs <nivelRojo> <nivelAzul> [minutos] [partidos]
import { Match } from '../src/sim/match.js';

export function playMatch(red, blue, minutes = 5, weights = {}) {
  const m = new Match({ humanTeam: null, levels: { red, blue }, weights: weights.red });
  if (weights.blue) m.brains.blue.w = { ...m.brains.blue.w, ...weights.blue };
  m.startKickoff(Math.random() < 0.5 ? 'red' : 'blue');
  let still = 0, stuck = 0, escapes = 0, lx = 0, ly = 0;
  for (let i = 0; i < 60 * 60 * minutes; i++) {
    m.step();
    const b = m.ball;
    if (Math.abs(b.y) > 171 || Math.abs(b.x) > 401) escapes++;
    if (Math.hypot(b.x - lx, b.y - ly) < 0.05 && m.state === 'play') still++; else still = 0;
    if (still === 600) stuck++;
    lx = b.x; ly = b.y;
  }
  return { score: m.score, stats: m.stats, stuck, escapes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [red = 'normal', blue = 'easy', minutes = '5', games = '1'] = process.argv.slice(2);
  const t0 = Date.now();
  const tot = { red: 0, blue: 0, wins: 0, losses: 0, draws: 0, passRed: 0, passBlue: 0, shotsRed: 0, shotsBlue: 0, stuck: 0, escapes: 0 };
  for (let g = 0; g < +games; g++) {
    const r = playMatch(red, blue, +minutes);
    tot.red += r.score.red; tot.blue += r.score.blue;
    if (r.score.red > r.score.blue) tot.wins++; else if (r.score.red < r.score.blue) tot.losses++; else tot.draws++;
    tot.passRed += r.stats.red.passes; tot.passBlue += r.stats.blue.passes;
    tot.shotsRed += r.stats.red.shots; tot.shotsBlue += r.stats.blue.shots;
    tot.stuck += r.stuck; tot.escapes += r.escapes;
  }
  console.log(`${red} vs ${blue}`, JSON.stringify(tot), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
