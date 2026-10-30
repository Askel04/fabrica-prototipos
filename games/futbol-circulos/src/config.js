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
  JOY_FIXED_MARGIN: 34, // margen del joystick fijo al borde izquierdo
  JOY_FIXED_MARGIN_Y: 80, // y al borde inferior (más alto, para que el dedo no se salga de la pantalla)
  KICK_BTN_RADIUS: 46, // botón de tiro (modo Botón)
  KICK_BTN_MARGIN: 34,
  KICK_BTN_SLOP: 12, // margen extra de acierto alrededor del botón
  PAUSE_BTN_SIZE: 40,
  PAUSE_BTN_MARGIN: 12,

  // IA: un solo cerebro (src/ai/brain.js); cada nivel son diales, como en los juegos de EA.
  AI_ARRIVE: 30, // distancia a la que la IA empieza a frenar al llegar a un punto
  // Dificultad = un único θ ∈ [0, 1] que interpola todos los diales (src/ai/params.js).
  // La dificultad del menú cambia a los rivales; tus compañeros usan siempre el perfil 'mate'.
  // Escalera de niveles (fase 4; tools/levels.mjs): cada uno gana ~70 % de los partidos decididos
  // al de debajo. l1 → divisiones bajas del modo carrera, l6 = experto. Menú: Fácil/Normal/Difícil.
  AI_LEVELS: {
    l1: { theta: 0.05 },
    l2: { theta: 0.2 },
    l3: { theta: 0.4 },
    l4: { theta: 0.6 },
    l5: { theta: 0.8 },
    l6: { theta: 1 },
    easy: { theta: 0.2 },
    normal: { theta: 0.6 },
    hard: { theta: 1 },
    mate: { theta: 0.8 },
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
