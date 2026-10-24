// Pruebas de comportamiento de la IA en situaciones concretas: node tools/scenarios.mjs
import { Match } from '../src/sim/match.js';
import { laneProb } from '../src/ai/evaluate.js';

const place = (p, x, y) => Object.assign(p.disc, { x, y, px: x, py: y, vx: 0, vy: 0 });
const touching = (m, p) => Math.hypot(m.ball.x - p.disc.x, m.ball.y - p.disc.y) - p.disc.r - m.ball.r < 1;

function setup(levels, humanTeam = null) {
  const m = new Match({ humanTeam, levels });
  m.state = 'play';
  for (const p of m.players) p.disc.clamp = null;
  return m;
}

// 1) Balón dividido delante del portero azul: ¿sale y lo toca él antes que el delantero rojo?
function keeper50(level, runs = 40, strikerX = 150) {
  let wins = 0, cameOut = 0;
  for (let i = 0; i < runs; i++) {
    const m = setup({ red: 'easy', blue: level });
    const [r1, r2, r3, b1, b2, b3] = m.players;
    place(r1, strikerX + Math.random() * 20, (Math.random() - 0.5) * 40);
    place(r2, -300, -120); place(r3, -300, 120);
    place(b1, 355, 0); place(b2, -200, -150); place(b3, -200, 150);
    Object.assign(m.ball, { x: 255, y: (Math.random() - 0.5) * 40, vx: 0.6, vy: 0 });
    m.brains.blue.keeper = b1;
    let first = null, maxOut = 0;
    m.lastTouch = null;
    for (let t = 0; t < 120 && !first; t++) {
      m.step();
      maxOut = Math.max(maxOut, 370 - b1.disc.x);
      if (m.lastTouch === b1) first = 'keeper';
      else if (m.lastTouch === r1) first = 'striker';
    }
    if (first === 'keeper') wins++;
    if (maxOut > 50) cameOut++;
  }
  return { level, strikerX, keeperFirst: `${wins}/${runs}`, cameOut: `${cameOut}/${runs}` };
}

// 2) Pedir el pase: el humano (rojo) pulsa tiro desmarcado; ¿cuánto tarda el compañero en dársela?
function passRequest(runs = 30) {
  let ok = 0, sum = 0;
  for (let i = 0; i < runs; i++) {
    const m = setup({ red: 'mate', blue: 'easy' }, 'red');
    const [h, r2, r3, b1, b2, b3] = m.players;
    place(h, 120, -110 + Math.random() * 30);
    place(r2, -40, 40); place(r3, -300, 0);
    place(b1, 300, 0); place(b2, 200, 140); place(b3, -200, -150);
    Object.assign(m.ball, { x: -40 + 26, y: 40, vx: 0, vy: 0 });
    m.lastTouch = r2;
    let t = 0;
    for (; t < 150; t++) {
      m.humanInput.kick = t >= 5 && t < 10;
      m.step();
      if (m.lastTouch === h) break;
    }
    if (t < 90) { ok++; sum += t; }
  }
  return { passRequest: `${ok}/${runs} en <1,5 s`, mediaTicks: ok ? Math.round(sum / ok) : null };
}

// 3) Pared: A pasa a B y B se la devuelve a A en menos de 4 s.
function oneTwo(level, runs = 40) {
  let passes = 0, returns = 0;
  for (let i = 0; i < runs; i++) {
    const m = setup({ red: level, blue: 'easy' });
    const [a, b, k, o1, o2, o3] = m.players;
    place(a, -60, 0); place(b, 60, 80 + Math.random() * 20); place(k, -320, 0);
    place(o1, 50, -30); place(o2, 250, 0); place(o3, 330, 0);
    Object.assign(m.ball, { x: -60 + 26, y: 0, vx: 0, vy: 0 });
    m.lastTouch = a;
    let state = 0;
    for (let t = 0; t < 240; t++) {
      m.step();
      if (state === 0 && m.lastTouch === b) { state = 1; passes++; }
      else if (state === 1 && m.lastTouch === a) { returns++; break; }
      else if (state === 1 && m.lastTouch?.team === 'blue') break;
    }
  }
  return { level, passAtoB: `${passes}/${runs}`, returned: `${returns}/${runs}` };
}

// 4) Presión: el azul tiene el balón parado y un receptor por delante. Tras 1,5 s:
//    ¿algún rojo está por el lado de su portería, la línea de pase al receptor está tapada o le han robado?
function pressing(level, runs = 30) {
  let goalSide = 0, blocked = 0, stolen = 0;
  for (let i = 0; i < runs; i++) {
    const m = setup({ red: level, blue: 'easy' });
    const [r1, r2, r3, b1, b2, b3] = m.players;
    place(r1, -60, 30); place(r2, -250, 120); place(r3, -340, 0);
    place(b1, 140, 0); place(b2, 40, -120); place(b3, 300, 0);
    Object.assign(m.ball, { x: 114, y: 0, vx: 0, vy: 0 });
    m.lastTouch = b1;
    for (let t = 0; t < 95; t++) {
      if (m.lastTouch?.team === 'red') break;
      b1.disc.vx = b1.disc.vy = 0; // el portador se queda quieto con el balón
      Object.assign(m.ball, { x: 114, y: 0, vx: 0, vy: 0 });
      m.step();
    }
    if (m.lastTouch?.team === 'red') { stolen++; continue; }
    const reds = m.players.filter((q) => q.team === 'red');
    if (reds.some((q) => q !== r3 && q.disc.x < m.ball.x - 5 && Math.hypot(q.disc.x - m.ball.x, q.disc.y - m.ball.y) < 70)) goalSide++;
    if (laneProb(m.ball.x, m.ball.y, b2.disc.x, b2.disc.y, reds) < 0.5) blocked++;
  }
  return { level, goalSide: `${goalSide}/${runs}`, passLaneBlocked: `${blocked}/${runs}`, stolen: `${stolen}/${runs}` };
}

console.log('1) Portero en balón dividido');
for (const l of ['easy', 'normal', 'hard']) console.log('  ', JSON.stringify(keeper50(l)));
// más igualado: delantero y portero a la misma distancia del balón
for (const l of ['easy', 'normal', 'hard']) console.log('  ', JSON.stringify(keeper50(l, 40, 185)));
console.log('2) Pedir el pase');
console.log('  ', JSON.stringify(passRequest()));
console.log('3) Pared 1-2');
for (const l of ['easy', 'normal', 'hard', 'mate']) console.log('  ', JSON.stringify(oneTwo(l)));
console.log('4) Presión');
for (const l of ['easy', 'normal', 'hard']) console.log('  ', JSON.stringify(pressing(l)));
