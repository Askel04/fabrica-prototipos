// Menús y meta: portada, previa, modales, mejoras, partido, resultado y fin de temporada con oferta.
import { open } from './pw.mjs';
const { browser, page, errors, waitFor, shot } = await open('http://localhost:5173/?speed=4');
const S = 'window.__padel.scene';
const name = `${S}.constructor.name`;
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(500);
await shot('h-01-portada');
await page.getByText('EMPEZAR').tap();
await page.waitForTimeout(600);
await shot('h-02-previa');
for (const b of ['Clasificación', 'Calendario', 'Mejoras']) {
  await page.getByText(b, { exact: true }).tap();
  await page.waitForTimeout(250);
  await shot(`h-03-${b}`);
  await page.getByText('CERRAR').tap();
}
// Partido: ganar rápido forzando el final
await page.getByText('JUGAR').tap();
await waitFor(`${name} === 'MatchScene' && ${S}.phase !== 'serve'`);
await page.waitForTimeout(300);
await shot('h-04-partido');
await page.evaluate(`(() => { const s = ${S}; s.match.games = {1: 2, [-1]: 1}; s.match.totalPts = {1: 14, [-1]: 9}; s.endMatch(1); })()`);
await waitFor(`${name} === 'ResultScene'`);
await page.waitForTimeout(1200);
await shot('h-05-resultado');
await page.getByText('CONTINUAR').tap();
await page.waitForTimeout(400);
const save = await page.evaluate(() => JSON.parse(localStorage.getItem('padel-save-v1')));
console.log('tras partido', { coins: save.coins, xp: save.xp, energy: save.energy, round: save.season.round });
// Comprar una mejora
await page.getByText('Mejoras', { exact: true }).tap();
await page.locator('.stat .btn').first().tap();
await page.waitForTimeout(200);
await shot('h-06-mejora');
await page.getByText('CERRAR').tap();
// Saltar a la última jornada
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('padel-save-v1')); s.season.round = 4; s.season.fixtures.forEach((f, i) => { if (i < 4) f.result = 'W'; }); localStorage.setItem('padel-save-v1', JSON.stringify(s)); });
await page.reload();
await page.getByText('EMPEZAR').tap();
await page.getByText('JUGAR').tap();
await waitFor(`${name} === 'MatchScene'`);
await page.evaluate(`${S}.endMatch(1)`);
await waitFor(`${name} === 'ResultScene'`);
await page.waitForTimeout(1000);
await page.getByText('CONTINUAR').tap();
await page.waitForTimeout(400);
await shot('h-07-oferta');
await page.getByText('FICHAR').tap();
await page.waitForTimeout(500);
await shot('h-08-nueva-liga');
const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem('padel-save-v1')));
console.log('nueva temporada', s2.club, s2.season.league, s2.season.round, 'energía', s2.energy);
console.log('ERRORES:', errors.length ? errors : 0);
await browser.close();
