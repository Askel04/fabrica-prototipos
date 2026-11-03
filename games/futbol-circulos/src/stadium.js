// Estadios (medidas desde el centro, como el formato de Haxball). setStadium() actualiza las
// medidas de campo de CONFIG que leen la física, la IA y el dibujo; se llama al crear cada partido.
// Jugables: barrio, municipal, estadio (el clásico escalado; ×1,45 en 5v5) con su paleta y decorado.
// classic y big son las medidas de antes: las usan herramientas, ejercicios y entrenamientos.
import { CONFIG as C } from './config.js';

const CLASSIC = { FIELD_W: 370, FIELD_H: 170, GOAL_HALF: 64, GOAL_DEPTH: 30, OUTER_W: 420, OUTER_H: 200, CENTER_RADIUS: 80 };
const BIG = { FIELD_W: 550, FIELD_H: 240, GOAL_HALF: 90, GOAL_DEPTH: 35, OUTER_W: 600, OUTER_H: 275, CENTER_RADIUS: 100 };
const FIVE = 1.45; // cuánto más grande es el campo de 5v5 que el de 3v3

// paleta: césped, franjas (alpha), líneas, fondo exterior · deco: tipo de entorno
export const STADIUMS = {
  barrio: { name: 'Barrio', scale: 1.2, grass: 0x5f7448, stripes: 0, lines: 0xe8e8dc, outside: 0x7a7a74, deco: 'wall' },
  municipal: { name: 'Municipal', scale: 1.35, grass: 0x718c5a, stripes: 0.06, lines: 0xc7e6bd, outside: 0x55663f, deco: 'fence' },
  estadio: { name: 'Estadio', scale: 1.5, grass: 0x4f9a45, stripes: 0.08, checks: true, lines: 0xffffff, outside: 0x2c2f3a, deco: 'stands' },
  classic: { name: 'Clásico', dims: CLASSIC, grass: 0x718c5a, stripes: 0.06, lines: 0xc7e6bd, outside: 0x55663f, deco: null },
  big: { name: 'Grande', dims: BIG, grass: 0x718c5a, stripes: 0.06, lines: 0xc7e6bd, outside: 0x55663f, deco: null },
};
export const PLAYABLE = ['barrio', 'municipal', 'estadio'];

export const MODES = {
  '3v3': { teamSize: 3 },
  '5v5': { teamSize: 5 },
};

export let stadium = STADIUMS.classic; // el estadio del partido en curso (paleta y decorado)

export function stadiumDims(name, teamSize = 3) {
  const s = STADIUMS[name] || STADIUMS.classic;
  if (s.dims) return { ...s.dims };
  const k = s.scale * (teamSize >= 5 ? FIVE : 1);
  const r = (v) => Math.round(v * k);
  const W = r(CLASSIC.FIELD_W), H = r(CLASSIC.FIELD_H);
  return {
    FIELD_W: W, FIELD_H: H, GOAL_HALF: r(CLASSIC.GOAL_HALF), GOAL_DEPTH: CLASSIC.GOAL_DEPTH + (teamSize >= 5 ? 5 : 0),
    OUTER_W: W + 50, OUTER_H: H + 30, CENTER_RADIUS: r(CLASSIC.CENTER_RADIUS),
  };
}

export function setStadium(name, teamSize = 3) {
  stadium = STADIUMS[name] || STADIUMS.classic;
  Object.assign(C, stadiumDims(name, teamSize));
}

// cuánto más grande es el campo que el clásico (para escalar distancias de la IA)
export function fieldScale() {
  return C.FIELD_W / CLASSIC.FIELD_W;
}
