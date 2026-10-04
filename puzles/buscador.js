// La máquina de puzles (T-46) · el buscador genérico.
//
// No sabe nada de hexágonos, niveles ni abejas (LC-Instrucciones §5.63): sirve para
// cualquier problema de «llegar a un objetivo en el menor número de pasos». Recibe
// un «juego» con estas piezas:
//
//   inicial            el estado de partida
//   jugadas(e)         todas las jugadas posibles desde e
//   aplicar(e, j)      el estado nuevo, o null si la jugada lleva a rama muerta
//   objetivo(e)        ¿está resuelto?
//   huella(e)          un texto que identifica el estado: dos caminos que llegan a
//                      la misma huella se tratan como uno (se suman, no se repiten)
//   poda(e, quedan)    opcional: true si desde e es IMPOSIBLE resolver en `quedan`
//
// Busca POR CAPAS: la capa d son todos los estados distintos a los que se llega en
// d jugadas. La primera capa que contiene un estado resuelto da el MÍNIMO, y está
// demostrado: si hubiera una solución más corta, habría salido en una capa anterior.
//
// Además cuenta cuántos CAMINOS llegan a cada estado, así que sabe cuántas
// secuencias de jugadas resuelven el problema en el mínimo sin recorrerlas.
//
// Con presupuesto (maxEstados, maxMs) puede quedarse sin terminar: entonces
// devuelve `agotado: true`, que quiere decir «no lo sé», no «no tiene solución».
function buscar(juego, { maxProf = 12, maxEstados = 2e6, maxMs = 60000 } = {}) {
  const t0 = Date.now();
  const stats = { estados: 1, jugadas: 0, podados: 0, muertas: 0, capas: [] };
  const fin = r => Object.assign(r, { ms: Date.now() - t0, stats });
  // Cada capa guarda, por huella: el estado, cuántos caminos llegan, y de dónde
  // viene uno de ellos (para reconstruir una solución al final).
  let capa = new Map([[juego.huella(juego.inicial), { e: juego.inicial, caminos: 1, padre: null, jugada: null }]]);
  const historia = [capa];

  for (let d = 0; ; d++) {
    stats.capas.push(capa.size);

    let caminos = 0, finales = 0, primera = null;
    for (const [h, n] of capa) if (juego.objetivo(n.e)) { caminos += n.caminos; finales++; primera = primera ?? h; }
    if (finales)
      return fin({ resuelto: true, minimo: d, caminos, finales, solucion: reconstruir(historia, primera) });
    if (d === maxProf) return fin({ resuelto: false, motivo: `sin solución en ${maxProf}` });

    // La capa siguiente.
    const sig = new Map();
    const quedan = maxProf - d;
    for (const [h, n] of capa) {
      if (juego.poda && juego.poda(n.e, quedan)) { stats.podados++; continue; }
      for (const j of juego.jugadas(n.e)) {
        stats.jugadas++;
        const e2 = juego.aplicar(n.e, j);
        if (!e2) { stats.muertas++; continue; }
        const h2 = juego.huella(e2);
        const ya = sig.get(h2);
        if (ya) { ya.caminos += n.caminos; continue; }
        sig.set(h2, { e: e2, caminos: n.caminos, padre: h, jugada: j });
        if (++stats.estados > maxEstados) return fin({ resuelto: false, agotado: true, motivo: 'demasiados estados' });
        if ((stats.estados & 1023) === 0 && Date.now() - t0 > maxMs)
          return fin({ resuelto: false, agotado: true, motivo: 'demasiado tiempo' });
      }
    }
    // De las capas viejas sólo hace falta el rastro, no los estados: se sueltan.
    for (const n of capa.values()) n.e = null;
    if (!sig.size) return fin({ resuelto: false, motivo: `todas las ramas mueren en la jugada ${d + 1}` });
    capa = sig;
    historia.push(capa);
  }
}

// La primera jugada que resuelve en `maxProf` o menos, sin buscar el mínimo (v11.10,
// T-54: la pista de Puzzle). En profundidad, con memoria de los estados que ya
// fallaron y con cuántas jugadas les quedaban: un estado que falló con q jugadas no
// se vuelve a mirar con q o menos. Para la pista no hace falta la solución más corta,
// sino una que llegue a tiempo, y por capas había que recorrer cada capa entera
// (medido el 04-10: las 998 desviaciones del turno 1 de los 75 niveles, 104 s por
// capas y 7 s así; la peor, 19,6 s y 2,7 s).
// Si el juego trae `ordenar(e, jugadas)`, prueba primero las que pone delante.
// Devuelve como buscar: { resuelto, solucion: [la primera jugada] } o
// { resuelto: false, agotado? }, con ms y stats.
function buscarPrimera(juego, { maxProf = 12, maxMs = 60000 } = {}) {
  const t0 = Date.now();
  const stats = { estados: 0, podados: 0 };
  const fallo = new Map();
  let agotado = false;
  function probar(e, quedan) {
    if (quedan === 0) return null;
    if (juego.poda && juego.poda(e, quedan)) { stats.podados++; return null; }
    const h = juego.huella(e);
    const f = fallo.get(h);
    if (f !== undefined && f >= quedan) return null;
    const js = juego.jugadas(e);
    if (juego.ordenar) juego.ordenar(e, js);
    for (const j of js) {
      const e2 = juego.aplicar(e, j);
      if (!e2) continue;
      if (juego.objetivo(e2)) return j;
      // El reloj, cada 256 estados: en el móvil, con 1024 se pasaba del tope más de 1 s.
      if ((++stats.estados & 255) === 0 && Date.now() - t0 > maxMs) { agotado = true; return null; }
      if (probar(e2, quedan - 1) !== null) return j;
      if (agotado) return null;
    }
    fallo.set(h, quedan);
    return null;
  }
  const fin = r => Object.assign(r, { ms: Date.now() - t0, stats });
  if (juego.objetivo(juego.inicial)) return fin({ resuelto: true, solucion: [] });
  const j = probar(juego.inicial, maxProf);
  if (j !== null) return fin({ resuelto: true, solucion: [j] });
  return fin(agotado ? { resuelto: false, agotado: true, motivo: 'demasiado tiempo' } : { resuelto: false, motivo: `sin solución en ${maxProf}` });
}

// Sigue el rastro de padres desde el estado resuelto hasta el principio.
function reconstruir(historia, h) {
  const jugadas = [];
  for (let d = historia.length - 1; d > 0; d--) {
    const n = historia[d].get(h);
    jugadas.push(n.jugada);
    h = n.padre;
  }
  return jugadas.reverse();
}

if (typeof module !== 'undefined') module.exports = { buscar, buscarPrimera };
