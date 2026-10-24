// IA Fácil: roles simples (presiona, apoya, defiende). Es la IA original del prototipo.
import { CONFIG as C } from '../config.js';

const len = (x, y) => Math.hypot(x, y) || 1;

// Reparte roles dentro de un equipo según la posición (retardada) del balón.
export function assignRoles(team, ball) {
  const ownX = -team[0].attack * C.FIELD_W;
  const byBall = [...team].sort(
    (a, b) => dist(a.disc, ball) - dist(b.disc, ball)
  );
  byBall[0].role = 'press';
  const rest = byBall.slice(1).sort(
    (a, b) => Math.hypot(a.disc.x - ownX, a.disc.y) - Math.hypot(b.disc.x - ownX, b.disc.y)
  );
  rest.forEach((p, i) => (p.role = i === 0 ? 'defend' : 'support'));
}

function dist(d, b) {
  return Math.hypot(d.x - b.x, d.y - b.y);
}

// Calcula input {x, y, kick} de un jugador IA. ball = posición retardada.
export function think(p, ball) {
  const d = p.disc;
  const a = p.attack;
  const contact = d.r + C.BALL_RADIUS;
  let tx, ty;
  let kick = false;
  let rush = false;

  const bx = ball.x - d.x, by = ball.y - d.y;
  const bl = len(bx, by);
  const edge = bl - contact;
  const toBallX = bx / bl, toBallY = by / bl;

  // atasco: pegado a un balón que no se mueve → chutar y, si sigue, retroceder un poco
  const still = p.lastBall && Math.hypot(ball.x - p.lastBall.x, ball.y - p.lastBall.y) < 0.5;
  p.lastBall = { x: ball.x, y: ball.y };
  p.stall = edge < 3 && still ? (p.stall || 0) + 1 : 0;
  if (p.stall > C.AI_STALL_THINKS) {
    p.backoff = C.AI_BACKOFF_THINKS;
    p.stall = 0;
    p.aimError = (Math.random() * 2 - 1) * 0.8;
  }

  if (p.backoff > 0) {
    p.backoff--;
    tx = d.x - toBallX * 60;
    ty = d.y - toBallY * 60;
  } else if (p.role === 'press') {
    // dirección deseada del balón: hacia la portería rival, con error
    const gx = a * C.FIELD_W - ball.x;
    const gy = Math.max(-C.GOAL_HALF + 15, Math.min(C.GOAL_HALF - 15, ball.y * 0.3)) - ball.y;
    const gl = len(gx, gy);
    const ang = Math.atan2(gy, gx) + p.aimError;
    const nx = Math.cos(ang), ny = Math.sin(ang);
    // ¿estoy detrás del balón respecto a esa dirección?
    const along = -(bx * nx + by * ny); // >0: delante del balón (mal)
    if (along > -contact * 0.5) {
      // rodear el balón por el lado en el que estoy
      const px = -ny, py = nx;
      const side = -(bx * px + by * py) >= 0 ? 1 : -1;
      tx = ball.x - nx * (contact + 12) + px * side * (contact + 12);
      ty = ball.y - ny * (contact + 12) + py * side * (contact + 12);
    } else {
      tx = ball.x - nx * (contact - 2);
      ty = ball.y - ny * (contact - 2);
      const aligned = Math.acos(Math.max(-1, Math.min(1, toBallX * nx + toBallY * ny)));
      if (aligned < C.AI_KICK_ANGLE) {
        rush = true;
        const inOwnHalf = ball.x * a < 0;
        if (edge <= C.KICK_DIST + 6 && (gl < C.AI_SHOOT_RANGE || inOwnHalf || p.stall > 2)) kick = true;
      }
    }
  } else if (p.role === 'defend') {
    const ox = -a * C.FIELD_W;
    const vx = ball.x - ox, vy = ball.y;
    const vl = len(vx, vy);
    const k = Math.min(C.AI_DEFEND_DIST, vl * 0.6);
    tx = ox + (vx / vl) * k;
    ty = (vy / vl) * k;
  } else {
    tx = ball.x - a * 60;
    ty = ball.y > 0 ? ball.y - C.AI_SUPPORT_Y : ball.y + C.AI_SUPPORT_Y;
  }

  // chute oportunista si el balón sale hacia delante
  if (!kick && p.role !== 'press' && edge <= C.KICK_DIST + 2 && toBallX * a > 0.3) kick = true;

  tx = Math.max(-C.FIELD_W, Math.min(C.FIELD_W, tx));
  ty = Math.max(-C.FIELD_H + d.r, Math.min(C.FIELD_H - d.r, ty));

  if (rush) {
    p.input.x = toBallX * C.AI_SPEED;
    p.input.y = toBallY * C.AI_SPEED;
  } else {
    // anticipa la inercia para no pasarse
    const ex = tx - d.x - d.vx * 8, ey = ty - d.y - d.vy * 8;
    const el = len(ex, ey);
    const m = Math.min(1, Math.hypot(tx - d.x, ty - d.y) / C.AI_ARRIVE) * C.AI_SPEED;
    p.input.x = (ex / el) * m;
    p.input.y = (ey / el) * m;
  }
  // tras chutar hay que soltar antes de volver a pulsar
  p.input.kick = kick && p.kickArmed;
}
