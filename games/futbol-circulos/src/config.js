// Parámetros del juego: tamaños, velocidades, dificultad.
// Unidades = las del formato de estadios de Haxball (estadio "Classic").
// Diales comunes a todos los niveles de IA (cada nivel sobrescribe lo que cambia).
const AI_BASE = {
  kickAngle: 0.12, // alineación (rad) para chutar o pasar
  possessEdge: 12, // distancia borde-balón para considerar que alguien lo tiene
  contestDist: 12, // rival a esta distancia del balón = balón disputado
  dangerDist: 115, // cerca de la propia portería: pase seguro o despeje
  shootRange: 330,
  softPass: 130, // pases más cortos que esto van con empujón, no con chute
  holdTicks: 80, // puede conducir ~1,3 s si no le presionan
  decideTicks: 14, // cada cuánto replantea la conducción
  dribbleSpeed: 0.85,
  requestBonus: 2, // extra a pasar al humano cuando pide el balón
  anchorX: 90, // el portero se adelanta hasta aquí cuando su equipo ataca
};

export const CONFIG = {
  WIDTH: 860,
  HEIGHT: 440,
  BG_COLOR: '#3e4a33',
  VIEW_OFFSET_Y: 8, // desplaza el campo hacia abajo para dejar sitio al marcador

  // Física
  TICK_HZ: 60,
  SUBSTEPS: 4, // subiteraciones de colisión por tick
  MAX_TICKS_PER_FRAME: 5,

  // Campo (medidas desde el centro)
  FIELD_W: 370, // semiancho de la zona de juego (740)
  FIELD_H: 170, // semialto (340)
  OUTER_W: 420, // límite exterior para jugadores
  OUTER_H: 200,
  GOAL_HALF: 64, // semiancho de portería (128)
  GOAL_DEPTH: 30, // profundidad de la red
  POST_RADIUS: 8,
  CENTER_RADIUS: 80,
  WALL_BCOEF: 1,
  POST_BCOEF: 1,

  // Jugador
  PLAYER_RADIUS: 15,
  PLAYER_INV_MASS: 0.5,
  PLAYER_DAMPING: 0.96,
  PLAYER_ACCEL: 0.1,
  PLAYER_KICK_ACCEL: 0.07, // aceleración con el chute pulsado
  PLAYER_KICK_DAMPING: 0.96, // damping con el chute pulsado
  PLAYER_BCOEF: 0.5,
  PLAYER_MAX_SPEED: 4,

  // Balón
  BALL_RADIUS: 10,
  BALL_INV_MASS: 1,
  BALL_DAMPING: 0.99,
  BALL_BCOEF: 0.5,
  BALL_MAX_SPEED: 12,

  // Chute
  KICK_STRENGTH: 5,
  KICK_DIST: 4, // distancia máxima entre bordes jugador-balón

  // Controles
  JOY_RADIUS: 55, // recorrido máximo del joystick (unidades de juego)
  JOY_DEADZONE: 0.12, // fracción del radio
  JOY_FOLLOW: true, // la base sigue al pulgar si se pasa del radio
  JOY_FIXED_MARGIN: 34, // margen del joystick fijo a la esquina inferior izquierda
  KICK_BTN_RADIUS: 46, // botón de tiro (modo Botón)
  KICK_BTN_MARGIN: 34,
  KICK_BTN_SLOP: 12, // margen extra de acierto alrededor del botón
  PAUSE_BTN_SIZE: 40,
  PAUSE_BTN_MARGIN: 12,

  // IA: un solo cerebro (src/ai/brain.js); cada nivel son diales, como en los juegos de EA.
  AI_ARRIVE: 30, // distancia a la que la IA empieza a frenar al llegar a un punto
  // La dificultad del menú cambia a los rivales; tus compañeros usan siempre el perfil 'mate'.
  AI_LEVELS: {
    easy: {
      ...AI_BASE,
      reactionMs: 250, thinkMs: 120, noise: 16, temperature: 0.4, aim: 0.13, // reacción, ruido, decisiones, puntería
      shotAngle: 0.2, oppReact: 10,
      through: false, wallPass: false, oneTwo: false, drop: false, fakes: false, // inteligencia en ataque
      pressSpeed: 0.8, coverSpeed: 0.85, shade: 0, standOff: 24, bodyBlock: false, laneCut: false, shift: false, pinch: 0.25, // en defensa
      sweepRange: 110, keeperDare: -6, keeperOut: 0.1, keeperMaxOut: 30, keeperRush: 70, // portero
    },
    normal: {
      ...AI_BASE,
      reactionMs: 160, thinkMs: 90, noise: 8, temperature: 0.2, aim: 0.08,
      shotAngle: 0.14, oppReact: 7,
      through: true, wallPass: false, oneTwo: true, drop: false, fakes: false,
      pressSpeed: 1, coverSpeed: 1, shade: 0.3, standOff: 40, bodyBlock: false, laneCut: false, shift: true, pinch: 0.45,
      sweepRange: 170, keeperDare: 2, keeperOut: 0.18, keeperMaxOut: 60, keeperRush: 110,
    },
    hard: {
      ...AI_BASE,
      reactionMs: 60, thinkMs: 40, noise: 1.5, temperature: 0.04, aim: 0.03,
      shotAngle: 0.1, oppReact: 5,
      through: true, wallPass: true, oneTwo: true, drop: true, fakes: true,
      pressSpeed: 1, coverSpeed: 1, shade: 0.45, standOff: 36, bodyBlock: true, laneCut: true, shift: true, pinch: 0.8,
      sweepRange: 220, keeperDare: 4, keeperOut: 0.24, keeperMaxOut: 85, keeperRush: 140,
    },
    // compañeros del humano: buen nivel y muy pendientes de jugar contigo
    mate: {
      ...AI_BASE,
      reactionMs: 70, thinkMs: 50, noise: 2, temperature: 0.06, aim: 0.035,
      shotAngle: 0.12, oppReact: 6,
      through: true, wallPass: true, oneTwo: true, drop: true, fakes: false,
      pressSpeed: 1, coverSpeed: 1, shade: 0.4, standOff: 38, bodyBlock: true, laneCut: true, shift: true, pinch: 0.6,
      sweepRange: 200, keeperDare: 3, keeperOut: 0.22, keeperMaxOut: 75, keeperRush: 130,
    },
  },

  // Reglas
  GOAL_PAUSE_MS: 1500,

  // Dibujo
  COLOR_FIELD: 0x718c5a,
  COLOR_LINES: 0xc7e6bd,
  COLOR_RED: 0xe56e56,
  COLOR_BLUE: 0x5689e5,
  COLOR_BALL: 0xffffff,
  COLOR_BORDER: 0x000000,
  BORDER_WIDTH: 2,
  RING_ALPHA_IDLE: 0.25,
  RING_ALPHA_KICK: 0.9,

  // Juice
  VIBRATE_MS: 20,
  SOUND_KICK: 520,
  SOUND_POST: 180,
  SOUND_GOAL: 880,
  SOUND_DURATION: 0.06,

  DEBUG: false, // también se activa con ?debug en la URL
};
