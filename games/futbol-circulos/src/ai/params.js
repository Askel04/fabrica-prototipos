// Dificultad como vector de parámetros interpolado por un único θ ∈ [0, 1] (como Google Research Football).
// Columnas de la tabla del informe: Muy fácil, Fácil, Normal, Difícil, Experto → θ = 0, .25, .5, .75, 1.
// Sin trampas: la física (velocidad, aceleración, potencia) es la misma para todos los niveles.
import { CONFIG as C } from '../config.js';

const GW = C.GOAL_HALF * 2; // ancho de portería (128)

const TABLE = {
  reactionMs: [400, 300, 200, 130, 80], // retardo con el que percibe el mundo
  decisionMs: [600, 400, 250, 150, 100], // cada cuánto reevalúa roles y plan
  noise: [12, 8, 4, 2, 0.5], // ruido de percepción (posición del balón)
  horizonS: [0.3, 0.6, 1.0, 1.5, 2.0], // hasta dónde predice la trayectoria del balón
  aimDeg: [14, 9, 5, 3, 1.5], // ruido del chute a puerta (σ)
  passDeg: [12, 8, 5, 3, 1.5], // ruido del pase (σ)
  alignDeg: [30, 20, 10, 6, 3], // alineación necesaria antes de chutar
  temperature: [1.0, 0.6, 0.35, 0.25, 0.2], // softmax de decisión: alta = elige a veces el 2.º o 3.er plan
  // (sin llegar a 0: una CPU totalmente predecible juega peor y se siente robótica)
  passMarginS: [0, 0.05, 0.12, 0.18, 0.22], // margen de seguridad del pase
  supportSamples: [0, 20, 40, 72, 100], // puntos de desmarque evaluados (0 = zona fija)
  supportHz: [1, 2, 3, 5, 8],
  lastManHold: [0.1, 0.2, 0.35, 0.4, 0.45], // profundidad del último hombre en defensa, ×ancho de portería
  sweep: [0.4, 0.55, 0.8, 0.85, 0.9], // zona en la que el último hombre sale a por el balón, ×ancho de portería
  sweepMarginS: [0.4, 0.3, 0.2, 0.17, 0.15], // ventaja que necesita para salir
  rotHystTicks: [24, 18, 12, 8, 6], // histéresis del orden de rotación
  pressSpeed: [0.75, 0.85, 1, 1, 1], // intensidad de la presión (input, no velocidad máxima)
};

function lerpTable(row, t) {
  const x = Math.max(0, Math.min(1, t)) * (row.length - 1);
  const i = Math.min(row.length - 2, Math.floor(x));
  return row[i] + (row[i + 1] - row[i]) * (x - i);
}

const cache = new Map();

export function levelParams(theta) {
  if (cache.has(theta)) return cache.get(theta);
  const P = { theta };
  for (const [k, row] of Object.entries(TABLE)) P[k] = lerpTable(row, theta);
  const ticks = (ms) => Math.max(1, Math.round((ms * C.TICK_HZ) / 1000));
  P.reactionTicks = ticks(P.reactionMs);
  P.decisionTicks = ticks(P.decisionMs);
  P.horizonTicks = Math.round(P.horizonS * C.TICK_HZ);
  P.passMarginTicks = P.passMarginS * C.TICK_HZ;
  P.sweepMarginTicks = P.sweepMarginS * C.TICK_HZ;
  P.rotHyst = Math.round(P.rotHystTicks);
  P.supportSamples = Math.round(P.supportSamples);
  P.supportTicks = Math.max(1, Math.round(C.TICK_HZ / P.supportHz));
  P.lastManHold *= GW;
  P.sweep *= GW;
  P.aim = (P.aimDeg * Math.PI) / 180;
  P.passAim = (P.passDeg * Math.PI) / 180;
  P.align = (P.alignDeg * Math.PI) / 180;
  // inteligencia en ataque: jugadas que conoce
  P.through = theta >= 0.4; // pase al espacio
  P.oneTwo = theta >= 0.5; // pared
  P.wallPass = theta >= 0.8; // pase a la banda
  P.drop = theta >= 0.8; // dejada atrás al último hombre
  P.fakes = theta >= 0.8; // amagos
  P.oneTouch = theta >= 0.4; // pase de primeras cuando le van a presionar al recibir
  P.pressTriggers = theta >= 0.4; // salta a presionar con los disparadores (si no, espera a distancia)
  P.execCheck = theta >= 0.4; // antes de elegir, comprueba si le da tiempo a ejecutar el golpeo
  // rotación (sin portero): el que actúa vuelve atrás; los demás suben un puesto
  P.rotateBack = theta >= 0.3;
  P.farPost = theta >= 0.6; // vuelve por el lado alejado de la jugada
  P.lastManDepth = 120 + 280 * theta; // hasta dónde sube el 3.º con posesión (desde su portería)
  // inteligencia en defensa
  P.cover = theta >= 0.35; // un segundo jugador cubre la línea de pase
  P.laneCut = theta >= 0.5; // la cobertura corta la línea en vez de marcar al hombre
  P.shift = theta >= 0.5; // basculación hacia el lado del balón
  P.doublePress = theta >= 0.8; // presión con dos cuando el rival saca desde su campo
  P.bodyBlock = theta >= 0.7;
  P.pinch = 0.2 + 0.6 * theta; // prob. de "pinchar" el balón al tenerlo a tiro
  P.standOff = 22 + 16 * Math.min(1, theta / 0.6); // distancia de espera ante un portador que controla
  P.zoneSpeed = 0.7 + 0.3 * theta; // 5v5: disciplina para volver a su puesto
  P.bunch = theta < 0.35; // nivel bajo: se amontonan yendo al balón
  P.adapt = theta >= 0.85; // adaptación al humano (estilo Teamvision)
  P.holdTicks = Math.round(30 + 50 * theta); // cuánto se permite conducir sin presión
  P.commitTicks = Math.round(10 + 14 * theta); // tiempo mínimo de compromiso con un plan
  cache.set(theta, P);
  return P;
}
