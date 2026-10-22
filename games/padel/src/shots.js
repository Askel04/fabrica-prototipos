// Familias de golpe del pádel y cálculo de la salida de la bola (compartido por jugador e IA).
// La flecha da rumbo y % de fuerza; la familia fija rango de velocidad, profundidad y gesto nominal.
// La elevación es la ideal de la familia (solver con efecto) + la desviación del gesto real + el error por calidad.
import { CONFIG as C } from './config.js';
import { solveShot, launch } from './physics.js';

const F = C.SHOTS;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * ctx: {h (altura de contacto), bounced, vyIn (vel. vertical de llegada), speedIn, dNet (distancia a la red), serve}
 * stroke: {spin, angle} del trazo (o simulado por la IA)
 */
export function classify(ctx, stroke) {
  const { spin, angle } = stroke;
  if (ctx.serve) return 'saque';
  const high = ctx.h >= C.SMASH_MIN_H;
  const lobbed = ctx.vyIn < -C.LOBBED_VY; // bola bombeada que cae
  if (high && ctx.dNet <= C.SMASH_MAX_DNET) {
    if (spin < -0.55) return 'vibora';
    if (spin < -0.25) return 'bandeja';
    if (spin > 0.35) return 'rulo';
    return 'remate';
  }
  if ((high || ctx.h >= C.OVERHEAD_MIN_H) && lobbed) {
    if (spin < -0.55) return 'vibora';
    if (spin > 0.35) return 'rulo';
    return 'bandeja';
  }
  if (!ctx.bounced && ctx.h >= C.VOLLEY_MIN_H && (ctx.speedIn > C.VOLLEY_FAST || ctx.dNet < C.VOLLEY_NET_D)) return 'volea';
  if (angle > C.LOB_ANGLE && spin > -0.3 && spin < 0.5) return 'globo';
  if (spin > 0.3) return 'liftado';
  if (spin < -0.3) return 'cortado';
  return 'plano';
}

/**
 * Calcula la velocidad de salida.
 * p: punto de contacto; side: equipo que golpea (1 jugador, -1 rival); yaw: rumbo en el mundo (rad, atan2(dx, dz));
 * power 0-1; family; stroke {spin, angle}; q calidad 0-1; dev desvío extra (rad); stats {power, precision}
 * Devuelve {v, spin, side, speed, family}
 */
export function buildShot({ p, side, yaw, power, family, stroke, q = 1, dev = 0, statPower = 0, statPrecision = 0 }) {
  const f = F[family];
  // Efecto: el del trazo, empujado hacia el signo de la familia
  let spin = clamp(stroke.spin * f.spinScale, -1, 1);
  if (f.spinMin) spin = Math.sign(f.spinMin) * Math.max(Math.abs(spin), Math.abs(f.spinMin));
  const sideSpin = (f.sideSpin || 0) * -side;
  // Un roce convierte parte del golpe en efecto en vez de velocidad
  const graze = stroke.contact ? Math.abs(stroke.spin) * C.GRAZE_SPEED_LOSS : 0;
  const speed = lerp(f.speed[0], f.speed[1], power) * (1 + statPower) * (1 - Math.abs(spin) * C.SPIN_SPEED_FACTOR) * (1 - graze);
  // Profundidad nominal (m desde la red en campo rival). En el remate, más fuerza = bote más cerca de la red.
  const depth = family === 'remate' ? lerp(f.depth[0], f.depth[1], power) : f.depth + (power - 0.5) * f.depthPower;
  // Punto objetivo: rumbo de la flecha hasta la línea de profundidad del campo rival
  const zT = -side * depth;
  const cy = Math.cos(yaw);
  const t = Math.abs(cy) > 0.05 ? (zT - p.z) / cy : 0;
  const target = { x: clamp(p.x + Math.sin(yaw) * Math.max(0, t), -C.COURT_W, C.COURT_W), z: zT };
  if (family === 'saque') target.x = clamp(target.x, -4.7, 4.7);
  const sol = solveShot(p, target, speed, spin, sideSpin, 0, f.branch);
  // Desviación del gesto respecto al nominal y error por mala ejecución
  const err = (1 - q) * (1 - statPrecision);
  const face = faceDelta(stroke, f);
  const elevErr = (face + (Math.random() * 2 - 1) * err * C.ELEV_ERR_DEG) * (Math.PI / 180);
  const yawErr = dev + (Math.random() * 2 - 1) * err * C.YAW_ERR_DEG * (Math.PI / 180);
  const sp = Math.hypot(sol.v.x, sol.v.y, sol.v.z);
  const elev = Math.asin(clamp(sol.v.y / sp, -1, 1)) + elevErr;
  const yaw2 = Math.atan2(sol.v.x, sol.v.z) + yawErr;
  return { v: launch(yaw2, elev, sp * (1 - err * C.SPEED_ERR)), spin, side: sideSpin, speed: sp, family, target, face };
}

/**
 * Ángulo de salida "físico" en la vista lateral (grados, + hacia arriba): la bola sale casi perpendicular a la cara
 * de la pala (del punto de contacto al centro), mezclada con la dirección del brazo (el trazo).
 * Contacto por arriba = cara cerrada = sale hacia abajo; por abajo = cara abierta = sale hacia arriba.
 */
export function faceAngle(stroke) {
  const c = stroke.contact;
  const ql = Math.hypot(c.x, c.y);
  const nx = ql > 0.05 ? -c.x / ql : 1, ny = ql > 0.05 ? -c.y / ql : 0;
  const a = (stroke.angle * Math.PI) / 180;
  const dx = C.FACE_W * nx + (1 - C.FACE_W) * Math.cos(a);
  const dy = C.FACE_W * ny + (1 - C.FACE_W) * Math.sin(a);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Cuánto sube o baja la salida respecto a la ejecución típica de la familia (grados). Sin trazo (IA): 0. */
export function faceDelta(stroke, f) {
  if (!stroke.contact) return 0;
  return clamp((faceAngle(stroke) - f.launchRef) * C.FACE_GAIN, -C.FACE_MAX_DEG, C.FACE_MAX_DEG);
}
