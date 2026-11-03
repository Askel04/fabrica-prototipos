import Phaser from 'phaser';
import { CONFIG as C } from '../config.js';
import { beep } from '../utils/sound.js';
import { TouchControls } from '../input.js';
import { settings } from '../settings.js';
import { Match, DT_MS } from '../sim/match.js';
import { MODES } from '../stadium.js';
import * as St from '../stadium.js';
import { kitById, rivalKit, pickNumbers, clampNumber, hex } from '../kits.js';
import { encodeSnap, decodeSnap } from '../net/session.js';
import { DRILLS, DrillRun } from '../drills/drills.js';
import { SKILLSETS } from '../drills/skillsets.js';

const SNAP_EVERY = 2; // el anfitrión publica una instantánea cada 2 ticks (30/s)
const INTERP_DELAY = 5; // el cliente dibuja ~5 ticks (83 ms) por detrás de la última instantánea

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  // data.net: sesión online. Anfitrión = simula y publica; cliente = solo dibuja lo que recibe.
  // data.drill: visor de ejercicios de la IA (fase 0): la IA repite un ejercicio en bucle.
  init(data) {
    this.net = data?.net || null;
    this.drillName = data?.drill || null;
    this.role = this.drillName ? 'drill' : !this.net ? 'solo' : this.net.isHost ? 'host' : 'client';
  }

  create() {
    this.debug = C.DEBUG || new URLSearchParams(location.search).has('debug');

    // la simulación (física, reglas e IA) vive en Match; la escena solo dibuja y lee los controles
    if (this.drillName) {
      const skill = new URLSearchParams(location.search).get('skill') || 'motor'; // ?skill=actual: la técnica antigua
      this.drillRun = new DrillRun(this.drillName, SKILLSETS[skill] || SKILLSETS.actual, Date.now() % 100000);
      this.match = this.drillRun.m;
    } else if (this.net) {
      const L = (this.lobby = this.net.currentLobby());
      this.gameId = L.game;
      this.match = new Match({
        seats: L.seats.map(([key, team, name]) => ({ key, team, name })),
        bots: L.bots, levels: { red: L.diff, blue: L.diff }, localKey: this.net.me, ...MODES[L.mode], stadium: L.stadium,
      });
    } else {
      const mode = MODES[settings.mode] || MODES['3v3'];
      this.match = new Match({ humanTeam: 'red', levels: { red: 'mate', blue: settings.difficulty }, ...mode, stadium: settings.stadium });
    }
    this.seq = { kick: 0, kicker: 0, post: 0 }; // contadores de eventos para los clientes
    this.snaps = [];
    this.lastSent = null;
    this.world = this.match.world;
    this.ball = this.match.ball;
    this.players = this.match.players;
    this.score = this.match.score;
    this.acc = 0;
    this.lastPostSound = 0;
    this.match.events = {
      kick: (p) => {
        this.seq.kick++;
        this.seq.kicker = p.id;
        this.onKick(p);
      },
      goal: (scorer) => this.onGoal(scorer),
      post: () => {
        if (this.match.tick - this.lastPostSound > 10 && Math.hypot(this.ball.vx, this.ball.vy) > 1.5) {
          this.lastPostSound = this.match.tick;
          this.seq.post++;
          this.onPost();
        }
      },
      passRequest: (h) => this.onPassRequest(h),
    };

    this.setupKits();
    this.drawField();
    this.ballGfx = this.add.circle(0, 0, C.BALL_RADIUS, C.COLOR_BALL).setStrokeStyle(C.BORDER_WIDTH, C.COLOR_BORDER).setDepth(11);
    for (const p of this.players) {
      const kit = this.kits[p.team];
      p.color = kit.body;
      p.gfx = this.add.circle(0, 0, C.PLAYER_RADIUS, p.color).setStrokeStyle(C.BORDER_WIDTH, C.COLOR_BORDER).setDepth(10);
      p.numText = this.add.text(0, 0, String(p.number), {
        fontFamily: 'sans-serif', fontSize: '15px', fontStyle: 'bold', color: hex(kit.num),
      }).setOrigin(0.5, 0.55).setDepth(10.5);
      if (p.parked) {
        p.gfx.setVisible(false);
        p.numText.setVisible(false);
      }
      if (this.net && p.human) {
        p.nameText = this.add.text(0, 0, p.name, {
          fontFamily: 'sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 1).setDepth(12);
      }
      if (p === this.match.human) {
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
    this.controls = new TouchControls(this, (p) => this.menuOpen || !!this.drillRun || this.inPauseButton(p));
    if (this.drillRun) this.createDrillHud();
    this.applySettings();
    // cámara de interfaz sin zoom (marcador, pausa, controles); la principal solo ve el campo
    const ui = [this.scoreText, this.fpsText, this.pauseBtn, this.controls.gfx, this.drillText].filter(Boolean);
    this.uiCam = this.cameras.add(0, 0, this.scale.gameSize.width, this.scale.gameSize.height);
    this.uiCam.ignore(this.children.list.filter((o) => !ui.includes(o)));
    this.cameras.main.ignore(ui);
    const onResume = () => this.applySettings();
    const onResize = () => this.layout();
    this.events.on('resume', onResume);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.events.off('resume', onResume);
      this.scale.off('resize', onResize);
    });
    this.layout();
    this.input.once('pointerdown', () => {
      try {
        if (!this.scale.isFullscreen) this.scale.startFullscreen();
        screen.orientation?.lock?.('landscape').catch(() => {});
      } catch { /* sin pantalla completa */ }
    });

    window.__game = this; // para pruebas y depuración
  }

  // camisetas (solo dibujo) y dorsales de cada jugador
  setupKits() {
    let kits, nums;
    if (this.net) {
      const L = this.lobby;
      kits = L.kits;
      nums = L.nums;
    } else if (this.drillRun) {
      kits = ['rojo', 'azul'];
    } else {
      kits = [settings.kit, rivalKit(settings.kit)];
    }
    this.kits = { red: kitById(kits[0]), blue: kitById(kits[1]) };
    for (const team of ['red', 'blue']) {
      const members = this.players.filter((p) => p.team === team);
      const given = nums?.[team];
      const wanted = members.map((p, i) => (given?.[i] != null ? given[i] : p === this.match.human ? clampNumber(settings.number) : null));
      pickNumbers(wanted).forEach((n, i) => { members[i].number = n; });
    }
  }

  // Coloca cámara y HUD según el tamaño visible (EXPAND cambia el ancho/alto del lienzo).
  layout() {
    const { width, height } = this.scale.gameSize;
    if (this.drillRun) {
      // ejercicios: el estadio entero
      const zoom = Math.min(1, width / (2 * C.OUTER_W + 20), height / (2 * C.OUTER_H + 40));
      this.cameras.main.setZoom(zoom);
      this.cameras.main.centerOn(0, -C.VIEW_OFFSET_Y / zoom);
    } else {
      // partido: zoom fijo (jugadores del mismo tamaño que en el campo clásico) y la cámara sigue al balón
      this.cameras.main.setZoom((height / C.HEIGHT) * (this.match.teamSize >= 5 ? C.CAM_ZOOM_5 : C.CAM_ZOOM_3));
      this.followCamera(true);
    }
    this.uiCam?.setSize(width, height);
    this.scoreText.setX(width / 2);
    this.drillText?.setPosition(width / 2, height - 8);
  }

  applySettings() {
    this.controls.setModes(settings.joystick, settings.kick);
    if (this.net || this.drillRun) return;
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
    if (this.net) {
      // online: el partido sigue (para los demás y para ti)
      this.menuOpen = true;
      this.scene.launch('Menu', { online: true, host: this.role === 'host' });
      return;
    }
    this.scene.pause();
    this.scene.launch('Menu');
  }

  closeMenu() {
    this.menuOpen = false;
    this.applySettings();
  }

  // salir: solo → menú principal; anfitrión → todos a la sala; cliente → deja la sala
  quit(notice = '') {
    if (this.role === 'host') {
      this.net.setLobby({ phase: 'lobby' });
      this.net.room.presence({ s: null });
      this.scene.start('Lobby');
    } else if (this.role === 'client') {
      this.net.leave();
      this.scene.start('Title', { notice });
    } else this.scene.start('Title');
  }

  // entorno del estadio, fuera de la zona de juego (formas, sin arte)
  drawSurroundings(kind) {
    const g = this.add.graphics().setDepth(-1);
    const OW = C.OUTER_W, OH = C.OUTER_H;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (kind === 'wall') {
      // muro de hormigón con juntas
      const t = 26;
      g.fillStyle(0x9a9a92, 1);
      g.fillRect(-OW - t, -OH - t, 2 * (OW + t), 2 * (OH + t));
      g.lineStyle(1, 0x6f6f68, 1);
      for (let x = -OW - t; x < OW + t; x += 48) {
        g.lineBetween(x, -OH - t, x, -OH);
        g.lineBetween(x, OH, x, OH + t);
      }
      for (let y = -OH; y < OH; y += 48) {
        g.lineBetween(-OW - t, y, -OW, y);
        g.lineBetween(OW, y, OW + t, y);
      }
      // grafitis: manchas de color en el muro
      const cols = [0xe56e56, 0x5689e5, 0xf2d43c, 0x8a56d6];
      for (let i = 0; i < 10; i++) {
        g.fillStyle(cols[i % cols.length], 0.7);
        g.fillRoundedRect(-OW + rnd() * 2 * OW, (i % 2 ? OH + 6 : -OH - t + 6), 30 + rnd() * 40, t - 12, 6);
      }
    } else if (kind === 'fence') {
      // valla blanca con postes y dos banquillos
      g.lineStyle(3, 0xf2f2f2, 0.9);
      g.strokeRect(-OW - 10, -OH - 10, 2 * (OW + 10), 2 * (OH + 10));
      g.fillStyle(0xf2f2f2, 1);
      for (let x = -OW - 10; x <= OW + 10; x += 40) {
        g.fillRect(x - 2, -OH - 14, 4, 8);
        g.fillRect(x - 2, OH + 6, 4, 8);
      }
      for (const sx of [-1, 1]) {
        g.fillStyle(0x3c5a8a, 1);
        g.fillRoundedRect(sx * 180 - 60, -OH - 46, 120, 26, 6);
        g.fillStyle(0xffffff, 0.35);
        g.fillRoundedRect(sx * 180 - 54, -OH - 42, 108, 8, 3);
      }
    } else if (kind === 'stands') {
      // vallas de publicidad y gradas con público
      const ad = 14, ads = [0xe56e56, 0xffffff, 0x5689e5, 0xf2d43c];
      let k = 0;
      for (let x = -OW - ad; x < OW + ad; x += 90, k++) {
        g.fillStyle(ads[k % ads.length], 1);
        g.fillRect(x, -OH - ad, 90, ad - 2);
        g.fillStyle(ads[(k + 2) % ads.length], 1);
        g.fillRect(x, OH + 2, 90, ad - 2);
      }
      const gap = ad + 8, depth = 120;
      g.fillStyle(0x44485a, 1);
      g.fillRect(-OW - gap - depth, -OH - gap - depth, 2 * (OW + gap + depth), depth);
      g.fillRect(-OW - gap - depth, OH + gap, 2 * (OW + gap + depth), depth);
      g.fillRect(-OW - gap - depth, -OH - gap, depth, 2 * (OH + gap));
      g.fillRect(OW + gap, -OH - gap, depth, 2 * (OH + gap));
      const crowd = [0xe56e56, 0x5689e5, 0xf2f2f2, 0xf2d43c, 0x2b2b2b, 0xf09a3a, 0x8fd3f4];
      const step = 13;
      for (let x = -OW - gap - depth + 6; x < OW + gap + depth - 6; x += step) {
        for (let y = -OH - gap - depth + 6; y < OH + gap + depth - 6; y += step) {
          const inside = x > -OW - gap && x < OW + gap && y > -OH - gap && y < OH + gap;
          if (inside || rnd() < 0.15) continue;
          g.fillStyle(crowd[Math.floor(rnd() * crowd.length)], 1);
          g.fillRect(x, y, 8, 8);
        }
      }
    }
  }

  drawField() {
    const g = this.add.graphics().setDepth(0);
    const S = St.stadium;
    const W = C.FIELD_W, H = C.FIELD_H, G = C.GOAL_HALF, D = C.GOAL_DEPTH, OW = C.OUTER_W, OH = C.OUTER_H;
    this.add.rectangle(0, 0, 6000, 4000, S.outside).setDepth(-2); // fondo de sobra para cualquier proporción de pantalla
    if (S.deco) this.drawSurroundings(S.deco);
    g.fillStyle(S.grass, 1);
    g.fillRect(-OW, -OH, OW * 2, OH * 2);
    // franjas (o cuadros) de césped
    if (S.stripes) {
      g.fillStyle(0x000000, S.stripes);
      const n = 8, sw = (2 * OW) / n, rows = S.checks ? 6 : 1, sh = (2 * OH) / rows;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < rows; j++) if ((i + j) % 2 === 0) g.fillRect(-OW + i * sw, -OH + j * sh, sw, sh);
      }
    }
    if (S.deco === 'wall') {
      // césped gastado: calvas de tierra delante de las porterías y en el centro
      g.fillStyle(0x8a7a52, 0.45);
      for (const sx of [-1, 1]) g.fillEllipse(sx * (W - 40), 0, 90, G * 1.6);
      g.fillEllipse(0, 0, 70, 50);
    }
    g.lineStyle(3, S.lines, 1);
    g.strokeRect(-W, -H, W * 2, H * 2);
    g.lineBetween(0, -H, 0, H);
    g.strokeCircle(0, 0, C.CENTER_RADIUS);
    g.fillStyle(S.lines, 1);
    g.fillCircle(0, 0, 3);
    if (S.deco) {
      // áreas (solo dibujo)
      for (const sx of [-1, 1]) {
        const aw = W * 0.18, ah = G * 2.1;
        g.strokeRect(sx > 0 ? W - aw : -W, -ah, aw, ah * 2);
        g.fillCircle(sx * (W - aw * 0.75), 0, 3);
      }
    }
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
    if (this.role === 'client') return this.clientUpdate(time, delta);
    if (this.role === 'host') this.hostReadPeers();
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
    if (this.drillRun) {
      const res = this.drillRun.step();
      if (res) this.onDrillResult(res);
      return;
    }
    this.match.humanInput.x = this.controls.dirX;
    this.match.humanInput.y = this.controls.dirY;
    this.match.humanInput.kick = this.controls.kick;
    if (this.role === 'host') {
      for (const p of this.match.humans) {
        if (p.key === this.net.me) continue;
        const inp = this.net.inputOf(p.key);
        if (inp) this.match.setInput(p.key, inp);
      }
    }
    this.match.step();
    if (this.role === 'host' && this.match.tick % SNAP_EVERY === 0) this.net.publishSnap(encodeSnap(this.match, this.seq));
  }

  // ---------------- visor de ejercicios ----------------
  createDrillHud() {
    const d = DRILLS[this.drillName];
    this.drillGfx = this.add.graphics().setDepth(8);
    this.drillText = this.add.text(0, 0, '', {
      fontFamily: 'sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4,
      align: 'center', wordWrap: { width: 760 },
    }).setOrigin(0.5, 1).setDepth(50).setScrollFactor(0);
    this.drillGoal = d.goal;
    this.updateDrillHud(null);
    // tocar (fuera del botón de pausa) pasa al siguiente ejercicio
    this.input.on('pointerup', (p) => {
      if (this.menuOpen || this.inPauseButton(p)) return;
      const names = Object.keys(DRILLS);
      this.scene.restart({ drill: names[(names.indexOf(this.drillName) + 1) % names.length] });
    });
  }

  updateDrillHud(last) {
    const rs = this.drillRun.results;
    const ok = rs.filter((r) => r.ok).length;
    const d = DRILLS[this.drillName];
    this.scoreText.setText(`${d.label}  ·  ${ok}/${rs.length} bien`);
    const lastTxt = last ? `Último: ${last.ok ? 'BIEN' : `MAL (${last.why || 'lento'})`}${last.time !== undefined ? ` · ${last.time.toFixed(2)} s` : ''}${last.release !== undefined ? ` · suelta en ${last.release.toFixed(2)} s` : ''}\n` : '';
    this.drillText.setText(`${lastTxt}${this.drillGoal}\nToca la pantalla para el siguiente ejercicio`);
  }

  onDrillResult(res) {
    this.updateDrillHud(res);
    this.cameras.main.flash(120, res.ok ? 80 : 160, res.ok ? 160 : 40, 40);
  }

  drawDrill() {
    const g = this.drillGfx;
    const ctx = this.drillRun.ctx;
    g.clear();
    const cross = (x, y, c) => {
      g.lineStyle(3, c, 0.9);
      g.lineBetween(x - 8, y - 8, x + 8, y + 8);
      g.lineBetween(x - 8, y + 8, x + 8, y - 8);
    };
    if (ctx.route) ctx.route.forEach((w, i) => cross(w.x, w.y, i < ctx.wp ? 0x88ff88 : 0xffff00));
    if (ctx.aimPt) cross(ctx.aimPt.x, ctx.aimPt.y, 0xffff00);
    if (ctx.target) cross(ctx.target.x, ctx.target.y, 0xffff00);
    // solo se ven los actores que el ejercicio ha colocado en el campo
    for (const p of this.drillRun.actors) p.gfx.setVisible(Math.abs(p.disc.y) < C.FIELD_H + 20);
    // el que hace el ejercicio, marcado con un anillo
    g.lineStyle(2, 0xffffff, 0.8);
    g.strokeCircle(ctx.R.disc.x, ctx.R.disc.y, C.PLAYER_RADIUS + 5);
  }

  // ---------------- online ----------------
  // anfitrión: quien se va de la sala deja su puesto a un bot (o quieto, si se juega sin bots)
  hostReadPeers() {
    const here = new Set(this.net.peers().map((p) => p.peer));
    for (const p of [...this.match.humans]) {
      if (p.key === this.net.me || here.has(p.key)) continue;
      if (this.lobby.bots) {
        this.match.makeBot(p);
        p.nameText?.setText('bot');
      } else this.match.setInput(p.key, { x: 0, y: 0, kick: false });
    }
  }

  // cliente: manda su mando, recibe instantáneas del anfitrión y dibuja interpolando
  clientUpdate(time, delta) {
    const net = this.net;
    const host = net.hostPeer();
    if (!host) {
      this.hostMissingSince ??= time;
      if (time - this.hostMissingSince > 4000) this.quit('El anfitrión se ha ido.');
    } else this.hostMissingSince = null;
    const L = net.currentLobby();
    if (L && (L.phase !== 'play' || L.game !== this.gameId)) {
      this.scene.start(L.phase === 'play' ? 'Game' : 'Lobby', { net });
      return;
    }

    // mando: el chute se mantiene al menos 120 ms para que el anfitrión no se lo pierda
    if (this.match.human) {
      if (this.controls.kick) this.kickUntil = time + 120;
      const kick = this.controls.kick || time < (this.kickUntil || 0);
      const r = (v) => Math.round(v * 100) / 100;
      const inp = [r(this.controls.dirX), r(this.controls.dirY), kick ? 1 : 0];
      if (!this.lastSent || inp.some((v, i) => v !== this.lastSent[i])) {
        net.sendInput(...inp);
        this.lastSent = inp;
      }
      this.match.human.input.kick = kick;
    }

    // instantáneas nuevas
    const raw = host?.presence.s;
    if (raw && raw !== this.lastRaw) {
      this.lastRaw = raw;
      const snap = decodeSnap(raw, this.players.length);
      const last = this.snaps[this.snaps.length - 1];
      if (snap && (!last || snap.tick > last.tick)) {
        this.applyEvents(last, snap);
        this.snaps.push(snap);
        if (this.snaps.length > 30) this.snaps.shift();
        if (this.renderTick === undefined || Math.abs(snap.tick - INTERP_DELAY - this.renderTick) > 40) this.renderTick = snap.tick - INTERP_DELAY;
      }
    }
    if (!this.snaps.length) return this.render(1);
    // reloj de dibujo: avanza con el tiempo local y se corrige poco a poco hacia la última instantánea
    const latest = this.snaps[this.snaps.length - 1].tick;
    this.renderTick += Math.min(delta, 250) / DT_MS;
    this.renderTick += (latest - INTERP_DELAY - this.renderTick) * 0.05;
    const t = Math.min(this.renderTick, latest);
    let i = this.snaps.findIndex((s) => s.tick >= t);
    if (i <= 0) i = Math.max(0, i) || 0;
    const b = this.snaps[i], a = this.snaps[Math.max(0, i - 1)];
    const k = b.tick > a.tick ? Math.max(0, Math.min(1, (t - a.tick) / (b.tick - a.tick))) : 1;
    const set = (d, A, B) => {
      d.x = d.px = A.x + (B.x - A.x) * k;
      d.y = d.py = A.y + (B.y - A.y) * k;
    };
    set(this.ball, a.ball, b.ball);
    this.players.forEach((p, j) => {
      set(p.disc, a.players[j], b.players[j]);
      if (p !== this.match.human) p.input.kick = b.players[j].kick;
    });
    this.render(1);
  }

  // efectos (sonido, vibración, marcador) a partir de los contadores de la instantánea
  applyEvents(prev, snap) {
    const m = this.match;
    m.state = snap.state;
    if (!prev) {
      Object.assign(this.score, snap.score);
      this.updateScore();
      return;
    }
    if (snap.kick !== prev.kick && this.players[snap.kicker]) this.onKick(this.players[snap.kicker]);
    if (snap.post !== prev.post) this.onPost();
    for (const team of ['red', 'blue']) {
      if (snap.score[team] > this.score[team]) {
        Object.assign(this.score, snap.score);
        this.onGoal(team);
      }
    }
    if (snap.score.red !== this.score.red || snap.score.blue !== this.score.blue) {
      Object.assign(this.score, snap.score);
      this.updateScore();
    }
  }

  onPost() {
    beep(C.SOUND_POST, C.SOUND_DURATION * 2);
  }

  // el humano pidió el pase: destello en su anillo
  onPassRequest(h) {
    if (h !== this.human) return;
    const ring = h.ring;
    this.tweens.add({ targets: ring, scale: { from: 1.9, to: 1 }, duration: 260, ease: 'Quad.Out' });
    beep(C.SOUND_KICK * 1.5, 0.04);
  }

  // solo para pruebas: fija la dificultad de cada equipo
  setTeamLevels(red, blue) {
    this.match.levels = { red: red || 'mate', blue: blue || this.difficulty };
  }

  onKick(p) {
    const mine = p === this.match.human;
    beep(C.SOUND_KICK + (mine ? 0 : -120), C.SOUND_DURATION);
    if (mine) {
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
    const color = hex(this.kits[scorer].body);
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
      const slot = p.slotName && this.match.brains[p.team].zKind ? `${p.slotName} ` : '';
      t.setPosition(p.gfx.x, p.gfx.y - C.PLAYER_RADIUS - 2).setText(p.human ? `tú ${slot}${n}` : `${slot}${n} ${p.job || ''}`);
    });
    // 5v5: punto de la formación de cada jugador del equipo azul
    if (brain.zKind) {
      g.lineStyle(1, 0xffffff, 0.5);
      for (const p of brain.players) {
        if (!p.slotName) continue;
        const [sx, sy] = brain.slotPointOf(p);
        g.strokeCircle(sx, sy, 6);
        g.lineBetween(p.disc.x, p.disc.y, sx, sy);
      }
    }
  }

  updateScore() {
    if (this.drillRun) return;
    const n = (t) => this.kits[t].name.toUpperCase();
    this.scoreText.setText(`${n('red')} ${this.score.red} - ${this.score.blue} ${n('blue')}`);
  }

  // cámara: va hacia el balón (algo adelantada) sin salirse del estadio; en el saque, al centro
  followCamera(snap = false) {
    const cam = this.cameras.main, z = cam.zoom;
    const { width, height } = this.scale.gameSize;
    const b = this.ball, kickoff = this.match.state === 'kickoff';
    let tx = kickoff ? 0 : b.x + (b.vx || 0) * C.CAM_LEAD, ty = kickoff ? 0 : b.y + (b.vy || 0) * C.CAM_LEAD;
    const off = -C.VIEW_OFFSET_Y / z; // sitio para el marcador
    const lim = (t, half, outer) => {
      const m = outer + C.CAM_MARGIN - half;
      return m <= 0 ? 0 : Math.max(-m, Math.min(m, t));
    };
    tx = lim(tx, width / (2 * z), C.OUTER_W);
    ty = lim(ty, height / (2 * z), C.OUTER_H + C.VIEW_OFFSET_Y / z) + off;
    if (snap || this.camX === undefined) [this.camX, this.camY] = [tx, ty];
    else {
      this.camX += (tx - this.camX) * C.CAM_LERP;
      this.camY += (ty - this.camY) * C.CAM_LERP;
    }
    cam.centerOn(this.camX, this.camY);
  }

  render(alpha) {
    const lerp = (d, o) => o.setPosition(d.px + (d.x - d.px) * alpha, d.py + (d.y - d.py) * alpha);
    lerp(this.ball, this.ballGfx);
    for (const p of this.players) {
      lerp(p.disc, p.gfx);
      p.numText.setPosition(p.gfx.x, p.gfx.y);
    }
    if (!this.drillRun) this.followCamera();
    for (const p of this.players) p.nameText?.setPosition(p.gfx.x, p.gfx.y - C.PLAYER_RADIUS - 3);
    const h = this.human;
    h?.ring.setPosition(h.gfx.x, h.gfx.y).setAlpha(h.input.kick ? C.RING_ALPHA_KICK : C.RING_ALPHA_IDLE);
    this.controls.draw();
    if (this.dbgGfx && this.role !== 'client' && !this.drillRun) this.drawDebug();
    if (this.drillRun) this.drawDrill();
    if (this.fpsText) {
      const b = this.ball;
      this.fpsText.setText(`FPS ${this.game.loop.actualFps.toFixed(0)}  v ${Math.hypot(b.vx, b.vy).toFixed(2)}  ${this.match.state}`);
    }
  }
}
