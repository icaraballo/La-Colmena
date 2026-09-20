// Arranque, HUD y bucle de dibujo.

// El nombre y lo que hace cada ítem salen de ITEM_INFO (constants.js), que es
// también de donde render.js saca el símbolo de la gota. Antes había dos mapas
// sueltos y podían discrepar.
const NOMBRE_ITEM = Object.fromEntries(
  Object.entries(ITEM_INFO).map(([k, v]) => [k, `${v.nombre} — ${v.que}`]));

const partida = { modo: MODOS.INVIERNO, dificultad: 'normal' };

// Récord por modo y dificultad (T-17). localStorage puede fallar o venir vacío
// —ventana privada, datos bloqueados—, así que nunca se da por hecho: sin él el
// juego funciona igual, sólo que sin récord.
const RECORD_KEY = 'colmena.records.v1';
function leerRecords() {
  try { return JSON.parse(localStorage.getItem(RECORD_KEY)) || {}; } catch { return {}; }
}
function guardarRecord(clave, puntos) {
  try {
    const r = leerRecords();
    if (!(puntos > (r[clave] || 0))) return false;
    r[clave] = puntos;
    localStorage.setItem(RECORD_KEY, JSON.stringify(r));
    return true;                       // es récord nuevo
  } catch { return false; }
}
let S = nuevaPartida();
let canvas, ctx;
const abejas = [];          // partículas de la cosecha
// Destellos de lo que acaba de pasar, para que el tablero cuente la causa del
// cambio y no sólo el HUD (T-16). Cada uno vive 900 ms.
const destellos = [];
const COLOR_AVISO = { helada: '#7fd4ff', varroa: '#ff7a45', velutina: '#ff4d4d',
                      seda: '#f5f5f5', polilla: '#d8d2c4', deshiela: '#9fd67a' };
function avisar(tipo, tiles) {
  if (!tiles || !tiles.length) return;
  destellos.push({ tiles, color: COLOR_AVISO[tipo] || '#ffd23f', t0: performance.now() });
}
let ultimoFrame = 0;

// Semilla a la vista para poder reproducir una partida rara.
function nuevaPartida() {
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  return createState(partida.modo, partida.dificultad, seed);
}

function redraw(now = performance.now()) {
  draw(ctx, S, { cells: drag.cells, trail: drag.trail, ready: dragReady(S), abejas, destellos }, now);
  updateHud();
  pintarFin();
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el.textContent !== String(v)) el.textContent = v;
}

// Leyenda de ítems: los cinco que existen hoy, siempre a la vista (QA CR-02).
// Se reconstruye al cambiar de modo, porque el néctar sólo existe con reloj.
// Una ficha de la leyenda. `malo` la pinta en rojo (desastres).
function chip(info, clave, malo) {
  const c = document.createElement('div');
  c.className = 'chip' + (malo ? ' malo' : '') + (clave === ITEMS.REINA ? ' reina' : '');
  c.dataset[malo ? 'des' : 'item'] = clave;
  c.title = `${info.nombre}: ${info.que}`;
  c.innerHTML = '<span class="sim"></span><span class="nom"></span>' +
                '<span class="que"></span><span class="cuenta"></span>';
  c.querySelector('.sim').textContent = info.simbolo;
  c.querySelector('.nom').textContent = info.nombre;
  c.querySelector('.que').textContent = info.que;
  return c;
}

// Leyenda de ítems y de desastres, siempre a la vista (QA CR-02). Se reconstruye
// al cambiar de modo, porque no todos existen en todos: el néctar necesita reloj
// y el humo, helada. Nunca se anuncia algo que no puede salir.
function pintarLeyenda() {
  const cfg = CONFIG_MODO[S.modo];
  const el = document.getElementById('leyenda');
  el.innerHTML = '';
  for (const tipo of ITEMS_VISIBLES) {
    const info = ITEM_INFO[tipo];
    if (info.soloConReloj && !cfg.reloj) continue;
    if (info.soloConHelada && !cfg.helada) continue;
    el.appendChild(chip(info, tipo, false));
  }
  // Los desastres, en la misma forma: hasta la v4 sólo se anunciaban en una
  // línea de texto que se borraba al turno siguiente, así que la escalera de
  // DESIGN §7 no había forma de aprendérsela.
  const ed = document.getElementById('leyenda-des');
  ed.innerHTML = '';
  ed.hidden = !cfg.desastres;
  if (cfg.desastres) for (const tipo of DESASTRES_VISIBLES) {
    const info = DESASTRE_INFO[tipo];
    const c = chip({ ...info, nombre: `${info.peldano}. ${info.nombre}` }, tipo, true);
    ed.appendChild(c);
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

// Pantalla de fin de partida (T-17). Se pinta ENCIMA del tablero para que se
// pueda ver cómo ha quedado el panal: el final es información, no un telón.
let finPintado = false;
function pintarFin() {
  const el = document.getElementById('fin');
  if (!S.gameOver) { el.hidden = true; finPintado = false; return; }
  if (finPintado) return;
  finPintado = true;

  const cfg = CONFIG_MODO[S.modo];
  document.getElementById('fin-titulo').textContent = cfg.reloj
    ? 'Se acabó el día' : cfg.helada ? 'El invierno se ha comido el panal' : 'Sin jugadas';

  const sc = document.getElementById('fin-score');
  sc.textContent = cfg.puntua ? S.score.toLocaleString('es-ES') : '—';

  const rec = document.getElementById('fin-record');
  if (cfg.puntua) {
    const clave = `${S.modo}.${S.dificultad}`;
    const antes = leerRecords()[clave] || 0;
    const nuevo = guardarRecord(clave, S.score);
    rec.textContent = nuevo
      ? (antes ? `¡Récord! El anterior era ${antes.toLocaleString('es-ES')}` : '¡Primer récord!')
      : `Tu récord: ${antes.toLocaleString('es-ES')}`;
    rec.className = 'record' + (nuevo ? ' nuevo' : '');
  } else {
    rec.textContent = 'Panal libre no puntúa';
    rec.className = 'record';
  }

  const det = document.getElementById('fin-detalle');
  det.innerHTML = '';
  const filas = [['Turnos', S.turn], ['Racha máxima', S.streakMax || S.streak],
                 ['Paso máximo', S.pasoMax || S.step]];
  for (const [lbl, v] of filas) {
    const d = document.createElement('div');
    const b = document.createElement('b'); b.textContent = v;
    const t = document.createElement('span'); t.textContent = lbl;
    d.appendChild(b); d.appendChild(t);
    det.appendChild(d);
  }
  el.hidden = false;
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

  // El ítem que está en el tablero se resalta, con los turnos que le quedan
  // antes de evaporarse.
  document.querySelectorAll('#leyenda .chip').forEach(c => {
    const suyo = !!S.item && c.dataset.item === S.item.tipo;
    c.classList.toggle('activo', suyo);
    c.querySelector('.cuenta').textContent =
      suyo ? `${Math.max(0, S.item.caduca - S.turn)}t` : '';
  });
  // Y el desastre que tocaría si fallas ahora: el jugador ve el peldaño antes de
  // pisarlo, que es lo que hace que la escalera signifique algo.
  const capullo = S.desastres.some(d => d.tipo === 'capullo');
  const n = S.failStreak;
  const siguiente = S.turn < S.calmaHasta ? null
    : n >= 3 ? 'velutina' : (n === 2 && capullo) ? 'seda' : n === 1 ? 'polilla' : 'varroa';
  document.querySelectorAll('#leyenda-des .chip').forEach(c => {
    const act = c.dataset.des === siguiente;
    c.classList.toggle('activo', act);
    const d = S.desastres.find(x => x.tipo === c.dataset.des ||
      (c.dataset.des === 'seda' && x.tipo === 'seda') ||
      (c.dataset.des === 'polilla' && x.tipo === 'capullo'));
    c.querySelector('.cuenta').textContent =
      d && d.hasta ? `${Math.max(0, d.hasta - S.turn)}t` : (act ? '◀ toca' : '');
  });

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
    if (e.type === 'caduca') txt.push(`la gota de ${ITEM_INFO[e.tipo].nombre.toLowerCase()} se ha evaporado`);
    if (e.type === 'deshiela') { txt.push('El humo empuja la helada: una celda vuelve como agua'); avisar('deshiela', [e.tile]); }
    if (e.type === 'limpia') txt.push(e.desastre === 'capullo' ? 'La cosecha elimina el capullo' : 'La cosecha retira la seda');
    if (e.type === 'fallback') {
      txt.push('Fallo: el paso vuelve a 1');
      if (e.eaten !== undefined) {
        const rotas = S.heladas.slice(-HELADA_MUERDE[S.dificultad]);
        txt.push(rotas.length > 1 ? `la helada destruye ${rotas.length} celdas` : 'la helada destruye una celda');
        avisar('helada', rotas);
      }
      const d = e.desastre;
      if (d && d.tipo === 'varroa') { txt.push('varroa: la celda más alta baja a cera'); avisar('varroa', d.tiles); }
      if (d && d.tipo === 'polilla') { txt.push('polilla: aparece un capullo (eclosiona si vuelves a fallar)'); avisar('polilla', d.tiles); }
      if (d && d.tipo === 'seda') { txt.push(`el capullo eclosiona: seda en ${d.tiles.length} celdas durante ${SEDA_TURNOS} turnos`); avisar('seda', d.tiles); }
      if (d && d.tipo === 'velutina') { txt.push(`¡velutina! ${d.tiles.length} celdas barridas a cera`); avisar('velutina', d.tiles); }
    }
  }
  setText('log', txt.join(' · '));
}

function onCommit(cells) {
  const antes = S.height.slice();
  if (!commitTurn(S, cells)) return;
  // Máximos de la partida, sólo para la pantalla de fin: se llevan aquí para no
  // meter datos de interfaz en el estado del motor.
  S.streakMax = Math.max(S.streakMax || 0, S.streak);
  S.pasoMax = Math.max(S.pasoMax || 0, S.step);
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
  while (destellos.length && now - destellos[0].t0 > 900) destellos.shift();
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
  finPintado = false;
  destellos.length = 0;
  document.getElementById('fin').hidden = true;
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
  document.getElementById('fin-otra').addEventListener('click', restart);
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
