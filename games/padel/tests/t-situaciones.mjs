// Abre cada situación (?opp=1&sit=id), pulsa JUGAR y captura el momento de decisión (pausa táctica o volea).
import { open } from './pw.mjs';
const ids = (process.argv[2] || 'saque,resto,defensa,remate,bandeja,volea,pared,ataque,oro,cristal').split(',');
let total = 0;
for (const id of ids) {
  const { browser, page, errors, waitFor, shot } = await open(`http://localhost:5173/?opp=1&sit=${id}&speed=2`);
  const S = 'window.__padel.scene';
  await page.getByText('JUGAR').waitFor({ timeout: 20000 });
  await shot(`sit-${id}-tarjeta`);
  await page.getByText('JUGAR').tap();
  await waitFor(`${S}.phase === 'tactical' || ${S}.volley?.launched || ${S}.phase === 'pointEnd'`, null, 30000);
  const ph = await page.evaluate(`${S}.phase`);
  await page.waitForTimeout(400);
  await shot(`sit-${id}`);
  const info = await page.evaluate(`JSON.stringify(${S}.shot?.contact ? { h: +${S}.shot.contact.pos.y.toFixed(2), z: +${S}.shot.contact.pos.z.toFixed(1), bote: ${S}.shot.contact.bounced } : null)`);
  console.log(id.padEnd(9), ph.padEnd(9), info, errors.length ? errors : '');
  total += errors.length;
  await browser.close();
}
console.log('ERRORES:', total);
