// La pista de Puzzle (v11.10, T-54, LC-Instrucciones §5.98).
//
// «Desde donde estás»: mira el panal de ahora y dice la siguiente jugada que gana
// o, si ya no se gana, hasta qué turno hay que deshacer. Sin DOM ni localStorage:
// la interfaz (app.js) le da el camino y pinta lo que devuelve.
//
// Usa el resolutor de la máquina tal cual (puzles/buscador.js y puzles/juego.js,
// cargados también en el navegador): no hay otra copia de ninguna regla. Busca con
// buscarPrimera (la primera jugada que gana a tiempo, no la más corta). Medido el
// 04-10 en los 75 niveles (LC-Balance-y-Mediciones § Puzles): desde la solución
// guardada no hace falta buscar; fuera de ella (las 998 desviaciones del turno 1),
// mediana 0 ms, p99 81 ms y la peor 2,7 s en el PC, sólo en C2-09 (en el móvil, de
// 3 a 5 veces más). Si no le da tiempo (maxMs), lo aproximado: (c) de §5.98.

// Las funciones del motor que piden puzles/objetivos.js y puzles/juego.js. En el
// navegador y en los tests son las globales de state.js y constants.js.
function motorDelJuego() {
  return { createState, commitTurn, jugable, existe, vecinas, TABLEROS, MODOS, AGUA, MAX_LEVEL,
           OBJETIVO_INFO, seguimientoPuzle, avanzarPuzle, cumplidoPuzle, rompePuzle };
}

// Un estado del juego en la forma del buscador: los niveles, el paso y el
// seguimiento del objetivo (el mismo en el motor y en la máquina).
const estadoBuscador = s => ({ h: s.height.slice(), step: s.step, ...s.puzle.seg });

// `nivel` de js/puzles.js; `juego` = juegoDeNivel(nivel); `buscar`, buscarPrimera;
// `camino` = los estados del turno 0 al de ahora (estadoBuscador); `limite`, el del
// nivel. Devuelve:
//   { tipo: 'jugada', jugada }          la siguiente jugada que gana
//   { tipo: 'deshaz', turno }           ya no se gana: desde `turno` sí
//   { tipo: 'deshaz', turno, aproximada: true }   no dio tiempo a saberlo (maxMs):
//                                       el último turno en la solución guardada
// Siguiendo la solución guardada no busca: la siguiente es la suya (§5.98, gratis).
function pistaPuzle({ nivel, juego, buscar, camino, limite, maxMs = 3000 }) {
  const t0 = Date.now();
  // Los estados de la solución guardada, para saber si sigues en ella.
  const esperados = [juego.inicial];
  for (const j of nivel.solucion) {
    const e = juego.aplicar(esperados[esperados.length - 1], j);
    if (!e) break;
    esperados.push(e);
  }
  const enLaSolucion = k => k < nivel.solucion.length && !!esperados[k] && juego.huella(esperados[k]) === juego.huella(camino[k]);

  // ¿Se gana desde el turno k? { jugada } | null (no) | { agotado } (no se sabe).
  function ganaDesde(k) {
    if (enLaSolucion(k)) return { jugada: nivel.solucion[k] };
    const quedan = limite - k;
    if (quedan <= 0) return null;
    const r = buscar({ ...juego, inicial: camino[k] },
      { maxProf: quedan, maxMs: Math.max(1, maxMs - (Date.now() - t0)) });
    if (r.resuelto) return { jugada: r.solucion[0] };
    return r.agotado ? { agotado: true } : null;
  }
  // El último turno en la solución guardada: hasta ahí, seguro que se gana.
  const ultimoEnLaSolucion = () => { let k = camino.length - 1; while (k > 0 && !enLaSolucion(k)) k--; return k; };

  const t = camino.length - 1;
  const aqui = ganaDesde(t);
  if (aqui && aqui.jugada) return { tipo: 'jugada', jugada: aqui.jugada };
  if (aqui && aqui.agotado) return { tipo: 'deshaz', turno: ultimoEnLaSolucion(), aproximada: true };
  for (let k = t - 1; k >= 0; k--) {
    const r = ganaDesde(k);
    if (r && r.jugada) return { tipo: 'deshaz', turno: k };
    if (r && r.agotado) return { tipo: 'deshaz', turno: ultimoEnLaSolucion(), aproximada: true };
  }
  return { tipo: 'deshaz', turno: 0 };
}
