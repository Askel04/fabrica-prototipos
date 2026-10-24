// Liga entre niveles de IA para calibrar la dificultad: node tools/ladder.mjs [partidos por cruce] [minutos]
// Muestra % de victorias (empate = media victoria) y un Elo estimado (Fácil fijado en 1000).
import { playMatch } from './play.mjs';

const [games = 30, minutes = 4] = process.argv.slice(2).map(Number);
const levels = ['easy', 'normal', 'hard', 'mate'];
const results = {};
const t0 = Date.now();

for (let i = 0; i < levels.length; i++) {
  for (let j = i + 1; j < levels.length; j++) {
    const a = levels[i], b = levels[j];
    let pts = 0, gf = 0, ga = 0;
    for (let g = 0; g < games; g++) {
      const aRed = g % 2 === 0; // alterna campo
      const r = aRed ? playMatch(a, b, minutes) : playMatch(b, a, minutes);
      const mine = aRed ? r.score.red : r.score.blue, theirs = aRed ? r.score.blue : r.score.red;
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
