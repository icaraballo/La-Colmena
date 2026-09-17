// Pruebas de las reglas. Se ejecutan con `npm test`.
const T = require('./_bundle.js');

let fallos = 0, total = 0;
function ok(cond, msg) {
  total++;
  if (!cond) { fallos++; console.error('  FALLO · ' + msg); }
}
function eq(a, b, msg) { ok(a === b, `${msg} (esperado ${b}, obtenido ${a})`); }

// --- geometría del tablero ---------------------------------------------------
eq(T.TILE_COUNT, 24, 'el tablero tiene 24 casillas');
eq(T.ADJ.length, 24, 'hay adyacencia para las 24 casillas');

// La tabla escrita a mano debe coincidir con la generada desde las filas.
const gen = T.buildAdjacency(T.ROW_WIDTHS);
ok(JSON.stringify(gen) === JSON.stringify(T.ADJ),
   'la tabla ADJ coincide con la generada desde 4-5-6-5-4');

// Adyacencia simétrica: si A es vecina de B, B lo es de A.
for (let i = 0; i < 24; i++)
  for (const v of T.ADJ[i])
    ok(T.ADJ[v].includes(i), `adyacencia simétrica entre ${i} y ${v}`);

// Ninguna casilla tiene más de 6 vecinos: es una malla hexagonal.
for (let i = 0; i < 24; i++) ok(T.ADJ[i].length <= 6, `la casilla ${i} tiene <= 6 vecinos`);

// La espiral del vórtice recorre las 24 casillas exactamente una vez.
eq(new Set(T.SPIRAL).size, 24, 'la espiral no repite casillas');

// --- puntuación --------------------------------------------------------------
eq(T.bonusMultiplier(1), 2,  'bonus de paso 1');
eq(T.bonusMultiplier(5), 2,  'bonus de paso 5');
eq(T.bonusMultiplier(6), 3,  'bonus de paso 6 (el primer escalón de bonus)');
eq(T.bonusMultiplier(24), 14, 'bonus del tablero entero de una pasada');

// --- validación del arrastre -------------------------------------------------
let s = T.createState();
eq(T.biggestCoherentArea(s), 24, 'el tablero inicial es una sola meseta de 24');

ok(T.isValidDrag(s, [0]), 'una casilla suelta vale cuando el paso es 1');
ok(!T.isValidDrag(s, [0, 1]), 'dos casillas no valen cuando el paso es 1');

s.step = 2;
ok(T.isValidDrag(s, [0, 1]), 'dos casillas contiguas valen cuando el paso es 2');
ok(!T.isValidDrag(s, [0, 2]), 'dos casillas NO contiguas no valen');
ok(!T.isValidDrag(s, [0, 0]), 'no se puede repetir casilla');

// --- homogeneidad ------------------------------------------------------------
s = T.createState();
T.commitTurn(s, [0]);                       // la casilla 0 sube a nivel 2
eq(s.height[0], 2, 'la casilla arrastrada sube un nivel');
eq(s.step, 2, 'el paso exigido crece a 2');
ok(!T.isValidDrag(s, [0, 1]), 'no se puede arrastrar entre alturas distintas');
ok(T.isValidDrag(s, [1, 2]), 'sí se puede arrastrar sobre dos casillas de nivel 1');

// --- una jugada inválida no gasta turno --------------------------------------
const turnoAntes = s.turn;
ok(!T.commitTurn(s, [0, 1]), 'la jugada inválida se rechaza');
eq(s.turn, turnoAntes, 'la jugada inválida no consume turno');

// --- cosecha -----------------------------------------------------------------
s = T.createState();
s.step = 1;
for (let n = 0; n < 5; n++) { s.step = 1; T.commitTurn(s, [0]); }
eq(s.height[0], T.MAX_LEVEL, 'cinco subidas llevan la casilla al nivel máximo');

s.step = 1;
const puntosAntes = s.score;
ok(T.commitTurn(s, [0]), 'arrastrar sobre el nivel máximo es una jugada válida');
eq(s.height[0], T.BASE_LEVEL, 'la cosecha devuelve la casilla al nivel base');
eq(s.streak, 1, 'la cosecha incrementa la racha');
ok(s.score > puntosAntes, 'la cosecha puntúa');

// La meseta de nivel máximo cuenta como región jugable: si no, el juego
// declararía muerto al jugador ignorando cosechas disponibles.
s = T.createState();
for (let i = 0; i < 24; i++) s.height[i] = T.MAX_LEVEL;
eq(T.biggestCoherentArea(s), 24, 'una meseta de nivel máximo cuenta como región');

// --- fallo y vórtice ---------------------------------------------------------
s = T.createState();
s.height[0] = 3;                            // una casilla aislada a otra altura
s.step = 24;                                // imposible: no hay meseta de 24
T.commitTurn(s, [0]);                       // jugada inválida, no cambia nada
eq(s.step, 24, 'una jugada inválida no dispara el fallo');

// Se deja un tablero con sólo dos casillas vivas y contiguas: tras subirlas,
// el paso pide 3 y ya no cabe en ninguna parte.
s = T.createState();
for (let i = 2; i < 24; i++) { s.alive[i] = 0; s.height[i] = T.DEAD_LEVEL; }
s.step = 2;
ok(T.commitTurn(s, [0, 1]), 'la jugada se comete');
eq(s.step, 1, 'al no caber el siguiente paso, el paso vuelve a 1');
eq(s.streak, 0, 'al fallar se pierde la racha');
eq(T.tilesAlive(s), 1, 'el vórtice se come una casilla viva al fallar');

// --- fin de partida ----------------------------------------------------------
s = T.createState();
for (let n = 0; n < 24; n++) T.fallback(s);
ok(s.gameOver, 'cuando el vórtice se come las 24 casillas, se acaba la partida');

console.log(fallos === 0
  ? `OK · ${total} comprobaciones`
  : `${fallos} FALLOS de ${total} comprobaciones`);
process.exit(fallos === 0 ? 0 : 1);
