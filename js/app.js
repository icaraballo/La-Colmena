// Arranque, HUD y bucle de dibujo.

let S = createState();
let canvas, ctx;

function redraw() {
  draw(ctx, S, { path: drag.path, ready: dragReady(S) });
  updateHud();
}

function updateHud() {
  const biggest = biggestCoherentArea(S);
  document.getElementById('step').textContent   = S.step;
  document.getElementById('score').textContent  = S.score.toLocaleString('es-ES');
  document.getElementById('streak').textContent = S.streak;
  document.getElementById('turn').textContent   = S.turn;
  document.getElementById('alive').textContent  = tilesAlive(S);
  document.getElementById('area').textContent   = biggest;

  // Aviso: el juego sabe antes que tú que vas a fallar. Aprovecharlo.
  const warn = document.getElementById('warn');
  if (S.gameOver) {
    warn.textContent = `Fin de la partida · ${S.score.toLocaleString('es-ES')} puntos en ${S.turn} turnos`;
    warn.className = 'warn over';
  } else if (biggest === S.step) {
    warn.textContent = 'Última jugada posible con este paso';
    warn.className = 'warn tight';
  } else {
    warn.textContent = '';
    warn.className = 'warn';
  }
}

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  canvas.style.width = r.width + 'px';
  canvas.style.height = r.height + 'px';
  computeLayout(canvas.width, canvas.height);
  redraw();
}

function restart() {
  S = createState();
  drag.path = [];
  redraw();
}

window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('board');
  ctx = canvas.getContext('2d');
  initInput(canvas, () => S, (path) => { commitTurn(S, path); }, redraw);
  document.getElementById('restart').addEventListener('click', restart);
  window.addEventListener('resize', resize);
  resize();
});
