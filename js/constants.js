// Constantes del tablero y de la puntuación.
//
// El tablero son 24 hexágonos en filas de 4-5-6-5-4, indexados 0..23 por filas:
//
//         0   1   2   3          fila 0  (4)
//       4   5   6   7   8        fila 1  (5)
//     9  10  11  12  13  14      fila 2  (6)
//      15  16  17  18  19        fila 3  (5)
//        20  21  22  23          fila 4  (4)
//
// Nombres neutros a propósito: este juego todavía no tiene tema, y cuando lo
// tenga sólo debe cambiar la capa de dibujo. Nada de nombres del juego original.

const ROW_WIDTHS = [4, 5, 6, 5, 4];
const TILE_COUNT = 24;

// Escalera de alturas. 0 = casilla muerta (devorada), 1 = base, 6 = cosechable.
const DEAD_LEVEL = 0;
const BASE_LEVEL = 1;
const MAX_LEVEL = 6;

// Adyacencia precalculada. Verificada contra las máscaras de distancia al borde
// del binario original: coincidencia exacta. Se usa tabla en vez de aritmética
// de índices porque es más rápida, exacta y testeable.
const ADJ = [
  /*  0 */ [1, 4, 5],
  /*  1 */ [0, 2, 5, 6],
  /*  2 */ [1, 3, 6, 7],
  /*  3 */ [2, 7, 8],
  /*  4 */ [0, 5, 9, 10],
  /*  5 */ [0, 1, 4, 6, 10, 11],
  /*  6 */ [1, 2, 5, 7, 11, 12],
  /*  7 */ [2, 3, 6, 8, 12, 13],
  /*  8 */ [3, 7, 13, 14],
  /*  9 */ [4, 10, 15],
  /* 10 */ [4, 5, 9, 11, 15, 16],
  /* 11 */ [5, 6, 10, 12, 16, 17],
  /* 12 */ [6, 7, 11, 13, 17, 18],
  /* 13 */ [7, 8, 12, 14, 18, 19],
  /* 14 */ [8, 13, 19],
  /* 15 */ [9, 10, 16, 20],
  /* 16 */ [10, 11, 15, 17, 20, 21],
  /* 17 */ [11, 12, 16, 18, 21, 22],
  /* 18 */ [12, 13, 17, 19, 22, 23],
  /* 19 */ [13, 14, 18, 23],
  /* 20 */ [15, 16, 21],
  /* 21 */ [16, 17, 20, 22],
  /* 22 */ [17, 18, 21, 23],
  /* 23 */ [18, 19, 22],
];

// Orden en espiral de fuera hacia dentro en que el vórtice devora el tablero.
// Es el array RING_TILES del original, verificado.
const SPIRAL = [23, 19, 14, 8, 3, 2, 1, 0, 4, 9, 15, 20, 21, 22,
                18, 13, 7, 6, 5, 10, 16, 17, 12, 11];

// Multiplicador por longitud del paso. Tabla del original, desensamblada.
// L=24 (el tablero entero de una pasada) es el techo teórico: x14.
function bonusMultiplier(L) {
  if (L <= 5) return 2;
  if (L <= 7) return 3;
  if (L <= 9) return 4;
  if (L <= 11) return 5;
  if (L <= 13) return 6;
  if (L <= 15) return 7;
  if (L <= 17) return 8;
  if (L <= 19) return 9;
  if (L <= 24) return L - 10;
  return 0;
}

// Genera la adyacencia para cualquier tamaño de tablero. No se usa en juego:
// existe para que los tests comprueben que la tabla ADJ de arriba es correcta,
// y por si algún día se prueba otro tamaño de tablero.
function buildAdjacency(rowWidths) {
  const start = []; let s = 0;
  for (const w of rowWidths) { start.push(s); s += w; }
  const adj = Array.from({ length: s }, () => new Set());
  const idx = (r, c) => start[r] + c;
  const link = (a, b) => { adj[a].add(b); adj[b].add(a); };
  rowWidths.forEach((w, r) => {
    for (let c = 0; c < w; c++) {
      if (c + 1 < w) link(idx(r, c), idx(r, c + 1));
      if (r + 1 < rowWidths.length) {
        const w2 = rowWidths[r + 1];
        for (const c2 of (w2 > w ? [c, c + 1] : [c - 1, c]))
          if (c2 >= 0 && c2 < w2) link(idx(r, c), idx(r + 1, c2));
      }
    }
  });
  return adj.map(x => [...x].sort((a, b) => a - b));
}
