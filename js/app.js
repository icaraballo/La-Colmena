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
  draw(ctx, S, { cells: drag.cells, ready: dragReady(S), fuera: drag.fuera, abejas, destellos }, now);
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
// elegir. Panal libre no tiene dificultad: ver panelConfirmar.
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

// Panal libre no tiene dificultad, así que no había panel de por medio y un
// toque sin querer en la barra reiniciaba la partida sin red (v7, F.3). Con
// partida empezada, se pregunta; con el panal recién puesto o la partida
// acabada, no hay nada que perder y arranca directo.
function partidaEmpezada() { return S.turn > 0 && !S.gameOver; }
function panelConfirmar(modo) {
  const caja = document.createElement('div');
  const t = document.createElement('b');
  t.textContent = '¿Empezar una partida nueva?';
  const nota = document.createElement('span');
  nota.className = 'nota';
  nota.textContent = 'Se pierde la de ahora.';
  const fila = document.createElement('div');
  fila.className = 'difs';
  const si = document.createElement('button');
  si.textContent = 'Sí, empezar';
  si.addEventListener('click', () => { partida.modo = modo; cerrarPop(); restart(); });
  const no = document.createElement('button');
  no.textContent = 'No';
  no.addEventListener('click', cerrarPop);
  fila.appendChild(si); fila.appendChild(no);
  caja.appendChild(t); caja.appendChild(fila); caja.appendChild(nota);
  return caja;
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
  // Desde la v7 van en orden y unidos por una flecha, para que se lean como
  // peldaños y no como cuatro fichas sueltas: jugando, ni el autor entendía
  // cuándo se saltaba de uno a otro.
  const ed = document.getElementById('leyenda-des');
  ed.innerHTML = '';
  ed.hidden = !cfg.desastres;
  if (cfg.desastres) DESASTRES_VISIBLES.forEach((tipo, k) => {
    if (k) {
      const f = document.createElement('span');
      f.className = 'flecha';
      f.textContent = '›';
      f.setAttribute('aria-hidden', 'true');
      ed.appendChild(f);
    }
    const info = DESASTRE_INFO[tipo];
    ed.appendChild(chip({ ...info, nombre: `${info.peldano}. ${info.nombre}` }, tipo, true));
  });
}

// Los números de la ayuda salen de las constantes (v7): la ayuda es HTML
// estático y decía «4 celdas» a mano cuando el umbral ya era otro.
function rellenarConstantes() {
  const valores = { COSECHA_GRANDE, SEDA_TURNOS, ITEM_TURNOS, CALMA_TRAS_VELUTINA };
  document.querySelectorAll('[data-const]').forEach(el => {
    el.textContent = valores[el.dataset.const];
  });
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
  // una segunda fila de 40 px y no era información que se mire a menudo.
  // Tiene que caber en UNA línea de 336 px (360 de móvil menos márgenes): si
  // salta a dos, el panal pierde 17 px. Por eso desde la v7 la dificultad se
  // fue al pie, junto a la semilla, y las celdas sólo salen donde cambian, que
  // es con helada.
  const sub = [`turno <b>${S.turn}</b>`];
  // Invierno: lo que muerde la helada si fallas (v7). Hasta la v6 ponía
  // «helada 0/1», que no se movía nunca porque HELADA_CADA vale 1.
  if (cfg.helada) {
    const muerde = Math.min(HELADA_MUERDE[S.dificultad], tilesPlayable(S));
    sub.push(`<b>${tilesPlayable(S)}</b> celdas`, `si fallas <b>−${muerde}</b>`);
  }
  sub.push(`meseta <b>${biggest}</b>`);
  // Contrarreloj: el peldaño. Hasta la v6 decía «N fallos» y se leía como
  // fallos SEGUIDOS, cuando cuenta los fallos desde la última cosecha grande
  // aunque en medio haya veinte turnos buenos. Pasado el 4 todo es velutina,
  // así que no sube de ahí.
  if (cfg.desastres) {
    const tope = DESASTRES_VISIBLES.length;
    sub.push(`escalera <b>${Math.min(S.failStreak, tope)}/${tope}</b> · baja con ${COSECHA_GRANDE}+`);
  }
  setHtml('sub', sub.join(' · '));
  // La dificultad, en el pie: el récord es por modo Y dificultad, y su botón
  // no está a la vista desde la v6.
  setText('dif', cfg.puntua ? NOMBRE_DIF[S.dificultad].toLowerCase() : '');

  // El ítem que está en el tablero se resalta, con los turnos que le quedan
  // antes de evaporarse.
  document.querySelectorAll('#leyenda .chip').forEach(c => {
    const suyo = !!S.item && c.dataset.item === S.item.tipo;
    c.classList.toggle('activo', suyo);
    c.querySelector('.cuenta').textContent =
      suyo ? `${Math.max(0, S.item.caduca - S.turn)}t` : '';
  });
  // La escalera (v7). Cada peldaño en uno de tres estados: SUBIDO (ya pisado
  // desde la última cosecha grande), SI FALLAS (el siguiente) o POR VENIR.
  //
  // Qué cae si fallas lo dice el motor (siguienteDesastre), no una copia de sus
  // reglas: hasta la v6 el HUD llevaba la suya y decía «calma» un turno de más
  // (CR-07). Con el contador a cero el resaltado es tenue (`previo`): avisa de
  // lo que pasaría, no de un peligro en marcha (CR-06).
  const n = S.failStreak;
  const siguiente = siguienteDesastre(S);
  // Turnos en los que fallar aún no trae nada. El fallo de la interfaz ocurre
  // en S.turn + 1, de ahí el −1: en el último turno de calma ya son 0.
  const calma = Math.max(0, S.calmaHasta - S.turn - 1);
  const capullo = S.desastres.some(d => d.tipo === 'capullo');
  const seda = S.desastres.find(d => d.tipo === 'seda');
  document.querySelectorAll('#leyenda-des .chip').forEach(c => {
    const tipo = c.dataset.des;
    const peldano = DESASTRE_INFO[tipo].peldano;
    const act = tipo === siguiente;
    c.classList.toggle('activo', act);
    c.classList.toggle('previo', act && n === 0);
    c.classList.toggle('subido', !act && peldano <= n);
    let cuenta = act ? 'si fallas' : '', ahora = '';
    if (tipo === 'polilla' && capullo) {
      cuenta = 'capullo';
      ahora = 'Hay un capullo en el panal: eclosiona si fallas. Una cosecha grande lo quita.';
    }
    if (tipo === 'seda' && seda) {
      const quedan = Math.max(0, seda.hasta - S.turn);
      cuenta = `${quedan}t`;
      ahora = `La seda bloquea sus celdas ${quedan} ${quedan === 1 ? 'turno' : 'turnos'} más. No se quita.`;
    }
    if (tipo === 'velutina' && calma > 0) {
      cuenta = `calma ${calma}t`;
      ahora = `Calma: si fallas en los próximos ${calma} turnos no cae nada. Después, cada fallo es otra velutina.`;
    }
    c.querySelector('.cuenta').textContent = cuenta;
    c.dataset.ahora = ahora;
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
  } else if (cfg.desastres && S.failStreak > 0 && S.step >= COSECHA_GRANDE &&
             mesetaDeNivel(S, MAX_LEVEL) >= S.step) {
    // Enseña la regla en el momento exacto en que sirve (v7, E.5).
    txt = 'Si cosechas ahora, bajas de la escalera';
    cls = 'linea bueno';
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
    // Bajar de la escalera se cuenta (v7): hasta la v6 el contador volvía a 0 en
    // silencio y el jugador no aprendía que la cosecha grande es su defensa.
    if (e.type === 'baja') {
      const quita = eventos.some(x => x.type === 'limpia');
      txt.push(`Cosecha de ${e.cosecha}: vuelves al primer peldaño` + (quita ? ' y el capullo desaparece' : ''));
    }
    if (e.type === 'limpia' && !eventos.some(x => x.type === 'baja')) txt.push('La cosecha elimina el capullo');
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
  logClase = 'linea' + (eventos.some(e => e.type === 'fallback') ? ' tight'
                      : eventos.some(e => e.type === 'baja') ? ' bueno' : '');
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

function restart(semilla) {
  S = nuevaPartida(semilla);
  finPintado = false;
  destellos.length = 0;
  document.getElementById('fin').hidden = true;
  drag.cells = []; drag.desde = []; drag.trail = []; drag.deshaciendo = false; drag.fuera = false;
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
  rellenarConstantes();
  document.getElementById('fin-otra').addEventListener('click', () => restart());

  // Tocar un modo siempre acaba en partida nueva de ese modo. Si hay dificultad
  // que elegir, con el panel de por medio; Panal libre pide confirmación si hay
  // partida empezada (v7) y si no arranca directo.
  document.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
    const modo = b.dataset.modo;
    if (popAncla === b) { cerrarPop(); return; }   // segundo toque: se cierra
    cerrarPop();
    if (!CONFIG_MODO[modo].puntua) {
      if (partidaEmpezada()) { abrirPop(b, panelConfirmar(modo)); return; }
      partida.modo = modo; restart(); return;
    }
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

  // La ayuda explica los tres modos, porque cada uno castiga el fallo a su
  // manera y eso no se deduce jugando; el del modo en curso va resaltado.
  const ayuda = document.getElementById('ayuda');
  function abrirAyuda() {
    document.querySelectorAll('#ayuda .m').forEach(m =>
      m.classList.toggle('actual', m.dataset.ayuda === partida.modo));
    cerrarPop();
    ayuda.hidden = false;
    ayuda.querySelector('.caja').scrollTop = 0;
  }
  document.getElementById('ayuda-btn').addEventListener('click', abrirAyuda);
  function cerrarAyuda() { ayuda.hidden = true; marcarAyudaVista(); }
  document.getElementById('ayuda-cerrar').addEventListener('click', cerrarAyuda);
  // Tocar fuera de la caja también cierra: en el móvil es el gesto que se hace
  // sin pensar, y si no hace nada parece que se ha quedado colgado.
  ayuda.addEventListener('click', e => { if (e.target === ayuda) cerrarAyuda(); });
  if (!ayudaVista()) abrirAyuda();

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

  window.addEventListener('resize', () => { cerrarPop(); resize(); });
  restart();
  resize();
  requestAnimationFrame(frame);
});
