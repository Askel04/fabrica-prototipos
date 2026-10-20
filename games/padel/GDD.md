# Pádel — GDD

**Stack:** Three.js + Vite (excepción 3D, ver CLAUDE.md). Retrato 9:16, solo táctil (un dedo), guardado en localStorage.

## Mecánica central
Partido de dobles en 3D. Controlas a tu pareja: en cada golpe actúa el personaje más cercano a la bola; los rivales son IA.
Cuando la bola rival llega a tu alcance el juego se **congela**:
1. **Pausa táctica:** tocas el campo rival para elegir zona objetivo y arrastras para fijar la potencia (barra). Botón "Siguiente".
2. **Impacto:** cámara lateral, la bola llega en cámara lenta por su trayectoria real. **Deslizas sobre la bola**:
   recto al centro = plano · tangente hacia abajo = cortado (backspin: más plana, bote bajo que frena) · tangente hacia arriba = liftado (topspin: cae antes, bote alto y rápido).
   Donde el trazo cruza la bola = punto de impacto; descentrado → desvío lateral. Mal timing/punto → más error sobre la zona.
3. Física: gravedad, Magnus simplificado, rebotes en suelo, cristal y red. Se reanuda a velocidad normal.

## Golpeo (iteración 2)
- **Pausa táctica:** arrastras y sale una flecha con el % de fuerza que solo marca la dirección de salida (no se ve dónde bota).
- **Impacto:** bola grande en cámara lenta. Del trazo salen el punto de contacto (perpendicular del centro a la línea del trazo) y el efecto continuo `spin = −(p × u)/(r|u|)`: por el centro = plano; rozando arriba o subiendo por detrás = liftado; por debajo o bajando por detrás = cortado.
- **Familias** (altura de contacto, bote, bola bombeada, efecto): plano, liftado, cortado, globo, volea, bandeja, víbora, rulo, remate, saque. Cada una con su rango de velocidad, profundidad nominal y animación. La elevación es la ideal de la familia + desvío del gesto + error por timing.
- **Cristal:** el cortado/víbora sale muerto y bajo; el liftado/rulo sube tras la pared.
- **Saque:** bote en el cuadro cruzado; tocar la malla antes del segundo bote es falta; segundo saque.

### Remate por 3 / por 4 (calibrado con tests/phys-sweep.mjs)
| Salida | Condiciones aproximadas |
|---|---|
| **x4 (fondo)** | Remate plano desde ≤2,5 m de la red, ≥85 % de fuerza (≥27 m/s), bote a ≤2,5 m de la red y por el centro (±25°) |
| **x3 (lateral)** | Remate desde ≤3,5 m de la red, ≥75 % de fuerza, bote a ≤1,5 m de la red y cruzado ≥30° hacia el lateral |

## Giro
Cada golpe es una mini-decisión táctica + un gesto de habilidad: apuntar al rebote en el cristal y el **remate por 3** (sale por el lateral = punto directo) como clímax.

## Reglas simplificadas
Debe botar en campo rival antes de tocar cristal; se permite volear; por 3 = punto directo. 15-30-40-juego (sin ventaja: punto de oro), mejor de 3 juegos.

## Bucle de 30 s
Rival golpea → congelar → apuntar + potencia → deslizar sobre la bola → ver la bola volar y el rival fallar o devolver.

## Bucle de sesión
Partido por oportunidades (~3–5 min): un set a 6 juegos simulado en el que se juegan 3–5 puntos clave (10 situaciones: tu saque, resto, defensa con globo, opción de remate, bandeja/víbora, volea en la red tipo portero, salida de pared, ataque en la red, punto de oro, globo al fondo). Si no se gana a la primera, el punto sigue contra una IA difícil. Hay que ganar todas (rival 4–5★), todas menos 1 (3★) o todas menos 2 (1–2★). Después: resultado (marcador, monedas, XP) → mejorar stat → siguiente jornada.

## Meta
Temporada de 5 partidos en liga; 3 stats con monedas (potencia, precisión, velocidad); energía (1 por partido, recarga con el tiempo); al acabar la temporada, oferta de un club mejor.

## Estilo y paleta
Personajes blocky (cubos: cabeza, torso, brazos, piernas), color plano, cámara 3/4 tras tu pareja. Pista 20x10 m, red, cristal al fondo y laterales parciales.
Paleta: pista azul `#2a6fdb`, líneas `#ffffff`, entorno `#1b2a4a`, tu equipo `#ffcc33`, rival `#e2453c`, bola `#d8f23a`.
Prompt de estilo (pulido): "low-poly blocky sports characters, flat colors, bright mobile game, soft shadows".
