// Partido sin Phaser: física, chutes, saques, goles e IA. Lo usan la escena (navegador)
// y las herramientas de entrenamiento y pruebas (Node).
import { CONFIG as C } from '../config.js';
import { World, makeDisc } from '../physics.js';
import { TeamBrain } from '../ai/brain.js';

export const DT_MS = 1000 / C.TICK_HZ;
export const ms2ticks = (ms) => Math.max(1, Math.round(ms / DT_MS));

// Posiciones de saque (x relativa a la propia portería: negativa = propia mitad)
const KICKOFF_SPOTS = {
  kicker: [[-40, 0], [-180, -90], [-180, 90]],
  other: [[-140, 0], [-250, -70], [-250, 70]],
};

export class Match {
  // humanTeam: 'red' | null (null = todos IA). levels: { red, blue } nombres de CONFIG.AI_LEVELS
  constructor({ humanTeam = 'red', levels = { red: 'mate', blue: 'normal' }, weights = null } = {}) {
    this.world = new World();
    this.ball = makeDisc(0, 0, C.BALL_RADIUS, C.BALL_INV_MASS, C.BALL_DAMPING, C.BALL_BCOEF);
    this.ball.isBall = true;
    this.players = [];
    for (const [team, attack] of [['red', 1], ['blue', -1]]) {
      for (let i = 0; i < 3; i++) {
        const disc = makeDisc(0, 0, C.PLAYER_RADIUS, C.PLAYER_INV_MASS, C.PLAYER_DAMPING, C.PLAYER_BCOEF);
        this.players.push({
          id: this.players.length, disc, team, attack,
          human: team === humanTeam && i === 0,
          input: { x: 0, y: 0, kick: false },
          kickArmed: true,
        });
      }
    }
    this.human = this.players.find((p) => p.human) || null;
    this.world.discs.push(...this.players.map((p) => p.disc), this.ball);
    this.brains = {
      red: new TeamBrain(this, 'red', weights),
      blue: new TeamBrain(this, 'blue', weights),
    };
    this.levels = { ...levels };
    this.humanInput = { x: 0, y: 0, kick: false };
    this.events = {}; // kick(p), goal(scorer), post(), passRequest()
    this.score = { red: 0, blue: 0 };
    this.stats = {
      red: { passes: 0, shots: 0, lost: 0, ownGoals: 0, sweeps: 0, gkAtk: 0, gkAtkN: 0, steals: 0 },
      blue: { passes: 0, shots: 0, lost: 0, ownGoals: 0, sweeps: 0, gkAtk: 0, gkAtkN: 0, steals: 0 },
    };
    this.tick = 0;
    this.ballHistory = [];
    this.lastTouch = null;
    this.passRequestTick = -1e9;
    this.world.onPostHit = () => this.events.post?.();
    this.startKickoff('red');
  }

  startKickoff(kickingTeam) {
    this.state = 'kickoff';
    this.kickingTeam = kickingTeam;
    Object.assign(this.ball, { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0 });
    for (const team of ['red', 'blue']) {
      const members = this.players.filter((p) => p.team === team);
      members.sort((a, b) => b.human - a.human); // el humano ocupa el sitio del que saca
      const spots = KICKOFF_SPOTS[team === kickingTeam ? 'kicker' : 'other'];
      members.forEach((p, i) => {
        const [sx, sy] = spots[i];
        const x = sx * p.attack, y = sy;
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

    if (this.human) this.readHuman();
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

  readHuman() {
    const h = this.human, inp = this.humanInput;
    // pulsar tiro lejos del balón con un compañero en posesión = pedir el pase
    if (inp.kick && !h.input.kick) {
      const far = Math.hypot(this.ball.x - h.disc.x, this.ball.y - h.disc.y) - h.disc.r - this.ball.r > 40;
      const owner = this.lastTouch;
      if (far && owner && owner.team === h.team && owner !== h) {
        this.passRequestTick = this.tick;
        this.events.passRequest?.();
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
