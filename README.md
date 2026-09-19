# La Colmena

**Jugar**: https://icaraballo.github.io/La-Colmena/

Puzzle de panal hexagonal por niveles, en desarrollo. **Inspirado en la mecánica** de un
puzzle móvil de 2012 (_Rocket Island_, handy-games.com GmbH, hoy THQ Nordic Mobile). Las
reglas de un juego no son registrables; los assets y la ambientación sí, y aquí no hay ni
uno: ni sprites, ni sonidos, ni fuentes, ni textos, ni el tema del original. La mecánica se
ha reimplementado desde cero y el tema es propio.

## Cómo se juega

El panal es el ciclo de cría de una abeja: **cera → huevo → larva → operculada → abeja**.

1. **Homogeneidad**: arrastras sobre un grupo de celdas conectadas que estén *todas al
   mismo nivel*, y suben un nivel. Puedes volver a pasar por una celda ya elegida para
   llegar a otra rama.
2. **Paso creciente**: cada turno hay que arrastrar **exactamente una celda más** que el
   anterior.

Cuando las celdas llegan a abeja (nivel 5) se **cosechan**: la abeja sale volando y la
celda vuelve a cera. Si el siguiente paso no cabe en ningún sitio, fallas: el paso vuelve
a 1 y se pierde la racha.

Los huecos (celdas rotas) no se pueden jugar. La partida empieza con 12.

### Modos

- **Pecoreo**: contrarreloj de 90 s. Cosechar da tiempo. Si fallas seguido llegan los
  desastres: varroa, polilla (capullo y después seda) y velutina.
- **Invierno**: sin reloj. Cada 2 fallos la helada se come una celda desde el borde.
  Las cosechas de 4 o más la hacen retroceder.
- **Panal libre**: sin presión y sin puntos, para probar.

Los **ítems** aparecen como gotas cuando hay muchas celdas al mismo nivel, y se recogen
pasando la cadena por encima.

## Estructura

Vanilla JS, sin framework ni bundler: el navegador carga `js/*.js` como scripts clásicos.
Basta con abrir `index.html`, o jugar en el enlace de arriba (GitHub Pages sirve la rama `main`).

```
index.html      HTML + CSS
js/constants.js panal, niveles, modos, tablas
js/state.js     estado y reglas: funciones puras, sin DOM y con azar con semilla
js/render.js    canvas: el panal en falso 2.5D
js/input.js     el arrastre con tránsito
js/app.js       arranque, HUD, reloj y bucle de dibujo
tests/smoke.js  pruebas de las reglas             · npm test
tests/bot.js    simulador de partidas             · npm run bot [n] [semilla] [modo] [dificultad] [s/turno]
```

El estado del juego es un objeto plano y serializable sin ninguna referencia a canvas o
DOM, y tiene que seguir así: es lo que permite testear las reglas y simular miles de
partidas para ajustar la dificultad con datos.
