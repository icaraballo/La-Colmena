// Arranque, HUD y bucle de dibujo.

const partida = { modo: MODOS.INVIERNO, dificultad: 'normal' };

// Récord por modo y dificultad (T-17). localStorage puede fallar o venir vacío
// —ventana privada, datos bloqueados—, así que nunca se da por hecho: sin él el
// juego funciona igual, sólo que sin récord.
const RECORD_KEY = 'colmena.records.v1';
function leerRecords() {
  try { return JSON.parse(localStorage.getItem(RECORD_KEY)) || {}; } catch { return {}; }
}
// `menos`: gana el valor más bajo (los turnos de Expansión, v10.1); si no, el
// más alto (los puntos).
function guardarRecord(clave, puntos, menos = false) {
  try {
    const r = leerRecords();
    const antes = r[clave];
    if (menos ? antes && !(puntos < antes) : !(puntos > (antes || 0))) return false;
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
                      seda: '#f5f5f5', polilla: '#d8d2c4', deshiela: '#9fd67a',
                      contagia: '#e5484d', limpiaHuella: '#9fd67a', abre: '#E6B872' };
function avisar(tipo, tiles) {
  if (!tiles || !tiles.length) return;
  destellos.push({ tiles, color: COLOR_AVISO[tipo] || '#ffd23f', t0: performance.now() });
}
let ultimoFrame = 0;

// Semilla a la vista para poder reproducir una partida rara. Desde la v6 se
// puede además **escribir**: misma semilla, mismo panal (T-29).
function nuevaPartida(semilla) {
  const seed = semilla !== undefined ? semilla
             : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  return createState(partida.modo, partida.dificultad, seed);
}

// Copiar al portapapeles. `navigator.clipboard` sólo existe en contexto seguro
// (el juego se sirve por https), así que hay un plan B con un textarea suelto.
async function copiarTexto(txt) {
  try {
    await navigator.clipboard.writeText(txt);
    return true;
  } catch {
    try {
      const t = document.createElement('textarea');
      t.value = txt;
      t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch { return false; }
  }
}

function redraw(now = performance.now()) {
  const ready = dragReady(S);
  const q = abririaAhora(ready);
  draw(ctx, S, { cells: drag.cells, ready, fuera: drag.fuera, abejas, destellos, abriria: q && q.tocadas }, now);
  updateHud(now);
  pintarFin();
}

// Expansión: mientras arrastras una cosecha que abriría celdas, se resaltan las
// cerradas que toca (v10). Lo dice el motor (celdasQueAbriria), no la interfaz.
// Si toca más de las que gana, se resaltan todas: cuáles se abren es al azar.
function abririaAhora(ready) {
  if (!ready || !CONFIG_MODO[S.modo].abre || drag.fuera) return null;
  if (nivelCadena(S, drag.cells) !== MAX_LEVEL) return null;
  const q = celdasQueAbriria(S, drag.cells);
  return q.abre ? q : null;
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

// Hay partida que guardar: se ha jugado algún turno y no ha terminado. Es la
// que se guarda para «Continuar» (v9.1). En la v9, con ella, «‹ Menú»
// preguntaba antes de salir; desde que se guarda, ya no hay nada que perder.
function partidaEmpezada() { return S.turn > 0 && !S.gameOver; }

// ---------------------------------------------------------------------------
// Guardar la partida (v9.1, T-41)
// ---------------------------------------------------------------------------
// Una sola partida guardada, la última empezada: empezar otra la sustituye.
// Se guarda después de cada turno, al salir al menú, al ocultar la pestaña y,
// en Contrarreloj, cada segundo mientras corre el reloj (un móvil puede cerrar
// la pestaña sin avisar, y así al volver no se regalan segundos). Qué se
// guarda y cómo se valida está en guardado.js; aquí sólo dónde y cuándo.
// El reloj no corre fuera de la partida, así que al continuar sigue donde
// estaba: salir no castiga.
// Si localStorage falla (ventana privada, datos bloqueados), la partida se
// guarda sólo en memoria: sirve para salir al menú y volver, no para recargar.
const PARTIDA_KEY = 'colmena.partida.v1';
let guardadaMem = null;
let ultimoGuardado = 0;
function guardarPartida() {
  if (!partidaEmpezada()) { borrarPartida(); return; }
  guardadaMem = serializarPartida(S, { duracion, version: VERSION });
  ultimoGuardado = performance.now();
  try { localStorage.setItem(PARTIDA_KEY, JSON.stringify(guardadaMem)); } catch { /* queda la de memoria */ }
}
function borrarPartida() {
  guardadaMem = null;
  try { localStorage.removeItem(PARTIDA_KEY); } catch { /* da igual */ }
}
// La partida guardada, ya validada, o null. Una que no valga se borra: si no,
// el botón «Continuar» saldría para no llevar a ningún sitio.
function leerPartida() {
  let g = guardadaMem, t = null;
  try { t = localStorage.getItem(PARTIDA_KEY); } catch { /* se queda la de memoria */ }
  if (t) { try { g = JSON.parse(t); } catch { g = null; } }
  if (!g) { if (t) borrarPartida(); return null; }
  const s = restaurarPartida(g);
  if (!s || s.gameOver || s.turn < 1) { borrarPartida(); return null; }
  return { s, duracion: Number.isFinite(g.duracion) && g.duracion >= 0 ? g.duracion : 0 };
}
function hayPartidaGuardada() { return !!leerPartida(); }
// «Invierno · Normal · turno 47 · 3.120 puntos». Panal libre no tiene
// dificultad ni puntos; Expansión tiene dificultad (v10.1) pero no puntos.
function describirPartida(s) {
  const cfg = CONFIG_MODO[s.modo];
  return [NOMBRE_MODO[s.modo], tieneDificultad(s.modo) && NOMBRE_DIF[s.dificultad], `turno ${s.turn}`,
          cfg.puntua && `${s.score.toLocaleString('es-ES')} puntos`,
          cfg.abre && `${abiertas(s)} de ${CERRADAS_EXPANSION.length} abiertas`].filter(Boolean).join(' · ');
}

// La semilla: copiar la de ahora o jugar otra. Es lo que le faltaba a QA para
// poder reproducir un bug raro, y de paso deja rejugar una partida que salió
// buena (T-29).
function panelSemilla() {
  const caja = document.createElement('div');
  const t = document.createElement('b');
  t.textContent = 'Semilla';
  const input = document.createElement('input');
  input.value = String(S.seed);
  input.inputMode = 'numeric';
  input.setAttribute('aria-label', 'Semilla de la partida');
  const fila = document.createElement('div');
  fila.className = 'difs';

  const jugar = document.createElement('button');
  jugar.textContent = 'Jugar';
  const copiar = document.createElement('button');
  copiar.textContent = 'Copiar';
  const nota = document.createElement('span');
  nota.className = 'nota';
  nota.textContent = 'Misma semilla, mismo panal. Se juega en el modo y la dificultad de ahora.';

  jugar.addEventListener('click', () => {
    // Una semilla es un entero sin signo de 32 bits: lo que createState espera.
    const n = Number(input.value.trim());
    if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
      nota.textContent = 'Eso no es una semilla: tiene que ser un número entero.';
      input.focus();
      return;
    }
    cerrarPop();
    restart(n >>> 0);
  });
  copiar.addEventListener('click', async () => {
    copiar.textContent = await copiarTexto(input.value.trim()) ? '¡Copiada!' : 'No se pudo';
    setTimeout(() => { copiar.textContent = 'Copiar'; }, 1200);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') jugar.click(); });

  fila.appendChild(jugar); fila.appendChild(copiar);
  caja.appendChild(t); caja.appendChild(input); caja.appendChild(fila); caja.appendChild(nota);
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
  // Lo que pasa AHORA con esta ficha (el capullo que espera, la seda que no se
  // quita), aparte de lo que hace en general. Lo rellena updateHud.
  if (c.dataset.ahora) {
    const a = document.createElement('span');
    a.className = 'nota';
    a.textContent = c.dataset.ahora;
    caja.appendChild(a);
  }
  return caja;
}

// Tocar algo que tiene explicación (una ficha, una plaga) abre el panel. En el
// escritorio basta pasar el ratón: se usa el panel propio y no el `title` del
// navegador, que tarda un segundo y aparece donde quiere.
function conPanel(el) {
  el.addEventListener('click', () => {
    if (popAncla === el) { cerrarPop(); return; }
    cerrarPop(); abrirPop(el, panelChip(el));
  });
  if (matchMedia('(hover:hover)').matches) {
    el.addEventListener('pointerenter', () => { cerrarPop(); abrirPop(el, panelChip(el)); });
    el.addEventListener('pointerleave', () => { if (popAncla === el) cerrarPop(); });
  }
}

// Una ficha de la leyenda de ítems. El texto del efecto no va dentro: lo cuenta
// el panel flotante (v6). Dentro sólo queda lo que tiene que leerse de un vistazo.
function chip(info, clave) {
  const c = document.createElement('div');
  c.className = 'chip' + (clave === ITEMS.REINA ? ' reina' : '');
  c.dataset.item = clave;
  c.dataset.nom = info.nombre;
  c.dataset.que = info.que;
  c.setAttribute('aria-label', `${info.nombre}: ${info.que}`);
  c.innerHTML = '<span class="sim"></span><span class="nom"></span><span class="cuenta"></span>';
  c.querySelector('.sim').textContent = info.simbolo;
  c.querySelector('.nom').textContent = info.nombre;
  conPanel(c);
  return c;
}

// Una celda de la fila de plagas (v8): un hexágono con su símbolo y, debajo, una
// etiqueta que dice su estado. Mismo panel que las fichas al tocarla.
const HEX = '23,1 45,11 45,29 23,39 1,29 1,11';
function celdaPlaga(tipo) {
  const info = DESASTRE_INFO[tipo];
  const c = document.createElement('div');
  c.className = 'plaga';
  c.dataset.des = tipo;
  c.dataset.nom = `${info.peldano}. ${info.nombre}`;
  c.dataset.que = info.que;
  c.setAttribute('aria-label', `${info.nombre}: ${info.que}`);
  c.innerHTML = `<svg viewBox="0 0 46 40" aria-hidden="true"><polygon points="${HEX}"/><text x="23" y="20"></text></svg><span class="et"></span>`;
  c.querySelector('text').textContent = info.simbolo;
  conPanel(c);
  return c;
}

// Leyenda de ítems y fila de plagas, siempre a la vista (QA CR-02). Se
// reconstruyen al cambiar de modo, porque no todo existe en todos: el néctar
// necesita reloj y el humo, helada. Nunca se anuncia algo que no puede salir.
function pintarLeyenda() {
  const cfg = CONFIG_MODO[S.modo];
  const el = document.getElementById('leyenda');
  el.innerHTML = '';
  for (const tipo of ITEMS_VISIBLES) {
    const info = ITEM_INFO[tipo];
    if (info.soloConReloj && !cfg.reloj) continue;
    if (info.soloConHelada && !cfg.helada) continue;
    el.appendChild(chip(info, tipo));
  }
  // Las plagas (v8), en fila y unidas por un trazo, de la leve a la grave. Hasta
  // la v7 eran cuatro fichas con flechas y el jugador no entendía la escalera ni
  // por qué fallaba: ahora se ve cuántas llevas y cuál viene.
  document.getElementById('plagas').hidden = !cfg.desastres;
  document.getElementById('helada-fila').hidden = !cfg.helada;
  // La (i) de la línea de datos sólo en Panal libre: en los otros ya están la
  // del reloj y la de la helada (v9).
  document.getElementById('datos-info').hidden = cfg.puntua || cfg.abre;
  const fila = document.getElementById('plagas-fila');
  fila.innerHTML = '';
  if (!cfg.desastres) return;
  document.getElementById('plagas-tope').textContent = DESASTRES_VISIBLES.length;
  const extremo = (txt, cls) => {
    const e = document.createElement('span');
    e.className = 'extremo' + cls; e.textContent = txt;
    return e;
  };
  fila.appendChild(extremo('leve', ''));
  DESASTRES_VISIBLES.forEach((tipo, k) => {
    if (k) {
      const t = document.createElement('span');
      t.className = 'trazo'; t.dataset.hasta = DESASTRE_INFO[tipo].peldano;
      fila.appendChild(t);
    }
    fila.appendChild(celdaPlaga(tipo));
  });
  fila.appendChild(extremo('grave', ' der'));
}

// La regla de la cosecha grande (v8.4), una fila por tamaño con las cuatro
// plagas y en verde las que apaga. Las filas salen de peldanosQueBaja, nunca a
// mano: 5 o 6 → 1, 7 → 2, 8 → 3, 9 o más → todas. Hasta la v8.4 era una tarjeta
// suelta que salía al empezar cada Contrarreloj; desde la v9 es la pestaña
// Plagas de la hoja (T-40). Antes se probó la regla escrita fija en la
// cabecera, y no gustó: se decidió con bocetos (A1).
function hexMini(tipo, estado) {
  const k = DESASTRES_VISIBLES.indexOf(tipo);
  const [relleno, borde, letra, raya] = estado === 'apaga'
    ? ['none', '#6f8f4e', '#9fd67a', 'stroke-dasharray="3 2"']
    : [ROJO_PISADA[k], '#ff7a45', '#fff', ''];
  return `<svg viewBox="0 0 46 40" aria-hidden="true"><polygon points="${HEX}" fill="${relleno}" stroke="${borde}" stroke-width="2" ${raya}/>` +
    `<text x="23" y="21" text-anchor="middle" dominant-baseline="central" fill="${letra}" font-size="17" font-weight="700" font-family="system-ui,sans-serif">${DESASTRE_INFO[tipo].simbolo}</text></svg>`;
}
function pintarTarjeta() {
  const tope = DESASTRES_VISIBLES.length, filas = [];
  for (let L = COSECHA_GRANDE; L <= COSECHA_LIMPIA; L++) {
    const n = Math.min(peldanosQueBaja(L), tope), ult = filas[filas.length - 1];
    if (ult && ult.n === n && n < tope) ult.hasta = L; else filas.push({ desde: L, hasta: L, n });
  }
  document.getElementById('plagas-escala').innerHTML = filas.map(f => {
    const nombre = f.n >= tope ? `${f.desde} o más` : f.hasta > f.desde ? `${f.desde} o ${f.hasta}` : `${f.desde}`;
    const hex = DESASTRES_VISIBLES.map((t, k) => hexMini(t, k >= tope - f.n ? 'apaga' : 'pisada')).join('');
    return `<div class="escalon"><span class="n">${nombre}<small>celdas</small></span>` +
      `<span class="mini">${hex}<em>${f.n >= tope ? 'todas' : '−' + f.n}</em></span></div>`;
  }).join('');
}
// La misma escala en la pestaña de Expansión (v10): celdas que se abren en vez
// de plagas que se apagan. Sale de celdasQueGana, de la dificultad que se ve en
// la hoja (v10.1): la elegida en la ficha o la de la partida en consulta. En
// difícil se ve que 5 y 6 no abren nada. El tope de turnos de la tarjeta, igual.
function pintarEscalaExpansion(dif) {
  const filas = [], ultimo = COSECHA_GRANDE + ABRE_EXPANSION[dif].length - 1;
  for (let L = COSECHA_GRANDE; L <= ultimo; L++) {
    const n = celdasQueGana(L, dif), ult = filas[filas.length - 1];
    if (ult && ult.n === n && L < ultimo) ult.hasta = L; else filas.push({ desde: L, hasta: L, n });
  }
  const hex = abre => `<svg viewBox="0 0 46 40" aria-hidden="true"><polygon points="${HEX}" fill="${abre ? '#2E4756' : 'none'}" stroke="${abre ? '#E6B872' : '#6d6150'}" stroke-width="2" ${abre ? '' : 'stroke-dasharray="3 2"'}/></svg>`;
  const tope = celdasQueGana(ultimo, dif);
  document.getElementById('expansion-escala').innerHTML = filas.map(f => {
    const nombre = f.hasta === ultimo ? `${f.desde} o más` : f.hasta > f.desde ? `${f.desde} o ${f.hasta}` : `${f.desde}`;
    const mini = Array.from({ length: tope }, (_, k) => hex(k < f.n)).join('');
    return `<div class="escalon"><span class="n">${nombre}<small>celdas</small></span>` +
      `<span class="mini">${mini}<em style="color:${f.n ? '#E6B872' : '#8c7f6a'}">${f.n ? `abre ${f.n}` : 'nada'}</em></span></div>`;
  }).join('');
  document.querySelectorAll('[data-tope]').forEach(el => { el.textContent = TOPE_EXPANSION[dif]; });
}

// Los números de la hoja salen de las constantes (v7, regla 8): es HTML
// estático, y la ayuda de antes decía «4 celdas» a mano cuando el umbral ya
// era otro.
function rellenarConstantes() {
  const valores = { COSECHA_GRANDE, COSECHA_LIMPIA, SEDA_TURNOS, ITEM_TURNOS, CALMA_TRAS_VELUTINA,
                    MAX_LEVEL, RELOJ_INICIAL, RELOJ_TECHO, RELOJ_ACELERA_CADA, PUNTOS_POR_SEGUNDO,
                    TURNOS_CONTAGIO, HUELLA_RESTA: HUELLA_RESTA.toLocaleString('es-ES'),
                    CONTAGIO_CADA_NORMAL: CONTAGIO_CADA.normal, CONTAGIO_CADA_DIFICIL: CONTAGIO_CADA.dificil,
                    N_CERRADAS: CERRADAS_EXPANSION.length };
  document.querySelectorAll('[data-const]').forEach(el => {
    el.textContent = valores[el.dataset.const];
  });
}

// Pantalla de fin de partida (T-17). Se pinta ENCIMA del tablero para que se
// pueda ver cómo ha quedado el panal: el final es información, no un telón.
let finPintado = false;
// La duración de la partida (v7.1), en segundos. Se lleva aquí y no en el motor
// (regla 3: state.js no depende del reloj del ordenador). Cuenta con el mismo
// criterio que el reloj de Contrarreloj: desde el primer arrastre, y parada con
// la pestaña oculta.
let duracion = 0;
function formatoDuracion(seg) {
  const t = Math.floor(seg);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
function pintarFin() {
  const el = document.getElementById('fin');
  if (!S.gameOver) { el.hidden = true; finPintado = false; return; }
  if (finPintado) return;
  finPintado = true;
  borrarPartida();   // acabada no se continúa

  const cfg = CONFIG_MODO[S.modo];
  document.getElementById('fin-titulo').textContent = tituloFin(cfg);

  const sc = document.getElementById('fin-score');
  sc.textContent = cfg.puntua ? S.score.toLocaleString('es-ES')
    : cfg.abre ? (S.completado ? `${S.turn} turnos` : `${abiertas(S)} de ${CERRADAS_EXPANSION.length}`) : '—';

  const rec = document.getElementById('fin-record');
  if (cfg.abre) {
    // El récord de Expansión (v10.1): los turnos, menos es mejor, uno por
    // dificultad y sólo con el panal completo.
    const clave = `${S.modo}.${S.dificultad}`;
    const antes = leerRecords()[clave];
    const nuevo = S.completado && guardarRecord(clave, S.turn, true);
    rec.textContent = nuevo ? (antes ? `¡Récord! El anterior era ${antes} turnos` : '¡Primer récord!')
      : S.completado ? `Panal completo · tu récord: ${antes} turnos`
      : `Sin completar: ${abiertas(S)} de ${CERRADAS_EXPANSION.length} celdas abiertas` + (antes ? ` · tu récord: ${antes} turnos` : '');
    rec.className = 'record' + (nuevo ? ' nuevo' : '');
  } else if (cfg.puntua) {
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
  // «Jugada más larga» (v7.1) cuenta las celdas arrastradas. Hasta la v7 decía
  // «Paso máximo» y guardaba S.step, que es el paso que se PIDE después (L + 1),
  // y una jugada que acababa en fallo ni se registraba.
  const filas = [['Turnos', S.turn], ['Racha máxima', S.streakMax || S.streak],
                 ['Jugada más larga', S.jugadaMax || 0], ['Duración', formatoDuracion(duracion)]];
  // Contagio: los puntos antes de las huellas y lo que han restado (lo trae el motor).
  if (cfg.huellas && S.cierre) filas.unshift(
    ['Puntos', S.cierre.bruto.toLocaleString('es-ES')],
    ['Huellas', `${S.cierre.marcadas} · −${S.cierre.resta.toLocaleString('es-ES')}`]);
  for (const [lbl, v] of filas) {
    const d = document.createElement('div');
    const b = document.createElement('b'); b.textContent = v;
    const t = document.createElement('span'); t.textContent = lbl;
    d.appendChild(b); d.appendChild(t);
    det.appendChild(d);
  }
  el.hidden = false;
}

function tituloFin(cfg) {
  if (cfg.reloj) return 'Se acabó el día';
  if (cfg.helada) return 'El invierno se ha comido el panal';
  if (cfg.turnosFijos) return 'Se acabaron los turnos';
  if (cfg.abre) return S.completado ? '¡Panal completo!' : 'Se acabaron los turnos';
  return 'Sin jugadas';
}

// El relleno de una plaga pisada, más encendido cuanto más arriba (v8).
const ROJO_PISADA = ['#a0442f', '#ab4832', '#b74c36', '#c2503a'];

function updateHud(now = performance.now()) {
  const cfg = CONFIG_MODO[S.modo];
  const biggest = biggestCoherentArea(S);

  // Paso y máx, grandes y juntos (v8): si el máx es menor que el paso, se falla.
  // Ámbar en el máx cuando son iguales (la misma condición que «Última jugada
  // posible»). En el turno de un fallo, los dos en rojo un segundo y el paso que
  // no cupo tachado al lado: ese número lo trae el evento, no se deduce.
  const destelloFallo = falloEn === S.turn && now - falloT0 < 1000;
  setText('step', S.danza ? '∞' : S.step);
  setText('max', biggest);
  setText('paso-fallo', destelloFallo ? falloPaso : '');
  document.getElementById('step').className = 'big' + (destelloFallo ? ' fallo' : '');
  document.getElementById('max').className = 'big' +
    (destelloFallo ? ' fallo' : !S.danza && biggest === S.step ? ' cuidado' : '');

  document.getElementById('reloj-stat').hidden = !cfg.reloj;
  if (cfg.reloj) {
    setText('reloj', Math.ceil(S.reloj));
    const v = velocidadReloj(S);
    setText('ritmo', v > 1 ? `×${v.toFixed(1)}` : '');
    document.getElementById('reloj').className = 'big' + (S.reloj < 10 ? ' urgente' : '');
  }

  // Contagio: los turnos que quedan, donde el Contrarreloj pone el reloj (v10).
  document.getElementById('quedan-stat').hidden = !cfg.turnosFijos;
  if (cfg.turnosFijos) {
    const q = turnosRestantes(S);
    setText('quedan', q);
    document.getElementById('quedan').className = 'big' + (q <= 5 && !S.gameOver ? ' urgente' : '');
  }
  // Expansión: las abiertas del anillo (v10).
  document.getElementById('abiertas-stat').hidden = !cfg.abre;
  if (cfg.abre) { setText('abiertas', abiertas(S)); setText('abiertas-de', `/ ${CERRADAS_EXPANSION.length}`); }

  // Lo secundario, en una línea pequeña. Tiene que caber en UNA línea de 336 px
  // (360 de móvil menos márgenes): si salta a dos, el panal pierde 17 px.
  const puntos = cfg.puntua ? S.score.toLocaleString('es-ES') : '—';
  if (cfg.abre) setHtml('datos', `Turno <b>${S.turn}</b> de ${TOPE_EXPANSION[S.dificultad]} · Racha <b>${S.streak}</b>`);
  else setHtml('datos', `Puntos <b>${puntos}</b> · Racha <b>${S.streak}</b> · Turno <b>${S.turn}</b>`);

  // Contagio: cuánto restarían las huellas si acabara ahora, leído del motor.
  const hc = document.getElementById('huellas-cab');
  hc.hidden = !cfg.huellas;
  if (cfg.huellas) {
    const n = celdasMarcadas(S);
    const html = `Huellas <b>${n}</b>` + (n ? ` · <b>−${penalizacionHuellas(S).toLocaleString('es-ES')}</b>` : '');
    if (hc.innerHTML !== html) hc.innerHTML = html;
  }

  // Invierno: lo que muerde la helada si fallas (v7), en su propia fila desde
  // la v8, donde en Contrarreloj van las plagas.
  if (cfg.helada) {
    const muerde = Math.min(HELADA_MUERDE[S.dificultad], tilesPlayable(S));
    setHtml('helada', `Panal <b>${tilesPlayable(S)}</b> celdas · si fallas <b>−${muerde}</b>`);
  }

  // El ítem que está en el tablero se resalta, con los turnos que le quedan
  // antes de evaporarse.
  document.querySelectorAll('#leyenda .chip').forEach(c => {
    const suyo = !!S.item && c.dataset.item === S.item.tipo;
    c.classList.toggle('activo', suyo);
    c.querySelector('.cuenta').textContent =
      suyo ? `${Math.max(0, S.item.caduca - S.turn)}t` : '';
  });

  if (cfg.desastres) pintarPlagas(now);
  pintarLineas(cfg, biggest);
}

// La fila de plagas. Cada celda en uno de tres estados: PISADA (ya encendida
// desde la última cosecha grande), SI FALLAS (la siguiente) o POR VENIR.
// Qué cae si fallas lo dice el motor (siguienteDesastre), no una copia de sus
// reglas: hasta la v6 el HUD llevaba la suya y decía «calma» un turno de más
// (CR-07). Con el contador a cero el aviso es tenue (`previo`): avisa de lo que
// pasaría, no de un peligro en marcha (CR-06).
function pintarPlagas(now) {
  const n = S.failStreak;
  const tope = DESASTRES_VISIBLES.length;
  setText('plagas-n', Math.min(n, tope));
  const siguiente = siguienteDesastre(S);
  // Al espantarlas (evento `baja`) se apagan en cascada de derecha a izquierda
  // (v8): mientras dura, las que estaban encendidas siguen pisadas hasta su
  // momento. Es cuando se aprende que la cosecha grande limpia la escalera.
  // Desde la v8.4 sólo se apagan las que baja la cosecha (de `desde` a `hasta`).
  const enCascada = p => cascada && now - cascada.t0 < CASCADA_MS && p <= cascada.desde && p > cascada.hasta &&
    now - cascada.t0 < (cascada.desde - p + 1) * (CASCADA_MS / (cascada.desde - cascada.hasta));
  // Turnos en los que fallar aún no trae nada. El fallo de la interfaz ocurre
  // en S.turn + 1, de ahí el −1: en el último turno de calma ya son 0.
  const calma = Math.max(0, S.calmaHasta - S.turn - 1);
  const capullo = S.desastres.some(d => d.tipo === 'capullo');
  const seda = S.desastres.find(d => d.tipo === 'seda');
  document.querySelectorAll('#plagas-fila .plaga').forEach(c => {
    const tipo = c.dataset.des;
    const info = DESASTRE_INFO[tipo];
    const p = info.peldano;
    const sig = tipo === siguiente;
    const pisada = (!sig && p <= n) || enCascada(p);
    c.classList.toggle('siguiente', sig && !pisada);
    c.classList.toggle('previo', sig && n === 0);
    c.classList.toggle('pisada', pisada);
    c.querySelector('polygon').style.fill = pisada ? ROJO_PISADA[p - 1] : '';
    let et = pisada ? info.nombre : sig ? 'si fallas' : '·', ahora = '';
    if (tipo === 'polilla' && capullo) {
      et = 'capullo';
      ahora = 'Hay un capullo en el panal: eclosiona si fallas. Una cosecha grande lo quita.';
    }
    if (tipo === 'seda' && seda) {
      const quedan = Math.max(0, seda.hasta - S.turn);
      et = `${quedan}t`;
      ahora = `La seda bloquea sus celdas ${quedan} ${quedan === 1 ? 'turno' : 'turnos'} más. No se quita.`;
    }
    if (tipo === 'velutina' && calma > 0) {
      et = `calma ${calma}t`;
      ahora = `Calma: si fallas en los próximos ${calma} turnos no cae nada. Después, cada fallo es otra velutina.`;
    }
    const e = c.querySelector('.et');
    if (e.textContent !== et) e.textContent = et;
    c.dataset.ahora = ahora;
    // La que se acaba de encender, con un destello: tiene que notarse.
    const brilla = plagaNueva && plagaNueva.tipo === tipo && now >= plagaNueva.t0 && now - plagaNueva.t0 < 800;
    c.classList.toggle('destello', brilla);
  });
  document.querySelectorAll('#plagas-fila .trazo').forEach(t => {
    const hasta = Number(t.dataset.hasta);
    t.classList.toggle('on', hasta <= n || enCascada(hasta));
  });
}

// Las dos líneas de aviso (v8), cada una debajo de lo suyo. Lo del turno se
// queda hasta el turno siguiente, como en la v6.
function pintarLineas(cfg, biggest) {
  let txt = '', cls = 'linea';
  if (logItemsEn === S.turn && logItems) txt = logItems;
  else if (S.danza) { txt = 'Danza: este arrastre puede tener la longitud que quieras'; cls = 'linea bueno'; }
  ponerLinea('linea-items', txt, cls);

  txt = ''; cls = 'linea';
  if (S.gameOver) {
    const pts = `${S.score.toLocaleString('es-ES')} puntos en ${S.turn} turnos`;
    txt = cfg.reloj ? `Se acabó el día · ${pts}`
        : cfg.helada ? `El invierno se ha comido el panal · ${pts}`
        : cfg.turnosFijos ? `Se acabaron los turnos · ${S.score.toLocaleString('es-ES')} puntos`
        : cfg.abre ? (S.completado ? `¡Panal completo en ${S.turn} turnos!` : `Sin completar · ${abiertas(S)} de ${CERRADAS_EXPANSION.length} celdas`)
        : `Sin jugadas · ${S.turn} turnos`;
    cls = 'linea over';
  } else if (cfg.abre && abririaAhora(dragReady(S))) {
    // Expansión: lo que abre la cosecha que estás arrastrando. Manda sobre lo
    // del turno anterior: es lo que estás decidiendo ahora.
    const q = abririaAhora(dragReady(S));
    txt = `Esta cosecha abre ${q.abre === 1 ? '1 celda' : `${q.abre} celdas`}` +
      (q.tocadas.length > q.abre ? ` de las ${q.tocadas.length} que toca` : '');
    cls = 'linea bueno';
  } else if (logFalloEn === S.turn && logFallo) {
    txt = logFallo; cls = logFalloClase;
  } else if (!S.danza && biggest === S.step) {
    // El juego sabe antes que tú que vas a fallar. Aprovecharlo.
    txt = 'Última jugada posible con este paso';
    cls = 'linea tight';
  }
  // La pista «si cosechas ahora…» (v7) se quitó en la v8.4: la escala fija de la
  // cabecera de la fila lo dice siempre, sin avisos que aparecen y desaparecen.
  ponerLinea('linea-fallo', txt, cls);
}
// Las líneas llevan <b> (la frase del fallo); todo lo que entra lo compone el
// propio juego. El `title` guarda el texto entero, que la elipsis corta.
function ponerLinea(id, html, cls) {
  const l = document.getElementById(id);
  if (l.innerHTML !== html) { l.innerHTML = html; l.title = l.textContent; }
  l.className = cls;
}

// Lo que ha pasado en el último turno, repartido en las dos líneas.
let logItems = '', logItemsEn = -1;
let logFallo = '', logFalloEn = -1, logFalloClase = 'linea';
// El destello de paso y máx, la plaga que se enciende y la cascada al espantar.
let falloEn = -1, falloT0 = 0, falloPaso = 0;
let plagaNueva = null, cascada = null;
const CASCADA_MS = 400;

// Lo que viene tras la flecha en la frase del fallo (v8). Los números de regla
// salen de su constante y los de la jugada, del evento.
function trasElFallo(e) {
  const cfg = CONFIG_MODO[S.modo];
  if (cfg.helada && e.eaten !== undefined) {
    const n = Math.min(HELADA_MUERDE[S.dificultad], S.heladas.length);
    return n > 1 ? `la helada rompe ${n} celdas` : 'la helada rompe 1 celda';
  }
  if (!cfg.desastres) return 'el paso vuelve a 1';   // Panal libre (o helada que no muerde)
  const d = e.desastre;
  if (!d) return 'no cae nada';
  if (d.tipo === 'varroa') return `<b>Varroa</b>: ${DESASTRE_INFO.varroa.que}`;
  if (d.tipo === 'polilla') return '<b>Polilla</b>: deja un capullo';
  if (d.tipo === 'seda') return `<b>Seda</b>: el capullo eclosiona, ${d.tiles.length} celdas bloqueadas ${SEDA_TURNOS} turnos`;
  return `<b>¡Velutina!</b> ${d.tiles.length} celdas a cera · ${CALMA_TRAS_VELUTINA} turnos de calma`;
}

function contar(eventos) {
  const items = [], fallo = [];
  const now = performance.now();
  let hayCascada = false;
  for (const e of eventos) {
    // El humo lo cuenta su `deshiela`; si no había nada roto, se dice.
    if (e.type === 'usa' && e.tipo === ITEMS.HUMO && !eventos.some(x => x.type === 'deshiela'))
      items.push('✦ Humo: no había ninguna celda rota');
    else if (e.type === 'usa' && e.tipo !== ITEMS.HUMO) items.push(`✦ ${ITEM_INFO[e.tipo].nombre}: ${ITEM_INFO[e.tipo].hecho}`);
    if (e.type === 'caduca') items.push(`La gota de ${ITEM_INFO[e.tipo].nombre.toLowerCase()} se ha evaporado`);
    if (e.type === 'deshiela') { items.push('El humo empuja la helada: una celda vuelve como agua'); avisar('deshiela', [e.tile]); }
    // Espantar las plagas se cuenta (v7) y se ve apagarse (v8): hasta la v6 el
    // contador volvía a 0 en silencio y el jugador no aprendía que la cosecha
    // grande es su defensa.
    if (e.type === 'baja') {
      const quita = eventos.some(x => x.type === 'limpia');
      const van = e.desde - e.hasta;
      const cuanto = e.hasta === 0 ? 'las plagas se van'
        : `se ${van === 1 ? 'va 1 plaga' : `van ${van} plagas`} (${e.hasta === 1 ? 'queda 1' : `quedan ${e.hasta}`})`;
      fallo.push(`Cosecha de ${e.cosecha}: ${cuanto}` + (quita ? ' y el capullo desaparece' : ''));
      cascada = { t0: now, desde: e.desde, hasta: e.hasta };
      hayCascada = true;
    }
    if (e.type === 'limpia' && !eventos.some(x => x.type === 'baja')) fallo.push('La cosecha elimina el capullo');
    // Contagio (v10).
    if (e.type === 'limpiaHuella') {
      fallo.push(`Cosecha: ${e.tiles.length === 1 ? 'limpias 1 huella' : `limpias ${e.tiles.length} huellas`}`);
      avisar('limpiaHuella', e.tiles);
    }
    if (e.type === 'contagia') {
      // Desde la v10.1 la celda contagiada baja a cera: se dice, para que se
      // entienda por qué bajó.
      // Corta: puede compartir las dos líneas con el fallo que provoca.
      fallo.push(`<b>Contagio</b>: la ${e.tipo === 'velutina' ? 'velutina' : 'varroa'} baja ${e.desde === HUEVO ? 'un' : 'una'} ${NOMBRE_NIVEL[e.desde]} a cera`);
      avisar('contagia', [e.tile]);
    }
    // Expansión (v10): lo que abre la cosecha, y si se pierde algo, por qué.
    if (e.type === 'abre') {
      const n = e.tiles.length, pierde = e.gana - n, cosecha = S.last.path.length;
      fallo.push(n === 0 ? `Cosecha de ${cosecha}: no toca el borde, no abre nada`
        : `Cosecha de ${cosecha}: ${n === 1 ? 'abres 1 celda' : `abres ${n} celdas`}` +
          (pierde > 0 ? ` (${pierde === 1 ? 'otra no tocaba' : `otras ${pierde} no tocaban`} el borde)` : ''));
      avisar('abre', e.tiles);
    }
    if (e.type === 'fallback') {
      fallo.push(`<b>Fallo</b> · paso ${e.paso} inalcanzable → ${trasElFallo(e)}`);
      falloEn = S.turn; falloT0 = now; falloPaso = e.paso;
      // Los destellos del panal (v7) se quedan tal cual.
      if (e.eaten !== undefined) avisar('helada', S.heladas.slice(-HELADA_MUERDE[S.dificultad]));
      const d = e.desastre;
      if (d) {
        avisar(d.tipo, d.tiles);
        // Si en el mismo turno se espantaron, primero la cascada y luego ésta.
        plagaNueva = { tipo: d.tipo, t0: now + (hayCascada ? CASCADA_MS : 0) };
      }
    }
  }
  logItems = items.join(' · '); logItemsEn = S.turn;
  logFallo = fallo.join(' · '); logFalloEn = S.turn;
  logFalloClase = 'linea' + (eventos.some(e => e.type === 'fallback' || e.type === 'contagia') ? ' tight'
                           : eventos.some(e => e.type === 'baja' || e.type === 'limpiaHuella' || (e.type === 'abre' && e.tiles.length)) ? ' bueno' : '');
}

function onCommit(cells) {
  const antes = S.height.slice();
  if (!commitTurn(S, cells)) return;
  // Máximos de la partida, sólo para la pantalla de fin: se llevan aquí para no
  // meter datos de interfaz en el estado del motor.
  S.streakMax = Math.max(S.streakMax || 0, S.streak);
  S.jugadaMax = Math.max(S.jugadaMax || 0, cells.length);
  if (S.last.type === 'harvest') {
    const t = performance.now();
    cells.forEach((i, k) => abejas.push({
      x: layout.cx[i], y: layout.cy[i] - Math.max(0, antes[i] - 1) * LIFT, t0: t + k * 60,
    }));
  }
  contar(S.eventos);
  guardarPartida();
}

// Bucle: el reloj de Contrarreloj corre en tiempo real, y las abejas y el ítem se animan.
function frame(now) {
  const dt = Math.min(0.25, (now - (ultimoFrame || now)) / 1000);
  ultimoFrame = now;
  // El reloj se para con la pestaña oculta, fuera de la partida y con la hoja
  // abierta (v9): la hoja tapa el panal entero, así que no se puede pensar la
  // jugada con el tiempo parado.
  const enPausa = document.hidden || pantalla !== 'partida' || !!hojaAbierta;
  if (!enPausa) {
    if (S.arrancado && !S.gameOver) duracion += dt;
    tick(S, dt);
    // Con el reloj en marcha, lo guardado se queda viejo en segundos (v9.1).
    if (CONFIG_MODO[S.modo].reloj && S.arrancado && now - ultimoGuardado > 1000) guardarPartida();
  }
  while (abejas.length && now - abejas[0].t0 > 1500) abejas.shift();
  while (destellos.length && now - destellos[0].t0 > 900) destellos.shift();
  if (pantalla === 'partida') redraw(now);
  else if (!document.hidden) moverFondo(now);
  requestAnimationFrame(frame);
}

function resize() {
  // Con la partida oculta el hueco mide 0; se vuelve a medir al entrar.
  if (pantalla !== 'partida') return;
  const r = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  canvas.style.width = r.width + 'px';
  canvas.style.height = r.height + 'px';
  // En el móvil, Contrarreloj pega el panal a la fila de plagas (v8.3): con el
  // bloque de riesgo más alto, a un 30 % todavía se veía caído.
  const vertical = r.height > r.width * 1.1;
  const arriba = !vertical ? 0.5 : CONFIG_MODO[S.modo].desastres ? 0.1 : 0.3;
  computeLayout(canvas.width, canvas.height, arriba, TABLEROS[S.tablero].filas);
  redraw();
}

// Empezar otra partida sustituye a la guardada (v9.1): la de antes se borra ya,
// aunque la nueva no se guarde hasta su primer turno.
function restart(semilla) {
  borrarPartida();
  prepararPartida(nuevaPartida(semilla), 0);
}

// Pone en juego un estado, nuevo o recuperado, con la interfaz limpia.
function prepararPartida(estado, dur) {
  S = estado;
  finPintado = false;
  duracion = dur;
  destellos.length = 0;
  document.getElementById('fin').hidden = true;
  drag.cells = []; drag.desde = []; drag.trail = []; drag.deshaciendo = false; drag.fuera = false;
  abejas.length = 0;
  logItems = ''; logItemsEn = -1; logFallo = ''; logFalloEn = -1;
  falloEn = -1; plagaNueva = null; cascada = null;
  setText('seed', `semilla ${S.seed}`);
  pintarBarra();
  pintarLeyenda();
  if (canvas) resize(); else redraw();   // cada modo coloca el panal a su altura
}

// La barra de la partida (v9): el modo y, si la tiene, la dificultad.
function pintarBarra() {
  const dif = tieneDificultad(S.modo) ? ` <span>· ${NOMBRE_DIF[S.dificultad]}</span>` : '';
  setHtml('barra-modo', NOMBRE_MODO[S.modo] + dif);
}


// ===========================================================================
// Pantallas (v9, T-40)
// ===========================================================================
// Al abrir se ve el inicio; de él cuelgan los modos. La ficha de cada modo no
// es otra pantalla: es la hoja abierta sobre el inicio. Al recargar se vuelve
// siempre al inicio; la partida a medias, con «Continuar» (v9.1).
let pantalla = 'inicio';     // 'inicio' | 'partida'
let hojaAbierta = null;      // null | { desde: 'ficha' | 'partida', modo, pestana }

// T-30 (compartir por enlace) entrará directo aquí con mostrarPantalla('partida').
function mostrarPantalla(p) {
  pantalla = p;
  document.getElementById('inicio').hidden = p !== 'inicio';
  document.getElementById('partida').hidden = p !== 'partida';
  cerrarPop();
  // Las dos pantallas dibujan con el mismo `layout` de render.js: al cambiar,
  // cada una se vuelve a medir. Como sólo se ve una, no chocan.
  if (p === 'partida') resize(); else { pintarContinuar(); medirFondo(); marcarHayMas(); }
}

// El botón «Continuar partida», encima de los modos, con lo que se va a
// continuar. Sólo sale si hay una partida guardada que valga.
function pintarContinuar() {
  const g = leerPartida();
  document.getElementById('continuar').hidden = !g;
  if (g) setText('continuar-detalle', describirPartida(g.s));
}

// El inicio se desplaza con el dedo cuando los modos no caben (v10): la franja
// de abajo sólo se ve si queda algo por debajo.
function marcarHayMas() {
  const el = document.getElementById('inicio');
  el.classList.toggle('hay-mas', el.scrollTop + el.clientHeight < el.scrollHeight - 4);
}

// «‹ Menú» (de la barra o de la pantalla final): se guarda y se vuelve, sin
// preguntar, porque ya no se pierde nada (v9.1). Volver al inicio no toca S.
function volverAlInicio() {
  guardarPartida();
  mostrarPantalla('inicio');
  document.getElementById('inicio').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
}

// Del inicio a la partida: el inicio se funde y la partida aparece. `preparar`
// pone el estado en juego cuando la partida ya se ve, para que se mida bien.
function entrarEnPartida(preparar) {
  const entrar = () => {
    mostrarPantalla('partida');
    preparar();
    document.getElementById('partida').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
  };
  const inicio = document.getElementById('inicio');
  if (!inicio.animate) { entrar(); return; }
  inicio.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'ease-in' }).onfinish = entrar;
}

// «Continuar partida»: la guardada, tal cual se dejó, sin pasar por la ficha.
function continuarPartida() {
  const g = leerPartida();
  if (!g) { pintarContinuar(); return; }
  partida.modo = g.s.modo;
  partida.dificultad = g.s.dificultad;
  entrarEnPartida(() => prepararPartida(g.s, g.duracion));
}

// ---------------------------------------------------------------------------
// El panal vivo del inicio
// ---------------------------------------------------------------------------
// Una partida de verdad de Panal libre (sin reloj, ni plagas, ni helada) que
// juega el bot tonto de js/bot-tonto.js, una jugada cada FONDO_MS. La interfaz
// no elige jugadas (regla 8). Se dibuja sin números ni gota: es un decorado.
const FONDO_MS = 1200;
const fondo = { canvas: null, ctx: null, s: null, rng: null, semilla: 0, ultima: 0 };
function nuevoDemo(semilla) {
  fondo.semilla = semilla >>> 0;
  fondo.s = createState(MODOS.LIBRE, 'normal', fondo.semilla);
  // El bot lleva su propio azar, aparte del de la partida (como en tests/bot.js).
  fondo.rng = rng(fondo.semilla ^ 0x9e3779b9);
}
function moverFondo(now) {
  if (now - fondo.ultima < FONDO_MS) return;
  fondo.ultima = now;
  const cells = fondo.s.gameOver ? null : elegirJugada(fondo.s, fondo.rng);
  // Sin jugada, otra partida con la semilla siguiente.
  if (!cells || !commitTurn(fondo.s, cells)) nuevoDemo(fondo.semilla + 1);
  dibujarFondo(now);
}
function medirFondo() {
  const c = fondo.canvas;
  const r = c.parentElement.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.round(r.width * dpr);
  c.height = Math.round(r.height * dpr);
  c.style.width = r.width + 'px';
  c.style.height = r.height + 'px';
  dibujarFondo(performance.now());
}
function dibujarFondo(now) {
  const c = fondo.canvas;
  if (pantalla !== 'inicio' || !c.width || !c.height) return;
  computeLayout(c.width, c.height, 0.5);   // el layout es global: se pide cada vez
  draw(fondo.ctx, fondo.s, { cells: [], sinNumeros: true, sinItem: true }, now);
}

// ---------------------------------------------------------------------------
// La hoja: la ficha de cada modo y, desde la partida, la misma tarjeta en
// modo consulta
// ---------------------------------------------------------------------------
// Cada modo enseña sólo sus pestañas: en Invierno no se llega a Plagas (CR-11).
const PESTANAS = {
  contrarreloj: ['basico', 'contrarreloj', 'plagas'],
  invierno:     ['basico', 'invierno'],
  libre:        ['basico', 'libre'],
  contagio:     ['basico', 'contagio', 'plagas'],
  expansion:    ['basico', 'expansion'],
};
const NOMBRE_PESTANA = { basico: 'Básico', plagas: 'Plagas', ...NOMBRE_MODO };
const ORDEN_MODOS = [MODOS.CONTRARRELOJ, MODOS.INVIERNO, MODOS.LIBRE, MODOS.CONTAGIO, MODOS.EXPANSION];

// La primera ficha se abre en Básico; en cuanto se empieza una partida desde
// una ficha, las siguientes se abren en la pestaña del modo. Se marca al pulsar
// Empezar, no al abrir: quien abre y se vuelve sin jugar la verá otra vez en
// Básico. Si localStorage falla, se da por vista.
const BASICO_KEY = 'colmena.basicoVisto.v1';
function basicoVisto() {
  try { return localStorage.getItem(BASICO_KEY) === '1'; } catch { return true; }
}
function marcarBasicoVisto() {
  try { localStorage.setItem(BASICO_KEY, '1'); } catch { /* da igual */ }
}

// La última dificultad elegida en cada modo, en el dispositivo.
const DIF_KEY = 'colmena.dificultad.v1';
function leerDificultades() {
  try { return JSON.parse(localStorage.getItem(DIF_KEY)) || {}; } catch { return {}; }
}
function dificultadElegida(modo) {
  const d = leerDificultades()[modo];
  return d === 'dificil' ? 'dificil' : 'normal';
}
function guardarDificultad(modo, dif) {
  try {
    const d = leerDificultades();
    d[modo] = dif;
    localStorage.setItem(DIF_KEY, JSON.stringify(d));
  } catch { /* da igual */ }
}

// Lo que cambia entre las dos dificultades, dicho con la constante (regla 8).
function textoDificultad(modo, dif) {
  if (CONFIG_MODO[modo].huellas) return `se contagia cada ${CONTAGIO_CADA[dif]} turnos`;
  if (CONFIG_MODO[modo].abre) return `abre desde una cosecha de ${abreDesde(dif)} · ${TOPE_EXPANSION[dif]} turnos`;
  if (CONFIG_MODO[modo].reloj) return `acelera un ${Math.round(RELOJ_ACELERA[dif] * 100)} %`;
  const n = HELADA_MUERDE[dif];
  return `${n} ${n === 1 ? 'celda' : 'celdas'} por fallo`;
}

let hojaOrigen = null;       // quien la abrió: al cerrar, el foco vuelve ahí
let hojaCierre = 0;          // el temporizador de la animación de cierre

function abrirHoja({ desde, modo, pestana }) {
  cerrarPop();
  clearTimeout(hojaCierre);
  hojaAbierta = { desde, modo, pestana };
  hojaOrigen = document.activeElement;
  const hoja = document.getElementById('hoja');
  const velo = document.getElementById('hoja-fondo');
  // Alto: la ficha deja ver arriba el panal vivo (más alta la primera vez, que
  // abre en Básico); la consulta tapa el panal entero, desde la barra.
  hoja.classList.toggle('primera', desde === 'ficha' && pestana === 'basico' && !basicoVisto());
  hoja.style.top = desde === 'partida'
    ? Math.round(document.getElementById('barra').getBoundingClientRect().bottom + 6) + 'px' : '';
  pintarHoja();
  hoja.hidden = false; velo.hidden = false;
  hoja.getBoundingClientRect();              // fuerza el estilo de partida para que haya transición
  hoja.classList.add('abierta'); velo.classList.add('abierta');
  const activa = hoja.querySelector('.hoja-tabs [aria-selected="true"]');
  if (activa) activa.focus({ preventScroll: true });
}

function cerrarHoja() {
  if (!hojaAbierta) return;
  hojaAbierta = null;
  const hoja = document.getElementById('hoja');
  const velo = document.getElementById('hoja-fondo');
  hoja.classList.remove('abierta', 'arrastrando'); velo.classList.remove('abierta');
  hoja.style.transform = '';
  hojaCierre = setTimeout(() => { hoja.hidden = true; velo.hidden = true; }, 250);
  if (hojaOrigen && document.contains(hojaOrigen) && hojaOrigen.offsetParent) hojaOrigen.focus({ preventScroll: true });
  hojaOrigen = null;
}

// Pinta la hoja según hojaAbierta: pestañas, panel, dificultad, indicador de
// modos y botones. Las pestañas cambian el panel; la dificultad y los botones
// son de la hoja y se ven en todas.
function pintarHoja() {
  const { desde, modo, pestana } = hojaAbierta;
  const ficha = desde === 'ficha';
  const hoja = document.getElementById('hoja');
  hoja.style.setProperty('--acento', COLOR_MODO[pestana]);
  hoja.style.setProperty('--resalte', modo === MODOS.INVIERNO ? '#1b2226' : '#2a2218');
  hoja.style.setProperty('--color-modo', COLOR_MODO[modo]);
  hoja.setAttribute('aria-labelledby', `hoja-titulo-${pestana}`);

  const tabs = document.getElementById('hoja-tabs');
  tabs.innerHTML = '';
  tabs.classList.toggle('n2', PESTANAS[modo].length === 2);
  for (const p of PESTANAS[modo]) {
    const b = document.createElement('button');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(p === pestana));
    b.tabIndex = p === pestana ? 0 : -1;
    b.textContent = NOMBRE_PESTANA[p];
    b.addEventListener('click', () => cambiarPestana(p));
    tabs.appendChild(b);
  }
  hoja.querySelectorAll('.hoja-panel').forEach(el => {
    el.hidden = el.dataset.pestana !== pestana;
    if (!el.hidden) el.querySelector('.hoja-filas').scrollTop = 0;
  });

  pintarDificultad(modo, ficha);
  if (CONFIG_MODO[modo].abre) pintarEscalaExpansion(ficha ? dificultadElegida(modo) : S.dificultad);

  // Empezar otra sustituye a la guardada (v9.1): que no pille por sorpresa.
  const g = ficha ? leerPartida() : null;
  const aviso = document.getElementById('hoja-aviso');
  aviso.hidden = !g;
  if (g) aviso.textContent = `Empezar sustituye tu partida guardada de ${NOMBRE_MODO[g.s.modo]} (turno ${g.s.turn}).`;

  document.getElementById('hoja-modos').hidden = !ficha;
  if (ficha) {
    const k = ORDEN_MODOS.indexOf(modo);
    const puntos = document.getElementById('hoja-puntos');
    puntos.setAttribute('aria-label', `Modo ${k + 1} de ${ORDEN_MODOS.length}`);
    puntos.innerHTML = ORDEN_MODOS.map((m, j) => `<span${j === k ? ' class="actual"' : ''}></span>`).join('');
    document.getElementById('hoja-modo-ant').disabled = k === 0;
    document.getElementById('hoja-modo-sig').disabled = k === ORDEN_MODOS.length - 1;
  }
  document.getElementById('hoja-menu').hidden = !ficha;
  document.getElementById('hoja-empezar').hidden = !ficha;
  document.getElementById('hoja-volver').hidden = ficha;
  // En consulta de Contrarreloj, que se vea que el reloj no corre.
  document.getElementById('reloj-parado').hidden = ficha || !CONFIG_MODO[modo].reloj;
}

function cambiarPestana(p) {
  if (!hojaAbierta || hojaAbierta.pestana === p) return;
  hojaAbierta.pestana = p;
  pintarHoja();
  const activa = document.querySelector('#hoja-tabs [aria-selected="true"]');
  if (activa) activa.focus({ preventScroll: true });
}

// En la ficha, dos botones de radio: tocar uno lo elige y lo guarda, pero no
// empieza (eso es de «Empezar»). En consulta, de sólo lectura con la de la
// partida. Panal libre no tiene dificultad.
function pintarDificultad(modo, ficha) {
  const caja = document.getElementById('hoja-dif');
  caja.innerHTML = '';
  caja.hidden = !tieneDificultad(modo);
  if (caja.hidden) return;
  const elegida = ficha ? dificultadElegida(modo) : S.dificultad;
  if (ficha) {
    caja.setAttribute('role', 'radiogroup');
    caja.setAttribute('aria-label', 'Dificultad');
    const lbl = document.createElement('span');
    lbl.className = 'lbl-dif'; lbl.textContent = 'Dificultad';
    caja.appendChild(lbl);
  } else {
    caja.removeAttribute('role'); caja.removeAttribute('aria-label');
  }
  for (const dif of ['normal', 'dificil']) {
    const op = document.createElement(ficha ? 'button' : 'div');
    op.className = 'dif-op' + (dif === elegida ? ' on' : '') + (ficha ? '' : ' ro');
    op.innerHTML = (ficha ? '<span class="radio"></span>' : '') + '<span class="nom"></span><span class="txt"></span>';
    op.querySelector('.nom').textContent = NOMBRE_DIF[dif];
    op.querySelector('.txt').textContent = textoDificultad(modo, dif);
    if (ficha) {
      op.setAttribute('role', 'radio');
      op.setAttribute('aria-checked', String(dif === elegida));
      op.addEventListener('click', () => {
        guardarDificultad(modo, dif); pintarDificultad(modo, true);
        // La tarjeta de Expansión cambia con la dificultad (v10.1).
        if (CONFIG_MODO[modo].abre) pintarEscalaExpansion(dif);
      });
    }
    caja.appendChild(op);
  }
}

// Deslizar a los lados cambia de modo, sin dar la vuelta. Si se estaba en
// Básico se sigue en Básico; si no, la pestaña del modo nuevo.
function cambiarModoFicha(dir) {
  if (!hojaAbierta || hojaAbierta.desde !== 'ficha') return;
  const k = ORDEN_MODOS.indexOf(hojaAbierta.modo) + dir;
  if (k < 0 || k >= ORDEN_MODOS.length) return;
  const hoja = document.getElementById('hoja');
  const cambiar = () => {
    const modo = ORDEN_MODOS[k];
    hojaAbierta.modo = modo;
    if (hojaAbierta.pestana !== 'basico') hojaAbierta.pestana = modo;
    pintarHoja();
  };
  if (!hoja.animate) { cambiar(); return; }
  hoja.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 40}px)`, opacity: 0 }],
               { duration: 100, easing: 'ease-in' }).onfinish = () => {
    cambiar();
    hoja.animate([{ transform: `translateX(${dir * 40}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
                 { duration: 100, easing: 'ease-out' });
  };
}

// «Empezar»: el modo y la dificultad de la ficha. La hoja baja y el inicio se
// funde mientras aparece la partida. El fundido fino panal → panal es de T-14.
function empezar() {
  if (!hojaAbierta) return;
  const modo = hojaAbierta.modo;
  partida.modo = modo;
  partida.dificultad = tieneDificultad(modo) ? dificultadElegida(modo) : 'normal';
  marcarBasicoVisto();
  hojaOrigen = null;
  cerrarHoja();
  entrarEnPartida(() => restart());
}

// Los gestos de la hoja, con eventos pointer: arrastrar hacia abajo cierra
// (fuera de la zona que se desplaza, que tiene su propio scroll) y, en la
// ficha, deslizar a los lados cambia de modo. Cuál de los dos es se decide en
// los primeros ~10 px.
function gestosHoja(hoja) {
  let g = null, tocado = false;
  hoja.addEventListener('pointerdown', e => {
    if (!hojaAbierta || (e.pointerType === 'mouse' && e.button !== 0)) return;
    g = { x: e.clientX, y: e.clientY, t: performance.now(), eje: null,
          enFilas: !!e.target.closest('.hoja-filas'), id: e.pointerId };
    tocado = false;
  });
  hoja.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.eje) {
      if (Math.hypot(dx, dy) < 10) return;
      if (Math.abs(dx) > Math.abs(dy)) g.eje = hojaAbierta.desde === 'ficha' ? 'x' : 'nada';
      else g.eje = dy > 0 && !g.enFilas ? 'y' : 'nada';
      if (g.eje === 'y') { hoja.classList.add('arrastrando'); hoja.setPointerCapture(g.id); }
      tocado = g.eje !== 'nada';
    }
    if (g.eje === 'y') hoja.style.transform = `translateY(${Math.max(0, dy)}px)`;
  });
  const soltar = e => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    const v = dy / Math.max(1, performance.now() - g.t);   // px/ms
    if (g.eje === 'y') {
      hoja.classList.remove('arrastrando');
      if (e.type !== 'pointercancel' && (dy > 80 || v > 0.6)) cerrarHoja();
      else hoja.style.transform = '';
    } else if (g.eje === 'x' && e.type !== 'pointercancel' && Math.abs(dx) > 60) {
      cambiarModoFicha(dx < 0 ? 1 : -1);
    }
    g = null;
    // El clic de un gesto llega justo después de soltar; pasado ese momento,
    // la marca no puede comerse el toque siguiente.
    setTimeout(() => { tocado = false; }, 50);
  };
  hoja.addEventListener('pointerup', soltar);
  hoja.addEventListener('pointercancel', soltar);
  // Un gesto que acaba encima de un botón no es un toque.
  hoja.addEventListener('click', e => {
    if (tocado) { e.stopPropagation(); e.preventDefault(); tocado = false; }
  }, true);
}

// ===========================================================================
// Arranque
// ===========================================================================
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('board');
  ctx = canvas.getContext('2d');
  initInput(canvas, () => S, onCommit, redraw);
  rellenarConstantes();
  // Nombres y frases de los modos desde sus tablas: el inicio y la hoja no
  // pueden discrepar.
  document.querySelectorAll('[data-nombre]').forEach(el => { el.textContent = NOMBRE_MODO[el.dataset.nombre]; });
  document.querySelectorAll('[data-frase]').forEach(el => {
    el.textContent = FRASE_MODO[el.dataset.frase];
    if (el.classList.contains('frase')) el.style.color = COLOR_MODO[el.dataset.frase];
  });
  setText('inicio-version', VERSION);
  pintarTarjeta();
  pintarEscalaExpansion('normal');

  document.getElementById('inicio').addEventListener('scroll', marcarHayMas, { passive: true });

  // El inicio: cada modo abre su ficha.
  document.getElementById('continuar').addEventListener('click', continuarPartida);
  document.querySelectorAll('.modo-fila').forEach(b => b.addEventListener('click', () => {
    const modo = b.dataset.modo;
    abrirHoja({ desde: 'ficha', modo, pestana: basicoVisto() ? modo : 'basico' });
  }));

  // La hoja.
  const hoja = document.getElementById('hoja');
  gestosHoja(hoja);
  document.getElementById('hoja-fondo').addEventListener('click', cerrarHoja);
  document.getElementById('hoja-menu').addEventListener('click', cerrarHoja);
  document.getElementById('hoja-volver').addEventListener('click', cerrarHoja);
  document.getElementById('hoja-empezar').addEventListener('click', empezar);
  document.getElementById('hoja-modo-ant').addEventListener('click', () => cambiarModoFicha(-1));
  document.getElementById('hoja-modo-sig').addEventListener('click', () => cambiarModoFicha(1));

  // Las (i) de la partida abren la hoja en consulta, en su pestaña.
  document.querySelectorAll('#partida [data-hoja]').forEach(b => b.addEventListener('click', () => {
    abrirHoja({ desde: 'partida', modo: S.modo, pestana: b.dataset.hoja });
  }));

  // La barra y la pantalla final.
  document.getElementById('partida-menu').addEventListener('click', volverAlInicio);
  // «Otra vez»: el mismo modo y la misma dificultad, sin pasar por la ficha.
  document.getElementById('fin-otra').addEventListener('click', () => restart());
  document.getElementById('fin-menu').addEventListener('click', volverAlInicio);

  // El panel flotante se cierra al tocar fuera. El canvas se lleva sus propios
  // eventos, así que esto escucha en la fase de captura.
  document.addEventListener('pointerdown', e => {
    if (!popAncla) return;
    const p = document.getElementById('pop');
    if (!p.contains(e.target) && !popAncla.contains(e.target)) cerrarPop();
  }, true);
  // Escape cierra lo que esté encima; en la ficha, las flechas cambian de modo.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (hojaAbierta) cerrarHoja();
      else cerrarPop();
    } else if (hojaAbierta && hojaAbierta.desde === 'ficha' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      cambiarModoFicha(e.key === 'ArrowRight' ? 1 : -1);
    }
  });

  // La semilla: el botón abre el panel; la del pie se copia al tocarla.
  document.getElementById('semilla-btn').addEventListener('click', e => {
    const b = e.currentTarget;
    if (popAncla === b) { cerrarPop(); return; }
    cerrarPop(); abrirPop(b, panelSemilla());
  });
  const seed = document.getElementById('seed');
  async function copiarSemilla() {
    if (!await copiarTexto(String(S.seed))) return;
    seed.classList.add('copiada');
    seed.textContent = `semilla ${S.seed} · ¡copiada!`;
    setTimeout(() => {
      seed.classList.remove('copiada');
      seed.textContent = `semilla ${S.seed}`;
    }, 1200);
  }
  seed.addEventListener('click', copiarSemilla);
  seed.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copiarSemilla(); }
  });

  // Al ocultar la pestaña o cerrar la página, se guarda (v9.1). Sólo desde la
  // partida: en el inicio S puede ser una partida sin empezar, y guardarla
  // borraría la que hay guardada.
  const alSalir = () => { if (pantalla === 'partida') guardarPartida(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) alSalir(); });
  window.addEventListener('pagehide', alSalir);

  // El panal vivo.
  fondo.canvas = document.getElementById('fondo');
  fondo.ctx = fondo.canvas.getContext('2d');
  nuevoDemo((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);

  window.addEventListener('resize', () => {
    cerrarPop();
    if (pantalla === 'partida') resize(); else { medirFondo(); marcarHayMas(); }
    // La consulta va pegada a la barra: si cambia la ventana, se recoloca.
    if (hojaAbierta && hojaAbierta.desde === 'partida')
      hoja.style.top = Math.round(document.getElementById('barra').getBoundingClientRect().bottom + 6) + 'px';
  });
  // El hueco del panal también cambia sin que cambie la ventana: cada modo tiene
  // su bloque de riesgo (plagas, helada o nada) y cada uno mide distinto. Hasta
  // la v8.1 sólo se medía al cargar, así que al pasar de Invierno a Contrarreloj
  // el panal se dibujaba 53 px más abajo de lo que tocaba (playtest de la v8).
  if (window.ResizeObserver) {
    new ResizeObserver(() => resize()).observe(document.getElementById('wrap'));
    new ResizeObserver(() => { if (pantalla === 'inicio') medirFondo(); }).observe(document.getElementById('fondo-wrap'));
  }
  mostrarPantalla('inicio');
  requestAnimationFrame(frame);
});
