// Banco de pruebas: carga las reglas del juego en Node.
//
// Concatena en UN solo ámbito los ficheros que no tocan el DOM, igual que hace
// el navegador (son scripts clásicos, no módulos). Ojo: los `const`/`let` de
// nivel raíz NO se cuelgan del objeto global en un contexto `vm`, así que el
// footer tiene que exponer uno a uno los nombres que se quieran usar. Si se
// olvida uno, sale `undefined` y las comprobaciones pasan por vacías en vez de
// por correctas.
const fs = require('fs'), vm = require('vm'), path = require('path');

// El motor, el bot tonto (v9: vive en js/ porque lo usa el panal del inicio),
// el guardado (v9.1: sólo convierte y valida, no toca localStorage)
// y desde la v7 también input.js: al cargarse sólo declara funciones
// (el DOM lo toca initInput, que aquí nadie llama), y así pasoDeCadena, la
// lógica del arrastre, se puede probar. render.js y app.js necesitan canvas y DOM.
// Desde la v11 también puzles.js: los niveles del modo Puzzle (sólo datos).
const FILES = ['constants.js', 'state.js', 'bot-tonto.js', 'guardado.js', 'input.js', 'puzles.js'];

const src = FILES
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
  .join('\n');

const FOOTER = `
  ({ ROW_WIDTHS, TILE_COUNT, ADJ, SPIRAL, bonusMultiplier, buildAdjacency,
     AGUA, CERA, HUEVO, LARVA, OPERCULADA, MAX_LEVEL, ARRANQUE,
     MODOS, CONFIG_MODO, HELADA_CADA, ITEM_THRESHOLDS, ITEMS, segundosCosecha,
     ROTAS_ARRANQUE, COSECHA_DEVUELVE, COSECHA_GRANDE, umbralItem,
     PROPOLEO_MIN_AGUA, itemsUtiles, HELADA_MUERDE, RELOJ_ACELERA, ITEM_TURNOS,
     DESASTRE_INFO, DESASTRES_VISIBLES, caducarItem, ITEM_CALMA,
     RELOJ_INICIAL, RELOJ_TECHO, PUNTOS_POR_SEGUNDO, SEDA_TURNOS, CALMA_TRAS_VELUTINA, VELUTINA_CELDAS,
     createState, isValidDrag, biggestCoherentArea, commitTurn, fallback, tilesPlayable,
     jugable, spawnItemIfEarned, usarItem, sumarTiempo, velocidadReloj, tick,
     siguienteDesastre, mesetaDeNivel, ESCALERA_TOPE, COSECHA_LIMPIA, DESASTRES_MAX_ACTIVOS, ITEM_INFO, ITEMS_VISIBLES, pasoDeCadena,
     rng, shuffled, buscarJugada, elegirJugada,
     serializarPartida, restaurarPartida, GUARDADO_VERSION,
     TABLEROS, vecinas, existe,
     CONTAGIO_CADA, TURNOS_CONTAGIO, HUELLA_RESTA, NIVELES_CONTAGIABLES, celdasMarcadas,
     penalizacionHuellas, contagioInminente, turnosRestantes, contagiar, marcada,
     CERRADAS_EXPANSION, ARRANQUE_EXPANSION, TOPE_EXPANSION, ABRE_COSECHA_PEQUENA,
     celdasQueGana, celdasQueAbriria, abiertas, peldanosQueBaja,
     ABRE_EXPANSION, abreDesde, tieneDificultad,
     PUZZLE_MARGEN, PUZZLE_ABIERTOS, PUZZLE_ABRE_CAPITULO, OBJETIVO_INFO, NOMBRE_MODO, FRASE_MODO, COLOR_MODO,
     crearPuzle, seguimientoPuzle, avanzarPuzle, cumplidoPuzle, rompePuzle, estrellasPuzle,
     objetivoPuzle, progresoPuzle, abiertosPuzzle, PUZLES_VERSION, CAPITULOS, PUZLES,
     PROGRESO_PUZZLE_VERSION, progresoPuzzleVacio, leerProgresoPuzzle, apuntarPuzzle })
`;

module.exports = vm.runInNewContext(src + FOOTER, {});
