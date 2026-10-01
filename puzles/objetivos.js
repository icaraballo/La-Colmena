// La máquina de puzles (T-46) · los nueve tipos de objetivo (LC-DESIGN §23).
//
// Se carga en Node (require) y también como script clásico en el navegador, para
// que el editor (F2) use estas mismas reglas y no haya una tercera copia: por eso
// no pide el motor por su cuenta, sino que crearObjetivos recibe lo que necesita.
// En la F3 las frases pasan a OBJETIVO_INFO de constants.js.
//
// Mientras se juega se lleva un SEGUIMIENTO del avance, igual para todos los tipos:
//   cos      cosechas hechas            tot      celdas cosechadas en total
//   maxCos   la mayor cosecha           maxPaso  el arrastre más largo
//   pend     celdas marcadas que faltan por cosechar
// y `h`, los niveles actuales de cada celda.
//
// Cada tipo dice:
//   frase(o)                      lo que lee el jugador
//   cumplido(e, o)                ¿está resuelto?
//   rompe(e, o, cells, cosecha)   ¿esta jugada incumple una regla del puzle? (rojas, orden)
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
function crearObjetivos({ MAX_LEVEL, NOMBRE_NIVEL }) {
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
  const nombres = cs => cs.length === 1 ? 'la celda marcada' : `las ${cs.length} celdas marcadas`;

  const TIPOS = {
    marcadas: {
      frase: o => `Cosecha ${nombres(o.celdas)}`,
      cumplido: e => e.pend.length === 0,
      poda: (e, o, q) => pendPoda(e, q),
      clave: e => e.pend.join(','),
    },
    cosechas: {
      frase: o => `Cosecha ${o.n} veces`,
      cumplido: (e, o) => e.cos >= o.n,
      // Una cosecha por turno como mucho, y alguna celda tiene que llegar a tiempo.
      poda: (e, o, q, viva) => { const f = o.n - e.cos; return f > 0 && (f > q || masCerca(e, viva) > q); },
      clave: e => String(e.cos),
    },
    total: {
      frase: o => `Cosecha ${o.n} celdas, las que sean`,
      cumplido: (e, o) => e.tot >= o.n,
      poda: (e, o, q, viva) => e.tot < o.n && (e.tot + cosechableEn(e.step, q) < o.n || masCerca(e, viva) > q),
      clave: e => String(e.tot),
    },
    combinado: {
      frase: o => `Cosecha ${o.n} celdas, incluida ${nombres(o.celdas)}`,
      cumplido: (e, o) => e.tot >= o.n && e.pend.length === 0,
      poda: (e, o, q, viva) => pendPoda(e, q) || TIPOS.total.poda(e, o, q, viva),
      clave: e => e.tot + '|' + e.pend.join(','),
    },
    grande: {
      frase: o => `Cosecha ${o.n} celdas de una vez`,
      cumplido: (e, o) => e.maxCos >= o.n,
      // La cosecha mide lo que el paso: hace falta llegar a un paso de n.
      poda: (e, o, q, viva) => e.maxCos < o.n && (e.step + q - 1 < o.n || masCerca(e, viva) > q),
      clave: (e, o) => e.maxCos >= o.n ? '1' : '0',
    },
    escalera: {
      frase: o => `Encadena hasta arrastrar ${o.n} celdas`,
      cumplido: (e, o) => e.maxPaso >= o.n,
      poda: (e, o, q) => e.maxPaso < o.n && e.step + q - 1 < o.n,
      clave: () => '',
    },
    panal: {
      frase: o => `Deja ${o.celdas.length === 1 ? 'la celda marcada' : `las ${o.celdas.length} marcadas`} en ${NOMBRE_NIVEL[o.nivel]} a la vez`,
      cumplido: (e, o) => o.celdas.every(i => e.h[i] === o.nivel),
      poda: (e, o, q) => o.celdas.some(i => hastaNivel(e.h[i], o.nivel) > q),
      clave: () => '',
    },
    rojas: {
      frase: o => `Cosecha ${nombres(o.celdas)} sin cosechar ninguna roja`,
      cumplido: e => e.pend.length === 0,
      rompe: (e, o, cells, cosecha) => cosecha && cells.some(i => o.rojas.includes(i)),
      poda: (e, o, q) => pendPoda(e, q),
      clave: e => e.pend.join(','),
    },
    orden: {
      frase: () => 'Cosecha la A y después la B (no a la vez)',
      cumplido: e => e.pend.length === 0,
      // Cosechar la B mientras la A sigue pendiente (también en la misma cosecha) rompe.
      rompe: (e, o, cells, cosecha) => cosecha && cells.includes(o.celdas[1]) && e.pend.includes(o.celdas[0]),
      poda: (e, o, q) => pendPoda(e, q),
      clave: e => e.pend.join(','),
    },
  };

  const CON_MARCADAS = ['marcadas', 'combinado', 'rojas', 'orden'];

  function seguimientoInicial(o) {
    return { cos: 0, tot: 0, maxCos: 0, maxPaso: 0, pend: CON_MARCADAS.includes(o.tipo) ? o.celdas.slice() : [] };
  }

  // Lo que cambia el seguimiento al jugar `cells` (cosecha = estaban en abeja).
  // Devuelve un seguimiento nuevo: el de antes no se toca.
  function avanzar(e, cells, cosecha) {
    const L = cells.length;
    const n = { cos: e.cos, tot: e.tot, maxCos: e.maxCos, maxPaso: Math.max(e.maxPaso, L), pend: e.pend };
    if (cosecha) {
      n.cos++; n.tot += L; n.maxCos = Math.max(n.maxCos, L);
      if (n.pend.length) n.pend = n.pend.filter(i => !cells.includes(i));
    }
    return n;
  }

  return { TIPOS, NOMBRES: Object.keys(TIPOS), seguimientoInicial, avanzar, hastaCosecha, hastaNivel };
}

if (typeof module !== 'undefined') module.exports = { crearObjetivos };
