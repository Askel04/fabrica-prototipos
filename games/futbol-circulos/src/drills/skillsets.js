// Juegos de habilidades que se pueden examinar con src/drills/drills.js.
// 'actual' reproduce lo que hace hoy la IA (src/ai/skills.js + chase/carry de brain.js) con los
// parámetros del nivel Difícil; es la línea base contra la que se medirá el planificador nuevo.
import { CONTACT, norm, steer, edgeToBall, ballTo, dribble, gauss } from '../ai/skills.js';
import { trajectory, intercept } from '../ai/evaluate.js';
import { levelParams } from '../ai/params.js';
import { makeMotor } from '../ai/motor.js';
import { DEF_DELAY } from './drills.js';

const P = levelParams(1);

// ir a por el balón como brain.chase (punto de intercepción + amortiguar si llega rápido)
function legacyChase(p, ball) {
  const speed = Math.hypot(ball.vx, ball.vy);
  const dist = Math.hypot(ball.x - p.disc.x, ball.y - p.disc.y);
  if (speed > 2.2 && dist < 70) {
    const [ux, uy] = norm(ball.vx, ball.vy);
    const ahead = (p.disc.x - ball.x) * ux + (p.disc.y - ball.y) * uy;
    if (ahead > 0) return steer(p, ball.x + ux * (CONTACT + 4), ball.y + uy * (CONTACT + 4), 1, 8);
  }
  const it = intercept(p, trajectory(ball.x, ball.y, ball.vx, ball.vy, 120), P.horizonTicks);
  return steer(p, it.x, it.y, 1, 10);
}

// ¿ya está "en posesión" según el criterio de brain (pegado y el balón lento)?
const inPossession = (p, ball) => edgeToBall(p, ball) < 28 && Math.hypot(ball.vx, ball.vy) < 2.2;

export const legacy = {
  name: 'actual',
  control(p, ball) {
    if (!inPossession(p, ball)) return legacyChase(p, ball);
    // con el balón: quedarse detrás de él empujándolo despacio (brain no tiene "parar el balón")
    const [ux, uy] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
    ballTo(p, ball, ball.x + ux * 60, ball.y + uy * 60, { mode: 'push', speed: 0.3 });
  },
  pass(p, ball, tx, ty) {
    if (!inPossession(p, ball)) return legacyChase(p, ball);
    ballTo(p, ball, tx, ty, { mode: 'kick', aimErr: gauss(P.passAim), kickAngle: P.align * 1.6 });
  },
  dribble(p, ball, tx, ty) {
    if (edgeToBall(p, ball) > 28) return legacyChase(p, ball);
    dribble(p, ball, tx, ty);
  },
  shoot(p, ball, tx, ty) {
    if (!inPossession(p, ball)) return legacyChase(p, ball);
    ballTo(p, ball, tx, ty, { mode: 'kick', aimErr: gauss(P.aim), kickAngle: P.align, patient: true });
  },
  beat(p, ball, d, gx, gy) {
    if (edgeToBall(p, ball) > 28) return legacyChase(p, ball);
    dribble(p, ball, gx, gy);
  },
};

// 'motor': planificador por ensayo con la física (src/ai/motor.js). Es una fábrica: necesita saber
// quién más hay en el campo (run.actors) para meterlo en sus ensayos.
export function motorSkills(onField) {
  const mot = makeMotor(onField);
  return {
    name: 'motor',
    control: (p, ball) => mot.control(p, ball),
    pass: (p, ball, tx, ty) => mot.pass(p, ball, tx, ty),
    dribble: (p, ball, tx, ty, next) => mot.dribble(p, ball, tx, ty, null, next),
    shoot: (p, ball, tx, ty) => mot.shoot(p, ball, tx, ty),
    beat: (p, ball, d, gx, gy) => mot.dribble(p, ball, gx, gy, { p: d, gx, gy, delay: DEF_DELAY }),
  };
}

export const SKILLSETS = {
  actual: legacy,
  motor: (run) => motorSkills(() => run.actors.filter((a) => Math.abs(a.disc.y) < 400)),
};
