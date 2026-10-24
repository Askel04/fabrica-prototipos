// Entrenamiento de los pesos del cerebro por autojuego (estrategia evolutiva + banco de rivales),
// al estilo de los bots de RLGym / Unity ML-Agents pero optimizando pesos de utilidad, no una red.
//   node tools/train.mjs [generaciones] [población] [partidos por candidato]
// Escribe el mejor resultado en src/ai/weights.js.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

const MINUTES = 3; // duración de cada partido de entrenamiento
const LEVEL = 'hard'; // los pesos se entrenan con los diales de Difícil (ejecución casi perfecta)

if (!isMainThread) {
  // ---- trabajador: juega partidos y devuelve la recompensa media del candidato ----
  const { Match } = await import('../src/sim/match.js');
  parentPort.on('message', ({ id, cand, opps }) => {
    let fitness = 0;
    opps.forEach((opp, i) => {
      const candRed = i % 2 === 0; // alterna campo
      const m = new Match({ humanTeam: null, levels: { red: LEVEL, blue: LEVEL } });
      m.brains.red.w = { ...m.brains.red.w, ...(candRed ? cand : opp) };
      m.brains.blue.w = { ...m.brains.blue.w, ...(candRed ? opp : cand) };
      m.startKickoff(candRed ? 'blue' : 'red');
      for (let t = 0; t < 60 * 60 * MINUTES; t++) m.step();
      const me = candRed ? 'red' : 'blue', them = candRed ? 'blue' : 'red';
      // recompensa ("reward shaping" como en RLGym): goles, más extras por tiros, por pases
      // completados (queremos que combinen) y castigo por pérdidas y autogoles
      fitness += (m.score[me] - m.score[them]) +
        0.1 * (m.stats[me].shots - m.stats[them].shots) +
        0.02 * m.stats[me].passes - 0.02 * m.stats[me].lost -
        0.5 * m.stats[me].ownGoals;
    });
    parentPort.postMessage({ id, fitness: fitness / opps.length });
  });
} else {
  const { DEFAULT_WEIGHTS } = await import('../src/ai/brain.js');
  const TRAINED = (await import('../src/ai/weights.js')).default;
  const [gens = 25, popSize = 16, games = 8] = process.argv.slice(2).map(Number);
  const keys = Object.keys(DEFAULT_WEIGHTS);
  const start = { ...DEFAULT_WEIGHTS, ...TRAINED };

  const workers = Array.from({ length: Math.max(1, cpus().length) }, () =>
    new Worker(fileURLToPath(import.meta.url), { workerData: {} }));
  let nextId = 0;
  const pending = new Map();
  workers.forEach((w) => w.on('message', ({ id, fitness }) => { pending.get(id)(fitness); pending.delete(id); }));
  const evaluate = (cand, opps, wi) => new Promise((res) => {
    const id = nextId++;
    pending.set(id, res);
    workers[wi % workers.length].postMessage({ id, cand, opps });
  });

  const gauss = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
  const mutate = (w, sigma) => {
    const out = {};
    for (const k of keys) out[k] = Math.max(0, w[k] * Math.exp(gauss() * sigma) + gauss() * sigma * 0.05);
    return out;
  };

  // banco de rivales: versiones anteriores (como en el autojuego de ML-Agents)
  let best = start;
  const pool = [start, DEFAULT_WEIGHTS];
  let sigma = 0.3;
  console.log(`Entrenando ${gens} generaciones × ${popSize} candidatos × ${games} partidos de ${MINUTES} min (${workers.length} hilos)`);
  for (let g = 0; g < gens; g++) {
    const opps = Array.from({ length: games }, (_, i) => pool[(pool.length - 1 - (i % Math.min(pool.length, 4))) ] || best);
    const pop = [best, ...Array.from({ length: popSize - 1 }, () => mutate(best, sigma))];
    const fits = await Promise.all(pop.map((c, i) => evaluate(c, opps, i)));
    const order = fits.map((f, i) => [f, i]).sort((a, b) => b[0] - a[0]);
    // recombinación de los mejores (media ponderada de la élite)
    const elite = order.slice(0, Math.max(2, Math.floor(popSize / 4)));
    const mean = {};
    for (const k of keys) {
      let s = 0, ws = 0;
      elite.forEach(([, i], r) => { const wgt = elite.length - r; s += pop[i][k] * wgt; ws += wgt; });
      mean[k] = s / ws;
    }
    // el nuevo centro es la media de la élite (más robusto al ruido de los partidos que quedarse con el mejor)
    best = mean;
    if (g % 3 === 2) pool.push(best);
    sigma = Math.max(0.08, sigma * 0.95);
    console.log(`gen ${g + 1}: mejor ${order[0][0].toFixed(2)} (actual ${fits[0].toFixed(2)}) sigma ${sigma.toFixed(2)}`);
  }

  // validación final: el entrenado contra los pesos por defecto
  const val = await Promise.all(Array.from({ length: 8 }, (_, i) => evaluate(best, Array(6).fill(DEFAULT_WEIGHTS), i)));
  const avg = val.reduce((a, b) => a + b, 0) / val.length;
  console.log(`validación contra pesos por defecto: ${avg.toFixed(2)} (recompensa media por partido)`);
  const rounded = Object.fromEntries(keys.map((k) => [k, +best[k].toFixed(3)]));
  writeFileSync(new URL('../src/ai/weights.js', import.meta.url),
    `// Pesos entrenados por autojuego (los genera tools/train.mjs). Vacío = valores por defecto de brain.js.\n` +
    `// Validación contra los pesos por defecto: ${avg.toFixed(2)} de recompensa media por partido de ${MINUTES} min.\n` +
    `export default ${JSON.stringify(rounded, null, 2)};\n`);
  console.log(JSON.stringify(rounded));
  workers.forEach((w) => w.terminate());
}
