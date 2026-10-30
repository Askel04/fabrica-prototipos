// Fase 3: entrenamiento por autojuego de las pautas de decisión (5v5, nivel Difícil).
// La idea del diseño: no se programan reglas como "solo presionan dos"; se dan pautas con un peso
// (src/ai/brain.js, DEFAULT_WEIGHTS) y el autojuego encuentra el equilibrio que GANA partidos jugando
// como un equipo (pases, pases adelante, tiros, pocas pérdidas, sin bola de jugadores).
//
//   node tools/league-train.mjs [generaciones=12] [partidos por candidato=24] [minutos=3] [--resume]
//
// - Optimizador: sep-CMA-ES (CMA-ES con covarianza diagonal) sobre los pesos normalizados a [0, 1].
// - Rivales: liga congelada — la IA por defecto, una variante "solo conservar" y los últimos
//   campeones —, alternando campo. Mismas semillas para todos los candidatos de una generación
//   (números aleatorios comunes): las diferencias vienen de los pesos, no del azar.
// - Puntuación: diferencia de goles + estilo (relativo a la IA por defecto), con castigo si el
//   estilo empeora claramente.
// - Puntuación densa (2.º intento): además de goles, tiros a puerta, posesión peligrosa y
//   recuperaciones en campo rival; los 2 mejores de cada generación se reevalúan con semillas nuevas.
// - Guarda el mejor en tools/.league-best.json (pasa a src/ai/weights.js solo si supera la
//   validación mano a mano) y el estado en tools/.league-state.json (para --resume).
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { playGame } from './decisions.mjs';

const FILE = fileURLToPath(import.meta.url);
const STATE = new URL('./.league-state.json', import.meta.url);
// el mejor se guarda aparte (no en src/ai/weights.js): solo pasa al juego si supera la validación
const BEST_OUT = new URL('./.league-best.json', import.meta.url);

// pesos que se entrenan y su rango
// Segundo intento: solo los 12 pesos con más efecto o con tendencia clara en el primero (menos
// dimensiones = menos partidos para la misma precisión). El resto se queda en su valor por defecto.
const SPACE = {
  pass: [0.3, 1.6], dribble: [0.3, 1.8], clear: [0.05, 1], align: [0.5, 2.2], quick: [0, 2],
  firstTimeSlack: [8, 45], execMargin: [-2, 14], progress: [0, 1.2], recycle: [0, 0.9], switchPlay: [0, 0.6],
  supAdv: [0.2, 2.2], supDist: [0.3, 2.5],
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
  const n = rows.length;
  const diff = (k) => rows.reduce((a, r) => a + r.me[k] - r.them[k], 0) / n;
  const gd = diff('goles');
  // señal densa (los goles solos son demasiado escasos en partidos cortos): tiros a puerta, segundos
  // de posesión peligrosa (último tercio rival) y recuperaciones en campo rival, contra el rival
  const dense = 0.3 * diff('tiros') + 0.1 * (diff('peligro') / 60 / 10) + 0.1 * diff('recupRival');
  const st = style(rows);
  const rel = (k) => (st[k] - base[k]) / Math.max(1e-6, base[k]);
  // a favor: pases, pases adelante, tiros; en contra: pérdidas y bola de jugadores
  let sc = gd + dense + 0.25 * (rel('pases') + rel('adelante') + rel('tiros') - rel('perdidas') - rel('bulto'));
  // castigo si alguna faceta empeora claramente (no ganar "a cualquier precio")
  for (const k of ['pases', 'adelante', 'tiros']) if (st[k] < base[k] * 0.85) sc -= 0.5;
  for (const k of ['perdidas', 'bulto']) if (st[k] > base[k] * 1.2) sc -= 0.5;
  return { sc, gd, st, dense };
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
  const [gens = 12, games = 24, minutes = 3] = args.map(Number);
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
    st = { cma: newCMA(toX(base0), 0.15, 6), base: ref.st, champions: [], best: null, history: [] };
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
    // reevaluar a los 2 mejores (media incluida) con semillas nuevas: el líder de una sola tanda
    // suele serlo por suerte; solo la media de las dos tandas cuenta para campeón y "mejor"
    const two = [...cands].sort((a, b) => b.sc - a.sc).slice(0, 2);
    const more = await runJobs(two.flatMap((c) => Array.from({ length: games }, (_, k) => ({
      wCand: toW(c.x), wOpp: league[k % league.length], candRed: k % 2 === 1, seed: g * 1000 + 500 + k, minutes,
    }))));
    two.forEach((c, ci) => {
      const first = rows.slice(cands.indexOf(c) * games, (cands.indexOf(c) + 1) * games);
      Object.assign(c, { re: score([...first, ...more.slice(ci * games, (ci + 1) * games)], st.base) });
    });
    const top = two.sort((a, b) => b.re.sc - a.re.sc)[0];
    if (!st.best || top.re.sc > st.best.sc) st.best = { sc: top.re.sc, gd: top.re.gd, st: top.re.st, w: toW(top.x), gen: g };
    st.champions.push(toW(top.x));
    st.history.push({ gen: g, best: +top.re.sc.toFixed(3), gd: +top.re.gd.toFixed(2), mean: +(cands.find((c) => c.isMean).sc).toFixed(3), sigma: +cma.sigma.toFixed(3) });
    writeFileSync(STATE, JSON.stringify(st));
    writeFileSync(BEST_OUT, JSON.stringify(st.best, null, 2));
    log(`gen ${g}: líder reevaluado ${top.re.sc.toFixed(3)} (goles ${top.re.gd.toFixed(2)}, densa ${top.re.dense.toFixed(2)}) · media ${st.history.at(-1).mean} · σ ${cma.sigma.toFixed(3)} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  // la media de la distribución es la estimación más robusta (el "mejor" de cada generación tiene
  // la suerte de la muestra a favor): se guarda aparte para validarla también
  writeFileSync(new URL('./.league-mean.json', import.meta.url), JSON.stringify(toW(st.cma.mean), null, 2));
  log(`fin. Mejor: ${JSON.stringify(st.best)}`);
  log(`media final: ${JSON.stringify(toW(st.cma.mean))}`);
}
