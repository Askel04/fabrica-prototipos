---
description: Evalúa una idea de juego con optimista, pesimista y juez, y la añade a tracker.md
argument-hint: <idea>
---

Idea a evaluar: $ARGUMENTS

1. Lee `CLAUDE.md` y `tracker.md`.
2. Lanza en paralelo, en un mismo mensaje, los subagentes `optimista` y `pesimista`. Pasa a cada uno la idea y el contenido de `CLAUDE.md`, y recuérdales que respondan en máximo 10 líneas.
3. Cuando terminen ambos, lanza el subagente `juez-juego` con la idea y los dos informes completos.
4. Añade una fila al final de la tabla de `tracker.md`:
   - Juego: nombre corto de la idea
   - Fase: el veredicto del juez (Prototipar / Reserva / Descartado)
   - Idea + giro: la idea + el giro propuesto por el juez
   - Resultado test: vacío
   - Notas: `Eval XX/30` + motivo en una línea
   Si la idea ya está en la tabla, actualiza su fila en lugar de duplicarla.
5. Muestra al usuario los tres informes (máx. 10 líneas cada uno) y la fila añadida.
