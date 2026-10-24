# GDD — futbol-circulos

**Mecánica central:** fútbol 3v3 de círculos con física tipo Haxball. Te mueves con un joystick flotante y mantienes pulsado el chute: si el balón está a ≤ 4 unidades de tu borde, sale disparado. Sin chute, el balón se conduce por choque.

**Giro:** la sensación de Haxball (inercia, conducción, chute "cargado" con el botón mantenido) llevada a táctil con dos pulgares, contra IA, en partidas instantáneas.

**Bucle de 30 s:** presionar al rival → robar → conducir pegado al balón → chutar a puerta / rebote en poste → saque desde el centro.

**Bucle de sesión:** partido sin fin en el prototipo (marcador continuo). Si divierte: partidos a 3 goles o 3 minutos con revancha inmediata.

**Meta:** ninguna en el prototipo. Posible: ligas contra IA de dificultad creciente, después online.

**Controles (menú de pausa, arriba a la izquierda):** Joystick `Móvil` (aparece donde pones el pulgar) o `Fijo` (esquina inferior izquierda); Tiro `Tocar` (mantener en la mitad derecha) o `Botón` (botón gris abajo a la derecha). Se guardan en localStorage.

**Dificultad (rivales; tus compañeros juegan siempre en Normal, `TEAMMATE_LEVEL`):**
- Fácil: IA original por roles (presiona, apoya, defiende), directa y desordenada.
- Normal: conduce 1–2 s, busca huecos, pasa cuando la presionan, tiro con línea libre; en defensa uno presiona tapando el pase, otro marca o tapa el tiro y el portero sale a cortar y saca jugando. Comete errores.
- Difícil: anchor/pivote/extremo, paredes 1-2, pases a la banda, amagos, dejadas al anchor, bloqueo con el cuerpo, pinchazos y basculación.

**Paleta (boceto, se cambiará en el pulido):** verde campo `#718c5a`, líneas `#c7e6bd`, rojo `#e56e56`, azul `#5689e5`, bordes negro `#000000`, balón blanco `#ffffff`.

**Qué hay que validar:** ¿se siente bien conducir y chutar con dos pulgares? ¿Se pide otra partida?

## Excepciones a CLAUDE.md
- **Orientación HORIZONTAL** (no retrato 9:16). Escala EXPAND (llena la pantalla) sobre base 860x440.
- **Física propia** en `src/physics.js` (ni Arcade ni Matter): paso fijo 60 Hz con acumulador y subiteraciones de colisión. Phaser solo dibuja.
- **Multitáctil** (joystick + chute a la vez), no un dedo.
