// La máquina de puzles (T-46) · el comprobador: la segunda llave.
//
// Rejuega la solución de un candidato en un estado NUEVO del motor, sin pasar por
// el buscador ni por objetivos.js: los objetivos se comprueban aquí con código
// escrito aparte. Si algo del resolutor estuviera mal, aquí saltaría.
//
// Comprueba: cada jugada válida (isValidDrag), las reglas del puzle (rojas, orden),
// que no falle antes de acabar, que no salga ningún ítem, que el objetivo NO se
// cumpla antes de la última jugada (si se cumpliera, el mínimo estaría mal), que
// se cumpla al final y que la solución mida el mínimo.
const { M, estadoPuzle } = require('./motor.js');

// Una partida de puzle jugada con el motor, con su propio seguimiento. La usan
// comprobar() y la segunda opinión sobre el mínimo de pruebas.js.
function partidaAparte(nivel) {
  const o = nivel.objetivo;
  const s = estadoPuzle(nivel);
  const cosechadas = new Set();
  let cos = 0, tot = 0, maxCos = 0, maxPaso = 0;
  const todas = cs => cs.every(i => cosechadas.has(i));

  function cumplido() {
    switch (o.tipo) {
      case 'marcadas': case 'rojas': case 'orden': return todas(o.celdas);
      case 'cosechas':  return cos >= o.n;
      case 'total':     return tot >= o.n;
      case 'combinado': return tot >= o.n && todas(o.celdas);
      case 'grande':    return maxCos >= o.n;
      case 'escalera':  return maxPaso >= o.n;
      case 'panal':     return o.celdas.every(i => s.height[i] === o.nivel);
      default: throw new Error(`objetivo desconocido: ${o.tipo}`);
    }
  }

  // Juega una jugada. Devuelve null si va bien, o por qué pierde.
  function jugar(cells) {
    if (!M.isValidDrag(s, cells)) return 'jugada inválida';
    const cosecha = s.height[cells[0]] === M.MAX_LEVEL;
    if (cosecha && o.tipo === 'rojas' && cells.some(i => o.rojas.includes(i))) return 'cosecha una roja';
    if (cosecha && o.tipo === 'orden' && cells.includes(o.celdas[1]) && !cosechadas.has(o.celdas[0]))
      return 'cosecha la B antes que la A';
    maxPaso = Math.max(maxPaso, cells.length);
    if (cosecha) {
      cos++; tot += cells.length; maxCos = Math.max(maxCos, cells.length);
      cells.forEach(i => cosechadas.add(i));
    }
    M.commitTurn(s, cells);
    if (s.item) return 'ha salido un ítem';
    if (s.last.type === 'fallback' && !cumplido()) return 'falla';
    return null;
  }

  return { s, jugar, cumplido };
}

function comprobar(c) {
  const { nivel, solucion, minimo } = c;
  if (solucion.length !== minimo) return 'la solución no mide el mínimo';
  const p = partidaAparte(nivel);
  for (let k = 0; k < solucion.length; k++) {
    const mal = p.jugar(solucion[k]);
    if (mal) return `${mal} en la jugada ${k + 1}`;
    if (k < solucion.length - 1 && p.cumplido()) return 'se cumple antes de acabar (el mínimo estaría mal)';
  }
  return p.cumplido() ? 'ok' : 'no cumple el objetivo';
}

module.exports = { comprobar, partidaAparte };
