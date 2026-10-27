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
