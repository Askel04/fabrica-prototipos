// Cerebro de equipo por capas (informe "IA de CPU en juegos deportivos"):
//   percepción con retardo → estado de equipo (posesión / sin posesión / suelto, con histéresis)
//   → roles por tiempo de intercepción (presionador, cobertura, apoyos, portero) → steering.
// Un solo cerebro para todos los niveles; la dificultad es un vector de parámetros interpolado por θ
// (src/ai/params.js). Mismas físicas para todos: los niveles altos deciden mejor, no corren más.
import { CONFIG as C } from '../config.js';
import {
  CONTACT, norm, edgeToBall, gauss, rand, clampField, steer, ballTo, approachAngle,
  safeKickDir, clearNow, dribble,
} from './skills.js';
import {
  trajectory, shotPath, intercept, passSafety, bestShot, threat, laneProb, timeToReach,
  KICK_SPEED, PUSH_SPEED,
} from './evaluate.js';
import { levelParams } from './params.js';
import { perceive } from './perception.js';
import { assignSpots } from './support.js';
import TRAINED from './weights.js';

const W = C.FIELD_W, H = C.FIELD_H, G = C.GOAL_HALF;
const ticks = (ms) => Math.max(1, Math.round((ms * C.TICK_HZ) / 1000));

// Pesos de las utilidades (tools/train.mjs puede reajustarlos y guardarlos en weights.js).
export const DEFAULT_WEIGHTS = {
  shot: 1.8, // tiro: × calidad del hueco
  pass: 1.0, // pase: × seguridad × valor del sitio donde recibe
  dribble: 0.8, // conducir: × espacio por delante × valor
  hold: 0.3, // extra por controlar sin presión
  clear: 0.4, // despeje en zona de peligro
  align: 0.9, // coste de tener que rodear el balón
  human: 0.2, // extra por jugar con el humano
  oneTwo: 1.2, // devolver la pared
  // desmarque (puntos de apoyo)
  supPass: 2.0, supShot: 1.0, supDist: 1.5, supSpace: 1.0, supAdv: 0.8,
  supMate: 1.2, supRole: 2.0, supMove: 0.6,
};

// rasgos de personalidad (como los PlayStyles de la CPU en FIFA): sesgos sobre la utilidad
const TRAITS = [
  { name: 'tirador', shot: 1.35, pass: 0.9, dribble: 1 },
  { name: 'pasador', shot: 0.85, pass: 1.3, dribble: 0.9 },
  { name: 'regateador', shot: 1, pass: 0.85, dribble: 1.35 },
  { name: 'equilibrado', shot: 1, pass: 1, dribble: 1 },
];

export class TeamBrain {
  constructor(match, team, weights) {
    this.m = match;
    this.team = team;
    this.players = match.players.filter((p) => p.team === team);
    this.opps = match.players.filter((p) => p.team !== team);
    this.attack = this.players[0].attack;
    this.w = { ...DEFAULT_WEIGHTS, ...TRAINED, ...(weights || {}) };
    this.noise = { x: 0, y: 0, vx: 0, vy: 0 };
    this.adapt = { sectors: [0, 0, 0], long: 0, short: 0, biasY: 0, gkBonus: 0 };
    this.reset();
  }

  reset() {
    this.keeper = null;
    this.phase = 'loose';
    this.phaseCand = null;
    this.lastThink = -1e9;
    this.lastPass = null;
    this.spots = new Map();
    this.chaser = null;
    this.presser = null;
    this.debugSpots = null;
    for (const p of this.players) {
      p.job = null;
      p.act = null;
      p.run = null;
      p.carryStart = null;
      p.stall = 0;
      p.spot = null;
      p.dribDir = null;
      p.trait = TRAITS[Math.floor(Math.random() * TRAITS.length)];
    }
  }

  // un compañero recibió un pase (lo llama Match)
  onReceive(from, to) {
    this.lastPass = { from, to, tick: this.m.tick };
  }

  // un rival chutó (lo llama Match): estadística para la adaptación
  onOppKick(p, ball) {
    const ogx = -this.attack * W;
    const fromGoal = Math.hypot(ball.x - ogx, ball.y);
    if (fromGoal > 330) return;
    this.adapt.sectors[ball.y < -55 ? 0 : ball.y > 55 ? 2 : 1]++;
    if (fromGoal > 200) this.adapt.long++; else this.adapt.short++;
  }

  update(levelName) {
    const L = C.AI_LEVELS[levelName];
    const P = levelParams(L.theta);
    this.P = P;
    const tick = this.m.tick;
    if (tick - this.lastThink >= P.decisionTicks || !this.ball) {
      this.lastThink = tick;
      this.think();
    }
    if (tick % P.supportTicks === 0 && this.ball) this.updateSpots();
    if (P.adapt && tick % ticks(30000) === 0) this.adaptPlan();
    for (const p of this.players) if (!p.human) this.act(p);
  }

  // ---------------- percepción + estado + roles (cada decisionInterval) ----------------
  think() {
    const { P, m } = this;
    const a = this.attack;
    const view = perceive(m, this.team, P, this.noise);
    this.ball = view.ball;
    this.oppsV = view.opps;
    const ball = this.ball;
    const ais = this.players.filter((p) => !p.human);
    if (!this.keeper || !ais.includes(this.keeper)) this.keeper = minBy(ais, (p) => p.disc.x * a);
    const kp = this.keeper;

    // ¿quién tiene el balón? (sobre lo que percibe)
    const all = [...this.players, ...this.oppsV];
    // posesión = control claro: el más cercano está pegado al balón y ningún rival lo disputa
    const owner = minBy(all, (p) => edgeToBall(p, ball));
    const ownerEdge = edgeToBall(owner, ball);
    const rivalEdge = Math.min(...all.filter((q) => q.team !== owner.team).map((q) => edgeToBall(q, ball)));
    const clear = ownerEdge < 12 && rivalEdge > ownerEdge + 14;
    const raw = !clear ? 'loose' : owner.team === this.team ? 'attack' : 'defend';
    this.raw = raw;
    // histéresis: el estado cambia solo si se mantiene ≥ 150 ms (o si un IA propio la controla)
    if (raw !== this.phase) {
      if (this.phaseCand !== raw) { this.phaseCand = raw; this.phaseSince = m.tick; }
      if (m.tick - this.phaseSince >= 9 || (raw === 'attack' && !owner.human && edgeToBall(owner, ball) < 4)) this.phase = raw;
    } else this.phaseCand = null;
    const phase = this.phase;
    this.owner = raw === 'loose' ? null : owner;

    // predicción del balón y tiempos de intercepción (con el horizonte del nivel)
    this.path = trajectory(ball.x, ball.y, ball.vx, ball.vy, 120);
    const H = P.horizonTicks;
    const itOf = new Map(all.map((p) => [p, intercept(p, this.path, H)]));
    this.itOf = itOf;
    const tOpp = Math.min(...this.oppsV.map((o) => itOf.get(o).t));
    this.tOpp = tOpp;

    const jobs = new Map();
    const field = ais.filter((p) => p !== kp);
    const human = this.players.find((p) => p.human);

    if (phase === 'attack' && this.owner && this.owner.team === this.team) {
      if (!this.owner.human) jobs.set(this.owner, 'carry');
      // el portero solo se suma al ataque con el balón lejos de su portería
      const ballDepth = ball.x * a + W;
      for (const p of ais) if (!jobs.has(p)) jobs.set(p, p === kp ? (P.libero && ballDepth > 260 ? 'libero' : 'keep') : 'support');
    } else if (phase === 'loose' || !this.owner || this.owner.team === this.team || raw === 'loose') {
      // balón suelto: va quien llega antes (con histéresis); el portero tiene prioridad en su zona
      const kIt = kp && itOf.get(kp);
      const fromGoal = kIt ? Math.hypot(kIt.x + a * W, kIt.y) : Infinity;
      const keeperGoes = kp && kIt.seen && fromGoal < P.gkSweep &&
        Math.abs(kIt.y) < G + 90 && kIt.t + P.gkMarginTicks < tOpp;
      let chaser = keeperGoes ? kp : null;
      if (!chaser) {
        const cands = [...field, ...(human ? [human] : [])];
        chaser = minBy(cands, (p) => itOf.get(p).t - (p === this.chaser ? 8 : 0) + (p.human ? -6 : 0));
      }
      this.chaser = chaser;
      if (chaser && !chaser.human) jobs.set(chaser, 'chase');
      if (keeperGoes && this.keeperJob !== 'chase') m.stats[this.team].sweeps++;
      const winning = chaser && itOf.get(chaser).t + 6 < tOpp;
      for (const p of ais) {
        if (jobs.has(p)) continue;
        if (p === kp) jobs.set(p, 'keep');
        else if (P.bunch && Math.hypot(p.disc.x - ball.x, p.disc.y - ball.y) < 140) jobs.set(p, 'chase'); // se amontonan
        else jobs.set(p, winning ? 'support' : 'cover');
      }
    } else {
      // sin posesión: presionador = el que llega antes al poseedor (con histéresis)
      const o = this.owner.disc;
      const cands = [...field, ...(human ? [human] : [])];
      const presser = minBy(cands, (p) => timeToReach(p, o.x, o.y) - (p === this.presser ? 8 : 0));
      this.presser = presser;
      if (presser && !presser.human) jobs.set(presser, 'press');
      const inTheirHalf = o.x * a > 0;
      for (const p of field) {
        if (jobs.has(p)) continue;
        if (P.doublePress && inTheirHalf) jobs.set(p, 'press2');
        else jobs.set(p, 'cover'); // en niveles bajos la cobertura es floja (sin cortar líneas, sin bascular)
      }
      if (kp && !jobs.has(kp)) jobs.set(kp, 'keep');
    }

    // el portero no espera a la histéresis: si la posesión deja de ser clara, vuelve ya
    if (kp && jobs.get(kp) === 'libero' && raw !== 'attack') jobs.set(kp, 'keep');
    // portero fuera de su sitio y sin posesión clara: el defensa que cubre se mete bajo palos
    if (kp && raw !== 'attack') {
      const K = this.keeperSpot(ball);
      if (Math.hypot(kp.disc.x - K.x, kp.disc.y - K.y) > 70) {
        const cov = minBy(field.filter((p) => jobs.get(p) === 'cover' || jobs.get(p) === 'support'),
          (p) => Math.hypot(p.disc.x - K.x, p.disc.y - K.y));
        if (cov) jobs.set(cov, 'goalCover');
      }
    }

    for (const p of ais) {
      const job = jobs.get(p);
      if (job !== 'carry' && job !== 'chase') { p.carryStart = null; p.act = null; }
      p.job = job;
    }
    this.keeperJob = kp?.job;
    if (kp && phase === 'attack') {
      m.stats[this.team].gkAtk += Math.hypot(kp.disc.x + a * W, kp.disc.y);
      m.stats[this.team].gkAtkN++;
    }
    this.updateSpots();
  }

  updateSpots() {
    const sup = this.players.filter((p) => !p.human && (p.job === 'support' || p.job === 'libero'));
    if (!sup.length) return;
    const spots = assignSpots(this, sup, this.m.ball);
    for (const [p, s] of spots) p.spot = s;
  }

  // Adaptación lenta (Teamvision/ACE): si el rival insiste por una banda o con tiros lejanos,
  // cerrar más esa banda y adelantar un poco al portero.
  adaptPlan() {
    const s = this.adapt.sectors;
    const total = s[0] + s[1] + s[2];
    if (total < 4) return;
    const maxI = s.indexOf(Math.max(...s));
    this.adapt.biasY = s[maxI] / total > 0.45 ? [-90, 0, 90][maxI] : 0;
    this.adapt.gkBonus = this.adapt.long > this.adapt.short * 1.5 ? 14 : 0;
  }

  // ---------------- ejecución (cada tick) ----------------
  act(p) {
    p.input.kick = false;
    switch (p.job) {
      case 'carry': return this.carry(p);
      case 'chase': return this.chase(p);
      case 'support':
      case 'libero':
        if (p.run && p.run.until > this.m.tick) return steer(p, p.run.x, p.run.y, 1);
        if (p.spot) return steer(p, p.spot.x, p.spot.y, 1);
        return steer(p, p.disc.x, p.disc.y, 0);
      case 'press': return this.press(p);
      case 'press2': return this.press2(p);
      case 'cover': return this.cover(p);
      case 'keep': return this.keep(p);
      case 'goalCover': {
        const K = this.keeperSpot(this.ball);
        steer(p, K.x, K.y, 1, 8);
        return this.pinch(p);
      }
      default: return steer(p, p.disc.x, p.disc.y, 0);
    }
  }

  // Ir a por el balón suelto al punto de intercepción predicho (dentro del horizonte del nivel).
  // Si el balón llega rápido, control orientado: correr con él para amortiguarlo.
  chase(p) {
    const real = this.m.ball;
    const speed = Math.hypot(real.vx, real.vy);
    const dist = Math.hypot(real.x - p.disc.x, real.y - p.disc.y);
    if (edgeToBall(p, real) < 28 && speed < 2.2) return this.carry(p);
    if (speed > 2.2 && dist < 70) {
      const [ux, uy] = norm(real.vx, real.vy);
      const ahead = (p.disc.x - real.x) * ux + (p.disc.y - real.y) * uy;
      if (ahead > 0) return steer(p, real.x + ux * (CONTACT + 4), real.y + uy * (CONTACT + 4), 1, 8);
      if (edgeToBall(p, real) < 28) return this.carry(p);
    }
    const it = intercept(p, this.path, this.P.horizonTicks);
    return steer(p, it.x - this.attack * CONTACT * 0.5, it.y, 1, 10);
  }

  // ---------------- con balón (utilidad + softmax + compromiso) ----------------
  carry(p) {
    const { P, m } = this;
    const ball = m.ball;
    const a = this.attack;
    if (p.carryStart === null) { p.carryStart = m.tick; p.act = null; }

    p.stall = edgeToBall(p, ball) < 3 && Math.hypot(ball.vx, ball.vy) < 0.15 ? p.stall + 1 : 0;
    if (p.stall > 90) {
      p.stall = 0;
      p.act = { type: 'kick', mode: 'kick', tx: a * W, ty: rand(H), until: m.tick + 30, err: rand(0.6), kickAngle: 1.2, start: m.tick };
    }

    // balón disputado: pelearlo; en campo propio despejar si es seguro
    const oppNear = Math.min(...this.opps.map((o) => Math.hypot(o.disc.x - ball.x, o.disc.y - ball.y)));
    const ownHalf = ball.x * a < 0;
    if (oppNear < CONTACT + 12 && (!p.act || p.act.type === 'dribble')) {
      if (ownHalf && safeKickDir(p, ball) && approachAngle(p, ball, a * W, 0) > 0.6) return clearNow(p, ball);
      return ballTo(p, ball, a * W, ownHalf ? ball.y * 0.5 : 0, { mode: 'kick', aimErr: gauss(P.aim), kickAngle: ownHalf ? 1.0 : 0.55 });
    }

    const act = p.act;
    const done = act && ((act.mode === 'kick' && p.lastKick > act.start) ||
      (act.mode === 'push' && act.type !== 'dribble' && edgeToBall(p, ball) > 14 && m.tick - act.start > 8));
    if (done && act.type === 'pass') this.afterPass(p, act);
    const requested = m.passRequestTick > (act?.start ?? -1) && m.tick - m.passRequestTick < 90 && p.team === m.human?.team;
    if (!act || done || m.tick > act.until || requested) p.act = this.decide(p);
    this.execute(p, p.act);
  }

  execute(p, act) {
    const ball = this.m.ball;
    if (act.type === 'clear') {
      if (safeKickDir(p, ball)) return clearNow(p, ball);
      // despejar hacia donde menos haya que rodear el balón (banda o adelante), nunca hacia la portería
      const a = this.attack;
      const opts = [[ball.x + a * 220, H], [ball.x + a * 220, -H], [ball.x + a * 40, H], [ball.x + a * 40, -H]];
      const [tx, ty] = minBy(opts, ([x, y]) => approachAngle(p, ball, x, y));
      return ballTo(p, ball, tx, ty, { mode: 'kick', aimErr: act.err, kickAngle: 1.1 });
    }
    if (act.type === 'fake') { p.input.x = act.dx; p.input.y = act.dy; return; }
    if (act.type === 'dribble') return dribble(p, ball, act.tx, act.ty, 0.04 + 0.05 * this.P.theta);
    // con tiempo (ningún rival cerca) termina de orientarse; los niveles bajos no tienen esa paciencia
    const tOpp = Math.min(...this.opps.map((o) => timeToReach(o, ball.x, ball.y)));
    const patient = this.P.theta >= 0.4 && tOpp > 30;
    ballTo(p, ball, act.tx, act.ty, { mode: act.mode, aimErr: act.err, kickAngle: act.kickAngle, patient });
  }

  // Tras pasar: correr al espacio para pedir la pared (si el nivel la conoce).
  afterPass(p, act) {
    if (!this.P.oneTwo) return;
    const a = this.attack;
    const [x, y] = clampField(p.disc.x + a * 130, p.disc.y * 0.5 + (act.ty - p.disc.y) * -0.3, 35);
    p.run = { x, y, until: this.m.tick + ticks(1600) };
  }

  decide(p) {
    const { P, m, w } = this;
    const ball = m.ball;
    const a = this.attack;
    const tick = m.tick;
    const opps = this.oppsV || this.opps;
    const tr = p.trait;
    const opts = [];
    // ¿le da tiempo a orientarse antes de que llegue el rival más cercano?
    const tOpp = Math.min(...opps.map((o) => timeToReach(o, ball.x, ball.y)));
    const align = (tx, ty) => 1 / (1 + Math.exp(-(tOpp - approachAngle(p, ball, tx, ty) * 22 * w.align) / 6));
    const fromOwnGoal = Math.hypot(ball.x + a * W, ball.y);
    const pressure = Math.max(0, Math.min(1, 1 - (tOpp - 10) / 40));
    // zona de peligro: cerca de la propia portería, o en el propio tercio con un rival encima
    const ownThird = ball.x * a < -W * 0.35;
    // el portero lejos de su zona la suelta rápido (pase seguro o despeje)
    const keeperFar = p === this.keeper && fromOwnGoal > P.liberoDepth;
    const danger = fromOwnGoal < 150 || (ownThird && pressure > 0.4) || keeperFar ||
      (p === this.keeper && fromOwnGoal < P.gkSweep && pressure > 0.5);
    const requested = p.team === m.human?.team && tick - m.passRequestTick < 90;
    const value = (x, y) => threat(x, y, a) + 0.15;

    // tiro al centro del mayor hueco libre
    if (!danger) {
      const s = bestShot(ball, opps, a);
      if (s.dist < 380 && s.quality > 0) {
        opts.push({ u: w.shot * tr.shot * s.quality * align(s.x, s.y), type: 'shot', mode: 'kick', tx: s.x, ty: s.y, noise: P.aim, kickAngle: P.align });
      }
    }

    // pases: al pie, al espacio (al punto de apoyo hacia el que corre) y a la banda
    for (const mt of this.players) {
      if (mt === p) continue;
      const lead = mt.human ? 6 : 10;
      const targets = [[mt.disc.x + mt.disc.vx * lead, mt.disc.y + mt.disc.vy * lead, 'feet']];
      if (P.through) {
        if (mt.spot && !mt.human) targets.push([mt.spot.x, mt.spot.y, 'through']);
        else targets.push([mt.disc.x + a * 70 + mt.disc.vx * 15, mt.disc.y + mt.disc.vy * 15, 'through']);
      }
      if (P.wallPass) {
        const wy = mt.disc.y > ball.y ? H : -H;
        targets.push([mt.disc.x, 2 * wy - mt.disc.y, 'wall']);
      }
      for (let [tx, ty, kind] of targets) {
        if (kind !== 'wall') [tx, ty] = clampField(tx, ty, 18);
        const d = Math.hypot(tx - ball.x, ty - ball.y);
        if (d < 50) continue;
        const mode = d > (kind === 'feet' ? 130 : 180) || kind === 'wall' ? 'kick' : 'push';
        const ps = passSafety(shotPath(ball.x, ball.y, tx, ty, mode === 'kick' ? KICK_SPEED : PUSH_SPEED, 100), mt, opps, P.passMarginTicks);
        let u = w.pass * tr.pass * ps.p * value(ps.x, ps.y) * align(tx, ty);
        if (mt.human) u += w.human * ps.p;
        const running = mt.disc.vx * a > 0.8;
        if (mt.human && requested && (kind === 'feet' || (kind === 'through' && running))) u += 2 * ps.p;
        if (P.oneTwo && this.lastPass?.from === mt && this.lastPass.to === p && tick - this.lastPass.tick < 120) u += w.oneTwo * ps.p;
        if (mt.run && mt.run.until > tick) u += w.oneTwo * 0.5 * ps.p;
        // al portero: como dejada bajo presión (niveles que la conocen) o en salida de balón
        if (mt === this.keeper && !danger) u *= P.drop && pressure > 0.5 ? 0.9 : 0.35;
        // en zona de peligro solo pases seguros y nunca hacia la propia portería
        if (danger && (ps.p < 0.75 || (tx - ball.x) * a < -40)) continue;
        opts.push({ u, type: 'pass', mode, tx, ty, kind, to: mt, noise: P.passAim, kickAngle: P.align * 1.6 });
      }
    }

    if (danger) {
      const side = ball.y >= 0 ? 1 : -1;
      opts.push({ u: w.clear * (0.5 + pressure), type: 'clear', mode: 'kick', tx: ball.x + a * 220, ty: side * H, noise: P.aim });
    }
    if (!danger || pressure < 0.3) {
      // conducir hacia el espacio que controlo (llego antes que los rivales)
      const held = tick - p.carryStart;
      const calm = held < P.holdTicks && pressure < 0.3;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const qx = ball.x + Math.cos(ang) * 70, qy = ball.y + Math.sin(ang) * 70;
        if (Math.abs(qy) > H - 15 || Math.abs(qx) > W - 12) continue;
        // nunca conducir hacia la propia portería cerca de ella
        const forward = Math.cos(ang) * a;
        if (forward < -0.3 && fromOwnGoal < 230) continue;
        const tO = Math.min(...opps.map((o) => timeToReach(o, qx, qy)));
        const space = 1 / (1 + Math.exp(-(tO - timeToReach(p, qx, qy) - 6) / 8));
        let u = w.dribble * tr.dribble * value(qx, qy) * space * (1 - 0.6 * pressure) * align(qx, qy);
        if (calm && forward > -0.2) u += w.hold * space * (0.5 + 0.5 * forward);
        if (p === this.keeper) u *= 0.6; // el portero con balón prefiere pasar
        opts.push({ u, type: 'dribble', mode: 'push', tx: ball.x + Math.cos(ang) * 120, ty: ball.y + Math.sin(ang) * 120 });
      }
      // amago: solo con el rival llegando (no encima) y de vez en cuando
      if (P.fakes && pressure > 0.4 && pressure < 0.75 && Math.random() < 0.12) {
        const [ox, oy] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
        const s = Math.random() < 0.5 ? 1 : -1;
        opts.push({ u: 0.25, type: 'fake', dx: -oy * s * 0.7, dy: ox * s * 0.7, until: tick + 12 + Math.floor(Math.random() * 12) });
      }
    }

    const pick = softmaxTop(opts, P.temperature, 4);
    return {
      ...pick, err: gauss(pick.noise || 0), start: tick,
      until: pick.until ?? tick + (pick.type === 'dribble' ? P.commitTicks : 40),
    };
  }

  // ---------------- sin balón, defendiendo ----------------
  // rival más peligroso sin balón: amenaza de su zona × que le pueda llegar el pase
  dangerous(self) {
    const { ball } = this;
    const blockers = this.players.filter((q) => q !== self);
    let best = null, bv = -1;
    for (const o of this.oppsV) {
      if (this.owner && o.ref === this.owner.ref) continue;
      let v = threat(o.disc.x, o.disc.y, -this.attack) * (0.3 + laneProb(ball.x, ball.y, o.disc.x, o.disc.y, blockers));
      if (this.adapt.biasY && Math.abs(o.disc.y - this.adapt.biasY) < 70) v *= 1.3;
      if (v > bv) { bv = v; best = o; }
    }
    return best;
  }

  // Presionador: por el lado de su portería, desviado hacia la línea de pase más peligrosa.
  // Si el poseedor controla, esperar a cierta distancia; si se le separa el balón, robar.
  press(p) {
    const { P, ball } = this;
    const ogx = -this.attack * W;
    let [gx, gy] = norm(ogx - ball.x, -ball.y * 0.5);
    const r = this.dangerous(p);
    if (r && P.cover && (r.disc.x - ball.x) * this.attack < 0) {
      const shade = 0.25 + 0.25 * P.theta;
      const [rx, ry] = norm(r.disc.x - ball.x, r.disc.y - ball.y);
      [gx, gy] = norm(gx * (1 - shade) + rx * shade, gy * (1 - shade) + ry * shade);
    }
    const controlled = this.owner && edgeToBall(this.owner, ball) < 6;
    const close = controlled ? P.standOff : P.bodyBlock ? CONTACT - 2 : CONTACT + 4;
    steer(p, ball.x + gx * close, ball.y + gy * close, P.pressSpeed, 12);
    if (P.bodyBlock && !controlled && Math.hypot(p.disc.x - ball.x, p.disc.y - ball.y) < CONTACT + 22) {
      const [bx, by] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
      p.input.x = p.input.x * 0.5 + bx * 0.5;
      p.input.y = p.input.y * 0.5 + by * 0.5;
    }
    this.pinch(p);
  }

  // Segundo presionador (Difícil, rival en su campo): cortar el pase corto más peligroso.
  press2(p) {
    const { ball } = this;
    const r = this.dangerous(p);
    if (!r) return this.cover(p);
    steer(p, ball.x + (r.disc.x - ball.x) * 0.45, ball.y + (r.disc.y - ball.y) * 0.45, 1);
    this.pinch(p);
  }

  pinch(p) {
    const { P } = this;
    const ball = this.m.ball;
    if (this.m.tick % 6 === 0) p.pinchRoll = Math.random() < P.pinch;
    p.input.kick = p.pinchRoll && edgeToBall(p, ball) <= C.KICK_DIST + 1 && safeKickDir(p, ball) && p.kickArmed;
  }

  // Cobertura: marcar por el lado de la portería al receptor peligroso o cortar su línea de pase;
  // si no hay a quién, tapar la línea de tiro.
  cover(p) {
    const { P, ball } = this;
    const a = this.attack;
    const ogx = -a * W;
    const r = this.dangerous(p);
    const ballFromGoal = Math.hypot(ball.x - ogx, ball.y);
    let tx, ty;
    if (r && Math.hypot(r.disc.x - ogx, r.disc.y) < ballFromGoal + 40) {
      const [gx, gy] = norm(ogx - r.disc.x, -r.disc.y);
      tx = r.disc.x + gx * 34;
      ty = r.disc.y + gy * 34;
      if (P.laneCut) {
        tx = tx * 0.5 + (ball.x + (r.disc.x - ball.x) * 0.65) * 0.5;
        ty = ty * 0.5 + (ball.y + (r.disc.y - ball.y) * 0.65) * 0.5;
      }
    } else {
      const [gx, gy, gl] = norm(ogx - ball.x, -ball.y);
      const k = Math.min(110, gl * 0.45);
      tx = ball.x + gx * k;
      ty = ball.y + gy * k;
    }
    if (P.shift) {
      ty = ty * 0.75 + ball.y * 0.25;
      if ((tx - ball.x) * a > 40) tx = ball.x + a * 40;
    }
    if (this.adapt.biasY) ty = ty * 0.8 + this.adapt.biasY * 0.2;
    [tx, ty] = clampField(tx, ty, 18);
    steer(p, tx, ty, P.pressSpeed);
    this.pinch(p);
  }

  // ---------------- portero ----------------
  // Punto que tapa el ángulo: sobre la bisectriz balón-postes a s = R / sen(α) del balón,
  // con la profundidad limitada a [minDepth, gkMaxAdvance] (algo retrasado, como se pidió).
  keeperSpot(ball, extra = 0) {
    const { P } = this;
    const a = this.attack;
    const ogx = -a * W;
    const [u1x, u1y] = norm(ogx - ball.x, -G - ball.y);
    const [u2x, u2y] = norm(ogx - ball.x, G - ball.y);
    const [ux, uy] = norm(u1x + u2x, u1y + u2y);
    const alpha = 0.5 * Math.acos(Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y)));
    const R = C.PLAYER_RADIUS + C.BALL_RADIUS + 4;
    let t = R / Math.max(0.05, Math.sin(alpha));
    const depthAt = (tt) => (ball.x + ux * tt - ogx) * a;
    const maxDepth = P.gkMaxAdvance + this.adapt.gkBonus + extra;
    const minDepth = 8;
    if (Math.abs(ux) > 0.05) {
      if (depthAt(t) > maxDepth) t = (ogx + a * maxDepth - ball.x) / ux;
      if (depthAt(t) < minDepth) t = (ogx + a * minDepth - ball.x) / ux;
    }
    t = Math.max(0, t);
    let kx = ball.x + ux * t, ky = ball.y + uy * t;
    // siempre dentro del rango de profundidad y delante de su portería
    const depth = Math.max(minDepth, Math.min(maxDepth, (kx - ogx) * a));
    kx = ogx + a * depth;
    ky = Math.max(-G - 10, Math.min(G + 10, ky));
    return { x: kx, y: ky, ux, uy, t, s: R / Math.max(0.05, Math.sin(alpha)) };
  }

  keep(p) {
    const { P, ball } = this;
    const a = this.attack;
    const ogx = -a * W;
    const real = this.m.ball;
    let K = this.keeperSpot(ball);
    // 1v1: rival con balón cerca y ningún defensa mejor colocado → achicar por la bisectriz
    if (this.owner && this.owner.team !== this.team) {
      const o = this.owner.disc;
      const dGoal = Math.hypot(o.x - ogx, o.y);
      const defBetter = this.players.some((q) => q !== p && !q.human && (q.disc.x - o.x) * a < 0 &&
        Math.abs(q.disc.y - o.y) < 50 && Math.hypot(q.disc.x - o.x, q.disc.y - o.y) < Math.hypot(p.disc.x - o.x, p.disc.y - o.y));
      if (dGoal < 170 && !defBetter && P.theta >= 0.3) {
        const t = Math.max(CONTACT + 10, K.s * 0.55);
        K = { x: ball.x + K.ux * t, y: ball.y + K.uy * t };
        // si se la deja larga y llego antes, ir al balón
        if (edgeToBall(this.owner, ball) > 8 && timeToReach(p, ball.x, ball.y) < timeToReach(this.owner, ball.x, ball.y)) {
          if (safeKickDir(p, real)) return clearNow(p, real);
          return steer(p, ball.x, ball.y, 1);
        }
      }
    }
    this.debugK = K;
    // volver a su sitio con prioridad (carrera directa) si está lejos
    const far = Math.hypot(p.disc.x - K.x, p.disc.y - K.y) > 50;
    steer(p, K.x, K.y, 1, far ? 6 : 14);
    this.pinch(p);
  }
}

function minBy(arr, f) {
  let best = null, bv = Infinity;
  for (const x of arr) {
    const v = f(x);
    if (v < bv) { bv = v; best = x; }
  }
  return best;
}

// Softmax sobre las `k` mejores opciones con utilidades relativas: con temperatura alta se elige
// a veces el 2.º o 3.er plan (error "humano" de decisión).
function softmaxTop(opts, T, k) {
  if (opts.length === 0) return { type: 'dribble', mode: 'push', tx: 0, ty: 0, u: 0 };
  const top = [...opts].sort((x, y) => y.u - x.u).slice(0, k);
  const max = Math.max(1e-6, top[0].u);
  if (T <= 0.001) return top[0];
  let sum = 0;
  const cum = top.map((o) => (sum += Math.exp((o.u / max - 1) / T)));
  const r = Math.random() * sum;
  return top[cum.findIndex((c) => c >= r)];
}
