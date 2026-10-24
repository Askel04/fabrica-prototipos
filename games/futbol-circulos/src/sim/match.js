// Partido sin Phaser: física, chutes, saques, goles e IA. Lo usan la escena (navegador)
// y las herramientas de entrenamiento y pruebas (Node).
import { CONFIG as C } from '../config.js';
import { World, makeDisc } from '../physics.js';
import { TeamBrain, syncField } from '../ai/brain.js';
import { setStadium, fieldScale } from '../stadium.js';

export const DT_MS = 1000 / C.TICK_HZ;
export const ms2ticks = (ms) => Math.max(1, Math.round(ms / DT_MS));

// Posiciones de saque (x negativa = propia mitad; se escalan con el campo). 3v3 y 5v5.
const KICKOFF_SPOTS = {
  3: {
    kicker: [[-40, 0], [-180, -90], [-180, 90]],
    other: [[-140, 0], [-250, -70], [-250, 70]],
  },
  5: {
    kicker: [[-40, 0], [-150, -120], [-150, 120], [-280, -60], [-280, 60]],
    other: [[-120, 0], [-170, -130], [-170, 130], [-290, -60], [-290, 60]],
  },
};

export class Match {
  // teamSize: 3 | 5 · stadium: 'classic' | 'big'
  // seats: humanos [{ team: 'red'|'blue', key, name }] (el resto de puestos son bots).
  //   Atajo: humanTeam 'red' = un humano local en rojo; null = todos bots.
  // levels: { red, blue } nombres de CONFIG.AI_LEVELS para los bots de cada equipo.
  // bots: false = cada equipo solo con sus humanos (online 1v1, 2v2, 1v2…).
  // localKey: puesto que maneja esta pantalla (anillo y controles).
  constructor({ humanTeam = 'red', seats = null, teamSize = 3, stadium = 'classic',
    levels = { red: 'mate', blue: 'normal' }, weights = null, bots = true, localKey = 'local' } = {}) {
    setStadium(stadium);
    syncField();
    this.teamSize = teamSize;
    this.stadium = stadium;
    if (!seats) seats = humanTeam ? [{ team: humanTeam, key: 'local' }] : [];
    this.world = new World();
    this.ball = makeDisc(0, 0, C.BALL_RADIUS, C.BALL_INV_MASS, C.BALL_DAMPING, C.BALL_BCOEF);
    this.ball.isBall = true;
    this.players = [];
    this.inputs = new Map();
    for (const [team, attack] of [['red', 1], ['blue', -1]]) {
      const humans = seats.filter((s) => s.team === team).slice(0, teamSize);
      const n = bots ? teamSize : humans.length;
      for (let i = 0; i < n; i++) {
        const seat = humans[i];
        const disc = makeDisc(0, 0, C.PLAYER_RADIUS, C.PLAYER_INV_MASS, C.PLAYER_DAMPING, C.PLAYER_BCOEF);
        this.players.push({
          id: this.players.length, disc, team, attack,
          human: !!seat, key: seat?.key ?? null, name: seat?.name ?? '',
          input: { x: 0, y: 0, kick: false },
          kickArmed: true,
          passRequestTick: -1e9,
        });
        if (seat) this.inputs.set(seat.key, { x: 0, y: 0, kick: false });
      }
    }
    // el humano local (si lo hay) es el que dibuja la escena con anillo y controles
    this.human = this.players.find((p) => p.key === localKey) || null;
    this.humans = this.players.filter((p) => p.human);
    this.world.discs.push(...this.players.map((p) => p.disc), this.ball);
    this.brains = {
      red: new TeamBrain(this, 'red', weights),
      blue: new TeamBrain(this, 'blue', weights),
    };
    this.levels = { ...levels };
    this.humanInput = this.inputs.get(localKey) || { x: 0, y: 0, kick: false };
    this.events = {}; // kick(p), goal(scorer), post(), passRequest()
    this.score = { red: 0, blue: 0 };
    this.stats = {
      red: { passes: 0, shots: 0, lost: 0, ownGoals: 0, sweeps: 0, thirdDepth: 0, thirdDepthN: 0, steals: 0, rotations: 0 },
      blue: { passes: 0, shots: 0, lost: 0, ownGoals: 0, sweeps: 0, thirdDepth: 0, thirdDepthN: 0, steals: 0, rotations: 0 },
    };
    this.tick = 0;
    this.ballHistory = [];
    this.lastTouch = null;
    this.passRequests = { red: -1e9, blue: -1e9 }; // último pase pedido por un humano de cada equipo
    this.world.onPostHit = () => this.events.post?.();
    this.startKickoff('red');
  }

  startKickoff(kickingTeam) {
    this.state = 'kickoff';
    this.kickingTeam = kickingTeam;
    Object.assign(this.ball, { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0 });
    for (const team of ['red', 'blue']) {
      const members = this.players.filter((p) => p.team === team);
      members.sort((a, b) => b.human - a.human); // los humanos ocupan primero los sitios (el que saca)
      const spots = KICKOFF_SPOTS[this.teamSize][team === kickingTeam ? 'kicker' : 'other'];
      const k = fieldScale();
      members.forEach((p, i) => {
        const [sx, sy] = spots[i];
        const x = sx * k * p.attack, y = sy * k;
        Object.assign(p.disc, { x, y, px: x, py: y, vx: 0, vy: 0 });
        p.disc.clamp = (d) => this.kickoffClamp(p, d);
        p.kickArmed = !p.input.kick;
      });
    }
    this.ballHistory.length = 0;
    this.lastTouch = null;
    for (const b of Object.values(this.brains)) b.reset();
  }

  // Durante el saque cada equipo queda en su mitad; el que no saca, fuera del círculo central.
  kickoffClamp(p, d) {
    if (d.x * p.attack > 0) {
      d.x = 0;
      d.vx = 0;
    }
    if (p.team !== this.kickingTeam) {
      const min = C.CENTER_RADIUS + d.r;
      const l = Math.hypot(d.x, d.y);
      if (l < min) {
        const nx = l ? d.x / l : -p.attack, ny = l ? d.y / l : 0;
        d.x = nx * min;
        d.y = ny * min;
      }
    }
  }

  step() {
    this.tick++;
    const ball = this.ball;
    // historial de instantáneas (balón y jugadores) para la percepción con retardo de la IA
    this.ballHistory.push({
      ball: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy },
      discs: this.players.map((p) => ({ x: p.disc.x, y: p.disc.y, vx: p.disc.vx, vy: p.disc.vy })),
    });
    if (this.ballHistory.length > 30) this.ballHistory.shift();

    for (const h of this.humans) this.readHuman(h);
    for (const team of ['red', 'blue']) this.brains[team].update(this.levels[team]);

    for (const p of this.players) {
      const d = p.disc;
      const kicking = p.input.kick;
      const accel = kicking ? C.PLAYER_KICK_ACCEL : C.PLAYER_ACCEL;
      d.damping = kicking ? C.PLAYER_KICK_DAMPING : C.PLAYER_DAMPING;
      d.vx += p.input.x * accel;
      d.vy += p.input.y * accel;

      if (!kicking) p.kickArmed = true;
      else if (p.kickArmed) {
        const dx = ball.x - d.x, dy = ball.y - d.y;
        const dist = Math.hypot(dx, dy);
        if (dist - d.r - ball.r <= C.KICK_DIST && dist > 0) {
          const k = C.KICK_STRENGTH * ball.invMass;
          ball.vx += (dx / dist) * k;
          ball.vy += (dy / dist) * k;
          p.kickArmed = false;
          p.lastKick = this.tick;
          this.touch(p);
          this.brains[p.team === 'red' ? 'blue' : 'red'].onOppKick(p, ball);
          this.brains[p.team].onOwnKick(p, ball);
          this.events.kick?.(p);
        }
      }
    }

    this.world.step();
    this.trackTouches();

    if (this.state === 'kickoff' && (ball.vx !== 0 || ball.vy !== 0)) {
      this.state = 'play';
      for (const p of this.players) p.disc.clamp = null;
    }
    if (this.state === 'play' && Math.abs(ball.y) < C.GOAL_HALF && Math.abs(ball.x) > C.FIELD_W) {
      this.goal(ball.x > 0 ? 'red' : 'blue');
    }
    if (this.state === 'goal' && this.tick >= this.resetTick) {
      this.startKickoff(this.concededBy);
    }
  }

  // entrada de un humano (local o remoto)
  setInput(key, inp) {
    const cur = this.inputs.get(key);
    if (cur) Object.assign(cur, inp);
  }

  // un humano se fue: su puesto pasa a la IA
  makeBot(p) {
    p.human = false;
    p.input.kick = false;
    this.humans = this.humans.filter((h) => h !== p);
    this.inputs.delete(p.key);
  }

  readHuman(h) {
    const inp = this.inputs.get(h.key) || { x: 0, y: 0, kick: false };
    // pulsar tiro lejos del balón con un compañero en posesión = pedir el pase
    if (inp.kick && !h.input.kick) {
      const far = Math.hypot(this.ball.x - h.disc.x, this.ball.y - h.disc.y) - h.disc.r - this.ball.r > 40;
      const owner = this.lastTouch;
      if (far && owner && owner.team === h.team && owner !== h) {
        h.passRequestTick = this.tick;
        this.passRequests[h.team] = this.tick;
        this.events.passRequest?.(h);
      }
    }
    h.input.x = inp.x;
    h.input.y = inp.y;
    h.input.kick = inp.kick;
  }

  // último en tocar el balón y estadísticas (pases completados, pérdidas)
  touch(p) {
    const prev = this.lastTouch;
    if (prev && prev !== p) {
      if (prev.team === p.team) {
        this.stats[p.team].passes++;
        this.brains[p.team].onReceive(prev, p);
      } else {
        this.stats[prev.team].lost++;
        this.stats[p.team].steals++;
      }
    }
    this.lastTouch = p;
  }

  trackTouches() {
    const ball = this.ball;
    for (const p of this.players) {
      if (Math.hypot(ball.x - p.disc.x, ball.y - p.disc.y) - p.disc.r - ball.r < 0.5) this.touch(p);
    }
    // tiro a puerta: el balón va hacia la portería rival entre postes
    for (const [team, gx] of [['red', C.FIELD_W], ['blue', -C.FIELD_W]]) {
      const going = Math.sign(ball.vx) === Math.sign(gx) && Math.abs(ball.vx) > 2;
      if (going) {
        const t = (gx - ball.x) / ball.vx;
        const y = ball.y + ball.vy * t;
        if (t > 0 && t < 60 && Math.abs(y) < C.GOAL_HALF && !this['shot' + team]) {
          this.stats[team].shots++;
          this['shot' + team] = true;
        }
      } else this['shot' + team] = false;
    }
  }

  goal(scorer) {
    this.state = 'goal';
    this.score[scorer]++;
    if (this.lastTouch && this.lastTouch.team !== scorer) this.stats[this.lastTouch.team].ownGoals++;
    this.concededBy = scorer === 'red' ? 'blue' : 'red';
    this.resetTick = this.tick + ms2ticks(C.GOAL_PAUSE_MS);
    this.events.goal?.(scorer);
  }

  // instantánea de hace `ticks` (la que percibe una IA con ese retardo)
  snapshot(ticks) {
    const h = this.ballHistory;
    if (!h.length) {
      const b = this.ball;
      return {
        ball: { x: b.x, y: b.y, vx: b.vx, vy: b.vy },
        discs: this.players.map((p) => ({ x: p.disc.x, y: p.disc.y, vx: p.disc.vx, vy: p.disc.vy })),
      };
    }
    return h[Math.max(0, h.length - 1 - ticks)];
  }
}
