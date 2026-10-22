// Análisis del deslizamiento sobre la bola (vista lateral).
// Punto de contacto = donde el trazo entra en el círculo de la bola. El efecto sale de la DIRECCIÓN del trazo
// respecto al centro desde ese punto: apuntar al centro = plano; desviarse hacia arriba = liftado (cepilla la bola
// por encima); desviarse hacia abajo = cortado. Rozar en tangente da el máximo efecto. Es un abanico continuo.
import { CONFIG as C } from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * a, b: inicio y fin del trazo en píxeles (y hacia abajo). c: centro de la bola. r: radio en píxeles.
 * fwd: +1 si el campo rival queda a la derecha de la pantalla, -1 si a la izquierda.
 * Devuelve {whiff, dist, contact:{x,y}, spin, angle, tang, dev, backward}
 * (contact en radios, x hacia el rival e y hacia arriba; dev: grados entre el trazo y la dirección al centro).
 */
export function analyzeStroke(a, b, c, r, fwd = 1) {
  // A coordenadas con y hacia arriba, "adelante" = +x y centradas en la bola
  let ux = (b.x - a.x) * fwd;
  const uy = -(b.y - a.y);
  const len = Math.hypot(ux, uy) || 1;
  const backward = ux < 0;
  // Un trazo hacia atrás se interpreta como el mismo gesto (no se puede golpear hacia el propio campo)
  if (backward) ux = -ux;
  const ex = ux / len, ey = uy / len;
  let ax = (a.x - c.x) * fwd;
  const ay = -(a.y - c.y);
  if (backward) ax = -ax;

  // Distancia mínima de la línea del trazo al centro (para saber si toca la bola)
  const along = -(ax * ex + ay * ey);
  const px = ax + along * ex, py = ay + along * ey;
  const dist = Math.hypot(px, py) / r;

  // Punto de entrada en el círculo
  let qx, qy;
  const a2 = ax * ax + ay * ay;
  if (a2 <= r * r) {
    qx = ax; qy = ay; // empieza dentro de la bola
  } else {
    const bdot = ax * ex + ay * ey;
    const disc = bdot * bdot - (a2 - r * r);
    const t1 = disc >= 0 ? -bdot - Math.sqrt(disc) : -1;
    if (t1 >= 0) {
      qx = ax + t1 * ex; qy = ay + t1 * ey;
    } else {
      // Roza por fuera: punto del borde más cercano a la línea
      const pl = Math.hypot(px, py) || 1;
      qx = (px / pl) * r; qy = (py / pl) * r;
    }
  }
  const ql = Math.hypot(qx, qy);
  // Desvío del trazo respecto a la dirección "hacia el centro" desde el punto de contacto
  let dev = 0;
  if (ql > r * 0.08) {
    const rx = -qx / ql, ry = -qy / ql;
    const cross = rx * ey - ry * ex; // > 0: el trazo gira hacia arriba respecto al centro
    const dot = rx * ex + ry * ey;
    dev = (Math.atan2(cross, dot) * 180) / Math.PI;
  }
  const mag = clamp((Math.abs(dev) - C.STROKE_FLAT_DEG) / (C.STROKE_FULL_DEG - C.STROKE_FLAT_DEG), 0, 1);
  const spin = Math.sign(dev) * Math.pow(mag, C.STROKE_SPIN_CURVE);
  const angle = (Math.atan2(ey, ex) * 180) / Math.PI;
  return {
    whiff: dist > C.WHIFF_OFFSET,
    dist,
    contact: { x: qx / r, y: qy / r },
    spin,
    angle,
    tang: Math.abs(spin),
    dev,
    backward,
  };
}
