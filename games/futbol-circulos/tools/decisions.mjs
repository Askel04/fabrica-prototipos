// Métricas de decisión en partido (IA contra IA), en paralelo:
//  - pases: % que llegan a un compañero, pases buenos por minuto
//  - pérdidas antes de soltar: % de recepciones en las que el rival roba antes de que el receptor
//    pase, tire o despeje
//  - presión: % de recepciones rivales con un defensor a < 120 en las que alguno llega a < 60 del
//    receptor en ≤ 0,5 s
//  - goles por partido
// Uso: node tools/decisions.mjs [partidos=16] [minutos=3] [pesos JSON={}] [nivel=hard] [procesos=4]
// Los pesos se aplican a los dos equipos (para comparar estilos de juego, no fuerza).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Match } from '../src/sim/match.js';

export function runGames(games, minutes, weights = {}, level = 'hard', size = 5) {
  const out = { games: 0, minutes: 0, recepciones: 0, pasaBien: 0, pasaMal: 0, pierdeAntes: 0, tiroOdespeje: 0, goles: 0, presOport: 0, presOk: 0 };
  for (let g = 0; g < games; g++) {
    const m = new Match({ humanTeam: null, teamSize: size, stadium: size >= 5 ? 'big' : 'classic', levels: { red: level, blue: level }, weights });
    let cur = null, pending = null, press = null;
    const touch = m.touch.bind(m);
    m.touch = (p) => {
      const prev = m.lastTouch;
      if (prev !== p) {
        if (pending && p !== pending) { if (p.team === pending.team) out.pasaBien++; else out.pasaMal++; pending = null; }
        if (cur && cur !== p) { if (p.team !== cur.team) out.pierdeAntes++; cur = null; }
        if (prev && prev.team === p.team) {
          out.recepciones++;
          cur = p;
          const near = Math.min(...m.players.filter((q) => q.team !== p.team).map((q) => Math.hypot(q.disc.x - p.disc.x, q.disc.y - p.disc.y)));
          press = near < 120 ? { p, t: m.tick, ok: near < 60 } : null;
          if (press) out.presOport++;
        }
      }
      touch(p);
    };
    m.events.kick = (p) => {
      if (cur === p) {
        if (p.act?.type === 'pass' || p.firstTime) pending = p; else out.tiroOdespeje++;
        cur = null;
      }
    };
    for (let t = 0; t < 3600 * minutes; t++) {
      m.step();
      if (press && !press.ok) {
        if (m.tick - press.t > 30) press = null;
        else if (m.players.some((q) => q.team !== press.p.team && Math.hypot(q.disc.x - press.p.disc.x, q.disc.y - press.p.disc.y) < 60)) press.ok = true;
      }
      if (press?.ok) { out.presOk++; press = null; }
    }
    out.goles += m.score.red + m.score.blue;
    out.games++;
    out.minutes += minutes;
  }
  return out;
}

export function summary(o) {
  const passes = o.pasaBien + o.pasaMal;
  return {
    partidos: o.games,
    pasesOk: `${Math.round((o.pasaBien / Math.max(1, passes)) * 100)}%`,
    pasesBuenosMin: +(o.pasaBien / Math.max(1, o.minutes) / 2).toFixed(1), // por equipo
    pierdeAntes: `${Math.round((o.pierdeAntes / Math.max(1, o.recepciones)) * 100)}%`,
    recepMin: +(o.recepciones / Math.max(1, o.minutes) / 2).toFixed(1),
    golesPartido: +(o.goles / Math.max(1, o.games)).toFixed(2),
    presionATiempo: `${Math.round((o.presOk / Math.max(1, o.presOport)) * 100)}%`,
  };
}

// reparte los partidos entre procesos hijos y suma los resultados
export function runParallel(games, minutes, weights = {}, level = 'hard', procs = 4) {
  const file = fileURLToPath(import.meta.url);
  const per = Array.from({ length: procs }, (_, i) => Math.floor(games / procs) + (i < games % procs ? 1 : 0)).filter((n) => n > 0);
  return Promise.all(per.map((n) => new Promise((resolve, reject) => {
    const ch = spawn(process.execPath, [file, '--child', String(n), String(minutes), JSON.stringify(weights), level]);
    let buf = '';
    ch.stdout.on('data', (d) => { buf += d; });
    ch.stderr.on('data', (d) => process.stderr.write(d));
    ch.on('close', (code) => (code === 0 ? resolve(JSON.parse(buf)) : reject(new Error(`hijo terminó con ${code}`))));
  }))).then((parts) => parts.reduce((acc, o) => {
    for (const k of Object.keys(acc)) acc[k] += o[k];
    return acc;
  }, { games: 0, minutes: 0, recepciones: 0, pasaBien: 0, pasaMal: 0, pierdeAntes: 0, tiroOdespeje: 0, goles: 0, presOport: 0, presOk: 0 }));
}

if (process.argv[2] === '--child') {
  const [, , , n, minutes, w, level] = process.argv;
  process.stdout.write(JSON.stringify(runGames(+n, +minutes, JSON.parse(w), level)));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const [games = '16', minutes = '3', w = '{}', level = 'hard', procs = '4'] = process.argv.slice(2);
  const t0 = Date.now();
  const o = await runParallel(+games, +minutes, JSON.parse(w), level, +procs);
  console.log(w, JSON.stringify(summary(o)), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
