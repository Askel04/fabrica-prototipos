// Animaciones en partido real: lectura de pared (situación "pared") y rivales que corren atrás tras tu globo ("defensa").
import { open, SHOTS } from './pw.mjs';
import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { execSync } = require('child_process');
const strip = (name, files) => execSync(`python3 -c "
from PIL import Image
fs='${files.join(' ')}'.split()
ims=[Image.open(f).crop((0,150,780,1536)).resize((240,427)) for f in fs]
W=Image.new('RGB',(240*len(ims),427))
for i,im in enumerate(ims): W.paste(im,(240*i,0))
W.save('${SHOTS}/tira-${name}.png')"`);
let total = 0;
for (const sit of ['pared', 'defensa']) {
  const { browser, page, errors, waitFor, shot } = await open(`http://localhost:5173/?opp=1&sit=${sit}`);
  const S = 'window.__padel.scene';
  await page.getByText('JUGAR').waitFor({ timeout: 30000 });
  await page.getByText('JUGAR').tap();
  await waitFor(`${S}.shot && ${S}.phase === 'live'`, null, 30000);
  const files = [];
  if (sit === 'pared') {
    // Seguir al receptor mientras la bola va al cristal (tiempo de juego a saltos)
    for (let i = 0; i < 8; i++) {
      await page.evaluate(`${S}.debugFreeze = 'all'`);
      await page.waitForTimeout(150);
      const fn = `ap-${sit}-${i}`; await shot(fn); files.push(`${SHOTS}/${fn}.png`);
      console.log(sit, i, await page.evaluate(`JSON.stringify(${S}.team.map(p => [p.mode, +p.yaw.toFixed(2), +p.watchFor.toFixed(2), +p.watchDelay.toFixed(2)]))`), await page.evaluate(`${S}.phase`));
      await page.evaluate(`${S}.debugFreeze = false`);
      if (await page.evaluate(`${S}.phase`) !== 'live') break;
      await page.waitForTimeout(550);
    }
  } else {
    await waitFor(`${S}.phase === 'tactical'`, null, 30000);
    await page.evaluate(`(() => { const s = ${S}; s.yaw = Math.PI; s.power = 0.7; s.enterImpact(); })()`);
    await waitFor(`(${S}.gameTime - ${S}.shot.t0 - ${S}.shot.contact.t) > -0.02`);
    await page.evaluate(`${S}.resolveHit({ spin: 0, angle: 55, dist: 0.05, tang: 0, contact: { x: 0, y: 0 } })`);
    await waitFor(`${S}.phase === 'live'`);
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(300);
      await page.evaluate(`${S}.debugFreeze = 'all'`);
      await page.waitForTimeout(150);
      const fn = `ap-${sit}-${i}`; await shot(fn); files.push(`${SHOTS}/${fn}.png`);
      console.log(sit, i, await page.evaluate(`JSON.stringify(${S}.rivals.map(p => [p.mode, +p.yaw.toFixed(2), p.target && [+p.target.x.toFixed(1), +p.target.z.toFixed(1)], [+p.pos.x.toFixed(1), +p.pos.z.toFixed(1)], +p.toHit.toFixed(2)]))`), await page.evaluate(`${S}.lastHit?.family`));
      await page.evaluate(`${S}.debugFreeze = false`);
    }
  }
  strip(`partido-${sit}`, files);
  total += errors.length;
  await browser.close();
}
console.log('ERRORES:', total);
