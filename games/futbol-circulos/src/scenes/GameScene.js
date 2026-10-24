import Phaser from 'phaser';
import { CONFIG as C } from '../config.js';
import { beep } from '../utils/sound.js';
import { World, makeDisc } from '../physics.js';
import { TouchControls } from '../input.js';
import { assignRoles, think } from '../ai/easy.js';
import { TeamBrain } from '../ai/team.js';
import { settings } from '../settings.js';

const DT_MS = 1000 / C.TICK_HZ;
const ms2ticks = (ms) => Math.max(1, Math.round(ms / DT_MS));

// Posiciones de saque (x relativa a la propia portería: negativa = propia mitad)
const KICKOFF_SPOTS = {
  kicker: [[-40, 0], [-180, -90], [-180, 90]],
  other: [[-140, 0], [-250, -70], [-250, 70]],
};

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    this.debug = C.DEBUG || new URLSearchParams(location.search).has('debug');

    this.world = new World();
    this.ball = makeDisc(0, 0, C.BALL_RADIUS, C.BALL_INV_MASS, C.BALL_DAMPING, C.BALL_BCOEF);
    this.ball.isBall = true;

    this.players = [];
    for (const [team, attack, color] of [['red', 1, C.COLOR_RED], ['blue', -1, C.COLOR_BLUE]]) {
      for (let i = 0; i < 3; i++) {
        const disc = makeDisc(0, 0, C.PLAYER_RADIUS, C.PLAYER_INV_MASS, C.PLAYER_DAMPING, C.PLAYER_BCOEF);
        this.players.push({
          disc, team, attack, color,
          human: team === 'red' && i === 0,
          input: { x: 0, y: 0, kick: false },
          kickArmed: true,
          role: 'support',
          aimError: 0,
        });
      }
    }
    this.brains = {
      red: new TeamBrain('red', this.players.filter((p) => p.team === 'red')),
      blue: new TeamBrain('blue', this.players.filter((p) => p.team === 'blue')),
    };
    this.stats = { red: { passes: 0 }, blue: { passes: 0 } };
    this.lastTouch = null;
    this.world.discs.push(...this.players.map((p) => p.disc), this.ball);

    this.score = { red: 0, blue: 0 };
    this.tick = 0;
    this.acc = 0;
    this.ballHistory = [];
    this.lastPostSound = 0;
    this.world.onPostHit = () => {
      if (this.tick - this.lastPostSound > 10 && Math.hypot(this.ball.vx, this.ball.vy) > 1.5) {
        this.lastPostSound = this.tick;
        beep(C.SOUND_POST, C.SOUND_DURATION * 2);
      }
    };

    this.drawField();
    this.ballGfx = this.add.circle(0, 0, C.BALL_RADIUS, C.COLOR_BALL).setStrokeStyle(C.BORDER_WIDTH, C.COLOR_BORDER).setDepth(11);
    for (const p of this.players) {
      p.gfx = this.add.circle(0, 0, C.PLAYER_RADIUS, p.color).setStrokeStyle(C.BORDER_WIDTH, C.COLOR_BORDER).setDepth(10);
      if (p.human) {
        this.human = p;
        p.ring = this.add.circle(0, 0, C.PLAYER_RADIUS + C.KICK_DIST, 0, 0)
          .setStrokeStyle(2, 0xffffff, 1).setAlpha(C.RING_ALPHA_IDLE).setDepth(9);
      }
    }

    this.scoreText = this.add.text(0, 4, '', {
      fontFamily: 'sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(50).setScrollFactor(0);
    this.goalText = this.add.text(0, -20, '¡GOL!', {
      fontFamily: 'sans-serif', fontSize: '64px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(60).setVisible(false);
    if (this.debug) {
      this.fpsText = this.add.text(C.PAUSE_BTN_MARGIN * 2 + C.PAUSE_BTN_SIZE, 6, '', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffff00',
      }).setDepth(50).setScrollFactor(0);
    }
    this.updateScore();

    this.createPauseButton();
    this.controls = new TouchControls(this, (p) => this.inPauseButton(p));
    this.applySettings();
    this.events.on('resume', () => this.applySettings());
    this.scale.on('resize', () => this.layout());
    this.layout();
    this.input.once('pointerdown', () => {
      try {
        if (!this.scale.isFullscreen) this.scale.startFullscreen();
        screen.orientation?.lock?.('landscape').catch(() => {});
      } catch { /* sin pantalla completa */ }
    });

    this.startKickoff('red');
    window.__game = this; // para pruebas y depuración
  }

  // Coloca cámara y HUD según el tamaño visible (EXPAND cambia el ancho/alto del lienzo).
  layout() {
    const { width } = this.scale.gameSize;
    this.cameras.main.centerOn(0, -C.VIEW_OFFSET_Y);
    this.scoreText.setX(width / 2);
  }

  applySettings() {
    this.controls.setModes(settings.joystick, settings.kick);
    this.difficulty = settings.difficulty;
  }

  createPauseButton() {
    const s = C.PAUSE_BTN_SIZE, m = C.PAUSE_BTN_MARGIN;
    const g = this.add.graphics().setScrollFactor(0).setDepth(120);
    g.fillStyle(0xffffff, 0.85);
    g.fillRoundedRect(m, m, s, s, 8);
    g.lineStyle(3, 0x000000, 1);
    g.strokeRoundedRect(m, m, s, s, 8);
    for (let i = -1; i <= 1; i++) g.lineBetween(m + 10, m + s / 2 + i * 9, m + s - 10, m + s / 2 + i * 9);
    this.pauseBtn = g;
    this.pausePointer = null;
    // se abre solo al pulsar Y soltar dentro del botón
    this.input.on('pointerdown', (p) => {
      if (this.inPauseButton(p)) this.pausePointer = p.id;
    });
    this.input.on('pointerup', (p) => {
      if (p.id !== this.pausePointer) return;
      this.pausePointer = null;
      if (this.inPauseButton(p)) this.openMenu();
    });
  }

  inPauseButton(p) {
    const s = C.PAUSE_BTN_SIZE, m = C.PAUSE_BTN_MARGIN, pad = 6;
    return p.x >= m - pad && p.x <= m + s + pad && p.y >= m - pad && p.y <= m + s + pad;
  }

  openMenu() {
    this.controls.release();
    this.scene.pause();
    this.scene.launch('Menu');
  }

  drawField() {
    const g = this.add.graphics().setDepth(0);
    const W = C.FIELD_W, H = C.FIELD_H, G = C.GOAL_HALF, D = C.GOAL_DEPTH;
    g.fillStyle(C.COLOR_FIELD, 1);
    g.fillRect(-1500, -1000, 3000, 2000); // fondo de sobra para cualquier proporción de pantalla
    g.fillStyle(0x000000, 0.12);
    g.fillRect(-1500, -1000, 3000, 2000);
    g.fillStyle(C.COLOR_FIELD, 1);
    g.fillRect(-C.OUTER_W, -C.OUTER_H, C.OUTER_W * 2, C.OUTER_H * 2);
    // franjas de césped
    g.fillStyle(0x000000, 0.06);
    for (let i = 0; i < 8; i += 2) g.fillRect(-W + (i * W) / 4, -H, W / 4, H * 2);
    g.lineStyle(3, C.COLOR_LINES, 1);
    g.strokeRect(-W, -H, W * 2, H * 2);
    g.lineBetween(0, -H, 0, H);
    g.strokeCircle(0, 0, C.CENTER_RADIUS);
    g.fillStyle(C.COLOR_LINES, 1);
    g.fillCircle(0, 0, 3);
    // redes
    g.lineStyle(2, 0x000000, 0.8);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * W, -G);
      g.lineTo(s * (W + D), -G);
      g.lineTo(s * (W + D), G);
      g.lineTo(s * W, G);
      g.strokePath();
    }
    for (const p of this.world.posts) {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(p.x, p.y, p.r);
      g.lineStyle(C.BORDER_WIDTH, C.COLOR_BORDER, 1);
      g.strokeCircle(p.x, p.y, p.r);
    }
  }

  startKickoff(kickingTeam) {
    this.state = 'kickoff';
    this.kickingTeam = kickingTeam;
    Object.assign(this.ball, { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0 });
    for (const team of ['red', 'blue']) {
      const members = this.players.filter((p) => p.team === team);
      // el humano va primero para ocupar el sitio del que saca
      members.sort((a, b) => b.human - a.human);
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

  update(time, delta) {
    this.acc += Math.min(delta, 250);
    let n = 0;
    while (this.acc >= DT_MS && n < C.MAX_TICKS_PER_FRAME) {
      this.fixedTick();
      this.acc -= DT_MS;
      n++;
    }
    if (n === C.MAX_TICKS_PER_FRAME) this.acc = 0;
    this.render(this.acc / DT_MS);
  }

  fixedTick() {
    this.tick++;
    const ball = this.ball;

    // historial del balón para la reacción retardada de la IA
    this.ballHistory.push({ x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy });
    if (this.ballHistory.length > 30) this.ballHistory.shift();
    for (const team of ['red', 'blue']) this.teamThink(team);

    for (const p of this.players) {
      if (p.human) {
        p.input.x = this.controls.dirX;
        p.input.y = this.controls.dirY;
        p.input.kick = this.controls.kick;
      }
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
          this.onKick(p);
        }
      }
    }

    this.world.step();

    // último en tocar el balón (para la IA) y pases completados (para afinar la IA)
    for (const p of this.players) {
      if (Math.hypot(ball.x - p.disc.x, ball.y - p.disc.y) - p.disc.r - ball.r < 0.5) {
        const prev = this.lastTouch;
        if (prev && prev !== p && prev.team === p.team) this.stats[p.team].passes++;
        this.lastTouch = p;
      }
    }

    if (this.state === 'kickoff' && (ball.vx !== 0 || ball.vy !== 0)) {
      this.state = 'play';
      for (const p of this.players) p.disc.clamp = null;
    }
    if (this.state === 'play' && Math.abs(ball.y) < C.GOAL_HALF && Math.abs(ball.x) > C.FIELD_W) {
      this.onGoal(ball.x > 0 ? 'red' : 'blue');
    }
    if (this.state === 'goal' && this.tick >= this.resetTick) {
      this.startKickoff(this.concededBy);
    }
  }

  // IA de un equipo según su dificultad (Fácil = IA original por roles)
  teamThink(team) {
    const mates = team === this.human.team && C.TEAMMATE_LEVEL;
    const level = this.levelOverride?.[team] ?? (mates || this.difficulty);
    const L = C.AI_LEVELS[level];
    const hist = this.ballHistory;
    const seen = hist[Math.max(0, hist.length - 1 - ms2ticks(L.reactionMs))];
    const members = this.players.filter((p) => p.team === team);
    if (level === 'easy') {
      if (this.tick % ms2ticks(C.AI_ROLE_MS) === 0 || this.tick === 1) assignRoles(members, seen);
      if (this.tick % ms2ticks(L.thinkMs) !== 0) return;
      for (const p of members) {
        if (p.human) continue;
        if (Math.random() < 0.1) p.aimError = (Math.random() * 2 - 1) * C.AI_AIM_ERROR;
        think(p, seen);
      }
      return;
    }
    if (this.tick % ms2ticks(L.thinkMs) !== 0) return;
    const brain = this.brains[team];
    brain.setLevel(level);
    brain.think({ ball: seen, players: this.players, tick: this.tick, lastTouch: this.lastTouch });
  }

  // solo para pruebas: fija la dificultad de cada equipo (null = la del menú)
  setTeamLevels(red, blue) {
    this.levelOverride = red || blue ? { red, blue } : null;
  }

  onKick(p) {
    beep(C.SOUND_KICK + (p.human ? 0 : -120), C.SOUND_DURATION);
    if (p.human) {
      navigator.vibrate?.(C.VIBRATE_MS);
      this.tweens.add({ targets: p.ring, scale: { from: 1.5, to: 1 }, duration: 120, ease: 'Quad.Out' });
    }
    this.tweens.add({ targets: this.ballGfx, scale: { from: 1.35, to: 1 }, duration: 120 });
  }

  onGoal(scorer) {
    this.state = 'goal';
    this.score[scorer]++;
    this.concededBy = scorer === 'red' ? 'blue' : 'red';
    this.resetTick = this.tick + ms2ticks(C.GOAL_PAUSE_MS);
    this.updateScore();
    this.cameras.main.shake(250, 0.012);
    navigator.vibrate?.([40, 40, 80]);
    beep(C.SOUND_GOAL, 0.12);
    this.time.delayedCall(130, () => beep(C.SOUND_GOAL * 1.25, 0.18));
    const color = scorer === 'red' ? '#e56e56' : '#5689e5';
    this.goalText.setColor(color).setVisible(true).setScale(0.3).setAlpha(1);
    this.tweens.add({ targets: this.goalText, scale: 1, duration: 300, ease: 'Back.Out' });
    this.tweens.add({ targets: this.goalText, alpha: 0, delay: C.GOAL_PAUSE_MS - 400, duration: 300,
      onComplete: () => this.goalText.setVisible(false) });
    this.tweens.add({ targets: this.scoreText, scale: { from: 1.5, to: 1 }, duration: 300, ease: 'Back.Out' });
  }

  updateScore() {
    this.scoreText.setText(`ROJO ${this.score.red} - ${this.score.blue} AZUL`);
  }

  render(alpha) {
    const lerp = (d, o) => o.setPosition(d.px + (d.x - d.px) * alpha, d.py + (d.y - d.py) * alpha);
    lerp(this.ball, this.ballGfx);
    for (const p of this.players) lerp(p.disc, p.gfx);
    const h = this.human;
    h.ring.setPosition(h.gfx.x, h.gfx.y).setAlpha(h.input.kick ? C.RING_ALPHA_KICK : C.RING_ALPHA_IDLE);
    this.controls.draw();
    if (this.fpsText) {
      const b = this.ball;
      this.fpsText.setText(`FPS ${this.game.loop.actualFps.toFixed(0)}  v ${Math.hypot(b.vx, b.vy).toFixed(2)}  ${this.state}`);
    }
  }
}
