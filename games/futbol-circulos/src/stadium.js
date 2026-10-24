// Estadios (medidas desde el centro, como el formato de Haxball). El 3v3 se juega en el clásico
// y el 5v5 en el grande. setStadium() actualiza las medidas de campo de CONFIG que leen la
// física, la IA y el dibujo; se llama al crear cada partido.
import { CONFIG as C } from './config.js';

export const STADIUMS = {
  classic: { FIELD_W: 370, FIELD_H: 170, GOAL_HALF: 64, GOAL_DEPTH: 30, OUTER_W: 420, OUTER_H: 200, CENTER_RADIUS: 80 },
  big: { FIELD_W: 550, FIELD_H: 240, GOAL_HALF: 90, GOAL_DEPTH: 35, OUTER_W: 600, OUTER_H: 275, CENTER_RADIUS: 100 },
};

export const MODES = {
  '3v3': { teamSize: 3, stadium: 'classic' },
  '5v5': { teamSize: 5, stadium: 'big' },
};

export function setStadium(name) {
  Object.assign(C, STADIUMS[name] || STADIUMS.classic);
}

// cuánto más grande es el campo que el clásico (para escalar distancias de la IA)
export function fieldScale() {
  return C.FIELD_W / STADIUMS.classic.FIELD_W;
}
