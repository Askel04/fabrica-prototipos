// Fase 4: escalera de niveles. Cada nivel es un θ (src/ai/params.js) que degrada al experto en
// técnica (ensayos del motor, mando) y decisiones (reacción, ruido, pautas).
//   node tools/levels.mjs table [partidos=40] [minutos=3]    → nivel contra el siguiente (y contra el
//                                                               de dos más arriba), Elo de la escalera
//   node tools/levels.mjs calibrate [partidos=40] [minutos=3] → busca, de arriba abajo, el θ de cada
//                                                               nivel para que el de encima gane
//                                                               ~70 % de los partidos decididos
// Los partidos se reparten entre procesos hijos (uno por núcleo) con semillas fijas.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CONFIG as C } from '../src/config.js';
import { playGame } from './decisions.mjs';

const LEVELS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];
const TARGET = [0.65, 0.75]; // % de victorias (de los decididos) del nivel de arriba
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

function runJobs(jobs) {
  const procs = Math.max(1, availableParallelism());
  const chunks = Array.from({ length: procs }, (_, i) => jobs.filter((_, k) => k % procs === i)).filter((c) => c.length);
  return Promise.all(chunks.map((chunk) => new Promise((resolve, reject) => {
    const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), '--levels-child']);
    let buf = '';
    ch.stdout.on('data', (d) => { buf += d; });
    ch.stderr.on('data', (d) => process.stderr.write(d));
    ch.on('close', (code) => (code === 0 ? resolve(JSON.parse(buf)) : reject(new Error(`hijo terminó con ${code}`))));
    ch.stdin.end(JSON.stringify(chunk));
  }))).then((parts) => parts.flat());
}

// θ alto contra θ bajo: victorias, empates, derrotas (del alto) y medias por partido
async function duel(hi, lo, games, minutes, seed0) {
  const rows = await runJobs(Array.from({ length: games }, (_, k) => ({ hi, lo, minutes, seed: seed0 + k, hiRed: k % 2 === 0 })));
  const w = rows.filter((r) => r.gh > r.gl).length, l = rows.filter((r) => r.gh < r.gl).length;
  const avg = (f) => +(rows.reduce((a, r) => a + f(r), 0) / rows.length).toFixed(2);
  return {
    w, d: games - w - l, l, win: w / Math.max(1, w + l),
    goles: `${avg((r) => r.gh)}-${avg((r) => r.gl)}`, tiros: `${avg((r) => r.th)}-${avg((r) => r.tl)}`, pases: `${avg((r) => r.ph)}-${avg((r) => r.pl)}`,
  };
}

const fmt = (r) => `${r.w}-${r.d}-${r.l} (${Math.round(r.win * 100)} % de los decididos) · goles ${r.goles} · tiros ${r.tiros} · pases buenos ${r.pases}`;

async function main() {
  const [mode = 'table', games = 40, minutes = 3] = process.argv.slice(2).map((v, i) => (i ? Number(v) : v));
  const t0 = Date.now();
  if (mode === 'calibrate') {
    // de arriba abajo: l6 = experto (θ = 1); cada nivel, el θ con el que el de encima gana ~70 %
    const th = { l6: 1 };
    for (let i = LEVELS.length - 2; i >= 0; i--) {
      const up = th[LEVELS[i + 1]];
      let lo = 0, hi = up, best = null;
      for (let it = 0; it < 4; it++) {
        const mid = +((lo + hi) / 2).toFixed(3);
        const r = await duel(up, mid, games, minutes, 7000 + i * 100 + it * 10000);
        log(`${LEVELS[i]} θ=${mid} contra θ=${up}: ${fmt(r)}`);
        if (!best || Math.abs(r.win - 0.7) < Math.abs(best.win - 0.7)) best = { th: mid, win: r.win };
        if (r.win > TARGET[1]) lo = mid; // el de abajo es demasiado flojo: subirle el θ
        else if (r.win < TARGET[0]) hi = mid; // demasiado parecido: bajarle el θ
        else break;
      }
      th[LEVELS[i]] = best.th;
      log(`→ ${LEVELS[i]} = θ ${best.th} (${Math.round(best.win * 100)} %) · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    log('niveles:', JSON.stringify(th));
    return;
  }
  // tabla de la escalera configurada
  const th = LEVELS.map((n) => C.AI_LEVELS[n].theta);
  log('θ:', JSON.stringify(Object.fromEntries(LEVELS.map((n, i) => [n, th[i]]))));
  let elo = 0;
  const elos = [0];
  for (let i = 1; i < LEVELS.length; i++) {
    const r = await duel(th[i], th[i - 1], games, minutes, 9000 + i * 100);
    const p = Math.min(0.97, Math.max(0.03, r.win));
    elo += 400 * Math.log10(p / (1 - p));
    elos.push(Math.round(elo));
    log(`${LEVELS[i]} contra ${LEVELS[i - 1]}: ${fmt(r)}`);
  }
  for (let i = 2; i < LEVELS.length; i += 2) {
    const r = await duel(th[i], th[i - 2], games, minutes, 9500 + i * 100);
    log(`${LEVELS[i]} contra ${LEVELS[i - 2]}: ${fmt(r)}`);
  }
  log('Elo (l1 = 0):', JSON.stringify(Object.fromEntries(LEVELS.map((n, i) => [n, elos[i]]))), `· ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// --- hijo: juega una lista de partidos { hi, lo, seed, minutes, hiRed } ---
if (process.argv[2] === '--levels-child') {
  let buf = '';
  process.stdin.on('data', (d) => { buf += d; });
  process.stdin.on('end', () => {
    const out = JSON.parse(buf).map((j) => {
      C.AI_LEVELS._hi = { theta: j.hi };
      C.AI_LEVELS._lo = { theta: j.lo };
      const st = playGame({ minutes: j.minutes, seed: j.seed, levels: j.hiRed ? { red: '_hi', blue: '_lo' } : { red: '_lo', blue: '_hi' } });
      const [h, l] = j.hiRed ? [st.red, st.blue] : [st.blue, st.red];
      return { gh: h.goles, gl: l.goles, th: h.tiros, tl: l.tiros, ph: h.pasaBien, pl: l.pasaBien };
    });
    process.stdout.write(JSON.stringify(out));
  });
} else if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
