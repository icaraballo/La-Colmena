// Banco de pruebas: carga las reglas del juego en Node.
//
// Concatena en UN solo ámbito los ficheros que no tocan el DOM, igual que hace
// el navegador (son scripts clásicos, no módulos). Ojo: los `const`/`let` de
// nivel raíz NO se cuelgan del objeto global en un contexto `vm`, así que el
// footer tiene que exponer uno a uno los nombres que se quieran usar. Si se
// olvida uno, sale `undefined` y las comprobaciones pasan por vacías en vez de
// por correctas.
const fs = require('fs'), vm = require('vm'), path = require('path');

// Sólo el motor: render.js, input.js y app.js necesitan canvas y DOM.
const FILES = ['constants.js', 'state.js'];

const src = FILES
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
  .join('\n');

const FOOTER = `
  ({ ROW_WIDTHS, TILE_COUNT, ADJ, SPIRAL, bonusMultiplier, buildAdjacency,
     AGUA, CERA, HUEVO, LARVA, OPERCULADA, MAX_LEVEL, ARRANQUE,
     MODOS, CONFIG_MODO, HELADA_CADA, ITEM_THRESHOLDS, ITEMS, segundosCosecha,
     ROTAS_ARRANQUE, COSECHA_DEVUELVE, COSECHA_GRANDE, umbralItem,
     PROPOLEO_MIN_AGUA, itemsUtiles, HELADA_MUERDE, RELOJ_ACELERA, ITEM_TURNOS,
     DESASTRE_INFO, DESASTRES_VISIBLES, caducarItem, ITEM_CALMA, ITEM_TURNOS,
     RELOJ_INICIAL, RELOJ_TECHO, PUNTOS_POR_SEGUNDO, SEDA_TURNOS, CALMA_TRAS_VELUTINA,
     createState, isValidDrag, biggestCoherentArea, commitTurn, fallback, tilesPlayable,
     jugable, spawnItemIfEarned, usarItem, sumarTiempo, velocidadReloj, tick })
`;

module.exports = vm.runInNewContext(src + FOOTER, {});
