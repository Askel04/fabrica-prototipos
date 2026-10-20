// Parámetros del juego: tamaños, velocidades, física, dificultad.
// Unidades: metros, segundos. Eje Z a lo largo de la pista (jugador en z > 0, rival en z < 0).
export const CONFIG = {
  ASPECT: 9 / 16,
  MAX_PIXEL_RATIO: 2,
  BG_COLOR: 0x8fd3ff,

  // Pista
  COURT_L: 20,
  COURT_W: 10,
  SERVICE_LINE: 6.95, // distancia desde la red
  NET_H: 0.88,
  BACK_WALL_H: 4, // cristal 3 m + malla 1 m
  SIDE_GLASS_LEN: 4, // cristal lateral desde el fondo
  SIDE_GLASS_H: 3,
  SIDE_MESH_H: 3,

  // Colores (paleta del GDD)
  COLORS: {
    court: 0x2a6fdb,
    courtOut: 0x1f58b5,
    lines: 0xffffff,
    ground: 0x1b2a4a,
    glass: 0xbfe9ff,
    frame: 0x2b2f3a,
    mesh: 0x20242c,
    net: 0x111111,
    ball: 0xd8f23a,
    skin: 0xf2c9a0,
    team: { shirt: 0xffcc33, shorts: 0x1e2a44, hair: [0x3b2a1a, 0xd9b26a] },
    rival: { shirt: 0xe2453c, shorts: 0xf4f4f4, hair: [0x111111, 0x7a4a24] },
    target: 0xffffff,
  },

  // Física de la bola
  GRAVITY: 9.81,
  DRAG: 0.016, // a = -DRAG * |v| * v
  MAGNUS: 0.3, // a = MAGNUS * spin * |v| (perpendicular a la velocidad)
  SIDE_MAGNUS: 0.15,
  BALL_R: 0.033,
  BALL_VISUAL_R: 0.07, // se dibuja algo más grande para que se lea en móvil
  SIM_DT: 1 / 240,
  SIM_MAX_T: 8,
  SAMPLE_DT: 1 / 120,

  // Rebotes
  GROUND_E: 0.72, // restitución vertical base
  GROUND_FRICTION: 0.82, // conserva velocidad horizontal
  SPIN_BOUNCE_E: 0.14, // liftado: bote más alto; cortado: más bajo
  SPIN_BOUNCE_H: 0.2, // liftado: sale más rápido; cortado: frena
  SPIN_DECAY_BOUNCE: 0.45,
  GLASS_E: 0.7,
  GLASS_FRICTION: 0.85,
  MESH_E: 0.3,
  MESH_FRICTION: 0.6,
  NET_E: 0.15,

  // Golpe
  SHOT_SPEED_MIN: 10, // m/s con potencia 0
  SHOT_SPEED_MAX: 26, // m/s con potencia 1
  SPIN_MAX: 1, // spin normalizado [-1, 1]
  SPIN_SPEED_FACTOR: 0.12, // el efecto resta algo de velocidad
  FLAT_ANGLE_DEG: 18, // trazo con ángulo menor que esto = plano
  SPIN_FULL_ANGLE_DEG: 60, // a este ángulo el efecto es máximo
  SIDE_DEV_MAX_DEG: 9, // desvío lateral por impacto descentrado
  SIDESPIN_FROM_OFFSET: 0.5,
  PRECISION_MIN_ERR: 0.25, // error mínimo (m) sobre la zona objetivo
  PRECISION_MAX_ERR: 3.2, // error con el peor golpe
  NET_CLEARANCE: 0.08,
  SMASH_HEIGHT: 2.1, // por encima de esto el golpe es remate

  // Impacto (cámara lenta)
  SLOWMO: 0.12, // factor de tiempo durante el impacto
  IMPACT_LEAD: 0.32, // s de juego antes del contacto en que empieza la fase de impacto
  TIMING_WINDOW: 0.16, // s de juego: fuera de esto el timing es 0
  MISS_AFTER: 0.2, // s de juego tras el contacto ideal: si no deslizas, fallas
  HIT_RING_FRAC: 0.13, // radio del aro de golpe en fracción del ancho de pantalla
  WHIFF_OFFSET: 1.35, // trazo más lejos que esto (en radios) no toca la bola
  MIN_SWIPE_PX_FRAC: 0.06, // longitud mínima del trazo (fracción del ancho)
  SIDE_CAM_DIST: 7,
  SIDE_CAM_LOOK_AHEAD: 1.0, // m hacia el rival que se desplaza el centro de la vista

  // Jugadores
  PLAYER_SPEED: 5.2, // m/s
  REACH: 1.0, // alcance horizontal con la pala
  MIN_HIT_H: 0.25,
  MAX_HIT_H: 2.9,
  REACTION: 0.12,
  HOME_BACK_Z: 8.2,
  HOME_X: 2.5,

  // IA
  AI: {
    errBase: 1.4, // m de error
    missChance: 0.08,
    missChanceFastBall: 0.25, // extra si la bola llega muy rápida
    missPerfect: 0.2, // extra si tu golpe fue perfecto
    missPerRally: 0.03, // extra por cada golpe del intercambio (cansancio)
    fastBall: 20, // m/s
    powerMin: 0.35,
    powerMax: 0.75,
    smashPower: 0.95,
    lobChance: 0.15,
  },

  // Cámaras
  CAM_FOV: 50,
  CAM_MAIN: { pos: [0, 10, 17], look: [0, 0, -0.5] },
  CAM_TACTICAL: { pos: [0, 12, 15], look: [0, 0, -3] },
  CAM_BLEND: 0.45, // s reales para volver a la cámara principal

  // Partido
  GAMES_TO_WIN: 2, // mejor de 3 juegos
  FIRST_SERVE: -1, // equipo que saca el primer juego (-1 rival)
  SERVE_CONTACT_H: 0.75, // altura de golpeo en tu saque (bola botada)
  MATCH_END_DELAY: 2.2, // s reales

  // Ritmo
  POINT_END_DELAY: 1.6, // s reales

  // Juice
  HIT_STOP: 0.09, // s reales de congelación al golpear
  RING_APPROACH: 1.8, // el aro empieza este múltiplo más grande y se cierra justo en el contacto ideal
  CAM_FOLLOW_X: 0.3, // la cámara principal sigue la bola lateralmente
  CAM_FOLLOW_Z: 0.12,
  CAM_FOLLOW_SMOOTH: 4,
  VIBRATE_HIT: 25,
  VIBRATE_PERFECT: [20, 30, 40],
  SHAKE_HIT: 0.06,
  SHAKE_SMASH: 0.22,
  SMASH_HIT_STOP: 0.16,
  FOV_KICK_SMASH: 12, // grados que se cierra la cámara en un remate
  FOV_KICK_DECAY: 3, // por segundo
  SQUASH: 0.45, // aplastamiento de la bola al botar
  SQUASH_TIME: 0.12,
};

// Meta-juego: carrera, energía, recompensas y ligas (nombres inventados)
export const META = {
  START_CLUB: 'CP Los Almendros',
  SEASON_MATCHES: 5,
  ENERGY_MAX: 5,
  ENERGY_RECHARGE_S: 600, // 10 min por punto de energía
  XP_BASE: 100, // XP para subir del nivel n = XP_BASE * n
  XP_WIN: 40,
  XP_LOSE: 15,
  COINS_WIN: 60,
  COINS_LOSE: 15,
  UPGRADE_BASE_COST: 40, // coste = base * (nivel + 1)
  STAT_MAX: 10,
  OFFER_MAX_POS: 3, // quedar entre los 3 primeros trae oferta de la liga superior
  // Efecto por nivel de stat
  STAT_POWER: 0.06, // +6 % de velocidad de bola
  STAT_PRECISION: 0.07, // -7 % de error
  STAT_SPEED: 0.08, // +8 % de velocidad de carrera
  LEAGUES: [
    {
      name: 'Liga Bronce', stars: 1, mult: 1,
      clubs: [
        { name: 'Pádel Ribera', stars: 1 }, { name: 'CD Pinar Bajo', stars: 1 },
        { name: 'Club Olivo', stars: 2 }, { name: 'Raqueta Norte', stars: 2 }, { name: 'AD Las Dunas', stars: 1 },
      ],
    },
    {
      name: 'Liga Plata', stars: 2, mult: 1.6,
      clubs: [
        { name: 'Marea Alta PC', stars: 3 }, { name: 'Club Cierzo', stars: 2 },
        { name: 'Muro Azul', stars: 3 }, { name: 'Pádel Sierra', stars: 2 }, { name: 'CD Faro Viejo', stars: 2 },
      ],
    },
    {
      name: 'Liga Oro', stars: 4, mult: 2.5,
      clubs: [
        { name: 'Real Bandeja', stars: 5 }, { name: 'Víbora Club', stars: 4 },
        { name: 'Cristal Norte', stars: 4 }, { name: 'Atlético Globo', stars: 5 }, { name: 'Club Chiquita', stars: 4 },
      ],
    },
  ],
  // Dificultad de la IA según estrellas del rival (1-5)
  aiFor(stars) {
    return {
      errBase: 1.9 - stars * 0.22,
      missChance: 0.16 - stars * 0.025,
      powerMax: 0.6 + stars * 0.06,
      lobChance: 0.1 + stars * 0.03,
    };
  },
};
