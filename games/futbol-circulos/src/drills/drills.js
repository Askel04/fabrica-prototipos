// Exámenes de habilidad individual (fase 0 del plan de IA). Cada ejercicio monta una situación con la
// física real del 5v5 (estadio grande), deja actuar a un "juego de habilidades" (skillset) y mide si
// sale bien y cuánto tarda. Sin Phaser: los usa tools/drills.mjs (Node) y el visor ?drill= (navegador).
//
// Un skillset es un objeto con estas habilidades (cada una escribe p.input para este tick):
//   control(p, ball)             recibir y dejar el balón controlado
//   pass(p, ball, tx, ty)        controlar (o de primeras) y pasar a (tx, ty)
//   dribble(p, ball, tx, ty)     conducir hacia (tx, ty)
//   shoot(p, ball, tx, ty)       chutar a (tx, ty)
//   beat(p, ball, d, gx, gy)     superar al defensor d hacia (gx, gy) sin perder el balón
import { CONFIG as C } from '../config.js';
import { Match } from '../sim/match.js';
import { CONTACT, TOP_SPEED, norm, steer, edgeToBall } from '../ai/skills.js';

export const T = (s) => Math.round(s * C.TICK_HZ);

// Defensor de examen: siempre el mismo (para comparar skillsets). Se pone entre el balón y su
// portería, a contacto, y si tiene el balón a tiro lo toca (robo).
export function examDefender(d, ball, gx, gy, intensity = 1) {
  const [ux, uy] = norm(gx - ball.x, gy - ball.y);
  steer(d, ball.x + ux * (CONTACT - 2), ball.y + uy * (CONTACT - 2), intensity, 8);
  if (edgeToBall(d, ball) <= C.KICK_DIST + 1) {
    const [bx, by] = norm(ball.x - d.disc.x, ball.y - d.disc.y);
    d.input.x = bx;
    d.input.y = by;
  }
}

const place = (p, x, y, vx = 0, vy = 0) => Object.assign(p.disc, { x, y, px: x, py: y, vx, vy });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const relSpeed = (p, ball) => Math.hypot(ball.vx - p.disc.vx, ball.vy - p.disc.vy);
const isControlled = (p, ball) => edgeToBall(p, ball) <= 6 && relSpeed(p, ball) < 0.6;
// robo: el defensor tiene el balón pegado y el atacante lo ha perdido durante 0,15 s seguidos
function stealCheck(ctx, att, def) {
  const won = edgeToBall(def, ctx.ball) < 6 && edgeToBall(att, ctx.ball) > 18;
  ctx.stealT = won ? (ctx.stealT || 0) + 1 : 0;
  return ctx.stealT >= 9;
}

// velocidad inicial para que un balón recorra `d` y llegue aún con `vEnd` (damping 0.99)
function launchSpeed(d, vEnd) {
  const DB = C.BALL_DAMPING;
  return Math.min(C.BALL_MAX_SPEED, vEnd + (d * (1 - DB)) / DB);
}

// lanza el balón desde `from` hacia `to` (con algo de desvío) a una velocidad de llegada al azar
function launch(ball, from, to, rng, vEndMin = 0.8, vEndMax = 3.5, off = 15) {
  const [ux, uy, d] = norm(to.x - from.x, to.y - from.y);
  const o = (rng() * 2 - 1) * off;
  const [vx, vy] = norm(to.x + -uy * o - from.x, to.y + ux * o - from.y);
  const v = launchSpeed(d, vEndMin + rng() * (vEndMax - vEndMin));
  Object.assign(ball, { x: from.x, y: from.y, px: from.x, py: from.y, vx: vx * v, vy: vy * v });
  return v;
}

// punto al azar dentro del campo con margen
function randIn(rng, mx, my) {
  return { x: (rng() * 2 - 1) * (C.FIELD_W - mx), y: (rng() * 2 - 1) * (C.FIELD_H - my) };
}

// punto a distancia d de c en una dirección al azar que quede dentro del campo
function around(rng, c, dMin, dMax, margin = 40) {
  for (let i = 0; i < 50; i++) {
    const a = rng() * Math.PI * 2, d = dMin + rng() * (dMax - dMin);
    const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    if (Math.abs(x) < C.FIELD_W - margin && Math.abs(y) < C.FIELD_H - margin) return { x, y };
  }
  return { x: 0, y: 0 };
}

// Cada ejercicio: setup(ctx) coloca todo; act(ctx) mueve a los actores; check(ctx) devuelve
// null mientras sigue, o { ok, ...métricas } al terminar. ctx.t = ticks desde el inicio.
export const DRILLS = {
  recepcion: {
    label: 'Recepción',
    goal: 'Balón que llega de 180–320 a 1–3,5 u/tick → controlado (pegado y con velocidad relativa < 0,6)',
    maxT: T(4),
    setup(ctx) {
      const { rng, R, ball } = ctx;
      const r = randIn(rng, 120, 70);
      place(R, r.x, r.y);
      launch(ball, around(rng, r, 180, 320, 15), r, rng);
      ctx.arrive = null;
      ctx.held = 0;
    },
    act(ctx) {
      ctx.skill.control(ctx.R, ctx.ball);
    },
    check(ctx) {
      const { R, ball, t } = ctx;
      if (ctx.arrive === null && dist(R.disc, ball) < 80) ctx.arrive = t;
      ctx.held = isControlled(R, ball) ? ctx.held + 1 : 0;
      if (ctx.held >= 5) return { ok: true, time: (t - 5 - (ctx.arrive ?? t)) / C.TICK_HZ };
      if (ctx.arrive !== null && dist(R.disc, ball) > 140) return { ok: false, why: 'se escapa' };
      return null;
    },
  },

  controlPase: {
    label: 'Control + pase',
    goal: 'Recibir y pasar a un compañero a 150–350: el pase sale en ≤ 1 s y llega',
    maxT: T(6),
    setup(ctx) {
      const { rng, R, M, ball } = ctx;
      const r = randIn(rng, 140, 80);
      place(R, r.x, r.y);
      const m = around(rng, r, 150, 350);
      place(M, m.x, m.y);
      launch(ball, around(rng, r, 180, 300, 15), r, rng);
      Object.assign(ctx, { arrive: null, kickT: null, minD: Infinity });
    },
    act(ctx) {
      const { R, M, ball } = ctx;
      if (ctx.kickT === null) ctx.skill.pass(R, ball, M.disc.x, M.disc.y);
      else steer(R, R.disc.x, R.disc.y, 0);
    },
    check(ctx) {
      const { R, M, ball, t } = ctx;
      if (ctx.arrive === null && dist(R.disc, ball) < 80) ctx.arrive = t;
      if (ctx.kickT === null && R.lastKick === ctx.m.tick && ctx.arrive !== null) ctx.kickT = t;
      if (ctx.kickT !== null) {
        ctx.minD = Math.min(ctx.minD, dist(M.disc, ball));
        const release = (ctx.kickT - ctx.arrive) / C.TICK_HZ;
        if (ctx.minD < CONTACT + 6) return { ok: release <= 1, release, arrived: true };
        if (t - ctx.kickT > T(3) || Math.hypot(ball.vx, ball.vy) < 0.2) return { ok: false, release, arrived: false, why: 'no llega' };
      } else if (ctx.arrive !== null && dist(R.disc, ball) > 160) return { ok: false, why: 'se escapa' };
      return null;
    },
  },

  primeraPresion: {
    label: 'Pase con presión',
    goal: 'Recibir con un defensor encima y pasar a un compañero antes de que robe',
    maxT: T(5),
    setup(ctx) {
      DRILLS.controlPase.setup(ctx);
      const { rng, R, D } = ctx;
      // defensor a 60–100 del receptor, por el lado contrario al compañero
      const [ux, uy] = norm(R.disc.x - ctx.M.disc.x, R.disc.y - ctx.M.disc.y);
      const a = Math.atan2(uy, ux) + (rng() * 2 - 1) * 1.2;
      const d = 60 + rng() * 40;
      place(D, R.disc.x + Math.cos(a) * d, R.disc.y + Math.sin(a) * d);
    },
    act(ctx) {
      DRILLS.controlPase.act(ctx);
      // presiona al receptor por el lado de su compañero (cortando el pase); tras el pase se para
      if (ctx.kickT === null) examDefender(ctx.D, ctx.ball, ctx.M.disc.x, ctx.M.disc.y);
    },
    check(ctx) {
      if (ctx.kickT === null && stealCheck(ctx, ctx.R, ctx.D)) return { ok: false, why: 'robo' };
      const r = DRILLS.controlPase.check(ctx);
      if (r && r.arrived) r.ok = true; // aquí cuenta llegar, no el tiempo
      return r;
    },
  },

  conduccion: {
    label: 'Conducción',
    goal: 'Llevar el balón por 3 puntos (recta o zigzag) a casi velocidad punta sin perderlo',
    maxT: T(8),
    setup(ctx) {
      const { rng, R, ball } = ctx;
      const s = { x: -C.FIELD_W + 120, y: (rng() * 2 - 1) * 60 };
      const zig = rng() < 0.5;
      ctx.route = [1, 2, 3].map((i) => ({ x: s.x + i * 150, y: s.y + (zig ? (i % 2 ? 1 : -1) * 90 : 0) }));
      ctx.wp = 0;
      ctx.zig = zig;
      const [ux, uy] = norm(ctx.route[0].x - s.x, ctx.route[0].y - s.y);
      place(R, s.x, s.y);
      Object.assign(ball, { x: s.x + ux * (CONTACT + 2), y: s.y + uy * (CONTACT + 2), px: 0, py: 0, vx: 0, vy: 0 });
      ctx.maxSep = 0;
      ctx.path = 0;
      ctx.prev = { x: ball.x, y: ball.y };
    },
    act(ctx) {
      const w = ctx.route[ctx.wp];
      ctx.skill.dribble(ctx.R, ctx.ball, w.x, w.y);
    },
    check(ctx) {
      const { R, ball, t } = ctx;
      ctx.maxSep = Math.max(ctx.maxSep, edgeToBall(R, ball));
      ctx.path += dist(ctx.prev, ball);
      ctx.prev = { x: ball.x, y: ball.y };
      if (dist(ctx.route[ctx.wp], ball) < 30) ctx.wp++;
      if (ctx.wp >= ctx.route.length) {
        const speed = ctx.path / t / TOP_SPEED;
        return { ok: speed >= 0.7, time: t / C.TICK_HZ, speed, maxSep: ctx.maxSep, zig: ctx.zig, why: speed < 0.7 ? 'lento' : undefined };
      }
      if (edgeToBall(R, ball) > 60) return { ok: false, why: 'pierde el balón', maxSep: ctx.maxSep };
      return null;
    },
    timeout(ctx) {
      return { ok: false, why: ctx.zig ? 'zigzag sin terminar' : 'recta sin terminar' };
    },
  },

  giro: {
    label: 'Giro 180°',
    goal: 'Conduciendo a buena velocidad, darse la vuelta con el balón (≤ 0,8 s)',
    maxT: T(3),
    setup(ctx) {
      const { rng, R, ball } = ctx;
      const y = (rng() * 2 - 1) * 100;
      const dir = rng() < 0.5 ? 1 : -1;
      const v = 1.6 + rng() * 0.6;
      place(R, -dir * 100, y, dir * v, 0);
      Object.assign(ball, { x: -dir * 100 + dir * (CONTACT + 3), y, px: 0, py: 0, vx: dir * v, vy: 0 });
      ctx.dir = dir;
      ctx.target = { x: -dir * 400, y };
    },
    act(ctx) {
      ctx.skill.dribble(ctx.R, ctx.ball, ctx.target.x, ctx.target.y);
    },
    check(ctx) {
      const { R, ball, t, dir } = ctx;
      if (edgeToBall(R, ball) > 60) return { ok: false, why: 'pierde el balón' };
      // ya va hacia atrás con el balón pegado
      if (-dir * ball.vx > 1.2 && edgeToBall(R, ball) < 20) return { ok: t <= T(0.8), time: t / C.TICK_HZ, why: t > T(0.8) ? 'lento' : undefined };
      return null;
    },
  },

  unoContraUno: {
    label: '1 contra 1',
    goal: 'Con el balón y un defensor delante: superarlo sin perderlo (o al menos conservarlo 2 s)',
    maxT: T(5),
    setup(ctx) {
      const { rng, R, D, ball } = ctx;
      const y = (rng() * 2 - 1) * 120;
      const x = -100 + rng() * 150;
      place(R, x, y);
      Object.assign(ball, { x: x + CONTACT + 2, y, px: 0, py: 0, vx: 0, vy: 0 });
      place(D, x + 90 + rng() * 30, y + (rng() * 2 - 1) * 30);
      ctx.goalPt = { x: C.FIELD_W, y: 0 };
      ctx.kept2 = false;
    },
    act(ctx) {
      const { R, D, ball } = ctx;
      ctx.skill.beat(R, ball, D, ctx.goalPt.x, ctx.goalPt.y);
      examDefender(D, ball, C.FIELD_W, 0); // defiende la portería hacia la que va el atacante
    },
    check(ctx) {
      const { R, D, ball, t, m } = ctx;
      if (t === T(2)) ctx.kept2 = true;
      if (stealCheck(ctx, R, D)) return { ok: false, why: 'robo', kept2: ctx.kept2 };
      if (ball.x > D.disc.x + 40 && edgeToBall(R, ball) < 30) return { ok: true, time: t / C.TICK_HZ, kept2: true };
      if (m.state === 'goal') return { ok: true, time: t / C.TICK_HZ, kept2: true };
      if (edgeToBall(R, ball) > 90) return { ok: false, why: 'lo pierde', kept2: ctx.kept2 };
      return null;
    },
    timeout() {
      return { ok: false, why: 'no lo supera', kept2: true };
    },
  },

  tiro: {
    label: 'Tiro',
    goal: 'Con el balón a 150–350 de la portería vacía: chutar a un palo y marcar',
    maxT: T(4),
    setup(ctx) {
      const { rng, R, ball } = ctx;
      const a = (rng() * 2 - 1) * 1.0, d = 150 + rng() * 200;
      const x = C.FIELD_W - Math.cos(a) * d, y = Math.sin(a) * d * 0.8;
      // balón delante del jugador en una dirección al azar (hay que orientarse)
      const b = rng() * Math.PI * 2;
      place(R, x, y);
      Object.assign(ball, { x: x + Math.cos(b) * (CONTACT + 2), y: y + Math.sin(b) * (CONTACT + 2), px: 0, py: 0, vx: 0, vy: 0 });
      ctx.aimPt = { x: C.FIELD_W, y: (rng() < 0.5 ? -1 : 1) * (C.GOAL_HALF - 18) };
      ctx.kickT = null;
    },
    act(ctx) {
      if (ctx.kickT === null) ctx.skill.shoot(ctx.R, ctx.ball, ctx.aimPt.x, ctx.aimPt.y);
      else steer(ctx.R, ctx.R.disc.x, ctx.R.disc.y, 0);
    },
    check(ctx) {
      const { R, ball, t, m } = ctx;
      if (ctx.kickT === null && R.lastKick === m.tick) ctx.kickT = t;
      if (m.state === 'goal') return { ok: true, time: ctx.kickT / C.TICK_HZ };
      if (ctx.kickT !== null && (t - ctx.kickT > T(2.5) || Math.hypot(ball.vx, ball.vy) < 0.3)) return { ok: false, why: 'fuera', time: ctx.kickT / C.TICK_HZ };
      return null;
    },
  },
};

// RNG con semilla (mulberry32) para que las tandas sean repetibles
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ejecuta intentos de un ejercicio sobre un Match del 5v5 con solo los actores en el campo.
export class DrillRun {
  constructor(name, skill, seed = 1) {
    this.drill = DRILLS[name];
    this.name = name;
    this.skill = skill;
    this.rng = seeded(seed);
    this.m = new Match({ humanTeam: null, teamSize: 5, stadium: 'big', levels: { red: 'hard', blue: 'hard' } });
    for (const b of Object.values(this.m.brains)) b.update = () => {}; // aquí mandan el ejercicio y el skillset
    const red = this.m.players.filter((p) => p.team === 'red'), blue = this.m.players.filter((p) => p.team === 'blue');
    this.R = red[0]; this.M = red[1]; this.D = blue[0];
    this.actors = [this.R, this.M, this.D];
    for (const p of this.m.players) p.parked = !this.actors.includes(p);
    this.m.world.discs = [...this.actors.map((p) => p.disc), this.m.ball];
    this.trial = 0;
    this.results = [];
    this.reset();
  }

  reset() {
    const m = this.m;
    m.state = 'play';
    m.lastTouch = null;
    m.ballHistory.length = 0;
    for (const p of m.players) {
      p.disc.clamp = null;
      p.input = { x: 0, y: 0, kick: false };
      p.kickArmed = true;
      p.lastKick = -1;
      p.dribDir = null;
      Object.assign(p.disc, { x: 0, y: 1000, px: 0, py: 1000, vx: 0, vy: 0 });
    }
    // los actores que el ejercicio no coloca se quedan fuera del campo
    this.ctx = { m, R: this.R, M: this.M, D: this.D, ball: m.ball, rng: this.rng, skill: this.skill, t: 0 };
    this.drill.setup(this.ctx);
    this.ctx.m.ball.px = this.ctx.m.ball.x;
    this.ctx.m.ball.py = this.ctx.m.ball.y;
  }

  // un tick; devuelve el resultado del intento cuando termina (y prepara el siguiente)
  step() {
    const ctx = this.ctx;
    for (const p of this.actors) p.input = { x: 0, y: 0, kick: false };
    this.drill.act(ctx);
    this.m.step();
    ctx.t++;
    let res = this.drill.check(ctx);
    if (!res && ctx.t >= this.drill.maxT) res = this.drill.timeout ? this.drill.timeout(ctx) : { ok: false, why: 'tiempo' };
    if (res) {
      this.results.push(res);
      this.trial++;
      this.reset();
    }
    return res;
  }

  run(trials) {
    while (this.trial < trials) this.step();
    return summarize(this.name, this.results);
  }
}

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

export function summarize(name, results) {
  const n = results.length;
  const pct = (f) => Math.round((results.filter(f).length / Math.max(1, n)) * 100);
  const vals = (k, f = () => true) => results.filter((r) => r[k] !== undefined && r[k] !== null && f(r)).map((r) => r[k]);
  const why = {};
  for (const r of results) if (!r.ok && r.why) why[r.why] = (why[r.why] || 0) + 1;
  const out = { drill: name, n, ok: pct((r) => r.ok) };
  const med = (k, f) => { const v = median(vals(k, f)); return v === null ? undefined : +v.toFixed(2); };
  if (name === 'recepcion') out.tiempo = med('time', (r) => r.ok);
  if (name === 'controlPase' || name === 'primeraPresion') {
    out.llega = pct((r) => r.arrived);
    out.soltar = med('release');
    out.soltarEn1s = pct((r) => r.release !== undefined && r.release <= 1);
  }
  if (name === 'conduccion') { out.velocidad = med('speed'); out.separacionMax = med('maxSep'); out.tiempo = med('time'); }
  if (name === 'giro') out.tiempo = med('time');
  if (name === 'tiro' || name === 'unoContraUno') out.tiempo = med('time', (r) => r.ok);
  if (name === 'unoContraUno') out.conserva2s = pct((r) => r.kept2);
  out.fallos = why;
  return out;
}
