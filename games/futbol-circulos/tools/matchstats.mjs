// Métricas de partido (IA contra IA), para juzgar si "parece fútbol" y comparar versiones de la IA.
//  - espaciado: separación del bloque (σx, σy), ≥3 compañeros junto al balón, compañero más cercano
//  - técnica en juego: % de recepciones controladas, pérdidas por recepción, tiempo hasta soltar
//  - juego: pases completados por minuto, presión a tiempo sobre el rival que recibe, goles
// Uso: node tools/matchstats.mjs [nivel=hard] [tamaño=5] [partidas=3] [minutos=2]
import { Match } from '../src/sim/match.js';
import { CONTACT } from '../src/ai/skills.js';

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);

export function matchStats(level, size = 5, games = 3, minutes = 2, levels = null) {
  const stadium = size >= 5 ? 'big' : 'classic';
  let N = 0, crowd3 = 0, nearBall = 0, nn = 0, sx = 0, sy = 0, goals = 0;
  let receptions = 0, controlled = 0, lost = 0, passes = 0, oppRecv = 0, pressedInTime = 0;
  const release = [];
  const jobs = {};
  for (let g = 0; g < games; g++) {
    const m = new Match({ humanTeam: null, teamSize: size, stadium, levels: levels || { red: level, blue: level } });
    let cur = null; // recepción en curso: { p, t, ctl, pressed, nearDef }
    const touch = m.touch.bind(m);
    m.touch = (p) => {
      const prev = m.lastTouch;
      if (prev !== p) {
        if (cur && cur.p !== p) {
          if (p.team !== cur.p.team) lost++;
          cur = null;
        }
        if (prev && prev.team === p.team) {
          // recepción de un pase propio
          receptions++;
          passes++;
          const opps = m.players.filter((q) => q.team !== p.team);
          const nearDef = Math.min(...opps.map((q) => Math.hypot(q.disc.x - p.disc.x, q.disc.y - p.disc.y)));
          cur = { p, t: m.tick, ctl: false, pressed: false, nearDef };
          if (nearDef < 120) oppRecv++;
        }
      }
      touch(p);
    };
    m.events.kick = (p) => {
      if (cur && cur.p === p) { release.push((m.tick - cur.t) / 60); cur = null; }
    };
    for (let t = 0; t < 60 * 60 * minutes; t++) {
      m.step();
      if (cur) {
        const b = m.ball, d = cur.p.disc;
        if (!cur.ctl && Math.hypot(b.x - d.x, b.y - d.y) - CONTACT <= 6 && Math.hypot(b.vx - d.vx, b.vy - d.vy) < 0.8) {
          cur.ctl = true;
          controlled++;
        }
        // presión a tiempo: un rival llega a ≤ 60 del receptor (distancia de contención) en ≤ 0,5 s,
        // si había uno a < 120 al recibir
        if (!cur.pressed && cur.nearDef < 120 && m.tick - cur.t <= 30) {
          const opps = m.players.filter((q) => q.team !== cur.p.team);
          if (opps.some((q) => Math.hypot(q.disc.x - d.x, q.disc.y - d.y) < 60)) { cur.pressed = true; pressedInTime++; }
        }
      }
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
  const pct = (a, b) => `${Math.round((a / Math.max(1, b)) * 100)}%`;
  return {
    level, size,
    recepcionesControladas: pct(controlled, receptions),
    perdidasPorRecepcion: pct(lost, receptions),
    soltarMediana: median(release)?.toFixed(2),
    pasesPorMin: +(passes / (games * minutes)).toFixed(1),
    presionATiempo: pct(pressedInTime, oppRecv),
    sigmaX: Math.round(sx / N), sigmaY: Math.round(sy / N), crowd3: `${((crowd3 / N) * 100).toFixed(1)}%`,
    nearBall: +(nearBall / N).toFixed(2), nearestMate: Math.round(nn / N / size), goalsPerGame: +(goals / games).toFixed(1),
    jobs: Object.fromEntries(Object.entries(jobs).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, `${Math.round((v / tot) * 100)}%`])),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [level = 'hard', size = '5', games = '3', minutes = '2'] = process.argv.slice(2);
  console.log(JSON.stringify(matchStats(level, +size, +games, +minutes)));
}
