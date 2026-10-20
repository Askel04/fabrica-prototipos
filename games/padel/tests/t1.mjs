// Un punto con toque real: arrastra la flecha, Siguiente, y desliza sobre la bola grande.
// Uso: node tests/t1.mjs [flat|top|back|lob|late]
import { open } from './pw.mjs';
const kind = process.argv[2] || 'flat';
const { browser, page, errors, swipe, waitFor, shot, touch } = await open('http://localhost:5173/?match');
const S = 'window.__padel.scene';
await page.waitForTimeout(800);
await shot('01-inicio');
await waitFor(`${S}.phase === 'tactical' || ${S}.phase === 'pointEnd'`, null, 30000);
const off = await page.evaluate(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return {x:r.left, y:r.top}; })()`);
console.log('fase', await page.evaluate(`${S}.phase`));
if (await page.evaluate(`${S}.phase`) === 'tactical') {
  await waitFor(`${S}.camT >= 1`);
  await shot('02-flecha-inicial');
  // Arrastra hacia la izquierda del campo rival
  const o = await page.evaluate(`${S}.toScreen({x: ${S}.shot.contact.pos.x - 2.5, y: 0, z: -3})`);
  const s0 = await page.evaluate(`${S}.toScreen({x: ${S}.shot.contact.pos.x, y: 0, z: ${S}.shot.contact.pos.z - 1})`);
  await swipe(s0.x + off.x, s0.y + off.y, o.x + off.x, o.y + off.y, 6);
  await page.waitForTimeout(200);
  await shot('03-flecha');
  console.log('flecha', await page.evaluate(`JSON.stringify({yaw: ${S}.yaw, power: ${S}.power})`));
  await page.getByText('SIGUIENTE').tap();
  await waitFor(`${S}.phase === 'impact'`);
  await waitFor(`${S}.camT >= 1`);
  await shot('04-impacto');
  if (kind !== 'late') {
    await waitFor(`(${S}.gameTime - ${S}.shot.t0 - ${S}.shot.contact.t) > -0.03`);
    await page.evaluate(`${S}.debugFreeze = true`); // el navegador sin GPU va lento: congelar mientras se desliza
    await page.waitForTimeout(100);
    const b0 = await page.evaluate(`({...${S}.ballScreen, r: ${S}.ballR, f: ${S}.fwd})`);
    const b = { x: b0.x + off.x, y: b0.y + off.y, r: b0.r };
    const f = b0.f; // dirección del rival en pantalla
    console.log("bola", JSON.stringify(b0));
    const R = b.r;
    const strokes = {
      flat: [b.x - f * 1.6 * R, b.y, b.x + f * 1.6 * R, b.y],
      top: [b.x - f * 0.9 * R, b.y + 1.8 * R, b.x - f * 0.7 * R, b.y - 1.8 * R],
      back: [b.x - f * 0.7 * R, b.y - 1.8 * R, b.x - f * 0.9 * R, b.y + 1.8 * R],
      lob: [b.x - f * 1.2 * R, b.y + 1.6 * R, b.x + f * 1.2 * R, b.y - 1.6 * R],
    }[kind];
    await swipe(...strokes, 8);
    await page.evaluate(`${S}.debugFreeze = false`);
    await shot('05-golpe');
    console.log('golpe', await page.evaluate(`JSON.stringify(${S}.lastHit)`));
  }
  await page.waitForTimeout(400);
  await shot('06-vuelo');
}
await waitFor(`${S}.phase === 'pointEnd' || ${S}.phase === 'tactical'`, null, 30000);
console.log('fase final', await page.evaluate(`${S}.phase`), await page.evaluate(`JSON.stringify(${S}.shot.outcome)`));
await shot('07-fin');
console.log('ERRORES:', errors.length ? errors : 0);
await browser.close();
