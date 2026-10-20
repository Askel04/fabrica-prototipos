// Personaje 3D tipo bloques construido por código: cabeza, torso, brazos y piernas como cubos.
import * as THREE from 'three';
import { CONFIG as C } from './config.js';

const mats = new Map();
const mat = (color) => {
  if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color }));
  return mats.get(color);
};
function part(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Poses clave de cada golpe. ax/az: brazo de la pala (x adelante-arriba negativo, z negativo hacia fuera),
// by: giro del cuerpo, lx: brazo libre, jump: salto. El contacto ocurre en u = 0.5.
const IDLE = { ax: -0.5, az: -0.15, by: 0, lx: -0.3, jump: 0 };
const POSES = {
  drive: { prep: { ax: -0.3, az: -1.3, by: 0.9 }, hit: { ax: -1.0, az: -1.4, by: 0 }, follow: { ax: -2.3, az: 0.4, by: -0.8 } },
  reves: { prep: { ax: -0.6, az: 1.4, by: -0.9 }, hit: { ax: -1.2, az: 0.9, by: 0 }, follow: { ax: -2.0, az: -0.8, by: 0.7 } },
  cortado: { prep: { ax: -2.0, az: -1.0, by: 0.8 }, hit: { ax: -1.1, az: -1.3, by: 0.1 }, follow: { ax: -0.6, az: -0.2, by: -0.5 } },
  globo: { prep: { ax: 0.4, az: -0.7, by: 0.5 }, hit: { ax: -0.9, az: -0.8, by: 0 }, follow: { ax: -2.9, az: -0.3, by: -0.3 } },
  volea: { dur: 0.25, prep: { ax: -1.3, az: -1.0, by: 0.4 }, hit: { ax: -1.5, az: -0.9, by: 0 }, follow: { ax: -1.5, az: -0.5, by: -0.2 } },
  bandeja: { dur: 0.42, prep: { ax: -2.6, az: -0.9, by: 1.0, lx: -1.6 }, hit: { ax: -2.3, az: -1.4, by: 0.2, lx: -0.8 }, follow: { ax: -1.2, az: -1.5, by: -0.5, lx: -0.3 } },
  vibora: { dur: 0.42, prep: { ax: -2.8, az: -1.2, by: 1.2, lx: -1.8 }, hit: { ax: -2.2, az: -1.7, by: 0, lx: -0.6 }, follow: { ax: -0.7, az: 0.6, by: -1.0, lx: -0.2 } },
  rulo: { dur: 0.42, prep: { ax: -1.6, az: -0.6, by: 0.7, lx: -1.6 }, hit: { ax: -2.8, az: -0.6, by: 0.1, lx: -1.0 }, follow: { ax: -2.2, az: 0.8, by: -0.9 } },
  smash: { dur: 0.5, prep: { ax: -3.0, az: -0.5, by: 0.7, jump: 0.3, lx: -2.9 }, hit: { ax: -2.9, az: -0.1, by: 0.1, jump: 0.45, lx: -1.5 }, follow: { ax: -0.3, az: 0.3, by: -0.6, lx: -0.3 } },
  saque: { dur: 0.45, prep: { ax: 0.6, az: -0.6, by: 0.6, lx: -1.0 }, hit: { ax: -0.5, az: -0.5, by: 0.1, lx: -0.4 }, follow: { ax: -1.8, az: 0.2, by: -0.4 } },
};
export const SWING_HIT_U = 0.5;
export const swingDur = (kind) => (POSES[kind] || POSES.drive).dur || 0.36;

export class Player {
  constructor({ shirt, shorts, hair, skin = C.COLORS.skin, side, hairStyle = 0 }) {
    this.side = side; // 1 jugador, -1 rival
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    // Piernas (pivote en la cadera)
    this.legs = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.13, 0.78, 0);
      pivot.add(part(0.2, 0.52, 0.22, skin, 0, -0.26, 0));
      pivot.add(part(0.21, 0.2, 0.23, 0xffffff, 0, -0.6, 0)); // calcetín
      pivot.add(part(0.23, 0.1, 0.32, 0x2b2f3a, 0, -0.73, 0.04)); // zapatilla
      this.body.add(pivot);
      return pivot;
    });
    this.body.add(part(0.5, 0.24, 0.3, shorts, 0, 0.78, 0)); // pantalón
    this.torso = part(0.52, 0.56, 0.3, shirt, 0, 1.18, 0);
    this.body.add(this.torso);
    // Franja de la camiseta (sin marcas)
    this.body.add(part(0.53, 0.07, 0.31, 0xffffff, 0, 1.24, 0));

    // Cabeza
    this.head = new THREE.Group();
    this.head.position.set(0, 1.47, 0);
    this.head.add(part(0.44, 0.44, 0.42, skin, 0, 0.22, 0));
    this.head.add(part(0.46, 0.13, 0.44, hair, 0, 0.45, -0.01));
    this.head.add(part(0.46, 0.3, 0.1, hair, 0, 0.3, -0.18));
    if (hairStyle === 1) this.head.add(part(0.46, 0.08, 0.14, hair, 0, 0.38, 0.17)); // flequillo
    for (const s of [-1, 1]) this.head.add(part(0.06, 0.08, 0.02, 0x1a1a1a, s * 0.1, 0.24, 0.215));
    this.head.add(part(0.12, 0.03, 0.02, 0x8a4a3a, 0, 0.11, 0.215));
    this.body.add(this.head);

    // Brazos (pivote en el hombro)
    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.34, 1.4, 0);
      pivot.add(part(0.17, 0.2, 0.19, shirt, 0, -0.08, 0));
      pivot.add(part(0.15, 0.48, 0.16, skin, 0, -0.38, 0));
      this.body.add(pivot);
      return pivot;
    });
    // Pala en la mano derecha (sin marcas)
    this.racket = new THREE.Group();
    this.racket.position.set(0, -0.6, 0.04);
    this.racket.add(part(0.05, 0.2, 0.05, 0x222222, 0, 0, 0));
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 14), mat(0x333a48));
    face.rotation.x = Math.PI / 2;
    face.position.y = -0.27;
    face.castShadow = true;
    this.racket.add(face);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 14), mat(side === 1 ? 0xffcc33 : 0xe2453c));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.27;
    this.racket.add(rim);
    this.racket.rotation.x = Math.PI; // la pala apunta hacia arriba desde la mano
    this.armR.add(this.racket);

    this.facing = side === 1 ? Math.PI : 0;
    this.root.rotation.y = this.facing;
    this.target = null;
    this.vel = { x: 0, z: 0 };
    this.moveDelay = 0;
    this.speed = C.PLAYER_SPEED;
    this.runPhase = 0;
    this.swingT = -1;
    this.swingDur = 0.32;
    this.swingKind = 'drive';
    this.celebrate = 0;
    this.idlePose();
  }

  get armR() { return this.arms[0]; } // derecha = -x local (mira a +z)
  get armL() { return this.arms[1]; }
  get pos() { return this.root.position; }

  idlePose() {
    this.armR.rotation.set(IDLE.ax, 0, IDLE.az);
    this.armL.rotation.set(IDLE.lx, 0, 0.15);
    this.body.rotation.y = 0;
  }

  // delay: s de juego antes de empezar a moverse (reacción)
  moveTo(x, z, delay = 0) {
    this.target = { x: Math.max(-4.75, Math.min(4.75, x)), z: Math.max(-9.75, Math.min(9.75, z)) };
    this.moveDelay = delay;
  }

  // hold: fracción del golpe donde se queda esperando (preparación en la fase de impacto)
  swing(kind = 'drive', hold = null) {
    this.swingKind = kind;
    this.swingT = 0;
    this.hold = hold;
  }

  release() { this.hold = null; }

  update(dt) {
    // Desplazamiento con aceleración y frenada (llegada suave al objetivo)
    if (this.moveDelay > 0) this.moveDelay -= dt;
    let wx = 0, wz = 0;
    if (this.target && !(this.moveDelay > 0)) {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.02) {
        const want = Math.min(this.speed, Math.sqrt(2 * C.PLAYER_DECEL * d));
        wx = (dx / d) * want;
        wz = (dz / d) * want;
      }
    }
    const ax = wx - this.vel.x, az = wz - this.vel.z;
    const al = Math.hypot(ax, az);
    const maxA = C.PLAYER_ACCEL * dt;
    const k = al > maxA && al > 0 ? maxA / al : 1;
    this.vel.x += ax * k;
    this.vel.z += az * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.35;
    if (moving) this.runPhase += dt * 14;
    else this.runPhase *= 0.8;
    const sw = Math.sin(this.runPhase) * (moving ? 0.7 : 0);
    this.legs[0].rotation.x = sw;
    this.legs[1].rotation.x = -sw;
    this.body.position.y = moving ? Math.abs(Math.cos(this.runPhase)) * 0.06 : 0;

    // Celebración: saltitos
    if (this.celebrate > 0) {
      this.celebrate -= dt;
      this.target = null;
      this.body.position.y = Math.abs(Math.sin(this.celebrate * 12)) * 0.25;
      this.arms[0].rotation.set(-2.8, 0, -0.3);
      this.arms[1].rotation.set(-2.8, 0, 0.3);
      return;
    }

    // Golpe: interpolación entre poses clave (reposo → preparación → contacto → terminación → reposo)
    if (this.swingT >= 0) {
      const P = POSES[this.swingKind] || POSES.drive;
      this.swingT += dt / (P.dur || 0.36);
      if (this.hold != null) this.swingT = Math.min(this.swingT, this.hold);
      const u = Math.min(1, this.swingT);
      let a, b, k;
      if (u < 0.35) [a, b, k] = [IDLE, P.prep, u / 0.35];
      else if (u < 0.5) [a, b, k] = [P.prep, P.hit, (u - 0.35) / 0.15];
      else if (u < 0.75) [a, b, k] = [P.hit, P.follow, (u - 0.5) / 0.25];
      else [a, b, k] = [P.follow, IDLE, (u - 0.75) / 0.25];
      const e = k * k * (3 - 2 * k);
      const g = (key) => (a[key] ?? IDLE[key]) + ((b[key] ?? IDLE[key]) - (a[key] ?? IDLE[key])) * e;
      this.armR.rotation.set(g('ax'), 0, g('az'));
      this.armL.rotation.set(g('lx'), 0, 0.15);
      this.body.rotation.y = g('by');
      this.body.position.y = Math.max(this.body.position.y, g('jump'));
      if (u >= 1) {
        this.swingT = -1;
        this.idlePose();
      }
    } else {
      this.armL.rotation.x = -0.3 - sw * 0.6;
    }
    if (!moving) this.root.rotation.y = this.facing;
    else this.root.rotation.y = this.facing + Math.max(-0.4, Math.min(0.4, this.vel.x * this.side * 0.08));
  }
}
