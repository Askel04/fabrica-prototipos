// Espaciado de los equipos (IA contra IA): separación del bloque, apelotonamiento junto al balón
// y distancia al compañero más cercano. Uso: node tools/spacing.mjs [nivel] [tamaño] [partidas] [minutos]
import { Match } from '../src/sim/match.js';

export function spacing(level, size = 5, games = 3, minutes = 2) {
  const stadium = size >= 5 ? 'big' : 'classic';
  let N = 0, crowd3 = 0, nearBall = 0, nn = 0, sx = 0, sy = 0, goals = 0;
  const jobs = {};
  for (let g = 0; g < games; g++) {
    const m = new Match({ humanTeam: null, teamSize: size, stadium, levels: { red: level, blue: level } });
    for (let t = 0; t < 60 * 60 * minutes; t++) {
      m.step();
      if (t % 10 || m.state !== 'play') continue;
      const b = m.ball;
      for (const team of ['red', 'blue']) {
        const ps = m.players.filter((p) => p.team === team);
        const nb = ps.filter((p) => Math.hypot(p.disc.x - b.x, p.disc.y - b.y) < 100).length;
        nearBall += nb;
        if (nb >= 3) crowd3++;
        for (const p of ps) {
          nn += Math.min(...ps.filter((q) => q !== p).map((q) => Math.hypot(q.disc.x - p.disc.x, q.disc.y - p.disc.y)));
          jobs[p.job] = (jobs[p.job] || 0) + 1;
        }
        const mx = ps.reduce((s, p) => s + p.disc.x, 0) / ps.length, my = ps.reduce((s, p) => s + p.disc.y, 0) / ps.length;
        sx += Math.sqrt(ps.reduce((s, p) => s + (p.disc.x - mx) ** 2, 0) / ps.length);
        sy += Math.sqrt(ps.reduce((s, p) => s + (p.disc.y - my) ** 2, 0) / ps.length);
        N++;
      }
    }
    goals += m.score.red + m.score.blue;
  }
  const tot = Object.values(jobs).reduce((x, y) => x + y, 0);
  return {
    level, size, sigmaX: Math.round(sx / N), sigmaY: Math.round(sy / N), crowd3: `${((crowd3 / N) * 100).toFixed(1)}%`,
    nearBall: (nearBall / N).toFixed(2), nearestMate: Math.round(nn / N / size), goalsPerGame: (goals / games).toFixed(1),
    jobs: Object.fromEntries(Object.entries(jobs).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, `${Math.round((v / tot) * 100)}%`])),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [level = 'hard', size = '5', games = '3', minutes = '2'] = process.argv.slice(2);
  console.log(JSON.stringify(spacing(level, +size, +games, +minutes)));
}
