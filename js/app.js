// Arranque, HUD y bucle de dibujo.

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
// Las instrucciones se abren solas la primera vez y luego se quedan detrás de
// un botón (v6): ocupaban cinco líneas de pie que en el móvil le hacían falta
// al tablero. localStorage puede fallar; si falla, se dan por vistas.
const AYUDA_KEY = 'colmena.ayuda.v1';
function ayudaVista() {
  try { return !!localStorage.getItem(AYUDA_KEY); } catch { return true; }
}
function marcarAyudaVista() {
  try { localStorage.setItem(AYUDA_KEY, '1'); } catch { /* da igual */ }
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

// Igual, para la línea de datos secundarios, que lleva marcado. Todo lo que
// entra aquí lo compone el propio juego: no hay texto de fuera.
function setHtml(id, v) {
  const el = document.getElementById(id);
  if (el.innerHTML !== v) el.innerHTML = v;
}

// ---------------------------------------------------------------------------
// Panel flotante (v6): la dificultad de un modo, o qué hace un ítem. Va en
// position fixed a propósito — así no ocupa sitio en la columna y no le quita
// alto al tablero, que es de lo que iba todo este cambio.
// ---------------------------------------------------------------------------
let popAncla = null;
function cerrarPop() {
  const p = document.getElementById('pop');
  p.hidden = true; p.innerHTML = ''; popAncla = null;
}
function abrirPop(ancla, contenido) {
  const p = document.getElementById('pop');
  p.innerHTML = ''; p.appendChild(contenido); p.hidden = false;
  const r = ancla.getBoundingClientRect();
  const w = p.getBoundingClientRect().width;
  p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  p.style.top = (r.bottom + 5) + 'px';
  popAncla = ancla;
}

// El panel que cuelga de un modo. Elegir dificultad ES empezar la partida, así
// que «Nueva partida» dejó de hacer falta: tocar un modo siempre acaba en
// partida nueva de ese modo, con este paso intermedio cuando hay algo que
// elegir. Panal libre no tiene dificultad, así que arranca directo.
function panelDificultad(modo) {
  const caja = document.createElement('div');
  const titulo = document.createElement('b');
  titulo.textContent = NOMBRE_MODO[modo];
  const fila = document.createElement('div');
  fila.className = 'difs';
  for (const dif of ['normal', 'dificil']) {
    const b = document.createElement('button');
    b.textContent = NOMBRE_DIF[dif];
    if (dif === partida.dificultad) b.classList.add('on');
    b.addEventListener('click', () => {
      partida.modo = modo; partida.dificultad = dif;
      cerrarPop(); restart();
    });
    fila.appendChild(b);
  }
  caja.appendChild(titulo); caja.appendChild(fila);
  return caja;
}

// Qué es esta ficha. En el móvil la leyenda está plegada a símbolos, así que
// esto es lo único que cuenta qué hace cada ítem y cada desastre.
function panelChip(c) {
  const caja = document.createElement('div');
  const n = document.createElement('b');
  n.textContent = c.dataset.nom;
  caja.appendChild(n);
  caja.appendChild(document.createTextNode(c.dataset.que));
  return caja;
}

// Una ficha de la leyenda. `malo` la pinta en rojo (desastres). El texto del
// efecto ya no va dentro: lo cuenta el panel flotante al tocarla o al pasarle
// el ratón (v6). Dentro sólo queda lo que tiene que leerse de un vistazo.
function chip(info, clave, malo) {
  const c = document.createElement('div');
  c.className = 'chip' + (malo ? ' malo' : '') + (clave === ITEMS.REINA ? ' reina' : '');
  c.dataset[malo ? 'des' : 'item'] = clave;
  c.dataset.nom = info.nombre;
  c.dataset.que = info.que;
  c.setAttribute('aria-label', `${info.nombre}: ${info.que}`);
  c.innerHTML = '<span class="sim"></span><span class="nom"></span><span class="cuenta"></span>';
  c.querySelector('.sim').textContent = info.simbolo;
  c.querySelector('.nom').textContent = info.nombre;
  c.addEventListener('click', () => {
    if (popAncla === c) { cerrarPop(); return; }
    cerrarPop(); abrirPop(c, panelChip(c));
  });
  // En el escritorio basta pasar el ratón. Se usa el panel propio y no el
  // `title` del navegador, que tarda un segundo y aparece donde quiere.
  if (matchMedia('(hover:hover)').matches) {
    c.addEventListener('pointerenter', () => { cerrarPop(); abrirPop(c, panelChip(c)); });
    c.addEventListener('pointerleave', () => { if (popAncla === c) cerrarPop(); });
  }
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

  document.getElementById('reloj-stat').hidden = !cfg.reloj;
  if (cfg.reloj) {
    setText('reloj', Math.ceil(S.reloj));
    const v = velocidadReloj(S);
    setText('ritmo', v > 1 ? `×${v.toFixed(1)}` : '');
    document.getElementById('reloj').className = 'big' + (S.reloj < 10 ? ' urgente' : '');
  }

  // Lo secundario, en una línea de texto (v6). Como stats con etiqueta ocupaba
  // una segunda fila de 40 px y no era información que se mire a menudo. La
  // dificultad entra aquí porque desde la v6 su botón ya no está a la vista, y
  // el récord es por modo Y dificultad.
  const sub = [`turno <b>${S.turn}</b>`, `<b>${tilesPlayable(S)}</b> celdas`,
               `meseta <b>${biggest}</b>`];
  if (cfg.helada) sub.push(`helada <b>${S.heladaCnt}/${HELADA_CADA[S.dificultad]}</b>`);
  if (cfg.desastres) {
    sub.push(`<b>${S.failStreak}</b> fallos`);
    const am = textoAmenazas();
    if (am !== '—') sub.push(`<span class="alerta">${am}</span>`);
  }
  if (cfg.puntua) sub.push(NOMBRE_DIF[S.dificultad].toLowerCase());
  setHtml('sub', sub.join(' · '));

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

  // Una sola línea para todo lo que antes eran tres (v6), por orden de
  // urgencia. Lo que se cae del orden no se pierde: el ítem que hay en el
  // tablero ya está en su ficha con la cuenta atrás, y la gota, en el panal.
  const l = document.getElementById('linea');
  let txt = '', cls = 'linea';
  if (S.gameOver) {
    txt = cfg.reloj
      ? `Se acabó el día · ${S.score.toLocaleString('es-ES')} puntos en ${S.turn} turnos`
      : `El invierno se ha comido el panal · ${S.score.toLocaleString('es-ES')} puntos en ${S.turn} turnos`;
    cls = 'linea over';
  } else if (logTurno && logTurnoEn === S.turn) {
    txt = logTurno; cls = logClase;
  } else if (S.danza) {
    txt = 'Danza: este arrastre puede tener la longitud que quieras';
    cls = 'linea bueno';
  } else if (biggest === S.step) {
    // El juego sabe antes que tú que vas a fallar. Aprovecharlo.
    txt = 'Última jugada posible con este paso';
    cls = 'linea tight';
  }
  if (l.textContent !== txt) { l.textContent = txt; l.title = txt; }
  l.className = cls;
}

// Lo que ha pasado en el último turno. Ya no tiene línea propia: se guarda y
// updateHud lo coloca en la línea única mientras dure el turno.
let logTurno = '', logTurnoEn = -1, logClase = 'linea';
function contar(eventos) {
  const txt = [];
  for (const e of eventos) {
    if (e.type === 'usa') txt.push(`✦ ${ITEM_INFO[e.tipo].nombre}`);
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
  logTurno = txt.join(' · ');
  logTurnoEn = S.turn;
  logClase = 'linea' + (eventos.some(e => e.type === 'fallback') ? ' tight' : '');
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

// Bucle: el reloj de Contrarreloj corre en tiempo real, y las abejas y el ítem se animan.
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
  logTurno = ''; logTurnoEn = -1;
  setText('seed', `semilla ${S.seed}`);
  document.querySelectorAll('[data-modo]').forEach(b =>
    b.classList.toggle('on', b.dataset.modo === partida.modo));
  pintarLeyenda();
  redraw();
}

window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('board');
  ctx = canvas.getContext('2d');
  initInput(canvas, () => S, onCommit, redraw);
  setText('version', VERSION);
  document.getElementById('fin-otra').addEventListener('click', restart);

  // Tocar un modo siempre acaba en partida nueva de ese modo. Si hay dificultad
  // que elegir, con el panel de por medio; Panal libre arranca directo.
  document.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
    const modo = b.dataset.modo;
    if (popAncla === b) { cerrarPop(); return; }   // segundo toque: se cierra
    cerrarPop();
    if (!CONFIG_MODO[modo].puntua) { partida.modo = modo; restart(); return; }
    abrirPop(b, panelDificultad(modo));
  }));

  // El panel se cierra al tocar fuera o con Escape. El canvas se lleva sus
  // propios eventos, así que esto escucha en la fase de captura.
  document.addEventListener('pointerdown', e => {
    if (!popAncla) return;
    const p = document.getElementById('pop');
    if (!p.contains(e.target) && !popAncla.contains(e.target)) cerrarPop();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarPop(); });

  const ayuda = document.getElementById('ayuda');
  document.getElementById('ayuda-btn').addEventListener('click', () => {
    cerrarPop(); ayuda.hidden = false;
  });
  document.getElementById('ayuda-cerrar').addEventListener('click', () => {
    ayuda.hidden = true; marcarAyudaVista();
  });
  if (!ayudaVista()) ayuda.hidden = false;

  window.addEventListener('resize', () => { cerrarPop(); resize(); });
  restart();
  resize();
  requestAnimationFrame(frame);
});
