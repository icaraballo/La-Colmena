# La Colmena

**Jugar**: https://icaraballo.github.io/La-Colmena/

Puzzle de panal hexagonal por niveles, en desarrollo. **Inspirado en la mecánica** de un
puzzle móvil de 2012 (_Rocket Island_, handy-games.com GmbH, hoy THQ Nordic Mobile). Las
reglas de un juego no son registrables; los assets y la ambientación sí, y aquí no hay ni
uno: ni sprites, ni sonidos, ni fuentes, ni textos, ni el tema del original. La mecánica se
ha reimplementado desde cero y el tema es propio.

## Cómo se juega

El panal es el ciclo de cría de una abeja, con el agua debajo:
**agua → cera → huevo → larva → operculada → abeja**.

1. **Homogeneidad**: arrastras sobre un grupo de celdas conectadas que estén *todas al
   mismo nivel*, y suben un nivel. Puedes volver a pasar por una celda ya elegida para
   llegar a otra rama.
2. **Paso creciente**: cada turno hay que arrastrar **exactamente una celda más** que el
   anterior.

Cuando las celdas llegan a abeja (nivel 5) se **cosechan**: la abeja sale volando y la
celda se vacía, vuelve a agua. Si el siguiente paso no cabe en ningún sitio, fallas: el
paso vuelve a 1 y se pierde la racha.

El **agua** (azul) se juega como cualquier nivel y sube a cera, pero no da puntos. Las
**celdas rotas** desaparecen del panal para siempre: sólo las crea la helada. El panal
**empieza siempre entero**: lo que se pierde es consecuencia de haber fallado.

### Modos

- **Contrarreloj**: reloj de 90 s que acelera. Cosechar da tiempo. Cada fallo te sube un
  peldaño de la escalera de desastres: varroa, polilla (un capullo), seda (el capullo
  eclosiona) y velutina. Jugar bien no te baja: sólo una cosecha de 5 celdas o más te
  devuelve al primer peldaño.
- **Invierno**: sin reloj. En cada fallo la helada rompe celdas del borde, para siempre.
  El humo, un ítem que sólo sale aquí, devuelve la última. Sin panal, se acabó.
- **Panal libre**: sin presión y sin puntos, para probar.

Los dos primeros tienen **normal** y **difícil**. Cada uno escala su propia presión: en
Invierno, cuántas celdas se lleva la helada por fallo (1 o 2); en contrarreloj, cuánto
acelera el reloj (+10 % o +20 % cada 10 turnos).

Los **ítems** aparecen como gotas cuando hay muchas celdas al mismo nivel, y se recogen
pasando la cadena por encima. **Se evaporan a los dos turnos**, así que hay que decidir si
merece la pena romper la meseta para llegar.

## Estructura

Vanilla JS, sin framework ni bundler: el navegador carga `js/*.js` como scripts clásicos.
Basta con abrir `index.html`, o jugar en el enlace de arriba (GitHub Pages sirve la rama `main`).

```
index.html      HTML + CSS
js/constants.js panal, niveles, modos, tablas
js/state.js     estado y reglas: funciones puras, sin DOM y con azar con semilla
js/render.js    canvas: el panal en falso 2.5D
js/input.js     el arrastre: tránsito, quitar volviendo atrás, cancelar fuera
js/app.js       arranque, HUD, reloj y bucle de dibujo
tests/smoke.js  pruebas de las reglas             · npm test
tests/bot.js    simulador de partidas             · npm run bot [n] [semilla] [modo] [dificultad] [s/turno]
```

El estado del juego es un objeto plano y serializable sin ninguna referencia a canvas o
DOM, y tiene que seguir así: es lo que permite testear las reglas y simular miles de
partidas para ajustar la dificultad con datos.
