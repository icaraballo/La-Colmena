// Bot de simulación. `npm run bot [partidas] [semilla] [modo]`
//
//   npm run bot                    1000 partidas de Invierno, semillas 1..1000
//   npm run bot 5000               5000 partidas
//   npm run bot 2000 42            2000 partidas desde la semilla 42 (reproducible)
//   npm run bot 2000 1 contrarreloj     el modo contrarreloj
//   npm run bot 2000 1 invierno dificil
//   npm run bot 2000 1 contrarreloj normal 2   Contrarreloj a 2 s por turno (por defecto 2,5)
//
// No es una IA: juega con una heurística tonta (cosechar si puede, si no la meseta
// mayor) y sirve para una sola cosa, que es la importante: convertir "me parece que
// esto es muy difícil" en un número. Si el 80 % se muere antes del turno 15, el paso
// crece demasiado rápido. Treinta segundos de dato real en vez de tres tardes de
// intuición.
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
// Una partida
// ---------------------------------------------------------------------------
function jugarUna(seed, modo, dificultad) {
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
    T.tick(s, SEG_POR_TURNO);
    if (s.gameOver) break;

    // Cosechar tiene prioridad: es lo único que devuelve suelo llano al panal.
    // Desde la v5 el bot también recoge el ítem si le cae de camino.
    const cells = elegirJugada(s, R);

    if (!cells) {
      // CUELGUE FANTASMA. No hay jugada, pero biggestCoherentArea dice que sí la hay:
      // el motor cree que el jugador sigue vivo y no le deja fallar, así que un humano
      // se queda arrastrando el dedo sin que pase nada. DEBE SER SIEMPRE 0.
      if (T.biggestCoherentArea(s) >= s.step) st.fantasmas++;
      s.eventos = [];
      st.fallos++; T.fallback(s); leer(); continue;
    }

    const esCosecha = s.height[cells[0]] === T.MAX_LEVEL;
    const llevabaItem = !!(s.item && cells.includes(s.item.tile));
    const pasoAntes = s.step;
    if (!T.commitTurn(s, cells)) { s.eventos = []; st.fallos++; T.fallback(s); leer(); continue; }
    leer();
    if (!esCosecha) st.subidos += cells.length;
    else if (cells.length >= T.COSECHA_GRANDE) st.grandes++;

    if (llevabaItem) st.items++;
    for (const e of s.eventos) if (e.type === 'caduca') st.caducados++;
    if (esCosecha) {
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
const N      = Number(process.argv[2]) || 1000;
const SEED0  = Number(process.argv[3]) || 1;
const MODO   = (process.argv[4] || 'invierno').toLowerCase();
const DIF    = (process.argv[5] || 'normal').toLowerCase();
const SEG_POR_TURNO = Number(process.argv[6]) || 2.5;

const modoId = T.MODOS[MODO.toUpperCase()];
if (modoId === undefined) {
  console.error(`modo desconocido: ${MODO}. Usa: ${Object.keys(T.MODOS).join(', ').toLowerCase()}`);
  process.exit(1);
}

const res = [];
for (let n = 0; n < N; n++) res.push(jugarUna(SEED0 + n, modoId, DIF));

const col   = k => res.map(r => r[k]);
const media = a => a.reduce((x, y) => x + y, 0) / a.length;
const pct   = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
const num   = x => Math.round(x).toLocaleString('es-ES');

const turnos = col('turn');
console.log(`${N} partidas · modo ${MODO} (${DIF}) · semillas ${SEED0}..${SEED0 + N - 1}` +
            (T.CONFIG_MODO[modoId].reloj ? ` · ${SEG_POR_TURNO} s por turno` : ''));
console.log(`heurística: cosechar si puede, si no la meseta mayor\n`);
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
