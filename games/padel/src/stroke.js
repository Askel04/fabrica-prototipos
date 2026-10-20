// Análisis del deslizamiento sobre la bola (vista lateral).
// Punto de contacto = pie de la perpendicular del centro de la bola sobre la línea del trazo (limitado al radio).
// Efecto continuo: spin = -(p x u) / (r |u|). Atravesar el centro = plano; rozar por arriba o subir por detrás = liftado;
// pasar por debajo o bajar por detrás = cortado. Es un abanico, nunca 100/0.
import { CONFIG as C } from './config.js';

/**
 * a, b: inicio y fin del trazo en píxeles (y hacia abajo). c: centro de la bola. r: radio en píxeles.
 * fwd: +1 si el campo rival queda a la derecha de la pantalla, -1 si a la izquierda.
 * Devuelve {whiff, dist, contact:{x,y}, spin, angle, tang, backward}.
 */
export function analyzeStroke(a, b, c, r, fwd = 1) {
  // A coordenadas con y hacia arriba y "adelante" = +x
  let ux = (b.x - a.x) * fwd;
  const uy = -(b.y - a.y);
  const len = Math.hypot(ux, uy) || 1;
  const backward = ux < 0;
  // Un trazo hacia atrás se interpreta como el mismo gesto (el jugador no puede golpear hacia su propio campo)
  if (backward) ux = -ux;
  const ex = ux / len, ey = uy / len;
  const ax = (a.x - c.x) * fwd, ay = -(a.y - c.y);
  const along = ax * ex + ay * ey;
  const px = ax - along * ex, py = ay - along * ey; // del centro al punto más cercano de la línea
  const dist = Math.hypot(px, py) / r;
  const k = Math.min(1, dist) / (dist || 1);
  const cx = (px / r) * k, cy = (py / r) * k; // punto de contacto sobre la bola, en radios
  const cross = cx * ey - cy * ex;
  const tang = Math.min(1, dist);
  const spin = Math.max(-1, Math.min(1, -Math.sign(cross) * Math.pow(Math.abs(cross), C.STROKE_SPIN_CURVE)));
  const angle = (Math.atan2(ey, ex) * 180) / Math.PI;
  return { whiff: dist > C.WHIFF_OFFSET, dist, contact: { x: cx, y: cy }, spin, angle, tang, backward };
}
