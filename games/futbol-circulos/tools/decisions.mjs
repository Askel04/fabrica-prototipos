// Métricas de decisión en partido (IA contra IA), en paralelo:
//  - pases: % que llegan a un compañero, pases buenos por minuto
//  - pérdidas antes de soltar: % de recepciones en las que el rival roba antes de que el receptor
//    pase, tire o despeje
//  - presión: % de recepciones rivales con un defensor a < 120 en las que alguno llega a < 60 del
//    receptor en ≤ 0,5 s
//  - intención: pases buenos hacia delante (avanzan ≥ 60), pases al hueco (intentos y acierto),
//    tiros a puerta (golpeos que, según su trayectoria prevista, acaban dentro)
//  - espaciado: % del tiempo con ≥ 3 compañeros a menos de 100 del balón
//  - dominio: ticks de posesión peligrosa (último toque propio y balón en el último tercio rival) y
//    recuperaciones en campo rival (señales más densas que los goles para el autojuego)
//  - goles por partido
// Uso: node tools/decisions.mjs [partidos=16] [minutos=3] [pesos JSON={}] [nivel=hard] [procesos=4]
// Los pesos se aplican a los dos equipos (para comparar estilos de juego, no fuerza).
// instrument(m) mide cada equipo por separado; lo usa también tools/league-train.mjs.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Match } from '../src/sim/match.js';
import { trajectory } from '../src/ai/evaluate.js';
import { seeded } from '../src/drills/drills.js';
import { CONFIG as C } from '../src/config.js';

const FIELDS = ['recepciones', 'pasaBien', 'pasaMal', 'pierdeAntes', 'tiroOdespeje', 'presOport', 'presOk',
  'adelanteBien', 'atrasBien', 'huecoIntentos', 'huecoBien', 'tiros', 'bulto', 'muestras', 'goles',
  'peligro', 'recupRival'];
const zero = () => Object.fromEntries(FIELDS.map((k) => [k, 0]));

// Engancha las métricas a un partido. Devuelve { st: { red, blue }, after() }: after() se llama
// tras cada m.step(). Las métricas de presión se apuntan al equipo que DEFIENDE.
export function instrument(m) {
  const st = { red: zero(), blue: zero() };
  const other = (t) => (t === 'red' ? 'blue' : 'red');
  let cur = null, pending = null, press = null;
  const touch = m.touch.bind(m);
  m.touch = (p) => {
    const prev = m.lastTouch;
    if (prev !== p) {
      if (pending && p !== pending.p) {
        const s = st[pending.p.team];
        const good = p.team === pending.p.team;
        if (good) s.pasaBien++; else s.pasaMal++;
        const dx = (m.ball.x - pending.x0) * pending.p.attack;
        if (good && dx >= 60) s.adelanteBien++;
        if (good && dx <= -40) s.atrasBien++;
        if (pending.kind === 'space' && good) s.huecoBien++;
        pending = null;
      }
      if (cur && cur !== p) { if (p.team !== cur.team) st[cur.team].pierdeAntes++; cur = null; }
      if (prev && prev.team !== p.team && m.ball.x * p.attack > 0) st[p.team].recupRival++;
      if (prev && prev.team === p.team) {
        st[p.team].recepciones++;
        cur = p;
        const near = Math.min(...m.players.filter((q) => q.team !== p.team).map((q) => Math.hypot(q.disc.x - p.disc.x, q.disc.y - p.disc.y)));
        press = near < 120 ? { p, t: m.tick, ok: near < 60 } : null;
        if (press) st[other(p.team)].presOport++;
      }
    }
    touch(p);
  };
  m.events.kick = (p) => {
    const s = st[p.team];
    if (cur === p) {
      if (p.act?.type === 'pass' || (p.firstTime && !p.firstTime.shot)) {
        pending = { p, x0: m.ball.x, kind: p.act?.kind };
        if (p.act?.kind === 'space') s.huecoIntentos++;
      } else s.tiroOdespeje++;
      cur = null;
    }
    // tiro a puerta: cualquier golpeo cuya trayectoria prevista acaba dentro de la portería rival
    const b = m.ball, path = trajectory(b.x, b.y, b.vx, b.vy, 150);
    if (path[path.length - 1].goal === p.attack) s.tiros++;
  };
  const after = () => {
    if (press && !press.ok) {
      if (m.tick - press.t > 30) press = null;
      else if (m.players.some((q) => q.team !== press.p.team && Math.hypot(q.disc.x - press.p.disc.x, q.disc.y - press.p.disc.y) < 60)) press.ok = true;
    }
    if (press?.ok) { st[other(press.p.team)].presOk++; press = null; }
    const lt = m.lastTouch;
    if (lt && m.state === 'play' && m.ball.x * lt.attack > C.FIELD_W / 3) st[lt.team].peligro++;
    if (m.tick % 10 === 0 && m.state === 'play') {
      for (const team of ['red', 'blue']) {
        const n = m.players.filter((q) => q.team === team && Math.hypot(q.disc.x - m.ball.x, q.disc.y - m.ball.y) < 100).length;
        st[team].muestras++;
        if (n >= 3) st[team].bulto++;
      }
    }
  };
  return { st, after };
}

// Juega un partido 5v5 (o 3v3) con pesos por equipo y semilla opcional (mismo azar para todos los
// que usen esa semilla: números aleatorios comunes). Devuelve las métricas por equipo.
export function playGame({ minutes = 3, wRed = {}, wBlue = {}, level = 'hard', size = 5, seed = null }) {
  const real = Math.random;
  if (seed !== null) Math.random = seeded(seed);
  try {
    const m = new Match({ humanTeam: null, teamSize: size, stadium: size >= 5 ? 'big' : 'classic', levels: { red: level, blue: level } });
    m.brains.red.w = { ...m.brains.red.w, ...wRed };
    m.brains.blue.w = { ...m.brains.blue.w, ...wBlue };
    const { st, after } = instrument(m);
    for (let t = 0; t < 3600 * minutes; t++) {
      m.step();
      after();
    }
    st.red.goles = m.score.red;
    st.blue.goles = m.score.blue;
    return st;
  } finally {
    Math.random = real;
  }
}

// partidos con los mismos pesos en los dos equipos; suma de ambos equipos
export function runGames(games, minutes, weights = {}, level = 'hard', size = 5) {
  const out = { ...zero(), games: 0, minutes: 0 };
  for (let g = 0; g < games; g++) {
    const st = playGame({ minutes, wRed: weights, wBlue: weights, level, size });
    for (const k of FIELDS) out[k] += st.red[k] + st.blue[k];
    out.games++;
    out.minutes += minutes;
  }
  return out;
}

export function summary(o) {
  const passes = o.pasaBien + o.pasaMal;
  const pct = (a, b) => `${Math.round((a / Math.max(1, b)) * 100)}%`;
  const perTeamMin = (a) => +(a / Math.max(1, o.minutes) / 2).toFixed(1);
  return {
    partidos: o.games,
    pasesOk: pct(o.pasaBien, passes),
    pasesBuenosMin: perTeamMin(o.pasaBien),
    pierdeAntes: pct(o.pierdeAntes, o.recepciones),
    recepMin: perTeamMin(o.recepciones),
    golesPartido: +(o.goles / Math.max(1, o.games)).toFixed(2),
    presionATiempo: pct(o.presOk, o.presOport),
    adelanteBuenosMin: perTeamMin(o.adelanteBien),
    atrasBuenosMin: perTeamMin(o.atrasBien),
    huecoMin: perTeamMin(o.huecoIntentos),
    huecoOk: pct(o.huecoBien, o.huecoIntentos),
    tirosPartido: +(o.tiros / Math.max(1, o.games)).toFixed(1),
    bulto: `${((o.bulto / Math.max(1, o.muestras)) * 100).toFixed(1)}%`,
  };
}

// reparte los partidos entre procesos hijos y suma los resultados
export function runParallel(games, minutes, weights = {}, level = 'hard', procs = 4) {
  const file = fileURLToPath(import.meta.url);
  const per = Array.from({ length: procs }, (_, i) => Math.floor(games / procs) + (i < games % procs ? 1 : 0)).filter((n) => n > 0);
  return Promise.all(per.map((n) => new Promise((resolve, reject) => {
    const ch = spawn(process.execPath, [file, '--decisions-child', String(n), String(minutes), JSON.stringify(weights), level]);
    let buf = '';
    ch.stdout.on('data', (d) => { buf += d; });
    ch.stderr.on('data', (d) => process.stderr.write(d));
    ch.on('close', (code) => (code === 0 ? resolve(JSON.parse(buf)) : reject(new Error(`hijo terminó con ${code}`))));
  }))).then((parts) => parts.reduce((acc, o) => {
    for (const k of Object.keys(acc)) acc[k] += o[k];
    return acc;
  }, { ...zero(), games: 0, minutes: 0 }));
}

if (process.argv[2] === '--decisions-child') {
  const [, , , n, minutes, w, level] = process.argv;
  process.stdout.write(JSON.stringify(runGames(+n, +minutes, JSON.parse(w), level)));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const [games = '16', minutes = '3', w = '{}', level = 'hard', procs = '4'] = process.argv.slice(2);
  const t0 = Date.now();
  const o = await runParallel(+games, +minutes, JSON.parse(w), level, +procs);
  console.log(w, JSON.stringify(summary(o)), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
