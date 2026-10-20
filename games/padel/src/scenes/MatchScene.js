// Escena de partido: bola con física, IA rival, pausa táctica y fase de impacto en cámara lenta.
import * as THREE from 'three';
import { CONFIG as C } from '../config.js';
import { simulate, sampleAt, solveShot } from '../physics.js';
import { judge, findContact } from '../rules.js';
import { buildCourt } from '../court.js';
import { Player } from '../player.js';
import { hitSound, bounceSound, glassSound, netSound, whiffSound, pointSound, whooshSound } from '../utils/sound.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const vibrate = (p) => navigator.vibrate?.(p);

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

    const T = C.COLORS.team, R = C.COLORS.rival;
    this.team = [
      new Player({ shirt: T.shirt, shorts: T.shorts, hair: T.hair[0], side: 1 }),
      new Player({ shirt: T.shirt, shorts: T.shorts, hair: T.hair[1], side: 1, hairStyle: 1 }),
    ];
    this.rivals = [
      new Player({ shirt: R.shirt, shorts: R.shorts, hair: R.hair[0], side: -1, hairStyle: 1 }),
      new Player({ shirt: R.shirt, shorts: R.shorts, hair: R.hair[1], side: -1 }),
    ];
    for (const p of [...this.team, ...this.rivals]) scene.add(p.root);
    this.team.forEach((p) => (p.speed = C.PLAYER_SPEED * (1 + this.stats.speed * 0.08)));

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

    // Marcador de objetivo y arco de previsualización
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 32),
      new THREE.MeshBasicMaterial({ color: C.COLORS.target, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.02;
    this.marker.visible = false;
    scene.add(this.marker);
    this.arcN = 48;
    this.arcMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.arc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), this.arcMat, this.arcN);
    this.arc.visible = false;
    scene.add(this.arc);

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
    this.points = { 1: 0, [-1]: 0 };
    this.serverIdx = 0;
    this.cam = { pos: new THREE.Vector3(...C.CAM_MAIN.pos), look: new THREE.Vector3(...C.CAM_MAIN.look) };
    this.camFrom = null;
    this.camTo = null;
    this.camT = 1;
    this.camDur = 1;
    this.shake = 0;
    this.hitStop = 0;
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
    this.startPoint();
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

  renderScore() {
    this.score.innerHTML = `<div class="t g">TÚ<small>${this.points[1]}</small></div>
      <div class="pts">${this.points[1]} - ${this.points[-1]}</div>
      <div class="t r">RIVAL<small>${this.points[-1]}</small></div>`;
  }

  racketPoint(p) {
    // La pala está a la derecha del personaje: +x para el jugador (mira a -z), -x para el rival
    return { x: p.pos.x + 0.55 * p.side, z: p.pos.z };
  }

  bodyFor(p, contact) {
    return {
      x: clamp(contact.x - 0.55 * p.side, -4.7, 4.7),
      z: clamp(contact.z + 0.25 * p.side, -9.7, 9.7),
    };
  }

  goHome(team) {
    const side = team[0].side;
    team.forEach((p, i) => {
      p.speed = side === 1 ? C.PLAYER_SPEED * (1 + this.stats.speed * 0.08) : C.PLAYER_SPEED;
      p.moveTo(i === 0 ? -C.HOME_X : C.HOME_X, side * C.HOME_BACK_Z);
    });
  }

  // ---------- flujo del punto ----------
  startPoint() {
    this.phase = 'serve';
    this.shot = null;
    this.layer.innerHTML = '';
    this.marker.visible = false;
    this.arc.visible = false;
    this.trailPos.length = 0;
    this.timeScale = 1;
    this.blendCamera(C.CAM_MAIN, 0.6);
    const all = [...this.team, ...this.rivals];
    all.forEach((p) => {
      p.target = null;
      p.celebrate = 0;
      p.idlePose();
    });
    this.team[0].pos.set(-C.HOME_X, 0, C.HOME_BACK_Z);
    this.team[1].pos.set(C.HOME_X, 0, C.HOME_BACK_Z);
    this.rivals[0].pos.set(-C.HOME_X, 0, -C.HOME_BACK_Z);
    this.rivals[1].pos.set(C.HOME_X, 0, -C.HOME_BACK_Z);
    const server = this.rivals[this.serverIdx];
    server.pos.z = -9.4;
    this.serverIdx ^= 1;
    const hand = this.racketPoint(server);
    this.ball.position.set(hand.x, 1.0, hand.z + 0.3);
    this.after(0.9, () => {
      server.swing('drive');
      this.after(0.12, () => this.aiShot(server, { x: hand.x, y: 0.95, z: hand.z + 0.3 }, { serve: true }));
    });
  }

  doHit(player, pos, v, spin, side, kind) {
    const hitter = player.side;
    const path = simulate({ p: pos, v, spin, side });
    const outcome = judge(path, hitter);
    const recvTeam = hitter === 1 ? this.rivals : this.team;
    const hitTeam = hitter === 1 ? this.team : this.rivals;
    const contact = findContact(
      path, outcome, -hitter,
      recvTeam.map((p) => this.racketPoint(p)),
      recvTeam[0].speed,
    );
    this.shot = { path, t0: this.gameTime, hitter, outcome, contact, evIdx: 0, kind, spin };
    if (this.phase === 'serve') this.phase = 'live';
    if (contact && hitter === 1) {
      // La IA puede fallar, sobre todo con bolas rápidas
      const sp = Math.hypot(v.x, v.y, v.z);
      const miss = this.ai.missChance + (sp > this.ai.fastBall ? this.ai.missChanceFastBall : 0);
      contact.miss = Math.random() < miss;
    }
    this.goHome(hitTeam);
    if (contact) {
      const p = recvTeam[contact.idx];
      const body = this.bodyFor(p, contact.pos);
      const need = Math.hypot(body.x - p.pos.x, body.z - p.pos.z) / Math.max(0.1, contact.t - C.REACTION);
      p.speed = Math.min(10, Math.max(p.speed, need));
      p.moveTo(body.x, body.z);
      const mate = recvTeam[1 - contact.idx];
      mate.moveTo(contact.idx === 0 ? C.HOME_X : -C.HOME_X, -hitter * C.HOME_BACK_Z);
    } else {
      this.goHome(recvTeam);
    }
  }

  aiShot(player, pos, opts = {}) {
    const side = player.side;
    const A = this.ai;
    let target, power, spin = 0;
    let kind = 'drive';
    if (opts.serve) {
      target = { x: -Math.sign(pos.x || 1) * rand(1, 3.8), z: -side * rand(3.5, 6.2) };
      power = 0.25;
      spin = rand(-0.3, 0.3);
    } else if (pos.y > C.SMASH_HEIGHT) {
      kind = 'smash';
      power = A.smashPower;
      const toSide = Math.random() < 0.5;
      target = { x: toSide ? rand(3, 4.3) * (Math.random() < 0.5 ? -1 : 1) : rand(-3, 3), z: -side * rand(3, 6) };
    } else if (Math.random() < A.lobChance) {
      power = 0;
      spin = rand(-0.3, 0.1);
      target = { x: rand(-3.5, 3.5), z: -side * rand(7.8, 9) };
    } else {
      power = rand(A.powerMin, A.powerMax);
      spin = rand(-0.7, 0.8);
      target = { x: rand(-3.8, 3.8), z: -side * rand(5, 8.5) };
    }
    const err = randDisk(opts.serve ? A.errBase * 0.4 : A.errBase);
    target.x += err.x;
    target.z += err.z;
    const speed = lerp(C.SHOT_SPEED_MIN, C.SHOT_SPEED_MAX, power) * (1 - Math.abs(spin) * C.SPIN_SPEED_FACTOR);
    const sol = solveShot(pos, target, speed, spin, 0, 0);
    hitSound(power);
    if (kind === 'smash') {
      this.shake = C.SHAKE_SMASH * 0.5;
      this.fovKick = 0.5;
    }
    this.doHit(player, pos, sol.v, spin, 0, kind);
  }

  endPoint(winner, reason) {
    if (this.phase === 'pointEnd') return;
    this.phase = 'pointEnd';
    this.layer.innerHTML = '';
    this.points[winner]++;
    this.renderScore();
    const win = winner === 1;
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
    };
    this.toast(win ? '¡PUNTO!' : 'Punto rival', reasons[reason] || reason, win ? '#ffe066' : '#ff8a80');
    pointSound(win);
    if (reason === 'por 3' || reason === 'por 4') {
      this.burst(this.ball.position, 0xffcc33, 20, 6);
      this.burst(this.ball.position, 0x4fb3ff, 20, 6);
      this.shake = 0.15;
    }
    vibrate(win ? [30, 40, 60] : 60);
    (win ? this.team : this.rivals).forEach((p) => (p.celebrate = 1.2));
    this.after(C.POINT_END_DELAY, () => this.startPoint());
  }

  // ---------- pausa táctica ----------
  enterTactical() {
    this.phase = 'tactical';
    this.timeScale = 0;
    this.blendCamera(C.CAM_TACTICAL, 0.35);
    vibrate(15);
    const L = this.layer;
    L.innerHTML = '';
    this.tacHint = el('div', 'hint', L, '');
    const bar = el('div', 'power', L);
    this.powerFill = el('div', 'fill', bar);
    this.powerLbl = el('div', 'lbl', bar);
    bar.dataset.ui = 'power';
    this.powerBar = bar;
    const next = el('button', 'btn', L, 'SIGUIENTE ▶');
    next.dataset.ui = 'next';
    Object.assign(next.style, { left: '50%', bottom: 'calc(var(--u) * 8)', transform: 'translateX(-50%)' });
    next.addEventListener('pointerdown', (e) => e.stopPropagation());
    next.addEventListener('click', () => this.enterImpact());
    this.marker.visible = true;
    this.updatePower();
    this.updatePreview();
  }

  updatePower() {
    this.powerFill.style.height = `${Math.round(this.power * 100)}%`;
    this.powerLbl.textContent = `${Math.round(this.power * 100)}%`;
  }

  shotSpeed(power, spin) {
    const pw = power * (1 + this.stats.power * 0.06);
    return lerp(C.SHOT_SPEED_MIN, C.SHOT_SPEED_MAX, pw) * (1 - Math.abs(spin) * C.SPIN_SPEED_FACTOR);
  }

  updatePreview() {
    const cp = this.shot.contact.pos;
    this.marker.position.x = this.aim.x;
    this.marker.position.z = this.aim.z;
    const sol = solveShot(cp, this.aim, this.shotSpeed(this.power, 0), 0, 0, 0);
    const path = simulate({ p: cp, v: sol.v }, 3);
    const out = judge(path, 1);
    const firstBounce = path.events.find((e) => e.type === 'ground' || e.type === 'wall' || e.type === 'out');
    const tEnd = firstBounce ? firstBounce.t : path.duration;
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.arcN; i++) {
      const p = sampleAt(path, (tEnd * i) / (this.arcN - 1), this.tmp);
      m.makeTranslation(p.x, p.y, p.z);
      this.arc.setMatrixAt(i, m);
    }
    this.arc.instanceMatrix.needsUpdate = true;
    this.arc.visible = true;
    const bad = out.winner === -1 || !sol.reachable;
    this.tacHint.innerHTML = bad
      ? 'Toca el campo rival para apuntar<small style="color:#ff8a80">¡Así se va fuera! Baja la potencia o apunta más largo</small>'
      : 'Toca el campo rival para apuntar<small>y ajusta la potencia</small>';
    this.arcMat.color.setHex(bad ? 0xff5040 : 0xffffff);
    this.marker.material.color.setHex(bad ? 0xff5040 : 0xffffff);
  }

  aimFromPointer(xy) {
    const ndc = new THREE.Vector2((xy.x / this.app.width) * 2 - 1, -(xy.y / this.app.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return;
    if (hit.z > 1.5) return; // tocar en nuestro campo no apunta
    this.aim.x = clamp(hit.x, -4.6, 4.6);
    this.aim.z = clamp(hit.z, -9.6, -0.8);
    this.updatePreview();
  }

  // ---------- fase de impacto ----------
  enterImpact() {
    this.phase = 'impact';
    this.timeScale = C.SLOWMO;
    this.arc.visible = false;
    this.court.sideX.visible = false;
    const cp = this.shot.contact.pos;
    const D = C.SIDE_CAM_DIST;
    const A = C.SIDE_CAM_LOOK_AHEAD;
    this.blendCamera({ pos: [cp.x + D, cp.y + 1.0, cp.z - A], look: [cp.x, cp.y + 0.3, cp.z - A] }, 0.3);
    const L = this.layer;
    L.innerHTML = '';
    el('div', 'vignette', L);
    el('div', 'hint', L, 'Desliza sobre la bola<small>↗ liftado · → plano · ↘ cortado</small>');
    this.ghost = el('div', 'ring ghost', L);
    this.ring = el('div', 'ring', L);
    this.approach = el('div', 'ring approach', L);
    el('div', 'dot', this.ring);
    this.swipeCv = el('canvas', 'swipe', L);
    this.swipeCv.width = this.app.width;
    this.swipeCv.height = this.app.height;
    this.swipePts = null;
    this.hitDone = false;
    // El personaje prepara el golpe y espera al deslizamiento
    const kind = cp.y > C.SMASH_HEIGHT ? 'smash' : 'drive';
    this.team[this.shot.contact.idx].swing(kind, 0.35);
    vibrate(10);
    whooshSound();
  }

  ringRadius() { return C.HIT_RING_FRAC * this.app.width; }

  updateImpactUI() {
    const r = this.ringRadius();
    const b = this.toScreen(this.ball.position);
    const g = this.toScreen(this.shot.contact.pos);
    this.ballScreen = b;
    const t = this.gameTime - this.shot.t0 - this.shot.contact.t;
    const near = Math.abs(t) < C.TIMING_WINDOW * 0.5;
    Object.assign(this.ring.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${2 * r}px`, height: `${2 * r}px` });
    this.ring.style.borderColor = near ? '#4cd964' : '#fff';
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

  checkSwipe() {
    const pts = this.swipePts;
    if (!pts || pts.length < 2 || this.hitDone) return;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < C.MIN_SWIPE_PX_FRAC * this.app.width) return;
    // ¿El último tramo cruza el aro de la bola?
    const r = this.ringRadius();
    const c = this.ballScreen;
    const p = pts[pts.length - 2];
    const sx = b.x - p.x, sy = b.y - p.y;
    const sl2 = sx * sx + sy * sy || 1;
    const k = clamp(((c.x - p.x) * sx + (c.y - p.y) * sy) / sl2, 0, 1);
    const dist = Math.hypot(p.x + sx * k - c.x, p.y + sy * k - c.y);
    // Trazo ya pasado del centro de la bola (o muy cerca)
    const along = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len;
    if (dist > r * C.WHIFF_OFFSET || along > len) return;
    // Desviación: distancia con signo del centro de la bola a la línea del trazo (en radios)
    const offset = (dx * (c.y - a.y) - dy * (c.x - a.x)) / len / r;
    this.resolveHit(dx, dy, offset);
  }

  resolveHit(dx, dy, offset) {
    if (Math.abs(offset) > C.WHIFF_OFFSET) {
      whiffSound();
      this.toast('¡Aire!', '', '#ddd');
      this.swipePts = null;
      return;
    }
    this.hitDone = true;
    const contact = this.shot.contact;
    const player = this.team[contact.idx];
    const pos = { x: this.ball.position.x, y: this.ball.position.y, z: this.ball.position.z };

    // Efecto según el ángulo del trazo (arriba = liftado, abajo = cortado)
    const ang = (Math.atan2(-dy, Math.abs(dx)) * 180) / Math.PI;
    let spin = 0;
    if (Math.abs(ang) > C.FLAT_ANGLE_DEG) {
      spin = Math.sign(ang) * Math.min(1, (Math.abs(ang) - C.FLAT_ANGLE_DEG) / (C.SPIN_FULL_ANGLE_DEG - C.FLAT_ANGLE_DEG)) * C.SPIN_MAX;
    }
    // Precisión: timing y centrado
    const tErr = this.gameTime - this.shot.t0 - contact.t;
    const timingQ = clamp(1 - Math.abs(tErr) / C.TIMING_WINDOW, 0, 1);
    const centerQ = clamp(1 - Math.abs(offset), 0, 1);
    const q = timingQ * (0.4 + 0.6 * centerQ);
    const errR = lerp(C.PRECISION_MIN_ERR, C.PRECISION_MAX_ERR, 1 - q) * (1 - this.stats.precision * 0.07);
    const e = randDisk(errR);
    const target = { x: this.aim.x + e.x, z: this.aim.z + e.z };
    const dev = (-offset * C.SIDE_DEV_MAX_DEG * Math.PI) / 180;
    const side = offset * C.SIDESPIN_FROM_OFFSET;
    const kind = pos.y > C.SMASH_HEIGHT ? 'smash' : 'drive';
    const sol = solveShot(pos, target, this.shotSpeed(this.power, spin), spin, side, dev);
    player.swingKind = kind;
    player.release();
    this.doHit(player, pos, sol.v, spin, side, kind);
    this.lastHit = { q, tErr, offset, spin, ang };

    // Juice
    hitSound(this.power);
    this.hitStop = C.HIT_STOP * (q > 0.85 ? 1.6 : 1);
    this.flash();
    this.burst(pos, q > 0.85 ? 0xffe066 : 0xffffff, q > 0.85 ? 24 : 12, 4);
    this.shake = C.SHAKE_HIT * (0.5 + this.power);
    vibrate(q > 0.85 ? C.VIBRATE_PERFECT : C.VIBRATE_HIT);
    if (kind === 'smash') this.smashJuice(pos);
    const label = q > 0.85 ? '¡PERFECTO!' : q > 0.55 ? '¡Bien!' : tErr < 0 ? 'Pronto' : 'Tarde';
    const spinLbl = spin > 0.15 ? 'Liftado' : spin < -0.15 ? 'Cortado' : 'Plano';
    this.toast(label, spinLbl + (kind === 'smash' ? ' · Remate' : ''), q > 0.85 ? '#ffe066' : '#fff');
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
    this.marker.visible = false;
    this.phase = 'live';
    this.timeScale = C.SLOWMO;
    this.rampTime = true;
    this.blendCamera(C.CAM_MAIN, C.CAM_BLEND);
  }

  pointer(type, e) {
    if (e.target?.closest?.('button')) return;
    const xy = this.localXY(e);
    if (this.phase === 'tactical') {
      if (type === 'down') {
        this.dragging = e.target?.closest?.('[data-ui="power"]') ? 'power' : 'aim';
      }
      if (type === 'up') { this.dragging = null; return; }
      if (!this.dragging) return;
      if (this.dragging === 'power') {
        const r = this.powerBar.getBoundingClientRect();
        this.power = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
        this.updatePower();
        this.updatePreview();
      } else {
        this.aimFromPointer(xy);
      }
    } else if (this.phase === 'impact') {
      if (type === 'down') this.swipePts = [xy];
      else if (type === 'move' && this.swipePts) {
        this.swipePts.push(xy);
        this.checkSwipe();
      } else if (type === 'up') this.swipePts = null;
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
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      gdt = 0;
    }
    this.gameTime += gdt;

    if (this.shot && this.phase !== 'serve') this.updateBall();
    if (this.phase === 'impact') {
      this.updateImpactUI();
      const t = this.gameTime - this.shot.t0 - this.shot.contact.t;
      if (!this.hitDone && t > C.MISS_AFTER) {
        // No deslizó a tiempo: la bola pasa
        this.shot.contact.done = true;
        this.shot.contact.miss = true;
        this.team[this.shot.contact.idx].release();
        whiffSound();
        this.toast('¡Tarde!', '', '#ff8a80');
        this.exitImpact();
      }
    }

    for (const p of [...this.team, ...this.rivals]) p.update(gdt);
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.app.renderer.render(this.scene, this.camera);
  }

  updateBall() {
    const s = this.shot;
    const t = this.gameTime - s.t0;
    sampleAt(s.path, t, this.tmp);
    this.ball.position.set(this.tmp.x, this.tmp.y, this.tmp.z);

    // Sonidos y polvo en los eventos del camino
    while (s.evIdx < s.path.events.length && s.path.events[s.evIdx].t <= t) {
      const e = s.path.events[s.evIdx++];
      if (this.phase === 'pointEnd' && e.t > s.outcome.t + 0.5) continue;
      if (e.type === 'ground') { bounceSound(); this.burst(e, 0xbfd6ff, 5, 1.5); this.squash = 1; }
      else if (e.type === 'wall') { glassSound(); this.shake = Math.max(this.shake, 0.03); }
      else if (e.type === 'net') netSound();
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
        if (!c.swung && t >= c.t - p.swingDur * 0.45) {
          c.swung = true;
          p.swing(c.pos.y > C.SMASH_HEIGHT ? 'smash' : 'drive');
        }
        if (t >= c.t) {
          c.done = true;
          if (!c.miss) this.aiShot(p, { ...c.pos });
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
    const gap = s.kind === 'smash' ? 4 : 2; // estela más larga en remates
    this.trailPos.unshift(this.ball.position.clone());
    if (this.trailPos.length > this.trail.length * 4) this.trailPos.pop();
    this.trail.forEach((m, i) => {
      const p = this.trailPos[(i + 1) * gap - 1];
      m.visible = !!p && this.phase !== 'tactical';
      if (p) m.position.copy(p);
    });
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
    if (this.marker.visible) {
      const s = 1 + Math.sin(performance.now() / 150) * 0.08;
      this.marker.scale.set(s, s, s);
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
    const fx = this.phase === 'live' || this.phase === 'serve' ? this.ball.position.x * C.CAM_FOLLOW_X : 0;
    const fz = this.phase === 'live' || this.phase === 'serve' ? this.ball.position.z * C.CAM_FOLLOW_Z : 0;
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
    const fov = C.CAM_FOV - C.FOV_KICK_SMASH * Math.sin(this.fovKick * Math.PI * 0.5);
    if (fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.v3.copy(this.cam.look).add(this.follow);
    this.camera.lookAt(this.v3);
  }
}
