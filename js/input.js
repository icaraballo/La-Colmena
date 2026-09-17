// El arrastre es el único verbo del juego, así que tiene que ser impecable.

const drag = { path: [], active: false };

function dragReady(s) { return drag.path.length === s.step; }

// getState es una función, no el estado: al reiniciar la partida se crea un
// objeto nuevo y un closure sobre el viejo seguiría hablando con la partida
// anterior.
function initInput(canvas, getState, onCommit, redraw) {
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width),
            (e.clientY - r.top) * (canvas.height / r.height)];
  };

  const extend = (i) => {
    const s = getState();
    if (i < 0 || drag.path.length === 0) return;
    const last = drag.path[drag.path.length - 1];
    if (i === last) return;

    // Deshacer retrocediendo: si el dedo vuelve sobre la penúltima casilla, se
    // quita la última. Es estándar en juegos de trazado y su ausencia se nota
    // como un bug, no como una restricción.
    if (drag.path.length >= 2 && i === drag.path[drag.path.length - 2]) {
      drag.path.pop();
      redraw();
      return;
    }

    if (drag.path.includes(i)) return;                       // sin repetidos
    if (!ADJ[last].includes(i)) return;                      // sólo vecinos
    if (!s.alive[i]) return;
    if (s.height[i] !== s.height[drag.path[0]]) return;      // misma altura
    if (drag.path.length >= s.step) return;                  // ni una de más

    drag.path.push(i);
    redraw();
  };

  canvas.addEventListener('pointerdown', (e) => {
    const s = getState();
    if (s.gameOver) return;
    const i = tileAt(s, ...pos(e));
    if (i < 0) return;
    canvas.setPointerCapture(e.pointerId);
    drag.active = true;
    drag.path = [i];
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
    const path = drag.path;
    drag.path = [];
    // Una cadena que no mide exactamente el paso exigido simplemente se
    // descarta: no gasta turno ni penaliza.
    if (path.length === s.step) onCommit(path);
    redraw();
  };

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
