// Escena de partido: bola con física, IA rival, pausa táctica y fase de impacto en cámara lenta.
import * as THREE from 'three';
import { CONFIG as C, META } from '../config.js';
import { simulate, sampleAt } from '../physics.js';
import { judge, findContact } from '../rules.js';
import { buildCourt } from '../court.js';
import { Player, swingDur, SWING_HIT_U } from '../player.js';
import { analyzeStroke } from '../stroke.js';
import { classify, buildShot } from '../shots.js';
import { moveTeam, dodge, chaseExit } from '../ai.js';
import { VolleyMode } from '../modes/VolleyMode.js';
import { Opportunities } from '../modes/Opportunities.js';
import { hitSound, bounceSound, glassSound, netSound, whiffSound, pointSound, whooshSound } from '../utils/sound.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const vibrate = (p) => navigator.vibrate?.(p);
const DEG = Math.PI / 180;
const FAMILY_LABEL = {
  plano: 'Plano', liftado: 'Liftado', cortado: 'Cortado', globo: 'Globo', volea: 'Volea',
  bandeja: 'Bandeja', vibora: 'Víbora', rulo: 'Rulo', remate: 'Remate', saque: 'Saque',
};

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}
function randDisk(r) {
  const a = Math.random() * Math.PI * 2;
  const d = Math.sqrt(Math.random()) * r;
  return { x: Math.cos(a) * d, z: Math.sin(a) * d };
}

export class MatchScene {
  constructor(app, params = {}) {
    this.app = app;
    this.params = params;
    this.ai = { ...C.AI, ...(params.ai || {}) };
    this.stats = { power: 0, precision: 0, speed: 0, ...(params.stats || {}) };

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(C.BG_COLOR);
    scene.fog = new THREE.Fog(C.BG_COLOR, 40, 90);
    this.camera = new THREE.PerspectiveCamera(C.CAM_FOV, C.ASPECT, 0.1, 200);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x50608a, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(6, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 40 });
    sun.shadow.bias = -0.0008;
    scene.add(sun);

    this.court = buildCourt(scene);

    const T = C.COLORS.team;
    const R = params.rivalKit
      ? { ...C.COLORS.rival, shirt: params.rivalKit[0], shorts: params.rivalKit[1] }
      : C.COLORS.rival;
    this.team = [
      new Player({ shirt: T.shirt, shorts: T.shorts, hair: T.hair[0], side: 1 }),
      new Player({ shirt: T.shirt, shorts: T.shorts, hair: T.hair[1], side: 1, hairStyle: 1 }),
    ];
    this.rivals = [
      new Player({ shirt: R.shirt, shorts: R.shorts, hair: R.hair[0], side: -1, hairStyle: 1 }),
      new Player({ shirt: R.shirt, shorts: R.shorts, hair: R.hair[1], side: -1 }),
    ];
    for (const p of [...this.team, ...this.rivals]) scene.add(p.root);
    this.team.forEach((p) => (p.speed = C.PLAYER_SPEED * (1 + this.stats.speed * META.STAT_SPEED)));

    // Bola, sombra y estela
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(C.BALL_VISUAL_R, 16, 12),
      new THREE.MeshLambertMaterial({ color: C.COLORS.ball, emissive: 0x3a4400 })
    );
    this.ball.castShadow = true;
    scene.add(this.ball);
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(C.BALL_VISUAL_R * 1.3, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.blob.rotation.x = -Math.PI / 2;
    scene.add(this.blob);
    this.trail = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        this.ball.geometry,
        new THREE.MeshBasicMaterial({ color: C.COLORS.ball, transparent: true, opacity: 0.5 * (1 - i / 8), depthWrite: false })
      );
      m.scale.setScalar(1 - i / 10);
      scene.add(m);
      this.trail.push(m);
    }
    this.trailPos = [];
    // Haz rojo del remate fuerte: cilindro brillante desde la bola hacia atrás en su trayectoria
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.95, depthWrite: false }));
    const glow = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.35, depthWrite: false }));
    glow.scale.set(2.4, 1, 2.4);
    this.beam.add(glow);
    this.beam.visible = false;
    scene.add(this.beam);
    this.beamUp = new THREE.Vector3(0, 1, 0);

    // Flecha de dirección y fuerza (apunta a +z; se gira con rotation.y = rumbo)
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide });
    this.arrow = new THREE.Group();
    this.arrowShaft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 1), this.arrowMat);
    const head = new THREE.Shape();
    head.moveTo(-0.6, 0);
    head.lineTo(0.6, 0);
    head.lineTo(0, 0.9);
    head.closePath();
    this.arrowHead = new THREE.Mesh(new THREE.ShapeGeometry(head), this.arrowMat);
    this.arrowHead.rotation.x = Math.PI / 2;
    this.arrow.add(this.arrowShaft, this.arrowHead);
    this.arrow.visible = false;
    scene.add(this.arrow);
    this.yaw = null;
    this.power = 0.6;

    // Textura de la bola con costura, para leer el efecto
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 64;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#d8f23a';
    g2.fillRect(0, 0, 128, 64);
    g2.strokeStyle = '#ffffff';
    g2.lineWidth = 5;
    g2.beginPath();
    for (let x = 0; x <= 128; x += 2) {
      const y = 32 + Math.sin((x / 128) * Math.PI * 4) * 16;
      x ? g2.lineTo(x, y) : g2.moveTo(x, y);
    }
    g2.stroke();
    this.ball.material.map = new THREE.CanvasTexture(cv);
    this.ball.material.color.setHex(0xffffff);
    this.ball.material.needsUpdate = true;
    this.ballSpin = 0;

    // Partículas
    this.parts = [];
    const pg = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.visible = false;
      scene.add(m);
      this.parts.push({ m, v: new THREE.Vector3(), life: 0 });
    }

    this.raycaster = new THREE.Raycaster();
    this.tmp = { x: 0, y: 0, z: 0 };
    this.v3 = new THREE.Vector3();

    // Estado
    this.gameTime = 0;
    this.timeScale = 1;
    this.phase = 'idle';
    this.shot = null;
    this.aim = { x: 0, z: -7 };
    this.power = 0.4;
    this.match = {
      pts: { 1: 0, [-1]: 0 },
      games: { 1: 0, [-1]: 0 },
      serveTeam: C.FIRST_SERVE,
      rot: { 1: 0, [-1]: 0 }, // quién saca dentro de cada pareja
      totalPts: { 1: 0, [-1]: 0 },
      over: false,
    };
    this.cam = { pos: new THREE.Vector3(...C.CAM_MAIN.pos), look: new THREE.Vector3(...C.CAM_MAIN.look) };
    this.camFrom = null;
    this.camTo = null;
    this.camT = 1;
    this.camDur = 1;
    this.shake = 0;
    this.hitStop = 0;
    this.contactErrs = []; // distancia pala-bola en cada contacto (pruebas)
    this.fovKick = 0;
    this.squash = 0;
    this.follow = new THREE.Vector3();
    this.timers = [];
  }

  enter() {
    const ui = this.app.ui;
    this.score = el('div', 'score', ui);
    this.layer = el('div', '', ui); // UI de fase
    this.onDown = (e) => this.pointer('down', e);
    this.onMove = (e) => this.pointer('move', e);
    this.onUp = (e) => this.pointer('up', e);
    ui.addEventListener('pointerdown', this.onDown);
    ui.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    this.renderScore();
    this.volley = new VolleyMode(this);
    // ?volley abre directamente la volea defensiva (pruebas)
    const qs = new URLSearchParams(location.search);
    if (qs.has('opp') && !this.params.opp) {
      const n = Number(qs.get('opp')) || 4;
      this.params.opp = { n, need: Math.min(3, n), only: qs.get('sit')?.split(',') };
    }
    if (this.params.opp) {
      // Partido por oportunidades: rival difícil de batir cuando el punto sigue
      this.ai = { ...this.ai, ...C.OPP.AI };
      this.opp = new Opportunities(this, this.params.opp);
      this.opp.start();
    } else if (this.params.volley || qs.has('volley')) this.startVolleyDefense();
    else this.startPoint();
  }

  startVolleyDefense() {
    this.volley.start();
  }

  exit() {
    const ui = this.app.ui;
    ui.removeEventListener('pointerdown', this.onDown);
    ui.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  }

  // ---------- utilidades ----------
  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  toast(text, small = '', color = '#fff') {
    const t = el('div', 'toast', this.app.ui, `${text}${small ? `<small>${small}</small>` : ''}`);
    t.style.color = color;
    setTimeout(() => t.remove(), 1200);
  }

  flash() {
    const f = el('div', 'flash', this.app.ui);
    setTimeout(() => f.remove(), 300);
  }

  burst(pos, color, n = 14, speed = 3) {
    let k = 0;
    for (const p of this.parts) {
      if (p.life > 0) continue;
      p.life = rand(0.3, 0.6);
      p.m.visible = true;
      p.m.material.color.setHex(color);
      p.m.position.set(pos.x, pos.y, pos.z);
      p.v.set(rand(-1, 1), rand(-0.2, 1.2), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.5, 1));
      if (++k >= n) break;
    }
  }

  blendCamera(to, dur) {
    this.camFrom = { pos: this.cam.pos.clone(), look: this.cam.look.clone() };
    this.camTo = { pos: new THREE.Vector3(...to.pos), look: new THREE.Vector3(...to.look) };
    this.camT = 0;
    this.camDur = dur;
  }

  toScreen(p) {
    this.v3.set(p.x, p.y, p.z).project(this.camera);
    return { x: (this.v3.x * 0.5 + 0.5) * this.app.width, y: (-this.v3.y * 0.5 + 0.5) * this.app.height };
  }

  localXY(e) {
    const r = this.app.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  ptsLabel(side) {
    const m = this.match;
    return ['0', '15', '30', '40'][Math.min(3, m.pts[side])];
  }

  renderScore() {
    const m = this.match;
    const serve = (s) => (m.serveTeam === s ? '<i class="sv"></i>' : '<i class="sv off"></i>');
    const name = this.params.names || { 1: 'TÚ', [-1]: 'RIVAL' };
    const golden = m.pts[1] === 3 && m.pts[-1] === 3;
    this.score.innerHTML = `<table>
      <tr class="g"><td>${serve(1)}${name[1]}</td><td class="gm">${m.games[1]}</td><td class="pt">${this.ptsLabel(1)}</td></tr>
      <tr class="r"><td>${serve(-1)}${name[-1]}</td><td class="gm">${m.games[-1]}</td><td class="pt">${this.ptsLabel(-1)}</td></tr>
    </table>${golden ? '<div class="gold">PUNTO DE ORO</div>' : ''}${this.opp ? `<div class="opp">Oportunidades ${this.oppLabel} · necesitas ${this.opp.need}</div>` : ''}`;
  }

  racketPoint(p) {
    // La pala está a la derecha del personaje: +x para el jugador (mira a -z), -x para el rival
    return { x: p.pos.x + 0.55 * p.side, z: p.pos.z };
  }

  /** Animación de golpe según la altura de la bola (la que prepara el jugador antes de saber el efecto). */
  contactAnim(p, pos, serve) {
    if (serve) return 'saque';
    if (pos.y >= C.SMASH_MIN_H) return 'smash';
    if (pos.y >= C.OVERHEAD_MIN_H) return 'bandeja';
    return this.animFor('plano', p, pos);
  }

  /** Coloca al jugador y su pose para que la cara de la pala toque la bola; devuelve la distancia que queda. */
  snapToContact(p, pos, anim, ballR = C.BALL_VISUAL_R) {
    const r = p.reach(pos, anim, ballR);
    p.target = null;
    p.vel = { x: 0, z: 0 };
    p.pos.set(r.body.x, 0, r.body.z);
    p.faceNetNow();
    p.holdContact(anim, r.hit);
    const f = p.racketWorld();
    const err = Math.hypot(f.x - pos.x, f.y - pos.y, f.z - (pos.z + p.side * ballR));
    this.contactErrs.push(+err.toFixed(3));
    p.release(); // el golpe sigue con la terminación
    return err;
  }

  // ---------- flujo del punto ----------
  /** Deja la escena lista para un punto nuevo (sin colocar a nadie). */
  resetPoint() {
    this.rally = 0;
    this.lastQ = 0;
    this.shot = null;
    this.layer.innerHTML = '';
    this.arrow.visible = false;
    this.ball.scale.setScalar(1);
    this.trailPos.length = 0;
    this.trail.forEach((m) => (m.visible = false));
    this.beam.visible = false;
    this.timeScale = 1;
    this.blendCamera(C.CAM_MAIN, 0.6);
    const all = [...this.team, ...this.rivals];
    all.forEach((p) => {
      p.target = null;
      p.vel = { x: 0, z: 0 };
      p.celebrate = 0;
      p.lament = 0;
      p.toHit = 0;
      p.watchFor = 0;
      p.watchDelay = 0;
      p.swingT = -1;
      p.faceNetNow();
      p.idlePose();
    });
  }

  startPoint(secondServe = false) {
    if (!secondServe) this.serveTry = 1;
    this.phase = 'serve';
    this.resetPoint();
    this.team[0].pos.set(-C.HOME_X, 0, C.HOME_BACK_Z);
    this.team[1].pos.set(C.HOME_X, 0, C.HOME_BACK_Z);
    this.rivals[0].pos.set(-C.HOME_X, 0, -C.HOME_BACK_Z);
    this.rivals[1].pos.set(C.HOME_X, 0, -C.HOME_BACK_Z);
    // Saque: alterna lado (derecha en puntos pares) y pareja por juego
    const m = this.match;
    const st = m.serveTeam;
    const team = st === 1 ? this.team : this.rivals;
    const even = (m.pts[1] + m.pts[-1]) % 2 === 0;
    const sx = (even ? 1 : -1) * st * C.HOME_X; // derecha del que saca
    const idx = m.rot[st];
    const server = team[idx];
    team[1 - idx].pos.set(-sx, 0, st * 3); // el compañero del que saca, a la red
    server.pos.set(sx - 0.55 * st, 0, st * 9.4);
    const hand = this.racketPoint(server);
    const bz = hand.z - st * 0.3;
    this.ball.position.set(hand.x, 1.0, bz);
    if (st === -1) {
      // El que saca se coloca para que la pala toque la bola en el punto de saque
      const sp = { x: hand.x, y: 0.8, z: bz };
      const r = server.reach(sp, 'saque');
      server.pos.set(r.body.x, 0, r.body.z);
      this.ball.position.set(sp.x, sp.y, sp.z);
      this.after(0.9, () => {
        server.swing('saque', null, r.hit);
        this.after(swingDur('saque') * SWING_HIT_U, () => {
          this.snapToContact(server, sp, 'saque');
          this.aiShot(server, sp, { serve: true });
        });
      });
    } else {
      this.after(0.6, () => this.playerServe(idx, { x: hand.x, y: 1.1, z: bz }));
    }
  }

  /** Arranca una situación clave del partido por oportunidades. */
  playSituation(sit) {
    this.sit = sit;
    if (sit.volley) return this.startVolleyDefense();
    if (sit.serve) {
      this.match.serveTeam = sit.serve;
      return this.startPoint();
    }
    this.phase = 'serve';
    this.serveTry = 1;
    this.resetPoint();
    sit.team.forEach(([x, z], i) => this.team[i].pos.set(x, 0, z));
    sit.rivals.forEach(([x, z], i) => this.rivals[i].pos.set(x, 0, z));
    const h = sit.hit;
    const striker = this.rivals[h.idx];
    this.ball.position.set(h.from.x, h.from.y, h.from.z);
    const anim = C.SHOTS[h.family].anim;
    const r = striker.reach(h.from, anim);
    striker.pos.set(r.body.x, 0, r.body.z);
    this.after(0.8, () => {
      striker.swing(anim, null, r.hit);
      this.after(swingDur(anim) * SWING_HIT_U, () => {
        this.snapToContact(striker, h.from, anim);
        hitSound(0.5);
        this.doHit(striker, { ...h.from }, { ...h.v }, h.spin, 0, h.family, { pick: sit.pick });
      });
    });
  }

  // Tu saque: la bota el que saca y se golpea con la misma mecánica
  playerServe(idx, p) {
    const path = simulate({ p, v: { x: 0, y: 0, z: 0 } }, 3);
    const bounce = path.events.find((e) => e.type === 'ground');
    let t = bounce ? bounce.t + 0.05 : 0.4;
    const q = { x: 0, y: 0, z: 0 };
    let prevY = 0;
    for (; t < path.duration; t += 1 / 120) {
      sampleAt(path, t, q);
      if (q.y < prevY && q.y <= C.SERVE_CONTACT_H) break;
      prevY = q.y;
    }
    const contact = { t, idx, pos: { ...q }, bounced: true, serve: { boxSign: -Math.sign(p.x || 1) } };
    this.shot = {
      path, t0: this.gameTime, hitter: -1, contact, evIdx: 0, kind: 'drive', spin: 0,
      outcome: { t: t + 0.8, winner: -1, reason: 'fallo' },
    };
    this.phase = 'live';
  }

  doHit(player, pos, v, spin, side, kind, opts = {}) {
    const hitter = player.side;
    const path = simulate({ p: pos, v, spin, side });
    const outcome = judge(path, hitter, { serve: opts.serve });
    const recvTeam = hitter === 1 ? this.rivals : this.team;
    const hitTeam = hitter === 1 ? this.team : this.rivals;
    const contact = findContact(
      path, outcome, -hitter,
      recvTeam.map((p) => this.racketPoint(p)),
      { vmax: recvTeam[0].speed, accel: C.PLAYER_ACCEL, reaction: C.REACTION },
      { mustBounce: !!opts.serve, pick: opts.pick },
    );
    this.rally++;
    const power = opts.power ?? 0.5;
    const q = opts.q ?? 1;
    // Remate con buena fuerza y ejecución: haz rojo
    const beam = kind === 'remate' && power >= C.RED_BEAM_POWER && q >= C.RED_BEAM_Q;
    this.shot = { path, t0: this.gameTime, hitter, outcome, contact, evIdx: 0, kind, spin, power, q, beam, recvSide: -hitter };
    if (beam) {
      this.toast('¡REMATE!', '', '#ff5040');
      vibrate([30, 20, 60]);
    }
    this.ballSpin = spin;
    if (contact && hitter === 1) {
      // La IA decide ya su golpe para preparar la animación adecuada
      contact.family = this.aiFamily(this.contactCtx(path, contact.t, contact.pos, false, contact.bounced));
      const rp = this.rivals[contact.idx];
      contact.anim = this.animFor(contact.family, rp, contact.pos);
    }
    if (this.phase === 'serve') this.phase = 'live';
    if (contact && hitter === 1) {
      // La IA puede fallar, sobre todo con bolas rápidas
      const sp = Math.hypot(v.x, v.y, v.z);
      const A = this.ai;
      const miss = A.missChance + (sp > A.fastBall ? A.missChanceFastBall : 0)
        + (this.lastQ > 0.85 ? A.missPerfect : 0) + this.rally * A.missPerRally;
      contact.miss = Math.random() < miss;
    }
    // Los que reciben hacen el split-step al golpear el rival
    recvTeam.forEach((p) => p.splitStep());
    // Quien golpea: tras un globo sube a la red; si ya estaba en la red se queda; si no, al fondo
    moveTeam(hitTeam, kind === 'globo' || Math.abs(player.pos.z) < 6 ? 'net' : 'back', pos.x, 0.1);
    if (contact) {
      // El receptor va a por la bola; su pareja acompaña a la misma altura en el otro lado
      const p = recvTeam[contact.idx];
      // Corre hasta donde la cara de su pala toca la bola
      if (!contact.anim) contact.anim = this.contactAnim(p, contact.pos, false);
      const r = p.reach(contact.pos, contact.anim);
      contact.hit = r.hit;
      p.moveTo(r.body.x, r.body.z, C.REACTION);
      p.toHit = contact.t;
      if (contact.afterWall) {
        // Lectura de pared: se gira hacia el cristal siguiendo la bola y luego se coloca para golpear
        const wall = path.events.find((e) => e.type === 'wall' && Math.sign(e.z) === -hitter && e.t > (outcome.legalBounceT ?? 0));
        if (wall) {
          p.watchDelay = outcome.legalBounceT ?? 0;
          p.watchFor = Math.max(0, Math.min(wall.t + C.ANIM.WALL_WATCH_EXTRA, contact.t - C.ANIM.FACE_NET_BEFORE) - p.watchDelay);
        }
      }
      const mate = recvTeam[1 - contact.idx];
      const deep = Math.abs(contact.pos.z) > 6 || kind === 'globo';
      mate.moveTo(contact.idx === 0 ? C.HOME_X : -C.HOME_X, -hitter * (deep ? C.HOME_BACK_Z : C.NET_Z), C.REACTION);
      dodge(path, recvTeam, -hitter, p);
    } else if (outcome.winner === hitter && (outcome.reason === 'por 3' || outcome.reason === 'por 4')) {
      chaseExit(path, outcome, recvTeam);
    } else {
      dodge(path, recvTeam, -hitter);
    }
  }

  /** Contexto del golpe en el punto de contacto: altura, si botó, cómo llega la bola y distancia a la red. */
  contactCtx(path, t, pos, serve = false, bounced = true) {
    const a = sampleAt(path, Math.max(0, t - 0.02), { x: 0, y: 0, z: 0 });
    const b = sampleAt(path, t + 0.02, { x: 0, y: 0, z: 0 });
    const vx = (b.x - a.x) / 0.04, vy = (b.y - a.y) / 0.04, vz = (b.z - a.z) / 0.04;
    return { h: pos.y, bounced, vyIn: vy, speedIn: Math.hypot(vx, vy, vz), dNet: Math.abs(pos.z), serve };
  }

  /** Animación del golpe; drive pasa a revés si la bola queda en el lado contrario a la pala. */
  animFor(family, player, pos) {
    const anim = C.SHOTS[family].anim;
    if (anim === 'drive' && (pos.x - player.pos.x) * player.side < -0.1) return 'reves';
    return anim;
  }

  /** La IA elige familia según la bola que le llega. */
  aiFamily(ctx) {
    const A = this.ai;
    const r = Math.random();
    if (ctx.h >= C.SMASH_MIN_H && ctx.dNet <= C.SMASH_MAX_DNET) return r < A.smashChance ? 'remate' : r < 0.85 ? 'bandeja' : 'vibora';
    if (ctx.h >= C.OVERHEAD_MIN_H && ctx.vyIn < -C.LOBBED_VY) return r < 0.45 ? 'bandeja' : r < 0.8 ? 'vibora' : 'rulo';
    if (!ctx.bounced && ctx.h >= C.VOLLEY_MIN_H) return 'volea';
    if (r < A.lobChance) return 'globo';
    return ['plano', 'liftado', 'cortado'][Math.floor(Math.random() * 3)];
  }

  aiShot(player, pos, opts = {}) {
    const side = player.side;
    const A = this.ai;
    const s = this.shot;
    const ctx = opts.serve ? { serve: true } : this.contactCtx(s.path, this.gameTime - s.t0, pos);
    const family = opts.serve ? 'saque' : opts.family || this.aiFamily(ctx);
    const f = C.SHOTS[family];
    const nominalSpin = { liftado: 0.7, cortado: -0.7, rulo: 0.8, vibora: -0.9, bandeja: -0.5 }[family] || 0;
    let tx = rand(-3.8, 3.8);
    let tz = -side * 6;
    if (opts.serve) {
      tx = -Math.sign(pos.x || 1) * rand(1.2, 3.6);
      tz = -side * 4.5;
    } else if (family === 'remate' && Math.random() < 0.5) {
      tx = Math.sign(rand(-1, 1)) * rand(3, 4.5); // buscar la salida por 3
    }
    const power = opts.serve ? rand(0.35, 0.6) : family === 'remate' ? rand(0.7, 1) : rand(A.powerMin, A.powerMax);
    const q = opts.serve ? Math.max(A.qMin, 0.75) : rand(A.qMin, A.qMax);
    const yaw = Math.atan2(tx - pos.x, tz - pos.z);
    const sh = buildShot({ p: pos, side, yaw, power, family, stroke: { spin: nominalSpin, angle: f.angle }, q });
    hitSound(power);
    if (family === 'remate') {
      this.shake = C.SHAKE_SMASH * 0.5;
      this.fovKick = 0.5;
    }
    const serve = opts.serve ? { boxSign: -Math.sign(pos.x || 1) } : null;
    this.doHit(player, pos, sh.v, sh.spin, sh.side, family, { serve, power, q });
  }

  endPoint(winner, reason) {
    if (this.phase === 'pointEnd') return;
    this.phase = 'pointEnd';
    if (this.volley?.active) {
      this.after(C.POINT_END_DELAY * 0.9, () => this.volley.finish());
      // Modo de prueba: otra volea defensiva en vez de un punto normal
      if (this.params.volley) {
        this.after(C.POINT_END_DELAY, () => this.startVolleyDefense());
        this.toast(winner === 1 ? '¡PUNTO!' : 'Punto rival', '', winner === 1 ? '#ffe066' : '#ff8a80');
        pointSound(winner === 1);
        this.match.pts[winner]++;
        this.renderScore();
        return;
      }
    }
    this.layer.innerHTML = '';
    // Saque: la primera falta da segundo saque
    if (reason === 'falta' && this.serveTry === 1) {
      this.serveTry = 2;
      this.toast('Falta', 'Segundo saque', '#fff');
      whiffSound();
      this.after(C.POINT_END_DELAY, () => this.startPoint(true));
      return;
    }
    if (reason === 'falta') reason = 'doble falta';
    const win = winner === 1;
    const m = this.match;
    let gameWon = false;
    if (!this.opp) {
      m.pts[winner]++;
      m.totalPts[winner]++;
    }
    // Sin ventaja: a 40-40 punto de oro, el siguiente gana
    if (!this.opp && m.pts[winner] >= 4) {
      gameWon = true;
      m.games[winner]++;
      m.pts[1] = 0;
      m.pts[-1] = 0;
      m.rot[m.serveTeam] ^= 1;
      m.serveTeam = -m.serveTeam;
    }
    this.renderScore();
    const reasons = {
      'doble bote': win ? 'No llegan' : 'No llegaste',
      red: 'A la red',
      'cristal directo': 'Cristal directo',
      fuera: 'Fuera',
      'pared propia': 'Pared propia',
      'por 3': '¡POR 3!',
      'por 4': '¡Por 4!',
      vuelve: 'Vuelve al campo',
      muere: 'Bola muerta',
      fallo: win ? 'Fallo rival' : 'Fallaste',
      'doble falta': 'Doble falta',
      pelotazo: '¡Pelotazo!',
      bloqueo: '¡Bloqueo en la red!',
      'remate pasa': 'Te superó el remate',
    };
    this.toast(win ? '¡PUNTO!' : 'Punto rival', reasons[reason] || reason, win ? '#ffe066' : '#ff8a80');
    pointSound(win);
    if (reason === 'por 3' || reason === 'por 4') {
      // Festejo: confeti en varias tandas, cámara y vibración largas
      const at = this.ball.position.clone();
      for (let k = 0; k < 4; k++) {
        this.after(k * 0.25, () => {
          this.burst(at, 0xffcc33, 14, 7);
          this.burst(at, 0x4fb3ff, 14, 7);
          this.burst(at, 0xff5040, 10, 7);
        });
      }
      this.shake = 0.2;
      this.fovKick = 1;
      vibrate([60, 40, 60, 40, 120]);
      (win ? this.team : this.rivals).forEach((p) => (p.celebrate = 2.4));
    }
    vibrate(win ? [30, 40, 60] : 60);
    this.endGestures(win ? this.team : this.rivals, win ? this.rivals : this.team);
    if (this.opp) {
      this.after(C.POINT_END_DELAY, () => this.opp.resolve(winner));
      return;
    }
    if (gameWon) {
      this.after(0.9, () => this.toast(win ? '¡JUEGO!' : 'Juego rival', `${m.games[1]} - ${m.games[-1]}`, win ? '#ffe066' : '#ff8a80'));
    }
    if (m.games[winner] >= C.GAMES_TO_WIN) {
      m.over = true;
      this.after(C.MATCH_END_DELAY, () => this.endMatch(winner));
      return;
    }
    this.after(C.POINT_END_DELAY + (gameWon ? 0.8 : 0), () => this.startPoint());
  }

  /** Fin de punto: los ganadores lo celebran juntándose; los que pierden se llevan las manos a la cabeza. */
  endGestures(winners, losers) {
    const mx = (winners[0].pos.x + winners[1].pos.x) / 2;
    const mz = (winners[0].pos.z + winners[1].pos.z) / 2;
    winners.forEach((p, i) => {
      p.swingT = -1;
      p.celebrate = Math.max(p.celebrate, 1.4);
      p.moveTo(mx + (i ? 0.4 : -0.4), mz);
    });
    losers.forEach((p) => {
      p.swingT = -1;
      p.lament = C.ANIM.LAMENT_T;
    });
  }

  endMatch(winner, extra = {}) {
    const m = this.match;
    const o = extra.opportunities;
    const result = {
      win: winner === 1,
      games: { ...m.games },
      points: o ? { 1: o.won, [-1]: o.n - o.won } : { ...m.totalPts },
      opportunities: o,
    };
    if (this.params.onEnd) {
      this.params.onEnd(result);
      return;
    }
    this.phase = 'over';
    const L = this.layer;
    L.innerHTML = '';
    el('div', 'hint', L, `${result.win ? '¡VICTORIA!' : 'Derrota'}<small>${m.games[1]} - ${m.games[-1]}</small>`);
    const b = el('button', 'btn', L, 'OTRA PARTIDA');
    Object.assign(b.style, { left: '50%', bottom: 'calc(var(--u) * 20)', transform: 'translateX(-50%)' });
    b.addEventListener('click', () => this.app.go(MatchScene, this.params));
  }

  // ---------- pausa táctica: flecha de dirección y fuerza ----------
  enterTactical() {
    this.phase = 'tactical';
    this.timeScale = 0;
    this.blendCamera(C.CAM_TACTICAL, 0.35);
    vibrate(15);
    const L = this.layer;
    L.innerHTML = '';
    const c = this.shot.contact;
    el('div', 'hint', L, c.serve
      ? 'Saca al cuadro cruzado<small>Arrastra: la flecha marca dirección y fuerza</small>'
      : 'Arrastra para apuntar<small>La flecha marca dirección y fuerza</small>');
    this.arrowLbl = el('div', 'arrow-lbl', L);
    const next = el('button', 'btn', L, 'SIGUIENTE ▶');
    next.dataset.ui = 'next';
    Object.assign(next.style, { left: '50%', bottom: 'calc(var(--u) * 8)', transform: 'translateX(-50%)' });
    next.addEventListener('pointerdown', (e) => e.stopPropagation());
    next.addEventListener('click', () => this.enterImpact());
    // Rumbo inicial: recto al campo rival, o al cuadro de saque cruzado
    const cp = c.pos;
    if (c.serve) {
      this.yaw = Math.atan2(c.serve.boxSign * 2.5 - cp.x, -4.5 - cp.z);
      this.power = 0.5;
    } else {
      this.yaw = Math.PI;
      this.power = 0.6;
    }
    this.arrow.visible = true;
    this.updateArrow();
    // Bola y pala en contacto mientras eliges: el jugador se coloca en la pose de golpe
    const p = this.team[c.idx];
    c.anim = this.contactAnim(p, cp, c.serve);
    const r = p.reach(cp, c.anim);
    p.target = null;
    p.vel = { x: 0, z: 0 };
    this.placeLerp = { p, from: p.pos.clone(), to: new THREE.Vector3(r.body.x, 0, r.body.z), t: 0 };
    p.faceNetNow();
    p.holdContact(c.anim, r.hit);
    this.ball.position.set(cp.x, cp.y, cp.z);
  }

  updateArrow() {
    const cp = this.shot.contact.pos;
    const len = C.ARROW_MIN_LEN + (C.ARROW_MAX_LEN - C.ARROW_MIN_LEN) * this.power;
    this.arrow.position.set(cp.x, 0.04, cp.z);
    this.arrow.rotation.y = this.yaw;
    this.arrowShaft.scale.z = len;
    this.arrowShaft.position.z = len / 2;
    this.arrowHead.position.z = len;
    const col = new THREE.Color(0x4cd964).lerp(new THREE.Color(0xffcc00), Math.min(1, this.power * 1.6));
    if (this.power > 0.62) col.lerp(new THREE.Color(0xff3b30), (this.power - 0.62) / 0.38);
    this.arrowMat.color.copy(col);
    const tip = this.toScreen({ x: cp.x + Math.sin(this.yaw) * (len + 1.2), y: 0, z: cp.z + Math.cos(this.yaw) * (len + 1.2) });
    Object.assign(this.arrowLbl.style, { left: `${tip.x}px`, top: `${tip.y}px` });
    this.arrowLbl.textContent = `${Math.round(this.power * 100)}%`;
  }

  aimFromPointer(xy) {
    const ndc = new THREE.Vector2((xy.x / this.app.width) * 2 - 1, -(xy.y / this.app.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return;
    const cp = this.shot.contact.pos;
    // Rumbo limitado alrededor de "recto hacia el rival"
    let rel = Math.atan2(hit.x - cp.x, hit.z - cp.z) - Math.PI;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    this.yaw = Math.PI + clamp(rel, -C.ARROW_MAX_YAW, C.ARROW_MAX_YAW);
    // Fuerza: distancia en pantalla entre el jugador y el dedo
    const o = this.toScreen({ x: cp.x, y: 0, z: cp.z });
    this.power = clamp(Math.hypot(xy.x - o.x, xy.y - o.y) / (C.ARROW_FULL_FRAC * this.app.height), 0, 1);
    this.updateArrow();
  }

  // ---------- fase de impacto ----------
  enterImpact() {
    this.phase = 'impact';
    this.timeScale = C.SLOWMO;
    this.arrow.visible = false;
    this.court.sideX.visible = false;
    const c = this.shot.contact;
    const cp = c.pos;
    const D = C.SIDE_CAM_DIST;
    const A = C.SIDE_CAM_LOOK_AHEAD;
    this.blendCamera({ pos: [cp.x + D, cp.y + 0.35, cp.z - A], look: [cp.x, cp.y, cp.z - A] }, 0.3);
    this.ball.scale.setScalar(C.IMPACT_BALL_SCALE);
    const L = this.layer;
    L.innerHTML = '';
    el('div', 'vignette', L);
    el('div', 'hint', L, 'Desliza sobre la bola<small>Por el centro: plano · rozando: liftado o cortado</small>');
    this.ghost = el('div', 'ring ghost', L);
    this.ring = el('div', 'ring', L);
    this.approach = el('div', 'ring approach', L);
    this.swipeCv = el('canvas', 'swipe', L);
    this.swipeCv.width = this.app.width;
    this.swipeCv.height = this.app.height;
    this.swipePts = null;
    this.hitDone = false;
    // Hacia dónde queda el campo rival en pantalla (la cámara mira desde +x)
    this.fwd = Math.sign(cp.z || 1);
    // El personaje, quieto en su sitio de contacto (con la bola grande delante), prepara el golpe y espera
    const p = this.team[c.idx];
    this.placeLerp = null;
    const r = p.reach(cp, c.anim, C.BALL_VISUAL_R * C.IMPACT_BALL_SCALE);
    p.pos.set(r.body.x, 0, r.body.z);
    p.faceNetNow();
    p.swing(c.anim, 0.35, r.hit);
    this.impact = { stroke: null, released: false, wait: 0, done: false };
    vibrate(10);
    whooshSound();
  }

  updateImpactUI() {
    const b = this.toScreen(this.ball.position);
    const top = this.toScreen({ x: this.ball.position.x, y: this.ball.position.y + C.BALL_VISUAL_R * C.IMPACT_BALL_SCALE, z: this.ball.position.z });
    const r = Math.max(8, Math.abs(b.y - top.y));
    this.ballScreen = b;
    this.ballR = r;
    const g = this.toScreen(this.shot.contact.pos);
    const t = this.gameTime - this.shot.t0 - this.shot.contact.t;
    const near = Math.abs(t) < C.TIMING_WINDOW * 0.5;
    Object.assign(this.ring.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${2 * r}px`, height: `${2 * r}px` });
    this.ring.style.borderColor = near ? '#4cd964' : '#ffffffaa';
    Object.assign(this.ghost.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${2 * r}px`, height: `${2 * r}px` });
    // Aro de aproximación: se cierra sobre la bola justo en el contacto ideal
    const k = clamp(-t / C.IMPACT_LEAD, 0, 1);
    const ra = r * (1 + (C.RING_APPROACH - 1) * k);
    Object.assign(this.approach.style, {
      left: `${b.x}px`, top: `${b.y}px`, width: `${2 * ra}px`, height: `${2 * ra}px`,
      opacity: t > 0 ? 0 : 1,
    });

    // Estela del dedo
    const ctx = this.swipeCv.getContext('2d');
    ctx.clearRect(0, 0, this.swipeCv.width, this.swipeCv.height);
    if (this.swipePts && this.swipePts.length > 1) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffffcc';
      ctx.lineWidth = this.app.width * 0.02;
      ctx.beginPath();
      this.swipePts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  }

  /** Comprueba el trazo; final = el dedo se ha levantado. */
  checkSwipe(final = false) {
    const pts = this.swipePts;
    if (!pts || pts.length < 2 || this.hitDone) return;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < C.MIN_SWIPE_PX_FRAC * this.app.width) return;
    const c = this.ballScreen;
    const r = this.ballR;
    // El trazo cuenta cuando llega a la altura de la bola (proyección del centro sobre el trazo)
    const along = ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / len;
    if (!final && along > len) return;
    const st = analyzeStroke(a, b, c, r, this.fwd);
    if (st.whiff) {
      whiffSound();
      this.toast('¡Aire!', '', '#ddd');
      this.swipePts = null;
      return;
    }
    this.resolveHit(st);
  }

  /** Guarda el trazo. El golpe sale cuando la bola llega a la pala (si fue pronto) o en el acto (si esperaba). */
  resolveHit(st) {
    this.hitDone = true;
    const tRel = this.gameTime - this.shot.t0 - this.shot.contact.t;
    this.impact.stroke = st;
    this.impact.tErr = tRel < -1e-6 ? tRel : this.impact.wait;
    if (tRel >= -1e-6) this.executeHit();
  }

  executeHit() {
    const st = this.impact.stroke;
    const tErr = this.impact.tErr;
    this.impact.done = true;
    const contact = this.shot.contact;
    const player = this.team[contact.idx];
    const pos = { ...contact.pos };
    this.ball.position.set(pos.x, pos.y, pos.z);
    const timingQ = clamp(1 - Math.abs(tErr) / C.TIMING_WINDOW, 0, 1);
    const contactQ = st.dist <= 1 ? 1 : 1 - ((st.dist - 1) / (C.WHIFF_OFFSET - 1)) * 0.6;
    const q = timingQ * contactQ;
    const ctx = this.contactCtx(this.shot.path, this.gameTime - this.shot.t0, pos, !!contact.serve, contact.bounced);
    const family = classify(ctx, st);
    // Pronto = la bola se va cruzada; tarde = paralela
    const dev = clamp(-tErr / C.TIMING_WINDOW, -1, 1) * C.TIMING_DEV_DEG * DEG;
    const sh = buildShot({
      p: pos, side: 1, yaw: this.yaw, power: this.power, family, stroke: st, q, dev,
      statPower: this.stats.power * META.STAT_POWER, statPrecision: this.stats.precision * META.STAT_PRECISION,
    });
    this.lastQ = q;
    // Fotograma de contacto: la animación de la familia si cabe desde donde está; si no, la que tenía preparada
    const R = C.BALL_VISUAL_R * C.IMPACT_BALL_SCALE;
    let anim = this.animFor(family, player, pos);
    const rr = player.reach(pos, anim, R);
    if (Math.hypot(rr.body.x - player.pos.x, rr.body.z - player.pos.z) > C.ANIM_SWITCH_MAX) anim = contact.anim;
    this.snapToContact(player, pos, anim, R);
    player.release();
    this.doHit(player, pos, sh.v, sh.spin, sh.side, family, { serve: contact.serve, power: this.power, q });
    this.lastHit = { q, tErr, family, spin: sh.spin, angle: st.angle, dist: st.dist, contact: st.contact };

    // Juice
    hitSound(this.power);
    this.hitStop = C.HIT_STOP * (q > 0.85 ? 1.6 : 1);
    this.flash();
    this.burst(pos, q > 0.85 ? 0xffe066 : 0xffffff, q > 0.85 ? 24 : 12, 4);
    this.shake = C.SHAKE_HIT * (0.5 + this.power);
    vibrate(q > 0.85 ? C.VIBRATE_PERFECT : C.VIBRATE_HIT);
    if (family === 'remate') this.smashJuice(pos);
    const label = q > 0.85 ? '¡PERFECTO!' : q > 0.55 ? '¡Bien!' : tErr < 0 ? 'Pronto' : 'Tarde';
    this.toast(label, FAMILY_LABEL[family], q > 0.85 ? '#ffe066' : '#fff');
    this.exitImpact();
  }

  smashJuice(pos) {
    this.shake = C.SHAKE_SMASH;
    this.hitStop = Math.max(this.hitStop, C.SMASH_HIT_STOP);
    this.fovKick = 1;
    this.burst(pos, 0xff9d2e, 20, 6);
    vibrate([40, 30, 80]);
  }

  exitImpact() {
    this.layer.innerHTML = '';
    this.court.sideX.visible = true;
    this.ball.scale.setScalar(1);
    this.phase = 'live';
    this.timeScale = C.SLOWMO;
    this.rampTime = true;
    this.blendCamera(C.CAM_MAIN, C.CAM_BLEND);
  }

  pointer(type, e) {
    if (e.target?.closest?.('button')) return;
    const xy = this.localXY(e);
    if (this.volley?.active) return this.volley.pointer(type, xy);
    if (this.phase === 'tactical') {
      if (type === 'down') this.dragging = true;
      if (type === 'up') { this.dragging = false; return; }
      if (this.dragging) this.aimFromPointer(xy);
    } else if (this.phase === 'impact') {
      if (type === 'down') this.swipePts = [xy];
      else if (type === 'move' && this.swipePts) {
        this.swipePts.push(xy);
        this.checkSwipe();
      } else if (type === 'up') {
        this.checkSwipe(true);
        this.swipePts = null;
      }
    }
  }

  // ---------- bucle ----------
  update(dt) {
    // Temporizadores en tiempo real
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    due.forEach((t) => t.fn());

    if (this.rampTime) {
      this.timeScale = Math.min(1, this.timeScale + dt / 0.4);
      if (this.timeScale >= 1) this.rampTime = false;
    }
    let gdt = dt * this.timeScale;
    if (this.debugFreeze && (this.phase === 'impact' || this.debugFreeze === 'all')) gdt = 0; // solo pruebas automáticas
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      gdt = 0;
    }
    // Impacto: la bola nunca pasa de la pala sin decidir; si llega antes que el trazo, espera en el contacto
    const imp = this.phase === 'impact' && this.impact && !this.impact.done ? this.impact : null;
    if (imp) {
      const cT = this.shot.t0 + this.shot.contact.t;
      const p = this.team[this.shot.contact.idx];
      if (imp.stroke && !imp.released && this.gameTime + gdt >= cT - swingDur(p.swingKind) * (SWING_HIT_U - 0.35)) {
        imp.released = true;
        p.release();
      }
      if (this.gameTime + gdt >= cT) {
        imp.wait += this.gameTime + gdt - cT; // tiempo de juego "virtual" que la bola lleva esperando en la pala
        gdt = Math.max(0, cT - this.gameTime);
      }
    }
    this.gameTime += gdt;
    if (this.placeLerp) {
      // Transición corta a la posición de contacto al entrar en la pausa táctica
      const L = this.placeLerp;
      L.t = Math.min(1, L.t + dt / C.CONTACT_LERP);
      L.p.pos.lerpVectors(L.from, L.to, ease(L.t));
      if (L.t >= 1) {
        this.placeLerp = null;
        const f = L.p.racketWorld();
        const cp = this.shot.contact.pos;
        this.contactErrs.push(+Math.hypot(f.x - cp.x, f.y - cp.y, f.z - (cp.z + L.p.side * C.BALL_VISUAL_R)).toFixed(3));
      }
    }

    if (this.shot && this.phase !== 'serve') this.updateBall();
    if (this.volley?.active) this.volley.update();
    if (this.phase === 'impact') {
      this.updateImpactUI();
      const imp2 = this.impact;
      const t = this.gameTime - this.shot.t0 - this.shot.contact.t;
      if (imp2.stroke && !imp2.done && t >= -1e-6) this.executeHit(); // margen por redondeo al congelar en el contacto
      else if (!this.hitDone && imp2.wait > C.MISS_AFTER) {
        // No deslizó a tiempo: la bola sigue y el golpe llega tarde, al aire
        imp2.done = true;
        this.shot.contact.done = true;
        this.shot.contact.miss = true;
        this.team[this.shot.contact.idx].release();
        whiffSound();
        this.toast('¡Tarde!', '', '#ff8a80');
        this.exitImpact();
      }
    }

    for (const p of [...this.team, ...this.rivals]) {
      p.lookTarget = this.ball.position; // todos siguen la bola con la cabeza
      p.update(gdt);
    }
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.app.renderer.render(this.scene, this.camera);
  }

  updateBall() {
    const s = this.shot;
    const t = this.gameTime - s.t0;
    sampleAt(s.path, t, this.tmp);
    // En la pausa táctica la bola se muestra ya en la pala
    if (this.phase !== 'tactical') this.ball.position.set(this.tmp.x, this.tmp.y, this.tmp.z);

    // Sonidos y polvo en los eventos del camino
    while (s.evIdx < s.path.events.length && s.path.events[s.evIdx].t <= t) {
      const e = s.path.events[s.evIdx++];
      if (this.phase === 'pointEnd' && e.t > s.outcome.t + 0.5) continue;
      if (e.type === 'ground') { bounceSound(); this.burst(e, 0xbfd6ff, 5, 1.5); this.squash = 1; }
      else if (e.type === 'wall') { glassSound(); this.shake = Math.max(this.shake, 0.03); }
      else if (e.type === 'net') netSound();
    }

    // Pelotazo: la bola da en el cuerpo de un jugador antes de botar en su campo
    if (this.phase === 'live' && s.recvSide && (s.outcome.legalBounceT == null || t < s.outcome.legalBounceT) && t < s.outcome.t) {
      const b = this.ball.position;
      if (Math.sign(b.z) === s.recvSide && b.y > 0.1 && b.y < 1.85) {
        const team = s.recvSide === 1 ? this.team : this.rivals;
        for (let i = 0; i < 2; i++) {
          if (s.contact && i === s.contact.idx && !s.contact.done) continue;
          if (Math.hypot(team[i].pos.x - b.x, team[i].pos.z - b.z) < C.BODY_R) {
            this.bodyHit(team[i], s);
            return;
          }
        }
      }
    }

    const c = s.contact;
    if (this.phase === 'live' && c && !c.done) {
      if (s.hitter === -1) {
        if (t >= c.t - C.IMPACT_LEAD) {
          c.done = true;
          this.enterTactical();
        }
      } else {
        const p = this.rivals[c.idx];
        if (!c.swung && t >= c.t - swingDur(c.anim) * SWING_HIT_U) {
          c.swung = true;
          p.swing(c.anim, null, c.miss ? null : c.hit);
        }
        if (t >= c.t) {
          c.done = true;
          if (!c.miss) {
            // Fotograma de contacto exacto: la pala sobre la bola
            this.snapToContact(p, c.pos, c.anim);
            this.ball.position.set(c.pos.x, c.pos.y, c.pos.z);
            this.aiShot(p, { ...c.pos }, { family: c.family });
          }
          else { whiffSound(); this.toast('¡Falla!', '', '#ffe066'); }
        }
      }
    }
    const s2 = this.shot; // aiShot puede haber creado un golpe nuevo
    const t2 = this.gameTime - s2.t0;
    if (this.phase === 'live' && (!s2.contact || s2.contact.miss) && t2 >= s2.outcome.t) {
      this.endPoint(s2.outcome.winner, s2.contact?.miss && s2.outcome.reason === 'doble bote' ? 'fallo' : s2.outcome.reason);
    }

    // Sombra y estela
    this.blob.position.set(this.ball.position.x, 0.012, this.ball.position.z);
    const h = this.ball.position.y;
    this.blob.scale.setScalar(1 + h * 0.3);
    this.blob.material.opacity = clamp(0.4 - h * 0.05, 0.1, 0.4);
    const gap = s.kind === 'remate' ? 4 : 2; // estela más larga en remates
    const beamCol = s.beam ? 0xff2a2a : C.COLORS.ball;
    this.trail.forEach((m) => m.material.color.setHex(beamCol));
    this.ball.material.emissive.setHex(s.beam ? 0xaa0000 : 0x3a4400);
    // La bola gira según su efecto (se ve la costura)
    this.ball.rotation.x -= this.ballSpin * 0.4 * Math.sign(-s.hitter || 1);
    this.trailPos.unshift(this.ball.position.clone());
    if (this.trailPos.length > this.trail.length * 4) this.trailPos.pop();
    this.trail.forEach((m, i) => {
      const p = this.trailPos[(i + 1) * gap - 1];
      m.visible = !!p && this.phase !== 'tactical';
      if (p) m.position.copy(p);
    });
    // Haz: de la bola a su posición de hace unos fotogramas, mientras va rápida
    const tail = this.trailPos[Math.min(this.trailPos.length - 1, C.BEAM_FRAMES)];
    const showBeam = s.beam && tail && this.phase !== 'tactical' && t < (s.outcome.legalBounceT ?? 9) + 0.15;
    this.beam.visible = !!showBeam;
    if (showBeam) {
      const a = this.ball.position;
      const d = this.v3.subVectors(a, tail);
      const len = d.length();
      if (len > 0.01) {
        this.beam.position.copy(a).addScaledVector(d, -0.5);
        this.beam.quaternion.setFromUnitVectors(this.beamUp, d.normalize());
        this.beam.scale.set(C.BEAM_RADIUS, len, C.BEAM_RADIUS);
      }
    }
  }

  /** La bola golpea a un jugador: punto para quien la tiró. */
  bodyHit(player, s) {
    const b = this.ball.position;
    const p = { x: b.x, y: b.y, z: b.z };
    const path = simulate({ p, v: { x: (b.x - player.pos.x) * 3, y: 2, z: s.recvSide * -2 } }, 2);
    this.shot = { ...s, path, t0: this.gameTime, contact: null, evIdx: 0, beam: false, recvSide: null };
    this.shake = 0.12;
    vibrate(80);
    player.celebrate = 0;
    this.endPoint(-s.recvSide, 'pelotazo');
  }

  updateParticles(dt) {
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dt / C.SQUASH_TIME);
    const sq = C.SQUASH * Math.sin(this.squash * Math.PI) ;
    this.ball.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= 9 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.material.opacity = clamp(p.life * 2, 0, 1);
      if (p.life <= 0) p.m.visible = false;
    }

  }

  updateCamera(dt) {
    if (this.camT < 1 && this.camTo) {
      this.camT = Math.min(1, this.camT + dt / this.camDur);
      const k = ease(this.camT);
      this.cam.pos.lerpVectors(this.camFrom.pos, this.camTo.pos, k);
      this.cam.look.lerpVectors(this.camFrom.look, this.camTo.look, k);
    }
    // Seguimiento suave de la bola con la cámara principal
    const follow = (this.phase === 'live' || this.phase === 'serve') && !this.volley?.active;
    const fx = follow ? this.ball.position.x * C.CAM_FOLLOW_X : 0;
    const fz = follow ? this.ball.position.z * C.CAM_FOLLOW_Z : 0;
    const kf = 1 - Math.exp(-C.CAM_FOLLOW_SMOOTH * dt);
    this.follow.x += (fx - this.follow.x) * kf;
    this.follow.z += (fz - this.follow.z) * kf;
    this.camera.position.copy(this.cam.pos).add(this.follow);
    if (this.shake > 0.001) {
      this.camera.position.x += rand(-1, 1) * this.shake;
      this.camera.position.y += rand(-1, 1) * this.shake;
      this.shake *= Math.pow(0.002, dt);
    }
    if (this.fovKick > 0) this.fovKick = Math.max(0, this.fovKick - dt * C.FOV_KICK_DECAY);
    const fov = (this.fovBase ?? C.CAM_FOV) - C.FOV_KICK_SMASH * Math.sin(this.fovKick * Math.PI * 0.5);
    if (fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.v3.copy(this.cam.look).add(this.follow);
    this.camera.lookAt(this.v3);
  }
}
