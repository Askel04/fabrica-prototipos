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
    this.armR.rotation.set(-0.5, 0, -0.15);
    this.armL.rotation.set(-0.3, 0, 0.15);
    this.body.rotation.y = 0;
  }

  moveTo(x, z) { this.target = { x, z }; }

  swing(kind = 'drive') {
    this.swingKind = kind;
    this.swingT = 0;
  }

  update(dt) {
    // Desplazamiento
    let moving = false;
    if (this.target) {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.03) {
        const step = Math.min(d, this.speed * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        moving = true;
      }
    }
    if (moving) this.runPhase += dt * 14;
    else this.runPhase *= 0.8;
    const sw = Math.sin(this.runPhase) * (moving ? 0.7 : 0);
    this.legs[0].rotation.x = sw;
    this.legs[1].rotation.x = -sw;
    this.body.position.y = moving ? Math.abs(Math.cos(this.runPhase)) * 0.06 : 0;

    // Celebración: saltitos
    if (this.celebrate > 0) {
      this.celebrate -= dt;
      this.body.position.y = Math.abs(Math.sin(this.celebrate * 12)) * 0.25;
      this.arms[0].rotation.set(-2.8, 0, -0.3);
      this.arms[1].rotation.set(-2.8, 0, 0.3);
      return;
    }

    // Golpe
    if (this.swingT >= 0) {
      this.swingT += dt / this.swingDur;
      const u = Math.min(1, this.swingT);
      const smash = this.swingKind === 'smash';
      // 0-0.35 preparación, 0.35-0.6 golpe, 0.6-1 terminación
      let ax, by;
      if (u < 0.35) {
        const k = u / 0.35;
        ax = smash ? -0.5 - 2.6 * k : -0.5 + 1.3 * k;
        by = 0.7 * k;
      } else if (u < 0.6) {
        const k = (u - 0.35) / 0.25;
        ax = smash ? -3.1 + 2.6 * k : 0.8 - 2.8 * k;
        by = 0.7 - 1.4 * k;
      } else {
        const k = (u - 0.6) / 0.4;
        ax = smash ? -0.5 : -2.0 + 1.5 * k;
        by = -0.7 + 0.7 * k;
      }
      this.armR.rotation.set(ax, 0, -0.15);
      this.body.rotation.y = by;
      if (u >= 1) {
        this.swingT = -1;
        this.idlePose();
      }
    } else {
      this.armL.rotation.x = -0.3 - sw * 0.6;
    }
    if (!moving) this.root.rotation.y = this.facing;
    else this.root.rotation.y = this.facing + Math.max(-0.4, Math.min(0.4, ((this.target.x - this.pos.x) * this.side) * 0.3));
  }
}
