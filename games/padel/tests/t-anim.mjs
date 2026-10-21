// Galería de animaciones: coloca a un jugador, le da una orden y captura una tira de fotogramas
// avanzando la animación a mano (tiempo del juego congelado). Uso: node tests/t-anim.mjs [nombres]
import { open, SHOTS } from './pw.mjs';
import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { page, browser, errors, shot } = await open('http://localhost:5173/?match');
const S = 'window.__padel.scene';
await page.waitForTimeout(800);
// Escena congelada: sin saque, cámara cercana configurable
await page.evaluate(`(() => { const s = ${S}; s.timers = []; s.shot = null; s.phase = 'intro'; s.timeScale = 0; s.ball.position.set(0, -1, 0);
  window.__step = (n, dt = 1/30) => { for (let i = 0; i < n; i++) [...s.team, ...s.rivals].forEach(p => { p.lookTarget = s.ball.position; p.update(dt); }); };
  window.__cam = (pos, look) => { s.cam.pos.set(...pos); s.cam.look.set(...look); s.camT = 1; s.follow.set(0,0,0); };
})()`);
const P = (code) => page.evaluate(`(() => { const s = ${S}; const p = s.team[1]; ${code} })()`);
const scenes = {
  espera: { setup: `p.pos.set(1.5,0,7); p.target=null;`, cam: [[4.5, 1.6, 4.5], [1.5, 0.9, 7]], frames: 4, step: 4 },
  lateral: { setup: `p.pos.set(-1,0,7); p.moveTo(2.5,7);`, cam: [[0.8, 1.8, 2.5], [0.8, 0.9, 7]], frames: 6, step: 3 },
  red: { setup: `p.pos.set(1,0,8.5); p.moveTo(1,3.2);`, cam: [[5, 1.8, 6], [1, 0.9, 6]], frames: 6, step: 4 },
  atras: { setup: `p.pos.set(1,0,6.5); p.moveTo(1,8);`, cam: [[5, 1.8, 7], [1, 0.9, 7]], frames: 6, step: 3 },
  globo: { setup: `p.pos.set(1,0,3); p.moveTo(1.3,8.6); s.ball.position.set(1.3, 5, 6);`, cam: [[5.5, 2.2, 5.5], [1, 0.9, 5.8]], frames: 7, step: 5 },
  pared: { setup: `p.pos.set(1.5,0,7.6); p.target=null; p.watchFor = 1.2; s.ball.position.set(2.2, 0.8, 9.6);`, cam: [[4.5, 1.8, 5], [1.6, 0.9, 7.8]], frames: 4, step: 6, extra: `s.ball.position.z -= 0.25; s.ball.position.y += 0.05;` },
  drive: { setup: `p.pos.set(1.2,0,7); p.target=null; const r = p.reach({x:1.8,y:0.9,z:6.6},'drive'); p.pos.set(r.body.x,0,r.body.z); p.swing('drive', null, r.hit); s.ball.position.set(1.8,0.9,6.6);`, cam: [[4.5, 1.5, 4.8], [1.4, 0.9, 6.8]], frames: 6, step: 2 },
  volea_salto: { setup: `p.pos.set(1,0,3); p.target=null; const r = p.reach({x:1.6,y:2.15,z:2.6},'volea'); p.pos.set(r.body.x,0,r.body.z); p.swing('volea', null, r.hit); s.ball.position.set(1.6,2.15,2.6);`, cam: [[4.5, 1.7, 1.5], [1.2, 1.2, 3]], frames: 5, step: 2 },
  remate: { setup: `p.pos.set(1,0,3); p.target=null; const r = p.reach({x:1.5,y:2.8,z:2.6},'smash'); p.pos.set(r.body.x,0,r.body.z); p.swing('smash', null, r.hit); s.ball.position.set(1.5,2.8,2.6);`, cam: [[4.5, 1.8, 1.5], [1.2, 1.4, 3]], frames: 6, step: 3 },
  celebra: { setup: `s.endGestures(s.team, s.rivals); s.team.forEach((q,i)=>q.pos.set(i?2:-2,0,6));`, cam: [[0, 2.2, 10.5], [0, 0.9, 6]], frames: 5, step: 4 },
  lamento: { setup: `p.pos.set(1,0,7); p.target=null; p.lament = 2;`, cam: [[3.5, 1.6, 4.8], [1, 1.1, 7]], frames: 2, step: 4 },
};
const want = process.argv[2] ? process.argv[2].split(',') : Object.keys(scenes);
const { execSync } = require('child_process');
for (const name of want) {
  const sc = scenes[name];
  await P(`[...s.team, ...s.rivals].forEach(q => { q.target = null; q.vel = {x:0,z:0}; q.swingT = -1; q.celebrate = 0; q.lament = 0; q.watchFor = 0; q.faceNetNow(); q.idlePose(); });
    s.team[0].pos.set(-3,0,8); s.ball.position.set(0,-1,0); ${sc.setup}`);
  await page.evaluate(`__cam(${JSON.stringify(sc.cam[0])}, ${JSON.stringify(sc.cam[1])})`);
  const files = [];
  for (let f = 0; f < sc.frames; f++) {
    await page.waitForTimeout(120);
    const fn = `anim-${name}-${f}`;
    await shot(fn);
    files.push(`${SHOTS}/${fn}.png`);
    if (sc.extra) await P(sc.extra);
    await page.evaluate(`__step(${sc.step})`);
  }
  console.log(name, 'modo:', await P('return p.mode;'), 'yaw:', await P('return +p.yaw.toFixed(2);'));
  execSync(`python3 -c "
from PIL import Image
fs='${files.join(' ')}'.split()
ims=[Image.open(f).crop((0,150,780,1536)).resize((240,427)) for f in fs]
W=Image.new('RGB',(240*len(ims),427))
for i,im in enumerate(ims): W.paste(im,(240*i,0))
W.save('${SHOTS}/tira-${name}.png')"`);
}
console.log('ERRORES:', errors.length ? errors : 0);
await browser.close();
