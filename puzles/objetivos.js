// La máquina de puzles (T-46) · los nueve tipos de objetivo (LC-DESIGN §23).
//
// Desde la v11 las REGLAS de los objetivos están en el motor (state.js §17:
// seguimientoPuzle, avanzarPuzle, cumplidoPuzle, rompePuzle) y las frases en
// constants.js (OBJETIVO_INFO): el juego, la máquina y el editor usan las mismas.
// Aquí sólo queda lo que es de la búsqueda: la poda y la clave.
//
// Se carga en Node (require) y también como script clásico en el navegador (el
// editor), así que no pide el motor por su cuenta: crearObjetivos lo recibe.
//
// El seguimiento lleva cos, tot, maxCos, maxPaso y pend, y el buscador le añade
// `h` (los niveles) y `step`. Cada tipo dice:
//   frase(o)                      lo que lee el jugador (de OBJETIVO_INFO)
//   cumplido(e, o)                ¿está resuelto? (cumplidoPuzle del motor)
//   rompe(e, o, cells, cosecha)   ¿esta jugada incumple una regla? (rompePuzle)
//   poda(e, o, quedan, viva)      ¿es IMPOSIBLE cumplirlo en los turnos que quedan?
//   clave(e, o)                   qué parte del seguimiento distingue un estado de otro
//
// La poda nunca puede cortar una rama buena: sólo corta cuando es imposible,
// contando por lo alto. Si corta de menos, la búsqueda va más lenta; si cortara de
// más, el mínimo saldría mal (pruebas.js compara con y sin poda).
//
// La clave sólo lleva lo que importa al tipo: meter campos que no importan (p. ej.
// `tot` en un objetivo de marcadas) separaría estados iguales y haría la búsqueda
// más lenta.
function crearObjetivos(M) {
  const { MAX_LEVEL, OBJETIVO_INFO, seguimientoPuzle, avanzarPuzle, cumplidoPuzle, rompePuzle } = M;
  const ABEJA = MAX_LEVEL;
  // Turnos para cosechar una celda de nivel h: subirla a abeja y cosecharla.
  const hastaCosecha = h => ABEJA - h + 1;
  // Turnos para que una celda de nivel h llegue a x (cosechando si hace falta).
  const hastaNivel = (h, x) => h <= x ? x - h : (ABEJA - h) + 1 + x;
  // La celda viva más cerca de cosecharse.
  function masCerca(e, viva) {
    let m = Infinity;
    for (let i = 0; i < e.h.length; i++) if (viva(i)) m = Math.min(m, hastaCosecha(e.h[i]));
    return m;
  }
  // Cuántas celdas se pueden cosechar como mucho en q turnos: una cosecha por
  // turno, del tamaño del paso, que crece de uno en uno.
  const cosechableEn = (step, q) => q * step + q * (q - 1) / 2;
  const pendPoda = (e, q) => e.pend.some(i => hastaCosecha(e.h[i]) > q);

  // Lo de cada tipo: la poda y la clave.
  const BUSQUEDA = {
    marcadas:  { poda: (e, o, q) => pendPoda(e, q), clave: e => e.pend.join(',') },
    // Una cosecha por turno como mucho, y alguna celda tiene que llegar a tiempo.
    cosechas:  { poda: (e, o, q, viva) => { const f = o.n - e.cos; return f > 0 && (f > q || masCerca(e, viva) > q); },
                 clave: e => String(e.cos) },
    total:     { poda: (e, o, q, viva) => e.tot < o.n && (e.tot + cosechableEn(e.step, q) < o.n || masCerca(e, viva) > q),
                 clave: e => String(e.tot) },
    combinado: { poda: (e, o, q, viva) => pendPoda(e, q) || BUSQUEDA.total.poda(e, o, q, viva),
                 clave: e => e.tot + '|' + e.pend.join(',') },
    // La cosecha mide lo que el paso: hace falta llegar a un paso de n.
    grande:    { poda: (e, o, q, viva) => e.maxCos < o.n && (e.step + q - 1 < o.n || masCerca(e, viva) > q),
                 clave: (e, o) => e.maxCos >= o.n ? '1' : '0' },
    escalera:  { poda: (e, o, q) => e.maxPaso < o.n && e.step + q - 1 < o.n, clave: () => '' },
    panal:     { poda: (e, o, q) => o.celdas.some(i => hastaNivel(e.h[i], o.nivel) > q), clave: () => '' },
    rojas:     { poda: (e, o, q) => pendPoda(e, q), clave: e => e.pend.join(',') },
    orden:     { poda: (e, o, q) => pendPoda(e, q), clave: e => e.pend.join(',') },
  };

  const TIPOS = {};
  for (const [tipo, b] of Object.entries(BUSQUEDA)) TIPOS[tipo] = {
    frase: o => OBJETIVO_INFO[tipo].frase(o),
    cumplido: (e, o) => cumplidoPuzle(e, e.h, o),
    rompe: (e, o, cells, cosecha) => rompePuzle(e, o, cells, cosecha) !== null,
    poda: b.poda, clave: b.clave,
  };

  return { TIPOS, NOMBRES: Object.keys(TIPOS), seguimientoInicial: seguimientoPuzle, avanzar: avanzarPuzle, hastaCosecha, hastaNivel };
}

if (typeof module !== 'undefined') module.exports = { crearObjetivos };
