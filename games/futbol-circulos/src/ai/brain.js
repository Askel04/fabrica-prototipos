// Cerebro de equipo por capas (informe "IA de CPU en juegos deportivos"):
//   percepción con retardo → estado de equipo (posesión / sin posesión / suelto, con histéresis)
//   → rotación 1.º/2.º/3.º sin portero (como Rocket League 3v3) → steering.
// Un solo cerebro para todos los niveles; la dificultad es un vector de parámetros interpolado por θ
// (src/ai/params.js). Mismas físicas para todos: los niveles altos deciden mejor, no corren más.
import { CONFIG as C } from '../config.js';
import {
  CONTACT, norm, edgeToBall, gauss, rand, clampField, steer, approachAngle,
  safeKickDir, clearNow,
} from './skills.js';
import {
  trajectory, shotPath, intercept, passSafety, bestShot, threat, laneProb, timeToReach,
  KICK_SPEED, PUSH_SPEED,
} from './evaluate.js';
import { levelParams } from './params.js';
import { perceive } from './perception.js';
import { assignSpots, passSafetyTo } from './support.js';
import TRAINED from './weights.js';
import { fieldScale } from '../stadium.js';
import { syncEvaluate } from './evaluate.js';
import { syncSupport } from './support.js';
import { slotPoint, assignSlots, DEFENDERS } from './formation.js';
import { makeMotor, estimateKick } from './motor.js';

// medidas del campo actual (cambian con el estadio; Match llama a syncField al crear el partido)
let W = C.FIELD_W, H = C.FIELD_H, G = C.GOAL_HALF;
export function syncField() {
  W = C.FIELD_W; H = C.FIELD_H; G = C.GOAL_HALF;
  syncEvaluate();
  syncSupport();
}
const SEPARATE = new Set(['support', 'support3', 'zone', 'shadow', 'press2', 'cover', 'short']);
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
  // pautas de decisión (fase 2; el autojuego de la fase 3 ajusta cuánto pesan)
  quick: 0.6, // suelta rápido si te presionan: extra a los pases seguros según la presión
  firstTime: 0.55, // pase de primeras: utilidad mínima del mejor pase para jugarlo al primer toque
  firstTimeSlack: 22, // ticks de margen (rival − balón) por debajo de los cuales se piensa en la primera
  execMargin: 4, // ticks de margen entre lo que tarda en golpear y lo que tarda en llegar el rival
  execCheck: 1, // 0 = no comprobar el tiempo de ejecución (ablaciones)
  pressTrig: 1, // pauta "salta a presionar" (recibe, de espaldas, en banda); 0 = desactivada
  progress: 0.6, // pauta "busca la portería": valor extra por adelantar el balón (pases y conducción)
  firstShot: 0.3, // remate de primeras si la calidad del tiro desde donde llega el balón supera esto
  space: 1, // pauta "pase al hueco": probar destinos en el espacio por delante de cada compañero
  runs: 1, // pauta "desmárcate": atacar la espalda de la defensa cuando el equipo tiene el balón
  shortSupport: 1, // pauta "apoyo corto": el más cercano se ofrece con línea de pase libre
  shortDist: 120, // … a esta distancia del balón
  shortPress: 110, // … cuando hay un rival a menos de esto del balón
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
    // técnica (controlar, pasar, tirar, conducir) por ensayo con la física: src/ai/motor.js
    this.motor = makeMotor(() => match.players);
    this.w = { ...DEFAULT_WEIGHTS, ...TRAINED, ...(weights || {}) };
    this.noise = { x: 0, y: 0, vx: 0, vy: 0 };
    this.adapt = { sectors: [0, 0, 0], long: 0, short: 0, biasY: 0, holdBonus: 0 };
    this.reset();
  }

  reset() {
    this.rot = null;
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

  // un jugador propio chutó (lo llama Match): si es un tiro a puerta o un despeje largo, debe rotar
  onOwnKick(p, ball) {
    // pase: el destinatario pasa a recibir (va al balón) en vez de seguir en su zona
    if (p.act?.type === 'pass' && p.act.to && !p.act.to.human) p.act.to.receiving = { until: this.m.tick + 120, from: p };
    else if (p.firstTime?.to && !p.firstTime.to.human) p.firstTime.to.receiving = { until: this.m.tick + 120, from: p };
    const a = this.attack;
    const path = trajectory(ball.x, ball.y, ball.vx, ball.vy, 90);
    const end = path[path.length - 1];
    const shot = end.goal === a;
    const clear = !shot && ball.x * a < 0 && ball.vx * a > 2;
    if (shot || clear) { p.rotateNow = true; p.rotateType = shot ? 'shot' : 'clear'; }
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
    const newOwner = raw === 'loose' ? null : owner;
    if (newOwner && newOwner.ref !== this.owner?.ref) this.ownerSince = m.tick;
    this.owner = newOwner;

    // predicción del balón y tiempos de intercepción (con el horizonte del nivel)
    this.path = trajectory(ball.x, ball.y, ball.vx, ball.vy, 120);
    const itOf = new Map(all.map((p) => [p, intercept(p, this.path, P.horizonTicks)]));
    this.itOf = itOf;
    const tOpp = Math.min(...this.oppsV.map((o) => itOf.get(o).t));
    this.tOpp = tOpp;

    // ---- rotación 1.º / 2.º / 3.º (como en Rocket League 3v3, sin portero) ----
    const ours = phase === 'attack' && this.owner && this.owner.team === this.team;
    const { first, others, lasts } = this.assignRotation(ours ? this.owner : null, itOf);
    const second = others[0] || lasts[1] || lasts[0], third = lasts[0];
    this.rot = { first, second, third, others, lasts };
    // equipos grandes (5v5): formación zonal en vez de que todos se cierren sobre el balón
    if (this.players.length >= 4) return this.zonalThink(first, ours, phase, raw, itOf, tOpp, ais);
    this.zKind = null;

    const jobs = new Map();
    if (ours) {
      jobs.set(first, 'carry');
      for (const p of others) jobs.set(p, 'support');
      for (const p of lasts) jobs.set(p, 'support3');
    } else if (phase === 'loose' || !this.owner || this.owner.team === this.team || raw === 'loose') {
      jobs.set(first, 'chase');
      const winning = itOf.get(first).t + 6 < tOpp;
      others.forEach((p, i) => {
        // nivel bajo: el más cercano también va al balón (se amontonan)
        const bunch = i === 0 && P.bunch && Math.hypot(p.disc.x - ball.x, p.disc.y - ball.y) < 140 * fieldScale();
        jobs.set(p, bunch ? 'chase' : winning ? 'support' : 'cover');
      });
      // el último hombre sale a por el balón si gana la carrera con margen dentro de su zona
      if (third) { // (un equipo de 1 no tiene último hombre)
        const tIt = itOf.get(third);
        const fromGoal = Math.hypot(tIt.x + a * W, tIt.y);
        const sweeps = tIt.seen && fromGoal < this.sweep() && tIt.t + P.sweepMarginTicks < tOpp && tIt.t < itOf.get(first).t;
        jobs.set(third, sweeps ? 'chase' : 'shadow');
        if (sweeps && third.job !== 'chase') m.stats[this.team].sweeps++;
      }
      for (const p of lasts.slice(1)) jobs.set(p, 'cover'); // 5v5: el segundo central marca
    } else {
      jobs.set(first, 'press');
      const inTheirHalf = this.owner.disc.x * a > 0;
      others.forEach((p, i) => jobs.set(p, i === 0 && P.doublePress && inTheirHalf ? 'press2' : 'cover'));
      if (third) jobs.set(third, 'shadow');
      for (const p of lasts.slice(1)) jobs.set(p, 'cover');
    }
    // el que rota hacia atrás no hace otra cosa hasta llegar (salvo si es el único que puede ir al balón)
    for (const p of [...others, ...lasts]) if (p.rotating && p.rotating.until > m.tick && jobs.get(p) !== 'chase') jobs.set(p, 'rotate');
    // marcajes: cada jugador que cubre se queda con un rival peligroso distinto
    const covers = [...others, ...lasts].filter((p) => jobs.get(p) === 'cover');
    const list = this.dangerList();
    covers.forEach((p) => { p.markTarget = list.shift() || null; });

    for (const p of ais) {
      const job = jobs.get(p) || 'support';
      if (job !== 'carry' && job !== 'chase') { p.carryStart = null; p.act = null; }
      p.job = job;
    }
    // estadística: profundidad media del último hombre con posesión
    if (ours && third) {
      m.stats[this.team].thirdDepth += Math.hypot(third.disc.x + a * W, third.disc.y);
      m.stats[this.team].thirdDepthN++;
    }
    this.updateSpots();
  }

  // ---- 5v5: el 1.º va al balón; el resto ocupa los puestos de una formación que bascula ----
  zonalThink(first, ours, phase, raw, itOf, tOpp, ais) {
    const { P, m, ball, w } = this;
    const a = this.attack;
    const k = fieldScale();
    const kind = ours ? 'attack' : phase === 'defend' && raw !== 'loose' && this.owner ? 'defend' : 'loose';
    this.zKind = kind;
    const rest = this.players.filter((p) => p !== first);
    this.slotOf = assignSlots(rest, kind, ball, a, W, H, k, first, this.slotOf || new Map());
    for (const p of this.players) p.slotName = this.slotOf.get(p) || null;

    const jobs = new Map();
    jobs.set(first, ours ? 'carry' : kind === 'defend' ? 'press' : 'chase');
    for (const p of rest) jobs.set(p, ours ? (DEFENDERS.has(p.slotName) && p.slotName !== 'MC' ? 'support3' : 'support') : 'zone');
    // pauta "desmárcate": con el balón controlado y tiempo para pasar, 1–2 de los de arriba atacan la
    // espalda del último defensor rival (desmarque de ruptura) en vez de esperar en su zona
    for (const q of rest) if (q.deepRun && (q.deepRun.until < m.tick || !ours)) q.deepRun = null;
    if (w.runs && ours && P.through) {
      const oppNear = Math.min(...this.oppsV.map((o) => Math.hypot(o.disc.x - ball.x, o.disc.y - ball.y)));
      const lastLine = Math.max(...this.oppsV.map((o) => o.disc.x * a)); // el rival más retrasado
      const maxRuns = P.theta >= 0.8 ? 2 : 1;
      let active = rest.filter((q) => q.deepRun).length;
      if (oppNear > 60) {
        const cands = rest.filter((q) => !q.human && !q.deepRun && (q.slotName === 'EI' || q.slotName === 'ED' || q.slotName === 'MC') &&
          (q.runCooldown ?? 0) < m.tick)
          .sort((x, y) => y.disc.x * a - x.disc.x * a);
        for (const q of cands) {
          if (active >= maxRuns) break;
          const tx = Math.min(W - 45, Math.max(q.disc.x * a + 70, lastLine + 55));
          if (tx - q.disc.x * a < 40) continue;
          const ty = Math.max(-H + 40, Math.min(H - 40, q.disc.y * 0.8));
          q.deepRun = { x: tx * a, y: ty, until: m.tick + 130 };
          q.runCooldown = m.tick + 240;
          active++;
        }
      }
      for (const q of rest) if (q.deepRun && !q.human) jobs.set(q, 'run');
    }

    // pauta "apoyo corto": con el balón nuestro y el poseedor presionado, el compañero más cercano se
    // ofrece cerca y con la línea de pase libre, para que tenga una salida rápida
    const ourBall = ours || (m.lastTouch?.team === this.team && first && edgeToBall(first, ball) < 30);
    const pressed = Math.min(...this.oppsV.map((o) => Math.hypot(o.disc.x - ball.x, o.disc.y - ball.y))) < w.shortPress;
    if (w.shortSupport && ourBall && pressed) {
      const near = minBy(rest.filter((q) => !q.human && !q.deepRun && q.slotName !== 'LI' && q.slotName !== 'LD'), (q) => Math.hypot(q.disc.x - ball.x, q.disc.y - ball.y));
      if (near) {
        near.shortSpot = this.shortSpot(near, ball);
        if (near.shortSpot) jobs.set(near, 'short');
      }
    }
    if (!ours) {
      const near = (p) => Math.hypot(p.disc.x - ball.x, p.disc.y - ball.y);
      const ais2 = rest.filter((p) => !p.human);
      // el más retrasado tapa la portería (sombra) con el balón en nuestro campo, o sale si gana la carrera
      const deepest = minBy(ais2.filter((p) => DEFENDERS.has(p.slotName)), (p) => p.disc.x * a);
      if (deepest) {
        const tIt = itOf.get(deepest);
        const fromGoal = Math.hypot(tIt.x + a * W, tIt.y);
        const sweeps = kind === 'loose' && tIt.seen && fromGoal < this.sweep() && tIt.t + P.sweepMarginTicks < tOpp && tIt.t < itOf.get(first).t;
        if (sweeps) {
          if (deepest.job !== 'chase') m.stats[this.team].sweeps++;
          jobs.set(deepest, 'chase');
        } else if (ball.x * a < -0.15 * W) jobs.set(deepest, 'shadow');
      }
      // segundo hombre al balón, solo si está cerca (Fácil: va casi siempre; Difícil: presión doble)
      const second = minBy(ais2.filter((p) => jobs.get(p) === 'zone'), near);
      if (second) {
        if (kind === 'loose' && P.bunch && near(second) < 90 * k) jobs.set(second, 'chase');
        else if (kind === 'defend' && P.doublePress && this.owner.disc.x * a > 0 && near(second) < 130 * k) jobs.set(second, 'press2');
      }
      // marcaje zonal: cada rival peligroso, al de la zona más cercana (sin repetir)
      const zone = ais2.filter((p) => jobs.get(p) === 'zone');
      for (const p of zone) p.zoneMark = null;
      if (P.cover) {
        const R = 120 * k;
        const free = new Set(zone);
        for (const o of this.dangerList()) {
          const cand = minBy([...free], (p) => {
            const [sx, sy] = this.slotPointOf(p);
            const d = Math.hypot(o.disc.x - sx, o.disc.y - sy);
            return d < R ? d : Infinity;
          });
          if (cand && free.has(cand)) {
            const [sx, sy] = this.slotPointOf(cand);
            if (Math.hypot(o.disc.x - sx, o.disc.y - sy) < R) { cand.zoneMark = o; free.delete(cand); }
          }
        }
      }
    }
    for (const p of ais) {
      const job = jobs.get(p) || 'zone';
      // quien tiene el balón pegado conserva lo que iba a hacer aunque cambie la rotación
      const holding = edgeToBall(p, m.ball) < 20;
      if (job !== 'carry' && job !== 'chase' && !holding) { p.carryStart = null; p.act = null; }
      if (holding && p.act && job !== 'carry' && job !== 'chase') { p.job = 'chase'; continue; }
      p.job = job;
    }
    this.updateSpots();
  }

  // punto de apoyo corto: a ~100 del balón, en el ángulo con la línea de pase más segura (y hacia
  // delante si se puede), con histéresis para no bailar
  shortSpot(p, ball) {
    const { w } = this;
    const a = this.attack;
    const k = fieldScale();
    let best = null;
    for (let i = -4; i <= 4; i++) {
      const ang = (i / 4) * 2.1; // de -120° a 120° respecto a la dirección de ataque
      const r = w.shortDist * k;
      const [x, y] = clampField(ball.x + Math.cos(ang) * r * a, ball.y + Math.sin(ang) * r, 25);
      const safe = passSafetyTo(ball, x, y, this.oppsV, this.P.passMarginTicks);
      const fwd = Math.cos(ang) * 0.15;
      const stay = p.shortSpot ? Math.max(0, 1 - Math.hypot(x - p.shortSpot.x, y - p.shortSpot.y) / 80) * 0.1 : 0;
      const s = safe + fwd + stay - Math.hypot(x - p.disc.x, y - p.disc.y) / 1500;
      if (!best || s > best.s) best = { x, y, s };
    }
    return best;
  }

  slotPointOf(p) {
    return slotPoint(p.slotName || 'MC', this.zKind || 'loose', this.ball, this.attack, W, H, fieldScale());
  }

  // Puesto zonal sin balón: marcar por el lado de la portería al rival que entra en mi zona
  // (cortando su línea de pase en niveles altos); si no hay, quedarme en mi punto de la formación.
  zone(p) {
    const { P, ball } = this;
    const a = this.attack;
    let [tx, ty] = this.slotPointOf(p);
    const r = p.zoneMark;
    if (r) {
      const ogx = -a * W;
      const [gx, gy] = norm(ogx - r.disc.x, -r.disc.y);
      let mx = r.disc.x + gx * 30, my = r.disc.y + gy * 30;
      if (P.laneCut) {
        mx = mx * 0.5 + (ball.x + (r.disc.x - ball.x) * 0.7) * 0.5;
        my = my * 0.5 + (ball.y + (r.disc.y - ball.y) * 0.7) * 0.5;
      }
      // sin salir demasiado de la zona: mezcla entre el puesto y la marca
      const w = 0.35 + 0.25 * P.theta;
      tx = tx * (1 - w) + mx * w;
      ty = ty * (1 - w) + my * w;
    }
    [tx, ty] = clampField(tx, ty, 18);
    steer(p, tx, ty, P.zoneSpeed);
    this.pinch(p);
  }

  // Separación entre compañeros (5v5): un empujón suave para no pisarse ni hacer bola.
  separate(p) {
    let sx = 0, sy = 0;
    const R = 70;
    for (const q of this.players) {
      if (q === p) continue;
      const dx = p.disc.x - q.disc.x, dy = p.disc.y - q.disc.y;
      const d = Math.hypot(dx, dy);
      if (d < R && d > 0) { sx += (dx / d) * (1 - d / R); sy += (dy / d) * (1 - d / R); }
    }
    if (!sx && !sy) return;
    let ix = p.input.x + sx * 0.7, iy = p.input.y + sy * 0.7;
    const l = Math.hypot(ix, iy);
    if (l > 1) { ix /= l; iy /= l; }
    p.input.x = ix;
    p.input.y = iy;
  }

  // Orden de la rotación. 1.º = el que llega antes al balón (o el poseedor). Último hombre = el más
  // retrasado del resto, siempre una IA si es posible (en 5v5 desde Normal, dos centrales).
  // Con histéresis para no bailar; el que acaba de actuar rota atrás y pasa a ser el último.
  assignRotation(owner, itOf) {
    const { P, m } = this;
    const a = this.attack;
    const prev = this.rot || {};
    const team = this.players;
    // ¿el 1.º anterior ya terminó su acción? (chutó/pasó, o el balón se le fue) → rota atrás
    const pf = prev.first;
    if (P.rotateBack && pf && !pf.human && pf !== owner) {
      // rota atrás si acaba de tirar/despejar, o si le han superado (balón por detrás y un rival llega antes)
      const acted = pf.rotateNow;
      const ball = this.ball;
      const behind = (pf.disc.x - ball.x) * a > 40;
      const beaten = behind && this.tOpp < itOf.get(pf).t;
      if ((acted || beaten) && !pf.rotating) {
        pf.rotating = { until: m.tick + ticks(1400), farPost: P.farPost };
        m.stats[this.team].rotations++;
      }
    }
    for (const p of team) {
      p.rotateNow = false;
      if (p.rotating && p.rotating.until <= m.tick) p.rotating = null;
    }

    let first = owner;
    if (!first) {
      first = minBy(team, (p) => itOf.get(p).t - (p === pf ? P.rotHyst : 0) + (p.rotating ? 30 : 0) + (p.human ? -6 : 0));
    }
    if (first !== pf) first.firstSince = m.tick;
    if (first.rotating) first.rotating = null;
    const rest = team.filter((p) => p !== first);
    // últimos: los que están rotando, si no los más retrasados (con histéresis); preferiblemente IA
    const prevLasts = prev.lasts || [];
    const depth = (p) => p.disc.x * a - (prevLasts.includes(p) ? P.rotHyst * 2 : 0) - (p.rotating ? 1000 : 0) + (p.human ? 60 : 0);
    const sorted = [...rest].sort((x, y) => depth(x) - depth(y));
    const nLast = team.length >= 5 && P.theta >= 0.3 ? 2 : 1;
    const lasts = sorted.slice(0, Math.min(nLast, Math.max(1, rest.length - 1)));
    const others = rest.filter((p) => !lasts.includes(p));
    return { first, others, lasts };
  }

  // zona de salida del último hombre, escalada con el ancho de portería del estadio
  sweep() {
    return this.P.sweep * (G / 64);
  }

  updateSpots() {
    const sup = this.players.filter((p) => !p.human && (p.job === 'support' || p.job === 'support3'));
    if (!sup.length) return;
    const spots = assignSpots(this, sup, this.m.ball);
    for (const [p, s] of spots) p.spot = s;
  }

  // Adaptación lenta (Teamvision/ACE): si el rival insiste por una banda o con tiros lejanos,
  // cerrar más esa banda y adelantar un poco al último hombre.
  adaptPlan() {
    const s = this.adapt.sectors;
    const total = s[0] + s[1] + s[2];
    if (total < 4) return;
    const maxI = s.indexOf(Math.max(...s));
    this.adapt.biasY = s[maxI] / total > 0.45 ? [-90, 0, 90][maxI] : 0;
    this.adapt.holdBonus = this.adapt.long > this.adapt.short * 1.5 ? 14 : 0;
  }

  // ---------------- ejecución (cada tick) ----------------
  act(p) {
    this.actJob(p);
    if (this.zKind && SEPARATE.has(p.job)) this.separate(p);
  }

  actJob(p) {
    p.input.kick = false;
    // me han pasado el balón: ir a recibirlo (hasta tocarlo, o si lo toca otro)
    const rc = p.receiving;
    if (rc) {
      const lt = this.m.lastTouch;
      if (rc.until < this.m.tick || (lt && lt !== rc.from)) p.receiving = null;
      else return this.chase(p);
    }
    switch (p.job) {
      case 'carry': return this.carry(p);
      case 'chase': return this.chase(p);
      case 'support':
      case 'support3':
        if (p.run && p.run.until > this.m.tick) return steer(p, p.run.x, p.run.y, 1);
        if (p.spot) return steer(p, p.spot.x, p.spot.y, 1);
        return steer(p, p.disc.x, p.disc.y, 0);
      case 'press': return this.press(p);
      case 'press2': return this.press2(p);
      case 'cover': return this.cover(p);
      case 'shadow': return this.shadow(p);
      case 'rotate': return this.rotateBack(p);
      case 'zone': return this.zone(p);
      case 'short': return p.shortSpot ? steer(p, p.shortSpot.x, p.shortSpot.y, 1) : this.zone(p);
      case 'run': return p.deepRun ? steer(p, p.deepRun.x, p.deepRun.y, 1, 8) : this.zone(p);
      default: return steer(p, p.disc.x, p.disc.y, 0);
    }
  }

  // Ir a por el balón suelto al punto de intercepción predicho (dentro del horizonte del nivel).
  // Si el balón llega rápido, control orientado: correr con él para amortiguarlo.
  // Ir a por el balón y controlarlo (control orientado hacia la portería rival); controlado → carry.
  chase(p) {
    const real = this.m.ball;
    const speed = Math.hypot(real.vx, real.vy);
    if (edgeToBall(p, real) < 28 && speed < 2.2) return this.carry(p);
    // ya había decidido qué hacer con el balón y lo tiene cerca: seguir (aunque se mueva al prepararlo)
    const act = p.act;
    if (act && act.type !== 'dribble' && act.type !== 'fake' && this.m.tick - act.start < 60 && edgeToBall(p, real) < 40) return this.carry(p);
    if (this.P.oneTouch && this.firstTime(p, real)) return;
    p.firstTime = null;
    this.motor.control(p, real, [this.attack, 0]);
  }

  // Pase de primeras: si el balón me llega de un compañero y al recibirlo voy a tener un rival
  // encima, elegir ya el destino (desde el punto donde lo recibiré) y jugarlo al primer toque.
  firstTime(p, ball) {
    const { m, w, P } = this;
    const a = this.attack;
    const from = m.lastTouch;
    if (!from || from === p || from.team !== this.team) return false;
    const path = trajectory(ball.x, ball.y, ball.vx, ball.vy, 90);
    const it = intercept(p, path, 90);
    if (it.t > 70) return false;
    const opps = this.opps;
    const tOpp = Math.min(...opps.map((o) => timeToReach(o, it.x, it.y)));
    const slack = tOpp - it.t;
    // decisión tomada hace poco: mantenerla (no cambiar de idea con el balón llegando)
    const prev = p.firstTime;
    if (prev && m.tick - prev.tick < 30) {
      if (prev.shot) this.motor.shoot(p, ball, prev.tx, prev.ty, Math.max(0, slack));
      else this.motor.pass(p, ball, prev.tx, prev.ty, 3, null, Math.max(0, slack));
      return true;
    }
    // remate de primeras: balón que llega en zona de tiro con hueco
    const sh = bestShot({ x: it.x, y: it.y }, opps, a);
    if (sh.dist < 300 * fieldScale() && sh.quality > w.firstShot) {
      p.firstTime = { tx: sh.x, ty: sh.y, tick: m.tick, shot: true };
      this.motor.shoot(p, ball, sh.x, sh.y, Math.max(0, slack));
      return true;
    }
    if (slack > w.firstTimeSlack) return false; // hay tiempo para controlar
    let best = null;
    for (const mt of this.players) {
      if (mt === p) continue;
      const lead = 10;
      const [tx, ty] = clampField(mt.disc.x + mt.disc.vx * lead, mt.disc.y + mt.disc.vy * lead, 18);
      const d = Math.hypot(tx - it.x, ty - it.y);
      if (d < 60) continue;
      const ps = passSafety(shotPath(it.x, it.y, tx, ty, KICK_SPEED, 100), mt, opps, P.passMarginTicks);
      // no hacia la propia portería cerca de ella
      if ((tx - it.x) * a < -40 && Math.hypot(it.x + a * W, it.y) < 220) continue;
      const u = ps.p * (threat(tx, ty, a) + 0.3);
      if (!best || u > best.u) best = { u, tx, ty, p: ps.p, to: mt };
    }
    if (!best || best.p < w.firstTime) return false;
    p.firstTime = { tx: best.tx, ty: best.ty, tick: m.tick, to: best.to };
    this.motor.pass(p, ball, best.tx, best.ty, 3, null, Math.max(0, slack));
    return true;
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

    // rival ya encima del balón en mi tercio: despejar si se puede hacerlo ya y hacia fuera
    const oppNear = Math.min(...this.opps.map((o) => Math.hypot(o.disc.x - ball.x, o.disc.y - ball.y)));
    const ownThird = ball.x * a < -W * 0.35;
    if (oppNear < CONTACT + 4 && ownThird && safeKickDir(p, ball) && approachAngle(p, ball, a * W, 0) > 0.6) return clearNow(p, ball);

    const act = p.act;
    const done = act && ((act.mode === 'kick' && p.lastKick > act.start) ||
      (act.mode === 'push' && act.type !== 'dribble' && edgeToBall(p, ball) > 14 && m.tick - act.start > 8));
    if (done && act.type === 'pass') this.afterPass(p, act);
    const req = m.passRequests?.[p.team] ?? -1e9;
    const requested = req > (act?.start ?? -1) && m.tick - req < 90;
    // conduciendo y llega un rival: replantearse (soltarla, protegerla o seguir)
    const pressed = act?.type === 'dribble' && oppNear < CONTACT + 25 && m.tick - act.start > 6;
    // preparando un pase: si un rival ha cerrado la línea mientras tanto, pensar otra cosa
    let closed = false;
    if (act?.type === 'pass' && act.to && !done && (m.tick - act.start) % 6 === 5) {
      const mode = act.mode === 'kick' ? KICK_SPEED : PUSH_SPEED;
      const ps = passSafety(shotPath(ball.x, ball.y, act.tx, act.ty, mode, 100), act.to, this.oppsV || this.opps, P.passMarginTicks);
      closed = ps.p < 0.45;
    }
    if (!act || done || m.tick > act.until || requested || pressed || closed) p.act = this.decide(p);
    this.execute(p, p.act);
    // último momento: va a golpear un pase y la línea está cerrada (según lo que ve) → no chutar
    const a2 = p.act;
    if (p.input.kick && a2?.type === 'pass' && a2.to && edgeToBall(p, ball) <= C.KICK_DIST + 2) {
      const ps = passSafety(shotPath(ball.x, ball.y, a2.tx, a2.ty, KICK_SPEED, 100), a2.to, this.oppsV || this.opps, P.passMarginTicks * 0.5);
      if (ps.p < 0.35) { p.input.kick = false; p.act = null; }
    }
  }

  execute(p, act) {
    const ball = this.m.ball;
    if (act.type === 'clear') {
      if (safeKickDir(p, ball)) return clearNow(p, ball);
      // despejar hacia donde menos haya que rodear el balón (banda o adelante), nunca hacia la portería
      const a = this.attack;
      const opts = [[ball.x + a * 220, H], [ball.x + a * 220, -H], [ball.x + a * 40, H], [ball.x + a * 40, -H]];
      const [tx, ty] = minBy(opts, ([x, y]) => approachAngle(p, ball, x, y));
      return this.motor.pass(p, ball, tx, ty, 1, 20);
    }
    if (act.type === 'fake') { p.input.x = act.dx; p.input.y = act.dy; return; }
    if (act.type === 'dribble') return this.motor.dribble(p, ball, act.tx, act.ty);
    // error de ejecución del nivel: el objetivo gira act.err radianes alrededor del balón
    const c = Math.cos(act.err || 0), sn = Math.sin(act.err || 0);
    const dx = act.tx - ball.x, dy = act.ty - ball.y;
    const tx = ball.x + dx * c - dy * sn, ty = ball.y + dx * sn + dy * c;
    const tOpp = Math.min(...this.opps.map((o) => timeToReach(o, ball.x, ball.y)));
    if (act.type === 'shot') return this.motor.shoot(p, ball, tx, ty, tOpp);
    this.motor.pass(p, ball, tx, ty, 3, null, tOpp);
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
    const k = fieldScale();
    const danger = fromOwnGoal < 120 * k || (ownThird && pressure > 0.6);
    // valor de un punto: amenaza de gol + lo que se adelanta el balón hacia la portería rival
    const value = (x, y) => threat(x, y, a) + 0.15 + w.progress * Math.max(-0.3, ((x - ball.x) * a) / W);

    // tiro al centro del mayor hueco libre
    if (!danger) {
      const s = bestShot(ball, opps, a);
      if (s.dist < 380 * k && s.quality > 0) {
        opts.push({ u: w.shot * tr.shot * s.quality * align(s.x, s.y), type: 'shot', mode: 'kick', tx: s.x, ty: s.y, noise: P.aim, kickAngle: P.align });
      }
    }

    // pases: al pie, al espacio (al punto de apoyo hacia el que corre) y a la banda
    let safest = 0; // seguridad del mejor pase que no va hacia atrás
    for (const mt of this.players) {
      if (mt === p) continue;
      const lead = mt.human ? 6 : 10;
      const targets = [[mt.disc.x + mt.disc.vx * lead, mt.disc.y + mt.disc.vy * lead, 'feet']];
      if (P.through) {
        if (mt.spot && !mt.human) targets.push([mt.spot.x, mt.spot.y, 'through']);
        else targets.push([mt.disc.x + a * 70 + mt.disc.vx * 15, mt.disc.y + mt.disc.vy * 15, 'through']);
        // pase al hueco: puntos en el espacio por delante del compañero (y hacia donde corre); vale
        // si, siguiendo el recorrido del balón, él llega antes que cualquier rival (passSafety)
        if (w.space && (mt.disc.x - ball.x) * a > -60) {
          const k = fieldScale();
          for (const ang of [-0.9, -0.45, 0, 0.45, 0.9]) {
            for (const dd of [70, 130, 190]) {
              const r = dd * k;
              targets.push([mt.disc.x + Math.cos(ang) * r * a + mt.disc.vx * 10, mt.disc.y + Math.sin(ang) * r + mt.disc.vy * 10, 'space']);
            }
          }
        }
      }
      if (P.wallPass) {
        const wy = mt.disc.y > ball.y ? H : -H;
        targets.push([mt.disc.x, 2 * wy - mt.disc.y, 'wall']);
      }
      for (let [tx, ty, kind] of targets) {
        if (kind !== 'wall') [tx, ty] = clampField(tx, ty, 18);
        const d = Math.hypot(tx - ball.x, ty - ball.y);
        if (d < 50) continue;
        const mode = d > (kind === 'feet' ? 130 : 180) || kind === 'wall' || kind === 'space' ? 'kick' : 'push';
        const ps = passSafety(shotPath(ball.x, ball.y, tx, ty, mode === 'kick' ? KICK_SPEED : PUSH_SPEED, 100), mt, opps, P.passMarginTicks);
        let u = w.pass * tr.pass * ps.p * value(ps.x, ps.y) * align(tx, ty);
        if (mt.human) u += w.human * ps.p;
        const running = mt.disc.vx * a > 0.8;
        const requested = mt.human && tick - mt.passRequestTick < 90; // ese humano pidió el pase
        if (requested && (kind === 'feet' || (kind === 'through' && running))) u += 2 * ps.p;
        if (P.oneTwo && this.lastPass?.from === mt && this.lastPass.to === p && tick - this.lastPass.tick < 120) u += w.oneTwo * ps.p;
        if (mt.run && mt.run.until > tick) u += w.oneTwo * 0.5 * ps.p;
        // atrás al último hombre: dejada bajo presión (niveles que la conocen) o para reiniciar
        if (mt.job === 'support3' && !danger) u *= P.drop && pressure > 0.5 ? 1 : 0.6;
        // pauta "suelta rápido": con presión, los pases seguros ganan frente a seguir con el balón
        u *= 1 + w.quick * pressure * ps.p;
        // en zona de peligro solo pases seguros y nunca hacia la propia portería
        if (danger && (ps.p < 0.75 || (tx - ball.x) * a < -40)) continue;
        if ((tx - ball.x) * a > -40) safest = Math.max(safest, ps.p);
        opts.push({ u, type: 'pass', mode, tx, ty, kind, to: mt, noise: P.passAim, kickAngle: P.align * 1.6 });
      }
    }

    // despejar solo en peligro y si no hay ningún pase seguro
    if (danger && safest < 0.65) {
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
        let u = w.dribble * tr.dribble * value(qx, qy) * space * (1 - 0.85 * pressure) * align(qx, qy);
        if (calm && forward > 0.3) u += w.hold * space * forward; // conservar, pero avanzando
        opts.push({ u, type: 'dribble', mode: 'push', tx: ball.x + Math.cos(ang) * 120, ty: ball.y + Math.sin(ang) * 120 });
      }
      // amago: solo con el rival llegando (no encima) y de vez en cuando
      if (P.fakes && pressure > 0.4 && pressure < 0.75 && Math.random() < 0.12) {
        const [ox, oy] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
        const s = Math.random() < 0.5 ? 1 : -1;
        opts.push({ u: 0.25, type: 'fake', dx: -oy * s * 0.7, dy: ox * s * 0.7, until: tick + 12 + Math.floor(Math.random() * 12) });
      }
    }

    // ¿le da tiempo a ejecutarlo? Para las mejores opciones de golpeo, el planificador estima en
    // cuántos ticks podría chutar; si el rival llega antes, la opción vale mucho menos.
    if (P.execCheck && w.execCheck) {
      const real = m.ball;
      const top = opts.filter((o) => o.type === 'pass' || o.type === 'shot').sort((x, y) => y.u - x.u).slice(0, 3);
      for (const o of top) {
        const kt = estimateKick(p, real, m.players, o.tx, o.ty, o.type === 'shot');
        o.kt = kt;
        if (kt === Infinity) o.u *= 0.3;
        else if (kt > tOpp - w.execMargin) o.u *= 0.25;
        else o.u *= Math.exp(-kt / 90);
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
    return this.dangerList(self)[0] || null;
  }

  // rivales sin balón ordenados de más a menos peligrosos
  dangerList(self = null) {
    const { ball } = this;
    const blockers = this.players.filter((q) => q !== self);
    const out = [];
    for (const o of this.oppsV) {
      if (this.owner && o.ref === this.owner.ref) continue;
      let v = threat(o.disc.x, o.disc.y, -this.attack) * (0.3 + laneProb(ball.x, ball.y, o.disc.x, o.disc.y, blockers));
      if (this.adapt.biasY && Math.abs(o.disc.y - this.adapt.biasY) < 70) v *= 1.3;
      out.push({ o, v });
    }
    return out.sort((x, y) => y.v - x.v).map((e) => e.o);
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
    // disparadores de presión: atacar el balón (no esperar) si el rival acaba de recibir o aún no lo
    // controla, va hacia su portería (de espaldas) o está pegado a la banda
    const trig = P.pressTriggers && this.owner && this.pressTrigger(this.owner, ball);
    const close = controlled && !trig ? P.standOff : P.bodyBlock ? CONTACT - 2 : CONTACT + 4;
    steer(p, ball.x + gx * close, ball.y + gy * close, trig ? 1 : P.pressSpeed, 12);
    if (P.bodyBlock && !controlled && Math.hypot(p.disc.x - ball.x, p.disc.y - ball.y) < CONTACT + 22) {
      const [bx, by] = norm(ball.x - p.disc.x, ball.y - p.disc.y);
      p.input.x = p.input.x * 0.5 + bx * 0.5;
      p.input.y = p.input.y * 0.5 + by * 0.5;
    }
    this.pinch(p);
  }

  pressTrigger(o, ball) {
    const { m, w } = this;
    if (!w.pressTrig) return false;
    const d = o.disc;
    const justGot = m.tick - (this.ownerSince ?? -1e9) < 25; // recibió hace menos de 0,4 s
    const loose = edgeToBall(o, ball) > 6 || Math.hypot(ball.vx - d.vx, ball.vy - d.vy) > 0.7;
    const backwards = d.vx * o.attack < -0.4; // va hacia su propia portería
    const touchline = Math.abs(ball.y) > H - 45;
    return justGot || loose || backwards || touchline;
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
    const r = p.markTarget !== undefined ? p.markTarget : this.dangerous(p);
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

  // ---------------- último hombre ----------------
  // Punto que tapa el ángulo: sobre la bisectriz balón-postes a s = R / sen(α) del balón,
  // con la profundidad limitada a [minDepth, lastManHold]. Lo usa el último hombre (3.º) en defensa.
  shadowSpot(ball, extra = 0) {
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
    // con el balón lejos (en campo rival) el último hombre espera más arriba, hacia el medio campo
    const ballDepth = (ball.x - ogx) * a;
    const maxDepth = Math.max(P.lastManHold * (G / 64), ballDepth - 380 * fieldScale()) + this.adapt.holdBonus + extra;
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

  // Último hombre en defensa: sombra entre balón y portería; achica en el 1v1.
  shadow(p) {
    const { P, ball } = this;
    const a = this.attack;
    const ogx = -a * W;
    const real = this.m.ball;
    let K = this.shadowSpot(ball);
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

// Rotar atrás (el 1.º que acaba de actuar): volver detrás del balón por el lado alejado de la
// jugada (palo lejano), sin cruzarse por delante. Al llegar deja de rotar y es el 3.º.
TeamBrain.prototype.rotateBack = function rotateBack(p) {
  const ball = this.ball;
  const a = this.attack;
  const far = p.rotating?.farPost ? (ball.y >= 0 ? -1 : 1) : Math.sign(p.disc.y || 1);
  // detrás del último hombre actual (que así sube a 2.º) y detrás del balón
  const others = this.players.filter((q) => q !== p).map((q) => q.disc.x * a);
  const k = fieldScale();
  const depth = Math.max(-W + 50, Math.min(ball.x * a - 150 * k, -W + this.P.lastManDepth * k, Math.min(...others) - 25));
  const tx = a * depth, ty = far * 95;
  if (Math.hypot(p.disc.x - tx, p.disc.y - ty) < 40) p.rotating = null;
  steer(p, tx, ty, 1, 12);
};

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
