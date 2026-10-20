// Pruebas de stroke.js y shots.js con trazos sintéticos y golpes completos simulados.
import { analyzeStroke } from '../src/stroke.js';
import { classify, buildShot } from '../src/shots.js';
import { simulate } from '../src/physics.js';
import { judge } from '../src/rules.js';
const c = { x: 200, y: 400 }, r = 50;
const cases = {
  'plano (recto por el centro)': [{ x: 100, y: 400 }, { x: 300, y: 400 }],
  'globo (captura: sube por el centro)': [{ x: 150, y: 480 }, { x: 260, y: 300 }],
  'liftado (sube por detrás)': [{ x: 150, y: 480 }, { x: 165, y: 320 }],
  'cortado (baja por detrás)': [{ x: 165, y: 320 }, { x: 150, y: 480 }],
  'cortado (pasa por debajo)': [{ x: 100, y: 445 }, { x: 300, y: 445 }],
  'liftado (roza por arriba)': [{ x: 100, y: 355 }, { x: 300, y: 355 }],
  'medio cortado (abanico)': [{ x: 100, y: 375 }, { x: 300, y: 445 }],
  'aire (lejos)': [{ x: 100, y: 520 }, { x: 300, y: 520 }],
};
for (const [n, [a, b]] of Object.entries(cases)) {
  const s = analyzeStroke(a, b, c, r, 1);
  const fam = classify({ h: 0.9, bounced: true, vyIn: -1, speedIn: 10, dNet: 8 }, s);
  console.log(n.padEnd(36), 'spin', s.spin.toFixed(2), 'ang', s.angle.toFixed(0), 'dist', s.dist.toFixed(2), s.whiff ? 'AIRE' : fam);
}
console.log('\nGolpes completos desde el fondo (z=8.5, h=0.9) con calidad 1, rumbo recto, 10 repeticiones');
for (const fam of ['plano', 'liftado', 'cortado', 'globo']) {
  for (const power of [0.3, 0.7, 1]) {
    const res = {};
    for (let i = 0; i < 10; i++) {
      const P = { x: 1, y: 0.9, z: 8.5 };
      const nominal = { plano: 5, liftado: 30, cortado: -25, globo: 50 }[fam];
      const spin = { plano: 0, liftado: 0.7, cortado: -0.7, globo: 0 }[fam];
      const sh = buildShot({ p: P, side: 1, yaw: Math.PI, power, family: fam, stroke: { spin, angle: nominal }, q: 0.85 });
      const o = judge(simulate({ p: P, v: sh.v, spin: sh.spin, side: sh.side }), 1).reason;
      res[o] = (res[o] || 0) + 1;
    }
    console.log(fam.padEnd(8), `${power * 100}%`.padEnd(5), JSON.stringify(res));
  }
}
