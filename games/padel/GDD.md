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

## Giro
Cada golpe es una mini-decisión táctica + un gesto de habilidad: apuntar al rebote en el cristal y el **remate por 3** (sale por el lateral = punto directo) como clímax.

## Reglas simplificadas
Debe botar en campo rival antes de tocar cristal; se permite volear; por 3 = punto directo. 15-30-40-juego (sin ventaja: punto de oro), mejor de 3 juegos.

## Bucle de 30 s
Rival golpea → congelar → apuntar + potencia → deslizar sobre la bola → ver la bola volar y el rival fallar o devolver.

## Bucle de sesión
Partido al mejor de 3 juegos (~3–5 min) → resultado (marcador, monedas, XP) → mejorar stat → siguiente jornada.

## Meta
Temporada de 5 partidos en liga; 3 stats con monedas (potencia, precisión, velocidad); energía (1 por partido, recarga con el tiempo); al acabar la temporada, oferta de un club mejor.

## Estilo y paleta
Personajes blocky (cubos: cabeza, torso, brazos, piernas), color plano, cámara 3/4 tras tu pareja. Pista 20x10 m, red, cristal al fondo y laterales parciales.
Paleta: pista azul `#2a6fdb`, líneas `#ffffff`, entorno `#1b2a4a`, tu equipo `#ffcc33`, rival `#e2453c`, bola `#d8f23a`.
Prompt de estilo (pulido): "low-poly blocky sports characters, flat colors, bright mobile game, soft shadows".
