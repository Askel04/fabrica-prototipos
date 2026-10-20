# Evaluación: Fábrica de juegos móviles con IA
Fecha: 2026-10-20 · Total: 17/30 · Veredicto: validar antes

## Idea
### Fábrica de prototipos de juegos móviles con IA

#### Resumen
Crear varios juegos móviles simples y adictivos usando IA para casi todo el desarrollo, con el método de prototipar mucho y descartar rápido: solo se publican los que superan un filtro de diversión y retención. Objetivo: un ingreso extra mensual con anuncios y compras integradas no agresivos.

#### Autor y recursos
- Estudiante de 3º de Ingeniería Mecánica (URJC), de Erasmus en Estambul en el curso 2026–27.
- Desarrollador en solitario, sin experiencia previa publicando juegos. Avanza rápido con Claude Code.
- Dedicación: tiempo parcial (6-8 h/semana).
- Presupuesto: Los fijos solo tasas €. Costes fijos conocidos: Google Play 25 $ (pago único), Apple 99 $/año, herramientas de IA ~20–40 $/mes.
- No hace arte: todo el arte sale de IA o de packs CC0.

#### Hipótesis de mercado
- El puzle casual híbrido es el segmento que más crece (puzle híbrido +46 % en ingresos y sort puzzles +229 % en el primer semestre de 2026, según AppMagic).
- Equipos pequeños pueden triunfar con diseño minimalista (caso *Arrows – Puzzle Escape*).
- Google Play y App Store no rechazan juegos por usar IA. El filtro real es el spam o los clones (guideline 4.3 de Apple).
- Diferenciación posible con un giro de mecánica sobre géneros probados, localización (español nativo) y temáticas propias (ingeniería).

#### Método
1. Lluvia de ideas → filtro con evaluador multiagente → top 5.
2. Prototipo feo en 1–2 días: solo la mecánica central, con formas y colores.
3. Test de diversión con 5 personas: ¿piden otra partida sin decírselo?
4. Test web (itch.io / GitHub Pages): duración de sesión y retorno al día siguiente.
5. Solo los ganadores reciben pulido, arte, sonido, monetización, ASO y lanzamiento (Android primero).
6. Criterio tras lanzar: si al día siguiente vuelve ≥30 % y a la semana ≥8–10 %, se escala (iOS, más idiomas, contenido). Si no, se aplica lo aprendido al siguiente juego.

#### Stack
- Phaser 4 + Vite (JavaScript) con Claude Code; plantilla base reutilizable para todos los juegos.
- Pruebas en el móvil por red local o enlace web.
- Publicación con Capacitor + AdMob.
- Arte: Kenney (CC0), PixelLab o Recraft. Sonido: jsfxr / Kenney.
- Skills oficiales de Phaser, enrutador de skills de gamedev y Web2DKit para pruebas automáticas.

#### Primeros 5 candidatos
1. Unir números en cuadrícula sin repetir casillas, con giro propio. Niveles generados por código.
2. Pesca mejorable: lanzar, coleccionar, mejorar.
3. Puzle de montar o arreglar motores por piezas (temática de ingeniería).
4. Carrera de pádel estilo *Mini Soccer Star*: temporadas, personaje y cambio de club.
5. Cohete mejorable: lanzar, ganar, mejorar, llegar más lejos.

Reserva: Wordle social en español, discoteca idle, tycoon de coches con contenedores, universidad tycoon, city builder, ordenar cuartos, esquivar con el dedo, ritmo táctil, zombies en arena, esquí con acrobacias, mazmorras.

#### Monetización
- Anuncios recompensados opcionales (pista, deshacer, vida extra, ×2).
- Intersticiales solo a partir del nivel 10–15, como mucho uno cada 3 niveles y con 90–120 s de separación. Sin banners.
- Compras integradas: "Quitar anuncios" (3–4 €), packs de pistas, starter pack de 1,99 €. Cosméticos más adelante.
- Contenedores aleatorios solo con moneda del juego, sin dinero real.

#### Adquisición de jugadores (sin presupuesto)
ASO y localización en 8–10 idiomas, reto diario compartible, clips cortos de gameplay, Reddit y comunidades, versión web como embudo.

#### Expectativas
- Escenario probable en un primer juego: 10–300 €/mes.
- Escenario bueno (1.000–3.000 jugadores diarios): ~900–9.000 $/mes.
- Contexto: el 62 % de los juegos nuevos no ingresa nada (Xsolla, Q2 2025).
- Apuesta de cartera: varios lanzamientos aumentan la probabilidad de un éxito.

#### Supuestos críticos (a atacar)
1. La IA permite hacer un prototipo en 1–2 días y un juego publicable en 2–4 semanas sin arte propio.
2. Un test con 5 personas y una versión web predicen la retención en tiendas.
3. Hay tráfico orgánico suficiente (ASO + localización) sin presupuesto de captación de usuarios.
4. Un giro de mecánica basta para diferenciarse de los clones de publishers grandes.
5. La monetización suave genera ingresos relevantes con pocos miles de jugadores diarios.
6. El autor puede mantener el ritmo durante el Erasmus y los estudios.
7. Las restricciones de publicación (12 testers × 14 días en Google por cada app con cuenta personal, guideline 4.3 de Apple) no frenan el modelo de varios juegos.

#### Preguntas para la evaluación
- ¿Es realista como ingreso extra a 6–12 meses?
- ¿Qué candidato tiene más probabilidad de éxito y por qué?
- ¿Qué cambiarías del método, del stack o de la monetización?
- ¿Cuál es el experimento más barato para validar cada supuesto crítico?

## Veredicto del juez
```
Demanda: 3 | Diferenciación: 2 | Viabilidad: 3 | Coste/tiempo a validar: 4 | Ingresos: 2 | Riesgo: 3
Total: 17/30 — Veredicto: validar antes
Supuestos críticos:
1. Con IA sale un prototipo en 1–2 días y un juego publicable en unas 30 h → Experimento: cronometrar el candidato 1 (prototipo, solver, reto diario) durante 2 semanas con un registro de horas. Coste: 0 €. Si pasa de 15 h solo el prototipo, hay que reajustar el plan.
2. La retención fuera del círculo de amigos llega a D1 ≥25 % → Experimento: subir el prototipo a CrazyGames o itch.io y conseguir 200 o más jugadores desconocidos (Reddit, clips cortos). Coste: 0 €, en 3–4 semanas. Si el D1 baja del 20 %, se descarta.
3. Hay tráfico orgánico sin pagar captación y se pueden reunir 12 testers durante 14 días → Experimento: abrir ya la cuenta de Play (25 $) y lanzar el test cerrado con compañeros de Erasmus. Después, ver cuántas instalaciones llegan en 4 semanas con ASO en 3 idiomas. Si no superan las 500 al mes, no compensa traducir a 8–10 idiomas.
Mejor cambio: centrarse en un solo juego (el candidato 1, con reto diario compartible) y en la web como canal de salida, en lugar de una cartera de 5 juegos, y apoyarse más en compras dentro del juego que en anuncios.
Motivo: el mercado del puzle crece de verdad (AppMagic: sort +170 %), pero ese crecimiento se lo llevan quienes compran usuarios. Arrows triunfó con publicidad pagada y con un 75 % de ingresos por compras dentro del juego, mientras que su clon se quedó en 1.000 descargas al mes (AppGoblin, Flippa). El 62 % de los juegos nuevos no ingresa nada (Xsolla, verificado). Hay que priorizar el candidato 1 y dejar el 3 (motores) como segunda opción. Pádel, pesca y los tycoon quedan descartados con 6–8 h/semana.
```

## Abogado
1. **Oportunidad:** el puzle es el 44 % del gasto casual móvil, unos [4.900 M$ en el primer semestre de 2026](https://www.pocketgamer.biz/puzzle-accounts-for-44-of-casual-mobile-earnings-in-h1-2026/). El puzle híbrido (ordenar, tornillos, bloques) crece un [+46 %](https://gameindustrylibrary.com/documents/appmagic-mobile-casual-games-in-h1-2026-powered-by-mellow) y en los últimos 12 meses el sort ha subido un [+170 %](https://vn.linkedin.com/in/halotran). El "+229 %" de la idea no lo he podido confirmar. Pagan quienes se anuncian y los jugadores con IAP pequeñas.
2. **Tus datos tienen un error:** *Arrows* no lo hizo un equipo pequeño. Es de Lessmore/Miniclip, con [4 M de DAU y 250 k$/día en anuncios](https://www.gamigion.com/?p=28396). Lo que sí demuestra es que una mecánica minimalista sin arte escala. A escala indie, un clon de 3 meses con [1.000 descargas/mes salía en Flippa por 9.999 $](https://flippa.com/13977667). Ese precio solo es lo que pide el vendedor, pero indica que hasta un juego pequeño puede tener valor de venta.
3. **Ventaja propia:** tienes una plantilla Phaser reutilizable, Claude Code y un evaluador multiagente, así que un prototipo te cuesta horas y no semanas. Los niveles se generan por código con validador, sin artista. Hablas español nativo y tienes temática de ingeniería. Tus costes fijos son menos de 50 $/mes, así que con poco éxito ya cubres gastos.
4. **Por qué ahora:** los agentes de IA ya escriben juegos completos en Phaser, y Kenney (CC0), PixelLab y Recraft eliminan el cuello de botella del arte. A la vez, la demanda se ha ido hacia puzles simples que el algoritmo empuja aunque no tengan marca.
5. **Cifras de anuncios:** el vídeo recompensado paga un eCPM de [10–22 $ de media global y 16–20 $ en EE. UU.](https://blog.playio.co/mobile-game-ecpm-benchmarks-2026). Con 3 vídeos por jugador al día y 12 $ de eCPM salen [0,036 $ por jugador activo y día](https://blog.playio.co/mobile-game-ecpm-benchmarks-2026). Con intersticiales y la IAP "Quitar anuncios" estimo unos 0,04–0,06 $ *(estimación)*.
6. **Escenario de éxito a 6–12 meses:** se prototipan unos 8–10 juegos, se publican 2–3 en Android y uno pasa el filtro. Ese juego tendría entre 3.000 y 15.000 descargas al mes con ASO en 8–10 idiomas, reto diario y clips cortos, y llegaría a 300–1.000 jugadores diarios *(estimación)*. Eso daría 360–1.800 $/mes *(estimación, con 0,04–0,06 $ por jugador y día)*. Es menos que la horquilla de 900–9.000 $ de la idea, pero es un ingreso extra real. Además, el juego sería un activo vendible.
7. **Mejor candidato: el n.º 1, unir números en cuadrícula.** Está en el género que más crece, es el más barato de hacer (generador y solver, solo formas y colores) y encaja con el reto diario compartible y con la versión web como embudo. Segundo sería el n.º 3 (motores por piezas), por ser la temática más diferenciada. Pádel y pesca piden demasiado contenido y arte para 6–8 h/semana.

Fuentes: [PocketGamer.biz](https://www.pocketgamer.biz/puzzle-accounts-for-44-of-casual-mobile-earnings-in-h1-2026/) · [AppMagic H1 2026](https://gameindustrylibrary.com/documents/appmagic-mobile-casual-games-in-h1-2026-powered-by-mellow) · [LinkedIn, heatmap AppMagic](https://vn.linkedin.com/in/halotran) · [Gamigion, Arrows](https://www.gamigion.com/?p=28396) · [Flippa](https://flippa.com/13977667) · [Playio, eCPM 2026](https://blog.playio.co/mobile-game-ecpm-benchmarks-2026)

## Crítico
1. **El caso *Arrows* va en contra de la idea.** El original de Lessmore UG tiene unas [101,6M de instalaciones y >1M $/mes estimados, con un 75 % de IAP](https://www.appgoblin.info/apps/com.ecffri.arrows). Sus clones casi no existen: *Tied Arrows*, de SayGames (un publisher grande), tiene [~121 MAU](https://appgoblin.info/apps/6757383508). Otro clon se vende en Flippa con [1.000 descargas/mes y ninguna puja](https://flippa.com/13977667-arrows-tap-puzzle-escape). Si un clon con publisher detrás no despega, un giro de mecánica sin UA tampoco lo hará (supuestos 3 y 4).
2. **Las cifras de mercado no son las que dice el autor.** El sort puzzle [se triplicó en H1 2026](https://www.gamigion.com/mobile-casual-games-report-h1-2026-analysis/), pero no encontré ninguna fuente que confirme el "+46 % del puzle híbrido". Ese crecimiento además se lo quedan quienes pagan UA a escala.
3. **El listón de retención es un percentil alto.** Pedir D1 ≥30 % equivale al P75 global. La mediana está en [~22 % (GameAnalytics 2026)](https://gamedevreports.substack.com/p/gameanalytics-mobile-and-pc-game). Un test con 5 amigos y una web con tráfico de Reddit dan retenciones infladas que no se van a repetir en tienda (supuesto 2).
4. **Google Play encarece cada lanzamiento.** En cuentas personales posteriores a noviembre de 2023 hacen falta [12 testers durante 14 días seguidos, y el contador vuelve a 0 si baja de 12](https://www.testerscommunity.com/blog/google-play-closed-testing-requirements-2026). Hay fuentes que dicen que en 2026 también se mide el uso real. La exención requiere una cuenta de organización con D-U-N-S, o sea, una empresa (supuesto 7).
5. **RGPD.** Para anunciar en el EEE/UK, AdMob exige un [CMP certificado por Google con TCF desde enero de 2024](https://support.google.com/admob/answer/13554020?hl=en). Sin él no hay anuncios personalizados. Eso supone más integración (Capacitor) y más soporte.
6. **Los ingresos no salen.** Pasar de 1.000–3.000 DAU a 900–9.000 $/mes implica un ARPDAU de 0,03–0,10 $, que es propio de tráfico tier-1 con buenas IAP. Sin UA, el tráfico orgánico de Android viene sobre todo de mercados emergentes. No encontré eCPM por país de España, Turquía o LATAM, así que esa cifra no tiene base. Además, el éxito real (*Arrows*) es 75 % IAP, no "anuncios suaves" (supuesto 5).
7. **El tiempo no da.** Con 6–8 h/semana, "publicable en 2–4 semanas" son 14–32 h. Ahí tendrían que caber pulido, arte, la integración de anuncios (CMP incluido), ASO en 8–10 idiomas, los 14 días de testers y el soporte. Y todo durante un Erasmus. Es poco creíble (supuestos 1 y 6).
8. **Escenario de muerte más probable.** En 6–12 meses sale 1 juego, tras 2–3 prototipos. Se queda en <50 DAU orgánicos y en 0–30 €/mes, por debajo de los 20–40 $/mes de IA más los 25 $ de Play, y se abandona al volver del Erasmus. La cifra del propio autor (el [62 % de los juegos nuevos no ingresa nada](https://www.xsolla.com)) es el caso base, no la cola de la distribución. Esa cifra no la he verificado.
9. **Candidatos.** Pádel tipo *Mini Soccer Star*, el tycoon y el city builder son demasiado contenido para 7 h/semana: descartarlos. El puzle de números generado por código es el único compatible con el tiempo disponible. Aun así compite con miles de clones.

Fuentes: [AppGoblin Arrows](https://www.appgoblin.info/apps/com.ecffri.arrows), [AppGoblin Tied Arrows](https://appgoblin.info/apps/6757383508), [Flippa](https://flippa.com/13977667-arrows-tap-puzzle-escape), [Gamigion H1 2026](https://www.gamigion.com/mobile-casual-games-report-h1-2026-analysis/), [GameAnalytics 2026](https://gamedevreports.substack.com/p/gameanalytics-mobile-and-pc-game), [TestersCommunity](https://www.testerscommunity.com/blog/google-play-closed-testing-requirements-2026), [AdMob CMP](https://support.google.com/admob/answer/13554020?hl=en)

## Analista
**Hechos**
1. Mercado: Sort Puzzle ingresó 477,6 M$ entre jun-2025 y may-2026 (+170 % interanual), y Block Puzzle 248,5 M$ (+176 %) ([heatmap AppMagic](https://vn.linkedin.com/in/halotran)). A principios de 2026 Sort superó a Blast como tercer subgénero de puzle por IAP. Match-3, Merge y Blast siguen concentrando cerca del 80 % de los ingresos ([Mobidictum](https://mobidictum.com/?p=407410)). **No he podido verificar** el +46 % ni el +229 % del primer semestre de 2026 que cita el autor. La tendencia de fondo sí se confirma.
2. Retención: la mediana global de GameAnalytics es D1 22,9 %, D7 4,2 % y D28 0,85 % ([GA Q1'24](https://gamedevreports.substack.com/p/gameanalytics-benchmarks-in-mobile)). Puzle, cartas y tablero son los géneros que mejor retienen ([GA 2025](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)). Fuentes secundarias dan para puzle D1 ~32 % y D7 ~12 % ([Segwise](https://segwise.ai/blog/mobile-gaming-app-user-retention-strategies.md)). El umbral del autor (D1 ≥30 %, D7 ≥8–10 %) equivale a estar en el cuartil alto, no en la media.
3. Monetización: el ARPDAU solo con anuncios en casual ronda 0,01–0,05 $, y en híbrido con IAP 0,15–0,50 $ ([Playio](https://blog.playio.co/arpdau-benchmarks-mobile-games)). El eCPM de recompensados en Android en EE. UU. fue de ~30 $ (Q2 2024), con una media global de ~12–15 $ ([Applixir](https://www.applixir.com/?p=2676)). En casual, los intersticiales generan el 44 % de los ingresos por anuncios y los recompensados el 39 % ([Prado/TopOn](https://prado.co/post/rewarded-video-holds-the-crown-but-interstitial-ads-are-catching-up)). El escenario bueno del autor (1–3k DAU → 900–9.000 $/mes) implica un ARPDAU de 0,03–0,10 $, que es coherente con un modelo híbrido.
4. **Cifras verificadas**: lo del 62 % de juegos nuevos sin ingresos es correcto (y solo el 1,9 % supera el millón) ([Xsolla/BusinessWire](https://www.businesswire.com/news/home/20250702016602/fr)). La regla de 12 testers durante 14 días seguidos para cuentas personales nuevas de Google Play también se confirma ([Google](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB)).
5. Casos comparables: el éxito es *Arrows – Puzzle Escape* (Lessmore, estudio alemán), con ~100 M de instalaciones y ~1 M$/mes estimado (75 % IAP) ([AppGoblin](https://www.appgoblin.info/apps/com.ecffri.arrows)). Lo explican la mecánica minimalista y la compra de usuarios con playables ([Admapix](https://www.admapix.com/blog/ad-intelligence/arrows-puzzle-escape-ad-strategy-2026)), no solo el diseño. El fracaso es un clon, "Arrows – Tap Puzzle Escape", que tras 60 días tenía ~1.000 descargas/mes y se vende por 9.999 $ ([Flippa](https://flippa.com/13977667)). Copiar la mecánica sin distribución no basta.

**Suposiciones**
- Que haya tráfico orgánico suficiente sin presupuesto de captación. El caso de éxito sí compró usuarios.
- Que un test con 5 personas y una versión web predigan el D1/D7 en tienda. No hay evidencia publicada.
- Que un giro de mecánica distinga el juego de una oleada de clones del mismo subgénero.
- Que con 6–8 h/semana durante el Erasmus salga un juego publicable cada 2–4 semanas, además de reunir 12 testers por app.
- Que se alcancen 1–3k DAU. Con una retención mediana, eso exige decenas de miles de instalaciones al mes. Lo realista es la horquilla de 10–300 €/mes que da el propio autor.

Fuentes: [heatmap AppMagic](https://vn.linkedin.com/in/halotran), [Mobidictum](https://mobidictum.com/?p=407410), [GA Q1'24](https://gamedevreports.substack.com/p/gameanalytics-benchmarks-in-mobile), [GA 2025](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks), [Segwise](https://segwise.ai/blog/mobile-gaming-app-user-retention-strategies.md), [Playio](https://blog.playio.co/arpdau-benchmarks-mobile-games), [Applixir](https://www.applixir.com/?p=2676), [Prado](https://prado.co/post/rewarded-video-holds-the-crown-but-interstitial-ads-are-catching-up), [BusinessWire](https://www.businesswire.com/news/home/20250702016602/fr), [Google Play](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB), [AppGoblin](https://www.appgoblin.info/apps/com.ecffri.arrows), [Admapix](https://www.admapix.com/blog/ad-intelligence/arrows-puzzle-escape-ad-strategy-2026), [Flippa](https://flippa.com/13977667)
