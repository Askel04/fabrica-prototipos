// Liga entre niveles de IA para calibrar la dificultad: node tools/ladder.mjs [partidos por cruce] [minutos]
// Muestra % de victorias (empate = media victoria) y un Elo estimado (Fácil fijado en 1000).
import { playMatch } from './play.mjs';

const [games = 30, minutes = 4] = process.argv.slice(2).map(Number);
const levels = ['easy', 'normal', 'hard', 'mate'];
const results = {};
// estadísticas de estilo por nivel (suma de todos sus partidos)
const style = Object.fromEntries(levels.map((l) => [l, { min: 0, goals: 0, passes: 0, lost: 0, shots: 0, sweeps: 0, thirdDepth: 0, thirdDepthN: 0, steals: 0, rotations: 0 }]));
const addStyle = (lvl, st, goals) => {
  const s = style[lvl];
  s.min += minutes; s.goals += goals;
  for (const k of ['passes', 'lost', 'shots', 'sweeps', 'thirdDepth', 'thirdDepthN', 'steals', 'rotations']) s[k] += st[k];
};
const t0 = Date.now();

for (let i = 0; i < levels.length; i++) {
  for (let j = i + 1; j < levels.length; j++) {
    const a = levels[i], b = levels[j];
    let pts = 0, gf = 0, ga = 0;
    for (let g = 0; g < games; g++) {
      const aRed = g % 2 === 0; // alterna campo
      const r = aRed ? playMatch(a, b, minutes) : playMatch(b, a, minutes);
      const mine = aRed ? r.score.red : r.score.blue, theirs = aRed ? r.score.blue : r.score.red;
      addStyle(a, r.stats[aRed ? 'red' : 'blue'], mine);
      addStyle(b, r.stats[aRed ? 'blue' : 'red'], theirs);
      gf += mine; ga += theirs;
      pts += mine > theirs ? 1 : mine === theirs ? 0.5 : 0;
    }
    results[`${a}-${b}`] = { a, b, score: pts / games, gf, ga };
  }
}

// Elo por ajuste iterativo de las puntuaciones esperadas
const elo = Object.fromEntries(levels.map((l) => [l, 1000]));
for (let it = 0; it < 2000; it++) {
  for (const r of Object.values(results)) {
    const exp = 1 / (1 + 10 ** ((elo[r.b] - elo[r.a]) / 400));
    const k = 2 * (r.score - exp);
    elo[r.a] += k;
    elo[r.b] -= k;
  }
  const shift = elo.easy - 1000;
  for (const l of levels) elo[l] -= shift;
}

const names = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil', mate: 'Compañero' };
console.log(`Liga: ${games} partidos de ${minutes} min por cruce (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
for (const r of Object.values(results)) {
  console.log(`${names[r.a].padEnd(9)} vs ${names[r.b].padEnd(9)}  ${(r.score * 100).toFixed(0).padStart(3)} % para ${names[r.a]}  goles ${r.gf}-${r.ga}`);
}
console.log('\nElo: ' + levels.map((l) => `${names[l]} ${Math.round(elo[l])}`).join(' · '));

console.log('\nEstilo por nivel (por minuto salvo indicado):');
console.log('Nivel      goles  pases  %pase  tiros  robos  rotac.  salidas3º  prof. 3º en ataque');
for (const l of levels) {
  const s = style[l];
  const f = (v) => (v / s.min).toFixed(2).padStart(6);
  const pct = ((100 * s.passes) / Math.max(1, s.passes + s.lost)).toFixed(0).padStart(5);
  const gk = (s.thirdDepth / Math.max(1, s.thirdDepthN)).toFixed(0).padStart(8);
  console.log(`${names[l].padEnd(9)} ${f(s.goals)} ${f(s.passes)} ${pct} ${f(s.shots)} ${f(s.steals)} ${f(s.rotations)} ${f(s.sweeps)}    ${gk}`);
}
