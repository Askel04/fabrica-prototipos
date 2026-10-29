# GDD — futbol-circulos

**Mecánica central:** fútbol 3v3 (o 5v5 en campo grande) de círculos con física tipo Haxball. Te mueves con un joystick flotante y mantienes pulsado el chute: si el balón está a ≤ 4 unidades de tu borde, sale disparado. Sin chute, el balón se conduce por choque.

**Giro:** la sensación de Haxball (inercia, conducción, chute "cargado" con el botón mantenido) llevada a táctil con dos pulgares, contra IA, en partidas instantáneas.

**Bucle de 30 s:** presionar al rival → robar → conducir pegado al balón → chutar a puerta / rebote en poste → saque desde el centro.

**Bucle de sesión:** partido sin fin en el prototipo (marcador continuo). Si divierte: partidos a 3 goles o 3 minutos con revancha inmediata.

**Meta:** ninguna en el prototipo. Posible: ligas contra IA de dificultad creciente.

**Modos:** menú principal con Un jugador (3v3 en el estadio clásico 740x340 o 5v5 en el grande 1100x480; dificultad) y Online.

**Online (como Haxball, sin servidor ni base de datos propios):** solo funciona abriendo el artefacto en claude.ai (capacidad `room`); los amigos necesitan cuenta y que se les comparta el artefacto. Uno crea sala (código de 5 letras) y los demás se unen con él. En la sala cada uno elige Rojo/Azul/Espectador; el anfitrión elige 3v3/5v5, rellenar con bots o no (1v1, 2v2, 1v2… solo personas) y su dificultad. Anfitrión con autoridad: simula todo y publica instantáneas a 30/s por `presence`; los clientes mandan su mando por `presence` y dibujan interpolando ~80 ms (sin predicción local todavía). Si alguien se va, su puesto pasa a bot; si se va el anfitrión, se acaba. `?localnet` en la URL usa BroadcastChannel para probar con dos pestañas.

**Controles (menú de pausa, arriba a la izquierda):** Joystick `Móvil` (aparece donde pones el pulgar) o `Fijo` (esquina inferior izquierda); Tiro `Tocar` (mantener en la mitad derecha) o `Botón` (botón gris abajo a la derecha). Se guardan en localStorage.

**IA (según el informe "IA de CPU en juegos deportivos"):** IA clásica por capas, como GRF/FIFA/2K:
- Percepción con retardo (balón y rivales) y ruido → estado de equipo con histéresis (posesión clara / sin posesión / suelto) → rotación 1.º/2.º/3.º por tiempo de intercepción → steering.
- Con balón: utilidad (tiro al mayor hueco angular, pases al pie/al espacio/a la banda con seguridad por tiempos, conducción hacia el espacio que controla, despeje) + softmax con temperatura y tiempo mínimo de compromiso. Rasgos de personalidad (tirador, pasador, regateador).
- Sin balón: puntos de apoyo puntuados (Buckland + control de espacio de Spearman) con asignación voraz e histéresis; paredes; pedir pase pulsando tiro lejos del balón.
- **Sin portero: rotación como en Rocket League 3v3.** Los tres son iguales y van cambiando de puesto: 1.º (el que llega antes: conduce, disputa o presiona), 2.º (apoyo para el pase / corta la línea de pase) y 3.º (último hombre: equilibrio con posesión, sombra en la línea balón-portería sin ella; sale a por el balón si gana la carrera). Quien tira, despeja o es superado rota atrás por el lado alejado de la jugada y los demás suben un puesto. Con el balón en campo rival el 3.º espera hacia el medio campo. El humano cuenta en la rotación.
- **5v5: formación zonal 2-1-2 sin portero** (`src/ai/formation.js`). El 1.º va al balón y los otros cuatro ocupan puestos (LI, LD, MC, EI, ED) de un bloque que bascula con el balón según la fase (ataque ancho y largo, defensa más cerrada). Sin balón, marcaje por zonas (cada uno marca al rival peligroso que entra en su zona, sin perseguirlo fuera); con balón, los desmarques no salen de su zona. Como mucho dos van al balón, y una separación suave evita que se pisen. Resultado medido (`tools/matchstats.mjs`): ≥3 compañeros junto al balón del 14 % al 3 % del tiempo y el doble de amplitud.
- Dificultad = un único θ (`CONFIG.AI_LEVELS`) que interpola la tabla de `src/ai/params.js`: reacción, frecuencia de decisión, ruido, horizonte de predicción, puntería, alineación, temperatura, margen de pase, muestras de desmarque, presión, disciplina de rotación (Fácil casi no rota y se amontona), jugadas que conoce y adaptación. Misma física para todos. Fácil θ 0,05 · Normal 0,4 · Difícil 1 · compañeros 0,8.
- **Plan de IA (2026-10-27):** primero la técnica individual, medida con `tools/drills.mjs` (exámenes) y `tools/matchstats.mjs`; luego la organización por autojuego con pautas. Línea base y objetivos en `IA-EXAMEN.md`. Menú principal → *Ejercicios IA* para verlos jugar. **Fase 1 hecha:** la técnica (controlar, pasar, tirar, conducir, superar) la decide `src/ai/motor.js` ensayando jugadas con la propia física antes de hacerlas. **Fase 2 hecha:** pautas de decisión con peso ajustable (pase de primeras, suelta rápido, ¿me da tiempo?, ir a recibir, salta a presionar, apoyo corto); `tools/decisions.mjs` las mide en paralelo.
- Herramientas: `tools/ladder.mjs` (liga + tabla de estilo), `tools/scenarios.mjs` (último hombre, pase pedido, paredes, presión, precisión de chute, rotación), `tools/play.mjs`, `tools/league-train.mjs` (autojuego de la fase 3). `?debug` en la URL dibuja el puesto en la rotación (1.º/2.º/3.º) y la tarea de cada jugador, la sombra del último hombre y el mapa de calor de desmarques.

**Paleta (boceto, se cambiará en el pulido):** verde campo `#718c5a`, líneas `#c7e6bd`, rojo `#e56e56`, azul `#5689e5`, bordes negro `#000000`, balón blanco `#ffffff`.

**Qué hay que validar:** ¿se siente bien conducir y chutar con dos pulgares? ¿Se pide otra partida?

## Excepciones a CLAUDE.md
- **Orientación HORIZONTAL** (no retrato 9:16). Escala EXPAND (llena la pantalla) sobre base 860x440.
- **Física propia** en `src/physics.js` (ni Arcade ni Matter): paso fijo 60 Hz con acumulador y subiteraciones de colisión. Phaser solo dibuja.
- **Multitáctil** (joystick + chute a la vez), no un dedo.
