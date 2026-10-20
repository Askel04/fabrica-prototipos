// Volea defensiva: con la pala en el punto de cruce se bloquea (punto tuyo); lejos, punto rival.
// Uso: node tests/t-volea.mjs [bloquea|falla]
import { open } from './pw.mjs';
const mode = process.argv[2] || 'bloquea';
const { browser, page, errors, waitFor, shot, touch } = await open('http://localhost:5173/?volley');
const S = 'window.__padel.scene';
const off = await page.evaluate(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return {x:r.left, y:r.top}; })()`);
await page.waitForTimeout(900);
await shot('v-01-cuenta');
await waitFor(`${S}.volley.launched`, null, 20000);
await page.evaluate(`${S}.debugFreeze = 'all'`);
const cross = await page.evaluate(`JSON.stringify(${S}.volley.cross)`);
console.log('cruce', cross);
const c = JSON.parse(cross);
// Punto en pantalla donde quiero la pala (sobre el cruce, o lejos)
const target = mode === 'bloquea' ? { x: c.x, y: c.y } : { x: c.x > 0 ? -2.2 : 2.2, y: 0.7 };
const sp = await page.evaluate(`${S}.toScreen({x: ${target.x}, y: ${target.y}, z: 0.8})`);
console.log('pantalla', JSON.stringify(sp), JSON.stringify(off));
await touch('touchStart', sp.x + off.x - 30, sp.y + off.y + 30);
for (let i = 1; i <= 5; i++) await touch('touchMove', sp.x + off.x - 30 + i * 6, sp.y + off.y + 30 - i * 6);
await touch('touchEnd');
console.log('pala', await page.evaluate(`JSON.stringify({p: ${S}.volley.paddle.position, r: [${S}.volley.paddle.rotation.x, ${S}.volley.paddle.rotation.z]})`));
await shot('v-02-pala');
await page.evaluate(`${S}.debugFreeze = false`);
await waitFor(`${S}.volley.resolved`, null, 20000);
console.log('resultado', await page.evaluate(`JSON.stringify(${S}.volley.lastResult)`));
await page.waitForTimeout(300);
await shot('v-03-golpe');
await waitFor(`${S}.phase === 'pointEnd'`, null, 20000);
console.log('punto', await page.evaluate(`JSON.stringify({o: ${S}.shot.outcome.reason, w: ${S}.shot.outcome.winner, pts: ${S}.match.pts})`));
await page.waitForTimeout(500);
await shot('v-04-fin');
console.log('ERRORES:', errors.length ? errors : 0);
await browser.close();
