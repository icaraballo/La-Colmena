// Bot de simulación. `npm run bot [partidas] [semilla] [modo] [dificultad] [bot] [s/turno]`
//
//   npm run bot                    1000 partidas de Invierno, semillas 1..1000
//   npm run bot 5000               5000 partidas
//   npm run bot 2000 42            2000 partidas desde la semilla 42 (reproducible)
//   npm run bot 2000 1 contrarreloj     el modo contrarreloj
//   npm run bot 2000 1 invierno dificil
//   npm run bot 2000 1 contrarreloj normal 2   Contrarreloj a 2 s por turno (por defecto 2,5)
//   npm run bot 2000 1 contrarreloj normal prudente     otro jugador (por defecto, el tonto)
//   npm run bot 2000 1 contrarreloj normal todos        los cinco, con las MISMAS partidas,
//                                                       y una tabla que los compara
//
// Sirve para una sola cosa, que es la importante: convertir "me parece que esto es
// muy difícil" en un número. Si el 80 % se muere antes del turno 15, el paso crece
// demasiado rápido. Treinta segundos de dato real en vez de tres tardes de intuición.
//
// ---------------------------------------------------------------------------
// LOS CINCO JUGADORES (T-33, v8)
// ---------------------------------------------------------------------------
// Una escala, del suelo al techo. La distancia entre el tonto y el planificador dice
// si PENSAR sirve de algo en el juego, que es lo que el juego dice ser.
//
//   tonto         el suelo. Reglas fijas: cosecha si puede; si no, cualquier jugada.
//                 NO SE TOCA: es la línea de referencia de todo Balance-y-Mediciones.
//   prudente      el jugador seguro. Mira 1 turno: nunca falla si puede evitarlo.
//   humano        el prudente con despistes: 1 turno de cada 5 juega cualquier cosa.
//   codicioso     el extremo arriesgado: guarda abejas para la cosecha grande, se
//                 desvía a por los ítems y falla a propósito si el fallo es gratis.
//   planificador  el techo. Mira 3 turnos siguiendo las 3 mejores jugadas de cada
//                 uno, y no lleva pesos inventados: puntos y lo que cuesta cada fallo.
//
// Los que piensan juegan cada jugada posible en una COPIA del estado (el motor es
// un objeto plano, ver state.js) y le ponen nota con la tabla PESOS de abajo. La
// copia lleva el azar RE-SEMBRADO: el bot no puede saber dónde saldrá el ítem ni a
// qué celda irá la varroa. Medido en el prototipo: dejarle verlo no cambia nada
// (134 contra 133 turnos), pero así no hay trampa que discutir.
//
// ---------------------------------------------------------------------------
// POR QUÉ HAY UN RNG AQUÍ DENTRO
// ---------------------------------------------------------------------------
// Lo que varía entre partidas no son las decisiones del motor, son las del JUGADOR.
// Si el bot recorre las casillas en orden de índice juega siempre la misma partida, y
// mil repeticiones dan mil copias del mismo dato: p10 = mediana = p90 y desviación
// cero. Eso no es una distribución, es un punto disfrazado. (Pasó de verdad: antes de
// los cupos de arranque el motor era 100 % determinista y el bot daba 2000 partidas
// idénticas.)
//
// Así que lo aleatorio es el ORDEN en que el bot considera las jugadas. Cada semilla
// es un jugador distinto con el mismo criterio. Eso sí es una muestra.
// ---------------------------------------------------------------------------
const T = require('./_bundle.js');

// xorshift32: rápido, reproducible, sin dependencias. Misma semilla, mismos números.
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => (x ^= x << 13, x ^= x >>> 17, x ^= x << 5, (x >>> 0) / 4294967296);
}
function shuffled(arr, R) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------------------------------------------------------------------
// Buscar una jugada
// ---------------------------------------------------------------------------
// El arrastre permite TRÁNSITO, así que una jugada válida es un CONJUNTO CONEXO de L
// casillas al mismo nivel — no un camino simple. Por eso esto es un BFS y no el DFS
// con backtracking de antes: con tránsito no hay que recorrerlas en fila.
//
// Si algún día se quitara el tránsito, esto vuelve a ser un DFS y el contador de
// cuelgues fantasma de abajo dejará de marcar 0.
// `forzar`: una celda que la jugada TIENE que incluir (para ir a por un ítem).
// La REINA es comodín: entra en la cadena esté al nivel que esté, igual que en
// el motor. Sin esto el bot no encontraría jugadas que biggestCoherentArea sí
// cuenta, y el contador de cuelgues fantasma se dispararía por su culpa y no por
// la del motor.
function buscarJugada(s, L, nivelPreferido, R, forzar) {
  const reina = (s.item && s.item.tipo === T.ITEMS.REINA && jugable(s, s.item.tile))
    ? s.item.tile : -1;
  // Una celda sirve al nivel h si está a ese nivel, o si es la reina.
  const de = (i, h) => jugable(s, i) && (s.height[i] === h || i === reina);

  // Niveles que hay que probar y desde dónde empezar el flood-fill.
  let inicios = [];
  if (forzar !== undefined) {
    if (!jugable(s, forzar)) return null;
    inicios = [forzar];
  } else {
    for (let i = 0; i < T.TILE_COUNT; i++) if (jugable(s, i)) inicios.push(i);
    inicios = shuffled(inicios, R);
  }

  for (const inicio of inicios) {
    // Desde la reina, el nivel de la cadena lo marcan sus vecinas; desde
    // cualquier otra celda, ella misma. La reina entra también con su PROPIO
    // nivel: si es la última celda viva (la helada se ha comido las otras 23) no
    // tiene vecinas jugables, y sola es una jugada de 1 que el motor sí cuenta.
    // Sin esto el bot se colgaba en el 0,3 % de las partidas de Invierno difícil
    // (CR-09) por culpa suya, no del motor.
    const niveles = inicio === reina
      ? [...new Set([s.height[inicio], ...T.ADJ[inicio].filter(v => jugable(s, v)).map(v => s.height[v])])]
      : [s.height[inicio]];
    for (const h of shuffled(niveles, R)) {
      if (nivelPreferido !== undefined && h !== nivelPreferido) continue;
      const visto = new Uint8Array(T.TILE_COUNT); visto[inicio] = 1;
      const conjunto = [inicio], cola = [inicio];
      while (cola.length && conjunto.length < L) {
        const u = cola.shift();
        for (const v of shuffled(T.ADJ[u], R)) {
          if (visto[v] || !de(v, h)) continue;
          visto[v] = 1; conjunto.push(v); cola.push(v);
          if (conjunto.length === L) break;
        }
      }
      if (conjunto.length === L) return conjunto;
    }
  }
  return null;
}

// Qué juega el bot este turno, por orden de preferencia. Cosechar manda: es lo
// único que devuelve suelo llano. Dentro de cada opción, se recoge el ítem si
// cae de camino — el bot NO rompe una meseta ni renuncia a una cosecha por ir a
// buscarlo, así que esto es el suelo de lo que haría un humano, no el techo.
function elegirJugada(s, R) {
  const it = s.item ? s.item.tile : undefined;
  return (it !== undefined && buscarJugada(s, s.step, T.MAX_LEVEL, R, it))
      || buscarJugada(s, s.step, T.MAX_LEVEL, R)
      || (it !== undefined && buscarJugada(s, s.step, undefined, R, it))
      || buscarJugada(s, s.step, undefined, R)
      || null;
}

// La definición del motor, no una copia: una celda rota no es jugable y una
// con seda tampoco mientras dure; el agua sí. Si el bot tuviera su propia regla
// mediría un juego distinto del que se juega.
function jugable(s, i) { return T.jugable(s, i); }


// ---------------------------------------------------------------------------
// PESOS DE LOS BOTS QUE PIENSAN
// ---------------------------------------------------------------------------
// La nota de una jugada es la SUMA de lo que pasa al jugarla en la copia:
//
//   fallo            la jugada deja el panal sin sitio para el paso siguiente
//   falloGratis      ...y el fallo no cuesta nada (calma tras la velutina). Si no
//                    se define, un fallo gratis cuenta como cualquier otro
//   cosechaPequeña   cosecha de menos de COSECHA_GRANDE
//   cosechaGrande    cosecha de COSECHA_GRANDE o más (baja la escalera)
//   margen           por cada celda de sitio que sobra para el paso siguiente,
//                    hasta `margenTope`
//   item             la jugada recoge el ítem
//   abeja            por cada abeja de la mayor meseta de abejas que queda
//   despiste         (humano) probabilidad de jugar cualquier jugada válida
//
// Los números se acordaron el 24-09-2026 y están en el vault, en LC-Tests-y-Bot.
// Cambiar uno es cambiar de jugador: las cifras de antes y de después no se mezclan.
const PESOS = {
  prudente:  { fallo: -100, cosechaPequeña: 10, cosechaGrande: 10, margen: 1, margenTope: 5, item: 3, abeja: 0 },
  humano:    { fallo: -100, cosechaPequeña: 10, cosechaGrande: 10, margen: 1, margenTope: 5, item: 3, abeja: 0,
               despiste: 0.20 },
  codicioso: { fallo: -30, falloGratis: 0, cosechaPequeña: -5, cosechaGrande: 25, margen: 1, margenTope: 5,
               item: 15, abeja: 3 },
  // Opción B (T-34, 24-09): al final de lo que mira, pone nota al tablero que deja.
  // Medido con 2000 partidas: gana al codicioso en Contrarreloj (371.000 contra
  // 296.000 puntos) y no empeora en Invierno (172.000 contra 169.000 sin B).
  // El planificador cuenta en PUNTOS, que es lo que guarda el récord. Lo que no son
  // puntos se convierte con `puntosPorNivel`: un nivel que quita un desastre, una
  // celda que rompe la helada (vale `nivelesPorRota` niveles) y cada celda de margen
  // al final de lo que mira. Es la única cifra que hay que poner a mano.
  // Medido (100 partidas, 24-09): 50 → 138 turnos en Contrarreloj, 200 → 145,
  // 800 → 130. Y la profundidad sí importa: 1 turno → 102, 2 → 118, 3 → 145.
  // Darle valor a los segundos lo EMPEORA (300 puntos/s → 128 turnos): basta con
  // que el reloj corra en sus copias, y así ve venir el final.
  planificador: { profundidad: 3, haz: 3, puntosPorNivel: 200, nivelesPorRota: 10, margenTope: 5,
                  b: 1, potencial: 0.5, racha: 1, cosechaMedia: 4,
                  escalera: 1, nivelesPorDesastre: 3, turnosReloj: 3, relojRiesgo: 2000 },
};

// Una copia del estado que se puede jugar sin tocar el de verdad.
function copia(s, R) {
  return { ...s,
    height: s.height.slice(), roto: s.roto.slice(), sedaHasta: s.sedaHasta.slice(),
    item: s.item && { ...s.item }, heladas: s.heladas.slice(),
    desastres: s.desastres.map(d => ({ ...d, tiles: d.tiles && d.tiles.slice() })),
    eventos: [], last: null,
    rng: (R() * 4294967296) >>> 0 || 1,   // azar nuevo: el bot no ve el futuro
  };
}

// Todas las jugadas que el bot se plantea: un BFS al azar desde cada celda jugable y
// cada nivel posible (la reina, con los de sus vecinas). Salen ~7-10 por turno. No
// son TODAS las formas posibles, pero sí todas las mesetas: si hay jugada, sale.
// Con danza cualquier longitud vale y se toma la meseta entera.
function candidatas(s, R) {
  const reina = (s.item && s.item.tipo === T.ITEMS.REINA && jugable(s, s.item.tile)) ? s.item.tile : -1;
  const vistas = new Map();
  const inicios = [];
  for (let i = 0; i < T.TILE_COUNT; i++) if (jugable(s, i)) inicios.push(i);
  for (const inicio of shuffled(inicios, R)) {
    const niveles = inicio === reina
      ? [...new Set([s.height[inicio], ...T.ADJ[inicio].filter(v => jugable(s, v)).map(v => s.height[v])])]
      : [s.height[inicio]];
    for (const h of niveles) {
      const de = i => jugable(s, i) && (s.height[i] === h || i === reina);
      const L = s.danza ? T.mesetaDeNivel(s, h) : s.step;
      const visto = new Uint8Array(T.TILE_COUNT); visto[inicio] = 1;
      const c = [inicio], cola = [inicio];
      while (cola.length && c.length < L) {
        const u = cola.shift();
        for (const v of shuffled(T.ADJ[u], R)) {
          if (visto[v] || !de(v)) continue;
          visto[v] = 1; c.push(v); cola.push(v);
          if (c.length === L) break;
        }
      }
      if (c.length !== L || !T.isValidDrag(s, c)) continue;
      const clave = c.slice().sort((a, b) => a - b).join(',');
      if (!vistas.has(clave)) vistas.set(clave, c);
    }
  }
  return [...vistas.values()];
}

// Lo que pasó al jugar `c` en la copia `k` (que ya tiene la jugada hecha).
function efecto(s, c, k) {
  const fallo = k.eventos.find(e => e.type === 'fallback');
  const d = fallo && fallo.desastre;
  return {
    cosecha: esCosecha(s, c), L: c.length,
    item: !!(s.item && c.includes(s.item.tile)),
    fallo: !!fallo,
    gratis: !!fallo && fallo.eaten === undefined && !d,
    niveles: d ? (d.niveles || 0) : 0,
    rotas: fallo && fallo.eaten !== undefined ? T.HELADA_MUERDE[s.dificultad] : 0,
    margen: k.danza ? Infinity : T.biggestCoherentArea(k) - k.step,
  };
}

function nota1(s, c, k, P) {
  const e = efecto(s, c, k);
  let v = 0;
  if (k.gameOver) v -= 1e6;
  if (e.fallo) v += (e.gratis && P.falloGratis !== undefined) ? P.falloGratis : P.fallo;
  if (e.cosecha) v += e.L >= T.COSECHA_GRANDE ? P.cosechaGrande : P.cosechaPequeña;
  v += P.margen * Math.max(0, Math.min(e.margen, P.margenTope));
  if (e.item) v += P.item;
  if (P.abeja) v += P.abeja * T.mesetaDeNivel(k, T.MAX_LEVEL);
  return v;
}

// La mejor por nota; los empates se deshacen por el orden (ya barajado) de las
// candidatas, así que cada semilla sigue siendo un jugador distinto.
function mejorA1(s, R, P) {
  const cs = candidatas(s, R);
  let mejor = null, v = -Infinity;
  for (const c of cs) {
    const k = copia(s, R); T.commitTurn(k, c);
    const n = nota1(s, c, k, P);
    if (n > v) { v = n; mejor = c; }
  }
  return mejor;
}

// --- planificador ---------------------------------------------------------
// Lo que vale haber jugado `c` en puntos: los que da, menos lo que cuesta el fallo.
function valorPlan(s, c, k, P) {
  const e = efecto(s, c, k);
  let v = k.score - s.score;
  if (k.gameOver) v -= 1e9;
  if (e.fallo) v -= P.puntosPorNivel * (e.niveles + e.rotas * P.nivelesPorRota);
  return v;
}
const puntosCosecha = (L, racha) => 10 * L * L * T.bonusMultiplier(L) * (1 + racha);
function finalPlan(k, P) {
  const m = k.danza ? P.margenTope : Math.max(0, Math.min(T.biggestCoherentArea(k) - k.step, P.margenTope));
  let v = P.puntosPorNivel * m;
  if (!P.b) return v;
  const cfg = T.CONFIG_MODO[k.modo];
  // Potencial: las abejas juntas, a una parte de lo que daría cosecharlas.
  const abejas = T.mesetaDeNivel(k, T.MAX_LEVEL);
  if (abejas) v += P.potencial * puntosCosecha(abejas, k.streak);
  // Racha: lo que se pierde si se rompe, en cosechas medias.
  v += P.racha * k.streak * puntosCosecha(P.cosechaMedia, 0);
  // Escalera: lo cerca que está el próximo desastre.
  if (cfg.desastres) v -= P.escalera * Math.min(k.failStreak, 4) * P.nivelesPorDesastre * P.puntosPorNivel;
  // Reloj: sólo como riesgo, cuando queda para menos de unos turnos.
  if (cfg.reloj) {
    const umbral = P.turnosReloj * segActual * T.velocidadReloj(k);
    if (k.reloj < umbral) v -= P.relojRiesgo * (umbral - k.reloj);
  }
  return v;
}
// Lo mejor que se puede sacar desde `s` en `prof` turnos, siguiendo en cada turno
// sólo las `haz` jugadas de más valor inmediato (más el margen que dejan).
function buscarPlan(s, R, P, prof) {
  const cs = candidatas(s, R);
  if (!cs.length) return { v: -P.puntosPorNivel * P.margenTope, c: null };
  const hijos = cs.map(c => {
    const k = copia(s, R); T.commitTurn(k, c); T.tick(k, segActual);
    const inm = valorPlan(s, c, k, P);
    return { c, k, inm, orden: inm + finalPlan(k, P) };
  });
  hijos.sort((a, b) => b.orden - a.orden);
  if (prof <= 1) return { v: hijos[0].orden, c: hijos[0].c };
  let mejor = null, v = -Infinity;
  for (const h of hijos.slice(0, P.haz)) {
    const t = h.k.gameOver ? h.orden : h.inm + buscarPlan(h.k, R, P, prof - 1).v;
    if (t > v) { v = t; mejor = h.c; }
  }
  return { v, c: mejor };
}

function esCosecha(s, c) {
  const reina = (s.item && s.item.tipo === T.ITEMS.REINA) ? s.item.tile : -1;
  const otra = c.find(i => i !== reina);
  return s.height[otra === undefined ? c[0] : otra] === T.MAX_LEVEL;
}

// Cada jugador es una función: estado → celdas (o null si no ve jugada).
const BOTS = {
  tonto:        (s, R) => elegirJugada(s, R),
  prudente:     (s, R) => mejorA1(s, R, PESOS.prudente),
  humano:       (s, R) => {
    if (R() < PESOS.humano.despiste) { const cs = candidatas(s, R); return cs.length ? cs[0] : null; }
    return mejorA1(s, R, PESOS.humano);
  },
  codicioso:    (s, R) => mejorA1(s, R, PESOS.codicioso),
  planificador: (s, R) => buscarPlan(s, R, PESOS.planificador, PESOS.planificador.profundidad).c,
};
const DESCRIPCION = {
  tonto: 'cosechar si puede, si no cualquier jugada',
  prudente: 'mira 1 turno: no fallar, cosechar, dejar sitio',
  humano: `el prudente, con un despiste ${Math.round(PESOS.humano.despiste * 100)} % de los turnos`,
  codicioso: 'guarda abejas, va a por ítems, falla si es gratis',
  planificador: `mira ${PESOS.planificador.profundidad} turnos (las ${PESOS.planificador.haz} mejores), cuenta en puntos`,
};

// ---------------------------------------------------------------------------
// Una partida
// ---------------------------------------------------------------------------
// Lo que tarda un humano por turno, también en las copias del planificador: sin
// esto, en sus cuentas el reloj no corre nunca.
let segActual = 2.5;
function jugarUna(seed, modo, dificultad, bot, segPorTurno) {
  segActual = segPorTurno;
  const R = rng(seed);
  const s = T.createState(modo, dificultad, seed);
  const st = { pasoMax: 0, cosechas: 0, fallos: 0, fantasmas: 0, mayorCosecha: 0, items: 0, caducados: 0,
               varroa: 0, polilla: 0, seda: 0, sedaCeldas: 0, velutina: 0, enCalma: 0,
               perdidos: 0, subidos: 0, grandes: 0, dosAmenazas: 0 };
  for (const t of T.ITEMS_VISIBLES) { st['sale_' + t] = 0; st['usa_' + t] = 0; }
  // Lo que cuentan los eventos del motor (v7, H.4): desastres por tipo, lo que
  // cuestan en niveles y los ítems por tipo. Se leen los eventos, no se toca el
  // motor para medir.
  const leer = () => {
    for (const e of s.eventos) {
      if (e.type === 'item') st['sale_' + e.tipo]++;
      if (e.type === 'usa') st['usa_' + e.tipo]++;
      if (e.type !== 'fallback' || !T.CONFIG_MODO[modo].desastres) continue;
      const d = e.desastre;
      if (!d) { st.enCalma++; continue; }
      st[d.tipo]++;
      if (d.tipo === 'seda') st.sedaCeldas += d.tiles.length;
      st.perdidos += d.niveles || 0;
    }
    if (s.desastres.length >= T.DESASTRES_MAX_ACTIVOS) st.dosAmenazas++;
  };
  let guard = 0;

  while (!s.gameOver && guard++ < 3000) {
    if (s.step > st.pasoMax) st.pasoMax = s.step;
    // El reloj de Contrarreloj corre lo que tarde en pensar un humano. Sin esto la
    // partida contrarreloj no acabaría nunca.
    T.tick(s, segPorTurno);
    if (s.gameOver) break;

    // Cosechar tiene prioridad: es lo único que devuelve suelo llano al panal.
    // Desde la v5 el bot también recoge el ítem si le cae de camino.
    const cells = BOTS[bot](s, R);

    if (!cells) {
      // CUELGUE FANTASMA. No hay jugada, pero biggestCoherentArea dice que sí la hay:
      // el motor cree que el jugador sigue vivo y no le deja fallar, así que un humano
      // se queda arrastrando el dedo sin que pase nada. DEBE SER SIEMPRE 0.
      if (T.biggestCoherentArea(s) >= s.step) st.fantasmas++;
      s.eventos = [];
      st.fallos++; T.fallback(s); leer(); continue;
    }

    const cosecha = esCosecha(s, cells);
    const llevabaItem = !!(s.item && cells.includes(s.item.tile));
    const pasoAntes = s.step;
    if (!T.commitTurn(s, cells)) { s.eventos = []; st.fallos++; T.fallback(s); leer(); continue; }
    leer();
    if (!cosecha) st.subidos += cells.length;
    else if (cells.length >= T.COSECHA_GRANDE) st.grandes++;

    if (llevabaItem) st.items++;
    for (const e of s.eventos) if (e.type === 'caduca') st.caducados++;
    if (cosecha) {
      st.cosechas++;
      if (cells.length > st.mayorCosecha) st.mayorCosecha = cells.length;
    }
    // commitTurn dispara el fallo solo si el siguiente paso ya no cabe.
    if (s.step === 1 && pasoAntes > 1) st.fallos++;
  }

  if (guard >= 3000) st.colgada = true;
  return { turn: s.turn, score: s.score, ...st };
}

// ---------------------------------------------------------------------------
// Tirada y estadísticas
// ---------------------------------------------------------------------------
// Las partidas se reparten entre los núcleos (worker_threads): cada partida sólo
// depende de su semilla y del bot, así que el resultado es el mismo en uno que en
// diez. Con `todos`, los cinco bots juegan las MISMAS semillas y la comparación
// sale al final, cuando acaba el más lento.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (!isMainThread) {
  // Un hilo fijo que va pidiendo trozos hasta que no quedan: así el motor se carga
  // una vez por hilo y no una por trozo.
  parentPort.on('message', ({ bot, desde, hasta, modo, dif, seg }) => {
    const t0 = performance.now();
    const res = [];
    for (let seed = desde; seed < hasta; seed++) res.push(jugarUna(seed, modo, dif, bot, seg));
    parentPort.postMessage({ bot, res, seg: (performance.now() - t0) / 1000 });
  });
} else {
  principal();
}

function principal() {
  const args  = process.argv.slice(2);
  // El bot es la única palabra que no es número ni modo ni dificultad, así que puede
  // ir en su sitio sin romper la forma de antes (`... normal 2` sigue siendo 2 s).
  const nombreBot = (args.find((a, k) => k >= 4 && isNaN(Number(a))) || 'tonto').toLowerCase();
  const numeros = args.filter((a, k) => k >= 4 && !isNaN(Number(a)));
  global.N      = Number(args[0]) || 1000;
  global.SEED0  = Number(args[1]) || 1;
  global.MODO   = (args[2] || 'invierno').toLowerCase();
  global.DIF    = (args[3] || 'normal').toLowerCase();
  global.SEG_POR_TURNO = Number(numeros[0]) || 2.5;

  global.modoId = T.MODOS[MODO.toUpperCase()];
  if (modoId === undefined) {
    console.error(`modo desconocido: ${MODO}. Usa: ${Object.keys(T.MODOS).join(', ').toLowerCase()}`);
    process.exit(1);
  }
  const bots = nombreBot === 'todos' ? Object.keys(BOTS) : [nombreBot];
  if (!bots.every(b => BOTS[b])) {
    console.error(`bot desconocido: ${nombreBot}. Usa: ${Object.keys(BOTS).join(', ')} o todos`);
    process.exit(1);
  }

  // Trozos pequeños para que los núcleos no se queden esperando al último.
  const TROZO = 25;
  const cola = [];
  for (const bot of bots)
    for (let d = SEED0; d < SEED0 + N; d += TROZO)
      cola.push({ bot, desde: d, hasta: Math.min(d + TROZO, SEED0 + N), modo: modoId, dif: DIF, seg: SEG_POR_TURNO });
  // Los trozos del bot lento primero: así terminan todos a la vez.
  const peso = { planificador: 3, codicioso: 2, prudente: 2, humano: 2, tonto: 1 };
  cola.sort((a, b) => peso[b.bot] - peso[a.bot]);

  const porBot = Object.fromEntries(bots.map(b => [b, { res: [], cpu: 0 }]));
  const hilos = Math.min(require('os').cpus().length, cola.length);
  const t0 = Date.now();
  let vivos = hilos;
  for (let k = 0; k < hilos; k++) {
    const w = new Worker(__filename);
    const siguiente = () => {
      const tarea = cola.shift();
      if (tarea) return w.postMessage(tarea);
      w.terminate();
      if (--vivos === 0) fin();
    };
    w.on('message', m => { porBot[m.bot].res.push(...m.res); porBot[m.bot].cpu += m.seg; siguiente(); });
    w.on('error', e => { console.error(e); process.exit(1); });
    siguiente();
  }

  function fin() {
    const reloj = (Date.now() - t0) / 1000;
    if (bots.length === 1) informe(porBot[bots[0]].res, bots[0]);
    else comparar(porBot);
    console.log(`\n${reloj.toFixed(1)} s en ${hilos} hilos`);
  }
}

// ---------------------------------------------------------------------------
// La comparación: una columna por bot, las mismas partidas
// ---------------------------------------------------------------------------
function comparar(porBot) {
  const bots = Object.keys(porBot);
  const media = a => a.reduce((x, y) => x + y, 0) / a.length;
  const pct   = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
  const num   = x => Math.round(x).toLocaleString('es-ES');
  const dec   = (x, d = 1) => x.toFixed(d).replace('.', ',');
  const filas = [];
  const fila  = (nombre, f) => filas.push([nombre, ...bots.map(b => {
    const r = porBot[b].res; return f(k => r.map(x => x[k]), r, b);
  })]);
  const conDesastres = T.CONFIG_MODO[modoId].desastres;

  fila('turnos (mediana)',      c => String(pct(c('turn'), .5)));
  fila('turnos p10–p90',        c => `${pct(c('turn'), .1)}–${pct(c('turn'), .9)}`);
  fila('puntos (mediana)',      c => num(pct(c('score'), .5)));
  fila('cosechas / partida',    c => dec(media(c('cosechas'))));
  fila('ritmo: 1 cosecha cada', c => dec(media(c('turn')) / Math.max(1, media(c('cosechas')))) + ' t');
  fila('cosechas grandes',      c => dec(media(c('grandes'))));
  fila('la mayor cosecha',      c => String(Math.max(...c('mayorCosecha'))));
  fila('fallos / partida',      c => dec(media(c('fallos'))));
  fila('1 fallo cada',          c => dec(media(c('turn')) / Math.max(1, media(c('fallos')))) + ' t');
  fila('ítems recogidos',       c => dec(media(c('items'))));
  fila('paso máximo (media)',   c => dec(media(c('pasoMax'))));
  if (conDesastres) {
    fila('varroa',              c => dec(media(c('varroa')), 2));
    fila('polilla',             c => dec(media(c('polilla')), 2));
    fila('seda',                c => dec(media(c('seda')), 2));
    fila('velutina',            c => dec(media(c('velutina')), 2));
    fila('con velutina',        (c, r) => dec(r.filter(x => x.velutina > 0).length / r.length * 100) + ' %');
    fila('fallos en calma',     c => dec(media(c('enCalma')), 2));
    fila('coste de desastres',  c => dec(media(c('perdidos')) / Math.max(1, media(c('subidos'))) * 100) + ' %');
  }
  fila('cuelgues fantasma',     (c, r) => dec(r.filter(x => x.fantasmas > 0).length / r.length * 100) + ' %');
  fila('sin terminar',          (c, r) => String(r.filter(x => x.colgada).length));
  fila('tiempo de cálculo',     (c, r, b) => dec(porBot[b].cpu, 0) + ' s');

  console.log(`${N} partidas por bot · modo ${MODO} (${DIF}) · semillas ${SEED0}..${SEED0 + N - 1}` +
              (T.CONFIG_MODO[modoId].reloj ? ` · ${SEG_POR_TURNO} s por turno` : '') + '\n');
  const ancho = [Math.max(...filas.map(f => f[0].length)), ...bots.map((b, k) =>
    Math.max(b.length, ...filas.map(f => f[k + 1].length)))];
  const linea = f => f.map((x, k) => k ? x.padStart(ancho[k]) : x.padEnd(ancho[k])).join('   ');
  console.log(linea(['', ...bots]));
  for (const f of filas) console.log(linea(f));
  console.log('\n' + bots.map(b => `${b}: ${DESCRIPCION[b]}`).join('\n'));
}

// ---------------------------------------------------------------------------
// El informe de un solo bot (el de siempre)
// ---------------------------------------------------------------------------
function informe(res, bot) {
  const col   = k => res.map(r => r[k]);
  const media = a => a.reduce((x, y) => x + y, 0) / a.length;
  const pct   = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
  const num   = x => Math.round(x).toLocaleString('es-ES');

  const turnos = col('turn');
  console.log(`${N} partidas · modo ${MODO} (${DIF}) · semillas ${SEED0}..${SEED0 + N - 1}` +
              (T.CONFIG_MODO[modoId].reloj ? ` · ${SEG_POR_TURNO} s por turno` : ''));
  console.log(`bot: ${bot} (${DESCRIPCION[bot]})\n`);
  console.log(`turnos    media ${media(turnos).toFixed(1)}   p10 ${pct(turnos, .10)}   mediana ${pct(turnos, .50)}   p90 ${pct(turnos, .90)}   mín ${Math.min(...turnos)}   máx ${Math.max(...turnos)}`);
  console.log(`puntos    media ${num(media(col('score')))}   mediana ${num(pct(col('score'), .50))}   máx ${num(Math.max(...col('score')))}`);
  console.log(`paso máximo alcanzado   media ${media(col('pasoMax')).toFixed(1)}   máx ${Math.max(...col('pasoMax'))}`);
  console.log(`cosechas por partida    media ${media(col('cosechas')).toFixed(1)}   la mayor fue de ${Math.max(...col('mayorCosecha'))} celdas`);
  console.log(`fallos por partida      media ${media(col('fallos')).toFixed(1)}`);
  console.log(`ítems recogidos         media ${media(col('items')).toFixed(1)}   ·   evaporados sin recoger ${media(col('caducados')).toFixed(1)}`);

  // Ítems por tipo (v7, H.1): cuántos salen y cuántos se recogen.
  const lineaItems = T.ITEMS_VISIBLES
    .filter(t => media(col('sale_' + t)) > 0)
    .map(t => `${t} ${media(col('sale_' + t)).toFixed(1)}/${media(col('usa_' + t)).toFixed(1)}`);
  if (lineaItems.length) console.log(`ítems por tipo          salen/recogidos por partida: ${lineaItems.join(' · ')}`);

  // Un turno de cada X es una cosecha. Es el ritmo del juego: cuanto más bajo, más
  // veces pasa lo divertido. Con 5 niveles debería rondar 1 de cada 4.
  const ritmo = media(turnos) / Math.max(1, media(col('cosechas')));
  console.log(`ritmo                   una cosecha cada ${ritmo.toFixed(1)} turnos`);

  // Desastres (v7, H.4): la escalera por dentro. El coste son los niveles que
  // quitan los desastres entre los que sube el jugador arrastrando.
  if (T.CONFIG_MODO[modoId].desastres) {
    const f = k => media(col(k)).toFixed(2);
    const conVel = res.filter(r => r.velutina > 0).length;
    const coste = media(col('perdidos')) / Math.max(1, media(col('subidos')));
    console.log(`desastres por partida   varroa ${f('varroa')} · polilla ${f('polilla')} · seda ${f('seda')} (${media(col('sedaCeldas')).toFixed(1)} celdas) · velutina ${f('velutina')} · en calma ${f('enCalma')}`);
    console.log(`coste                   niveles perdidos ${media(col('perdidos')).toFixed(1)} de ${media(col('subidos')).toFixed(0)} subidos = ${(coste * 100).toFixed(1)} % · cosechas grandes ${media(col('grandes')).toFixed(1)} · con velutina ${(conVel / N * 100).toFixed(1)} %`);
    if (res.some(r => r.dosAmenazas)) console.log(`                        turnos con ${T.DESASTRES_MAX_ACTIVOS} amenazas a la vez: ${f('dosAmenazas')} por partida`);
  }

  // --- test de regresión de la regla del arrastre ---
  const fant = col('fantasmas');
  const conFant = fant.filter(x => x > 0).length;
  console.log(`\ncuelgues fantasma       ${media(fant).toFixed(2)} por partida · en el ${(conFant / N * 100).toFixed(1)} % de las partidas · peor caso ${Math.max(...fant)}`);
  if (conFant === 0) {
    console.log('  ✓ ninguno: cuando el motor dice que hay jugada, la hay.');
  } else {
    console.log('  ✗ hay posiciones jugables sólo en teoría: el jugador se queda colgado.');
    console.log('    El arrastre con tránsito debe dejar esto en 0. Ver §3 de DESIGN.md.');
  }

  const colgadas = res.filter(r => r.colgada).length;
  if (colgadas) {
    console.log(`\n⚠ ${colgadas} partidas llegaron al tope de 3000 turnos sin terminar.`);
    console.log('  Algo no está cerrando la partida: mira la helada (§6) o el reloj (§9).');
  }

  // --- histograma de supervivencia ---
  console.log('\nsupervivencia');
  const max = Math.max(...turnos);
  const tramo = max > 200 ? 20 : 10;
  for (let lo = 0; lo <= max; lo += tramo) {
    const n = turnos.filter(t => t >= lo && t < lo + tramo).length;
    if (!n) continue;
    console.log(`  ${String(lo).padStart(4)}-${String(lo + tramo - 1).padEnd(4)} ${'#'.repeat(Math.round(n / N * 60)).padEnd(60)} ${(n / N * 100).toFixed(1)} %`);
  }
}
