// El arrastre es el único verbo del juego, así que tiene que ser impecable.
//
// Con TRÁNSITO (DESIGN §3): la cadena es un conjunto conexo, no un camino. El
// dedo puede volver a pasar por una celda ya elegida para llegar a otra rama, y
// esa celda no cuenta dos veces. Por eso ya no hay deshacer-por-retroceso: los
// dos son el mismo gesto y gana el tránsito. Rectificar cuesta poco: levantar el
// dedo descarta la cadena sin gastar turno.
//
//   drag.cells  las celdas elegidas, sin repetir — es lo que se valida
//   drag.trail  el recorrido del dedo, con repeticiones — sólo para dibujarlo

const drag = { cells: [], trail: [], active: false };

function dragReady(s) {
  return drag.cells.length > 0 && isValidDrag(s, drag.cells);
}

// getState es una función, no el estado: al reiniciar la partida se crea un
// objeto nuevo y un closure sobre el viejo seguiría hablando con la anterior.
function initInput(canvas, getState, onCommit, redraw) {
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width),
            (e.clientY - r.top) * (canvas.height / r.height)];
  };

  // Nivel de la cadena en curso, sin contar la reina (comodín).
  const nivel = (s) => {
    const c = drag.cells.find(i => !esReina(s, i));
    return c === undefined ? -1 : s.height[c];
  };

  const extend = (i) => {
    const s = getState();
    if (i < 0 || drag.cells.length === 0) return;
    const aqui = drag.trail[drag.trail.length - 1];
    if (i === aqui) return;
    if (!ADJ[aqui].includes(i)) return;                   // sólo a una vecina

    if (drag.cells.includes(i)) {                         // tránsito
      drag.trail.push(i);
      redraw();
      return;
    }
    if (!jugable(s, i)) return;
    const h = nivel(s);
    if (!esReina(s, i) && h !== -1 && s.height[i] !== h) return;   // misma altura
    if (!s.danza && drag.cells.length >= s.step) return;           // ni una de más

    drag.cells.push(i);
    drag.trail.push(i);
    redraw();
  };

  canvas.addEventListener('pointerdown', (e) => {
    const s = getState();
    if (s.gameOver) return;
    const i = tileAt(s, ...pos(e));
    if (i < 0 || !jugable(s, i)) return;
    canvas.setPointerCapture(e.pointerId);
    drag.active = true;
    drag.cells = [i];
    drag.trail = [i];
    redraw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag.active) return;
    e.preventDefault();
    extend(tileAt(getState(), ...pos(e)));
  });

  const end = () => {
    if (!drag.active) return;
    const s = getState();
    drag.active = false;
    const cells = drag.cells;
    drag.cells = []; drag.trail = [];
    // Una cadena inválida simplemente se descarta: no gasta turno ni penaliza.
    if (isValidDrag(s, cells)) onCommit(cells);
    redraw();
  };

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
