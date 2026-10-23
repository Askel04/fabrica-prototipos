# GDD — futbol-circulos

**Mecánica central:** fútbol 3v3 de círculos con física tipo Haxball. Te mueves con un joystick flotante y mantienes pulsado el chute: si el balón está a ≤ 4 unidades de tu borde, sale disparado. Sin chute, el balón se conduce por choque.

**Giro:** la sensación de Haxball (inercia, conducción, chute "cargado" con el botón mantenido) llevada a táctil con dos pulgares, contra IA, en partidas instantáneas.

**Bucle de 30 s:** presionar al rival → robar → conducir pegado al balón → chutar a puerta / rebote en poste → saque desde el centro.

**Bucle de sesión:** partido sin fin en el prototipo (marcador continuo). Si divierte: partidos a 3 goles o 3 minutos con revancha inmediata.

**Meta:** ninguna en el prototipo. Posible: ligas contra IA de dificultad creciente, después online.

**Paleta:** verde campo `#718c5a`, líneas `#c7e6bd`, rojo `#e56e56`, azul `#5689e5`, bordes negro `#000000`, balón blanco `#ffffff`.

**Qué hay que validar:** ¿se siente bien conducir y chutar con dos pulgares? ¿Se pide otra partida?

## Excepciones a CLAUDE.md
- **Orientación HORIZONTAL** (no retrato 9:16). Escala FIT sobre lienzo 860x440.
- **Física propia** en `src/physics.js` (ni Arcade ni Matter): paso fijo 60 Hz con acumulador y subiteraciones de colisión. Phaser solo dibuja.
- **Multitáctil** (joystick + chute a la vez), no un dedo.
