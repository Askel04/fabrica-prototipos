# GDD — futbol-circulos

**Mecánica central:** fútbol 3v3 de círculos con física tipo Haxball. Te mueves con un joystick flotante y mantienes pulsado el chute: si el balón está a ≤ 4 unidades de tu borde, sale disparado. Sin chute, el balón se conduce por choque.

**Giro:** la sensación de Haxball (inercia, conducción, chute "cargado" con el botón mantenido) llevada a táctil con dos pulgares, contra IA, en partidas instantáneas.

**Bucle de 30 s:** presionar al rival → robar → conducir pegado al balón → chutar a puerta / rebote en poste → saque desde el centro.

**Bucle de sesión:** partido sin fin en el prototipo (marcador continuo). Si divierte: partidos a 3 goles o 3 minutos con revancha inmediata.

**Meta:** ninguna en el prototipo. Posible: ligas contra IA de dificultad creciente, después online.

**Controles (menú de pausa, arriba a la izquierda):** Joystick `Móvil` (aparece donde pones el pulgar) o `Fijo` (esquina inferior izquierda); Tiro `Tocar` (mantener en la mitad derecha) o `Botón` (botón gris abajo a la derecha). Se guardan en localStorage.

**IA (un solo cerebro, `src/ai/brain.js`; la dificultad son diales en `CONFIG.AI_LEVELS`, como en EA FC):**
- Máquina de 4 estados (tengo el balón / compañero / rival / suelto). Decide por utilidad = prob. de éxito × valor (mapa de amenaza tipo xT y "carrera" de pase: ¿llega antes el receptor o un rival?), con softmax.
- Posicionamiento: posición base según el balón + muestreo de huecos con línea de pase. Paredes: tras pasar corre al espacio y se la devuelven. Presión que tapa el pase, cobertura y portero que sale a los balones divididos.
- Pesos entrenados por autojuego (`tools/train.mjs`, estrategia evolutiva contra versiones anteriores). Calibrado con `tools/ladder.mjs` (Elo) y comportamientos con `tools/scenarios.mjs`.
- Diales por nivel: reacción, ruido de percepción, temperatura de decisión, puntería, opciones de ataque (pase al espacio, pared, banda, dejada, amagos), presión/cobertura y salida del portero.
- Tus compañeros usan siempre el perfil `mate` (buen nivel); la dificultad del menú cambia solo a los rivales. **Pedir pase:** pulsa tiro lejos del balón cuando lo tiene un compañero.

**Paleta (boceto, se cambiará en el pulido):** verde campo `#718c5a`, líneas `#c7e6bd`, rojo `#e56e56`, azul `#5689e5`, bordes negro `#000000`, balón blanco `#ffffff`.

**Qué hay que validar:** ¿se siente bien conducir y chutar con dos pulgares? ¿Se pide otra partida?

## Excepciones a CLAUDE.md
- **Orientación HORIZONTAL** (no retrato 9:16). Escala EXPAND (llena la pantalla) sobre base 860x440.
- **Física propia** en `src/physics.js` (ni Arcade ni Matter): paso fijo 60 Hz con acumulador y subiteraciones de colisión. Phaser solo dibuja.
- **Multitáctil** (joystick + chute a la vez), no un dedo.
