// Parámetros del juego: tamaños, velocidades, dificultad.
// Unidades = las del formato de estadios de Haxball (estadio "Classic").
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

  // IA
  AI_REACTION_MS: 150, // retardo con el que la IA "ve" el balón
  AI_THINK_MS: 100, // cada cuánto recalcula objetivos
  AI_ROLE_MS: 500, // cada cuánto reasigna roles
  AI_AIM_ERROR: 0.12, // radianes de error de puntería (±)
  AI_KICK_ANGLE: 0.35, // radianes de alineación para chutar
  AI_SHOOT_RANGE: 320, // distancia a portería para chutar a puerta
  AI_ARRIVE: 30, // distancia a la que empieza a frenar
  AI_DEFEND_DIST: 110, // distancia del defensa a su portería
  AI_SUPPORT_Y: 90, // separación lateral del que apoya
  AI_STALL_THINKS: 8, // pensamientos atascado antes de retroceder
  AI_BACKOFF_THINKS: 5,
  AI_SPEED: 1, // multiplicador de magnitud del input IA (≤1)

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
