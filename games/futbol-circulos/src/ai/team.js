// IA de equipo para Normal y Difícil: posesión, portador que conduce/pasa/tira,
// desmarques a huecos, presión que tapa el pase, marcaje y portero que sale.
// Difícil añade: anchor/pivote/extremo, paredes 1-2, pases a la banda, amagos,
// dejadas al anchor, bloqueo con el cuerpo, pinchazos y basculación.
import { CONFIG as C } from '../config.js';
import {
  CONTACT, norm, edgeToBall, rand, laneClearance, nearestDist,
  clampField, steer, intercept, ballTo, approachAngle, safeKickDir, clearNow,
} from './tactics.js';

const W = C.FIELD_W, H = C.FIELD_H;

export class TeamBrain {
  constructor(team, players) {
    this.team = team;
    this.players = players;
    this.attack = players[0].attack;
    this.reset();
  }

  setLevel(name) {
    this.L = C.AI_LEVELS[name];
  }

  reset() {
    this.keeper = null;
    this.spots = new Map(); // hueco elegido por cada jugador
    this.runs = new Map(); // desmarque tras pase (pared)
    for (const p of this.players) {
      p.act = null;
      p.carryStart = null;
      p.stall = 0;
    }
  }

  think(ctx) {
    this.ctx = ctx;
    const { ball, players, tick } = ctx;
    const mates = this.players;
    this.opps = players.filter((p) => p.team !== this.team);
    const ais = mates.filter((p) => !p.human);
    this.pickKeeper(ais);

    // posesión
    const nearMate = minBy(mates, (p) => edgeToBall(p, ball));
    const nearOpp = minBy(this.opps, (p) => edgeToBall(p, ball));
    const mE = edgeToBall(nearMate, ball), oE = edgeToBall(nearOpp, ball);
    let phase = 'loose';
    if (mE < this.L.possessEdge && mE <= oE) phase = 'attack';
    else if (oE < this.L.possessEdge) phase = 'defend';
    const ours = phase === 'attack' || (phase === 'loose' && ctx.lastTouch?.team === this.team);

    const jobs = new Map();
    if (phase === 'attack') {
      if (!nearMate.human) jobs.set(nearMate, 'carry');
    } else if (phase === 'loose') {
      const chaser = this.pickChaser(ais);
      if (chaser) jobs.set(chaser, 'chase');
    } else {
      const field = ais.filter((p) => p !== this.keeper);
      const human = mates.find((p) => p.human);
      const presser = minBy(field, (p) => dist(p.disc, nearOpp.disc));
      const humanPresses = human && dist(human.disc, nearOpp.disc) < Math.min(60, dist(presser?.disc ?? human.disc, nearOpp.disc));
      if (presser && !humanPresses) jobs.set(presser, 'press');
      this.oppCarrier = nearOpp;
    }

    for (const p of mates) {
      if (p.human) continue;
      if (jobs.get(p) !== 'carry') p.carryStart = null;
      const job = jobs.get(p) || (p === this.keeper ? 'keep' : ours ? 'support' : 'cover');
      p.job = job;
      this[job](p, phase);
    }
    for (const [p, run] of this.runs) if (run.until < tick) this.runs.delete(p);
  }

  // portero/anchor: la IA más retrasada; se revisa de vez en cuando
  pickKeeper(ais) {
    const depth = (p) => p.disc.x * this.attack;
    const deepest = minBy(ais, depth);
    if (!this.keeper || !ais.includes(this.keeper)) this.keeper = deepest;
    else if (this.keeper.job !== 'chase' && this.keeper.job !== 'carry' && depth(this.keeper) - depth(deepest) > 120) this.keeper = deepest;
  }

  // quién va a por un balón suelto: el que llega antes (el portero solo cerca de su área)
  pickChaser(ais) {
    const { ball } = this.ctx;
    const oppBest = Math.min(...this.opps.map((o) => intercept(o, ball).t));
    let best = null, bestT = Infinity;
    for (const p of ais) {
      const it = intercept(p, ball);
      if (p === this.keeper) {
        // el portero solo sale por delante de su portería y si llega antes que nadie
        const fromGoal = Math.hypot(it.x + this.attack * W, it.y);
        const inFront = Math.abs(it.y) < C.GOAL_HALF + 60;
        if (fromGoal > this.L.sweepRange || !inFront || it.t > oppBest - 4) continue;
      }
      if (it.t < bestT) {
        bestT = it.t;
        best = p;
      }
    }
    const human = this.players.find((p) => p.human);
    if (human && best && intercept(human, ball).t < bestT - 10) return null; // va el humano
    return best;
  }

  chase(p) {
    const { ball } = this.ctx;
    if (edgeToBall(p, ball) < 25) return this.carry(p);
    const it = intercept(p, ball);
    // llegar ligeramente por detrás del balón respecto a la portería rival
    steer(p, it.x - this.attack * CONTACT * 0.6, it.y, 1);
    p.input.kick = false;
  }

  // ---------- con balón ----------
  carry(p) {
    const { ball, tick } = this.ctx;
    const L = this.L;
    if (p.carryStart === null) {
      p.carryStart = tick;
      p.act = null;
    }
    // atasco contra otro jugador o la pared: despejar
    p.stall = edgeToBall(p, ball) < 3 && Math.hypot(ball.vx, ball.vy) < 0.15 ? p.stall + 1 : 0;
    if (p.stall > L.stallThinks) {
      p.stall = 0;
      p.act = { type: 'kick', tx: this.attack * W, ty: rand(H), until: tick + 20, err: rand(0.6) };
    }
    // balón disputado: no rodearlo, pelearlo y sacarlo hacia delante en cuanto se pueda
    const fromOwnGoal = Math.hypot(ball.x + this.attack * W, ball.y);
    const contested = nearestDist(ball.x, ball.y, this.opps) < CONTACT + L.contestDist;
    const ownHalf = ball.x * this.attack < 0;
    if (((contested && ownHalf) || fromOwnGoal < L.dangerDist) && safeKickDir(p, ball) &&
      approachAngle(p, ball, this.attack * W, 0) > 0.6) {
      p.act = null;
      return clearNow(p, ball);
    }
    if (contested) {
      p.act = null;
      const ty = ownHalf ? ball.y * 0.5 : this.bestShot(p, ball).y;
      return ballTo(p, ball, this.attack * W, ty, { mode: 'kick', aimErr: rand(L.aim), kickAngle: ownHalf ? 1.0 : 0.55 });
    }
    if (p.lastKick && tick - p.lastKick < 4 && p.act && p.act.type !== 'dribble') p.act = null; // ya chutó
    if (!p.act || tick > p.act.until) p.act = this.decide(p);
    const act = p.act;
    if (act.type === 'fake') {
      // amago: frenada o cambio de dirección seco
      p.input.x = act.dx;
      p.input.y = act.dy;
      p.input.kick = false;
      return;
    }
    if (act.type === 'pass' || act.type === 'kick') {
      // a puerta hace falta ir bien alineado; los pases toleran más
      const kickAngle = act.type === 'kick' ? L.shotAngle : L.kickAngle;
      ballTo(p, ball, act.tx, act.ty, { mode: act.mode || 'kick', aimErr: act.err, kickAngle });
      return;
    }
    ballTo(p, ball, act.tx, act.ty, { mode: 'push', aimErr: 0, kickAngle: 0.5, speed: act.speed || 1 });
  }

  decide(p) {
    const { ball, tick } = this.ctx;
    const L = this.L, a = this.attack;
    const opps = this.opps;
    const held = tick - p.carryStart;
    const pressure = nearestDist(ball.x, ball.y, opps);
    const err = rand(L.aim) * (Math.random() < L.mistake ? 4 : 1);

    // 0) zona de peligro o portero con balón: pase seguro o despeje hacia fuera, sin conducir
    const fromOwnGoal = Math.hypot(ball.x + a * W, ball.y);
    if (p === this.keeper || fromOwnGoal < L.dangerDist) {
      const pass = this.bestPass(p, ball);
      if (pass && pass.to !== this.keeper && pass.score > 0) {
        return { type: 'pass', tx: pass.x, ty: pass.y, until: tick + 40, err, mode: 'kick' };
      }
      const side = ball.y >= 0 ? 1 : -1;
      return { type: 'kick', tx: ball.x + a * 200, ty: side * H, until: tick + 40, err };
    }

    // 1) tiro
    // a tiro: si está de cara, chuta; si no, se coloca para chutar (salvo que haya un pase mejor)
    const shot = this.bestShot(p, ball);
    const canShoot = shot && (shot.dist < L.shootRange * 0.6 ||
      (shot.dist < L.shootRange && shot.open > L.shotLaneMargin));
    if (canShoot && (shot.ang < 1.1 || !this.bestPass(p, ball))) {
      return { type: 'kick', tx: shot.x, ty: shot.y, until: tick + 60, err };
    }

    // 2) amago si hay un defensor encima
    if (L.fakeChance && pressure < 55 && Math.random() < L.fakeChance) {
      const [ox, oy] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
      const side = Math.random() < 0.5 ? 1 : -1;
      const stop = Math.random() < 0.4;
      return {
        type: 'fake', dx: stop ? 0 : -oy * side, dy: stop ? 0 : ox * side,
        until: tick + 10 + Math.floor(Math.random() * 14),
      };
    }

    // 3) pase
    const pass = this.bestPass(p, ball);
    const pressured = pressure < L.pressureDist;
    const wantPass = pass && (
      (held > L.holdTicks && (pressured || pass.score > L.passScoreMin)) ||
      held > L.maxHoldTicks ||
      (pressured && pass.score > L.passScoreMin * 0.5)
    );
    if (wantPass) {
      if (L.giveAndGo) {
        // pared: el pasador sale al espacio y espera la devolución
        const [rx, ry] = clampField(ball.x + a * 140, ball.y * 0.4, 40);
        this.runs.set(p, { x: rx, y: ry, until: tick + 90, from: pass.to });
        pass.to.giveGoTo = p;
        pass.to.giveGoUntil = tick + 120;
      }
      p.carryStart = null;
      return {
        type: 'pass', tx: pass.x, ty: pass.y, until: tick + 60, err,
        mode: pass.dist > L.softPassDist ? 'kick' : 'push',
      };
    }

    // 4) dejada atrás al anchor si delante está todo tapado
    if (L.drop && pressured && this.keeper && this.keeper !== p) {
      const k = this.keeper.disc;
      if (laneClearance(ball.x, ball.y, k.x, k.y, opps) > L.passLaneMargin) {
        return { type: 'pass', tx: k.x, ty: k.y, until: tick + 40, err, mode: 'kick' };
      }
    }

    // 5) conducir hacia el espacio
    this.current = p;
    const [tx, ty] = this.dribbleTarget(ball);
    return { type: 'dribble', tx, ty, until: tick + L.decideTicks, speed: pressured ? 1 : L.dribbleSpeed };
  }

  bestShot(p, ball) {
    const gx = this.attack * W;
    let best = null;
    for (const gy of [-C.GOAL_HALF + 18, 0, C.GOAL_HALF - 18]) {
      const open = laneClearance(ball.x, ball.y, gx, gy, this.opps);
      const ang = approachAngle(p, ball, gx, gy);
      const s = Math.min(open, 40) - ang * 20;
      if (!best || s > best.s) best = { x: gx, y: gy, open, ang, s, dist: Math.hypot(gx - ball.x, gy - ball.y) };
    }
    return best;
  }

  bestPass(p, ball) {
    const L = this.L, a = this.attack;
    let best = null;
    for (const m of this.players) {
      if (m === p) continue;
      const lead = m.human ? 6 : 14;
      const [x, y] = clampField(m.disc.x + m.disc.vx * lead, m.disc.y + m.disc.vy * lead, 20);
      const d = Math.hypot(x - ball.x, y - ball.y);
      if (d < 60) continue;
      let score = (x - ball.x) * a * L.wForward + Math.min(nearestDist(x, y, this.opps), 120) * 0.8 - d * 0.1;
      if (m.human) score += L.humanBonus;
      if (p.giveGoTo === m && this.ctx.tick < p.giveGoUntil) score += L.oneTwoBonus;
      if (m === this.keeper) score -= 25; // al portero solo si no hay nada mejor
      score -= approachAngle(p, ball, x, y) * L.alignCost; // mejor lo que ya está de cara
      const open = laneClearance(ball.x, ball.y, x, y, this.opps);
      if (open > L.passLaneMargin) {
        if (!best || score > best.score) best = { to: m, x, y, dist: d, score };
      } else if (L.wallPasses) {
        // pase a la banda: rebote en la línea lateral más cercana al receptor
        const wy = y > 0 ? H : -H;
        const my = 2 * wy - y; // receptor reflejado
        const t = (wy - ball.y) / (my - ball.y || 1);
        const bx = ball.x + (x - ball.x) * t;
        if (t > 0 && t < 1 && Math.abs(bx) < W - 30 &&
          laneClearance(ball.x, ball.y, bx, wy, this.opps) > L.passLaneMargin &&
          laneClearance(bx, wy, x, y, this.opps) > L.passLaneMargin) {
          score -= 15;
          if (!best || score > best.score) best = { to: m, x, y: my, dist: d * 1.2, score, wall: true };
        }
      }
    }
    return best;
  }

  dribbleTarget(ball) {
    const a = this.attack;
    let best = null;
    for (let deg = -90; deg <= 90; deg += 30) {
      const ang = (a > 0 ? 0 : Math.PI) + (deg * Math.PI) / 180;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const qx = ball.x + dx * 90, qy = ball.y + dy * 90;
      if (Math.abs(qy) > H - 15 || Math.abs(qx) > W - 10) continue;
      const score = dx * a * (ball.x * a > 0 ? 70 : 40) + Math.min(nearestDist(qx, qy, this.opps), 120) * 0.6 + rand(8) -
        approachAngle(this.current, ball, qx, qy) * 25;
      if (!best || score > best.score) best = { x: qx, y: qy, score };
    }
    return best ? [best.x, best.y] : [a * W, 0];
  }

  // ---------- sin balón, atacando ----------
  support(p) {
    const { ball, tick } = this.ctx;
    p.input.kick = false;
    const run = this.runs.get(p);
    if (run && run.until >= tick) return steer(p, run.x, run.y, 1);
    const [x, y] = this.openSpot(p, ball);
    steer(p, x, y, 1);
    this.opportunisticKick(p);
  }

  // hueco con línea de pase limpia, separado de compañeros y rivales
  openSpot(p, ball) {
    const a = this.attack;
    let best = null;
    for (let dx = -60; dx <= 240; dx += 60) {
      for (let y = -H + 40; y <= H - 40; y += 55) {
        const [x] = clampField(ball.x + a * dx, 0, 30);
        const s = this.spotScore(p, ball, x, y);
        if (!best || s > best.s) best = { x, y, s };
      }
    }
    // histéresis: no cambiar de hueco por poco
    const prev = this.spots.get(p);
    if (prev && this.spotScore(p, ball, prev.x, prev.y) + 15 >= best.s) return [prev.x, prev.y];
    this.spots.set(p, best);
    return [best.x, best.y];
  }

  spotScore(p, ball, x, y) {
    const a = this.attack;
    const role = this.roleOf(p);
    let s = Math.min(nearestDist(x, y, this.opps), 110);
    if (laneClearance(ball.x, ball.y, x, y, this.opps) > this.L.passLaneMargin) s += 60;
    s += x * a * 0.15;
    s -= Math.abs(Math.hypot(x - ball.x, y - ball.y) - 150) * 0.2;
    for (const m of this.players) if (m !== p && Math.hypot(m.disc.x - x, m.disc.y - y) < 90) s -= 50;
    if (role === 'pivot' && x * a > 120 && Math.abs(y) < 110) s += 30;
    if (role === 'winger' && Math.abs(y) > 90) s += 30;
    return s;
  }

  // Difícil: pivote = el más adelantado de campo, extremo = el otro
  roleOf(p) {
    if (!this.L.roles || p === this.keeper) return null;
    const field = this.players.filter((m) => m !== this.keeper);
    const front = minBy(field, (m) => -m.disc.x * this.attack);
    return p === front ? 'pivot' : 'winger';
  }

  // ---------- defendiendo ----------
  press(p) {
    const { ball } = this.ctx;
    const L = this.L, a = this.attack;
    const ogx = -a * W;
    const carrier = this.oppCarrier;
    // receptor más peligroso del rival
    let recv = null, bestS = -Infinity;
    for (const o of this.opps) {
      if (o === carrier) continue;
      const s = laneClearance(ball.x, ball.y, o.disc.x, o.disc.y, this.players) - Math.abs(o.disc.x - ogx) * 0.2;
      if (s > bestS) {
        bestS = s;
        recv = o;
      }
    }
    // colocarse pegado al balón, entre él y la portería, desviado hacia la línea de pase
    let [gx, gy] = norm(ogx - ball.x, -ball.y * 0.5);
    if (recv) {
      const [rx, ry] = norm(recv.disc.x - ball.x, recv.disc.y - ball.y);
      [gx, gy] = norm(gx * (1 - L.shadow) + rx * L.shadow, gy * (1 - L.shadow) + ry * L.shadow);
    }
    const close = L.bodyBlock ? CONTACT - 2 : CONTACT + 8;
    steer(p, ball.x + gx * close, ball.y + gy * close, 1);
    if (L.bodyBlock && dist(p.disc, ball) < CONTACT + 20) {
      // empuja hacia el balón para cerrarle el giro al portador
      const [bx, by] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
      p.input.x = p.input.x * 0.5 + bx * 0.5;
      p.input.y = p.input.y * 0.5 + by * 0.5;
    }
    this.pinch(p);
  }

  // pinchazo: chute en cuanto el balón está a tiro y no sale hacia la propia portería
  pinch(p) {
    const { ball } = this.ctx;
    const edge = edgeToBall(p, ball);
    p.input.kick = edge <= C.KICK_DIST + 1 && safeKickDir(p, ball) && Math.random() < this.L.pinch && p.kickArmed;
  }

  cover(p) {
    const { ball } = this.ctx;
    const L = this.L, a = this.attack;
    const ogx = -a * W;
    const carrier = this.oppCarrier && edgeToBall(this.oppCarrier, ball) < 20 ? this.oppCarrier : null;
    const marked = new Set(this.players.filter((m) => m.markTarget && m !== p).map((m) => m.markTarget));
    // rival más peligroso sin marcar (más cerca de nuestra portería)
    // solo cuentan los rivales que amenazan (no más lejos de nuestra portería que el balón)
    const ballFromGoal = Math.hypot(ball.x - ogx, ball.y);
    const target = minBy(
      this.opps.filter((o) => o !== carrier && !marked.has(o) &&
        Math.hypot(o.disc.x - ogx, o.disc.y) < ballFromGoal + 60),
      (o) => Math.hypot(o.disc.x - ogx, o.disc.y)
    );
    p.markTarget = target;
    let tx, ty;
    if (target) {
      const o = target.disc;
      const [gx, gy] = norm(ogx - o.x, -o.y);
      tx = o.x + gx * 38;
      ty = o.y + gy * 38;
      if (L.laneCut) {
        // cortar la línea de pase balón→rival, sin perder el lado de portería
        tx = tx * 0.5 + (ball.x + (o.x - ball.x) * 0.65) * 0.5;
        ty = ty * 0.5 + (ball.y + (o.y - ball.y) * 0.65) * 0.5;
      }
    } else {
      // nadie a quien marcar: tapar la línea de tiro entre balón y portería
      const [gx, gy, gl] = norm(ogx - ball.x, -ball.y);
      const k = Math.min(110, gl * 0.45);
      tx = ball.x + gx * k;
      ty = ball.y + gy * k;
    }
    if (L.shift) {
      // basculación: el bloque se desplaza hacia el lado del balón y no se estira
      ty = ty * 0.7 + ball.y * 0.3;
      if ((tx - ball.x) * a > 40) tx = ball.x + a * 40;
    }
    [tx, ty] = clampField(tx, ty, 18);
    steer(p, tx, ty, 1);
    this.pinch(p);
  }

  keep(p, phase) {
    const { ball } = this.ctx;
    const L = this.L, a = this.attack;
    const ogx = -a * W;
    if (phase === 'attack' && (ball.x - ogx) * a > L.anchorX + 80) {
      // anchor: ofrece el pase de seguridad (solo si el balón ya está por delante)
      steer(p, ogx + a * L.anchorX, ball.y * 0.25, 1);
      p.input.kick = false;
      return;
    }
    const [nx, ny, l] = norm(ball.x - ogx, ball.y);
    const k = Math.min(L.keeperDist, l * 0.5);
    let ty = ny * k;
    ty = Math.max(-C.GOAL_HALF - 10, Math.min(C.GOAL_HALF + 10, ty));
    steer(p, ogx + nx * k, ty, 1);
    this.pinch(p);
  }

  opportunisticKick(p) {
    const { ball } = this.ctx;
    const [bx] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
    p.input.kick = edgeToBall(p, ball) <= C.KICK_DIST + 1 && bx * this.attack > 0.4 && p.kickArmed;
  }
}

function minBy(arr, f) {
  let best = null, bv = Infinity;
  for (const x of arr) {
    const v = f(x);
    if (v < bv) {
      bv = v;
      best = x;
    }
  }
  return best;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

