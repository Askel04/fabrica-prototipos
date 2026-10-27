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
