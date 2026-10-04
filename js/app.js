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
  const s = createState(partida.modo, partida.dificultad, seed);
  // Las jugadas y sus tiempos (v11.4, T-50), para el historial: viajan con el
  // estado, como streakMax, para que se guarden con la partida a medias.
  s.jugadas = []; s.tiempos = [];
  return s;
}

// El código de la partida de ahora (v11.4): «CR-N-4069568398». Puzzle no tiene.
const codigoActual = () => codigoPartida(S.modo, S.dificultad, S.seed);

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
  draw(ctx, S, { cells: drag.cells, ready, fuera: drag.fuera, abejas, destellos, abriria: q && q.tocadas,
                 guia: guiaTutorial() || guiaPuzzle(), explica: explicacionFallo() }, now);
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
  if (popAncla) popAncla.classList.remove('abierto');
  p.hidden = true; p.innerHTML = ''; p.className = ''; popAncla = null;
  document.getElementById('pop-velo').hidden = true;
}
function abrirPop(ancla, contenido) {
  const p = document.getElementById('pop');
  p.innerHTML = ''; p.appendChild(contenido); p.hidden = false;
  popAncla = ancla;
  recolocarPop();
}
function recolocarPop() {
  const p = document.getElementById('pop');
  const r = popAncla.getBoundingClientRect();
  const w = p.getBoundingClientRect().width;
  p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  p.style.top = (r.bottom + 5) + 'px';
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
  // Un nivel de Puzzle no se guarda (v11): ni sustituye ni borra la partida
  // guardada de otro modo, que sigue ahí para «Continuar».
  if (CONFIG_MODO[S.modo].puzle) return;
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
// buena (T-29). Desde la v11.4 (T-50) es el código de la partida, con su modo y su
// dificultad, y hay dos sitios: el «#» de la partida (copiar el de ahora o jugar
// otro; un número solo, en el modo de ahora) y el del inicio (pegar uno y jugarlo:
// antes de jugar dice qué modo y qué dificultad son).
function panelSemilla(desde) {
  const enInicio = desde === 'inicio';
  const caja = document.createElement('div');
  const t = document.createElement('b');
  t.textContent = enInicio ? 'Jugar una semilla' : 'Semilla';
  const input = document.createElement('input');
  input.className = 'codigo';
  input.value = enInicio ? '' : codigoActual();
  input.placeholder = 'CR-N-4069568398';
  input.inputMode = 'text';
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'characters');
  input.spellcheck = false;
  input.setAttribute('aria-label', enInicio ? 'Código de la partida' : 'Código de la partida de ahora');
  const estado = document.createElement('span');
  estado.className = 'sem-estado';
  estado.setAttribute('aria-live', 'polite');

  const jugar = document.createElement('button');
  jugar.textContent = 'Jugar';
  const nota = document.createElement('span');
  nota.className = 'nota';
  nota.textContent = enInicio
    ? 'El código lleva el modo y la dificultad. Lo encuentras en tus partidas y al acabar cada una.'
    : 'El código lleva el modo y la dificultad. Un número solo se juega en el modo de ahora.';

  // Lo que se ha reconocido, mientras se escribe o se pega.
  const leido = () => {
    const r = leerCodigo(input.value);
    if (r && r.sinModo && enInicio) return { r: null, txt: 'Le falta el modo: pega el código entero.', color: '#ff7a45' };
    if (!input.value.trim()) return { r: null, txt: enInicio ? 'Pega el código que te han pasado.' : '', color: '#8c7f6a' };
    if (!r) return { r: null, txt: 'Eso no es un código de semilla.', color: '#ff7a45' };
    const modo = r.sinModo ? S.modo : r.modo, dif = r.sinModo ? S.dificultad : r.dificultad;
    return { r, txt: describirModoDif(modo, dif) + (r.sinModo ? ' (el de ahora)' : ''), color: COLOR_MODO[modo] };
  };
  const actualizar = () => {
    const { r, txt, color } = leido();
    estado.textContent = txt;
    estado.style.color = color;
    input.classList.toggle('vale', !!r);
    jugar.classList.toggle('vale', !!r);
  };
  input.addEventListener('input', actualizar);

  jugar.addEventListener('click', () => {
    const { r } = leido();
    if (!r) { actualizar(); input.focus(); return; }
    cerrarPop();
    if (enInicio) { jugarCodigo(r); return; }
    // En la partida: un código juega su modo y su dificultad, aunque sean otros.
    if (!r.sinModo) {
      partida.modo = r.modo;
      partida.dificultad = r.dificultad;
      guardarUltimoModo(r.modo);
    }
    restart(r.semilla);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') jugar.click(); });

  caja.appendChild(t); caja.appendChild(input); caja.appendChild(estado);
  if (enInicio) {
    // Jugar sustituye a la guardada (§5.36), como «Empezar» en una ficha.
    const g = leerPartida();
    if (g) {
      const aviso = document.createElement('span');
      aviso.className = 'sem-aviso';
      aviso.textContent = `Jugar sustituye tu partida guardada de ${NOMBRE_MODO[g.s.modo]} (turno ${g.s.turn}).`;
      caja.appendChild(aviso);
    }
    jugar.className = 'jugar-codigo';
    caja.appendChild(jugar);
  } else {
    const fila = document.createElement('div');
    fila.className = 'difs';
    const copiar = document.createElement('button');
    copiar.textContent = 'Copiar';
    copiar.addEventListener('click', async () => {
      copiar.textContent = await copiarTexto(input.value.trim()) ? '¡Copiada!' : 'No se pudo';
      setTimeout(() => { copiar.textContent = 'Copiar'; }, 1200);
    });
    fila.appendChild(jugar); fila.appendChild(copiar);
    caja.appendChild(fila);
  }
  caja.appendChild(nota);
  actualizar();
  return caja;
}
// «Contrarreloj · Normal»; Panal libre, sin dificultad.
function describirModoDif(modo, dif) {
  return NOMBRE_MODO[modo] + (tieneDificultad(modo) ? ` · ${NOMBRE_DIF[dif]}` : '');
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
                    N_CERRADAS: CERRADAS_EXPANSION.length, VELUTINA_CELDAS: VELUTINA_CELDAS.join('-'),
                    PUZZLE_PISTA_TRAS, PUZZLE_SOLUCION_TRAS, GUIADA_ESTRELLAS: '★'.repeat(PUZZLE_GUIADA_ESTRELLAS) };
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
  const tutorial = enTutorial();
  if (!S.gameOver) {
    el.hidden = true; finPintado = false;
    // Los botones de abajo vuelven cuando el nivel sigue (al deshacer).
    mostrar('tut-pie', tutorial);
    mostrar('puzle-pie', !!S.puzle && !tutorial);
    return;
  }
  if (finPintado) return;
  finPintado = true;
  mostrar('fin-atascado', false);
  mostrar('fin-ayuda', false);
  const cfg = CONFIG_MODO[S.modo];
  // El final va debajo del panal, no encima (v11.2), cuando hay que ver el panal:
  // siempre en el tutorial y en Puzzle al perder por fallo (el grupo de máx).
  const abajo = tutorial || (!!S.puzle && !S.puzle.resultado.gana && S.puzle.resultado.motivo === 'fallo');
  colocarFin(abajo);
  el.classList.remove('tut-bien', 'tut-fallo');
  document.getElementById('fin-volver').hidden = !cfg.puzle || tutorial;
  // El código y «Repetir este panal» (v11.4): sólo en los modos con código.
  document.getElementById('fin-codigo').hidden = !!cfg.puzle;
  document.getElementById('fin-repetir').hidden = !!cfg.puzle;
  // Compartir (v11.9, T-30): las que tienen resultado que retar, las de Tus
  // partidas. Ni Puzzle ni el tutorial (sin código) ni Panal libre (sin resultado).
  document.getElementById('fin-compartir').hidden = !MODOS_HISTORIAL.includes(S.modo) || !!cfg.puzle;
  el.classList.toggle('puzle', !!cfg.puzle);
  if (tutorial) { pintarFinTutorial(); return; }
  if (cfg.puzle) { mostrar('puzle-pie', !abajo); pintarFinPuzle(); el.hidden = false; return; }
  setText('fin-menu', '‹ Menú');
  setText('fin-otra', 'Otra vez');
  borrarPartida();   // acabada no se continúa
  apuntarPartida();
  const cod = document.getElementById('fin-codigo');
  cod.classList.remove('copiado');
  setText('fin-cod', codigoActual());
  setText('fin-cod-acc', 'Copiar');
  cod.setAttribute('aria-label', `Copiar el código de esta partida, ${codigoActual()}`);

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

// hidden sin tocar el DOM si no cambia (se llama en cada fotograma).
function mostrar(id, si) {
  const el = document.getElementById(id);
  if (el.hidden === si) el.hidden = !si;
}
// #fin va encima de la partida, de la barra para abajo (v11.4, como el boceto del
// final: con el código y «Repetir este panal» ya no cabía en el hueco del panal, y
// en Contrarreloj los botones quedaban cortados). En Puzzle sigue encima del panal,
// dentro de #wrap, donde cabe y deja ver el objetivo. Debajo (v11.2) pasa a ir después
// de #wrap, en el flujo: el hueco del panal encoge y el panal se vuelve a medir solo
// (ResizeObserver), así la tarjeta no lo tapa.
function colocarFin(abajo) {
  const fin = document.getElementById('fin'), wrap = document.getElementById('wrap');
  const partidaEl = document.getElementById('partida');
  fin.classList.toggle('abajo', abajo);
  if (abajo) {
    if (fin.previousElementSibling !== wrap) wrap.after(fin);
    fin.style.top = '';
  } else if (S.puzle) {
    if (fin.parentElement !== wrap) wrap.appendChild(fin);
    fin.style.top = '';
  } else {
    if (fin.parentElement !== partidaEl || fin.nextElementSibling) partidaEl.appendChild(fin);
    const barra = document.getElementById('barra');
    fin.style.top = (barra.offsetTop + barra.offsetHeight + 4) + 'px';
  }
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
  if (cfg.puzle) { if (enTutorial()) pintarHudTutorial(); else pintarHudPuzle(); return; }
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

// `cells`, la jugada: el tamaño de la cosecha no se lee de S.last, que el fallo del
// mismo turno sustituye (v11.4; hasta entonces, en Expansión, una cosecha que abría
// y dejaba el panal sin sitio para el paso daba un error y el turno no se guardaba).
function contar(eventos, cells) {
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
      const n = e.tiles.length, pierde = e.gana - n, cosecha = cells.length;
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
  const tutorial = enTutorial();
  // Nivel 3 del tutorial: hasta cancelar una vez, soltar dentro no juega (es una
  // regla del tutorial, no del juego: el motor no se entera).
  if (tutorial && nivelTutorial().cancelar && !tut.cancelado) return;
  const antes = S.height.slice();
  const copia = S.puzle ? copiaPuzle(S) : null;
  if (!commitTurn(S, cells)) return;
  if (copia && tutorial) {
    historiaPuzle.push(copia);
    tut.aviso = '';
    if (S.puzle.resultado && S.puzle.resultado.gana) guardarTutorial(tut.k + 1);
  } else if (copia) {
    historiaPuzle.push(copia);
    const antes = abiertosPuzzle(CAPITULOS, PUZLES, progresoPuzzle.mejores).capitulos;
    puzleMejora = apuntarPuzzle(progresoPuzzle, S.puzle.id, S.puzle.resultado);
    // El intento se cuenta al acabar (v11.11, T-55, §5.102): perder, fallido; ganar, ganado.
    contarJugada(S.puzle.resultado);
    if (puzleMejora) {
      guardarProgresoPuzzle();
      // El nivel que abre un capítulo lo dice en su final (v11.1).
      const ahora = abiertosPuzzle(CAPITULOS, PUZLES, progresoPuzzle.mejores).capitulos;
      const n = Object.keys(ahora).find(k => ahora[k].abierto && !antes[k].abierto);
      if (n !== undefined) capituloAbierto = Number(n);
    }
    // Resolver un nivel (hoy, C1-01 desde «Aprende a jugar») deja de ser «primera vez».
    if (S.puzle.resultado && S.puzle.resultado.gana) marcarYaJugado();
  }
  // Las jugadas y la duración al jugarlas (v11.4), para el historial y para poder
  // repetir la partida: en Contrarreloj el reloj es parte de ella.
  if (!S.puzle && S.jugadas && S.tiempos) { S.jugadas.push(cells.slice()); S.tiempos.push(duracion); }
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
  contar(S.eventos, cells);
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
  // El tutorial juega en un trozo del tablero de 37: se encuadra en sus celdas (v11.2).
  if (enTutorial()) encuadrar(S, canvas.width, canvas.height, canvas.width / 9);
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
  setText('seed', `semilla ${codigoActual() || S.seed}`);
  const tutorial = enTutorial(), esPuzle = !!S.puzle && !tutorial;
  document.getElementById('partida').classList.toggle('es-puzle', esPuzle);
  document.getElementById('partida').classList.toggle('es-tutorial', tutorial);
  document.getElementById('partida').classList.remove('tut-acabado');
  document.getElementById('puzle-cab').hidden = !esPuzle;
  document.getElementById('puzle-pie').hidden = !esPuzle;
  document.getElementById('tut-cab').hidden = !tutorial;
  document.getElementById('tut-pie').hidden = !tutorial;
  if (tutorial) prepararNivelTutorial(); else document.getElementById('tut-recuadro').hidden = true;
  colocarFin(false);
  pintarBarra();
  pintarLeyenda();
  if (canvas) resize(); else redraw();   // cada modo coloca el panal a su altura
}

// La barra de la partida (v9): el modo y, si la tiene, la dificultad.
function pintarBarra() {
  // «‹ Menú» vuelve al inicio; en un nivel de Puzzle, «‹ Puzzle» vuelve a los capítulos.
  document.getElementById('partida-menu').lastChild.nodeValue = S.puzle ? NOMBRE_MODO.puzzle : 'Menú';
  const pill = document.getElementById('pz-intento');
  pill.hidden = !S.puzle || enTutorial();
  if (enTutorial()) return;   // el tutorial lleva su barra (#tut-cab)
  if (S.puzle) {
    const p = PUZLES.find(x => x.id === S.puzle.id);
    setHtml('barra-modo', `Capítulo ${p.capitulo} <span>· nivel ${p.orden}</span>`);
    pintarIntento();
    return;
  }
  const dif = tieneDificultad(S.modo) ? ` <span>· ${NOMBRE_DIF[S.dificultad]}</span>` : '';
  setHtml('barra-modo', NOMBRE_MODO[S.modo] + dif);
}


// «Intento N» en la barra de un nivel (v11.11, T-55). Al reiniciar sube y late una vez.
let intentoPintado = { id: null, n: 0 };
function pintarIntento() {
  const pill = document.getElementById('pz-intento');
  const id = S.puzle.id, n = numeroIntento(id);
  setHtml('pz-intento', `Intento <b>${n}</b>`);
  pill.setAttribute('aria-label', `Intento ${n}`);
  if (intentoPintado.id === id && n > intentoPintado.n && pill.animate)
    pill.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', borderColor: '#F28FB1' }, { transform: 'scale(1)' }],
      { duration: 420, easing: 'ease-out' });
  intentoPintado = { id, n };
}


// ===========================================================================
// Puzzle (v11, T-45; LC-DESIGN §23)
// ===========================================================================
// Los niveles salen de js/puzles.js (CAPITULOS, PUZLES); qué está abierto, el
// final y las estrellas los dice el motor (abiertosPuzzle, s.puzle.resultado).
// Aquí, las pantallas, deshacer (copias del estado en memoria) y la mejor marca de
// cada nivel, que se guarda aparte de la partida (guardado.js).
const PUZZLE_KEY = 'colmena.puzzle.v1';
let progresoPuzzle = progresoPuzzleVacio();
function leerProgresoGuardado() {
  try { progresoPuzzle = leerProgresoPuzzle(JSON.parse(localStorage.getItem(PUZZLE_KEY))); }
  catch { progresoPuzzle = progresoPuzzleVacio(); }
}
function guardarProgresoPuzzle() {
  try { localStorage.setItem(PUZZLE_KEY, JSON.stringify(progresoPuzzle)); } catch { /* queda en memoria */ }
}

const historiaPuzle = [];    // los estados de antes de cada turno, para deshacer
let puzleMejora = false;     // el último nivel ganado mejoró la marca
let capituloAbierto = null;  // el capítulo que acaba de abrir este nivel (v11.1)
// Lo que cambia un turno, copiado: los arrays y el puzle (su seguimiento es nuevo cada turno).
function copiaPuzle(s) {
  return { ...s, height: s.height.slice(), roto: s.roto.slice(), cerrada: s.cerrada.slice(),
           sedaHasta: s.sedaHasta.slice(), puzle: { ...s.puzle }, eventos: [] };
}

const nivelesEnOrden = () => PUZLES.slice().sort((a, b) => a.capitulo - b.capitulo || a.orden - b.orden);

// Empezar (o repetir) un nivel. Desde los capítulos, con fundido; reiniciar, sin.
// Con `{ guiada: true }`, la solución paso a paso (v11.10, T-54).
function jugarNivel(id, fundido = true, { guiada = false } = {}) {
  const p = PUZLES.find(x => x.id === id);
  if (!p) return;
  cerrarFichaNivel();
  cerrarIntento();
  intento.id = id;
  ayuda.pista = null; ayuda.texto = '';
  ayuda.esperados = guiada ? esperadosDe(p) : null;
  partida.modo = MODOS.PUZZLE;
  partida.dificultad = 'normal';
  guardarUltimoModo(MODOS.PUZZLE);
  historiaPuzle.length = 0;
  puzleMejora = false;
  capituloAbierto = null;
  if (!fundido) { prepararPartida(crearPuzle(p, { guiada }), 0); return; }
  mostrarPantalla('partida');
  prepararPartida(crearPuzle(p, { guiada }), 0);
  document.getElementById('partida').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
}

// ---------------------------------------------------------------------------
// Los intentos de cada nivel (v11.11, T-55, §5.102)
// ---------------------------------------------------------------------------
// Un intento va de empezar el nivel a reiniciarlo, salir o empezar otro. Cuenta si
// has jugado al menos una vez: ganado si acaba ganado; si no, fallido. Perder lo
// cuenta fallido en el acto (la pista lo necesita en el final); si deshaces y acabas
// ganando, pasa a ganado; perder otra vez en el mismo intento no suma. Deshacer no
// cuenta, ni entrar y salir sin jugar. El tutorial, tampoco.
const intento = { id: null, jugado: false, contado: null };   // contado: null, 'fallido' o 'ganado'
function contarJugada(r) {
  if (!intento.id) intento.id = S.puzle.id;   // una página que vuelve de la caché tras pagehide
  intento.jugado = true;
  if (!r || intento.contado === 'ganado') return;
  if (r.gana) {
    if (intento.contado === 'fallido') fallidoAGanado(progresoPuzzle, intento.id);
    else apuntarIntento(progresoPuzzle, intento.id, 'ganado');
    intento.contado = 'ganado';
  } else if (!intento.contado) {
    apuntarIntento(progresoPuzzle, intento.id, 'fallido');
    intento.contado = 'fallido';
  } else return;
  guardarProgresoPuzzle();
}
function cerrarIntento() {
  if (intento.id && intento.jugado && !intento.contado) {
    apuntarIntento(progresoPuzzle, intento.id, 'fallido');
    guardarProgresoPuzzle();
  }
  intento.id = null; intento.jugado = false; intento.contado = null;
}
// El número del intento que estás jugando: los contados, más éste si aún no lo está.
const numeroIntento = id => intentosDe(progresoPuzzle, id).total + (intento.id === id && intento.contado ? 0 : 1);

// ---------------------------------------------------------------------------
// La ayuda de Puzzle (v11.10, T-54, §5.98)
// ---------------------------------------------------------------------------
// Pista tras PUZZLE_PISTA_TRAS intentos fallidos en el nivel (derrotas hasta la v11.10): la siguiente jugada que gana
// desde donde estás, o hasta qué turno deshacer (pistaPuzle, js/pista.js). Tras
// PUZZLE_SOLUCION_TRAS, la solución guiada: la guía marca cada jugada de la solución
// guardada y la hace el jugador; el motor le pone el tope de estrellas. Las dos se
// dibujan con la guía del tutorial (ui.guia, el punto rosa).
const ayuda = { id: null, juego: null, pista: null, texto: '', textoEn: '', esperados: null };
// Lo que puede tardar la pista antes de dar la respuesta aproximada (§5.98 (c)).
const PISTA_MS = 4000;
const nivelActual = () => PUZLES.find(x => x.id === S.puzle.id);
const fallidosDe = id => intentosDe(progresoPuzzle, id).fallidos;
const claveEstado = () => S.turn + ':' + S.height.join();
// El panal esperado tras cada jugada de la solución, como en el tutorial.
function esperadosDe(n) {
  const e = crearPuzle(n), out = [{ h: e.height.join(), step: e.step }];
  for (const c of n.solucion) { commitTurn(e, c); out.push({ h: e.height.join(), step: e.step }); }
  return out;
}
function enLaSolucionGuiada() {
  const e = ayuda.esperados && ayuda.esperados[S.turn];
  return !!e && S.turn < nivelActual().solucion.length && e.h === S.height.join() && e.step === S.step;
}
function ponerAyuda(txt) { ayuda.texto = txt; ayuda.textoEn = claveEstado(); }

function guiaPuzzle() {
  if (!S || !S.puzle || enTutorial() || S.gameOver || drag.active || drag.cells.length) return null;
  let jugada = null;
  if (S.puzle.guiada) { if (enLaSolucionGuiada()) jugada = nivelActual().solucion[S.turn]; }
  else if (ayuda.pista && ayuda.pista.en === claveEstado()) jugada = ayuda.pista.jugada;
  return jugada ? { celdas: jugada, recorrido: recorridoGuia(jugada), salida: false } : null;
}

// «Pista»: desde la caja de perdido, primero se deshace la jugada que perdió. Se
// pinta «Buscando…» antes de buscar, por si tarda (en el móvil, raro que pase de 1 s).
function pedirPista() {
  if (!S.puzle || enTutorial() || S.puzle.guiada) return;
  if (S.gameOver) deshacerPuzle();
  ayuda.pista = null;
  ponerAyuda('Buscando…');
  redraw();
  setTimeout(() => {
    if (!S.puzle) return;
    if (ayuda.juego === null || ayuda.id !== S.puzle.id) {
      ayuda.id = S.puzle.id;
      ayuda.juego = crearJuego(motorDelJuego()).juegoDeNivel(nivelActual());
    }
    const camino = [...historiaPuzle, S].map(estadoBuscador);
    const r = pistaPuzle({ nivel: nivelActual(), juego: ayuda.juego, buscar: buscarPrimera, camino, limite: S.puzle.limite, maxMs: PISTA_MS });
    if (r.tipo === 'jugada') {
      ayuda.pista = { en: claveEstado(), jugada: r.jugada };
      ponerAyuda('Pista: arrastra por las celdas del punto rosa.');
    } else if (r.aproximada) ponerAyuda(`Te saliste de la solución en el turno ${r.turno}: deshaz hasta ahí.`);
    else ponerAyuda(r.turno === 0 ? 'Desde aquí ya no se gana: reinicia el nivel.' : `Desde aquí ya no se gana: deshaz hasta el turno ${r.turno}.`);
    redraw();
  }, 40);
}

function deshacerPuzle() {
  if (!S.puzle || !historiaPuzle.length) return;
  S = historiaPuzle.pop();
  finPintado = false;
  capituloAbierto = null;
  tut.aviso = ''; clearTimeout(tut.alFinal);
  document.getElementById('fin').hidden = true;
  drag.cells = []; drag.desde = []; drag.trail = []; drag.deshaciendo = false; drag.fuera = false;
  abejas.length = 0; destellos.length = 0;
  redraw();
}

// El siguiente: el próximo abierto después de éste; si no hay, el primero abierto
// sin resolver; si tampoco, ninguno (están todos).
function siguienteNivel(id) {
  const ab = abiertosPuzzle(CAPITULOS, PUZLES, progresoPuzzle.mejores);
  const orden = nivelesEnOrden();
  const k = orden.findIndex(p => p.id === id);
  const despues = orden.slice(k + 1).find(p => ab.niveles[p.id] !== 'cerrado');
  return despues ? despues.id : ab.siguiente;
}

function irACapitulos() {
  cerrarHoja();
  cerrarIntento();
  intentoPintado = { id: null, n: 0 };   // al volver a entrar, sin latido
  mostrarPantalla('puzles');
  const el = document.getElementById('puzles');
  if (el.animate) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  // Que se vea el siguiente sin tener que buscarlo.
  const sig = el.querySelector('.pz-nivel.siguiente');
  if (sig) sig.scrollIntoView({ block: 'center' });
}

// La pantalla de capítulos (opción A del 01-10): todos los capítulos en una pantalla
// que se desliza; cada nivel, un hexágono con su número y sus estrellas.
const ESTRELLAS = (n, total = 3) => '★'.repeat(n) + '☆'.repeat(total - n);
function pintarCapitulos() {
  const ab = abiertosPuzzle(CAPITULOS, PUZLES, progresoPuzzle.mejores);
  const total = Object.values(ab.capitulos).reduce((n, c) => n + c.estrellas, 0);
  setHtml('pz-total', `★ <b>${total}</b> / ${PUZLES.length * 3}`);
  const caja = document.getElementById('pz-capitulos');
  if (!PUZLES.length) { caja.innerHTML = '<div class="pz-cap"><p>Todavía no hay niveles.</p></div>'; return; }
  // Sin nombrar lo que el jugador aún no conoce (v11.1, T-48): cerrado, sólo que
  // trae objetivos nuevos y cuánto falta; abierto, una línea por tipo nuevo, con
  // la frase `explica` de OBJETIVO_INFO (la interfaz no inventa reglas).
  const primero = Math.min(...CAPITULOS.map(c => c.n));
  let html = '', anterior = null;
  for (const c of CAPITULOS.slice().sort((a, b) => a.n - b.n)) {
    const info = ab.capitulos[c.n];
    if (!info.abierto) {
      html += `<div class="pz-cap cerrado"><h3>Capítulo ${c.n} <b>🔒</b></h3>` +
        (c.nuevos.length ? '<p>Objetivos nuevos.</p>' : '') +
        `<p>Para abrirlo: ${anterior.info.necesita} niveles del capítulo ${anterior.n} · llevas ${anterior.info.resueltos}</p></div>`;
    } else {
      // En el primer capítulo todo es nuevo: las líneas van sin la marca.
      const lineas = c.n === 0 ? '<p>Tutorial</p>'
        : c.nuevos.map(t => `<p>${c.n === primero ? '' : '<b class="nuevo">Nuevo</b> · '}${OBJETIVO_INFO[t].explica}</p>`).join('');
      html += `<div class="pz-cap"><h3>Capítulo ${c.n} <b>★ ${info.estrellas} / ${info.total * 3}</b></h3>` +
        lineas + '<div class="pz-niveles">';
      for (const p of PUZLES.filter(x => x.capitulo === c.n).sort((a, b) => a.orden - b.orden)) {
        const est = ab.niveles[p.id], m = progresoPuzzle.mejores[p.id], sig = p.id === ab.siguiente;
        const fill = est === 'resuelto' ? '#C8A14A' : est === 'abierto' ? '#1c1710' : '#171410';
        const borde = sig ? 'stroke="#F28FB1" stroke-width="3"' : est === 'abierto' ? 'stroke="#43372a" stroke-width="2"' : '';
        const txt = est === 'resuelto' ? 'rgba(30,20,5,.8)' : sig ? '#F28FB1' : est === 'abierto' ? '#9a8d77' : '#3d342a';
        // Resuelto con la solución guiada (v11.10, T-54): sus estrellas, en rosa.
        const debajo = est === 'resuelto' ? (m.guiada ? `<span class="e"><span class="guiada">${'★'.repeat(m.estrellas)}</span>${'☆'.repeat(3 - m.estrellas)}</span>` : `<span class="e">${ESTRELLAS(m.estrellas)}</span>`)
          : sig ? '<span class="e sig">siguiente</span>' : est === 'abierto' ? '<span class="e vacia">☆☆☆</span>' : '<span class="e vacia">🔒</span>';
        const etiqueta = `Nivel ${p.orden}, ${est === 'resuelto' ? `resuelto, ${m.estrellas} de 3 estrellas${m.guiada ? ', con la solución' : ''}` : est === 'abierto' ? 'abierto' : 'cerrado'}`;
        html += `<button class="pz-nivel${sig ? ' siguiente' : ''}" data-id="${p.id}" aria-label="${etiqueta}"${est === 'cerrado' ? ' disabled' : ''}>` +
          `<svg width="54" height="50" viewBox="0 0 46 42" aria-hidden="true"><polygon points="23,2 44,12 44,30 23,40 2,30 2,12" fill="${fill}" ${borde}/>` +
          `<text x="23" y="27" text-anchor="middle" font-size="15" font-weight="700" fill="${txt}">${p.orden}</text></svg>${debajo}</button>`;
      }
      html += '</div></div>';
    }
    anterior = { n: c.n, info };
  }
  caja.innerHTML = html;
}

// La ficha de un nivel (v11.11, T-55): tocar un nivel en el mapa ya no entra, abre
// esto desde abajo. Cómo lo llevas (resuelto o no), el objetivo, el intento por el
// que vas, cuánto falta para la pista y «Jugar». Se cierra tocando fuera,
// deslizándola hacia abajo o con Escape, y te quedas en el mapa.
let fichaNivel = null, fichaOrigen = null, fichaCierre = 0;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
function abrirFichaNivel(id, origen) {
  const p = PUZLES.find(x => x.id === id);
  if (!p) return;
  clearTimeout(fichaCierre);
  fichaNivel = id; fichaOrigen = origen || null;
  const m = progresoPuzzle.mejores[id], it = intentosDe(progresoPuzzle, id);
  const e = crearPuzle(p), sig = id === abiertosPuzzle(CAPITULOS, PUZLES, progresoPuzzle.mejores).siguiente;
  // El hexágono, como en el mapa.
  const fill = m ? '#C8A14A' : '#1c1710', txt = m ? 'rgba(30,20,5,.8)' : sig ? '#F28FB1' : '#9a8d77';
  const borde = m ? '' : sig ? 'stroke="#F28FB1" stroke-width="3"' : 'stroke="#43372a" stroke-width="2"';
  setHtml('pz-ficha-hex', `<svg width="54" height="50" viewBox="0 0 46 42" aria-hidden="true"><polygon points="23,2 44,12 44,30 23,40 2,30 2,12" fill="${fill}" ${borde}/>` +
    `<text x="23" y="27" text-anchor="middle" font-size="15" font-weight="700" fill="${txt}">${p.orden}</text></svg>`);
  setText('pz-ficha-donde', `Capítulo ${p.capitulo} · Nivel ${p.orden}`);
  setHtml('pz-ficha-titulo', m ? `<span class="${m.guiada ? 'guiada' : 'oro'}">${'★'.repeat(m.estrellas)}</span><span class="vacia">${'☆'.repeat(3 - m.estrellas)}</span>`
    : 'Sin resolver');
  setText('pz-ficha-obj', objetivoPuzle(e).frase + '.');
  const filas = [];
  if (m) filas.push(['Tu mejor marca', plural(m.turnos, 'turno', 'turnos') + (m.guiada ? ' · con la solución' : '')]);
  const cuenta = it.total ? [it.ganados && plural(it.ganados, 'ganado', 'ganados'), it.fallidos && plural(it.fallidos, 'fallido', 'fallidos')].filter(Boolean).join(' · ')
    : 'el primero';
  filas.push(['Intento', `<span class="int">${it.total + 1}.º</span> <i>· ${cuenta}</i>`]);
  if (!m && it.fallidos) {
    const f = it.fallidos;
    filas.push(['Ayuda', `<span class="rosa">${f >= PUZZLE_SOLUCION_TRAS ? 'pista y solución, disponibles'
      : f >= PUZZLE_PISTA_TRAS ? `pista disponible · solución en ${PUZZLE_SOLUCION_TRAS - f}`
      : `pista a los ${PUZZLE_PISTA_TRAS} fallidos · te ${PUZZLE_PISTA_TRAS - f === 1 ? 'falta 1' : `faltan ${PUZZLE_PISTA_TRAS - f}`}`}</span>`]);
  }
  filas.push(['<span class="estrellas">★★★</span>', `en ${plural(p.minimo, 'turno', 'turnos')} · límite ${e.puzle.limite}`]);
  setHtml('pz-ficha-filas', filas.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join(''));
  setText('pz-ficha-jugar', m ? 'Jugar otra vez' : 'Jugar');
  const f = document.getElementById('pz-ficha'), velo = document.getElementById('pz-ficha-fondo');
  f.style.transform = '';
  f.hidden = false; velo.hidden = false;
  f.getBoundingClientRect();              // fuerza el estilo de partida para que haya transición
  f.classList.add('abierta'); velo.classList.add('abierta');
  document.getElementById('pz-ficha-jugar').focus({ preventScroll: true });
}
function cerrarFichaNivel() {
  if (!fichaNivel) return;
  fichaNivel = null;
  const f = document.getElementById('pz-ficha'), velo = document.getElementById('pz-ficha-fondo');
  f.classList.remove('abierta', 'arrastrando'); velo.classList.remove('abierta');
  f.style.transform = '';
  fichaCierre = setTimeout(() => { f.hidden = true; velo.hidden = true; }, 250);
  if (fichaOrigen && document.contains(fichaOrigen) && fichaOrigen.offsetParent) fichaOrigen.focus({ preventScroll: true });
  fichaOrigen = null;
}
// Arrastrar hacia abajo la cierra, como la hoja (gestosHoja), sin el gesto lateral.
function gestosFichaNivel(f) {
  let g = null;
  f.addEventListener('pointerdown', e => {
    if (!fichaNivel || (e.pointerType === 'mouse' && e.button !== 0)) return;
    g = { y: e.clientY, x: e.clientX, t: performance.now(), activo: false, id: e.pointerId };
  });
  f.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    const dy = e.clientY - g.y;
    if (!g.activo) {
      if (Math.hypot(e.clientX - g.x, dy) < 10) return;
      if (dy <= 0 || Math.abs(e.clientX - g.x) > dy) { g = null; return; }
      g.activo = true; f.classList.add('arrastrando'); f.setPointerCapture(g.id);
    }
    f.style.transform = `translateY(${Math.max(0, dy)}px)`;
  });
  const soltar = e => {
    if (!g || e.pointerId !== g.id) return;
    const dy = e.clientY - g.y, v = dy / Math.max(1, performance.now() - g.t);
    if (g.activo) {
      f.classList.remove('arrastrando');
      if (e.type !== 'pointercancel' && (dy > 80 || v > 0.6)) cerrarFichaNivel();
      else f.style.transform = '';
    }
    g = null;
  };
  f.addEventListener('pointerup', soltar);
  f.addEventListener('pointercancel', soltar);
}

// El marcador de un nivel: el objetivo, sus marcas, turno / límite, paso, el
// progreso y «☆☆☆ en N». Todo lo dice el motor (objetivoPuzle, progresoPuzle).
function pintarHudPuzle() {
  const o = objetivoPuzle(S), g = progresoPuzle(S), p = S.puzle;
  setText('pz-frase', o.frase + '.');
  const ley = [];
  if (o.marcadas.length && o.tipo !== 'orden') ley.push(`<span><i style="border:2.4px dashed #ffd23f"></i>${o.tipo === 'panal' ? `marcada · déjala en ${NOMBRE_NIVEL[o.nivel]}` : 'marcada'}</span>`);
  if (o.tipo === 'orden') ley.push('<span><i style="border:2.4px dashed #ffd23f"></i>A y B</span>');
  if (o.rojas.length) ley.push('<span><i style="border:2.4px solid #e5484d"></i>roja: no se cosecha</span>');
  setHtml('pz-leyenda', ley.join(''));
  setText('pz-turno', S.turn);
  setText('pz-limite', `/ ${p.limite}`);
  document.getElementById('pz-turno').className = 'big' + (!S.gameOver && p.limite - S.turn === 1 ? ' cuidado' : '');
  setText('pz-paso', S.step);
  setText('pz-prog-lbl', g.etiqueta);
  setText('pz-prog', g.valor);
  setText('pz-prog-de', `/ ${g.de}${'marcada' in g ? (g.marcada ? ' ✓' : '') : ''}`);
  const m = progresoPuzzle.mejores[p.id];
  setHtml('pz-min', `<span class="${m && m.guiada ? 'pz-min-guiada' : ''}">${ESTRELLAS(m ? m.estrellas : 0)}</span> <small>en ${p.minimo}</small>`);
  // Lo que pide la jugada, como en el editor; en el último turno, se avisa.
  const aviso = document.getElementById('pz-aviso');
  const c = drag.cells;
  let txt = '';
  if (!S.gameOver) {
    if (!c.length) txt = S.step === 1 ? 'Arrastra 1 celda.' : `Arrastra ${S.step} celdas juntas al mismo nivel.`;
    else if (c.length < S.step) txt = `Llevas ${c.length} de ${S.step}.`;
    else if (dragReady(S)) { const h = nivelCadena(S, c); txt = h === MAX_LEVEL ? `Suelta: cosechas ${c.length}.` : `Suelta: suben a ${NOMBRE_NIVEL[h + 1]}.`; }
    if (p.limite - S.turn === 1) txt = 'Último turno. ' + txt;
  }
  // La ayuda (v11.10, T-54) manda sobre lo de la jugada mientras no arrastras.
  let ayudaTxt = '';
  const derrotas = fallidosDe(p.id), conAyuda = !enTutorial() && !p.guiada;
  if (!S.gameOver && !c.length && !enTutorial()) {
    if (p.guiada) ayudaTxt = enLaSolucionGuiada() ? 'Solución: arrastra por las celdas del punto rosa.' : 'Deshaz para volver a la solución.';
    else if (ayuda.texto && ayuda.textoEn === claveEstado()) ayudaTxt = ayuda.texto;
    else if (S.turn === 0 && derrotas === PUZZLE_SOLUCION_TRAS) ayudaTxt = 'Ya puedes ver la solución paso a paso.';
    else if (S.turn === 0 && derrotas === PUZZLE_PISTA_TRAS) ayudaTxt = '¿Atascado? Ya tienes una pista.';
  }
  if (ayudaTxt) txt = ayudaTxt;
  aviso.classList.toggle('ayuda', !!ayudaTxt);
  if (aviso.textContent !== txt) aviso.textContent = txt;
  mostrar('pz-pista', conAyuda && derrotas >= PUZZLE_PISTA_TRAS);
  mostrar('pz-solucion', conAyuda && derrotas >= PUZZLE_SOLUCION_TRAS && !S.gameOver);
  document.getElementById('pz-deshacer').disabled = !historiaPuzle.length;
}

// El final de un nivel: ganado, con estrellas y el mínimo; perdido, con el porqué.
function pintarFinPuzle() {
  const r = S.puzle.resultado, p = S.puzle;
  const sc = document.getElementById('fin-score');
  const rec = document.getElementById('fin-record');
  const det = document.getElementById('fin-detalle');
  det.innerHTML = '';
  if (r.gana) {
    setText('fin-titulo', '¡Resuelto!');
    sc.innerHTML = `<span class="estrellas${r.guiada ? ' guiada' : ''}">${'★'.repeat(r.estrellas)}<span class="vacia">${'★'.repeat(3 - r.estrellas)}</span></span>`;
    const m = progresoPuzzle.mejores[p.id];
    rec.textContent = r.guiada ? `Con la solución. Sin ayuda se puede en ${p.minimo}: ¿lo intentas?` +
        (puzleMejora ? '' : ` · Tu mejor marca: ${ESTRELLAS(m.estrellas)}`)
      : `En ${r.turnos} ${r.turnos === 1 ? 'turno' : 'turnos'}. ` +
      (r.estrellas === 3 ? 'En el mínimo.' : `Se puede en ${p.minimo}: ¿lo intentas?`) +
      (puzleMejora ? '' : ` · Tu mejor marca: ${ESTRELLAS(m.estrellas)}`);
    rec.className = 'record' + (puzleMejora ? ' nuevo' : '');
    if (capituloAbierto !== null) {
      const d = document.createElement('div');
      d.className = 'pz-abierto';
      d.innerHTML = `<b>¡Capítulo ${capituloAbierto} abierto!</b> Trae objetivos nuevos.`;
      det.appendChild(d);
    }
    setText('fin-menu', '↻ Repetir');
    const sig = siguienteNivel(p.id);
    setText('fin-otra', sig ? 'Siguiente ›' : 'Capítulos');
  } else {
    const titulo = {
      fallo: `Sin sitio para el paso ${r.paso}`, roja: 'Has cosechado una roja',
      orden: 'La B antes que la A', limite: `Se acabaron los ${p.limite} turnos`,
    }[r.motivo];
    const porque = {
      fallo: `Tu máx era ${r.meseta} y el paso pedía ${r.paso}.`,
      roja: 'Las rojas se pueden subir, pero no cosechar.',
      orden: 'Hay que cosechar la A primero, y no a la vez que la B.',
      limite: `Se puede en ${p.minimo}: prueba otro camino.`,
    }[r.motivo];
    setText('fin-titulo', titulo);
    sc.textContent = '';
    rec.textContent = porque;
    rec.className = 'record';
    setText('fin-menu', '↻ Reintentar');
    setText('fin-otra', '↶ Deshacer');
    // La pista también desde aquí (v11.10, T-54): deshace la jugada que perdió.
    const fallidos = fallidosDe(p.id), puede = !p.guiada && fallidos >= PUZZLE_PISTA_TRAS;
    mostrar('fin-atascado', puede);
    mostrar('fin-ayuda', puede);
    if (puede) setText('fin-atascado', `Llevas ${fallidos} intentos fallidos: ¿quieres una pista?`);
  }
}

// ===========================================================================
// El tutorial, «Aprende a jugar» (v11.2, T-49; LC-DESIGN §23)
// ===========================================================================
// Ocho niveles de js/tutorial.js que por dentro son niveles de Puzzle (crearPuzle,
// las reglas de siempre, deshacer) y por fuera no: sin límite ni estrellas, con su
// barra, su tarjeta de guía, la guía en el panal y los avisos al arrastrar. Antes
// del 1, la escalera de niveles; después del 8, «Has terminado» e «Ir al inicio».
// Se guarda el último nivel resuelto (colmena.tutorial.v1): quien sale a medias
// retoma en el primero sin resolver y sigue siendo nuevo; al acabar deja de serlo.
const TUTORIAL_KEY = 'colmena.tutorial.v1';
// k: el nivel que se juega (0-7). cancelado: el nivel 3 ya ha cancelado una vez.
// aviso: lo que dice la línea de aviso hasta el próximo arrastre. pistaEn: el turno
// en que se pidió la pista. esperados: el panal tras cada jugada de la solución,
// para saber si el jugador se ha salido de ella.
const tut = { k: 0, cancelado: false, aviso: '', avisoClase: '', pistaEn: -1, esperados: [], alFinal: 0 };

const nivelTutorial = (id = S && S.puzle && S.puzle.id) => TUTORIAL.find(t => t.id === id) || null;
const enTutorial = () => !!(S && S.puzle && nivelTutorial());

function leerTutorial() {
  try { return leerProgresoTutorial(JSON.parse(localStorage.getItem(TUTORIAL_KEY)), TUTORIAL.length); }
  catch { return 0; }
}
function guardarTutorial(resuelto) {
  try {
    if (resuelto <= leerTutorial()) return;
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ v: PROGRESO_TUTORIAL_VERSION, resuelto }));
  } catch { /* da igual: se empezaría por el 1 */ }
}
const tutorialAcabado = () => leerTutorial() >= TUTORIAL.length;

// Las marcas de los textos (regla 8): {2} → «huevo (2)», {5s} → «abejas (5)», y
// {paso} y {max}, del evento del fallo.
function textoTut(t, extra = {}) {
  return t.replace(/\{(\d)(s?)\}/g, (_, n, pl) => `${NOMBRE_NIVEL[n]}${pl ? 's' : ''} (${n})`)
          .replace(/\{(paso|max)\}/g, (_, k) => extra[k]);
}

// Desde el inicio («Aprende a jugar») retoma en el primero sin resolver; la primera
// vez, y siempre que se repite, empieza por la escalera.
function empezarTutorial(repetir) {
  const resuelto = leerTutorial();
  cerrarHoja();
  if (!repetir && resuelto > 0 && resuelto < TUTORIAL.length) { jugarTutorial(resuelto); return; }
  pintarProgresoTut(-1);
  mostrarPantalla('escalera');
  const el = document.getElementById('tut-escalera');
  el.scrollTop = 0;
  if (el.animate) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
}

function jugarTutorial(k, fundido = true) {
  const n = TUTORIAL[k];
  if (!n) return;
  tut.k = k; tut.cancelado = false; tut.aviso = ''; tut.pistaEn = -1;
  clearTimeout(tut.alFinal);
  // El panal esperado tras cada jugada de la solución (para «Deshaz para volver a la pista»).
  const e = crearPuzle(n);
  tut.esperados = [{ h: e.height.join(), step: e.step }];
  for (const c of n.solucion) { commitTurn(e, c); tut.esperados.push({ h: e.height.join(), step: e.step }); }
  partida.modo = MODOS.PUZZLE;
  partida.dificultad = 'normal';
  historiaPuzle.length = 0;
  if (pantalla !== 'partida') mostrarPantalla('partida');
  prepararPartida(crearPuzle(n), 0);
  if (fundido) document.getElementById('partida').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
}

// Lo de cada nivel que no cambia al jugar: título, recuadro, pista, progreso.
function prepararNivelTutorial() {
  const n = nivelTutorial();
  setText('tut-titulo', `${n.orden} · ${n.titulo}`);
  const rec = document.getElementById('tut-recuadro');
  rec.hidden = !n.recuadro;
  rec.innerHTML = n.recuadro ? textoTut(n.recuadro) : '';
  document.getElementById('tut-pista').hidden = n.guia !== 'pista';
  pintarProgresoTut(tut.k);
}

// Los ocho hexágonos de progreso: rosa los hechos, miel el actual.
function pintarProgresoTut(k) {
  const html = TUTORIAL.map((_, j) => `<span class="${j < k ? 'hecho' : j === k ? 'actual' : ''}"></span>`).join('');
  document.querySelectorAll('[data-tut-prog]').forEach(el => {
    el.innerHTML = html;
    el.setAttribute('aria-label', k < 0 ? `${TUTORIAL.length} niveles` : k >= TUTORIAL.length ? 'Tutorial terminado' : `Nivel ${k + 1} de ${TUTORIAL.length}`);
  });
}

// ¿Sigue el jugador la solución guardada? Se compara el panal (y el paso) con el
// que deja la solución tras los mismos turnos, así da igual el orden del arrastre.
function enLaSolucion() {
  const e = tut.esperados[S.turn];
  return !!e && e.h === S.height.join() && e.step === S.step;
}

// El camino del dedo por las celdas de una jugada: empieza en la primera y va a cada
// siguiente por el camino más corto entre las ya elegidas (pasar otra vez por una
// celda es tránsito, como en el nivel 6). Es geometría, no una regla.
function recorridoGuia(cells) {
  const tr = [cells[0]], dentro = new Set([cells[0]]);
  for (const c of cells.slice(1)) {
    const desde = tr[tr.length - 1], vale = new Set([...dentro, c]);
    const prev = new Map([[desde, null]]), cola = [desde];
    while (cola.length) {
      const u = cola.shift();
      if (u === c) break;
      for (const v of vecinas(S, u)) if (vale.has(v) && !prev.has(v)) { prev.set(v, u); cola.push(v); }
    }
    const camino = [];
    for (let u = c; u !== desde && u !== undefined && u !== null; u = prev.get(u)) camino.unshift(u);
    tr.push(...camino);
    dentro.add(c);
  }
  return tr;
}

// La guía (Iñigo: «frase y resaltar»): sale cuando no estás arrastrando, sigue la
// solución guardada (la interfaz no busca jugadas, regla 8) y desaparece si te sales
// de ella. En los niveles con `guia: 'pista'`, sólo tras pulsar Pista, y sólo para
// la jugada de ese turno.
function guiaTutorial() {
  if (!enTutorial() || S.gameOver || drag.active || drag.cells.length || !enLaSolucion()) return null;
  const n = nivelTutorial();
  if (n.guia === 'pista' && tut.pistaEn !== S.turn) return null;
  const jugada = n.solucion[S.turn];
  if (!jugada) return null;
  // Nivel 3, antes de cancelar: el dedo empieza la jugada y se sale del panal.
  if (n.cancelar && !tut.cancelado) return { celdas: jugada.slice(0, 2), recorrido: jugada.slice(0, 2), salida: true };
  return { celdas: jugada, recorrido: recorridoGuia(jugada), salida: false };
}

// El fallo explicado en el panal (v11.2): al acabar un nivel por fallo, en el
// tutorial y en todo Puzzle, y al ganar el nivel 7 del tutorial (`explicaMax`), que
// deja el paso siguiente sin sitio. Los números, del evento del fallo; el grupo, del
// motor (grupoMeseta).
function explicacionFallo() {
  if (!S.gameOver || !S.puzle || !S.puzle.resultado) return null;
  const r = S.puzle.resultado;
  if (!r.gana && r.motivo === 'fallo') return { grupo: grupoMeseta(S), etiqueta: `máx ${r.meseta} · paso ${r.paso}` };
  const n = nivelTutorial();
  if (r.gana && n && n.explicaMax && S.last.type === 'fallback')
    return { grupo: grupoMeseta(S), etiqueta: `máx ${S.last.meseta} · paso ${S.last.paso}` };
  return null;
}

// Lo que pasa al soltar, se juegue o no (initInput → alSoltar). Sólo en el tutorial.
function alSoltarTutorial({ cells, cancelada, valida }) {
  if (!enTutorial() || S.gameOver || !cells.length) return;
  const n = nivelTutorial();
  if (cancelada) {
    if (n.cancelar && !tut.cancelado) { tut.cancelado = true; tut.aviso = '¡Eso! No ha contado.'; tut.avisoClase = 'bien'; }
    else { tut.aviso = 'Lo soltaste fuera del panal: no ha contado.'; tut.avisoClase = ''; }
  } else if (n.cancelar && !tut.cancelado) {
    tut.aviso = 'Primero prueba a sacarlo fuera.'; tut.avisoClase = 'mal';
  } else if (!valida && cells.length < S.step) {
    tut.aviso = `El paso pide ${S.step} y soltaste con ${cells.length}. Prueba otra vez.`; tut.avisoClase = 'mal';
  }
}

// El marcador del tutorial: la tarjeta, paso y máx, el objetivo y la línea de aviso.
function pintarHudTutorial() {
  const n = nivelTutorial();
  const consejo = Array.isArray(n.consejo) ? n.consejo[tut.cancelado ? 1 : 0] : n.consejo;
  setHtml('tut-consejo', textoTut(consejo));
  const o = objetivoPuzle(S), g = progresoPuzle(S);
  setText('tut-frase', o.frase + '.');
  setText('tut-progreso', `${g.etiqueta} ${g.valor} / ${g.de}`);
  // Paso y máx con los colores de la v8. Con el fallo explicado, paso enseña el paso
  // que no cupo (no el 1 al que vuelve el motor) y máx va en rojo, los dos marcados.
  const ex = explicacionFallo(), biggest = biggestCoherentArea(S);
  const paso = ex ? S.last.paso : S.step, max = ex ? S.last.meseta : biggest;
  setText('tut-paso', paso);
  setText('tut-max', max);
  const pasoB = document.getElementById('tut-paso'), maxB = document.getElementById('tut-max');
  pasoB.className = ex ? 'fallo' : '';
  maxB.className = ex ? 'fallo' : !S.gameOver && biggest === S.step ? 'cuidado' : '';
  const late = !S.gameOver && n.late;
  document.getElementById('tut-paso-caja').className = 'tut-n' + (ex ? ' marca' : late === 'paso' ? ' late' : '');
  document.getElementById('tut-max-caja').className = 'tut-n' + (ex ? ' marca' : late === 'max' ? ' late' : '');
  // Los avisos al arrastrar (sólo aquí: en el juego normal serían ruido). El motivo de
  // un rechazo lo da pasoDeCadena (drag.rechazo), no una copia de su lógica.
  const c = drag.cells;
  let txt = '', cls = '';
  if (S.gameOver) txt = '';
  else if (c.length) {
    tut.aviso = '';
    if (drag.fuera) txt = 'Fuera del panal: si sueltas, no cuenta.';
    else if (drag.rechazo && drag.rechazo.motivo === 'nivel') { const h = S.height[drag.rechazo.tile]; txt = `Ésa es de otro nivel (${h}): no se mezclan.`; cls = 'mal'; }
    else if (drag.rechazo && drag.rechazo.motivo === 'lleno') { txt = `Ya llevas ${c.length}: el paso no deja coger más.`; cls = 'mal'; }
    else if (c.length < S.step) txt = `Llevas ${c.length} de ${S.step}.`;
    else if (dragReady(S)) { const h = nivelCadena(S, c); txt = h === MAX_LEVEL ? `Suelta: cosechas ${c.length}.` : `Suelta: suben a ${NOMBRE_NIVEL[h + 1]} (${h + 1}).`; cls = 'bien'; }
  } else if (tut.aviso) { txt = tut.aviso; cls = tut.avisoClase; }
  else if (!enLaSolucion()) txt = 'Deshaz para volver a la pista.';
  else if (n.guia === 'pista' && tut.pistaEn !== S.turn) txt = '¿Atascado? Pulsa Pista.';
  setText('tut-aviso', txt);
  document.getElementById('tut-aviso').className = 'tut-aviso' + (cls ? ' ' + cls : '');
  document.getElementById('partida').classList.toggle('tut-acabado', S.gameOver);
  document.getElementById('tut-deshacer').disabled = !historiaPuzle.length;
  document.getElementById('tut-pista').disabled = !enLaSolucion() || tut.pistaEn === S.turn;
}

// El final de un nivel: «¡Bien!» con lo aprendido, o «Fallo» con el porqué. El 8 no
// tiene «¡Bien!»: va directo a «Has terminado».
function pintarFinTutorial() {
  const el = document.getElementById('fin'), r = S.puzle.resultado, n = nivelTutorial();
  setText('fin-score', '');
  document.getElementById('fin-detalle').innerHTML = '';
  mostrar('tut-pie', false);
  if (r.gana && tut.k === TUTORIAL.length - 1) {
    el.hidden = true;
    clearTimeout(tut.alFinal);
    tut.alFinal = setTimeout(acabarTutorial, 900);
    return;
  }
  el.classList.add(r.gana ? 'tut-bien' : 'tut-fallo');
  const rec = document.getElementById('fin-record');
  rec.className = 'record';
  if (r.gana) {
    setText('fin-titulo', '¡Bien!');
    rec.innerHTML = textoTut(n.aprendido, { paso: S.last.paso, max: S.last.meseta });
    setText('fin-menu', 'Otra vez');
    setText('fin-otra', 'Siguiente ›');
  } else {
    setText('fin-titulo', 'Fallo');
    const extra = n.falloExtra || 'En una partida, fallar devuelve el paso a 1 y se sigue. Aquí, deshaz y prueba otro camino.';
    rec.innerHTML = `El paso pedía <b>${r.paso}</b> y tu grupo más grande (en rojo) era de <b>${r.meseta}</b>.` +
      `<span class="extra">${textoTut(extra)}</span>`;
    setText('fin-menu', '↻ Reiniciar');
    setText('fin-otra', '↶ Deshacer');
  }
  el.hidden = false;
}

// Después del 8: deja de ser nuevo y «Has terminado el tutorial».
function acabarTutorial() {
  if (!enTutorial() || !S.gameOver) return;
  guardarTutorial(TUTORIAL.length);
  marcarYaJugado();
  pintarProgresoTut(TUTORIAL.length);
  mostrarPantalla('tut-final');
  const el = document.getElementById('tut-final');
  if (el.animate) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
}

// La tira de los seis niveles (tutorial y ficha Básico) y la escalera, desde
// NOMBRE_NIVEL, LINEA_NIVEL y LEVEL_COLORS.
function hexNivel(h) {
  return `<span class="hexn" style="background:${LEVEL_COLORS[h]};color:${h >= LARVA ? '#2a1d06' : '#f6ecd8'}">${h}</span>`;
}
function pintarEscaleras() {
  const tira = Array.from({ length: MAX_LEVEL + 1 }, (_, h) =>
    `<div${h === MAX_LEVEL ? ' class="abeja"' : ''}>${hexNivel(h)}<small>${NOMBRE_NIVEL[h]}</small></div>`).join('');
  document.querySelectorAll('[data-tira]').forEach(el => { el.innerHTML = tira; });
  const may = t => t.charAt(0).toUpperCase() + t.slice(1);
  document.getElementById('esc-lista').innerHTML = Array.from({ length: MAX_LEVEL + 1 }, (_, k) => MAX_LEVEL - k).map(h =>
    `<div class="esc-fila${h === MAX_LEVEL ? ' abeja' : ''}">${hexNivel(h)}<span class="txt"><b>${may(NOMBRE_NIVEL[h])}</b><span>${LINEA_NIVEL[h]}</span></span></div>`).join('');
  setText('tutorial-cuantos', `${TUTORIAL.length} niveles cortos`);
}

// ===========================================================================
// Pantallas (v9, T-40)
// ===========================================================================
// Al abrir se ve el inicio; de él cuelgan los modos. La ficha de cada modo no
// es otra pantalla: es la hoja abierta sobre el inicio. Al recargar se vuelve
// siempre al inicio; la partida a medias, con «Continuar» (v9.1).
let pantalla = 'inicio';     // 'inicio' | 'partida' | 'puzles' (los capítulos de Puzzle, v11) | 'historial' (v11.4) | …
let hojaAbierta = null;      // null | { desde: 'ficha' | 'partida', modo, pestana }

// T-30 (compartir por enlace) entrará directo aquí con mostrarPantalla('partida').
// `bajado`: el inicio con los modos a la vista (al volver de Tus partidas, v11.4).
function mostrarPantalla(p, { bajado = false } = {}) {
  pantalla = p;
  document.getElementById('inicio').hidden = p !== 'inicio';
  document.getElementById('historial').hidden = p !== 'historial';
  document.getElementById('partida').hidden = p !== 'partida';
  document.getElementById('puzles').hidden = p !== 'puzles';
  document.getElementById('tut-escalera').hidden = p !== 'escalera';
  document.getElementById('tut-final').hidden = p !== 'tut-final';
  cerrarPop();
  // Las dos pantallas dibujan con el mismo `layout` de render.js: al cambiar,
  // cada una se vuelve a medir. Como sólo se ve una, no chocan.
  if (p === 'partida') resize();
  else if (p === 'puzles') pintarCapitulos();
  else if (p === 'historial') pintarHistorial();
  else if (p === 'inicio') {
    // Se entra por la portada, con el panal a la vista (v10.2); desde Tus partidas,
    // con los modos bajados, donde estaba su icono (v11.4).
    const el = document.getElementById('inicio');
    pintarPrincipal(); medirFondo();
    el.scrollTop = bajado ? el.scrollHeight : 0;
    marcarBajado();
  }
}

// ---------------------------------------------------------------------------
// El botón naranja según quién llega (v11.1, T-48)
// ---------------------------------------------------------------------------
// Siempre hay uno, y es lo siguiente que te toca:
//   · partida a medias (manda sobre los otros dos): «Continuar partida»;
//   · ya has jugado: «Jugar» el último modo, que abre su ficha;
//   · primera vez: «Aprende a jugar», que lleva al tutorial (v11.2, T-49; en
//     la v11.1, al primer nivel de Puzzle).
// Para alguien nuevo, ni Contrarreloj (el reloj y las plagas lo machacan antes
// de entender el paso) ni Panal libre (sin objetivo, se aburre).
// Deja de ser nuevo al resolver un nivel o al empezar cualquier partida desde
// una ficha («Modos de juego»): quien quiera saltarse el tutorial, se lo salta.
// Dos claves nuevas, con el cuidado de siempre: si localStorage falla, se da
// por no nuevo y sin último modo, y entonces el botón es «Jugar» Contrarreloj.
// El tutorial no cuenta como último modo; al acabarlo se deja de ser nuevo y,
// mientras no se juegue otro modo, el botón es «Jugar · Puzzle · capítulo 1».
const YA_JUGADO_KEY = 'colmena.yaJugado.v1';
const ULTIMO_KEY = 'colmena.ultimoModo.v1';
function esNuevo() {
  try {
    if (localStorage.getItem(YA_JUGADO_KEY) === '1') return false;
    // Quien jugó antes de la v11.1 no tiene la marca, pero sí alguna de éstas.
    return ![RECORD_KEY, PARTIDA_KEY, PUZZLE_KEY, BASICO_KEY, HISTORIAL_KEY].some(k => localStorage.getItem(k) !== null);
  } catch { return false; }
}
function marcarYaJugado() {
  try { localStorage.setItem(YA_JUGADO_KEY, '1'); } catch { /* da igual */ }
}
function ultimoModo() {
  try {
    const m = localStorage.getItem(ULTIMO_KEY);
    return m && CONFIG_MODO[m] ? m : null;
  } catch { return null; }
}
function guardarUltimoModo(modo) {
  try { localStorage.setItem(ULTIMO_KEY, modo); } catch { /* da igual */ }
}
// «Contrarreloj · Normal», «Panal libre», «Puzzle · capítulo 2» (el del siguiente
// nivel abierto). Sin récord, en el botón ni en ningún sitio del inicio.
function describirModo(modo) {
  if (modo === MODOS.PUZZLE) {
    const sig = abiertosPuzzle(CAPITULOS, PUZLES, progresoPuzzle.mejores).siguiente;
    const p = sig && PUZLES.find(x => x.id === sig);
    return NOMBRE_MODO.puzzle + (p ? ` · capítulo ${p.capitulo}` : '');
  }
  return NOMBRE_MODO[modo] + (tieneDificultad(modo) ? ` · ${NOMBRE_DIF[dificultadElegida(modo)]}` : '');
}
const ICO_PLAY = '<svg width="13" height="13" viewBox="0 0 14 14"><path d="M4 2l8 5-8 5z" fill="#F79A1F"/></svg>';
const ICO_HEX = '<svg width="14" height="14" viewBox="0 0 14 14"><polygon points="7,1 12.5,4 12.5,10 7,13 1.5,10 1.5,4" fill="#F79A1F"/></svg>';
function quienLlega() {
  const g = leerPartida();
  if (g) return { caso: 'continuar', titulo: 'Continuar partida', detalle: describirPartida(g.s),
                  corto: `${NOMBRE_MODO[g.s.modo]} · turno ${g.s.turn}` };
  if (esNuevo()) return { caso: 'nuevo', titulo: 'Aprende a jugar', detalle: 'Empieza por aquí: unos niveles cortos.' };
  const modo = ultimoModo() || (tutorialAcabado() ? MODOS.PUZZLE : MODOS.CONTRARRELOJ);
  return { caso: 'jugar', titulo: 'Jugar', detalle: describirModo(modo), modo };
}
function pintarPrincipal() {
  const q = quienLlega();
  setText('principal-titulo', q.titulo);
  setText('principal-detalle', q.detalle);
  setHtml('principal-ico', q.caso === 'nuevo' ? ICO_HEX : ICO_PLAY);
  // La copia pequeña de la barra de los modos (v11.7, T-53).
  document.getElementById('inicio').classList.toggle('hay-partida', q.caso === 'continuar');
  if (q.caso === 'continuar') {
    setText('cont-mini-detalle', q.corto);
    document.querySelector('#cont-mini .play').innerHTML = ICO_PLAY;
  }
}
function pulsarPrincipal() {
  const q = quienLlega();
  if (q.caso === 'continuar') continuarPartida();
  else if (q.caso === 'nuevo') empezarTutorial(false);
  else abrirFicha(q.modo);
}

// El inicio tiene dos tramos (v10.2): la portada, con el panal vivo en grande,
// y los modos debajo. «Modos de juego ⌄» los enseña y se apaga en cuanto se baja.
function marcarBajado() {
  const el = document.getElementById('inicio');
  el.classList.toggle('bajado', el.scrollTop > 24);
}
const sinAnimar = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function verModos() {
  const el = document.getElementById('inicio');
  el.scrollTo({ top: el.scrollHeight, behavior: sinAnimar() ? 'auto' : 'smooth' });
}
// «⌃ Inicio» (v11.4): la gemela de verModos, para volver a la portada (donde está
// «Continuar partida») sin recargar. Arrastrar hacia abajo también sube.
function subirAlInicio() {
  const el = document.getElementById('inicio');
  el.scrollTo({ top: 0, behavior: sinAnimar() ? 'auto' : 'smooth' });
}

// «‹ Menú» (de la barra o de la pantalla final): se guarda y se vuelve, sin
// preguntar, porque ya no se pierde nada (v9.1). Volver al inicio no toca S.
// Desde la v11.7 (T-53, §5.95) se vuelve a los modos, no a la portada: el que
// sale de una partida suele querer otra. El tutorial sí acaba en la portada
// (§5.84, su botón naranja lleva al capítulo 1 de Puzzle): `bajado: false`.
function volverAlInicio({ bajado = true } = {}) {
  guardarPartida();
  mostrarPantalla('inicio', { bajado });
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
  // Se funde la pantalla de la que se sale: el inicio o, desde la v11.4, Tus partidas.
  const desde = document.getElementById(pantalla === 'historial' ? 'historial' : 'inicio');
  if (!desde.animate) { entrar(); return; }
  desde.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'ease-in' }).onfinish = entrar;
}

// «Continuar partida»: la guardada, tal cual se dejó, sin pasar por la ficha.
function continuarPartida() {
  const g = leerPartida();
  if (!g) { pintarPrincipal(); return; }
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
  puzzle:       ['basico', 'puzzle'],
};
const NOMBRE_PESTANA = { basico: 'Básico', plagas: 'Plagas', ...NOMBRE_MODO };
// El orden de la lista del inicio: los cinco modos de juego (Puzzle, el último, tiene
// ficha desde la v11.1) y después Panal libre (v11.3; en la v11.1 Puzzle iba al final).
const ORDEN_MODOS = [MODOS.CONTRARRELOJ, MODOS.INVIERNO, MODOS.CONTAGIO, MODOS.EXPANSION, MODOS.PUZZLE, MODOS.LIBRE];

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

// La ficha de un modo, desde el inicio: la primera vez en Básico.
function abrirFicha(modo) {
  abrirHoja({ desde: 'ficha', modo, pestana: basicoVisto() ? modo : 'basico' });
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
  // Desde los capítulos de Puzzle (v11) también es consulta, pegada a su barra.
  const barra = desde === 'partida' ? 'barra' : desde === 'puzles' ? 'pz-barra' : null;
  hoja.style.top = barra ? Math.round(document.getElementById(barra).getBoundingClientRect().bottom + 6) + 'px' : '';
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

  // Básico (v11.6, T-52): la fila de Puntos sólo donde se puntúa; la de la
  // racha también en Expansión, que la enseña en el marcador.
  const cfgModo = CONFIG_MODO[modo];
  hoja.querySelectorAll('[data-si="puntua"]').forEach(el => { el.hidden = !cfgModo.puntua; });
  hoja.querySelectorAll('[data-si="racha"]').forEach(el => { el.hidden = !(cfgModo.puntua || cfgModo.abre); });
  pintarDificultad(modo, ficha);
  if (CONFIG_MODO[modo].abre) pintarEscalaExpansion(ficha ? dificultadElegida(modo) : S.dificultad);

  // Empezar otra sustituye a la guardada (v9.1): que no pille por sorpresa. Un
  // nivel de Puzzle no la toca, así que su ficha no avisa.
  const esPuzzle = modo === MODOS.PUZZLE;
  const g = ficha && !esPuzzle ? leerPartida() : null;
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
  // Puzzle (v11.1): la ficha no empieza, lleva a los capítulos.
  setText('hoja-empezar', esPuzzle ? 'Elegir nivel' : 'Empezar');
  document.getElementById('hoja-volver').hidden = ficha;
  // Desde los capítulos de Puzzle no hay partida a la que volver.
  setText('hoja-volver', desde === 'puzles' ? 'Volver' : 'Volver a la partida');
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
// En Puzzle es «Elegir nivel» (v11.1): lleva a los capítulos. Las dos cuentan
// como haber elegido modo: ya no es «primera vez» y es el último modo jugado.
function empezar() {
  if (!hojaAbierta) return;
  const modo = hojaAbierta.modo;
  marcarBasicoVisto();
  marcarYaJugado();
  guardarUltimoModo(modo);
  hojaOrigen = null;
  if (modo === MODOS.PUZZLE) { irACapitulos(); return; }
  partida.modo = modo;
  partida.dificultad = tieneDificultad(modo) ? dificultadElegida(modo) : 'normal';
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
// Tus partidas (v11.4, T-50; LC-DESIGN §24)
// ===========================================================================
// Las partidas terminadas de Contrarreloj, Invierno, Contagio y Expansión, con su
// código y sus jugadas: 25 por modo y dificultad, y el récord y las de estrella no
// se borran nunca. Qué se apunta, la poda, el récord y las listas los dice
// historial.js; aquí, dónde se guarda y la pantalla.
// Si localStorage falla, el historial vive en memoria (vale mientras no se recargue).
const HISTORIAL_KEY = 'colmena.historial.v1';
const ESTRELLA_KEY = 'colmena.estrella.v1';
let historial = historialVacio();
function leerHistorialGuardado() {
  try { historial = leerHistorial(JSON.parse(localStorage.getItem(HISTORIAL_KEY))); }
  catch { historial = historialVacio(); }
}
// Si no cabe, se quitan las jugadas de las más antiguas (primero las sin estrella)
// y se reintenta: antes se pierde el detalle que la partida. En memoria siguen enteras.
function guardarHistorial() {
  try { localStorage.setItem(HISTORIAL_KEY, JSON.stringify(historial)); return; } catch { /* abajo */ }
  const copia = JSON.parse(JSON.stringify(historial));
  const con = copia.partidas.filter(e => e.jugadas)
    .sort((a, b) => (a.estrella - b.estrella) || (Date.parse(a.fecha) - Date.parse(b.fecha)));
  for (const e of con) {
    delete e.jugadas; delete e.tiempos; delete e.tiempoFinal;
    try { localStorage.setItem(HISTORIAL_KEY, JSON.stringify(copia)); return; } catch { /* la siguiente */ }
  }
}

// Al pintar el final por primera vez: una marca en el estado evita apuntarla dos veces.
function apuntarPartida() {
  if (S.enHistorial) return;
  S.enHistorial = true;
  const e = entradaDePartida(S, {
    id: Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    fecha: new Date().toISOString(), duracion, version: VERSION,
  });
  if (!e) return;
  apuntarEnHistorial(historial, e);
  guardarHistorial();
}

// Compartir una partida acabada (v11.9, T-30, §5.100): el menú del móvil
// (WhatsApp, correo…) con el texto y el enlace que entra en ella. Donde no hay
// menú (el PC) o falla, se copian texto y enlace. Cancelar el menú no es fallo.
async function compartirPartida(e) {
  const url = enlacePartida(location.origin + location.pathname, codigoPartida(e.modo, e.dificultad, e.semilla));
  const text = textoCompartir(e);
  if (navigator.share) {
    try { await navigator.share({ title: 'La Colmena', text, url }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  avisoAbajo(await copiarTexto(`${text} ${url}`) ? 'Enlace copiado: pégalo donde quieras.' : 'No se pudo copiar el enlace.');
}

// Al abrir el juego con `?c=` (v11.9, T-30): esa partida, directa. Si hay una
// guardada, antes se avisa de que la sustituye (como el «#», §24); si el código no
// vale, el inicio de siempre y un aviso. Un número solo (sin modo) no vale aquí.
function abrirEnlace(texto) {
  const c = leerCodigo(texto);
  if (!c || c.sinModo) { avisoAbajo('Ese enlace no es de una partida.'); return; }
  const g = leerPartida();
  if (!g) { jugarCodigo(c); return; }
  const modo = document.getElementById('enlace-modo');
  modo.textContent = describirModoDif(c.modo, c.dificultad);
  modo.style.color = COLOR_MODO[c.modo];
  setText('enlace-cod', codigoPartida(c.modo, c.dificultad, c.semilla));
  setHtml('enlace-txt', `Jugarla sustituye tu partida guardada de <b>${NOMBRE_MODO[g.s.modo]}</b> (turno ${g.s.turn}).`);
  const el = document.getElementById('enlace');
  el.hidden = false;
  const cerrar = () => { el.hidden = true; };
  document.getElementById('enlace-mia').onclick = cerrar;
  document.getElementById('enlace-jugar').onclick = () => { cerrar(); jugarCodigo(c); };
  el.onkeydown = ev => { if (ev.key === 'Escape') cerrar(); };
  document.getElementById('enlace-jugar').focus({ preventScroll: true });
}

// Jugar un código (el «#» del inicio, «Jugar ésta»): como «Empezar» en una ficha,
// ese modo, esa dificultad y esa semilla. No cambia la dificultad elegida del modo:
// es una partida suelta.
function jugarCodigo({ modo, dificultad, semilla }) {
  marcarBasicoVisto();
  marcarYaJugado();
  guardarUltimoModo(modo);
  partida.modo = modo;
  partida.dificultad = tieneDificultad(modo) ? dificultad : 'normal';
  cerrarPop();
  cerrarHoja();
  entrarEnPartida(() => restart(semilla));
}

// Lo que se ve de la pantalla: la pestaña («todas» o un modo) y la dificultad.
const histVista = { tab: 'todas', dif: 'normal' };
const HIST_PESTANAS = ['todas', ...MODOS_HISTORIAL];
const colorPestana = t => t === 'todas' ? '#ede4d3' : COLOR_MODO[t];

function irAHistorial() {
  const u = ultimoModo();
  histVista.tab = MODOS_HISTORIAL.includes(u) ? u : 'todas';
  histVista.dif = histVista.tab === 'todas' ? 'normal' : dificultadElegida(histVista.tab);
  cerrarPop();
  mostrarPantalla('historial');
  const el = document.getElementById('historial');
  if (el.animate) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  document.getElementById('hist-lista').scrollTop = 0;
}

// «hoy 21:40», «ayer», «30-09» (este año), «30-09-2025». Hora local.
function fechaCorta(iso) {
  const d = new Date(iso), hoy = new Date();
  const dia = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(hoy) - dia(d)) / 86400000);
  const dos = n => String(n).padStart(2, '0');
  if (dias === 0) return `hoy ${dos(d.getHours())}:${dos(d.getMinutes())}`;
  if (dias === 1) return 'ayer';
  return `${dos(d.getDate())}-${dos(d.getMonth() + 1)}` + (d.getFullYear() === hoy.getFullYear() ? '' : `-${d.getFullYear()}`);
}
const miles = n => n.toLocaleString('es-ES');

// El número grande de una partida y su unidad: puntos; en Expansión, los turnos
// con el panal completo y, sin completar, las abiertas.
function valorPartida(e) {
  if (!e.expansion) return [miles(e.puntos), 'puntos'];
  return e.expansion.completado ? [miles(e.turnos), 'turnos'] : [`${e.expansion.abiertas} de ${e.expansion.total}`, 'abiertas'];
}
// La línea de detalle, según el modo. Todo sale de la entrada (regla 8).
function detallePartida(e, rachaLarga = false) {
  const racha = `${rachaLarga ? 'racha máxima' : 'racha'} ${e.rachaMax}`;
  let txt;
  if (e.contagio) {
    const n = e.contagio.marcadas;
    txt = `${e.turnos} turnos · ` + (n ? `${n} ${n === 1 ? 'huella' : 'huellas'} (−${miles(e.contagio.resta)})` : 'sin huellas');
  } else if (e.expansion) {
    txt = e.expansion.completado ? `panal completo · ${formatoDuracion(e.duracion)}`
      : `sin completar · ${e.expansion.abiertas} de ${e.expansion.total} abiertas`;
  } else txt = `${e.turnos} turnos · ${formatoDuracion(e.duracion)} · ${racha}`;
  // Una partida de otra versión: el mismo código puede dar otra partida (§2.4).
  return txt + (e.version !== VERSION ? ` · ${e.version}` : '');
}

const ICO_COMPARTIR = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
const ICO_COPIAR = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
const ICO_ESTRELLA = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" stroke-width="1.8" stroke-linejoin="round"/></svg>';

// La fila del código (se copia al tocarlo) y «Jugar ésta».
function filaCodigo(e, clase = '') {
  const cod = codigoPartida(e.modo, e.dificultad, e.semilla);
  return `<div class="hist-f3"><button class="hist-cod" data-accion="copiar" data-cod="${cod}" aria-label="Copiar el código ${cod}">` +
    `<span>${cod}</span>${ICO_COPIAR}</button>` +
    `<button class="hist-comp" data-accion="compartir" aria-label="Compartir esta partida">${ICO_COMPARTIR}</button>` +
    `<button class="hist-jugar${clase}" data-accion="jugar">Jugar ésta</button></div>`;
}

function tarjetaPartida(e, conModo) {
  const [v, u] = valorPartida(e);
  const modo = conModo ? `<span class="hist-modo" style="color:${COLOR_MODO[e.modo]}">${describirModoDif(e.modo, e.dificultad)}</span>` : '';
  return `<div class="hist-card${e.estrella ? ' estrella' : ''}" data-id="${e.id}">${modo}` +
    `<div class="hist-f1"><span class="hist-v">${v} <small>${u}</small></span><span class="hist-dcha">` +
    `<button class="hist-estrella" data-accion="estrella" aria-pressed="${e.estrella}" aria-label="${e.estrella ? 'Quitar de guardadas' : 'Guardar esta partida'}">${ICO_ESTRELLA}</button>` +
    `<span class="hist-fecha">${fechaCorta(e.fecha)}</span></span></div>` +
    `<div class="hist-det">${detallePartida(e)}</div>${filaCodigo(e)}</div>`;
}

// El récord de un modo y dificultad, arriba en verde (§5.4). Si colmena.records.v1
// (de antes del historial) tiene uno mejor, se enseña ese número, sin código.
function tarjetaRecord(modo, dif) {
  const rec = recordDe(historial, modo, dif);
  const menos = !!CONFIG_MODO[modo].abre;
  const antiguo = leerRecords()[`${modo}.${dif}`];
  const ganaAntiguo = Number.isFinite(antiguo) && antiguo > 0 &&
    (!rec || (menos ? antiguo < rec.turnos : antiguo > rec.puntos));
  if (!rec && !ganaAntiguo) return '';
  const cab = f => `<div class="hist-rec-cab"><span class="hist-rec-et">Tu récord</span><span class="hist-fecha">${f}</span></div>`;
  if (ganaAntiguo)
    return `<div class="hist-record">${cab('')}<div class="hist-rec-v">${miles(antiguo)} <small>${menos ? 'turnos' : 'puntos'}</small></div>` +
      '<p class="hist-rec-antes">De antes del historial: no tiene semilla guardada.</p></div>';
  const [v, u] = valorPartida(rec);
  return `<div class="hist-record" data-id="${rec.id}">${cab(fechaCorta(rec.fecha))}<div class="hist-rec-v">${v} <small>${u}</small></div>` +
    `<div class="hist-rec-det">${detallePartida(rec, true)}</div>${filaCodigo(rec, ' verde')}</div>`;
}

function pintarHistorial() {
  const { tab, dif } = histVista;
  const conModo = tab === 'todas';
  // Las pestañas.
  document.getElementById('hist-tabs').innerHTML = HIST_PESTANAS.map(t =>
    `<button role="tab" data-tab="${t}" aria-selected="${t === tab}" tabindex="${t === tab ? 0 : -1}" style="--c:${colorPestana(t)}">${t === 'todas' ? 'Todas' : NOMBRE_MODO[t]}</button>`).join('');
  const activa = document.querySelector('#hist-tabs [aria-selected="true"]');
  if (activa && activa.scrollIntoView) activa.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  // Normal / Difícil: un filtro, no cambia la dificultad elegida para jugar.
  const difs = document.getElementById('hist-dif');
  difs.hidden = conModo;
  difs.querySelectorAll('[data-dif]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.dif === dif)));
  // Si hay partida guardada, jugar una de aquí la sustituye.
  const g = leerPartida();
  const aviso = document.getElementById('hist-aviso');
  aviso.hidden = !g;
  if (g) aviso.textContent = `Jugar una de aquí sustituye tu partida guardada de ${NOMBRE_MODO[g.s.modo]} (turno ${g.s.turn}).`;

  const k = HIST_PESTANAS.indexOf(tab);
  let html = `<div class="hist-puntos" aria-hidden="true" style="--c:${colorPestana(tab)}">` +
    HIST_PESTANAS.map((_, j) => `<span${j === k ? ' class="actual"' : ''}></span>`).join('') +
    '<em>desliza para cambiar de modo</em></div>';
  const lista = conModo ? todas(historial) : listaDe(historial, tab, dif);
  const record = conModo ? '' : tarjetaRecord(tab, dif);
  html += record;
  if (!lista.length && !record) {
    html += conModo
      ? '<div class="hist-vacio"><b>Aún no has terminado ninguna partida.</b></div>'
      : `<div class="hist-vacio"><b>Aún no has jugado ${NOMBRE_MODO[tab]} ${NOMBRE_DIF[dif].toLowerCase()}</b>` +
        `<span>Tu primera partida saldrá aquí, con su código para compartirla.</span><button class="primario" data-accion="ficha">Jugar</button></div>`;
  }
  if (lista.length) {
    const fav = lista.filter(e => e.estrella).length;
    const cuenta = (fav ? `${fav} ${fav === 1 ? 'guardada' : 'guardadas'} · ` : '') +
      (conModo ? 'todos los modos' : `${lista.length - fav} de ${HISTORIAL_POR_LISTA}`);
    html += `<div class="hist-ultimas"><span>Últimas</span><span>${cuenta}</span></div>` +
      lista.map(e => tarjetaPartida(e, conModo)).join('');
  }
  html += `<p class="hist-pie">Se guardan las ${HISTORIAL_POR_LISTA} últimas de cada modo y dificultad. El récord y las marcadas con estrella no se borran nunca.</p>`;
  document.getElementById('hist-lista').innerHTML = html;
}

// Cambiar de pestaña: con los dedos (deslizar) o tocándola. La lista entra desde el
// lado (40 px y un fundido de 180 ms; sin animación con prefers-reduced-motion).
function cambiarHistorial(tab, dir = 0) {
  if (tab === histVista.tab || !HIST_PESTANAS.includes(tab)) return;
  if (!dir) dir = HIST_PESTANAS.indexOf(tab) > HIST_PESTANAS.indexOf(histVista.tab) ? 1 : -1;
  if (histVista.tab === 'todas' && tab !== 'todas') histVista.dif = dificultadElegida(tab);
  histVista.tab = tab;
  pintarHistorial();
  const l = document.getElementById('hist-lista');
  l.scrollTop = 0;
  if (l.animate && !sinAnimar())
    l.animate([{ transform: `translateX(${dir * 40}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'ease-out' });
}

// Deslizar a los lados sobre la lista cambia de modo, sin dar la vuelta. Como en la
// ficha: se decide en los primeros ~10 px, y cuenta si pasa de 50 px a lo ancho y es
// más de 1,5 veces lo vertical. La lista lleva touch-action pan-y: el desplazamiento
// vertical sigue siendo del navegador (y si lo coge, llega pointercancel).
function gestosHistorial(lista) {
  let g = null, tocado = false;
  lista.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    g = { x: e.clientX, y: e.clientY, id: e.pointerId, eje: null };
    tocado = false;
  });
  lista.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id || g.eje) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (Math.hypot(dx, dy) < 10) return;
    g.eje = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    tocado = g.eje === 'x';
  });
  const soltar = e => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (e.type !== 'pointercancel' && g.eje === 'x' && Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      const k = HIST_PESTANAS.indexOf(histVista.tab) + (dx < 0 ? 1 : -1);
      if (k >= 0 && k < HIST_PESTANAS.length) cambiarHistorial(HIST_PESTANAS[k], dx < 0 ? 1 : -1);
    }
    g = null;
    setTimeout(() => { tocado = false; }, 50);
  };
  lista.addEventListener('pointerup', soltar);
  lista.addEventListener('pointercancel', soltar);
  // Un gesto que acaba encima de un botón no es un toque.
  lista.addEventListener('click', e => { if (tocado) { e.stopPropagation(); e.preventDefault(); tocado = false; } }, true);
}

// Un aviso abajo, unos segundos (la estrella, la primera vez).
let avisoT = 0;
function avisoAbajo(txt) {
  const el = document.getElementById('aviso-abajo');
  el.textContent = txt; el.hidden = false;
  clearTimeout(avisoT);
  avisoT = setTimeout(() => { el.hidden = true; }, 2200);
}

// Los botones de la lista: copiar, jugar, la estrella y «Jugar» de un vacío.
async function accionHistorial(e) {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const accion = b.dataset.accion;
  if (accion === 'ficha') { abrirFicha(histVista.tab); return; }
  const id = b.closest('[data-id]') && b.closest('[data-id]').dataset.id;
  const entrada = historial.partidas.find(x => x.id === id);
  if (!entrada) return;
  if (accion === 'jugar') jugarCodigo({ modo: entrada.modo, dificultad: entrada.dificultad, semilla: entrada.semilla });
  else if (accion === 'compartir') compartirPartida(entrada);
  else if (accion === 'copiar') {
    const span = b.querySelector('span');
    const ok = await copiarTexto(b.dataset.cod);
    span.textContent = ok ? 'Copiado' : 'No se pudo';
    b.classList.toggle('copiado', ok);
    setTimeout(() => { span.textContent = b.dataset.cod; b.classList.remove('copiado'); }, 1500);
  } else if (accion === 'estrella') {
    const si = !entrada.estrella;
    marcarEstrella(historial, id, si);
    guardarHistorial();
    pintarHistorial();
    // Sin explicación aparte; sólo la primera vez que se marca una, un aviso.
    let vista = false;
    try { vista = localStorage.getItem(ESTRELLA_KEY) === '1'; localStorage.setItem(ESTRELLA_KEY, '1'); } catch { /* puede repetirse */ }
    if (si && !vista) avisoAbajo('Guardada: sale arriba y no se borra aunque juegues más.');
    const otra = document.querySelector(`#hist-lista [data-id="${id}"] .hist-estrella`);
    if (otra) otra.focus({ preventScroll: true });
  }
}

// ===========================================================================
// Arranque
// ===========================================================================
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('board');
  ctx = canvas.getContext('2d');
  initInput(canvas, () => S, onCommit, redraw, alSoltarTutorial);
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
  pintarEscaleras();

  document.getElementById('inicio').addEventListener('scroll', marcarBajado, { passive: true });
  document.getElementById('elegir-modo').addEventListener('click', verModos);
  // Al bajar a los modos (v11.4): volver a la portada, Tus partidas y el «#».
  document.getElementById('subir-inicio').addEventListener('click', subirAlInicio);
  document.getElementById('abrir-historial').addEventListener('click', irAHistorial);
  document.getElementById('inicio-semilla').addEventListener('click', e => {
    const b = e.currentTarget;
    if (popAncla === b) { cerrarPop(); return; }
    cerrarPop();
    const pop = document.getElementById('pop');
    pop.className = 'semilla-inicio';
    document.getElementById('pop-velo').hidden = false;
    abrirPop(b, panelSemilla('inicio'));
    b.classList.add('abierto');
    pop.querySelector('input').focus({ preventScroll: true });
  });
  document.getElementById('pop-velo').addEventListener('click', cerrarPop);

  // Tus partidas (v11.4).
  leerHistorialGuardado();
  document.getElementById('hist-menu').addEventListener('click', () => {
    mostrarPantalla('inicio', { bajado: true });
    document.getElementById('inicio').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  });
  document.getElementById('hist-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) cambiarHistorial(b.dataset.tab);
  });
  document.getElementById('hist-tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const k = HIST_PESTANAS.indexOf(histVista.tab) + (e.key === 'ArrowRight' ? 1 : -1);
    if (k < 0 || k >= HIST_PESTANAS.length) return;
    cambiarHistorial(HIST_PESTANAS[k]);
    const a = document.querySelector('#hist-tabs [aria-selected="true"]');
    if (a) a.focus();
  });
  document.getElementById('hist-dif').addEventListener('click', e => {
    const b = e.target.closest('[data-dif]');
    if (!b || b.dataset.dif === histVista.dif) return;
    histVista.dif = b.dataset.dif;
    pintarHistorial();
  });
  gestosHistorial(document.getElementById('hist-lista'));
  document.getElementById('hist-lista').addEventListener('click', accionHistorial);

  // El inicio: el botón naranja y cada modo, que abre su ficha (también Puzzle,
  // desde la v11.1: antes iba directo a los capítulos).
  document.getElementById('principal').addEventListener('click', pulsarPrincipal);
  document.getElementById('cont-mini').addEventListener('click', pulsarPrincipal);
  // ¿Se ve el botón naranja grande? Si no, y hay partida, sale la copia pequeña
  // de la barra (v11.7, T-53). Sin IntersectionObserver, la pequeña sale siempre
  // que haya partida: mejor dos que ninguno.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) =>
      document.getElementById('inicio').classList.toggle('principal-visible', e.isIntersecting),
      { root: document.getElementById('inicio'), threshold: 0.6 }).observe(document.getElementById('principal'));
  }
  document.querySelectorAll('.modo-fila[data-modo]').forEach(b => b.addEventListener('click', () => abrirFicha(b.dataset.modo)));

  // El tutorial (v11.2): repetirlo (inicio y ficha Básico), la escalera, sus botones y el final.
  document.getElementById('repetir-tutorial').addEventListener('click', () => empezarTutorial(true));
  document.getElementById('basico-tutorial').addEventListener('click', () => {
    if (pantalla === 'partida') guardarPartida();
    empezarTutorial(true);
  });
  document.getElementById('tut-empezar').addEventListener('click', () => jugarTutorial(0));
  document.querySelectorAll('[data-tut-salir]').forEach(b => b.addEventListener('click', () => { clearTimeout(tut.alFinal); volverAlInicio({ bajado: false }); }));
  document.getElementById('tut-deshacer').addEventListener('click', deshacerPuzle);
  document.getElementById('tut-reiniciar').addEventListener('click', () => jugarTutorial(tut.k, false));
  document.getElementById('tut-pista').addEventListener('click', () => { tut.pistaEn = S.turn; redraw(); });
  document.getElementById('tut-inicio').addEventListener('click', () => {
    mostrarPantalla('inicio');
    document.getElementById('inicio').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  });

  // Puzzle (v11): los capítulos, el nivel y su final.
  leerProgresoGuardado();
  // Puzzle está en la lista de modos: se vuelve a ella (v11.7, T-53).
  document.getElementById('pz-menu').addEventListener('click', () => {
    mostrarPantalla('inicio', { bajado: true });
    document.getElementById('inicio').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  });
  document.getElementById('pz-info').addEventListener('click', () =>
    abrirHoja({ desde: 'puzles', modo: MODOS.PUZZLE, pestana: basicoVisto() ? MODOS.PUZZLE : 'basico' }));
  document.getElementById('pz-capitulos').addEventListener('click', e => {
    const b = e.target.closest('.pz-nivel');
    if (b && !b.disabled) abrirFichaNivel(b.dataset.id, b);
  });
  // La ficha del nivel (v11.11, T-55).
  document.getElementById('pz-ficha-fondo').addEventListener('click', cerrarFichaNivel);
  document.getElementById('pz-ficha-jugar').addEventListener('click', () => { if (fichaNivel) jugarNivel(fichaNivel); });
  gestosFichaNivel(document.getElementById('pz-ficha'));
  document.getElementById('pz-deshacer').addEventListener('click', deshacerPuzle);
  document.getElementById('pz-reiniciar').addEventListener('click', () => jugarNivel(S.puzle.id, false, { guiada: S.puzle.guiada }));
  document.getElementById('pz-pista').addEventListener('click', pedirPista);
  document.getElementById('fin-ayuda').addEventListener('click', pedirPista);
  document.getElementById('pz-solucion').addEventListener('click', () => jugarNivel(S.puzle.id, false, { guiada: true }));
  document.getElementById('fin-volver').addEventListener('click', irACapitulos);

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
  // En un nivel de Puzzle, «‹ Puzzle» vuelve a los capítulos.
  document.getElementById('partida-menu').addEventListener('click', () => S.puzle ? irACapitulos() : volverAlInicio());
  // «Otra vez»: el mismo modo y la misma dificultad, sin pasar por la ficha. En un
  // nivel ganado es «Siguiente ›»; en uno perdido, «Deshacer la última».
  document.getElementById('fin-otra').addEventListener('click', () => {
    // Tutorial: «Siguiente ›» o «↶ Deshacer».
    if (enTutorial()) { if (!S.gameOver) return; if (S.puzle.resultado.gana) jugarTutorial(tut.k + 1, false); else deshacerPuzle(); return; }
    if (!S.puzle) { restart(); return; }
    if (!S.puzle.resultado.gana) { deshacerPuzle(); return; }
    const sig = siguienteNivel(S.puzle.id);
    if (sig) jugarNivel(sig, false); else irACapitulos();
  });
  // El código de la partida, con «Copiar» (v11.4), y «Repetir este panal»: la misma
  // semilla en el mismo modo y dificultad («Otra vez» sigue siendo semilla nueva).
  document.getElementById('fin-codigo').addEventListener('click', async e => {
    const b = e.currentTarget;
    const ok = await copiarTexto(codigoActual());
    setText('fin-cod-acc', ok ? 'Copiado' : 'No se pudo');
    b.classList.toggle('copiado', ok);
    clearTimeout(b._t);
    b._t = setTimeout(() => { setText('fin-cod-acc', 'Copiar'); b.classList.remove('copiado'); }, 1800);
  });
  document.getElementById('fin-repetir').addEventListener('click', () => {
    partida.modo = S.modo; partida.dificultad = S.dificultad;
    restart(S.seed);
  });
  // «‹ Menú»; en un nivel, «Repetir» o «Reintentar»: el mismo nivel, desde el principio.
  document.getElementById('fin-menu').addEventListener('click', () =>
    enTutorial() ? jugarTutorial(tut.k, false)
      // «↻ Reintentar» sigue con la solución si se perdió con ella; «↻ Repetir», sin.
      : S.puzle ? jugarNivel(S.puzle.id, false, { guiada: S.puzle.guiada && !S.puzle.resultado.gana }) : volverAlInicio());

  // El panel flotante se cierra al tocar fuera. El canvas se lleva sus propios
  // eventos, así que esto escucha en la fase de captura.
  document.addEventListener('pointerdown', e => {
    if (!popAncla) return;
    const p = document.getElementById('pop');
    if (e.target.id === 'pop-velo') return;   // lo cierra su click, sin tocar lo de debajo
    if (!p.contains(e.target) && !popAncla.contains(e.target)) cerrarPop();
  }, true);
  // Escape cierra lo que esté encima; en la ficha, las flechas cambian de modo.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (hojaAbierta) cerrarHoja();
      else if (fichaNivel) cerrarFichaNivel();
      else if (popAncla) cerrarPop();
      else if (pantalla === 'historial') document.getElementById('hist-menu').click();
    } else if (hojaAbierta && hojaAbierta.desde === 'ficha' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      cambiarModoFicha(e.key === 'ArrowRight' ? 1 : -1);
    }
  });

  // La semilla: el botón abre el panel; la del pie se copia al tocarla.
  document.getElementById('semilla-btn').addEventListener('click', e => {
    const b = e.currentTarget;
    if (popAncla === b) { cerrarPop(); return; }
    cerrarPop(); abrirPop(b, panelSemilla('partida'));
  });
  const seed = document.getElementById('seed');
  async function copiarSemilla() {
    const cod = codigoActual() || String(S.seed);
    if (!await copiarTexto(cod)) return;
    seed.classList.add('copiada');
    seed.textContent = `semilla ${cod} · ¡copiada!`;
    setTimeout(() => {
      seed.classList.remove('copiada');
      seed.textContent = `semilla ${cod}`;
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
  // Cerrar o recargar a mitad de un nivel es salir de él (v11.11): al volver se empieza de cero.
  window.addEventListener('pagehide', () => cerrarIntento());
  document.addEventListener('visibilitychange', () => { if (document.hidden) alSalir(); });
  window.addEventListener('pagehide', alSalir);

  // El panal vivo.
  fondo.canvas = document.getElementById('fondo');
  fondo.ctx = fondo.canvas.getContext('2d');
  nuevoDemo((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);

  // El panel flotante se cierra si cambia el ancho (girar el móvil), no si sólo
  // cambia el alto: es lo que hace el teclado al salir, y el panel de la semilla
  // pone el foco en su casilla. Hasta la v11.4 se cerraba solo nada más abrirse.
  let anchoVentana = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth !== anchoVentana) cerrarPop();
    else if (popAncla) recolocarPop();
    anchoVentana = window.innerWidth;
    if (pantalla === 'partida') resize(); else { medirFondo(); marcarBajado(); }
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
  document.getElementById('fin-compartir').addEventListener('click', () => {
    const e = entradaDePartida(S, { id: '', fecha: '', duracion, version: VERSION });
    if (e) compartirPartida(e);
  });

  // Un enlace compartido (v11.9, T-30): se lee y se quita de la dirección en el
  // acto, para que recargar no vuelva a empezar la partida.
  const enlazado = codigoDeBusqueda(location.search);
  if (enlazado !== null) {
    try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* se queda; no pasa nada */ }
  }
  mostrarPantalla('inicio');
  if (enlazado !== null) abrirEnlace(enlazado);
  requestAnimationFrame(frame);
});
