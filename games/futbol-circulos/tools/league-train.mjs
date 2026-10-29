// Fase 3: entrenamiento por autojuego de las pautas de decisión (5v5, nivel Difícil).
// La idea del diseño: no se programan reglas como "solo presionan dos"; se dan pautas con un peso
// (src/ai/brain.js, DEFAULT_WEIGHTS) y el autojuego encuentra el equilibrio que GANA partidos jugando
// como un equipo (pases, pases adelante, tiros, pocas pérdidas, sin bola de jugadores).
//
//   node tools/league-train.mjs [generaciones=18] [partidos por candidato=16] [minutos=2] [--resume]
//
// - Optimizador: sep-CMA-ES (CMA-ES con covarianza diagonal) sobre los pesos normalizados a [0, 1].
// - Rivales: liga congelada — la IA por defecto, una variante "solo conservar" y los últimos
//   campeones —, alternando campo. Mismas semillas para todos los candidatos de una generación
//   (números aleatorios comunes): las diferencias vienen de los pesos, no del azar.
// - Puntuación: diferencia de goles + estilo (relativo a la IA por defecto), con castigo si el
//   estilo empeora claramente.
// - Guarda el mejor en src/ai/weights.js y el estado en tools/.league-state.json (para --resume).
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { playGame } from './decisions.mjs';

const FILE = fileURLToPath(import.meta.url);
const STATE = new URL('./.league-state.json', import.meta.url);
const WEIGHTS_OUT = new URL('../src/ai/weights.js', import.meta.url);

// pesos que se entrenan y su rango
const SPACE = {
  shot: [0.6, 4], pass: [0.4, 2], dribble: [0.2, 2], hold: [0, 1], clear: [0.1, 1.5], align: [0.3, 2.5],
  oneTwo: [0, 2.5], quick: [0, 2], firstTime: [0.3, 0.9], firstTimeSlack: [5, 45], execMargin: [-5, 15],
  progress: [0, 1.6], firstShot: [0.1, 0.7], recycle: [0, 0.8], switchPlay: [0, 0.6],
  shortDist: [80, 180], shortPress: [60, 180],
  supPass: [0.5, 4], supDist: [0.3, 3], supSpace: [0.2, 2.5], supAdv: [0, 2], supMate: [0.3, 2.5],
};
const KEYS = Object.keys(SPACE);
const toW = (x) => Object.fromEntries(KEYS.map((k, i) => {
  const [lo, hi] = SPACE[k];
  return [k, +(lo + Math.min(1, Math.max(0, x[i])) * (hi - lo)).toFixed(4)];
}));
const toX = (w) => KEYS.map((k) => (w[k] - SPACE[k][0]) / (SPACE[k][1] - SPACE[k][0]));

// ---------------- partidos en paralelo ----------------
// job: { wCand, wOpp, candRed, seed, minutes } → métricas del candidato y del rival
function runJobs(jobs) {
  const procs = Math.min(cpus().length, 4);
  const chunks = Array.from({ length: procs }, () => []);
  jobs.forEach((j, i) => chunks[i % procs].push({ ...j, i }));
  return Promise.all(chunks.filter((c) => c.length).map((chunk) => new Promise((resolve, reject) => {
    const ch = spawn(process.execPath, [FILE, '--league-child']);
    let buf = '';
    ch.stdout.on('data', (d) => { buf += d; });
    ch.stderr.on('data', (d) => process.stderr.write(d));
    ch.on('close', (code) => (code === 0 ? resolve(JSON.parse(buf)) : reject(new Error(`hijo terminó con ${code}`))));
    ch.stdin.end(JSON.stringify(chunk));
  }))).then((parts) => parts.flat().sort((a, b) => a.i - b.i));
}

if (process.argv[2] === '--league-child') {
  let input = '';
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    const out = JSON.parse(input).map(({ i, wCand, wOpp, candRed, seed, minutes }) => {
      const st = playGame({ minutes, seed, wRed: candRed ? wCand : wOpp, wBlue: candRed ? wOpp : wCand });
      return { i, me: candRed ? st.red : st.blue, them: candRed ? st.blue : st.red, minutes };
    });
    process.stdout.write(JSON.stringify(out));
  });
} else {
  await main();
}

// ---------------- puntuación ----------------
// estilo del equipo en un conjunto de partidos (por minuto / proporciones)
function style(rows) {
  const s = (k) => rows.reduce((a, r) => a + r.me[k], 0);
  const min = rows.reduce((a, r) => a + r.minutes, 0);
  return {
    pases: s('pasaBien') / min,
    adelante: s('adelanteBien') / min,
    tiros: s('tiros') / rows.length,
    perdidas: s('pierdeAntes') / Math.max(1, s('recepciones')),
    bulto: s('bulto') / Math.max(1, s('muestras')),
  };
}

function score(rows, base) {
  const gd = rows.reduce((a, r) => a + r.me.goles - r.them.goles, 0) / rows.length;
  const st = style(rows);
  const rel = (k) => (st[k] - base[k]) / Math.max(1e-6, base[k]);
  // a favor: pases, pases adelante, tiros; en contra: pérdidas y bola de jugadores
  let sc = gd + 0.25 * (rel('pases') + rel('adelante') + rel('tiros') - rel('perdidas') - rel('bulto'));
  // castigo si alguna faceta empeora claramente (no ganar "a cualquier precio")
  for (const k of ['pases', 'adelante', 'tiros']) if (st[k] < base[k] * 0.85) sc -= 0.5;
  for (const k of ['perdidas', 'bulto']) if (st[k] > base[k] * 1.2) sc -= 0.5;
  return { sc, gd, st };
}

// ---------------- sep-CMA-ES ----------------
function gauss() {
  return Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
}

function newCMA(x0, sigma, lambda) {
  const n = x0.length, mu = Math.floor(lambda / 2);
  const wRaw = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
  const wSum = wRaw.reduce((a, b) => a + b, 0);
  const weights = wRaw.map((w) => w / wSum);
  const mueff = 1 / weights.reduce((a, w) => a + w * w, 0);
  const cc = (4 + mueff / n) / (n + 4 + (2 * mueff) / n);
  const cs = (mueff + 2) / (n + mueff + 5);
  // sep-CMA: aprendizaje de la diagonal más rápido (× (n+2)/3)
  const c1 = ((2 / ((n + 1.3) ** 2 + mueff)) * (n + 2)) / 3;
  const cmu = Math.min(1 - c1, ((2 * (mueff - 2 + 1 / mueff)) / ((n + 2) ** 2 + mueff)) * (n + 2) / 3);
  const damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs;
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  return { n, lambda, mu, weights, mueff, cc, cs, c1, cmu, damps, chiN, mean: [...x0], sigma, C: Array(n).fill(1), pc: Array(n).fill(0), ps: Array(n).fill(0), gen: 0 };
}

function ask(cma) {
  return Array.from({ length: cma.lambda }, () => {
    const z = Array.from({ length: cma.n }, gauss);
    return { z, x: cma.mean.map((m, i) => m + cma.sigma * Math.sqrt(cma.C[i]) * z[i]) };
  });
}

// cands ordenados de mejor a peor
function tell(cma, cands) {
  const { n, mu, weights, mueff, cc, cs, c1, cmu, damps, chiN } = cma;
  const old = [...cma.mean];
  const sel = cands.slice(0, mu);
  cma.mean = Array.from({ length: n }, (_, i) => sel.reduce((a, c, k) => a + weights[k] * c.x[i], 0));
  const y = cma.mean.map((m, i) => (m - old[i]) / cma.sigma);
  const zMean = y.map((v, i) => v / Math.sqrt(cma.C[i]));
  cma.ps = cma.ps.map((p, i) => (1 - cs) * p + Math.sqrt(cs * (2 - cs) * mueff) * zMean[i]);
  const psNorm = Math.sqrt(cma.ps.reduce((a, p) => a + p * p, 0));
  const hsig = psNorm / Math.sqrt(1 - (1 - cs) ** (2 * (cma.gen + 1))) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
  cma.pc = cma.pc.map((p, i) => (1 - cc) * p + hsig * Math.sqrt(cc * (2 - cc) * mueff) * y[i]);
  cma.C = cma.C.map((c, i) => {
    const rankMu = sel.reduce((a, s, k) => a + weights[k] * ((s.x[i] - old[i]) / cma.sigma) ** 2, 0);
    return Math.max(1e-6, (1 - c1 - cmu) * c + c1 * (cma.pc[i] ** 2 + (1 - hsig) * cc * (2 - cc) * c) + cmu * rankMu);
  });
  cma.sigma = Math.min(0.5, cma.sigma * Math.exp((cs / damps) * (psNorm / chiN - 1)));
  // la media no sale del espacio válido
  cma.mean = cma.mean.map((m) => Math.min(1, Math.max(0, m)));
  cma.gen++;
}

// ---------------- bucle principal ----------------
async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const resume = process.argv.includes('--resume');
  const [gens = 18, games = 16, minutes = 2] = args.map(Number);
  const { DEFAULT_WEIGHTS } = await import('../src/ai/brain.js');
  const base0 = Object.fromEntries(KEYS.map((k) => [k, DEFAULT_WEIGHTS[k]]));
  // rivales congelados con todos sus pesos explícitos (weights.js cambia durante el entrenamiento y el
  // cerebro lo fusiona; así "la IA por defecto" no se mueve)
  const conserve = { ...base0, progress: 0, space: 0, runs: 0, firstShot: 9 }; // rival "solo conservar"
  const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

  let st;
  if (resume && existsSync(STATE)) {
    st = JSON.parse(readFileSync(STATE, 'utf8'));
    log(`reanudando en la generación ${st.cma.gen}`);
  } else {
    // estilo de referencia: la IA por defecto contra la liga inicial (mismas semillas)
    const jobs = Array.from({ length: games * 2 }, (_, g) => ({ wCand: base0, wOpp: g % 2 ? conserve : base0, candRed: g % 4 < 2, seed: 900000 + g, minutes }));
    const rows = await runJobs(jobs);
    const ref = score(rows, style(rows));
    log(`referencia (IA por defecto): ${JSON.stringify(ref.st)}`);
    st = { cma: newCMA(toX(base0), 0.12, 8), base: ref.st, champions: [], best: null, history: [] };
  }

  for (let g = st.cma.gen; g < gens; g++) {
    const t0 = Date.now();
    const cma = st.cma;
    const cands = ask(cma);
    // la propia media también se evalúa (es la mejor estimación actual)
    cands.push({ x: [...cma.mean], z: null, isMean: true });
    // liga: por defecto, "solo conservar" y los últimos campeones
    const league = [base0, conserve, ...st.champions.slice(-3)];
    const jobsFor = (w) => Array.from({ length: games }, (_, k) => ({
      wCand: w, wOpp: league[k % league.length], candRed: k % 2 === 0, seed: g * 1000 + k, minutes,
    }));
    const all = cands.flatMap((c) => jobsFor(toW(c.x)));
    const rows = await runJobs(all);
    cands.forEach((c, ci) => { Object.assign(c, score(rows.slice(ci * games, (ci + 1) * games), st.base)); });
    const ranked = cands.filter((c) => !c.isMean).sort((a, b) => b.sc - a.sc);
    tell(cma, ranked);
    const top = [...cands].sort((a, b) => b.sc - a.sc)[0];
    if (!st.best || top.sc > st.best.sc) st.best = { sc: top.sc, gd: top.gd, st: top.st, w: toW(top.x), gen: g };
    st.champions.push(toW(top.x));
    st.history.push({ gen: g, best: +top.sc.toFixed(3), gd: +top.gd.toFixed(2), mean: +(cands.find((c) => c.isMean).sc).toFixed(3), sigma: +cma.sigma.toFixed(3) });
    writeFileSync(STATE, JSON.stringify(st));
    writeFileSync(WEIGHTS_OUT, `// Pesos entrenados por autojuego (tools/league-train.mjs, fase 3). Se fusionan sobre
// DEFAULT_WEIGHTS de brain.js. Mejor de la generación ${st.best.gen}: puntuación ${st.best.sc.toFixed(3)},
// diferencia de goles ${st.best.gd.toFixed(2)} por partido contra la liga.
export default ${JSON.stringify(st.best.w, null, 2)};
`);
    log(`gen ${g}: mejor ${top.sc.toFixed(3)} (goles ${top.gd.toFixed(2)}) · media ${st.history.at(-1).mean} · σ ${cma.sigma.toFixed(3)} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  // la media de la distribución es la estimación más robusta (el "mejor" de cada generación tiene
  // la suerte de la muestra a favor): se guarda aparte para validarla también
  writeFileSync(new URL('./.league-mean.json', import.meta.url), JSON.stringify(toW(st.cma.mean), null, 2));
  log(`fin. Mejor: ${JSON.stringify(st.best)}`);
  log(`media final: ${JSON.stringify(toW(st.cma.mean))}`);
}
