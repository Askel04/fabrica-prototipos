import { open } from './pw.mjs';
const kind = process.argv[2] || 'flat'; // flat | top | back | late
const { browser, page, errors, swipe, waitFor, shot } = await open('http://localhost:5173/?match');
const S = 'window.__padel.scene';
await page.waitForTimeout(800);
await shot('01-inicio');
await page.waitForTimeout(700);
await shot('02-saque');
await waitFor(`${S}.phase === 'tactical' || ${S}.phase === 'pointEnd'`);
console.log('fase', await page.evaluate(`${S}.phase`), await page.evaluate(`JSON.stringify(${S}.shot.outcome)`));
if (await page.evaluate(`${S}.phase`) === 'tactical') {
  await shot('03-tactica');
  await waitFor(`${S}.camT >= 1`);
  const tp = await page.evaluate(`${S}.toScreen({x:-2,y:0,z:-6.5})`);
  const off = await page.evaluate(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return {x:r.left, y:r.top}; })()`);
  await page.touchscreen.tap(tp.x + off.x, tp.y + off.y);
  await page.waitForTimeout(200);
  await shot('04-apuntado');
  console.log('aim', await page.evaluate(`JSON.stringify(${S}.aim)`));
  await page.getByText('SIGUIENTE').tap();
  await waitFor(`${S}.phase === 'impact'`);
  await waitFor(`${S}.camT >= 1`);
  await shot('05-impacto');
  if (kind !== 'late') {
    await waitFor(`(${S}.gameTime - ${S}.shot.t0 - ${S}.shot.contact.t) > -0.04`);
    const b0 = await page.evaluate(`({...${S}.ballScreen, r: ${S}.ringRadius()})`);
    const b = { x: b0.x + off.x, y: b0.y + off.y, r: b0.r };
    const dy = kind === 'top' ? -1.2 : kind === 'back' ? 1.2 : 0;
    await swipe(b.x - 2 * b.r, b.y - dy * b.r, b.x + 2 * b.r, b.y + dy * b.r);
    await shot('06-golpe');
    console.log('hit', await page.evaluate(`JSON.stringify(${S}.lastHit)`));
  }
  await page.waitForTimeout(250);
  await shot('07-tras-golpe');
  await page.waitForTimeout(700);
  await shot('08-vuelo');
}
await waitFor(`${S}.phase === 'pointEnd' || ${S}.phase === 'tactical'`, null, 20000);
console.log('fase final', await page.evaluate(`${S}.phase`), await page.evaluate(`JSON.stringify(${S}.match.pts)`), await page.evaluate(`JSON.stringify(${S}.shot.outcome)`));
await shot('09-fin');
console.log('ERRORES:', errors.length ? errors : 0);
await browser.close();
