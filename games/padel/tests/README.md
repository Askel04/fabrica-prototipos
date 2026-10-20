# Pruebas con Playwright (viewport móvil 390x844, táctil)
Con `npm run dev` arrancado:
- `node tests/t1.mjs [flat|top|back|late]` — un punto con toque y deslizamiento reales.
- `node tests/t3.mjs` — partido completo automático (acelerado con `?speed=4`).
- `node tests/t4.mjs` — menús, mejoras, resultado y fin de temporada con oferta.

Capturas en `$SHOTS` (por defecto /tmp/padel-shots). `?match` abre un partido suelto sin menús.
