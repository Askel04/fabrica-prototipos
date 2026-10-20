# Fábrica de prototipos de juegos móviles

## Objetivo
Prototipos jugables en móvil lo más rápido posible. Si no divierte, se descarta. Solo los ganadores se pulen y publican.

## Stack (no cambiar sin preguntar)
- Phaser 4 + Vite + JavaScript (sin TypeScript en prototipos)
- Retrato 9:16, escala FIT, solo táctil (un dedo por defecto)
- Guardado en localStorage
- Publicación: Capacitor + AdMob (solo en fase de pulido)
- **Excepción:** `games/padel/` usa Three.js + Vite (sin Phaser) porque es 3D. Mismo setup móvil que `template/` (retrato, táctil, localStorage).

## Flujo por juego
1. Copiar `template/` a `games/<nombre>/`
2. Escribir `games/<nombre>/GDD.md` (máx. 1 página): mecánica central, giro, bucle de 30 s, bucle de sesión, meta
3. Prototipo: SOLO la mecánica central, formas y colores, sin menús, anuncios ni arte
4. Probar en el móvil: `npm run dev -- --host`
5. Actualizar `tracker.md` con estado y notas

## Reglas de código
- Mínimo viable: no añadir sistemas no pedidos
- Un archivo por escena; config de juego (tamaños, velocidades, dificultad) en `src/config.js`
- Niveles generados por código cuando sea posible, con solver/validador si es puzle
- Juice en cuanto la mecánica funcione: tweens, partículas, vibración (navigator.vibrate), sonido
- Commit en git tras cada paso que funcione
- Tras cada cambio jugable, antes del commit: abrir http://localhost:5173 con Playwright, hacer captura, probar el toque y revisar la consola (0 errores)

## Arte (solo fases posteriores)
- Prototipo: formas geométricas y paleta del GDD
- Pulido: packs CC0 de Kenney primero; PixelLab/Recraft si hace falta estilo propio
- Paleta de 5–6 colores y prompt de estilo fijos por juego, anotados en el GDD

## Fases y criterios
- Prototipo (1–2 días) → test de diversión con 5 personas: ¿piden otra partida sin decírselo?
- Test web (itch.io/GitHub Pages) → medir sesión y retorno al día siguiente
- Pulido + monetización: recompensados opcionales, intersticiales a partir del nivel 10–15 y espaciados, sin banners, IAP "Quitar anuncios"

## Herramientas instaladas
- Skills oficiales de Phaser 4 (`phaserjs/phaser`) en `.claude/skills/`: tienen prioridad ante cualquier solapamiento.
- awesome-gamedev-agent-skills, plugins `router` y `web-engines` (proyecto): sus `phaser-core`/`phaser-arcade-physics` ya apuntan a Phaser 4.2; si contradicen a las oficiales, mandan las oficiales.
- MCP de Playwright (`.mcp.json`, config en `.claude/playwright-mcp.json`): Chrome en móvil retrato 390x844 con táctil, para probar http://localhost:5173.
