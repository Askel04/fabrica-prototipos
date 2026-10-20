// Física de la bola: gravedad, rozamiento, Magnus simplificado y rebotes en suelo, cristal, malla y red.
// Todo en objetos planos {x, y, z} para poder simular trayectorias completas por adelantado.
import { CONFIG as C } from './config.js';

const HALF_W = C.COURT_W / 2;
const HALF_L = C.COURT_L / 2;
const GLASS_START = HALF_L - C.SIDE_GLASS_LEN;

export const sideOf = (z) => (z >= 0 ? 1 : -1); // 1 = jugador, -1 = rival

function accel(v, spin, side, out) {
  const sp = Math.hypot(v.x, v.y, v.z) || 1e-6;
  out.x = -C.DRAG * sp * v.x;
  out.y = -C.DRAG * sp * v.y - C.GRAVITY;
  out.z = -C.DRAG * sp * v.z;
  if (spin) {
    // n = componente de "arriba" perpendicular a la velocidad
    const ux = v.x / sp, uy = v.y / sp, uz = v.z / sp;
    let nx = -uy * ux, ny = 1 - uy * uy, nz = -uy * uz;
    const nl = Math.hypot(nx, ny, nz);
    if (nl > 1e-4) {
      const k = (-C.MAGNUS * spin * sp) / nl; // liftado (+) empuja hacia abajo
      out.x += nx * k; out.y += ny * k; out.z += nz * k;
    }
  }
  if (side) {
    // lateral = v x up (horizontal, perpendicular a la velocidad)
    const lx = -v.z, lz = v.x;
    const ll = Math.hypot(lx, lz);
    if (ll > 1e-4) {
      const k = (C.SIDE_MAGNUS * side * sp) / ll;
      out.x += lx * k; out.z += lz * k;
    }
  }
}

function wallBounce(b, axis, e, f, glass) {
  // axis: 'x' o 'z' (normal del muro). En el cristal el efecto cambia la salida:
  // cortado (spin < 0) sale muerto y hacia abajo; liftado (spin > 0) sale vivo y sube.
  const other = axis === 'x' ? 'z' : 'x';
  const vn = Math.abs(b.v[axis]);
  const s = glass ? b.spin : 0;
  const ee = Math.min(0.95, Math.max(0.2, e + C.SPIN_GLASS_E * s));
  b.v[axis] = -b.v[axis] * ee;
  b.v[other] *= f;
  b.v.y = b.v.y * f + C.SPIN_GLASS_LIFT * s * vn;
  b.spin *= 0.6;
}

/**
 * Simula una bola desde el estado dado y devuelve muestras y eventos.
 * events: {t, type: 'ground'|'wall'|'net'|'cross'|'out'|'rest', x, y, z, wall?}
 */
export function simulate(start, maxT = C.SIM_MAX_T) {
  const b = {
    p: { ...start.p },
    v: { ...start.v },
    spin: start.spin || 0,
    side: start.side || 0,
  };
  const samples = [{ ...b.p }];
  const events = [];
  const a = { x: 0, y: 0, z: 0 };
  const dt = C.SIM_DT;
  const every = Math.round(C.SAMPLE_DT / dt);
  let t = 0;
  let step = 0;
  const ev = (type, extra) => events.push({ t, type, x: b.p.x, y: b.p.y, z: b.p.z, ...extra });

  while (t < maxT) {
    accel(b.v, b.spin, b.side, a);
    const pz = b.p.z;
    b.v.x += a.x * dt; b.v.y += a.y * dt; b.v.z += a.z * dt;
    b.p.x += b.v.x * dt; b.p.y += b.v.y * dt; b.p.z += b.v.z * dt;
    t += dt;

    // Red
    if (sideOf(pz) !== sideOf(b.p.z) && Math.abs(b.p.x) <= HALF_W) {
      if (b.p.y < C.NET_H + C.BALL_R) {
        b.p.z = pz >= 0 ? C.BALL_R : -C.BALL_R;
        b.v.z = -b.v.z * C.NET_E;
        b.v.x *= 0.5;
        b.spin = 0;
        ev('net');
      } else {
        ev('cross', { to: sideOf(b.p.z) });
      }
    }

    // Suelo
    if (b.p.y < C.BALL_R && b.v.y < 0) {
      b.p.y = C.BALL_R;
      ev('ground');
      // Bote vivo en impactos muy verticales y fuertes (remates): permite sacar la bola por 3 o por 4
      const hard = Math.min(1, Math.max(0, (-b.v.y - C.HARD_BOUNCE_VY) / C.HARD_BOUNCE_RANGE));
      const e = Math.max(0.2, C.GROUND_E + C.SPIN_BOUNCE_E * b.spin + C.HARD_BOUNCE_E * hard);
      const f = Math.max(0.3, C.GROUND_FRICTION + C.SPIN_BOUNCE_H * b.spin);
      b.v.y = -b.v.y * e;
      b.v.x *= f; b.v.z *= f;
      b.spin *= b.spin < 0 ? C.SPIN_DECAY_BOUNCE_BACK : C.SPIN_DECAY_BOUNCE;
      b.side *= C.SPIN_DECAY_BOUNCE;
      if (b.v.y < 0.6) {
        ev('rest');
        break;
      }
    }

    // Cristal de fondo
    if (Math.abs(b.p.z) + C.BALL_R > HALF_L && b.p.z * b.v.z > 0) {
      if (b.p.y < C.BACK_WALL_H) {
        b.p.z = Math.sign(b.p.z) * (HALF_L - C.BALL_R);
        wallBounce(b, 'z', C.GLASS_E, C.GLASS_FRICTION, true);
        ev('wall', { wall: 'back' });
      } else if (Math.abs(b.p.z) > HALF_L + 0.3) {
        ev('out', { wall: 'back' });
        break;
      }
    }

    // Laterales: cristal cerca del fondo, malla en el centro
    if (Math.abs(b.p.x) + C.BALL_R > HALF_W && b.p.x * b.v.x > 0) {
      const glass = Math.abs(b.p.z) > GLASS_START;
      const h = glass ? C.SIDE_GLASS_H : C.SIDE_MESH_H;
      if (b.p.y < h) {
        b.p.x = Math.sign(b.p.x) * (HALF_W - C.BALL_R);
        if (glass) wallBounce(b, 'x', C.GLASS_E, C.GLASS_FRICTION, true);
        else wallBounce(b, 'x', C.MESH_E, C.MESH_FRICTION);
        ev('wall', { wall: glass ? 'side' : 'mesh' });
      } else if (Math.abs(b.p.x) > HALF_W + 0.3) {
        ev('out', { wall: 'side' });
        break;
      }
    }

    step++;
    if (step % every === 0) samples.push({ ...b.p });
  }
  samples.push({ ...b.p });
  return { samples, events, dt: C.SAMPLE_DT, duration: t };
}

/** Posición interpolada en un camino simulado. */
export function sampleAt(path, t, out = { x: 0, y: 0, z: 0 }) {
  const s = path.samples;
  const f = Math.max(0, t / path.dt);
  const i = Math.min(Math.floor(f), s.length - 1);
  const j = Math.min(i + 1, s.length - 1);
  const k = Math.min(1, f - i);
  out.x = s[i].x + (s[j].x - s[i].x) * k;
  out.y = s[i].y + (s[j].y - s[i].y) * k;
  out.z = s[i].z + (s[j].z - s[i].z) * k;
  return out;
}

/** Vuelo rápido hasta el primer bote: dónde cae y si pasa la red. */
function flight(p, v, spin, side) {
  const b = { p: { ...p }, v: { ...v } };
  const a = { x: 0, y: 0, z: 0 };
  const dt = 1 / 120;
  let cleared = true;
  let crossed = false;
  for (let t = 0; t < 5; t += dt) {
    accel(b.v, spin, side, a);
    const pz = b.p.z;
    b.v.x += a.x * dt; b.v.y += a.y * dt; b.v.z += a.z * dt;
    b.p.x += b.v.x * dt; b.p.y += b.v.y * dt; b.p.z += b.v.z * dt;
    if (sideOf(pz) !== sideOf(b.p.z)) {
      crossed = true;
      if (b.p.y < C.NET_H + C.BALL_R + C.NET_CLEARANCE) cleared = false;
    }
    if (b.p.y <= C.BALL_R) return { x: b.p.x, z: b.p.z, cleared: cleared && crossed, t };
  }
  return { x: b.p.x, z: b.p.z, cleared: false, t: 5 };
}

/**
 * Resuelve la velocidad inicial para que la bola bote en `target` saliendo de `p`.
 * Devuelve {v, speed, angle, reachable}.
 * speed: velocidad deseada (se sube si no llega), spin/side: efecto, devRad: desvío lateral.
 */
export function solveShot(p, target, speed, spin = 0, side = 0, devRad = 0, branch = 'low') {
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const D = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz) + devRad;
  const hx = Math.sin(yaw), hz = Math.cos(yaw);

  const tryAngle = (deg, sp) => {
    const r = (deg * Math.PI) / 180;
    const v = { x: hx * Math.cos(r) * sp, y: Math.sin(r) * sp, z: hz * Math.cos(r) * sp };
    const f = flight(p, v, spin, side);
    const L = (f.x - p.x) * hx + (f.z - p.z) * hz;
    return { v, L, cleared: f.cleared };
  };

  if (branch === 'high') {
    // Globo: el ángulo alto (bajando desde 75°) que llega a la distancia pedida
    for (let attempt = 0; attempt < 8; attempt++) {
      const sp = speed * (1 + attempt * 0.12);
      for (let deg = 75; deg >= 30; deg -= 1) {
        const r = tryAngle(deg, sp);
        if (r.cleared && r.L >= D) {
          let lo = deg, hi = deg + 1, res = r;
          for (let i = 0; i < 8; i++) {
            const mid = (lo + hi) / 2;
            const m = tryAngle(mid, sp);
            if (m.cleared && m.L >= D) { lo = mid; res = m; } else hi = mid;
          }
          return { v: res.v, speed: sp, angle: lo, reachable: Math.abs(res.L - D) < 0.6 };
        }
      }
    }
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const sp = speed * (1 + attempt * 0.12);
    let prev = null;
    let best = null;
    for (let deg = -45; deg <= 65; deg += 1) {
      const r = tryAngle(deg, sp);
      if (r.cleared && (!best || r.L > best.L)) best = { ...r, deg };
      if (r.cleared && r.L >= D) {
        // Afinar entre el ángulo anterior y este
        let lo = prev && prev.cleared ? prev.deg : deg - 1;
        let hi = deg;
        let res = r;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const m = tryAngle(mid, sp);
          if (m.cleared && m.L >= D) { hi = mid; res = m; } else lo = mid;
        }
        return { v: res.v, speed: sp, angle: hi, reachable: Math.abs(res.L - D) < 0.6 };
      }
      prev = { ...r, deg };
      // Si ya pasamos el máximo alcance, no sirve seguir subiendo en esta velocidad
      if (best && r.cleared && r.L < best.L - 0.5 && deg > 30) break;
    }
  }
  const r = tryAngle(35, speed * 1.8);
  return { v: r.v, speed: speed * 1.8, angle: 35, reachable: false };
}

/** Velocidad a partir de rumbo (rad, 0 = +z), elevación (rad) y módulo. */
export function launch(yaw, elev, speed) {
  return {
    x: Math.sin(yaw) * Math.cos(elev) * speed,
    y: Math.sin(elev) * speed,
    z: Math.cos(yaw) * Math.cos(elev) * speed,
  };
}
