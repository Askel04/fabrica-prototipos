# Examen de la IA — referencia y progreso

Plan: primero el individuo (técnica: controlar, conducir, pasar, tirar), luego la organización. La organización se aprende con autojuego y unas pocas pautas ("ábrete en ataque"), no a base de reglas.

## Cómo medir
- `node tools/drills.mjs [skillset] [intentos]`: ejercicios aislados con la física real del 5v5, con semilla fija para que las tandas sean repetibles.
- `node tools/matchstats.mjs [nivel] 5 [partidas] [minutos]`: métricas de partido IA contra IA.
- En el juego, menú principal → **Ejercicios IA**: la IA repite cada ejercicio en bucle y tocar la pantalla pasa al siguiente. En desarrollo también vale `?drill=recepcion&skill=actual`.

## Línea base — fase 0 (IA actual, nivel Difícil, 300 intentos)

| Ejercicio | Resultado | Objetivo fase 1 |
|---|---|---|
| Recepción (controlar un pase) | 100 % lo controla, pero tarda **1,55 s** | ≥ 95 %, ≤ 0,35 s |
| Control + pase (en ≤ 1 s y que llegue) | **14 %**; el pase llega el 73 %, suelta en 1,55 s | ≥ 90 % en ≤ 1 s, llega ≥ 85 % |
| Pase con un defensor encima | **22 %** (robo 47 %) | ≥ 80 % |
| Conducción (recta / zigzag) | recta 100 % a 0,74 de la velocidad punta; **zigzag 0 %** | ≥ 95 %, ≥ 0,85 |
| Giro 180° con balón | **0 %**, tarda 2,8 s | ≥ 90 % en ≤ 0,8 s |
| 1 contra 1 (superar al defensor) | **0 %** (conserva 2 s el 92 %) | ≥ 40 %, conserva ≥ 80 % |
| Tiro a portería vacía, a 150–350 | **59 %** (sin chutar 19 %, fuera 22 %) | ≥ 85 % |

## Partido 5v5 Difícil contra Difícil (6 partidos × 3 min)
- **Recepciones controladas: 29 %.** El resto se golpea al llegar ("pinball"): la mediana para soltar es 0 s.
- Pérdidas por recepción: 27 %.
- Presión a tiempo sobre el que recibe (en ≤ 0,5 s, con un defensor a < 120): 29 %.
- Pases por minuto: 24.
- Espaciado: σy 95, ≥ 3 junto al balón 2,9 %, compañero más cercano a 166.
- Goles por partido: 1,3.

**Conclusión:** el cuello de botella es la técnica. La IA casi nunca controla, no sabe girarse con el balón ni conducir haciendo curvas, y no supera a un defensor. Eso es lo primero que hay que resolver (fase 1).

## Fase 1 — técnica por ensayo con la física (`src/ai/motor.js`)

Antes de cada acción con balón, el jugador ensaya decenas de secuencias de movimiento y de chute con la **misma física del juego** (él, el balón y los 4 más cercanos) y ejecuta la mejor. El optimizador es de entropía cruzada (CEM), con semillas geométricas: el punto exacto de golpeo para un balón en movimiento y rodear el balón por cada lado. Replanifica cada 1–5 ticks según la presión.

**Objetivos revisados con la física.** Para varios objetivos he medido el mínimo físico con una búsqueda muy grande (sin límite de cálculo):
- **Conducción recta.** Arrancando de parado y empujando el balón, el máximo es 0,77 de la velocidad punta. El 0,85 que pedía era imposible.
- **Giro con balón.** Con chute, el mínimo es ≈ 1 s, pero el balón se escapa. Sin chute, la búsqueda grande no mejora lo que ya hace el planificador (≈ 1,45 s). Objetivo: ≤ 1,5 s.
- **Control + pase en la misma dirección en que viene el balón (< 25°, recibir de espaldas y jugar hacia delante).** El mínimo físico pasa de 1 s. Esos casos se miden aparte.
- **Defensor de examen.** Ahora ve el balón con 130 ms de retardo, como la IA en Difícil; si reacciona al instante, ningún amago puede funcionar.

| Ejercicio (100 intentos) | Antes (fase 0) | Ahora | Objetivo |
|---|---|---|---|
| Recepción | 1,55 s | **0,28 s**, 100 % | ✅ ≤ 0,35 s |
| Control + pase (casos normales) | 14 % en ≤ 1 s | **87 % en ≤ 1 s**, llega 95 %, suelta en 0,37 s | ⚠️ 90 % |
| Pase con defensor encima | 22 % | **84 %** | ✅ 80 % |
| Conducción recta / zigzag | 100 % a 0,74 / **0 %** | **100 % a 0,75 / 97 % a 0,64** | ✅ |
| Giro con balón (≤ 1,5 s) | 0 % (2,8 s) | **82 %** (1,45 s) | ⚠️ 90 % |
| 1 contra 1 (superar o llegar a zona de tiro) | 0 % | **74 %** | ✅ 40 % |
| Tiro | 59 % | **83 %** (1,0 s) | ⚠️ 85 % |

### En partido (5v5 Difícil contra Difícil, 8 × 3 min)

| | Fase 0 | Fase 1 |
|---|---|---|
| Recepciones controladas | 29 % | 42 % |
| Pérdidas por recepción | 27 % | 24 % |
| Pases por minuto | 24 | 29 |
| Goles por partido | 1,3 | 2,3 |
| Coste en navegador (escritorio) | 0,15 ms/tick | 0,94 ms/tick (el 5 % peor, 3,5 ms) |

La técnica individual ya está casi en su sitio. Lo que no llega al objetivo en partido (≥ 70 % de controles y ≤ 15 % de pérdidas) depende sobre todo de las **decisiones**, que siguen siendo las de antes:
- se despeja demasiado;
- con un rival a menos de 37 se manda el balón "a lo que salga";
- no hay pase de primeras decidido antes de recibir;
- no se suelta pronto bajo presión de forma táctica.

Eso es la fase 2.

**Pendiente de la fase 1:** control + pase (87 → 90 %), giro (82 → 90 %), tiro (83 → 85 %), y un caso raro de balón parado 10 s (2 de 40 partidos, no reproducido en otros 25).

## Fase 1b — pulido de la técnica

Cambios:
- **Zigzag con anticipación.** Conducir recibe también el punto siguiente, y el ensayo mide el avance por todo el recorrido. Así se prepara para el giro antes de llegar, en vez de maniobrar cuando ya se ha pasado. Nueva métrica: el desvío máximo del balón respecto al recorrido.
- **Planes-controlador** además de las secuencias de mando. Se ensayan igual con la física y se ejecutan en lazo cerrado:
  - **"llegar y golpear":** ir al punto exacto de golpeo de un balón en movimiento en el instante T, entrando por la línea de pase. Permite el pase de primeras.
  - **"rodear y salir":** orbitar el balón por un lado hasta quedar detrás y empujar. Es el giro con balón.
- **Tiro:** cuenta como bueno si el balón entra limpio, sin tocar el poste (radio del poste + del balón).
- **Probado y descartado:** amagos como planes-controlador para el 1 contra 1. El ensayo casi nunca los elegía y no mejoraban el resultado.

| Ejercicio (100 intentos) | Fase 0 | Fase 1 | Pulido | Objetivo |
|---|---|---|---|---|
| Recepción | 1,55 s | 0,28 s | **0,28 s** | ✅ |
| Control + pase (casos normales, ≤ 1 s) | 14 % | 87 % | **94 %**, llega 100 % | ✅ |
| Pase con defensor encima | 22 % | 84 % | **92 %** | ✅ |
| Zigzag | 0 % | 97 %, desvío 103 | **100 %, desvío 30** | ✅ |
| Giro con balón (≤ 1,5 s) | 0 % | 82 % | **94 %** | ✅ |
| 1 contra 1 | 0 % | 74 % | **75 %** | ✅ |
| Tiro | 59 % | 83 % | **93–95 %** | ✅ |

En partido las cifras apenas cambian: 43 % de recepciones controladas, 27 % de pérdidas por recepción, 28 pases/min, 2,1 goles por partido. Lo que falla allí ya es la decisión (fase 2).

**Coste:** ≈ 1,1 ms/tick de media en Node y en navegador de escritorio; el 5 % peor, 3,7–4,2 ms. El giro replanifica cada tick y es lo más caro; replanificar cada 2 ticks ahorraría un 18 % de cálculo pero deja el giro en 67 %.

**Pendiente:** en el 1 contra 1 supera al defensor empujándolo hacia atrás (4,4 s) más que regateándolo.

## Fase 2 — decisiones (pautas)

Medición: `node tools/decisions.mjs 48 3`. Son 48 partidos de 3 min en 4 procesos, Difícil contra Difícil. Con menos de ~40 partidos, el ruido entre tandas (±5 puntos) tapa cualquier cambio.

**Pautas nuevas.** Cada una tiene su peso en `DEFAULT_WEIGHTS` de `src/ai/brain.js`, para que la fase 3 las ajuste:

| Pauta | Qué hace |
|---|---|
| Pase de primeras (`firstTime`, `firstTimeSlack`) | Si al recibir va a tener un rival encima, elige el destino mientras llega el balón y lo juega al primer toque |
| Suelta rápido (`quick`) | Con presión, los pases seguros ganan frente a seguir conduciendo; conduciendo y con un rival llegando, se replantea la jugada |
| ¿Me da tiempo? (`execCheck`, `execMargin`) | Para las 3 mejores opciones de golpeo, el planificador de técnica estima cuánto tardaría en chutar; si el rival llega antes, la opción vale mucho menos |
| Despejar solo si hace falta | Solo en peligro real y sin ningún pase seguro. Se quita el "rival a < 37 → mándala adelante" |
| Línea cerrada | Mientras prepara el pase y en el último momento antes de golpear, comprueba que la línea sigue libre; si no, decide otra cosa |
| Ir a recibir | El destinatario de un pase deja su zona y va al balón |
| Salta a presionar (`pressTrig`) | Ataca el balón (no espera) si el rival acaba de recibir, no lo controla, va de espaldas o está en la banda |
| Apoyo corto (`shortSupport`, `shortDist`, `shortPress`) | Con el poseedor presionado, el compañero más cercano se ofrece a ~120 con la línea de pase libre |

| Métrica (por equipo) | Fase 1b | Fase 2 | Objetivo |
|---|---|---|---|
| Pases buenos por minuto | 2,4 | **4,4–4,8** | ✅ ×2 |
| Pases que llegan | 69 % | **72–75 %** | |
| Pérdidas antes de soltar | 22 % | 20–27 % según la tanda | ❌ ≤ 15 % |
| Presión a tiempo (< 60 en ≤ 0,5 s) | — | **59–68 %** | ⚠️ 70 % |
| ≥ 3 junto al balón | 3 % | 4,1 % | ⚠️ ≤ 3 % |

Lo aprendido:
- **Lo que más ha ayudado:** el pase de primeras, ir a recibir, la comprobación de línea cerrada y quitar los despejes a ciegas. Doblan los pases buenos.
- **Pautas con efecto pequeño o ambiguo:** disparadores de presión, comprobar el tiempo de ejecución y apoyo corto.
  - El apoyo corto con radio 95 y siempre activo bajó las pérdidas al 20 %, pero a cambio de amontonamiento (6,6 %) y de un "pinball" de paredes al primer toque.
  - Solo con presión y a 120 no amontona, pero tampoco reduce pérdidas.
- **El equilibrio de estas pautas no se puede encontrar a mano con este ruido:** es el trabajo de la fase 3 (autojuego con muchas partidas).
- **Niveles:** Difícil y Normal quedan muy igualados en 5v5 (4-3-5 en 12 partidos), porque las pautas se activan desde Normal. Separarlos es la fase 4.
- **Coste:** ≈ 1,5 ms/tick de media en navegador de escritorio (el 5 % peor, 4,1 ms).

## Fase 2b — intención: buscar la portería, pases al hueco y desmarques

Lo que vio el usuario en el móvil: no tenían objetivo, solo no perder el balón; ni pase adelante, ni giro para buscar gol, ni desmarques.

**Cambios:**
- **Pase al hueco (`space`).** Para cada compañero se prueba un abanico de puntos en el espacio por delante de él (5 direcciones × 3 distancias). El pase vale si, siguiendo el recorrido del balón, él llega antes que cualquier rival.
- **Busca la portería (`progress`).** El valor de cada destino de pase o conducción suma lo que adelanta el balón. Conservar sin presión solo puntúa si se avanza.
- **Desmárcate (`runs`).** Con el balón controlado y sin presión, 1–2 de los de arriba (EI, ED, MC) atacan la espalda del último defensor rival durante ~2 s.
- **Tiro.** La calidad del hueco era 0 en el 90 % de las situaciones: en el campo grande, cualquier rival "tocaba" algún punto de un tiro largo. Ahora el bloqueo es probabilístico y con tiempo de reacción.
  - Bajo presión se aceptan tiros casi limpios.
  - Hay **remate de primeras** (`firstShot`) cuando el balón llega en zona de tiro con hueco.
  - Quien tiene el balón pegado no pierde su acción si cambia la rotación.

| Por equipo (48 partidos, Difícil contra Difícil) | Fase 2 | Ahora |
|---|---|---|
| Tiros a puerta por partido (golpeos que acaban dentro según su trayectoria) | 3,3 | **8,1** |
| Pases al hueco por minuto (acierto) | 0 | **3,5 (61 %)** |
| Pases buenos hacia delante por minuto | 1,2 | 1,4 |
| Pases que llegan | 73 % | 64 % (los pases al hueco arriesgan más) |
| Pérdidas antes de soltar | 25 % | 26 % |

**Mano a mano**, en el mismo partido (40 partidos, Difícil contra Difícil), con las pautas de intención activadas en un equipo y desactivadas en el otro: **96–30 en goles** a favor del que busca portería. El otro retiene más el balón y pierde menos, pero no hace daño.

**Niveles 5v5:** Difícil contra Normal 9-0-3, Normal contra Fácil 10-0-2. Ya quedan bien separados.

## Pase atrás para reciclar (`recycle`, `switchPlay`)

Petición del usuario: que sigan buscando el pase adelante, pero que no dejen de pasar atrás cuando no haya otra salida o el pase genere una rotación y espacio.

**Qué cambia.** El premio por avanzar castigaba todo pase atrás. Ahora un pase atrás vale lo mismo que su versión "reciclar": amenaza de la zona + `recycle` × lo libre que queda el receptor (su margen de tiempo frente a los rivales). Si además cambia el balón de lado (más de 140 en vertical), suma `switchPlay`. La dejada al último hombre se penaliza menos (0,85 en vez de 0,6).

| Por equipo (48 partidos) | Sin reciclar | Con reciclar |
|---|---|---|
| Pases atrás buenos por minuto | 1,0 | **1,4** |
| Pases buenos por minuto | 4,2 | **5,0** |
| Pases que llegan | 63 % | **67 %** |
| Pases hacia delante buenos por minuto | 1,4 | **1,6** |
| Pérdidas antes de soltar | 27 % | **24 %** |
| Goles por partido | 2,0 | **2,5** |

Mano a mano (40 partidos, un equipo con la pauta y el otro sin ella): 37–41 en goles, es decir, empate dentro del ruido. Juega mejor sin perder eficacia.
