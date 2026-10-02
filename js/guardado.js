// Guardar y recuperar una partida (v9.1, T-41). Sólo convierte el estado a un
// objeto que cabe en JSON y lo valida al volver: quién lo guarda y cuándo
// (localStorage, después de cada turno, al salir) lo decide app.js.
//
// Se puede porque el estado es un objeto plano (regla 3). Se guarda TODO,
// también el azar (`rng`): así, al continuar, salen los mismos ítems y las
// mismas plagas que habrían salido sin salir del juego. Lo único que no se
// guarda es lo del último turno (`last`, `eventos`), que sólo sirve para contarlo.
//
// Al leer no se fía de nada: parte de un estado nuevo del mismo modo y copia
// campo a campo lo que tenga la forma esperada. Si algo no la tiene, la partida
// guardada no vale y se descarta entera; nunca se juega un estado a medias.
// Un campo que el motor gane en el futuro y no esté en una partida vieja se
// queda con su valor de salida.

const GUARDADO_VERSION = 1;
const NO_SE_GUARDA = ['last', 'eventos'];
// Datos de la partida que lleva app.js dentro del estado: los máximos para la
// pantalla final y, desde la v11.4 (T-50), las jugadas y sus tiempos para el
// historial. Los dos primeros son números; los otros dos tienen su validación.
const EXTRAS_GUARDADO = ['streakMax', 'jugadaMax', 'jugadas', 'tiempos'];

const esTipado = v => v instanceof Uint8Array || v instanceof Int32Array;
const esEntero = v => Number.isInteger(v);

function serializarPartida(s, extra = {}) {
  const estado = {};
  for (const k of Object.keys(s)) {
    if (NO_SE_GUARDA.includes(k)) continue;
    const v = s[k];
    estado[k] = esTipado(v) ? Array.from(v) : JSON.parse(JSON.stringify(v));
  }
  return { v: GUARDADO_VERSION, ...extra, estado };
}

function restaurarPartida(g) {
  try {
    if (!g || g.v !== GUARDADO_VERSION || !g.estado || typeof g.estado !== 'object') return null;
    const e = g.estado;
    if (!CONFIG_MODO[e.modo] || !NOMBRE_DIF[e.dificultad] || !esEntero(e.seed)) return null;
    // Un nivel de Puzzle no se guarda (v11): se repite en un momento, y su estado
    // lleva el nivel (s.puzle), que esto no sabe validar.
    if (CONFIG_MODO[e.modo].puzle) return null;
    const s = createState(e.modo, e.dificultad, e.seed);

    for (const k of Object.keys(s)) {
      if (NO_SE_GUARDA.includes(k) || !(k in e)) continue;
      const molde = s[k], v = e[k];
      if (esTipado(molde)) {
        if (!Array.isArray(v) || v.length !== molde.length || !v.every(esEntero)) return null;
        s[k] = new molde.constructor(v);
      } else if (typeof molde === 'number') {
        if (!Number.isFinite(v)) return null;
        s[k] = v;
      } else if (typeof molde === 'boolean' || typeof molde === 'string') {
        if (typeof v !== typeof molde) return null;
        s[k] = v;
      } else if (Array.isArray(molde)) {
        if (!Array.isArray(v)) return null;
        s[k] = v;
      } else if (molde === null) {   // el ítem: null o un objeto
        if (v !== null && (typeof v !== 'object' || Array.isArray(v))) return null;
        s[k] = v;
      }
    }
    for (const k of ['streakMax', 'jugadaMax']) if (Number.isFinite(e[k])) s[k] = e[k];
    // Las jugadas (v11.4): si no valen se pierden sólo ellas (null): la partida
    // sigue y se apuntará sin jugadas. Una de antes de la v11.4 no las tiene.
    if ('jugadas' in e || 'tiempos' in e) {
      const valen = jugadasValidas(e.jugadas, e.tiempos, s.height.length, s.turn);
      s.jugadas = valen ? e.jugadas.map(c => c.slice()) : null;
      s.tiempos = valen ? e.tiempos.slice() : null;
    }

    // Lo que no puede estar fuera de rango sin romper el motor.
    const celda = t => esEntero(t) && t >= 0 && t < s.height.length;
    if (![...s.height].every(h => h >= AGUA && h <= MAX_LEVEL)) return null;
    if (![...s.roto].every(r => r === 0 || r === 1)) return null;
    // v10: el tablero es el del modo, y las celdas cerradas sólo 0 o 1.
    if (s.tablero !== CONFIG_MODO[s.modo].tablero) return null;
    if (![...s.cerrada].every(r => r === 0 || r === 1)) return null;
    // Las huellas de Contagio: cada grupo, con su tipo, sus celdas y su turno.
    if (!s.huellas.every(g => g && typeof g.tipo === 'string' && Array.isArray(g.tiles) &&
        g.tiles.length > 0 && g.tiles.every(celda) && esEntero(g.proximo))) return null;
    if (!esEntero(s.step) || s.step < 1 || !esEntero(s.turn) || s.turn < 0) return null;
    if (!s.heladas.every(celda)) return null;
    if (s.item && (!celda(s.item.tile) || !ITEM_INFO[s.item.tipo])) return null;
    if (!s.desastres.every(d => d && typeof d.tipo === 'string' &&
        (d.tile === undefined || celda(d.tile)) &&
        (d.tiles === undefined || (Array.isArray(d.tiles) && d.tiles.every(celda))))) return null;
    s.rng = (s.rng >>> 0) || 1;
    return s;
  } catch {
    return null;
  }
}

// Las jugadas de una partida (v11.4, T-50): las celdas de cada turno que valió y,
// para cada uno, la duración acumulada al jugarlo (segundos de reloj corrido). Una
// por turno, con celdas del tablero y tiempos que no bajan. Lo usan el guardado y
// el historial (historial.js), que no se fían de lo que leen.
function jugadasValidas(jugadas, tiempos, celdas, turnos) {
  return Array.isArray(jugadas) && Array.isArray(tiempos) &&
    jugadas.length === turnos && tiempos.length === turnos &&
    jugadas.every(c => Array.isArray(c) && c.length > 0 && c.every(t => esEntero(t) && t >= 0 && t < celdas)) &&
    tiempos.every((t, k) => Number.isFinite(t) && t >= 0 && (k === 0 || t >= tiempos[k - 1]));
}

// ---------------------------------------------------------------------------
// El progreso del modo Puzzle (v11): la mejor marca de cada nivel resuelto
// ---------------------------------------------------------------------------
// { v: 1, mejores: { id: { estrellas: 1-3, turnos } } }. Lo guarda app.js en
// localStorage (colmena.puzzle.v1). Al leer no se fía: un nivel con una marca que
// no tenga la forma esperada se olvida (sólo ése, no todo el progreso).
const PROGRESO_PUZZLE_VERSION = 1;
function progresoPuzzleVacio() { return { v: PROGRESO_PUZZLE_VERSION, mejores: {} }; }

function leerProgresoPuzzle(g) {
  const p = progresoPuzzleVacio();
  if (!g || g.v !== PROGRESO_PUZZLE_VERSION || !g.mejores || typeof g.mejores !== 'object') return p;
  for (const [id, m] of Object.entries(g.mejores))
    if (typeof id === 'string' && m && [1, 2, 3].includes(m.estrellas) && esEntero(m.turnos) && m.turnos > 0)
      p.mejores[id] = { estrellas: m.estrellas, turnos: m.turnos };
  return p;
}

// Apunta un nivel ganado si mejora la marca: más estrellas o, con las mismas,
// menos turnos. Devuelve si ha mejorado.
function apuntarPuzzle(p, id, resultado) {
  if (!resultado || !resultado.gana) return false;
  const antes = p.mejores[id];
  if (antes && (antes.estrellas > resultado.estrellas ||
      (antes.estrellas === resultado.estrellas && antes.turnos <= resultado.turnos))) return false;
  p.mejores[id] = { estrellas: resultado.estrellas, turnos: resultado.turnos };
  return true;
}


// ---------------------------------------------------------------------------
// El progreso del tutorial (v11.2, T-49)
// ---------------------------------------------------------------------------
// { v: 1, resuelto: N }: el último nivel resuelto, de 0 a `total` (el número de
// niveles). Lo guarda app.js en localStorage (colmena.tutorial.v1). Quien sale a
// medias retoma en el primero sin resolver. Si no vale, se empieza por el 1.
const PROGRESO_TUTORIAL_VERSION = 1;
function leerProgresoTutorial(g, total) {
  return g && g.v === PROGRESO_TUTORIAL_VERSION && esEntero(g.resuelto) && g.resuelto >= 0 && g.resuelto <= total
    ? g.resuelto : 0;
}
