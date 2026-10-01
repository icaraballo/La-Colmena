// La máquina de puzles (T-46) · el motor del juego, cargado en Node.
//
// Igual que tests/_bundle.js: los ficheros del juego son scripts clásicos, así que
// se concatenan en un solo ámbito y se exponen los nombres que hacen falta. No se
// copia ni una regla: si el juego cambia, la máquina juega con las reglas nuevas.
//
// Medido en los prototipos (LC-Balance-y-Mediciones § Puzles): tests/_bundle.js
// usa vm.runInNewContext y ahí el motor corre unas 20 veces más lento
// (biggestCoherentArea: 47 µs contra 2 µs), porque en un contexto nuevo cada
// nombre de nivel raíz se busca en un objeto global aparte. Envolviendo el código
// en una función, los nombres son variables locales y V8 lo optimiza. Para la
// máquina es la diferencia entre poder resolver y no poder.
const fs = require('fs'), vm = require('vm'), path = require('path');

// bot-tonto.js aporta `rng`, el mismo azar reproducible que usa el bot.
const FILES = ['constants.js', 'state.js', 'bot-tonto.js'];
const src = FILES
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
  .join('\n');

const M = vm.runInThisContext('(function () {\n' + src + `
  return { createState, commitTurn, isValidDrag, jugable, existe, vecinas, rng,
           TABLEROS, MODOS, AGUA, MAX_LEVEL, NOMBRE_NIVEL, CERRADAS_EXPANSION,
           OBJETIVO_INFO, PUZZLE_MARGEN, crearPuzle, seguimientoPuzle, avanzarPuzle,
           cumplidoPuzle, rompePuzle, estrellasPuzle };
})`, { filename: 'motor-colmena.js' })();

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

// Un azar reproducible a partir de una semilla: el `rng` del juego, con dos ayudas.
function azar(semilla) {
  const R = M.rng(semilla);
  const int = n => Math.floor(R() * n);
  return { R, int, elegir: arr => arr[int(arr.length)] };
}

// Mezcla dos números en una semilla nueva (la de cada intento sale de la del lote
// y del número de intento). Es el paso final de murmurhash3: cambia todos los bits.
function mezclar(a, b) {
  let h = (Math.imul(a >>> 0, 0x9e3779b1) ^ (b >>> 0)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) || 1;
}

module.exports = { M, estadoPuzle, azar, mezclar };
