# Puzzle hexagonal por alturas

Juego original en desarrollo, **inspirado en la mecánica** de un puzzle móvil de 2012
(_Rocket Island_, handy-games.com GmbH, hoy THQ Nordic Mobile). Las reglas de un juego
no son registrables; los assets y la ambientación sí, y aquí no hay ni uno: ni sprites,
ni sonidos, ni fuentes, ni textos, ni el tema del original. Sólo la mecánica, reimplementada
desde cero.

El tema propio está sin decidir a propósito: primero se comprueba que el bucle engancha.

## La mecánica en dos reglas

1. **Homogeneidad** — arrastras sobre una cadena de casillas contiguas que estén *todas a
   la misma altura*, y suben un nivel.
2. **Paso creciente** — cada turno debes arrastrar **exactamente una casilla más** que el
   turno anterior. Turno 1 → 1 casilla. Turno 7 → 7.

De ahí sale sola toda la tensión: cada jugada fragmenta el tablero en mesetas más pequeñas
mientras la longitud exigida crece. La dificultad no la impone un temporizador ni el azar,
la impone la geometría que tú mismo has ido creando.

Al llegar al nivel máximo la casilla ya no puede subir: hay que **cosechar** arrastrando
sobre ella, y vuelve al nivel base. La cosecha es la válvula de escape del juego — es lo
único que devuelve terreno llano al tablero.

Cuando el siguiente paso ya no cabe en ninguna parte, el paso vuelve a 1, se pierde la
racha y el vórtice devora una casilla del borde. Sin casillas, se acabó.

## Estructura

Vanilla JS, sin framework ni bundler: el navegador carga `js/*.js` como scripts clásicos.
Se abre `index.html` y ya está.

```
index.html      HTML + CSS
js/constants.js tablero, adyacencia, tabla de bonus
js/state.js     estado y reglas — funciones puras, cero DOM
js/render.js    canvas: hexágonos en falso 2.5D
js/input.js     el arrastre
js/app.js       arranque y HUD
tests/smoke.js  pruebas de las reglas       · npm test
tests/bot.js    simulador de partidas       · npm run bot [n]
```

El estado del juego es un objeto plano y serializable sin una sola referencia a canvas o
DOM, y debe seguir siéndolo. Eso da tests de las reglas, deshacer/rehacer, y poder simular
miles de partidas para ajustar la dificultad con datos en vez de por intuición.

## Estado

Fase 0 — prototipo. Arrastre, escalera de alturas, paso creciente, cosecha, fallo y vórtice.
Sin desastres, sin ítems, sin tema, sin sonido.
