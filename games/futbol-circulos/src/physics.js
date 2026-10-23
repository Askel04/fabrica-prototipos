// Motor de física propio tipo Haxball: discos, segmentos y postes. Sin Phaser.
import { CONFIG as C } from './config.js';

export function makeDisc(x, y, r, invMass, damping, bCoef) {
  return { x, y, px: x, py: y, vx: 0, vy: 0, r, invMass, damping, bCoef };
}

export class World {
  constructor() {
    this.discs = []; // móviles (jugadores y balón)
    this.ballSegments = []; // líneas del campo y red (solo balón)
    this.posts = []; // discos fijos
    this.onPostHit = null;
    this.buildStadium();
  }

  buildStadium() {
    const W = C.FIELD_W, H = C.FIELD_H, G = C.GOAL_HALF, D = C.GOAL_DEPTH;
    const seg = (x1, y1, x2, y2) => this.ballSegments.push({ x1, y1, x2, y2 });
    seg(-W, -H, W, -H);
    seg(-W, H, W, H);
    for (const s of [-1, 1]) {
      seg(s * W, -H, s * W, -G);
      seg(s * W, G, s * W, H);
      // red: laterales y fondo
      seg(s * W, -G, s * (W + D), -G);
      seg(s * W, G, s * (W + D), G);
      seg(s * (W + D), -G, s * (W + D), G);
      for (const t of [-1, 1]) {
        this.posts.push(makeDisc(s * W, t * G, C.POST_RADIUS, 0, 1, C.POST_BCOEF));
      }
    }
  }

  step() {
    for (const d of this.discs) {
      d.px = d.x;
      d.py = d.y;
      d.vx *= d.damping;
      d.vy *= d.damping;
      const max = d.isBall ? C.BALL_MAX_SPEED : C.PLAYER_MAX_SPEED;
      const sp = Math.hypot(d.vx, d.vy);
      if (sp > max) {
        d.vx *= max / sp;
        d.vy *= max / sp;
      }
    }
    const n = C.SUBSTEPS;
    for (let s = 0; s < n; s++) {
      for (const d of this.discs) {
        d.x += d.vx / n;
        d.y += d.vy / n;
      }
      this.collide();
    }
  }

  collide() {
    const ds = this.discs;
    for (let i = 0; i < ds.length; i++) {
      for (let j = i + 1; j < ds.length; j++) discDisc(ds[i], ds[j]);
    }
    for (const d of ds) {
      for (const p of this.posts) {
        if (discDisc(d, p) && d.isBall) this.onPostHit?.(d);
      }
      if (d.isBall) {
        for (const sg of this.ballSegments) discSegment(d, sg, C.WALL_BCOEF);
      } else {
        boxClamp(d, C.OUTER_W, C.OUTER_H);
      }
      if (d.clamp) d.clamp(d);
    }
  }
}

// Colisión círculo-círculo con impulso ponderado por invMass. Devuelve true si chocan.
export function discDisc(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const rr = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0) return false;
  const im = a.invMass + b.invMass;
  if (im === 0) return false;
  const dist = Math.sqrt(d2);
  const nx = dx / dist, ny = dy / dist;
  const pen = rr - dist;
  const ka = a.invMass / im, kb = b.invMass / im;
  a.x -= nx * pen * ka;
  a.y -= ny * pen * ka;
  b.x += nx * pen * kb;
  b.y += ny * pen * kb;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn < 0) {
    const j = (-(1 + a.bCoef * b.bCoef) * vn) / im;
    a.vx -= nx * j * a.invMass;
    a.vy -= ny * j * a.invMass;
    b.vx += nx * j * b.invMass;
    b.vy += ny * j * b.invMass;
  }
  return true;
}

// Colisión disco-segmento estático (punto más cercano).
function discSegment(d, s, bCoef) {
  const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
  const len2 = ex * ex + ey * ey;
  let t = ((d.x - s.x1) * ex + (d.y - s.y1) * ey) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = s.x1 + ex * t, cy = s.y1 + ey * t;
  const dx = d.x - cx, dy = d.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= d.r * d.r || d2 === 0) return;
  const dist = Math.sqrt(d2);
  const nx = dx / dist, ny = dy / dist;
  d.x += nx * (d.r - dist);
  d.y += ny * (d.r - dist);
  const vn = d.vx * nx + d.vy * ny;
  if (vn < 0) {
    const k = (1 + d.bCoef * bCoef) * vn;
    d.vx -= nx * k;
    d.vy -= ny * k;
  }
}

function boxClamp(d, W, H) {
  if (d.x < -W + d.r) { d.x = -W + d.r; if (d.vx < 0) d.vx = 0; }
  if (d.x > W - d.r) { d.x = W - d.r; if (d.vx > 0) d.vx = 0; }
  if (d.y < -H + d.r) { d.y = -H + d.r; if (d.vy < 0) d.vy = 0; }
  if (d.y > H - d.r) { d.y = H - d.r; if (d.vy > 0) d.vy = 0; }
}
