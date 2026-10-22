// Partido completo por oportunidades (acelerado): JUGAR en cada tarjeta, golpe directo en la pausa táctica
// y pala colocada en el cruce en la volea defensiva. Termina en la pantalla de resultado del partido suelto.
import { open } from './pw.mjs';
const n = process.argv[2] || 4;
const { browser, page, errors, waitFor, shot } = await open(`http://localhost:5173/?opp=${n}&speed=3`);
const S = 'window.__padel.scene';
let shots = 0;
const t0 = Date.now();
while (Date.now() - t0 < 400000) {
  try {
    await waitFor(`${S}.phase === 'over' || !!document.querySelector('.oppcard') || ${S}.phase === 'tactical' || (${S}.volley?.launched && !${S}.volley.resolved)`, null, 60000);
  } catch (e) {
    console.log('ATASCO', await page.evaluate(`JSON.stringify({ph: ${S}.phase, imp: ${S}.impact && {...${S}.impact, stroke: !!${S}.impact.stroke}, tRel: ${S}.shot && (${S}.gameTime - ${S}.shot.t0 - (${S}.shot.contact?.t ?? 0)), c: ${S}.shot?.contact && {done: ${S}.shot.contact.done, miss: ${S}.shot.contact.miss}, out: ${S}.shot?.outcome, ts: ${S}.timeScale, timers: ${S}.timers.length, vol: ${S}.volley?.active})`));
    await shot('atasco');
    throw e;
  }
  const st = await page.evaluate(`${S}.phase === 'over' ? 'over' : document.querySelector('.oppcard') ? 'card' : ${S}.phase === 'tactical' ? 'tactical' : 'volley'`);
  if (st === 'over') break;
  if (st === 'card') {
    const name = await page.evaluate(`document.querySelector('.oppcard .nm').textContent`);
    console.log('tarjeta:', name, await page.evaluate(`JSON.stringify(${S}.match.games)`));
    if (shots < 2) await shot(`opp-card-${shots++}`);
    await page.getByText('JUGAR').tap();
    await waitFor(`!document.querySelector('.oppcard')`);
  } else if (st === 'tactical') {
    await page.evaluate(`(() => { const s = ${S}; s.yaw = Math.PI + (Math.random() - 0.5) * 0.6; s.power = 0.4 + Math.random() * 0.5; s.enterImpact(); })()`);
    await waitFor(`${S}.phase !== 'impact' || (${S}.gameTime - ${S}.shot.t0 - ${S}.shot.contact.t) > -0.02`);
    const stroke = { spin: Math.random() * 1.4 - 0.7, angle: Math.random() * 60 - 20, dist: Math.random() * 0.6, tang: Math.random() * 0.6, contact: { x: 0, y: 0 } };
    await page.evaluate(`${S}.phase === 'impact' && ${S}.resolveHit(${JSON.stringify(stroke)})`);
  } else {
    await page.evaluate(`(() => { const v = ${S}.volley; if (Math.random() < 0.7) v.setPaddle(v.cross.x, v.cross.y); else v.setPaddle(-v.cross.x, 0.7); })()`);
    await waitFor(`${S}.volley.resolved`);
    console.log('volea:', await page.evaluate(`JSON.stringify(${S}.volley.lastResult.blocked)`));
  }
}
console.log('final', await page.evaluate(`JSON.stringify({games: ${S}.match.games, won: ${S}.opp.won, n: ${S}.opp.n, need: ${S}.opp.need})`));
await page.waitForTimeout(500);
await shot('opp-final');
const errs = await page.evaluate(`${S}.contactErrs`);
console.log('contactos pala-bola:', errs.length, 'peor (m):', Math.max(...errs));
const corr = await page.evaluate(`${S}.aiCorrections`);
console.log('corrección final de la IA (m): media', (corr.reduce((a, b) => a + b, 0) / Math.max(1, corr.length)).toFixed(3), 'máx', Math.max(0, ...corr), 'n', corr.length);
console.log('ERRORES:', errors.length ? errors : 0);
await browser.close();
