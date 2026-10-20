// Juega un partido completo: apunta, pulsa Siguiente y golpea (resolveHit directo) hasta el final.
import { open } from './pw.mjs';
const { browser, page, errors, waitFor, shot } = await open('http://localhost:5173/?speed=4&match');
const S = 'window.__padel.scene';
let n = 0, shotN = 0;
const t0 = Date.now();
while (Date.now() - t0 < 420000) {
  await waitFor(`['tactical','over'].includes(${S}.phase) || ${S}.match?.over`, null, 60000);
  const ph = await page.evaluate(`${S}.phase`);
  if (ph !== 'tactical') break;
  n++;
  await page.evaluate(`(() => { const s = ${S}; s.aim = {x: (Math.random()*6-3), z: -4 - Math.random()*4}; s.power = 0.3 + Math.random()*0.3; s.updatePreview(); s.enterImpact(); })()`);
  await waitFor(`${S}.phase !== 'impact' || (${S}.gameTime - ${S}.shot.t0 - ${S}.shot.contact.t) > -0.02`);
  const kind = ['flat', 'top', 'back'][n % 3];
  const dy = kind === 'top' ? -40 : kind === 'back' ? 40 : 0;
  await page.evaluate(`${S}.phase === 'impact' && ${S}.resolveHit(100, ${dy}, ${(Math.random() - 0.5) * 0.6})`);
  if (n % 6 === 1) await shot(`m-${shotN++}`);
  const sc = await page.evaluate(`JSON.stringify(${S}.match)`);
  const info = await page.evaluate(`JSON.stringify({hitter: ${S}.shot.hitter, out: ${S}.shot.outcome, c: ${S}.shot.contact && {t: ${S}.shot.contact.t, miss: ${S}.shot.contact.miss, y: ${S}.shot.contact.pos.y, b: ${S}.shot.contact.bounced}, lh: ${S}.lastHit && ${S}.lastHit.q})`);
  console.log('golpe', n, JSON.stringify(JSON.parse(sc).pts), info);
}
await page.waitForTimeout(1500);
console.log('final', await page.evaluate(`JSON.stringify(${S}.match)`), 'fase', await page.evaluate(`${S}.phase`));
await shot('m-final');
console.log('ERRORES:', errors.length ? errors : 0);
await browser.close();
