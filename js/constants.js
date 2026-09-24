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
// escalón más: se arrastra como cualquier nivel y sube a cera (la idea sale del
// original). Las celdas ROTAS no están en la escalera: van en
// s.roto[], son irreversibles y desaparecen del panal (ver state.js).
const AGUA       = 0;   // celda vacía: JUGABLE, sube a cera
const CERA       = 1;
const HUEVO      = 2;
const LARVA      = 3;
const OPERCULADA = 4;
const MAX_LEVEL  = 5;   // abeja lista: se cosecha

const NOMBRE_NIVEL = ['agua', 'cera', 'huevo', 'larva', 'operculada', 'abeja'];

// Desde la v4, cosechar devuelve la celda a AGUA, no a cera: la celda queda
// vacía y limpia, como la deja la obrera antes de que la reina vuelva a poner.
// Se leía como incoherente que una celda recién cosechada no volviera "a cero"
// (playtest del 20-09). Medido: acorta la partida en vez de alargarla.
const COSECHA_DEVUELVE = AGUA;

// Marca interna del reparto del arranque: "aquí va una celda rota". No es un
// nivel de la escalera — las rotas viven en s.roto[], fuera del panal.
const ROTA = -1;

// Cupos del arranque: siempre los mismos, en posiciones al azar (DESIGN §2).
// El agua es jugable: la partida no la hace finita el arranque sino la helada,
// que rompe celdas para siempre.
const ARRANQUE = [
  { nivel: AGUA,  casillas: 12 },
  { nivel: CERA,  casillas: 8 },
  { nivel: HUEVO, casillas: 4 },
];

// Celdas ROTAS en el arranque (T-19 y T-20). Es la palanca de duración Y de
// dificultad a la vez: reducen el panal vivo del que salen tanto las mesetas
// como, en contrarreloj, los segundos. Salen del cupo de AGUA, así que el
// reparto sigue sumando 24.
//
// Medido con el bot (mediana de turnos, con el resto de la v4 aplicada):
//   invierno  0→106   3→80   4→72   6→57   9→39
//   contrarreloj   0→98    3→70   4→61   6→48   9→40
//
// Invierno arranca ya mordido por el frío; el contrarreloj arranca entero y se
// acorta solo con el resto de los cambios de la v4. Ojo: subir de 6 empeora el
// ritmo de cosechas (4,6 con 6 rotas, 5,0 con 9; el objetivo es ~4).
// Desde la v5 **el panal empieza siempre entero** en todos los modos: la
// dificultad es consecuencia de fallar (HELADA_MUERDE, RELOJ_ACELERA), no una
// condición de salida. El mecanismo se conserva a 0 porque es la palanca que van
// a necesitar los modos de panal distinto y el de celdas bloqueadas.
const ROTAS_ARRANQUE = {
  invierno:     { normal: 0, dificil: 0 },
  contrarreloj: { normal: 0, dificil: 0 },
  libre:        { normal: 0, dificil: 0 },
};

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
const MODOS = { CONTRARRELOJ: 'contrarreloj', INVIERNO: 'invierno', LIBRE: 'libre' };

const CONFIG_MODO = {
  contrarreloj: { reloj: true,  helada: false, desastres: true,  puntua: true  },
  invierno:     { reloj: false, helada: true,  desastres: false, puntua: true  },
  libre:        { reloj: false, helada: false, desastres: false, puntua: false },
};

// Helada (DESIGN §6): avanza en CADA fallo desde la v3 (la palanca 2 del cambio
// agua/celda rota). HELADA_CADA se queda en 1 para las dos dificultades: lo que
// las separa es cuántas celdas muerde.
const HELADA_CADA = { normal: 1, dificil: 1 };

// Cuántas celdas rompe la helada en cada fallo. **Es la dificultad de Invierno**
// desde la v5: el panal empieza SIEMPRE entero y lo que se pierde es consecuencia
// de haber fallado, no una condición de salida. Hasta la v4 la dificultad eran
// celdas ya rotas en el arranque, y eso imponía parte de la dificultad antes de
// jugar — justo lo contrario de lo que el juego dice ser.
// Medido (2000 partidas, mediana de turnos): muerde 1 → 108 · 2 → 55 · 3 → 37.
const HELADA_MUERDE = { normal: 1, dificil: 2 };
const HELADA_REMATE = 3;        // con tantas casillas jugables o menos, avanza siempre
// Cosecha grande (Contrarreloj): la única forma de bajar de la escalera de
// desastres. Pone el contador a 0 y quita el capullo si no ha eclosionado; la
// seda no (v7). Pasó de 4 a 5 en la v7 porque 4 se conseguía sin buscarlo en un
// panal de 24. Medido (2000 partidas, contrarreloj normal): limpia con 4 → 1,86
// velutinas por partida · 5 → 2,35 · 6 → 3,03 (con 6 la velutina sale en el 95 %
// de las partidas y deja de ser el castigo gordo). La duración apenas se mueve.
// Ningún texto de la interfaz lleva el número a mano: lo leen de aquí.
const COSECHA_GRANDE = 5;

// Reloj de Contrarreloj (DESIGN §9).
const RELOJ_INICIAL = 90;
const RELOJ_TECHO = 99;
const RELOJ_ACELERA_CADA = 10;   // turnos
// Cuánto acelera el reloj por tramo. **Es la dificultad del contrarreloj** desde
// la v5. Es la única palanca medida que aprieta MÁS al jugador bueno que al
// flojo, que es justo lo que DESIGN §9 quiere: bajar el reloj inicial hunde la
// p10 un 46 % y deja el máximo intacto; acelerar un 20 % baja p10, mediana, p90
// y máximo entre un 26 % y un 35 %. Temáticamente ya estaba escrito: la
// aceleración es el atardecer, y en difícil la luz se va antes.
// Medido: 10 % → 99 turnos · 20 % → 66.
const RELOJ_ACELERA = { normal: 0.10, dificil: 0.20 };
const NECTAR_SEGUNDOS = 15;
// Lo que vale un segundo que no cabe bajo el techo. Provisional: DESIGN §9 dice
// que el exceso cae como puntos, pero no a qué cambio.
const PUNTOS_POR_SEGUNDO = 50;

// Desastres (DESIGN §7).
const DESASTRES_MAX_ACTIVOS = 2;
const SEDA_TURNOS = 2;
const CALMA_TRAS_VELUTINA = 5;

// Ítems (DESIGN §8). Casillas necesarias a un mismo nivel para que aparezca uno,
// indexado por nivel-1. Los números salen del original y están calibrados para
// un panal de 24. Desde la v4 se escala al panal VIVO: con 6
// celdas rotas pedir 14 de cera sobre 18 es pedir lo imposible, y el 27 % de las
// partidas no veía un solo ítem (69 % con 9 rotas). Ver umbralItem() en state.js.
const ITEM_THRESHOLDS = [14, 12, 10, 8, 6];
const ITEM_UMBRAL_MIN = 3;   // suelo: por muy pequeño que quede el panal

// Turnos que la gota espera en el tablero antes de evaporarse. Sin caducidad el
// ítem se queda ahí para siempre y recogerlo no cuesta nada: tarde o temprano la
// cadena pasa por encima. Con caducidad hay decisión de verdad — «desvío la
// cadena y me cargo la meseta, o lo dejo morir» —, que es lo que DESIGN §8 dice
// que tiene que pasar.
const ITEM_TURNOS = 2;

// Turnos de calma después de que aparezca un ítem, antes de que pueda salir el
// siguiente. El umbral proporcional de la v4 tapó un agujero real (en un panal
// mordido los ítems desaparecían), pero en el panal entero disparaba uno cada
// 2,9 turnos: eso no es un premio, es un goteo. Nadie lo vio porque hasta la v5
// el bot no recogía ítems, así que la gota se quedaba clavada bloqueando al
// generador y la medición decía 2,7 por partida.
// Medido, uno cada: umbral original 7,3 turnos · proporcional 2,9 ·
// proporcional con calma 4 → 6,8 · con calma 6 → 9,0.
const ITEM_CALMA = 4;

// Agua mínima para que se ofrezca el propóleo. DESIGN §8 dice que nunca se
// ofrece un ítem que no serviría de nada, y hasta la v3 bastaba UNA celda de
// agua: el ítem salía, subía una celda del color menos visible de la rampa y se
// leía como roto (QA CR-01). Subir 1-2 celdas es algo que el jugador hace a
// mano en un turno; por debajo de esto el propóleo no es un premio.
const PROPOLEO_MIN_AGUA = 3;
const ITEMS = {
  JALEA:    'jalea',     // todo el panal sube un nivel, menos el agua
  PROPOLEO: 'propoleo',  // el agua sube un nivel (a cera)
  DANZA:    'danza',     // la ronda siguiente, arrastre de cualquier longitud
  NECTAR:   'nectar',    // +15 s (sólo contrarreloj)
  HUMO:     'humo',      // devuelve la última celda rota; sólo en Invierno (ver itemsUtiles)
  REINA:    'reina',     // comodín: la cadena la atraviesa aunque esté a otro nivel
};

// Catálogo de ítems para la interfaz: el símbolo que se dibuja en la gota, el
// nombre y qué hace. Única fuente: lo usan render.js (la gota) y app.js (la
// leyenda). Hasta la v3 la gota sólo llevaba una letra y no había leyenda en
// ninguna parte, así que se recogían a ciegas (QA CR-02) — y DESIGN §8 dice que
// a veces NO compensa recogerlos, decisión imposible sin saber cuál es.
// `soloConReloj` y `soloConHelada` marcan los que no existen en todos los modos.
// `que` dice lo que hace (panel de la ficha); `hecho`, lo que acaba de pasar al
// recogerlo (línea de ítems, v8).
const ITEM_INFO = {
  jalea:    { simbolo: 'J', nombre: 'Jalea real', que: 'todo el panal sube un nivel, menos el agua',
              hecho: 'todo el panal ha subido un nivel' },
  propoleo: { simbolo: 'P', nombre: 'Propóleo',   que: 'el agua sube un nivel',
              hecho: 'el agua ha subido un nivel' },
  danza:    { simbolo: 'D', nombre: 'Danza',      que: 'el próximo arrastre, de la longitud que quieras',
              hecho: 'el próximo arrastre, de la longitud que quieras' },
  nectar:   { simbolo: 'N', nombre: 'Néctar',     que: `+${NECTAR_SEGUNDOS} s`, soloConReloj: true,
              hecho: `+${NECTAR_SEGUNDOS} s en el reloj` },
  humo:     { simbolo: 'H', nombre: 'Humo',       que: 'devuelve como agua la última celda rota', soloConHelada: true },
  reina:    { simbolo: '♛', nombre: 'La reina',   que: 'la cadena la atraviesa aunque esté a otro nivel',
              hecho: 'la cadena la ha atravesado' },
};

// Los seis que se le enseñan al jugador. Cada uno con su bandera de modo: el
// néctar sólo existe con reloj y el humo sólo con helada, así que la leyenda se
// monta según el modo y nunca anuncia algo que no puede salir.
const ITEMS_VISIBLES = ['jalea', 'propoleo', 'danza', 'nectar', 'humo', 'reina'];

// Catálogo de desastres para la interfaz, igual que ITEM_INFO. Hasta la v4 sólo
// se anunciaban en una línea de texto que se borraba al turno siguiente, así que
// el jugador no llegaba a aprenderse la escalera.
// Los textos dicen la escalera tal como es desde la v7 (DESIGN §7): los números
// salen de las constantes, nunca escritos a mano.
const DESASTRE_INFO = {
  varroa:   { simbolo: 'V', nombre: 'Varroa',   peldano: 1,
              que: 'tu celda más alta baja a cera' },
  polilla:  { simbolo: 'P', nombre: 'Polilla',  peldano: 2,
              que: 'deja un capullo; eclosiona si vuelves a fallar' },
  seda:     { simbolo: 'S', nombre: 'Seda',     peldano: 3,
              que: `el capullo eclosiona: sus vecinas quedan bloqueadas ${SEDA_TURNOS} turnos, sin remedio` },
  velutina: { simbolo: 'A', nombre: 'Velutina', peldano: 4,
              que: `3-4 celdas a cera; luego ${CALMA_TRAS_VELUTINA} turnos de calma. Se repite en cada fallo hasta que cosechas ${COSECHA_GRANDE}` },
};
const DESASTRES_VISIBLES = ['varroa', 'polilla', 'seda', 'velutina'];

// El nombre del modo en pantalla. Hasta la v5 el identificador era «pecoreo» y
// sólo el botón decía «Contrarreloj» (T-24): el nombre temático no se intuía
// como lo que el modo es. Desde la v6 el código dice lo mismo que la pantalla,
// igual que «dura» pasó a «dificil». Esta tabla se queda porque «libre» y
// «invierno» sí necesitan traducción.
const NOMBRE_DIF = { normal: 'Normal', dificil: 'Difícil' };

// La versión, a la vista en el pie junto a la semilla: jugando en el móvil no
// hay forma de saber si lo que tienes delante es lo último que se subió.
// Se mantiene a mano y tiene que coincidir con package.json (ver Recetas).
const VERSION = 'v8.1';

const NOMBRE_MODO = {
  contrarreloj: 'Contrarreloj',
  invierno:     'Invierno',
  libre:        'Panal libre',
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
