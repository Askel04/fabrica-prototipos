# Registro de horas — Pádel (límite 8 h)

Inicio de la prueba: 2026-10-20 10:39 UTC

| Hito | Inicio (UTC) | Fin (UTC) | Duración | Notas |
|---|---|---|---|---|
| 0. GDD + setup Three.js | 10:39 | 10:41 | 0:02 | GDD, excepción en CLAUDE.md, Vite + three |
| 1. Pista + personajes + punto con golpe | 10:41 | 10:55 | 0:14 | Física con Magnus/rebotes, reglas, IA, pausa táctica, impacto con deslizamiento. Probado con Playwright (plano/liftado/cortado/tarde), 0 errores |
| 2. Ajuste de sensación — ajuste 1 | 10:55 | 10:56 | 0:01 | Hit-stop, aro de aproximación de timing, viñeta en cámara lenta, cámara que sigue la bola. Validado por el usuario ("sigue a tu criterio") |
| 2. Ajuste de sensación — ajuste 2 | 10:56 | 10:58 | 0:02 | El personaje prepara el golpe en cámara lenta y lo suelta al deslizar; vibración y 'whoosh' al entrar en cámara lenta |
| 2. Ajuste de sensación — ajuste 3 | 10:58 | 11:04 | 0:06 | Remate: zoom de cámara (FOV), temblor fuerte, hit-stop largo, estela larga y chispas; bola que se aplasta al botar; confeti en el por 3 |
| 3. Puntuación completa y partido | 11:04 | 11:19 | 0:15 | 15-30-40-juego con punto de oro, mejor de 3 juegos, saque alterno por juego (tu saque con la misma mecánica: la bota y golpeas), marcador con indicador de saque. IA falla más ante golpes perfectos y rallies largos. Partido completo automático con Playwright 2-0, 0 errores |
| 4. Menús y meta mínima | 11:19 | 11:22 | 0:03 | Portada, previa (liga/jornada, clubes con estrellas y posición, recompensas, Clasificación, Calendario, Mejoras, Volver, Jugar), barra superior (nivel/XP, monedas, energía con recarga 10 min), resultado (marcador, monedas, XP), temporada de 5 partidos, 3 stats mejorables, oferta de club mejor. Probado con Playwright, 0 errores |

Fin de la prueba: 2026-10-20 11:22 UTC — total 0:43 de reloj del contenedor (horas sacadas de los commits).
Nota: el hito 4 se escribió en parte (estado/guardado y pantallas) mientras corría la prueba automática del hito 3, por eso dura poco.
