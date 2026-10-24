import Phaser from 'phaser';
import { CONFIG as C } from '../config.js';
import { beep } from '../utils/sound.js';
import { TouchControls } from '../input.js';
import { settings } from '../settings.js';
import { Match, DT_MS } from '../sim/match.js';
import { MODES } from '../stadium.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    this.debug = C.DEBUG || new URLSearchParams(location.search).has('debug');

    // la simulación (física, reglas e IA) vive en Match; la escena solo dibuja y lee los controles
    const mode = MODES[settings.mode] || MODES['3v3'];
    this.match = new Match({ humanTeam: 'red', levels: { red: 'mate', blue: settings.difficulty }, ...mode });
    this.world = this.match.world;
    this.ball = this.match.ball;
    this.players = this.match.players;
    this.score = this.match.score;
    this.acc = 0;
    this.lastPostSound = 0;
    this.match.events = {
      kick: (p) => this.onKick(p),
      goal: (scorer) => this.onGoal(scorer),
      post: () => {
        if (this.match.tick - this.lastPostSound > 10 && Math.hypot(this.ball.vx, this.ball.vy) > 1.5) {
          this.lastPostSound = this.match.tick;
          beep(C.SOUND_POST, C.SOUND_DURATION * 2);
        }
      },
      passRequest: () => this.onPassRequest(),
    };

    this.drawField();
    this.ballGfx = this.add.circle(0, 0, C.BALL_RADIUS, C.COLOR_BALL).setStrokeStyle(C.BORDER_WIDTH, C.COLOR_BORDER).setDepth(11);
    for (const p of this.players) {
      p.color = p.team === 'red' ? C.COLOR_RED : C.COLOR_BLUE;
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

    if (this.debug) {
      // capa de depuración de la IA: rotación, último hombre y mapa de calor de desmarques
      this.dbgGfx = this.add.graphics().setDepth(8);
      this.dbgTexts = this.players.map(() => this.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(30));
    }
    this.createPauseButton();
    this.controls = new TouchControls(this, (p) => this.inPauseButton(p));
    this.applySettings();
    // cámara de interfaz sin zoom (marcador, pausa, controles); la principal solo ve el campo
    const ui = [this.scoreText, this.fpsText, this.pauseBtn, this.controls.gfx].filter(Boolean);
    this.uiCam = this.cameras.add(0, 0, this.scale.gameSize.width, this.scale.gameSize.height);
    this.uiCam.ignore(this.children.list.filter((o) => !ui.includes(o)));
    this.cameras.main.ignore(ui);
    this.events.on('resume', () => this.applySettings());
    this.scale.on('resize', () => this.layout());
    this.layout();
    this.input.once('pointerdown', () => {
      try {
        if (!this.scale.isFullscreen) this.scale.startFullscreen();
        screen.orientation?.lock?.('landscape').catch(() => {});
      } catch { /* sin pantalla completa */ }
    });

    window.__game = this; // para pruebas y depuración
  }

  // Coloca cámara y HUD según el tamaño visible (EXPAND cambia el ancho/alto del lienzo).
  layout() {
    const { width } = this.scale.gameSize;
    // zoom para que quepa el estadio entero (1 en el clásico; menos en el grande)
    const { height } = this.scale.gameSize;
    const zoom = Math.min(1, width / (2 * C.OUTER_W + 20), height / (2 * C.OUTER_H + 40));
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(0, -C.VIEW_OFFSET_Y / zoom);
    this.uiCam?.setSize(width, height);
    this.scoreText.setX(width / 2);
  }

  applySettings() {
    this.controls.setModes(settings.joystick, settings.kick);
    this.difficulty = settings.difficulty;
    this.match.levels.blue = settings.difficulty;
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
    this.match.humanInput.x = this.controls.dirX;
    this.match.humanInput.y = this.controls.dirY;
    this.match.humanInput.kick = this.controls.kick;
    this.match.step();
  }

  // el humano pidió el pase: destello en su anillo
  onPassRequest() {
    const ring = this.human.ring;
    this.tweens.add({ targets: ring, scale: { from: 1.9, to: 1 }, duration: 260, ease: 'Quad.Out' });
    beep(C.SOUND_KICK * 1.5, 0.04);
  }

  // solo para pruebas: fija la dificultad de cada equipo
  setTeamLevels(red, blue) {
    this.match.levels = { red: red || 'mate', blue: blue || this.difficulty };
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

  drawDebug() {
    const g = this.dbgGfx;
    g.clear();
    const brain = this.match.brains.blue;
    if (!brain.P || !brain.ball) return;
    // mapa de calor de los puntos de apoyo evaluados (verde = mejor)
    const spots = brain.debugSpots;
    if (spots && spots.length) {
      const ss = spots.map((c) => c.s);
      const lo = Math.min(...ss), hi = Math.max(...ss);
      for (const c of spots) {
        const t = (c.s - lo) / Math.max(1e-6, hi - lo);
        g.fillStyle(Phaser.Display.Color.GetColor(255 * (1 - t), 255 * t, 40), 0.55);
        g.fillCircle(c.x, c.y, 5);
      }
    }
    // último hombre: punto de sombra en la bisectriz balón-portería y zona en la que sale
    const ogx = -brain.attack * C.FIELD_W;
    g.lineStyle(1, 0x00ffff, 0.6);
    g.strokeCircle(ogx, 0, brain.sweep());
    const K = brain.shadowSpot(brain.ball);
    g.lineStyle(1, 0xffff00, 0.8);
    g.lineBetween(brain.ball.x, brain.ball.y, K.x, K.y);
    g.fillStyle(0xffff00, 1);
    g.fillCircle(K.x, K.y, 4);
    // rol de cada jugador IA
    // puesto en la rotación (1.º / 2.º / 3.º) y tarea de cada jugador
    this.players.forEach((p, i) => {
      const rot = this.match.brains[p.team].rot || {};
      const n = p === rot.first ? '1º' : p === rot.second ? '2º' : p === rot.third ? '3º' : '';
      const t = this.dbgTexts[i];
      t.setPosition(p.gfx.x, p.gfx.y - C.PLAYER_RADIUS - 2).setText(p.human ? `tú ${n}` : `${n} ${p.job || ''}`);
    });
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
    if (this.dbgGfx) this.drawDebug();
    if (this.fpsText) {
      const b = this.ball;
      this.fpsText.setText(`FPS ${this.game.loop.actualFps.toFixed(0)}  v ${Math.hypot(b.vx, b.vy).toFixed(2)}  ${this.match.state}`);
    }
  }
}
