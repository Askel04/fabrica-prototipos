// Cerebro de equipo (el mismo para todos los niveles; la dificultad son diales en CONFIG.AI_LEVELS).
// Máquina de 4 estados (estilo Steel Circus): tengo el balón / compañero lo tiene /
// rival lo tiene / suelto. Decisiones por utilidad = prob. de éxito × valor, elegidas con softmax.
// Posiciones: base de formación según el balón (RoboCup SBSP) + muestreo de puntos alrededor.
import { CONFIG as C } from '../config.js';
import {
  CONTACT, norm, edgeToBall, rand, clampField, steer, ballTo, approachAngle,
  safeKickDir, clearNow, intercept,
} from './skills.js';
import { threat, ballPath, passRace, shotChance, laneProb, reachTime, KICK_SPEED, PUSH_SPEED } from './evaluate.js';
import TRAINED from './weights.js';

const W = C.FIELD_W, H = C.FIELD_H, G = C.GOAL_HALF;
const ticks = (ms) => Math.max(1, Math.round((ms * C.TICK_HZ) / 1000));

// Pesos de las utilidades. Los valores entrenados salen del entrenamiento por autojuego (tools/train.mjs) y se guardan en weights.js.
export const DEFAULT_WEIGHTS = {
  shot: 1.6, // valor de un tiro (× prob. de gol)
  pass: 1.0, // valor de un pase (× prob. de que llegue × amenaza ganada)
  passBase: 0.25, // valor de mantener la posesión con un pase
  dribble: 0.9, // valor de conducir hacia un hueco
  hold: 0.25, // extra por conducir mientras no hay presión y no se ha agotado el tiempo de control
  align: 0.9, // penalización por tener que rodear el balón para ejecutar
  human: 0.15, // extra por jugar con el humano
  oneTwo: 1.3, // extra por devolver la pared
  open: 1.0, // desmarque: lejos de rivales
  reach: 1.2, // desmarque: que el pase me llegue
  threatPos: 1.4, // desmarque: zona peligrosa
  spacing: 0.8, // desmarque: no amontonarse
  home: 0.5, // desmarque: no alejarse de la posición base
};

export class TeamBrain {
  constructor(match, team, weights) {
    this.m = match;
    this.team = team;
    this.players = match.players.filter((p) => p.team === team);
    this.opps = match.players.filter((p) => p.team !== team);
    this.attack = this.players[0].attack;
    this.w = { ...DEFAULT_WEIGHTS, ...TRAINED, ...(weights || {}) };
    this.noise = { x: 0, y: 0, vx: 0, vy: 0 };
    this.reset();
  }

  reset() {
    this.keeper = null;
    this.lastPass = null;
    this.spots = new Map();
    for (const p of this.players) {
      p.job = null;
      p.act = null;
      p.run = null;
      p.carryStart = null;
      p.stall = 0;
    }
  }

  // un compañero recibió un pase (lo llama Match)
  onReceive(from, to) {
    this.lastPass = { from, to, tick: this.m.tick };
  }

  update(levelName) {
    const L = C.AI_LEVELS[levelName];
    this.L = L;
    if (this.m.tick % ticks(L.thinkMs) === 0 || !this.ball) this.think();
    for (const p of this.players) if (!p.human) this.act(p);
  }

  // ---------------- percepción ----------------
  perceive() {
    const L = this.L;
    const seen = this.m.seenBall(L.reactionMs);
    // ruido suave (cambia poco a poco, como una estimación imperfecta)
    const n = this.noise;
    n.x = n.x * 0.7 + rand(L.noise) * 0.3;
    n.y = n.y * 0.7 + rand(L.noise) * 0.3;
    n.vx = n.vx * 0.7 + rand(L.noise * 0.04) * 0.3;
    n.vy = n.vy * 0.7 + rand(L.noise * 0.04) * 0.3;
    this.ball = { x: seen.x + n.x, y: seen.y + n.y, vx: seen.vx + n.vx, vy: seen.vy + n.vy };
  }

  // ---------------- decisión (cada thinkMs) ----------------
  think() {
    this.perceive();
    const { L, ball, m } = this;
    const a = this.attack;
    const ais = this.players.filter((p) => !p.human);
    if (!this.keeper || !ais.includes(this.keeper)) this.keeper = minBy(ais, (p) => p.disc.x * a);

    // ¿quién tiene el balón?
    const owner = minBy(m.players, (p) => edgeToBall(p, ball));
    const ownerEdge = edgeToBall(owner, ball);
    const phase = ownerEdge > L.possessEdge ? 'loose' : owner.team === this.team ? 'attack' : 'defend';
    this.phase = phase;
    this.owner = phase === 'loose' ? null : owner;

    const jobs = new Map();
    const field = ais.filter((p) => p !== this.keeper);

    if (phase === 'attack') {
      if (!owner.human) jobs.set(owner, 'carry');
    } else if (phase === 'loose') {
      // va quien llega antes; el portero sale si gana (o empata) la carrera en su zona
      const tOpp = Math.min(...this.opps.map((o) => intercept(o, ball).t));
      let best = null, bestT = Infinity;
      for (const p of this.players) {
        const it = intercept(p, ball);
        let t = it.t;
        if (p === this.keeper) {
          const fromGoal = Math.hypot(it.x + a * W, it.y);
          const inZone = fromGoal < L.sweepRange && Math.abs(it.y) < G + 70;
          if (!inZone || t > tOpp + L.keeperDare) continue;
          t -= 2; // en su zona tiene preferencia
        }
        if (t < bestT) { bestT = t; best = p; }
      }
      if (best && !best.human) jobs.set(best, 'chase');
      this.winning = bestT <= tOpp;
    } else {
      // presiona el que llega antes al portador (si es el humano, las IA cubren)
      const first = minBy([...field, ...this.players.filter((p) => p.human)], (p) => reachTime(p, owner.disc.x, owner.disc.y));
      if (first && !first.human) jobs.set(first, 'press');
    }

    const keeperJob = phase === 'attack' && (ball.x + a * W) * a > L.anchorX + 80 ? 'anchor' : 'keep';
    for (const p of ais) {
      if (jobs.has(p)) continue;
      if (p === this.keeper) jobs.set(p, keeperJob);
      else if (phase === 'attack' || (phase === 'loose' && this.winning)) jobs.set(p, 'offer');
      else jobs.set(p, 'cover');
    }
    // dos "cover": el segundo tapa la línea de tiro
    let covers = 0;
    for (const p of field) if (jobs.get(p) === 'cover' && covers++ > 0) jobs.set(p, 'block');

    // el portero no se aleja de su zona persiguiendo el balón
    const kp = this.keeper;
    if (kp && (jobs.get(kp) === 'carry' || jobs.get(kp) === 'chase') &&
      Math.hypot(kp.disc.x + a * W, kp.disc.y) > L.sweepRange + 50) jobs.set(kp, 'keep');

    for (const p of ais) {
      const job = jobs.get(p);
      if (job !== 'carry' && job !== 'chase') { p.carryStart = null; p.act = null; }
      p.job = job;
      if (job === 'offer') p.spot = this.offerSpot(p);
    }
  }

  // ---------------- ejecución (cada tick) ----------------
  act(p) {
    const { ball } = this;
    p.input.kick = false;
    switch (p.job) {
      case 'carry': return this.carry(p);
      case 'chase': return this.chase(p);
      case 'offer':
        if (p.run && p.run.until > this.m.tick) return steer(p, p.run.x, p.run.y, 1);
        return steer(p, p.spot[0], p.spot[1], 1);
      case 'press': return this.press(p);
      case 'cover': return this.cover(p, false);
      case 'block': return this.cover(p, true);
      case 'anchor': return steer(p, -this.attack * W + this.attack * this.L.anchorX, ball.y * 0.25, 1);
      case 'keep': return this.keep(p);
      default: return steer(p, p.disc.x, p.disc.y, 0);
    }
  }

  // Ir a por el balón suelto. Si llega rápido, control orientado: correr en su misma
  // dirección para amortiguarlo en vez de chocar de frente y que rebote.
  chase(p) {
    const real = this.m.ball;
    const speed = Math.hypot(real.vx, real.vy);
    const dist = Math.hypot(real.x - p.disc.x, real.y - p.disc.y);
    if (edgeToBall(p, real) < 28 && speed < 2.2) return this.carry(p);
    if (speed > 2.2 && dist < 70) {
      const [ux, uy] = norm(real.vx, real.vy);
      const ahead = (p.disc.x - real.x) * ux + (p.disc.y - real.y) * uy; // >0: el balón viene hacia mí
      if (ahead > 0) {
        // ponerse en su trayectoria y retroceder con él
        return steer(p, real.x + ux * (CONTACT + 4), real.y + uy * (CONTACT + 4), 1, 8);
      }
      if (edgeToBall(p, real) < 28) return this.carry(p);
    }
    const it = intercept(p, this.ball);
    return steer(p, it.x - this.attack * CONTACT * 0.5, it.y, 1);
  }

  // ---------------- con balón ----------------
  // Con el balón en los pies la IA lo "siente": la ejecución usa el balón real.
  // El retardo y el ruido afectan a leer el juego y decidir, no al control del balón.
  carry(p) {
    const { L, m } = this;
    const ball = m.ball;
    const a = this.attack;
    if (p.carryStart === null) { p.carryStart = m.tick; p.act = null; }

    // atasco contra un rival o la pared: despejar
    p.stall = edgeToBall(p, ball) < 3 && Math.hypot(ball.vx, ball.vy) < 0.15 ? p.stall + 1 : 0;
    if (p.stall > 90) { p.stall = 0; p.act = { type: 'kick', tx: a * W, ty: rand(H), until: m.tick + 30, err: rand(0.6), kickAngle: 1.2 }; }

    // balón disputado: pelearlo; en campo propio despejar si es seguro
    const oppNear = Math.min(...this.opps.map((o) => Math.hypot(o.disc.x - ball.x, o.disc.y - ball.y)));
    const ownHalf = ball.x * a < 0;
    if (oppNear < CONTACT + L.contestDist && (!p.act || p.act.type === 'dribble')) {
      if (ownHalf && safeKickDir(p, ball) && approachAngle(p, ball, a * W, 0) > 0.6) return clearNow(p, ball);
      return ballTo(p, ball, a * W, ownHalf ? ball.y * 0.5 : 0, { mode: 'kick', aimErr: rand(L.aim), kickAngle: ownHalf ? 1.0 : 0.55 });
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
    const { L } = this;
    const ball = this.m.ball;
    if (act.type === 'clear') {
      if (safeKickDir(p, ball)) return clearNow(p, ball);
      return ballTo(p, ball, act.tx, act.ty, { mode: 'kick', aimErr: act.err, kickAngle: 1.0 });
    }
    if (act.type === 'fake') { p.input.x = act.dx; p.input.y = act.dy; return; }
    const pressured = Math.min(...this.opps.map((o) => Math.hypot(o.disc.x - ball.x, o.disc.y - ball.y))) < 70;
    const speed = act.type === 'dribble' && !pressured ? L.dribbleSpeed : 1;
    ballTo(p, ball, act.tx, act.ty, { mode: act.mode, aimErr: act.err, kickAngle: act.kickAngle ?? L.kickAngle, speed });
  }

  // Tras pasar: si el nivel lo permite, correr al espacio para pedir la pared.
  afterPass(p, act) {
    if (!this.L.oneTwo) return;
    const a = this.attack;
    const [x, y] = clampField(p.disc.x + a * 130, p.disc.y * 0.5 + (act.ty - p.disc.y) * -0.3, 35);
    p.run = { x, y, until: this.m.tick + ticks(1600) };
  }

  decide(p) {
    const { L, m, w } = this;
    const ball = m.ball;
    const a = this.attack;
    const tick = m.tick;
    const opps = this.opps;
    const opts = [];
    const err = () => rand(L.aim);
    // ¿le da tiempo a orientarse hacia el objetivo antes de que llegue el rival más cercano?
    const tOpp = Math.min(...opps.map((o) => reachTime(o, ball.x, ball.y, L.oppReact)));
    const align = (tx, ty) => {
      const setup = approachAngle(p, ball, tx, ty) * 22 * w.align;
      return 1 / (1 + Math.exp(-(tOpp - setup) / 6));
    };
    const fromOwnGoal = Math.hypot(ball.x + a * W, ball.y);
    const danger = fromOwnGoal < L.dangerDist || p === this.keeper;
    const requested = p.team === m.human?.team && tick - m.passRequestTick < 90;

    // tiros
    if (!danger) {
      for (const gy of [-G + 16, 0, G - 16]) {
        const gx = a * (W + 5);
        if (Math.hypot(gx - ball.x, gy - ball.y) > L.shootRange) continue;
        const s = shotChance(ballPath(ball.x, ball.y, gx, gy, KICK_SPEED), opps, a);
        opts.push({ u: w.shot * s * align(gx, gy), type: 'shot', mode: 'kick', tx: gx, ty: gy, kickAngle: L.shotAngle });
      }
    }

    // pases
    for (const mt of this.players) {
      if (mt === p) continue;
      const lead = mt.human ? 6 : 10;
      const targets = [[mt.disc.x + mt.disc.vx * lead, mt.disc.y + mt.disc.vy * lead, 'feet']];
      if (L.through) targets.push([mt.disc.x + a * 70 + mt.disc.vx * 15, mt.disc.y + mt.disc.vy * 15, 'through']);
      if (L.wallPass) {
        const wy = mt.disc.y > ball.y ? H : -H;
        targets.push([mt.disc.x, 2 * wy - mt.disc.y, 'wall']);
      }
      for (let [tx, ty, kind] of targets) {
        if (kind !== 'wall') [tx, ty] = clampField(tx, ty, 18);
        const d = Math.hypot(tx - ball.x, ty - ball.y);
        if (d < 50) continue;
        const mode = d > L.softPass * (kind === 'feet' ? 1 : 1.4) || kind === 'wall' ? 'kick' : 'push';
        const race = passRace(ballPath(ball.x, ball.y, tx, ty, mode === 'kick' ? KICK_SPEED : PUSH_SPEED), mt, opps, L.oppReact);
        const gain = threat(race.x, race.y, a);
        let u = w.pass * race.p * (w.passBase + gain) * align(tx, ty);
        if (mt.human) u += w.human * race.p;
        // pase pedido: al pie si está parado, al espacio solo si ya corre hacia delante
        const running = mt.disc.vx * a > 0.8;
        if (mt.human && requested && (kind === 'feet' || (kind === 'through' && running))) u += L.requestBonus * race.p;
        // pared: devolver al que me la dio si se ha desmarcado corriendo al espacio
        if (L.oneTwo && this.lastPass?.from === mt && this.lastPass.to === p && tick - this.lastPass.tick < 120) u += w.oneTwo * race.p;
        if (mt.run && mt.run.until > tick) u += w.oneTwo * 0.5 * race.p;
        // atrás al portero solo como dejada bajo presión (y solo en niveles que la usan)
        if (mt === this.keeper && !danger) u *= L.drop && tOpp < 25 ? 0.8 : 0.25;
        opts.push({ u, type: 'pass', mode, tx, ty, kind, to: mt });
      }
    }

    if (danger) {
      // despeje hacia la banda y hacia delante
      const side = ball.y >= 0 ? 1 : -1;
      opts.push({ u: 0.35, type: 'clear', mode: 'kick', tx: ball.x + a * 220, ty: side * H });
    } else {
      // conducir hacia un hueco (o proteger el balón alejándolo del rival)
      const held = tick - p.carryStart;
      const pressure = Math.min(...opps.map((o) => Math.hypot(o.disc.x - ball.x, o.disc.y - ball.y)));
      const calm = held < L.holdTicks && pressure > 80; // nadie encima: puede controlar un rato
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const qx = ball.x + Math.cos(ang) * 70, qy = ball.y + Math.sin(ang) * 70;
        if (Math.abs(qy) > H - 15 || Math.abs(qx) > W - 12) continue;
        const near = Math.min(...opps.map((o) => Math.hypot(o.disc.x - qx, o.disc.y - qy)));
        const safety = Math.max(0, Math.min(1, (near - 30) / 70));
        let u = w.dribble * threat(qx, qy, a) * safety * align(qx, qy);
        if (calm) u += w.hold * safety;
        opts.push({ u, type: 'dribble', mode: 'push', tx: ball.x + Math.cos(ang) * 120, ty: ball.y + Math.sin(ang) * 120 });
      }
      // amago: frenada o cambio de dirección seco con un rival encima
      if (L.fakes && Math.random() < 0.15) {
        const o = minBy(opps, (q) => Math.hypot(q.disc.x - ball.x, q.disc.y - ball.y));
        if (Math.hypot(o.disc.x - ball.x, o.disc.y - ball.y) < 60) {
          const [ox, oy] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
          const s = Math.random() < 0.5 ? 1 : -1;
          opts.push({ u: 0.3, type: 'fake', dx: -oy * s * 0.7, dy: ox * s * 0.7, until: tick + 12 + Math.floor(Math.random() * 12) });
        }
      }
    }

    const pick = softmax(opts, L.temperature);
    return {
      ...pick, err: err(), start: tick,
      until: pick.until ?? tick + (pick.type === 'dribble' ? L.decideTicks : 30),
    };
  }

  // ---------------- sin balón, atacando ----------------
  // Posición base según el balón (formación) y muestreo de puntos alrededor.
  offerSpot(p) {
    const { ball, w } = this;
    const a = this.attack;
    const others = this.players.filter((q) => q !== p && q !== this.keeper && !(q.job === 'carry' || q === this.owner));
    // corto: el más retrasado de los dos que se ofrecen; profundo: el más adelantado
    const deep = others.length === 0 || others.every((q) => q.disc.x * a <= p.disc.x * a);
    const side = ball.y > 0 ? -1 : 1;
    const home = deep
      ? clampField(ball.x + a * 170, side * 80, 30)
      : clampField(ball.x - a * 50, ball.y + side * 100, 30);
    const mates = this.players.filter((q) => q !== p);
    let best = null;
    for (let dx = -90; dx <= 90; dx += 45) {
      for (let dy = -90; dy <= 90; dy += 45) {
        const [x, y] = clampField(home[0] + dx, home[1] + dy, 25);
        const open = Math.min(1, Math.min(...this.opps.map((o) => Math.hypot(o.disc.x - x, o.disc.y - y))) / 100);
        const crowd = mates.reduce((s, q) => s + Math.max(0, 1 - Math.hypot(q.disc.x - x, q.disc.y - y) / 110), 0);
        const s = w.open * open + w.reach * laneProb(ball.x, ball.y, x, y, this.opps) +
          w.threatPos * threat(x, y, a) - w.spacing * crowd - (w.home * Math.hypot(x - home[0], y - home[1])) / 100;
        if (!best || s > best.s) best = { x, y, s };
      }
    }
    const prev = this.spots.get(p);
    if (prev && Math.hypot(prev.x - best.x, prev.y - best.y) < 50) return [prev.x, prev.y];
    this.spots.set(p, best);
    return [best.x, best.y];
  }

  // ---------------- defendiendo ----------------
  // rival más peligroso sin balón: amenaza de su zona × que le pueda llegar el pase
  // (el que pregunta no cuenta como bloqueo: si no, al tapar una línea dejaría de vigilarla)
  dangerous(exclude, self = null) {
    const { ball } = this;
    const blockers = this.players.filter((q) => q !== self);
    let best = null, bv = -1;
    for (const o of this.opps) {
      if (o === exclude) continue;
      const v = threat(o.disc.x, o.disc.y, -this.attack) * (0.3 + laneProb(ball.x, ball.y, o.disc.x, o.disc.y, blockers));
      if (v > bv) { bv = v; best = o; }
    }
    return best;
  }

  press(p) {
    const { L, ball } = this;
    const ogx = -this.attack * W;
    // por el lado de su portería, desviado hacia la línea de pase más peligrosa
    let [gx, gy] = norm(ogx - ball.x, -ball.y * 0.5);
    const r = this.dangerous(this.owner, p);
    // solo se tapa el pase hacia delante (un receptor por detrás del portador no es peligro)
    if (r && L.shade > 0 && (r.disc.x - ball.x) * this.attack < 0) {
      const [rx, ry] = norm(r.disc.x - ball.x, r.disc.y - ball.y);
      [gx, gy] = norm(gx * (1 - L.shade) + rx * L.shade, gy * (1 - L.shade) + ry * L.shade);
    }
    // si el portador controla el balón, esperar a cierta distancia tapando el pase;
    // si se le separa el balón (mal control, giro), ir a robar
    const controlled = this.owner && edgeToBall(this.owner, ball) < 6;
    const close = controlled ? L.standOff : L.bodyBlock ? CONTACT - 2 : CONTACT + 4;
    steer(p, ball.x + gx * close, ball.y + gy * close, L.pressSpeed);
    if (L.bodyBlock && !controlled && Math.hypot(p.disc.x - ball.x, p.disc.y - ball.y) < CONTACT + 22) {
      const [bx, by] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
      p.input.x = p.input.x * 0.5 + bx * 0.5;
      p.input.y = p.input.y * 0.5 + by * 0.5;
    }
    this.pinch(p);
  }

  // pinchazo: chutar en cuanto el balón está a tiro, si no sale hacia la propia portería
  pinch(p) {
    const { L } = this;
    const ball = this.m.ball;
    if (this.m.tick % 6 === 0) p.pinchRoll = Math.random() < L.pinch;
    p.input.kick = p.pinchRoll && edgeToBall(p, ball) <= C.KICK_DIST + 1 && safeKickDir(p, ball) && p.kickArmed;
  }

  cover(p, block) {
    const { L, ball } = this;
    const a = this.attack;
    const ogx = -a * W;
    const ballFromGoal = Math.hypot(ball.x - ogx, ball.y);
    const r = block ? null : this.dangerous(this.owner, p);
    let tx, ty;
    if (r && Math.hypot(r.disc.x - ogx, r.disc.y) < ballFromGoal + 40) {
      // marcar por el lado de la portería; en niveles altos, cortando la línea de pase
      const [gx, gy] = norm(ogx - r.disc.x, -r.disc.y);
      tx = r.disc.x + gx * 34;
      ty = r.disc.y + gy * 34;
      if (L.laneCut) {
        tx = tx * 0.5 + (ball.x + (r.disc.x - ball.x) * 0.65) * 0.5;
        ty = ty * 0.5 + (ball.y + (r.disc.y - ball.y) * 0.65) * 0.5;
      }
    } else {
      // tapar la línea de tiro entre balón y portería
      const [gx, gy, gl] = norm(ogx - ball.x, -ball.y);
      const k = Math.min(110, gl * 0.45);
      tx = ball.x + gx * k;
      ty = ball.y + gy * k;
    }
    if (L.shift) {
      ty = ty * 0.75 + ball.y * 0.25;
      if ((tx - ball.x) * a > 40) tx = ball.x + a * 40;
    }
    [tx, ty] = clampField(tx, ty, 18);
    steer(p, tx, ty, L.coverSpeed);
    this.pinch(p);
  }

  // Portero: en la bisectriz balón-portería, saliendo más cuanto más lejos está el balón (achica);
  // si el portador entra en su zona y llega antes, sale a por el balón.
  keep(p) {
    const { L, ball } = this;
    const a = this.attack;
    const ogx = -a * W;
    const [nx, ny, l] = norm(ball.x - ogx, ball.y);
    const out = Math.max(12, Math.min(L.keeperMaxOut, l * L.keeperOut));
    const tx = ogx + nx * out;
    const ty = Math.max(-G - 8, Math.min(G + 8, ny * out));
    if (this.owner && l < L.keeperRush) {
      const mine = reachTime(p, ball.x, ball.y, 0);
      const theirs = reachTime(this.owner, ball.x, ball.y, 0);
      if (mine <= theirs + 6) {
        if (safeKickDir(p, this.m.ball)) return clearNow(p, this.m.ball);
        return steer(p, ball.x, ball.y, 1);
      }
    }
    steer(p, tx, ty, 1);
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

// elige una opción con probabilidad ∝ exp(u / T): T alta = decisiones más "humanas"
function softmax(opts, T) {
  if (opts.length === 0) return { type: 'dribble', mode: 'push', tx: 0, ty: 0, u: 0 };
  const max = Math.max(...opts.map((o) => o.u));
  if (T <= 0.001) return opts.find((o) => o.u === max);
  let sum = 0;
  const ws = opts.map((o) => (sum += Math.exp((o.u - max) / T)));
  const r = Math.random() * sum;
  return opts[ws.findIndex((c) => c >= r)];
}
