# Comparativa top 5 — 2026-10-20

Evaluación con `/evaluar-idea`: un optimista y un pesimista por idea y después el juez `juez-juego`. Los 6 criterios valen 0–5 cada uno, total sobre 30.

## Tabla del juez

| Idea | 5 s | Tocar | Código | Diferenciación | Monetización | Días | **Total** | Veredicto |
|---|---|---|---|---|---|---|---|---|
| 1. Unir números | 5 | 4 | 4 | 1 | 3 | 5 | **22** | Reserva |
| 3. Motores | 4 | 4 | 3 | 3 | 3 | 4 | **21** | Reserva |
| 5. Cohete | 5 | 2 | 4 | 2 | 4 | 4 | **21** | Reserva |
| 2. Pesca | 5 | 3 | 4 | 1 | 4 | 4 | **21** | Reserva |
| 4. Pádel | 4 | 3 | 3 | 3 | 4 | 2 | **19** | Reserva |

Ninguna idea saca "Prototipar" tal y como está planteada. En las 5 el juez repite el mismo diagnóstico: género probado y sin giro propio. Todas quedan en Reserva **con la condición de cambiar la mecánica central por el giro que propone el juez**.

## Giro propuesto y motivo

| Idea | Giro del juez | Motivo principal |
|---|---|---|
| Unir números | La línea avanza sola, como una serpiente, a ritmo creciente; el dedo solo cambia de dirección y hay que llenar la cuadrícula en orden 1, 2, 3… antes de chocar. | Se entiende al instante y se hace en 1 día, pero es un clon de Zip/Flow Free (riesgo 4.3) y no tiene la meta social de Zip. El test con 5 personas puede dar un falso positivo. |
| Motores | Quitar "crea el tuyo" del prototipo. Puzle de flujo 5x7 con tres circuitos (combustible, chispa, giro) que comparten casillas y tienen que cerrarse todos. | Encajar piezas en su hueco no es un puzle. El giro de flujos sí se puede generar y validar por grafo. Falta comprobar en papel que no sea Flow con otra piel. |
| Cohete | Cambiar el esquivar por soltar etapas con un toque en el momento justo (toque perfecto = empujón grande; toque tardío = combustible perdido). | Esquivar es Flappy en vertical, en un género saturado (Space Frontier, Learn to Fly). La habilidad tiene que estar en el toque. La base tycoon queda para el pulido. |
| Pesca | Al subir, el sedal se corta si rozas un pez peligroso: cada lance pasa a ser una esquiva de 30 s. | Modelo probado (Tiny Fishing), pero es un clon puro y la diversión depende de las mejoras, que el prototipo no mide. |
| Pádel | Deslizar para golpear apuntando al rebote en el cristal (como en el billar), con el remate "por 3" como clímax. IA automática; la carrera queda para después. | Lo que se vende es el meta-juego y no se prueba en 1–2 días. El cristal en vista plana y la IA de dobles ponen el plazo en riesgo, y el pádel es un nicho. |

## Ranking final

1. **Unir números — 22/30.** Es la más barata y rápida (Días 5) y la que mejor se entiende, pero también la menos diferenciada.
2. **Motores — 21/30.** El mejor equilibrio entre tocar y diferenciación (4/3), y el tema mecánico está poco explotado. Su riesgo es de diseño, no técnico.
3. **Cohete — 21/30.** Fuerte en gancho y monetización. El giro de las etapas tiene que arreglar el control flojo (Tocar 2).
4. **Pesca — 21/30.** Gancho y monetización iguales que Cohete, pero diferenciación 1: tal cual, es un clon de Tiny Fishing.
5. **Pádel — 19/30.** La única con Días 2: es un meta-juego, tiene IA de dobles y apunta a un nicho.

El empate a 21 se ha desempatado por diferenciación y después por tocar.

## Orden de prototipado recomendado

El objetivo es validar cada giro con el menor coste posible. El criterio de cada prueba es el de siempre: que las 5 personas pidan otra partida sin que se lo digan.

1. **Unir números (serpiente) — 1 día.** Es la prueba más barata y reaprovecha el generador de camino hamiltoniano y el solver. Si el giro no añade tensión, se descarta sin haber perdido casi nada.
2. **Cohete (etapas) — 1–2 días.** Solo el vuelo con soltar etapas y 3 mejoras en `src/config.js`. Sin base tycoon.
3. **Motores (tres flujos) — primero 1 h en papel, luego 1–2 días.** Antes de programar, montar a mano 2–3 tableros para ver si los flujos cruzados obligan a tomar decisiones. Esta prueba en papel se puede hacer en paralelo a los puntos 1 y 2.
4. **Pesca (sedal que se corta) — 1–2 días.** Es casi el mismo esquema que Cohete (bajar o subir esquivando con un dedo). Si Cohete funciona, sale barata; si Cohete falla por el control, conviene replantearla.
5. **Pádel (rebote en el cristal) — al final, o descartar.** Prototipar solo un punto contra una IA automática. Si un punto suelto no divierte, se descarta la idea entera.
