// Juega un partido completo: apunta, pulsa Siguiente y golpea (resolveHit directo) hasta el final.
import { open } from './pw.mjs';
const { browser, page, errors, waitFor, shot } = await open('http://localhost:5173/?speed=4&match');
const S = 'window.__padel.scene';
let n = 0, shotN = 0;
const t0 = Date.now();
while (Date.now() - t0 < 100000) {
  await waitFor(`['tactical','over'].includes(${S}.phase) || ${S}.match?.over`, null, 60000);
  const ph = await page.evaluate(`${S}.phase`);
  if (ph !== 'tactical') break;
  n++;
  await page.evaluate(`(() => { const s = ${S}; s.yaw = Math.PI + (Math.random() - 0.5) * 0.8; s.power = 0.3 + Math.random() * 0.6; s.enterImpact(); })()`);
  await waitFor(`${S}.phase !== 'impact' || (${S}.gameTime - ${S}.shot.t0 - ${S}.shot.contact.t) > -0.02`);
  // Trazo sintético: efecto y ángulo aleatorios, contacto cerca del centro
  const st = { spin: Math.random() * 1.6 - 0.8, angle: Math.random() * 90 - 35, dist: Math.random() * 0.9, tang: Math.random() * 0.8, contact: { x: 0, y: 0 } };
  await page.evaluate(`${S}.phase === 'impact' && ${S}.resolveHit(${JSON.stringify(st)})`);
  if (n % 6 === 1) await shot(`m-${shotN++}`);
  const sc = await page.evaluate(`JSON.stringify(${S}.match)`);
  const info = await page.evaluate(`JSON.stringify({fam: ${S}.lastHit?.family, out: ${S}.shot.outcome.reason, ia: ${S}.shot.contact && {fam: ${S}.shot.contact.family, miss: ${S}.shot.contact.miss, h: +${S}.shot.contact.pos.y.toFixed(2), pared: ${S}.shot.contact.afterWall}})`);
  console.log('golpe', n, JSON.stringify(JSON.parse(sc).pts), info);
}
await page.waitForTimeout(1500);
console.log('final', await page.evaluate(`JSON.stringify(${S}.match)`), 'fase', await page.evaluate(`${S}.phase`));
await shot('m-final');
console.log('ERRORES:', errors.length ? errors : 0);
await browser.close();
