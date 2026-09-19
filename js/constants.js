// Constantes del tablero, de los modos y de la puntuación. Ver DESIGN.md en el vault.
//
// El tablero es un panal de 24 celdas en filas de 4-5-6-5-4, indexadas 0..23 por filas:
//
//         0   1   2   3          fila 0  (4)
//       4   5   6   7   8        fila 1  (5)
//     9  10  11  12  13  14      fila 2  (6)
//      15  16  17  18  19        fila 3  (5)
//        20  21  22  23          fila 4  (4)
//
// Los nombres son los del tema propio (la colmena). Nunca los del juego original.

const ROW_WIDTHS = [4, 5, 6, 5, 4];
const TILE_COUNT = 24;

// La escalera: el ciclo de cría de una abeja, con el AGUA debajo. El agua es un
// escalón más: se arrastra como cualquier nivel y sube a cera (como el agua del
// original, que subía a arena). Las celdas ROTAS no están en la escalera: van en
// s.roto[], son irreversibles y desaparecen del panal (ver state.js).
const AGUA       = 0;   // celda vacía: JUGABLE, sube a cera
const CERA       = 1;
const HUEVO      = 2;
const LARVA      = 3;
const OPERCULADA = 4;
const MAX_LEVEL  = 5;   // abeja lista: se cosecha

const NOMBRE_NIVEL = ['agua', 'cera', 'huevo', 'larva', 'operculada', 'abeja'];

// Cupos del arranque: siempre los mismos, en posiciones al azar (DESIGN §2).
// El agua es jugable: la partida no la hace finita el arranque sino la helada,
// que rompe celdas para siempre.
const ARRANQUE = [
  { nivel: AGUA,  casillas: 12 },
  { nivel: CERA,  casillas: 8 },
  { nivel: HUEVO, casillas: 4 },
];

// Adyacencia precalculada. Verificada contra las máscaras de distancia al borde
// del binario original: coincidencia exacta.
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

// Orden en espiral de fuera hacia dentro en que avanza la helada.
const SPIRAL = [23, 19, 14, 8, 3, 2, 1, 0, 4, 9, 15, 20, 21, 22,
                18, 13, 7, 6, 5, 10, 16, 17, 12, 11];

// ---------------------------------------------------------------------------
// Modos (DESIGN §5). Cada uno con UNA sola fuente de presión. Son configuración,
// no código distinto: las reglas consultan estas banderas.
// ---------------------------------------------------------------------------
const MODOS = { PECOREO: 'pecoreo', INVIERNO: 'invierno', LIBRE: 'libre' };

const CONFIG_MODO = {
  pecoreo:  { reloj: true,  helada: false, desastres: true,  puntua: true  },
  invierno: { reloj: false, helada: true,  desastres: false, puntua: true  },
  libre:    { reloj: false, helada: false, desastres: false, puntua: false },
};

// Helada (DESIGN §6): cada cuántos fallos avanza, según dificultad.
// Con el agua jugable (v3) la partida no terminaba con "cada 2"; la palanca 2 del
// cambio agua/celda rota la baja a cada fallo. Hoy normal y dura son iguales:
// la dificultad está pendiente de rediseñar.
const HELADA_CADA = { normal: 1, dura: 1 };
const HELADA_REMATE = 3;        // con tantas casillas jugables o menos, avanza siempre
const COSECHA_GRANDE = 4;       // una cosecha de 4+ limpia amenazas (Pecoreo)

// Reloj de Pecoreo (DESIGN §9).
const RELOJ_INICIAL = 90;
const RELOJ_TECHO = 99;
const RELOJ_ACELERA_CADA = 10;   // turnos
const RELOJ_ACELERA = 0.10;      // +10 % de velocidad por tramo
const NECTAR_SEGUNDOS = 15;
// Lo que vale un segundo que no cabe bajo el techo. Provisional: DESIGN §9 dice
// que el exceso cae como puntos, pero no a qué cambio.
const PUNTOS_POR_SEGUNDO = 50;

// Desastres (DESIGN §7).
const DESASTRES_MAX_ACTIVOS = 2;
const SEDA_TURNOS = 2;
const CALMA_TRAS_VELUTINA = 5;

// Ítems (DESIGN §8). Casillas necesarias a un mismo nivel para que aparezca uno,
// indexado por nivel-1. Es getMinSpecialCountForThisLevel del original.
const ITEM_THRESHOLDS = [14, 12, 10, 8, 6];
const ITEMS = {
  JALEA:    'jalea',     // todo el panal sube un nivel
  PROPOLEO: 'propoleo',  // el agua sube a cera
  DANZA:    'danza',     // la ronda siguiente, arrastre de cualquier longitud
  NECTAR:   'nectar',    // +15 s (sólo Pecoreo)
  HUMO:     'humo',      // la helada retrocede una celda — hoy NO sale (ver itemsUtiles)
  REINA:    'reina',     // comodín: la cadena la atraviesa aunque esté a otro nivel
};

// Segundos que da una cosecha de L celdas: L·(L+3)/2 (DESIGN §9).
function segundosCosecha(L) { return L * (L + 3) / 2; }

// Multiplicador por longitud del paso. Tabla del original, desensamblada.
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

// Genera la adyacencia para cualquier tamaño de tablero. Los tests la usan para
// comprobar ADJ, y servirá el día que se prueben otros tamaños.
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
