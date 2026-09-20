// Arranque, HUD y bucle de dibujo.

// El nombre y lo que hace cada ítem salen de ITEM_INFO (constants.js), que es
// también de donde render.js saca el símbolo de la gota. Antes había dos mapas
// sueltos y podían discrepar.
const NOMBRE_ITEM = Object.fromEntries(
  Object.entries(ITEM_INFO).map(([k, v]) => [k, `${v.nombre} — ${v.que}`]));

const partida = { modo: MODOS.INVIERNO, dificultad: 'normal' };
let S = nuevaPartida();
let canvas, ctx;
const abejas = [];          // partículas de la cosecha
let ultimoFrame = 0;

// Semilla a la vista para poder reproducir una partida rara.
function nuevaPartida() {
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  return createState(partida.modo, partida.dificultad, seed);
}

function redraw(now = performance.now()) {
  draw(ctx, S, { cells: drag.cells, trail: drag.trail, ready: dragReady(S), abejas }, now);
  updateHud();
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el.textContent !== String(v)) el.textContent = v;
}

// Leyenda de ítems: los cinco que existen hoy, siempre a la vista (QA CR-02).
// Se reconstruye al cambiar de modo, porque el néctar sólo existe con reloj.
function pintarLeyenda() {
  const cfg = CONFIG_MODO[S.modo];
  const el = document.getElementById('leyenda');
  el.innerHTML = '';
  for (const tipo of ITEMS_VISIBLES) {
    const info = ITEM_INFO[tipo];
    if (info.soloConReloj && !cfg.reloj) continue;
    const chip = document.createElement('div');
    chip.className = 'chip' + (tipo === ITEMS.REINA ? ' reina' : '');
    chip.dataset.item = tipo;
    chip.title = `${info.nombre}: ${info.que}`;
    chip.innerHTML = `<span class="sim"></span><span class="nom"></span><span class="que"></span>`;
    chip.querySelector('.sim').textContent = info.simbolo;
    chip.querySelector('.nom').textContent = info.nombre;
    chip.querySelector('.que').textContent = info.que;
    el.appendChild(chip);
  }
}

// Lo que hay encima de la mesa ahora mismo. Sin esto los desastres sólo se
// anunciaban en una línea de texto que se borraba al turno siguiente.
function textoAmenazas() {
  if (S.turn < S.calmaHasta) return `calma ${S.calmaHasta - S.turn}t`;
  const partes = [];
  for (const d of S.desastres) {
    if (d.tipo === 'capullo') partes.push('capullo');
    if (d.tipo === 'seda') partes.push(`seda ${Math.max(0, d.hasta - S.turn)}t`);
  }
  return partes.length ? partes.join(' · ') : '—';
}

function updateHud() {
  const cfg = CONFIG_MODO[S.modo];
  const biggest = biggestCoherentArea(S);
  setText('step', S.danza ? '∞' : S.step);
  setText('score', cfg.puntua ? S.score.toLocaleString('es-ES') : '—');
  setText('streak', S.streak);
  setText('turn', S.turn);
  setText('alive', tilesPlayable(S));
  setText('area', biggest);

  document.getElementById('reloj-stat').hidden = !cfg.reloj;
  if (cfg.reloj) {
    setText('reloj', Math.ceil(S.reloj));
    const v = velocidadReloj(S);
    setText('ritmo', v > 1 ? `×${v.toFixed(1)}` : '');
    document.getElementById('reloj').className = 'big' + (S.reloj < 10 ? ' urgente' : '');
  }
  document.getElementById('helada-stat').hidden = !cfg.helada;
  if (cfg.helada) setText('helada', `${S.heladaCnt}/${HELADA_CADA[S.dificultad]}`);
  document.getElementById('fallos-stat').hidden = !cfg.desastres;
  if (cfg.desastres) setText('fallos', S.failStreak);
  document.getElementById('amenazas-stat').hidden = !cfg.desastres;
  if (cfg.desastres) setText('amenazas', textoAmenazas());

  // El ítem que está en el tablero se resalta en la leyenda.
  document.querySelectorAll('#leyenda .chip').forEach(c =>
    c.classList.toggle('activo', !!S.item && c.dataset.item === S.item.tipo));

  // Aviso: el juego sabe antes que tú que vas a fallar. Aprovecharlo.
  const warn = document.getElementById('warn');
  if (S.gameOver) {
    warn.textContent = cfg.reloj
      ? `Se acabó el día · ${S.score.toLocaleString('es-ES')} puntos en ${S.turn} turnos`
      : `El invierno se ha comido el panal · ${S.score.toLocaleString('es-ES')} puntos en ${S.turn} turnos`;
    warn.className = 'warn over';
  } else if (S.danza) {
    warn.textContent = 'Danza: este arrastre puede tener la longitud que quieras';
    warn.className = 'warn bueno';
  } else if (biggest === S.step) {
    warn.textContent = 'Última jugada posible con este paso';
    warn.className = 'warn tight';
  } else {
    warn.textContent = '';
    warn.className = 'warn';
  }

  setText('item', S.item ? NOMBRE_ITEM[S.item.tipo] : '');
}

// Lo que ha pasado en el último turno, contado en una línea.
function contar(eventos) {
  const txt = [];
  for (const e of eventos) {
    if (e.type === 'usa') txt.push(`✦ ${NOMBRE_ITEM[e.tipo].split(' — ')[0]}`);
    if (e.type === 'deshiela') txt.push('La cosecha empuja la helada: una celda vuelve como agua');
    if (e.type === 'limpia') txt.push(e.desastre === 'capullo' ? 'La cosecha elimina el capullo' : 'La cosecha retira la seda');
    if (e.type === 'fallback') {
      txt.push('Fallo: el paso vuelve a 1');
      if (e.eaten !== undefined) txt.push('la helada destruye una celda');
      const d = e.desastre;
      if (d && d.tipo === 'varroa') txt.push('varroa: una celda baja a cera');
      if (d && d.tipo === 'polilla') txt.push('polilla: aparece un capullo (eclosiona si vuelves a fallar)');
      if (d && d.tipo === 'seda') txt.push(`el capullo eclosiona: seda en ${d.tiles.length} celdas durante ${SEDA_TURNOS} turnos`);
      if (d && d.tipo === 'velutina') txt.push(`¡velutina! ${d.tiles.length} celdas barridas a cera`);
    }
  }
  setText('log', txt.join(' · '));
}

function onCommit(cells) {
  const antes = S.height.slice();
  if (!commitTurn(S, cells)) return;
  if (S.last.type === 'harvest') {
    const t = performance.now();
    cells.forEach((i, k) => abejas.push({
      x: layout.cx[i], y: layout.cy[i] - Math.max(0, antes[i] - 1) * LIFT, t0: t + k * 60,
    }));
  }
  contar(S.eventos);
}

// Bucle: el reloj de Pecoreo corre en tiempo real, y las abejas y el ítem se animan.
function frame(now) {
  const dt = Math.min(0.25, (now - (ultimoFrame || now)) / 1000);
  ultimoFrame = now;
  if (!document.hidden) tick(S, dt);
  while (abejas.length && now - abejas[0].t0 > 1500) abejas.shift();
  redraw(now);
  requestAnimationFrame(frame);
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
  S = nuevaPartida();
  drag.cells = []; drag.trail = [];
  abejas.length = 0;
  setText('log', '');
  setText('seed', `semilla ${S.seed}`);
  document.querySelectorAll('[data-modo]').forEach(b =>
    b.classList.toggle('on', b.dataset.modo === partida.modo));
  document.querySelectorAll('[data-dif]').forEach(b =>
    b.classList.toggle('on', b.dataset.dif === partida.dificultad));
  // La dificultad son las celdas rotas del arranque (T-20), así que tiene
  // sentido en los dos modos con partida: sólo Panal libre se queda fuera.
  document.getElementById('dificultad').hidden = !CONFIG_MODO[partida.modo].puntua;
  pintarLeyenda();
  redraw();
}

window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('board');
  ctx = canvas.getContext('2d');
  initInput(canvas, () => S, onCommit, redraw);
  document.getElementById('restart').addEventListener('click', restart);
  document.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
    partida.modo = b.dataset.modo; restart();
  }));
  document.querySelectorAll('[data-dif]').forEach(b => b.addEventListener('click', () => {
    partida.dificultad = b.dataset.dif; restart();
  }));
  window.addEventListener('resize', resize);
  restart();
  resize();
  requestAnimationFrame(frame);
});
