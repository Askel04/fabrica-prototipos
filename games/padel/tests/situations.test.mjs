// Comprueba que cada situación guionizada llega a tu jugador con el golpe que pretende.
import { simulate, sampleAt } from '../src/physics.js';
import { judge, findContact } from '../src/rules.js';
import { classify } from '../src/shots.js';
import { SITUATIONS } from '../src/situations.js';
import { CONFIG as C } from '../src/config.js';
const expect = { defensa: ['plano'], remate: ['remate'], bandeja: ['bandeja'], pared: ['plano'], ataque: ['volea'], oro: ['plano'], cristal: ['bandeja'] };
let fails = 0;
for (const s of SITUATIONS.filter((x) => x.hit)) {
  const h = s.hit;
  const path = simulate({ p: h.from, v: h.v, spin: h.spin });
  const o = judge(path, -1);
  const c = findContact(path, o, 1, s.team.map(([x, z]) => ({ x: x + 0.55, z })), { vmax: C.PLAYER_SPEED, accel: C.PLAYER_ACCEL, reaction: C.REACTION }, { pick: s.pick });
  if (!c) { console.log('FALLO', s.id, 'sin contacto', o.reason); fails++; continue; }
  const a = sampleAt(path, c.t - 0.02, { x: 0, y: 0, z: 0 }), b = sampleAt(path, c.t + 0.02, { x: 0, y: 0, z: 0 });
  const ctx = { h: c.pos.y, bounced: c.bounced, vyIn: (b.y - a.y) / 0.04, speedIn: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.04, dNet: Math.abs(c.pos.z) };
  const fam = classify(ctx, { spin: 0, angle: 0 });
  const ok = expect[s.id].includes(fam) && o.winner === -1;
  if (!ok) fails++;
  console.log(ok ? 'ok   ' : 'FALLO', s.id.padEnd(9), `contacto h=${c.pos.y.toFixed(2)} z=${c.pos.z.toFixed(1)} bote=${c.bounced} pared=${c.afterWall} -> ${fam}`);
}
console.log(fails ? `${fails} fallos` : 'todas las situaciones ok');
process.exit(fails ? 1 : 0);
