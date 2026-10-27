// Examen de habilidades individuales (fase 0 del plan de IA).
// Uso: node tools/drills.mjs [skillset=actual] [intentos=200] [ejercicio|todos] [semilla=1]
// Cada ejercicio se repite con posiciones y velocidades al azar (semilla fija: tandas repetibles).
import { DRILLS, DrillRun, seeded } from '../src/drills/drills.js';
import { SKILLSETS } from '../src/drills/skillsets.js';

// objetivos de aprobado del nivel máximo (plan, fase 1)
export const TARGETS = {
  recepcion: 'ok ≥ 95 %, tiempo ≤ 0,35 s',
  controlPase: 'soltarEn1sNormal ≥ 90 % (de espaldas, < 25°, el mínimo físico pasa de 1 s), llega ≥ 85 %',
  primeraPresion: 'ok ≥ 80 %',
  conduccion: 'recta ≥ 95 % a ≥ 0,72 (máx. físico ≈ 0,77); zigzag ≥ 90 % a ≥ 0,6',
  giro: 'ok ≥ 90 % (≤ 1,5 s)',
  unoContraUno: 'ok ≥ 40 %, conserva2s ≥ 80 %',
  tiro: 'ok ≥ 85 %',
};

export function exam(skillName = 'actual', trials = 200, only = 'todos', seed = 1) {
  const skill = SKILLSETS[skillName];
  if (!skill) throw new Error(`skillset desconocido: ${skillName} (hay: ${Object.keys(SKILLSETS).join(', ')})`);
  const names = only === 'todos' ? Object.keys(DRILLS) : [only];
  const out = [];
  for (const name of names) {
    const real = Math.random;
    Math.random = seeded(seed * 7919 + name.length); // también el ruido interno de las habilidades
    const t0 = Date.now();
    const res = new DrillRun(name, skill, seed).run(trials);
    Math.random = real;
    out.push({ ...res, objetivo: TARGETS[name], ms: Date.now() - t0 });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [skill = 'actual', trials = '200', only = 'todos', seed = '1'] = process.argv.slice(2);
  for (const r of exam(skill, +trials, only, +seed)) console.log(JSON.stringify(r));
}
