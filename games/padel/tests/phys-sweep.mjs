// Barrido de física: remates (x3/x4), víbora vs rulo en el cristal y cortado fuerte.
import { simulate, solveShot } from '../src/physics.js';
import { judge } from '../src/rules.js';
const pct = (a) => (a * 100).toFixed(0) + '%';
// Remates desde cerca de la red de nuestro lado
console.log('REMATES (desde z=3.5, h=2.7): velocidad, bote (x,z) -> resultado');
for (const sp of [20, 24, 28, 32]) {
  const row = [];
  for (const [tx, tz] of [[0, -3], [0, -5], [0, -6.5], [3.5, -3], [4.2, -4], [4.2, -2.5]]) {
    const s = solveShot({ x: 0, y: 2.7, z: 3.5 }, { x: tx, z: tz }, sp, 0, 0, 0);
    const path = simulate({ p: { x: 0, y: 2.7, z: 3.5 }, v: s.v, spin: 0 });
    row.push(`(${tx},${tz}):${judge(path, 1).reason}`);
  }
  console.log(sp, row.join('  '));
}
console.log('\\nCRISTAL: bote a 1.5 m del fondo; altura de salida del cristal y altura máxima tras él');
for (const spin of [-1, -0.5, 0, 0.5, 1]) {
  const P = { x: 0, y: 2, z: 2 };
  const s = solveShot(P, { x: 0, z: -8.5 }, 17, spin, 0, 0);
  const path = simulate({ p: P, v: s.v, spin });
  const w = path.events.find((e) => e.type === 'wall');
  const i0 = w ? Math.round(w.t / path.dt) : 0;
  const maxY = Math.max(...path.samples.slice(i0, i0 + 120).map((q) => q.y));
  console.log(`spin ${spin}: cristal a h=${w?.y.toFixed(2)} max tras cristal=${maxY.toFixed(2)} -> ${judge(path, 1).reason}`);
}
console.log('\\nCORTADO FUERTE desde el fondo (h=0.9, z=8.5) a 8 m de la red');
for (const sp of [15, 18, 21, 24]) {
  const P = { x: 1, y: 0.9, z: 8.5 };
  const s = solveShot(P, { x: -1, z: -8 }, sp, -0.8, 0, 0);
  const path = simulate({ p: P, v: s.v, spin: -0.8 });
  console.log(sp, 'reach', s.reachable, judge(path, 1).reason);
}
