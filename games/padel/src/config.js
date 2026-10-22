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
  HARD_BOUNCE_VY: 9, // m/s de caída a partir de los que el bote se aviva
  HARD_BOUNCE_RANGE: 8,
  HARD_BOUNCE_E: 0.12,
  SPIN_DECAY_BOUNCE_BACK: 0.75, // el cortado conserva más efecto tras botar (llega vivo al cristal)
  SPIN_GLASS_E: 0.25, // restitución extra en el cristal por efecto (cortado sale muerto)
  SPIN_GLASS_LIFT: 0.35, // velocidad vertical que da el efecto al salir del cristal (liftado sube)
  GLASS_E: 0.7,
  GLASS_FRICTION: 0.85,
  MESH_E: 0.3,
  MESH_FRICTION: 0.6,
  NET_E: 0.15,

  // Golpe
  SPIN_SPEED_FACTOR: 0.12, // el efecto resta algo de velocidad
  NET_CLEARANCE: 0.25, // margen sobre la red con el que el solver busca la trayectoria ideal

  // Familias de golpe. speed: rango m/s que recorre la flecha (0-100 %); depth: m desde la red donde debe botar;
  // angle: ángulo nominal del trazo (grados, + hacia arriba); angleGain: grados de elevación por grado de desvío del gesto.
  SHOTS: {
    plano: { speed: [12, 25], depth: 7.4, depthPower: 1, branch: 'low', angle: 5, angleGain: 0.1, spinScale: 0.6, anim: 'drive' },
    liftado: { speed: [11, 25], depth: 6.6, depthPower: 1, branch: 'low', angle: 30, angleGain: 0.08, spinScale: 1, spinMin: 0.35, anim: 'drive' },
    cortado: { speed: [10, 21], depth: 8.2, depthPower: 0.8, branch: 'low', angle: -25, angleGain: 0.08, spinScale: 1, spinMin: -0.35, anim: 'cortado' },
    globo: { speed: [9, 16], depth: 8.6, depthPower: 0.8, branch: 'high', angle: 50, angleGain: 0.12, spinScale: 0.5, anim: 'globo' },
    volea: { speed: [9, 20], depth: 6.2, depthPower: 1.2, branch: 'low', angle: 0, angleGain: 0.1, spinScale: 0.5, anim: 'volea' },
    bandeja: { speed: [12, 20], depth: 8, depthPower: 0.8, branch: 'low', angle: -15, angleGain: 0.08, spinScale: 0.8, spinMin: -0.3, anim: 'bandeja' },
    vibora: { speed: [14, 24], depth: 8.5, depthPower: 0.6, branch: 'low', angle: -35, angleGain: 0.08, spinScale: 1, spinMin: -0.6, sideSpin: 0.5, anim: 'vibora' },
    rulo: { speed: [14, 25], depth: 7.2, depthPower: 0.8, branch: 'low', angle: 20, angleGain: 0.08, spinScale: 1, spinMin: 0.5, anim: 'rulo' },
    remate: { speed: [18, 32], depth: [5.5, 1.6], branch: 'low', angle: -40, angleGain: 0.06, spinScale: 0.4, anim: 'smash' },
    saque: { speed: [8, 14], depth: 5, depthPower: 2.4, branch: 'low', angle: 10, angleGain: 0.08, spinScale: 0.7, anim: 'saque' },
  },
  SMASH_MIN_H: 2.25, // por encima de la cabeza
  SMASH_MAX_DNET: 7, // y a esta distancia máxima de la red
  OVERHEAD_MIN_H: 1.55, // hombro/cabeza: bandeja, víbora o rulo si la bola llega bombeada
  LOBBED_VY: 3, // m/s de caída para considerar la bola bombeada
  VOLLEY_MIN_H: 1.0,
  VOLLEY_FAST: 13, // m/s
  VOLLEY_NET_D: 4,
  LOB_ANGLE: 32, // trazo más empinado que esto desde abajo = globo
  STROKE_SPIN_CURVE: 0.8,
  STROKE_FLAT_DEG: 12, // desvío del trazo respecto al centro por debajo del cual el golpe es plano
  STROKE_FULL_DEG: 70, // desvío con el que el efecto es máximo (roce casi tangente)
  CONTACT_ELEV_DEG: 5, // golpear por debajo del centro levanta la bola y por encima la baja (grados por radio)
  FORWARD_SWING_T: 0.12, // s de juego: la pala avanza de la preparación al contacto al llegar la bola
  AI_ARRIVE_T: 0.25, // s de juego: la IA termina de colocarse con suavidad antes de golpear
  GESTURE_MAX_DEG: 7,
  ELEV_ERR_DEG: 7,
  YAW_ERR_DEG: 9,
  SPEED_ERR: 0.15,
  TIMING_DEV_DEG: 8, // desvío lateral por golpear pronto o tarde
  RED_BEAM_POWER: 0.85, // remate con haz rojo
  RED_BEAM_Q: 0.6,
  BEAM_FRAMES: 10, // longitud del haz (fotogramas de estela)
  BEAM_RADIUS: 0.09,

  // Impacto (cámara lenta)
  SLOWMO: 0.12, // factor de tiempo durante el impacto
  IMPACT_LEAD: 0.32, // s de juego antes del contacto en que empieza la fase de impacto
  TIMING_WINDOW: 0.16, // s de juego: fuera de esto el timing es 0
  MISS_AFTER: 0.2, // s de juego tras el contacto ideal: si no deslizas, fallas
  WHIFF_OFFSET: 1.35, // trazo más lejos que esto (en radios) no toca la bola
  MIN_SWIPE_PX_FRAC: 0.06, // longitud mínima del trazo (fracción del ancho)
  SIDE_CAM_DIST: 4.5,
  IMPACT_BALL_SCALE: 6, // la bola se ve mucho más grande durante el impacto
  // Flecha de dirección y fuerza
  ARROW_MIN_LEN: 1.2, // m con fuerza 0
  ARROW_MAX_LEN: 6, // m con fuerza 100 %
  ARROW_MAX_YAW: 0.75, // rad a cada lado de "recto"
  ARROW_FULL_FRAC: 0.42, // arrastre (fracción del alto de pantalla) para el 100 %
  SIDE_CAM_LOOK_AHEAD: 0.25, // m hacia el rival que se desplaza el centro de la vista

  // Jugadores
  RACKET_TILT: -0.35, // rad: la pala, algo inclinada hacia delante respecto al brazo
  MAX_JUMP: 0.5, // m de salto para llegar a bolas altas
  MAX_CROUCH: 0.45, // m que baja la cadera para bolas bajas
  ANIM_SWITCH_MAX: 0.3, // m: si la animación de la familia exige moverse más que esto, se usa la preparada
  CONTACT_LERP: 0.3, // s reales para colocarse en el contacto al entrar en la pausa táctica
  PLAYER_SPEED: 5.2, // m/s (velocidad máxima)
  PLAYER_ACCEL: 11, // m/s²
  PLAYER_DECEL: 9, // m/s² al frenar en la llegada
  NET_Z: 3.2, // posición de red
  DODGE_SPEED: 16, // bolas más rápidas que esto se esquivan
  DODGE_DIST: 1.0, // m: si la bola pasa más cerca, el jugador se aparta
  DODGE_REACTION: 0.2, // s de juego antes de reaccionar
  BODY_R: 0.28, // m: radio del cuerpo para el pelotazo
  REACH: 0.35, // margen (m) para dar por alcanzable una bola: el cuerpo se coloca luego con reach()
  MIN_HIT_H: 0.25,
  MAX_HIT_H: 2.9,
  REACTION: 0.12,
  HOME_BACK_Z: 8.2,
  HOME_X: 2.5,

  // Animación de los jugadores
  ANIM: {
    TURN_RATE: 9, // rad/s de giro del cuerpo
    TURN_RUN_DIST: 2.6, // m: hacia atrás más lejos que esto, se da la vuelta y corre
    RUN_FACE_DIST: 3, // m: recorridos largos hacia delante o laterales se corren de frente al destino
    FACE_NET_BEFORE: 0.3, // s antes del golpe en que vuelve a ponerse de cara a la red
    MOVE_MIN: 0.35, // m/s: por debajo, posición de espera
    READY_SPREAD: 0.36, // rad de apertura de piernas en espera (baja la cadera)
    READY_BOB: 0.018, // m de rebote sobre las puntas
    READY_BOB_FREQ: 9,
    READY_LEAN: 0.12, // rad de inclinación del tronco hacia delante
    READY_ARM_X: -0.95, // pala delante
    READY_ARM_Z: 0.22,
    SHUFFLE_MIN: 0.12,
    SHUFFLE_MAX: 0.5,
    SHUFFLE_FREQ: 11,
    SHUFFLE_HOP: 0.05,
    STRIDE_FREQ: 8,
    STRIDE_FREQ_K: 1.7,
    STRIDE_K: 0.17,
    STRIDE_MAX: 0.95,
    RUN_BOB: 0.07,
    LEAN_RUN: 0.3,
    LEAN_BACK: -0.1,
    SPLIT_STEP_T: 0.18,
    SPLIT_STEP_H: 0.1,
    HEAD_MAX_YAW: 1.3,
    HEAD_MAX_PITCH: 0.7,
    VOLLEY_JUMP_H: 1.75, // volea por encima de esta altura: salta
    WALL_WATCH_EXTRA: 0.15, // s que sigue mirando tras el bote en el cristal
    LAMENT_T: 1.3,
  },

  // IA
  AI: {
    errBase: 1.4, // m de error
    missChance: 0.05,
    missChanceFastBall: 0.15, // extra si la bola llega muy rápida
    missPerfect: 0.15, // extra si tu golpe fue perfecto
    missPerRally: 0.02, // extra por cada golpe del intercambio (cansancio)
    fastBall: 20, // m/s
    powerMin: 0.35,
    powerMax: 0.8,
    smashChance: 0.7, // con bola alta cerca de la red, probabilidad de rematar (si no, bandeja/víbora)
    lobChance: 0.15,
    qMin: 0.55, // calidad de ejecución de la IA
    qMax: 0.9,
  },

  // Volea defensiva tipo portero
  VOLLEY_DEF: {
    PLANE_Z: 0.8, // plano de la pala (justo detrás de la red)
    PADDLE_R: 0.3,
    REACH: 0.38, // m desde el centro de la pala en que la bola queda bloqueada
    MAX_X: 2.1,
    MIN_Y: 0.6,
    MAX_Y: 2.3,
    TILT_SIDE: 0.75, // rad de inclinación lateral en los extremos
    TILT_LOW: 1.1, // rad: abajo la pala queda más horizontal
    STRIKER_Z: 8, // el rival remata desde el fondo
    SMASH_H: 2.75,
    AIM_X: 1.7, // zona a la que apunta el remate en el plano de la pala
    AIM_Y: [1.0, 2.0],
    SPEED: [21, 26], // m/s hacia ti
    SLOWMO: 0.5,
    COUNT_STEP: 1, // s por número de la cuenta atrás
    CAM: { pos: [0, 1.7, 6.2], look: [0, 1.25, -4] },
    FOV: 70,
  },

  // Partido por oportunidades
  OPP: {
    GAMES_BEFORE_FIRST: 2, // juegos simulados antes de la primera oportunidad
    GAMES_BETWEEN: 1, // juegos simulados entre oportunidades
    HOLD_CHANCE: 0.75, // en los juegos simulados, el que saca suele ganar
    SIM_STEP: 0.28, // s reales por punto simulado
    END_DELAY: 1.4,
    AI: { missChance: 0.03, missChanceFastBall: 0.1, missPerfect: 0.12, missPerRally: 0.015, qMin: 0.65, qMax: 0.95 },
  },
  // Oportunidades por estrellas del rival (1-5) y cuántas puedes perder
  oppFor(stars) {
    const n = [3, 3, 4, 4, 5][Math.max(1, Math.min(5, stars)) - 1];
    const slack = stars <= 2 ? 2 : stars === 3 ? 1 : 0;
    return { n, need: n - slack };
  },

  // Cámaras
  CAM_FOV: 50,
  CAM_MAIN: { pos: [0, 10, 17], look: [0, 0, -0.5] },
  CAM_TACTICAL: { pos: [0, 14, 17.5], look: [0, 0, -1.2] },
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
        { name: 'Club Olivo', stars: 2 }, { name: 'Raqueta Norte', stars: 2 }, { name: 'AD Las Dunas', stars: 1 }, { name: 'Club Brisa', stars: 2 },
      ],
    },
    {
      name: 'Liga Plata', stars: 2, mult: 1.6,
      clubs: [
        { name: 'Marea Alta PC', stars: 3 }, { name: 'Club Cierzo', stars: 2 },
        { name: 'Muro Azul', stars: 3 }, { name: 'Pádel Sierra', stars: 2 }, { name: 'CD Faro Viejo', stars: 2 }, { name: 'Pádel Alcor', stars: 3 },
      ],
    },
    {
      name: 'Liga Oro', stars: 4, mult: 2.5,
      clubs: [
        { name: 'Real Bandeja', stars: 5 }, { name: 'Víbora Club', stars: 4 },
        { name: 'Cristal Norte', stars: 4 }, { name: 'Atlético Globo', stars: 5 }, { name: 'Club Chiquita', stars: 4 }, { name: 'Gran Pared', stars: 5 },
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
