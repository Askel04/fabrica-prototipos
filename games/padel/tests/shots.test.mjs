// Pruebas de stroke.js y shots.js con trazos sintéticos y golpes completos simulados.
import { analyzeStroke } from '../src/stroke.js';
import { classify, buildShot } from '../src/shots.js';
import { simulate } from '../src/physics.js';
import { judge } from '../src/rules.js';
const c = { x: 200, y: 400 }, r = 50;
// Bola en (200, 400) con radio 50; el rival queda a la derecha. y de pantalla hacia abajo.
const cases = {
  'plano: horizontal por el centro': [{ x: 100, y: 400 }, { x: 300, y: 400 }, 'plano'],
  'plano: de arriba-izq. al centro': [{ x: 130, y: 330 }, { x: 270, y: 470 }, 'plano'],
  'globo: de abajo al centro (captura)': [{ x: 150, y: 480 }, { x: 260, y: 300 }, 'globo'],
  'liftado: horizontal rozando arriba': [{ x: 100, y: 358 }, { x: 300, y: 358 }, 'liftado'],
  'cortado: horizontal rozando abajo': [{ x: 100, y: 442 }, { x: 300, y: 442 }, 'cortado'],
  'liftado: entra por detrás y sube': [{ x: 140, y: 440 }, { x: 175, y: 320 }, 'liftado'],
  'cortado: entra por detrás y baja': [{ x: 140, y: 360 }, { x: 175, y: 480 }, 'cortado'],
  'liftado: desde arriba pero subiendo': [{ x: 120, y: 375 }, { x: 290, y: 330 }, 'liftado'],
  'cortado: desde abajo pero bajando': [{ x: 120, y: 425 }, { x: 290, y: 470 }, 'cortado'],
  'cortado: roza por abajo subiendo poco': [{ x: 110, y: 480 }, { x: 300, y: 380 }, 'cortado'],
  'liftado: roza por arriba bajando poco': [{ x: 110, y: 320 }, { x: 300, y: 420 }, 'liftado'],
  'aire: lejos de la bola': [{ x: 100, y: 520 }, { x: 300, y: 520 }, 'aire'],
};
let fails = 0;
for (const [n, [a, b, want]] of Object.entries(cases)) {
  const s = analyzeStroke(a, b, c, r, 1);
  const fam = s.whiff ? 'aire' : classify({ h: 0.9, bounced: true, vyIn: -1, speedIn: 10, dNet: 8 }, s);
  // También con el rival a la izquierda (trazo y bola en espejo)
  const m = analyzeStroke({ x: 400 - a.x, y: a.y }, { x: 400 - b.x, y: b.y }, { x: 200, y: 400 }, r, -1);
  const famM = m.whiff ? 'aire' : classify({ h: 0.9, bounced: true, vyIn: -1, speedIn: 10, dNet: 8 }, m);
  const ok = fam === want && famM === want;
  if (!ok) fails++;
  console.log(ok ? 'ok   ' : 'FALLO', n.padEnd(38), 'efecto', s.spin.toFixed(2), 'desvío', s.dev.toFixed(0) + '°', 'contacto', `(${s.contact.x.toFixed(2)},${s.contact.y.toFixed(2)})`, '->', fam, famM === fam ? '' : `(espejo: ${famM})`);
}
console.log(fails ? `${fails} casos fallan` : 'todos los trazos ok');
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
