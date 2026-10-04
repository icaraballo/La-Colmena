// La máquina de puzles (T-46) · las reglas de La Colmena en la forma que entiende
// el buscador: el estado de un nivel, todas las jugadas y el «juego» de un nivel.
//
// Desde la v11.10 (T-54) también lo usa el juego, para la pista de Puzzle
// (js/pista.js): se carga en Node (require, desde motor.js y colmena.js) y como
// script clásico en el navegador, así que no pide el motor por su cuenta:
// crearJuego(M) lo recibe. En el navegador M son las funciones globales del motor;
// en Node, las de motor.js. No hay otra copia de ninguna regla.
//
// Aquí sí se sabe de panales, pero las reglas siguen siendo las del motor: validar y
// aplicar una jugada lo hace commitTurn. Lo único propio de este fichero es
// ENUMERAR las jugadas (el motor sólo sabe comprobar la que le des), el estado
// compacto y la huella. Los objetivos, en objetivos.js.
function crearJuego(M) {
  const crear = typeof crearObjetivos === 'function' ? crearObjetivos : require('./objetivos.js').crearObjetivos;
  const OBJ = crear(M);
  // La huella de los niveles: en Node con Buffer (lo más rápido, lo de siempre); en
  // el navegador, con String.fromCharCode. Las dos dan el mismo texto.
  const claveAlturas = typeof Buffer !== 'undefined'
    ? h => Buffer.from(h.buffer, h.byteOffset, h.length).toString('latin1')
    : h => String.fromCharCode.apply(null, h);

  // El estado del motor para un nivel, para la BÚSQUEDA: un Panal libre con el
  // tablero, la forma, los niveles y el paso del nivel, sin ítems (con `itemCalma`
  // infinito, spawnItemIfEarned no saca ninguno). No es crearPuzle del juego (v11) a
  // propósito: el buscador copia y juega millones de veces y mira el objetivo con su
  // propio seguimiento compacto; el final de un puzle (§17 de state.js) le sobra.
  // Lo que juega el modo Puzzle de verdad lo comprueban `verificar` y tests/smoke.js.
  function estadoPuzle({ tablero = 'panal24', height, rotas = [], paso = 1 }) {
    const t = M.TABLEROS[tablero];
    if (!t) throw new Error(`tablero desconocido: ${tablero}`);
    if (height.length !== t.n) throw new Error(`el tablero ${tablero} tiene ${t.n} celdas, no ${height.length}`);
    const s = M.createState(M.MODOS.LIBRE, 'normal', 1);
    s.tablero = tablero;
    s.height = Uint8Array.from(height);
    s.roto = new Uint8Array(t.n);
    for (const i of rotas) { s.roto[i] = 1; s.height[i] = M.AGUA; }
    s.cerrada = new Uint8Array(t.n);
    s.sedaHasta = new Int32Array(t.n);
    s.item = null;
    s.itemCalma = Infinity;
    s.step = paso;
    return s;
  }

  // ---------------------------------------------------------------------------
  // Todas las jugadas: cada subconjunto CONEXO de `paso` celdas dentro de una meseta.
  // ---------------------------------------------------------------------------
  // Con tránsito, el arrastre no es un camino sino un conjunto conexo (state.js lo
  // comprueba con un flood-fill). Así que las jugadas son los subconjuntos conexos
  // de tamaño k de cada meseta. Se enumeran con el algoritmo ESU (Wernicke, 2006):
  // cada subconjunto sale exactamente una vez, anclado en su celda de índice menor,
  // sin generar repetidos que luego haya que tirar. Comprobado contra la fuerza
  // bruta con isValidDrag en pruebas.js.
  function jugadas(s) {
    const k = s.step, out = [], n = s.height.length;
    for (let h = M.AGUA; h <= M.MAX_LEVEL; h++) {
      const dentro = new Uint8Array(n);
      let cuantas = 0;
      for (let i = 0; i < n; i++) if (s.height[i] === h && M.jugable(s, i)) { dentro[i] = 1; cuantas++; }
      if (cuantas >= k) conexos(s, dentro, k, out);
    }
    return out;
  }

  function conexos(s, dentro, k, out) {
    const n = s.height.length;
    const enSub = new Uint8Array(n);      // la celda está en el subconjunto
    const vecSub = new Uint8Array(n);     // cuántas celdas del subconjunto la tocan
    const sub = [];
    const meter = w => { sub.push(w); enSub[w] = 1; for (const u of M.vecinas(s, w)) vecSub[u]++; };
    const sacar = w => { sub.pop(); enSub[w] = 0; for (const u of M.vecinas(s, w)) vecSub[u]--; };

    function extender(ext, v) {
      if (sub.length === k) { out.push(sub.slice()); return; }
      ext = ext.slice();
      while (ext.length) {
        const w = ext.pop();
        // Vecinas «exclusivas» de w: ni en el subconjunto ni tocándolo ya, y de
        // índice mayor que el ancla. Es lo que evita contar dos veces lo mismo.
        const nuevas = [];
        for (const u of M.vecinas(s, w)) if (u > v && dentro[u] && !enSub[u] && !vecSub[u]) nuevas.push(u);
        meter(w);
        extender(ext.concat(nuevas), v);
        sacar(w);
      }
    }

    for (let v = 0; v < n; v++) {
      if (!dentro[v]) continue;
      meter(v);
      extender(M.vecinas(s, v).filter(u => u > v && dentro[u]), v);
      sacar(v);
    }
  }

  // ---------------------------------------------------------------------------
  // Un nivel → un juego para el buscador
  // ---------------------------------------------------------------------------
  // El buscador guarda un estado COMPACTO: { h, step } y el seguimiento del objetivo.
  // Medido en los prototipos: con el estado entero del motor (unos 40 campos) la
  // memoria se acababa hacia los 300.000 estados. Lo demás (forma, celdas rotas,
  // ítems apagados) es igual para todo el nivel y vive en una PLANTILLA, que es de
  // este nivel y de nadie más: se pueden resolver varios niveles a la vez.
  function juegoDeNivel(nivel) {
    const plantilla = estadoPuzle(nivel);
    const o = nivel.objetivo;
    const tipo = OBJ.TIPOS[o.tipo];
    if (!tipo) throw new Error(`objetivo desconocido: ${o.tipo}`);

    // Un estado del motor que se puede consultar (no modificar).
    const vista = e => { plantilla.height = e.h; plantilla.step = e.step; return plantilla; };
    const objetivo = e => tipo.cumplido(e, o);

    function aplicar(e, cells) {
      const cosecha = e.h[cells[0]] === M.MAX_LEVEL;
      // Una regla del puzle (cosechar una roja, la B antes que la A) mata la rama.
      if (tipo.rompe && tipo.rompe(e, o, cells, cosecha)) return null;
      const s = Object.assign({}, plantilla);
      s.height = e.h.slice(); s.step = e.step; s.eventos = []; s.last = null;
      if (!M.commitTurn(s, cells)) throw new Error(`el motor rechaza una jugada que la enumeración dio por buena: ${cells}`);
      const e2 = { h: s.height, step: s.step, ...OBJ.avanzar(e, cells, cosecha) };
      // Si la jugada cumple el objetivo, el nivel acaba ahí aunque el paso siguiente
      // no quepa (LC-Instrucciones §5.52). Si no lo cumple, el fallo mata la rama.
      if (s.last.type === 'fallback') return objetivo(e2) ? e2 : null;
      return e2;
    }

    const huella = e => claveAlturas(e.h) + '|' + e.step + '|' + tipo.clave(e, o);
    const viva = i => M.existe(plantilla, i);

    return {
      inicial: { h: plantilla.height.slice(), step: plantilla.step, ...OBJ.seguimientoInicial(o) },
      jugadas: e => jugadas(vista(e)),
      aplicar, objetivo, huella,
      // Para buscarPrimera (v11.10): antes las jugadas de celdas más altas, que son
      // las que llegan a cosechar. Medido: la peor desviación de C5-10, 1,6 s → 36 ms.
      ordenar: (e, js) => js.sort((a, b) => e.h[b[0]] - e.h[a[0]]),
      poda: (e, quedan) => tipo.poda(e, o, quedan, viva),
    };
  }

  return { estadoPuzle, jugadas, juegoDeNivel, OBJ };
}

if (typeof module !== 'undefined') module.exports = { crearJuego };
