// Volea defensiva tipo portero: vista desde la red, cuenta atrás, el rival remata desde el fondo
// y mueves la pala con el dedo para bloquear la bola en su trayectoria.
import * as THREE from 'three';
import { CONFIG as C } from '../config.js';
import { sampleAt } from '../physics.js';
import { swingDur, SWING_HIT_U } from '../player.js';
import { beep, hitSound, whiffSound } from '../utils/sound.js';
import { el } from '../ui/dom.js';

const V = C.VOLLEY_DEF;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

export class VolleyMode {
  constructor(match) {
    this.m = match;
    this.active = false;
    // Pala "boceto": cara translúcida con contorno y mango
    const g = (this.paddle = new THREE.Group());
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(V.PADDLE_R, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(V.PADDLE_R * 0.92, V.PADDLE_R, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    handle.position.y = -V.PADDLE_R - 0.1;
    // Agujeros dibujados (estilo boceto)
    const dots = new THREE.Group();
    const dotGeo = new THREE.CircleGeometry(0.012, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    for (let x = -0.15; x <= 0.15; x += 0.05) {
      for (let y = -0.15; y <= 0.15; y += 0.05) {
        if (x * x + y * y > 0.16 * 0.16) continue;
        const d = new THREE.Mesh(dotGeo, dotMat);
        d.position.set(x, y, 0.001);
        dots.add(d);
      }
    }
    g.add(face, rim, handle, dots);
    g.visible = false;
    match.scene.add(g);
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -V.PLANE_Z);
    this.hit = new THREE.Vector3();
  }

  start() {
    const m = this.m;
    this.active = true;
    this.launched = false;
    this.resolved = false;
    this.cross = null;
    m.phase = 'volleyDef';
    m.timers = [];
    m.shot = null;
    m.layer.innerHTML = '';
    m.arrow.visible = false;
    m.ball.scale.setScalar(1);
    m.trailPos.length = 0;
    m.timeScale = 1;
    // Solo se ven tu pala, la red y los rivales; tus jugadores se apartan y se ocultan
    m.team.forEach((p, i) => {
      p.root.visible = false;
      p.target = null;
      p.pos.set(i ? 4.6 : -4.6, 0, 9.6);
    });
    const striker = m.rivals[0];
    const sx = rand(-2, 2);
    striker.pos.set(sx, 0, -V.STRIKER_Z);
    m.rivals[1].pos.set(-Math.sign(sx || 1) * 2.4, 0, -6.5);
    [...m.team, ...m.rivals].forEach((p) => { p.vel = { x: 0, z: 0 }; p.celebrate = 0; p.idlePose(); });
    const hand = m.racketPoint(striker);
    this.hitPos = { x: hand.x, y: V.SMASH_H, z: hand.z + 0.2 };
    m.ball.position.set(this.hitPos.x, this.hitPos.y, this.hitPos.z);
    m.blendCamera(V.CAM, 0.5);
    m.fovBase = V.FOV;
    this.paddle.visible = true;
    this.setPaddle(0.5, 1.3);
    el('div', 'hint', m.layer, 'Bloquea el remate<small>Mueve la pala con el dedo</small>');
    // Cuenta atrás y remate
    [3, 2, 1].forEach((n, i) => m.after(0.2 + i * V.COUNT_STEP, () => {
      m.toast(String(n), '', '#fff');
      beep(n === 1 ? 880 : 660, 0.12, 'square', 0.15);
    }));
    const t3 = 0.2 + 3 * V.COUNT_STEP;
    m.after(t3 - swingDur('smash') * SWING_HIT_U, () => striker.swing('smash'));
    m.after(t3, () => this.launch());
  }

  /** Coloca la pala en el plano de la red; la inclinación depende de la posición. */
  setPaddle(x, y) {
    x = clamp(x, -V.MAX_X, V.MAX_X);
    y = clamp(y, V.MIN_Y, V.MAX_Y);
    this.paddle.position.set(x, y, V.PLANE_Z);
    // Mitad derecha: diagonal hacia la derecha; mitad izquierda: hacia la izquierda
    this.paddle.rotation.z = -clamp(x / V.MAX_X, -1, 1) * V.TILT_SIDE;
    // Arriba: más vertical; abajo: más horizontal
    this.paddle.rotation.x = -(1 - (y - V.MIN_Y) / (V.MAX_Y - V.MIN_Y)) * V.TILT_LOW;
  }

  pointer(type, xy) {
    if (type === 'up') { this.dragging = false; return; }
    if (this.resolved) return;
    if (type === 'down') this.dragging = true;
    if (!this.dragging && type !== 'down') return;
    const m = this.m;
    const ndc = new THREE.Vector2((xy.x / m.app.width) * 2 - 1, -(xy.y / m.app.height) * 2 + 1);
    m.raycaster.setFromCamera(ndc, m.camera);
    if (m.raycaster.ray.intersectPlane(this.plane, this.hit)) this.setPaddle(this.hit.x, this.hit.y);
  }

  launch() {
    const m = this.m;
    // Remate real: apunta a un punto de tu zona a la altura del pecho, a toda velocidad
    const aim = { x: rand(-V.AIM_X, V.AIM_X), y: rand(V.AIM_Y[0], V.AIM_Y[1]), z: V.PLANE_Z };
    const H = this.hitPos;
    const vz = rand(V.SPEED[0], V.SPEED[1]);
    const T = (aim.z - H.z) / vz;
    const v = { x: (aim.x - H.x) / T, y: (aim.y - H.y + 0.5 * C.GRAVITY * T * T) / T, z: vz };
    hitSound(1);
    m.shake = C.SHAKE_SMASH * 0.6;
    m.fovKick = 0.6;
    m.doHit(m.rivals[0], { ...H }, v, 0, 0, 'remate', { power: 1, q: 1 });
    m.shot.contact = null; // tus jugadores no la juegan: solo cuenta la pala
    m.shot.beam = false; // el haz pasaría pegado a la cámara
    m.phase = 'live';
    m.timeScale = V.SLOWMO;
    this.launched = true;
    // Dónde cruza la bola el plano de la pala
    const s = m.shot.path.samples;
    for (let i = 1; i < s.length; i++) {
      if (s[i - 1].z < V.PLANE_Z && s[i].z >= V.PLANE_Z) {
        const k = (V.PLANE_Z - s[i - 1].z) / (s[i].z - s[i - 1].z);
        this.cross = {
          t: (i - 1 + k) * m.shot.path.dt,
          x: s[i - 1].x + (s[i].x - s[i - 1].x) * k,
          y: s[i - 1].y + (s[i].y - s[i - 1].y) * k,
        };
        break;
      }
    }
  }

  update() {
    if (!this.launched || this.resolved || !this.cross) return;
    const m = this.m;
    const t = m.gameTime - m.shot.t0;
    if (t < this.cross.t) return;
    this.resolved = true;
    // ¿La bola pasa por la cara de la pala? (en coordenadas locales de la pala)
    const local = this.paddle.worldToLocal(new THREE.Vector3(this.cross.x, this.cross.y, V.PLANE_Z));
    const blocked = Math.hypot(local.x, local.y) <= V.REACH;
    this.lastResult = { blocked, local: { x: local.x, y: local.y } };
    if (!blocked) {
      if (m.shot.outcome.winner === -1 && m.shot.outcome.reason === 'doble bote') m.shot.outcome.reason = 'remate pasa';
      whiffSound();
      return; // la bola sigue y bota dos veces en tu campo
    }
    // Bloqueo: la bola vuelve al campo rival y bota dos veces (dejada o volea profunda)
    const p = sampleAt(m.shot.path, this.cross.t, { x: 0, y: 0, z: 0 });
    const dejada = Math.random() < 0.5;
    const v = dejada
      ? { x: rand(-1.5, 1.5), y: 2.4, z: -rand(5, 6.5) }
      : { x: rand(-2.5, 2.5), y: 2.6, z: -rand(9, 10.5) };
    m.doHit(m.team[0], p, v, dejada ? -0.6 : 0, 0, 'volea', { power: 0.5, q: 1 });
    m.shot.contact = null;
    if (m.shot.outcome.winner === 1) m.shot.outcome.reason = 'bloqueo';
    m.timeScale = 1;
    m.rampTime = false;
    hitSound(0.8);
    m.hitStop = C.HIT_STOP * 1.6;
    m.flash();
    m.burst(p, 0xffe066, 24, 4);
    navigator.vibrate?.(C.VIBRATE_PERFECT);
    m.toast('¡BLOQUEO!', dejada ? 'Dejada' : 'Volea profunda', '#ffe066');
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.paddle.visible = false;
    this.m.fovBase = null;
    this.m.team.forEach((p) => (p.root.visible = true));
  }
}
