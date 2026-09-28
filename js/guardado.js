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
// Datos de la partida que lleva app.js dentro del estado para la pantalla final.
const EXTRAS_GUARDADO = ['streakMax', 'jugadaMax'];

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
    for (const k of EXTRAS_GUARDADO) if (Number.isFinite(e[k])) s[k] = e[k];

    // Lo que no puede estar fuera de rango sin romper el motor.
    const celda = t => esEntero(t) && t >= 0 && t < TILE_COUNT;
    if (![...s.height].every(h => h >= AGUA && h <= MAX_LEVEL)) return null;
    if (![...s.roto].every(r => r === 0 || r === 1)) return null;
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
