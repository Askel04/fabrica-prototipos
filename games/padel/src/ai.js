// Comportamiento de los jugadores sin bola: formaciones (red/fondo), esquivar remates y perseguir bolas que salen.
import { CONFIG as C } from './config.js';
import { sideOf } from './physics.js';

/** Coloca a la pareja en red o fondo, cerrando un poco hacia el lado de la bola. */
export function moveTeam(team, mode, ballX = 0, delay = 0) {
  const side = team[0].side;
  const z = side * (mode === 'net' ? C.NET_Z : C.HOME_BACK_Z);
  team.forEach((p, i) => p.moveTo((i === 0 ? -C.HOME_X : C.HOME_X) + ballX * 0.25, z, delay));
}

/**
 * Los jugadores que no golpean se apartan si una bola rápida les va a pasar cerca antes de botar.
 * Devuelve cuántos esquivan (para pruebas).
 */
export function dodge(path, players, recvSide, skip = null) {
  const s = path.samples;
  if (s.length < 3) return 0;
  const sp = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y, s[1].z - s[0].z) / path.dt;
  if (sp < C.DODGE_SPEED) return 0;
  let n = 0;
  for (const p of players) {
    if (p === skip) continue;
    let best = Infinity, bi = -1;
    for (let i = 1; i < s.length; i++) {
      const q = s[i];
      if (q.y < C.BALL_R * 2 && i > 2) break; // primer bote
      if (sideOf(q.z) !== recvSide || q.y > 1.9) continue;
      const d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z);
      if (d < best) { best = d; bi = i; }
    }
    if (best < C.DODGE_DIST && bi > 0) {
      // Apartarse en perpendicular a la trayectoria, hacia el lado donde ya está
      const a = s[bi - 1], b = s[bi];
      const vx = b.x - a.x, vz = b.z - a.z;
      const l = Math.hypot(vx, vz) || 1;
      let nx = -vz / l, nz = vx / l;
      if ((p.pos.x - b.x) * nx + (p.pos.z - b.z) * nz < 0) { nx = -nx; nz = -nz; }
      p.moveTo(p.pos.x + nx * 1.4, p.pos.z + nz * 1.4, C.DODGE_REACTION);
      n++;
    }
  }
  return n;
}

/** Si la bola va a salir por 3 o por 4, los defensores corren hacia la salida (aunque no lleguen). */
export function chaseExit(path, outcome, team) {
  const e = path.events.find((ev) => ev.type === 'out') || path.events[path.events.length - 1];
  if (!e) return;
  team.forEach((p, i) => p.moveTo(e.x + (i ? 0.8 : -0.8), e.z, 0.1 + i * 0.15));
}
