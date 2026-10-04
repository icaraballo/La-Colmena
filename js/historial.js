// El historial de partidas y el código de cada partida (v11.4, T-50; LC-DESIGN §24).
//
// Funciones puras, sin DOM ni localStorage (como guardado.js): quién guarda el
// historial y cuándo (colmena.historial.v1, al pintar la pantalla final) lo decide
// app.js. Va después de guardado.js, del que usa jugadasValidas.
//
//   codigoPartida / leerCodigo   «CR-N-4069568398»: modo, dificultad y semilla
//   entradaDePartida             lo que se apunta de una partida terminada
//   apuntarEnHistorial           apunta y poda: 25 por modo y dificultad
//   marcarEstrella               la estrella guarda la partida para siempre
//   recordDe, listaDe, todas     lo que enseña «Tus partidas»
//   leerHistorial                lo que venga de localStorage, validado
//   rejugarPartida               la partida otra vez, jugada a jugada
//
// El motor no cambia: el mismo código da el mismo panal de salida y la misma
// secuencia de azar, que se gasta según lo que pasa (jugar distinto cambia dónde
// caen ítems y plagas). Es un reto justo, no una copia de la suerte del otro.

const HISTORIAL_VERSION = 1;
function historialVacio() { return { v: HISTORIAL_VERSION, partidas: [] }; }

// ---------------------------------------------------------------------------
// El código
// ---------------------------------------------------------------------------
// «CR-N-4069568398»: el prefijo del modo, la letra de la dificultad y la semilla
// en decimal. Panal libre, sin dificultad: «PL-4069568398». Puzzle no tiene: null.
function codigoPartida(modo, dificultad, semilla) {
  const p = PREFIJO_MODO[modo];
  if (!p) return null;
  return tieneDificultad(modo) ? `${p}-${LETRA_DIF[dificultad]}-${semilla >>> 0}` : `${p}-${semilla >>> 0}`;
}

// Lo contrario. Tolera espacios alrededor, minúsculas y espacios en vez de guiones;
// nada más. Devuelve { modo, dificultad, semilla }; un número solo, { semilla,
// sinModo: true } (en la partida se juega en el modo de ahora, como en la v6); y
// cualquier otra cosa, null.
function leerCodigo(texto) {
  if (typeof texto !== 'string') return null;
  const t = texto.trim().toUpperCase().replace(/ +/g, '-');
  // Un entero sin signo de 32 bits, sin ceros delante: lo que createState espera.
  const semillaDe = d => /^(0|[1-9]\d{0,9})$/.test(d) && Number(d) <= 0xffffffff ? Number(d) : null;
  if (/^\d+$/.test(t)) {
    const semilla = semillaDe(t);
    return semilla === null ? null : { semilla, sinModo: true };
  }
  const m = /^([A-Z]{2})-(?:([A-Z])-)?(\d+)$/.exec(t);
  if (!m) return null;
  const modo = Object.keys(PREFIJO_MODO).find(k => PREFIJO_MODO[k] === m[1]);
  const semilla = semillaDe(m[3]);
  if (!modo || semilla === null) return null;
  if (!tieneDificultad(modo)) return m[2] ? null : { modo, dificultad: 'normal', semilla };
  const dificultad = Object.keys(LETRA_DIF).find(k => LETRA_DIF[k] === m[2]);
  return dificultad ? { modo, dificultad, semilla } : null;
}

// Compartir (v11.9, T-30): el enlace es la dirección del juego más `?c=` y el
// código. De la búsqueda de la dirección («?c=CR-N-123») al texto del código, sin
// validarlo (eso es leerCodigo); null si no hay `c`.
function codigoDeBusqueda(busqueda) {
  const m = /[?&]c=([^&#]*)/.exec(typeof busqueda === 'string' ? busqueda : '');
  if (!m) return null;
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch { return null; }
}
// `base` es origen y ruta, sin búsqueda: la pone quien llama (sale de location).
function enlacePartida(base, codigo) {
  return `${base}?c=${encodeURIComponent(codigo)}`;
}
// Lo que acompaña al enlace, de una entrada: «La Colmena · Contrarreloj normal ·
// 5230 puntos. ¿Lo superas?». Expansión completa reta a menos turnos.
function textoCompartir(e) {
  const modo = NOMBRE_MODO[e.modo] + (tieneDificultad(e.modo) ? ` ${NOMBRE_DIF[e.dificultad].toLowerCase()}` : '');
  const miles = n => n.toLocaleString('es-ES');
  let resultado = `${miles(e.puntos)} puntos`, reto = '¿Lo superas?';
  if (e.expansion && e.expansion.completado) {
    resultado = `panal completo en ${miles(e.turnos)} turnos`; reto = '¿Lo haces en menos?';
  } else if (e.expansion) resultado = `${e.expansion.abiertas} de ${e.expansion.total} abiertas`;
  return `La Colmena · ${modo} · ${resultado}. ${reto}`;
}

// ---------------------------------------------------------------------------
// Una entrada
// ---------------------------------------------------------------------------
// De una partida terminada de los cuatro modos con puntos o turnos. `extra` trae
// lo que no está en el estado: { id, fecha, duracion, version }. Todo lo que
// enseña Tus partidas sale de aquí; la interfaz no recalcula reglas (regla 8).
// El código no se guarda: se escribe con codigoPartida.
function entradaDePartida(s, extra) {
  if (!s.gameOver || !MODOS_HISTORIAL.includes(s.modo)) return null;
  const e = {
    id: extra.id, modo: s.modo, dificultad: s.dificultad, semilla: s.seed >>> 0,
    version: extra.version, fecha: extra.fecha,
    puntos: s.score, turnos: s.turn, duracion: extra.duracion,
    rachaMax: Math.max(s.streakMax || 0, s.streak), jugadaMax: s.jugadaMax || 0,
    estrella: false,
  };
  // Contagio: los puntos antes de las huellas y lo que restan (lo pone el motor).
  if (CONFIG_MODO[s.modo].huellas) e.contagio = s.cierre ? { ...s.cierre } : { bruto: s.score, marcadas: 0, resta: 0 };
  if (CONFIG_MODO[s.modo].abre)
    e.expansion = { completado: s.completado, abiertas: abiertas(s), total: CERRADAS_EXPANSION.length };
  // Las jugadas, si la partida las trae enteras (una de antes de la v11.4 que se
  // continuó, no). Para la repetición y para que un servidor pueda comprobarla.
  if (jugadasValidas(s.jugadas, s.tiempos, s.height.length, s.turn)) {
    e.jugadas = s.jugadas.map(c => c.slice());
    e.tiempos = s.tiempos.slice();
    e.tiempoFinal = Math.max(extra.duracion, e.tiempos.length ? e.tiempos[e.tiempos.length - 1] : 0);
  }
  return e;
}

// ---------------------------------------------------------------------------
// Las listas
// ---------------------------------------------------------------------------
const msFecha = e => Date.parse(e.fecha);
// Primero las de estrella; dentro de cada grupo, de la más reciente a la más antigua.
const ordenLista = (a, b) => (b.estrella - a.estrella) || (msFecha(b) - msFecha(a));
const deLista = (modo, dificultad) => e => e.modo === modo && e.dificultad === dificultad;

function listaDe(h, modo, dificultad) {
  return h.partidas.filter(deLista(modo, dificultad)).sort(ordenLista);
}
function todas(h) {
  return h.partidas.slice().sort(ordenLista);
}

// El récord de un modo y dificultad: la de más puntos; en Expansión, la de menos
// turnos con el panal completo (sin ninguna completada, no hay). Con empate, la
// más antigua, que lo consiguió primero.
function recordDe(h, modo, dificultad) {
  const abre = CONFIG_MODO[modo].abre;
  let mejor = null;
  for (const e of h.partidas) {
    if (!deLista(modo, dificultad)(e) || (abre && !(e.expansion && e.expansion.completado))) continue;
    const mejora = !mejor || (abre ? e.turnos < mejor.turnos : e.puntos > mejor.puntos);
    const empata = mejor && (abre ? e.turnos === mejor.turnos : e.puntos === mejor.puntos);
    if (mejora || (empata && msFecha(e) < msFecha(mejor))) mejor = e;
  }
  return mejor;
}

// Como mucho HISTORIAL_POR_LISTA sin estrella en cada lista: se borra la más
// antigua sin estrella que no sea el récord (el récord cuenta, pero no se borra
// nunca). Las de estrella no tienen tope.
function podar(h, modo, dificultad) {
  const sin = h.partidas.filter(e => deLista(modo, dificultad)(e) && !e.estrella);
  const sobran = sin.length - HISTORIAL_POR_LISTA;
  if (sobran <= 0) return;
  const rec = recordDe(h, modo, dificultad);
  const fuera = new Set(sin.filter(e => e !== rec).sort((a, b) => msFecha(a) - msFecha(b)).slice(0, sobran));
  h.partidas = h.partidas.filter(e => !fuera.has(e));
}

function apuntarEnHistorial(h, e) {
  if (!e || h.partidas.some(x => x.id === e.id)) return h;
  h.partidas.push(e);
  podar(h, e.modo, e.dificultad);
  return h;
}

// Marcar sube la partida arriba y la libra del límite; desmarcar la devuelve a su
// sitio, y si con eso sobran, se poda en ese momento.
function marcarEstrella(h, id, si) {
  const e = h.partidas.find(x => x.id === id);
  if (!e) return false;
  e.estrella = !!si;
  if (!si) podar(h, e.modo, e.dificultad);
  return true;
}

// ---------------------------------------------------------------------------
// Leer lo guardado
// ---------------------------------------------------------------------------
// No se fía de nada (como restaurarPartida): una entrada que no tenga la forma
// esperada se descarta ella sola, no todo el historial; unas jugadas que no
// valgan se quitan y la entrada se queda sin ellas.
function leerHistorial(g) {
  const h = historialVacio();
  if (!g || g.v !== HISTORIAL_VERSION || !Array.isArray(g.partidas)) return h;
  const num = v => Number.isFinite(v) && v >= 0;
  const ids = new Set();
  for (const x of g.partidas) {
    if (!x || typeof x !== 'object') continue;
    if (typeof x.id !== 'string' || !x.id || ids.has(x.id)) continue;
    if (!MODOS_HISTORIAL.includes(x.modo) || !NOMBRE_DIF[x.dificultad]) continue;
    if (!Number.isInteger(x.semilla) || x.semilla < 0 || x.semilla > 0xffffffff) continue;
    if (typeof x.version !== 'string' || typeof x.fecha !== 'string' || isNaN(Date.parse(x.fecha))) continue;
    if (!num(x.puntos) || !Number.isInteger(x.turnos) || x.turnos < 0 || !num(x.duracion)) continue;
    if (!num(x.rachaMax) || !num(x.jugadaMax)) continue;
    const e = { id: x.id, modo: x.modo, dificultad: x.dificultad, semilla: x.semilla, version: x.version,
                fecha: x.fecha, puntos: x.puntos, turnos: x.turnos, duracion: x.duracion,
                rachaMax: x.rachaMax, jugadaMax: x.jugadaMax, estrella: x.estrella === true };
    if (CONFIG_MODO[x.modo].huellas) {
      const c = x.contagio;
      if (!c || !num(c.bruto) || !num(c.marcadas) || !num(c.resta)) continue;
      e.contagio = { bruto: c.bruto, marcadas: c.marcadas, resta: c.resta };
    }
    if (CONFIG_MODO[x.modo].abre) {
      const c = x.expansion;
      if (!c || typeof c.completado !== 'boolean' || !num(c.abiertas) || !num(c.total)) continue;
      e.expansion = { completado: c.completado, abiertas: c.abiertas, total: c.total };
    }
    const celdas = TABLEROS[CONFIG_MODO[x.modo].tablero].n;
    if (jugadasValidas(x.jugadas, x.tiempos, celdas, x.turnos) && num(x.tiempoFinal) &&
        (!x.tiempos.length || x.tiempoFinal >= x.tiempos[x.tiempos.length - 1])) {
      e.jugadas = x.jugadas.map(c => c.slice());
      e.tiempos = x.tiempos.slice();
      e.tiempoFinal = x.tiempoFinal;
    }
    ids.add(e.id);
    h.partidas.push(e);
  }
  return h;
}

// ---------------------------------------------------------------------------
// La repetición
// ---------------------------------------------------------------------------
// La partida otra vez, con el motor: la semilla, y para cada turno el reloj que
// corrió desde el anterior y la jugada; al final, lo que corrió hasta acabar. El
// reloj (tick) es lineal entre jugadas (la velocidad sólo cambia al jugar), así que
// un tick grande equivale a los pequeños de cada fotograma. Devuelve el estado
// final, o null si no hay jugadas o alguna no vale (la partida no es ésta).
function rejugarPartida(e) {
  if (!e || !Array.isArray(e.jugadas) || !Array.isArray(e.tiempos)) return null;
  const s = createState(e.modo, e.dificultad, e.semilla);
  let antes = 0;
  for (let k = 0; k < e.jugadas.length; k++) {
    tick(s, e.tiempos[k] - antes);
    antes = e.tiempos[k];
    if (s.gameOver || !commitTurn(s, e.jugadas[k])) return null;
  }
  tick(s, (e.tiempoFinal || antes) - antes);
  return s;
}
