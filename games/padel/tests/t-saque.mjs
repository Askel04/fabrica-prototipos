// Saque: tu saque con la flecha diagonal por defecto + trazo plano; y 10 saques de la IA (reglas del cuadro).
import { open } from './pw.mjs';
const { browser, page, errors, swipe, waitFor, shot } = await open('http://localhost:5173/?match');
const S = 'window.__padel.scene';
await page.waitForTimeout(500);
const off = await page.evaluate(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return {x:r.left, y:r.top}; })()`);
// Saques de la IA: juzgar sin jugar
const ai = await page.evaluate(`(() => { const s = ${S}; const r = {}; for (let i = 0; i < 30; i++) {
  const x = i % 2 ? 2.5 : -2.5; s.shot = { path: { samples: [{x, y: 0.8, z: -9.1}], dt: 1, events: [], duration: 0 }, t0: s.gameTime };
  s.aiShot(s.rivals[0], { x, y: 0.8, z: -9.1 }, { serve: true }); r[s.shot.outcome.reason] = (r[s.shot.outcome.reason] || 0) + 1; } return r; })()`);
console.log('saques IA', JSON.stringify(ai));
await page.evaluate(`(() => { const s = ${S}; s.timers = []; s.match.serveTeam = 1; s.startPoint(); })()`);
await waitFor(`${S}.phase === 'tactical'`, null, 30000);
await waitFor(`${S}.camT >= 1`);
await shot('s-01-tu-saque');
console.log('flecha saque', await page.evaluate(`JSON.stringify({yaw: ${S}.yaw, power: ${S}.power, box: ${S}.shot.contact.serve})`));
await page.getByText('SIGUIENTE').tap();
await waitFor(`${S}.phase === 'impact'`);
await waitFor(`${S}.camT >= 1`);
await waitFor(`(${S}.gameTime - ${S}.shot.t0 - ${S}.shot.contact.t) > -0.03`);
await page.evaluate(`${S}.debugFreeze = true`);
const b0 = await page.evaluate(`({...${S}.ballScreen, r: ${S}.ballR, f: ${S}.fwd})`);
await shot('s-02-impacto');
await swipe(b0.x + off.x - b0.f * 1.5 * b0.r, b0.y + off.y + 0.4 * b0.r, b0.x + off.x + b0.f * 1.5 * b0.r, b0.y + off.y - 0.6 * b0.r, 8);
await page.evaluate(`${S}.debugFreeze = false`);
console.log('golpe', await page.evaluate(`JSON.stringify(${S}.lastHit)`), 'resultado previsto', await page.evaluate(`JSON.stringify(${S}.shot.outcome)`));
await page.waitForTimeout(800);
await shot('s-03-vuelo');
console.log('ERRORES:', errors.length ? errors : 0);
await browser.close();
