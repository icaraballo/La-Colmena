// Pruebas de las reglas. Se ejecutan con `npm test`. Cada bloque cita la sección
// de DESIGN.md que comprueba.
const T = require('./_bundle.js');

let fallos = 0, total = 0;
function ok(cond, msg) {
  total++;
  if (!cond) { fallos++; console.error('  FALLO · ' + msg); }
}
function eq(a, b, msg) { ok(a === b, `${msg} (esperado ${b}, obtenido ${a})`); }

// Tablero hecho a mano: panal ENTERO (sin las celdas rotas del arranque, que
// desde la v4 dependen del modo y de la dificultad), todas las celdas a `nivel`,
// y luego las excepciones. Las pruebas que quieran celdas rotas usan romper().
function tablero(modo, nivel, excepciones = {}, dificultad = 'normal') {
  const s = T.createState(modo, dificultad, 7);
  s.roto.fill(0);
  s.height.fill(nivel);
  for (const [i, h] of Object.entries(excepciones)) s.height[i] = h;
  return s;
}
// Celdas a un nivel, sin contar las rotas (una rota guarda height = 0 por limpieza).
const contar = (s, h) => [...s.height].filter((x, i) => x === h && !s.roto[i]).length;
const rotas = (s) => [...s.roto].filter(Boolean).length;
// Rompe celdas a mano, como haría la helada.
function romper(s, ...tiles) { for (const t of tiles) { s.roto[t] = 1; s.height[t] = T.AGUA; } return s; }
// Una celda jugable cualquiera, para arrastres de longitud 1.
function findNivel(s) { for (let i = 0; i < T.TILE_COUNT; i++) if (T.jugable(s, i)) return i; return 0; }
// Una jugada válida cualquiera de longitud step, o null. Empieza desde una celda
// al azar y crece por vecinas al azar: juega mal a propósito, para que falle.
function jugadaAlAzar(s, azar) {
  const L = s.danza ? 1 + azar(3) : s.step;
  const inicios = [];
  for (let i = 0; i < T.TILE_COUNT; i++) if (T.jugable(s, i)) inicios.push(i);
  for (let k = inicios.length - 1; k > 0; k--) { const j = azar(k + 1); [inicios[k], inicios[j]] = [inicios[j], inicios[k]]; }
  for (const a of inicios) {
    const cadena = [a];
    while (cadena.length < L) {
      const cand = [];
      for (const u of cadena) for (const v of T.ADJ[u])
        if (!cadena.includes(v) && !cand.includes(v) && T.isValidDrag({ ...s, step: cadena.length + 1, danza: false }, [...cadena, v])) cand.push(v);
      if (!cand.length) break;
      cadena.push(cand[azar(cand.length)]);
    }
    if (T.isValidDrag(s, cadena)) return cadena;
  }
  return null;
}

// --- geometría (§2) ------------------------------------------------------------
eq(T.TILE_COUNT, 24, 'el panal tiene 24 celdas');
ok(JSON.stringify(T.buildAdjacency(T.ROW_WIDTHS)) === JSON.stringify(T.ADJ),
   'la tabla ADJ coincide con la generada desde 4-5-6-5-4');
for (let i = 0; i < 24; i++)
  for (const v of T.ADJ[i]) ok(T.ADJ[v].includes(i), `adyacencia simétrica ${i}-${v}`);
eq(new Set(T.SPIRAL).size, 24, 'la espiral recorre las 24 celdas sin repetir');
eq(T.MAX_LEVEL, 5, 'cinco niveles jugables');
eq(T.AGUA, 0, 'el agua es el nivel 0');

// --- arranque (§2) ---------------------------------------------------------------
// Los cupos son 12 agua / 8 cera / 4 huevo, y las celdas rotas del arranque
// (v4, T-19) salen del cupo de AGUA: el reparto sigue sumando 24.
// Desde la v5 el panal empieza SIEMPRE entero: la dificultad es consecuencia de
// fallar, no una condición de salida. El mecanismo se conserva para los modos de
// panal distinto que vengan (Instrucciones §9.3).
for (const [modo, dif, rotasEsperadas] of [
  ['invierno', 'normal', 0], ['invierno', 'dificil', 0],
  ['contrarreloj',  'normal', 0], ['contrarreloj',  'dificil', 0],
  ['libre',    'normal', 0],
]) {
  eq(T.ROTAS_ARRANQUE[modo][dif], rotasEsperadas, `${modo} ${dif}: ${rotasEsperadas} rotas de tabla`);
  for (let seed = 1; seed <= 20; seed++) {
    const s = T.createState(modo, dif, seed);
    ok(rotas(s) === rotasEsperadas
       && contar(s, 0) === 12 - rotasEsperadas
       && contar(s, 1) === 8 && contar(s, 2) === 4
       && rotas(s) + contar(s, 0) + contar(s, 1) + contar(s, 2) === 24,
       `${modo} ${dif}, semilla ${seed}: cupos ${rotasEsperadas} rotas/${12 - rotasEsperadas} agua/8/4`);
  }
}
{
  const a = T.createState('invierno', 'normal', 42), b = T.createState('invierno', 'normal', 42);
  const c = T.createState('invierno', 'normal', 43);
  ok(a.height.join() === b.height.join(), 'misma semilla, mismo panal');
  ok(a.height.join() !== c.height.join(), 'distinta semilla, distinto panal');
}

// --- puntuación (§10) --------------------------------------------------------------
eq(T.bonusMultiplier(5), 2, 'bonus de paso 5');
eq(T.bonusMultiplier(6), 3, 'bonus de paso 6 (primer escalón)');
eq(T.bonusMultiplier(24), 14, 'bonus del tablero entero');

// --- el arrastre con tránsito (§3) ---------------------------------------------------
{
  const s = tablero('libre', 1);
  ok(T.isValidDrag(s, [0]), 'una celda vale con paso 1');
  ok(!T.isValidDrag(s, [0, 1]), 'dos celdas no valen con paso 1');
  s.step = 2;
  ok(T.isValidDrag(s, [0, 1]), 'dos contiguas valen con paso 2');
  ok(!T.isValidDrag(s, [0, 2]), 'dos no conexas no valen');
  ok(!T.isValidDrag(s, [0, 0]), 'no se repite celda');

  // Meseta en Y: centro 11 y tres brazos. Sin tránsito el camino simple más
  // largo es 5; con tránsito el conjunto de 7 es una jugada.
  const y = tablero('libre', 3, { 11: 1, 5: 1, 0: 1, 12: 1, 13: 1, 16: 1, 20: 1 });
  y.step = 7;
  ok(T.isValidDrag(y, [11, 5, 0, 12, 13, 16, 20]), 'la meseta en Y de 7 se juega entera (tránsito)');
  ok(!T.isValidDrag(y, [11, 5, 0, 12, 13, 16, 4]), 'una celda de otro nivel la invalida');
}

// --- el arrastre, paso a paso (v7, G.1 y G.4) -----------------------------------------
// pasoDeCadena es la lógica de input.js sin DOM. `recorre` simula el dedo
// entrando en una celda tras otra, empezando en la primera.
{
  const recorre = (s, camino) => {
    let c = { cells: [camino[0]], desde: [-1], trail: [camino[0]], deshaciendo: false };
    for (const i of camino.slice(1)) c = T.pasoDeCadena(s, c, i);
    return c;
  };
  const s = tablero('libre', 1);
  s.step = 3;
  // Fila de arriba: 0-1-2-3. Y el 5 debajo del 0 y el 1.
  eq(recorre(s, [0, 1, 2]).cells.join(), '0,1,2', 'añadir: el dedo va sumando vecinas del mismo nivel');
  eq(recorre(s, [0, 2]).cells.join(), '0', 'una celda que no es vecina no entra');
  eq(recorre(s, [0, 1, 2, 3]).cells.join(), '0,1,2', 'con la cadena completa no entra ni una más');
  // Por qué no entra (v11.2, para los avisos del tutorial), sin cambiar qué entra.
  {
    const c = recorre(s, [0, 1, 2]), porque = {};
    eq(T.pasoDeCadena(s, c, 3, porque), c, 'llena: devuelve la misma cadena');
    eq(porque.motivo, 'lleno', '…y dice «lleno»');
    const m = tablero('libre', 1, { 1: 2 }); m.step = 3;
    const c2 = recorre(m, [0]), p2 = {};
    eq(T.pasoDeCadena(m, c2, 1, p2), c2, 'otro nivel: devuelve la misma cadena');
    eq(p2.motivo, 'nivel', '…y dice «nivel»');
    const p3 = {};
    T.pasoDeCadena(s, recorre(s, [0]), 2, p3);
    eq(p3.motivo, undefined, 'una celda que no es vecina no tiene motivo');
    eq(T.pasoDeCadena(s, recorre(s, [0]), 1).cells.join(), '0,1', 'sin `porque` funciona igual');
  }

  // Tránsito: con la cadena incompleta, volver atrás NO quita: pasa.
  const tr = recorre(s, [0, 1, 0, 5]);
  eq(tr.cells.join(), '0,1,5', 'tránsito: se vuelve a pasar por el 0 para llegar al 5');

  // Quitar: con la cadena completa, volver a la celda desde la que llegaste.
  eq(recorre(s, [0, 1, 2, 1]).cells.join(), '0,1', 'cadena completa: volver atrás quita la última (G.1)');
  eq(recorre(s, [0, 1, 2, 1, 6]).cells.join(), '0,1,6', '…y se puede elegir otra en su lugar');

  // Deshacer encadenado: desandar el mismo camino sigue quitando.
  const t = tablero('libre', 1);
  t.step = 4;
  eq(recorre(t, [0, 1, 2, 3, 2, 1]).cells.join(), '0,1', 'deshacer encadenado: desandando se quitan varias');
  eq(recorre(t, [0, 1, 2, 3, 2, 1, 0]).cells.join(), '0', '…hasta la primera, que no se quita');
  // Salirse del camino (pasar por una celda de la cadena que no es la de
  // origen) corta el deshacer: con la cadena incompleta, volver ya es tránsito.
  const v = tablero('libre', 1);
  v.step = 5;
  eq(recorre(v, [0, 1, 5, 6, 7, 6, 1, 6, 5]).cells.join(), '0,1,5,6',
     'tras salirse del camino, volver atrás vuelve a ser tránsito');
  eq(recorre(t, [0, 1, 2, 3, 2, 7]).cells.join(), '0,1,2,7', 'tras quitar se puede añadir otra en su sitio');

  // Con tránsito la última puede colgar de otra rama: se quita volviendo a SU
  // celda de origen, no a la penúltima de la lista.
  const r = recorre(s, [0, 1, 0, 5]);          // 5 cuelga del 0, no del 1
  eq(T.pasoDeCadena(s, r, 1).cells.join(), '0,1,5', 'volver al 1 desde el 5 no es desandar: no quita');
  eq(T.pasoDeCadena(s, r, 0).cells.join(), '0,1', 'volver al 0, de donde vino el 5, sí lo quita');

  // Danza: no hay tope, así que la cadena nunca está completa y volver es tránsito.
  const d = tablero('libre', 1);
  d.danza = true;
  eq(recorre(d, [0, 1, 2, 1]).cells.join(), '0,1,2', 'con danza volver atrás es tránsito, no quita');

  // Reina: entra aunque esté a otro nivel, y se puede quitar como cualquiera.
  const q = tablero('libre', 1, { 1: 4 });
  q.item = { tile: 1, tipo: 'reina', caduca: 9 };
  q.step = 3;
  eq(recorre(q, [0, 1, 2]).cells.join(), '0,1,2', 'la reina entra en la cadena a otro nivel');
  eq(recorre(q, [0, 1, 2, 1]).cells.join(), '0,1', '…y la última se quita igual');
  const q2 = tablero('libre', 1, { 1: 4, 2: 3 });
  q2.item = { tile: 1, tipo: 'reina', caduca: 9 };
  q2.step = 3;
  eq(recorre(q2, [0, 1, 2]).cells.join(), '0,1', 'tras la reina, sigue mandando el nivel de la cadena');

  // Una celda con seda o de otro nivel no entra.
  const u = tablero('libre', 1, { 1: 2 });
  u.step = 3;
  eq(recorre(u, [0, 1]).cells.join(), '0', 'una celda de otro nivel no entra');
  u.sedaHasta[5] = 9;
  eq(recorre(u, [0, 5]).cells.join(), '0', 'una celda con seda no entra');
}

// --- agua y celdas rotas (§2) ---------------------------------------------------------
{
  const s = tablero('invierno', 0);
  s.step = 3;
  ok(T.isValidDrag(s, [0, 1, 2]), 'una cadena de agua de longitud step es válida');
  eq(T.biggestCoherentArea(s), 24, 'el agua cuenta como meseta');
  T.commitTurn(s, [0, 1, 2]);
  eq(s.height[0], T.CERA, 'arrastrar agua la deja en cera');
  eq(s.score, 0, 'subir agua no da puntos');
  eq(s.turn, 1, '…pero sí gasta turno');
  eq(s.step, 4, '…y sí hace crecer el paso');
}
{
  const s = romper(tablero('libre', 1), 1);
  s.step = 3;
  ok(!T.jugable(s, 1), 'una celda rota nunca es jugable, aunque su nivel sea 0');
  ok(!T.isValidDrag(s, [0, 1, 2]), 'no se puede pasar por una celda rota');
  ok(!T.isValidDrag(s, [1]), 'una celda rota no se selecciona');
  eq(T.tilesPlayable(s), 23, 'las rotas no cuentan como panal');
  const u = romper(tablero('libre', 0), ...Array.from({ length: 23 }, (_, i) => i + 1));
  eq(T.biggestCoherentArea(u), 1, 'las rotas no cuentan como meseta');
}

// --- el turno (§4) -------------------------------------------------------------------
{
  const s = tablero('invierno', 1);
  ok(T.commitTurn(s, [0]), 'se comete una jugada válida');
  eq(s.height[0], 2, 'la celda sube un nivel');
  eq(s.step, 2, 'el paso crece a 2');
  eq(s.turn, 1, 'el turno avanza');
  const turno = s.turn;
  ok(!T.commitTurn(s, [0, 1]), 'mezclar niveles se rechaza');
  eq(s.turn, turno, 'la jugada inválida no gasta turno');
}
{
  const s = tablero('invierno', 1, { 0: 5, 1: 5 });
  s.step = 2;
  T.commitTurn(s, [0, 1]);
  eq(s.height[0], T.AGUA, 'cosechar devuelve la celda a agua (v4), no a cera');
  eq(s.height[1], T.AGUA, '…las L celdas, no sólo la primera');
  eq(T.COSECHA_DEVUELVE, T.AGUA, 'la constante dice lo mismo que el motor');
  eq(s.streak, 1, 'la cosecha suma racha');
  eq(s.score, 10 * 4 * 2, 'puntos de cosecha: 10·L²·bonus·(1+racha)');
  eq(s.last.type, 'harvest', 'se registra como cosecha');
  ok(T.biggestCoherentArea(s) >= 2, 'y deja una meseta llana de L celdas');
}

// --- fallo y helada (§4, §6) ---------------------------------------------------------
{
  // Cuatro celdas sueltas en un panal roto: tras subir la 0, ningún par de
  // vecinas comparte nivel y el paso 2 no cabe.
  const s = tablero('invierno', 0, { 0: 1, 23: 2, 20: 3, 3: 4 });
  for (let i = 0; i < 24; i++) if (![0, 23, 20, 3].includes(i)) romper(s, i);
  T.commitTurn(s, [0]);
  eq(s.step, 1, 'si el siguiente paso no cabe, fallo: el paso vuelve a 1');
  eq(s.failStreak, 1, 'cuenta un fallo seguido');
  eq(s.turn, 1, 'el fallo no cuenta turno');
}
{
  const s = tablero('invierno', 2);
  T.fallback(s);
  eq(s.roto[T.SPIRAL[0]], 1, 'la helada rompe la primera celda de la espiral en cada fallo');
  eq(T.tilesPlayable(s), 23, 'y el panal pierde una celda');
  eq(s.heladaCnt, 0, 'el contador vuelve a 0');
  T.fallback(s);
  eq(s.roto[T.SPIRAL[1]], 1, 'la helada salta las celdas ya rotas');
  s.height[T.SPIRAL[2]] = T.AGUA;
  T.fallback(s);
  eq(s.roto[T.SPIRAL[2]], 1, 'la helada también rompe el agua');
}
{
  const s = tablero('invierno', 2, {}, 'dificil');
  T.fallback(s);
  eq(rotas(s), 2, 'en difícil la helada avanza en cada fallo, y se lleva 2 celdas (v5)');
}
{
  const s = tablero('invierno', 1, { 5: 5, 6: 5, 11: 5, 12: 5 });
  T.fallback(s);
  const rota = T.SPIRAL[0];
  s.step = 4;
  T.commitTurn(s, [5, 6, 11, 12]);
  eq(s.roto[rota], 1, 'la cosecha de 4+ ya NO devuelve celdas rotas (v3, palanca 1)');
}
{
  const s = romper(tablero('invierno', 1), ...Array.from({ length: 23 }, (_, i) => i + 1));
  T.fallback(s);
  ok(s.gameOver, 'Invierno termina cuando las 24 celdas están rotas');
}

// --- desastres (§7) ------------------------------------------------------------------
{
  const s = tablero('contrarreloj', 3);
  T.fallback(s);
  eq(s.last.desastre.tipo, 'varroa', '1.er fallo: varroa');
  eq(contar(s, 1), 1, 'la varroa baja una celda a cera');
  T.fallback(s);
  eq(s.last.desastre.tipo, 'polilla', '2.º fallo: polilla');
  eq(s.desastres.length, 1, 'queda un capullo activo');
  const capullo = s.desastres[0].tile;
  T.fallback(s);
  eq(s.last.desastre.tipo, 'seda', '3.er fallo: el capullo eclosiona');
  for (const v of T.ADJ[capullo]) ok(!T.jugable(s, v), `la seda bloquea la vecina ${v}`);
  T.fallback(s);
  eq(s.last.desastre.tipo, 'velutina', '4.º fallo: velutina');
  const n = s.last.desastre.tiles.length;
  ok(n >= T.VELUTINA_CELDAS[0] && n <= T.VELUTINA_CELDAS[1], `la velutina barre ${T.VELUTINA_CELDAS.join('-')} celdas`);
  T.fallback(s);
  eq(s.last.desastre, null, 'tras la velutina hay calma');
  eq(rotas(s), 0, 'ningún desastre rompe celdas');
  const a = tablero('contrarreloj', 0);
  for (let k = 0; k < 6; k++) T.fallback(a);
  eq(contar(a, 0), 24, 'los desastres no actúan sobre el agua');
}
{
  const s = tablero('contrarreloj', 2);
  s.desastres.push({ tipo: 'seda', tiles: [0, 1], hasta: 2 });
  s.sedaHasta[0] = 2; s.sedaHasta[1] = 2;
  ok(!T.jugable(s, 0), 'la celda con seda no es jugable');
  s.turn = 2;
  ok(T.jugable(s, 0), 'la seda caduca');
}
{
  const s = tablero('contrarreloj', 1, { 5: 5, 6: 5, 11: 5, 12: 5, 10: 5 });
  s.desastres.push({ tipo: 'capullo', tile: 20 });
  s.failStreak = 2;
  s.step = 5;
  T.commitTurn(s, [5, 6, 11, 12, 10]);
  eq(s.desastres.length, 0, 'una cosecha de 5+ elimina el capullo');
  eq(s.failStreak, 1, 'la cosecha de 5 baja un peldaño (v8.4; hasta la v8.3, a cero)');
  ok(s.eventos.some(e => e.type === 'baja' && e.desde === 2 && e.hasta === 1 && e.cosecha === 5), '…y lo avisa con el evento «baja», desde y hasta (v8.4)');
  ok(s.eventos.some(e => e.type === 'limpia' && e.desastre === 'capullo'), '…y el de «limpia»');
}
{
  // v7: el umbral pasa de 4 a 5. Una cosecha de 4 ya no baja de la escalera.
  const s = tablero('contrarreloj', 1, { 5: 5, 6: 5, 11: 5, 12: 5 });
  s.desastres.push({ tipo: 'capullo', tile: 20 });
  s.failStreak = 2;
  s.step = 4;
  T.commitTurn(s, [5, 6, 11, 12]);
  eq(s.failStreak, 2, 'una cosecha de 4 ya NO reinicia la escalera (v7)');
  eq(s.desastres.length, 1, '…ni quita el capullo');
  ok(!s.eventos.some(e => e.type === 'baja'), '…ni avisa de que bajas');
}
{
  // Con la escalera ya a cero no hay nada que bajar: no se avisa.
  const s = tablero('contrarreloj', 1, { 5: 5, 6: 5, 11: 5, 12: 5, 10: 5 });
  s.step = 5;
  T.commitTurn(s, [5, 6, 11, 12, 10]);
  ok(!s.eventos.some(e => e.type === 'baja'), 'con la escalera a cero, la cosecha grande no avisa de nada');
  const i = tablero('invierno', 1, { 5: 5, 6: 5, 11: 5, 12: 5, 10: 5 });
  i.failStreak = 3; i.step = 5;
  T.commitTurn(i, [5, 6, 11, 12, 10]);
  ok(!i.eventos.some(e => e.type === 'baja'), 'en Invierno no hay escalera: tampoco se avisa');
}
{
  // v8.4 (T-38): la cosecha grande baja según su tamaño, y la escalera tiene tope.
  const baja = [4, 5, 6, 7, 8, 9, 12].map(T.peldanosQueBaja);
  eq(baja.join(), '0,1,1,2,3,4,7', 'cuánto baja: 4 nada, 5 y 6 uno, 7 dos, 8 tres, 9 todo');
  eq(T.COSECHA_LIMPIA, 9, 'la cosecha que las espanta todas es la de 9');
  eq(T.ESCALERA_TOPE, T.DESASTRES_VISIBLES.length, 'el tope es el número de plagas');
  const s = tablero('contrarreloj', 3);
  for (let k = 0; k < 7; k++) T.fallback(s);
  eq(s.failStreak, T.ESCALERA_TOPE, 'la escalera no pasa del tope');
  for (const [L, desde, hasta] of [[5, 4, 3], [6, 4, 3], [7, 4, 2], [8, 4, 1], [9, 4, 0], [7, 1, 0]]) {
    const c = tablero('contrarreloj', 1);
    const cadena = [0, 1, 2, 3, 4, 5, 6, 7, 8].slice(0, L);   // la primera fila y parte de la segunda
    for (const i of cadena) c.height[i] = 5;
    c.failStreak = desde; c.step = L;
    ok(T.isValidDrag(c, cadena), `cadena de ${L} válida`);
    T.commitTurn(c, cadena);
    eq(c.failStreak, hasta, `cosecha de ${L} con ${desde} plagas deja ${hasta}`);
  }
}
{
  // v7: la seda, una vez suelta, no se quita. La cosecha grande no la toca.
  const s = tablero('contrarreloj', 1, { 5: 5, 6: 5, 11: 5, 12: 5, 10: 5 });
  s.desastres.push({ tipo: 'seda', tiles: [20, 21], hasta: 2 });
  s.sedaHasta[20] = 2; s.sedaHasta[21] = 2;
  s.failStreak = 3;
  s.step = 5;
  T.commitTurn(s, [5, 6, 11, 12, 10]);
  eq(s.failStreak, 2, 'la cosecha grande baja la escalera aunque haya seda');
  ok(s.desastres.some(d => d.tipo === 'seda'), '…pero la seda sigue ahí (v7)');
  ok(!T.jugable(s, 20), '…y sus celdas siguen bloqueadas');
  ok(!s.eventos.some(e => e.type === 'limpia'), '…y no hay evento de limpieza');
}
{
  // v4 (T-23, variante B): la cosecha PEQUEÑA ya no reinicia el termómetro. Con
  // la regla vieja la escalera de DESIGN §7 no se subía nunca: se cosecha cada
  // ~4 turnos y el contador no llegaba a 2.
  const s = tablero('contrarreloj', 1, { 5: 5, 6: 5 });
  s.failStreak = 3;
  s.step = 2;
  ok(T.commitTurn(s, [5, 6]), 'se cosechan 2 celdas');
  eq(s.failStreak, 3, 'una cosecha pequeña NO baja el termómetro');
  eq(s.streak, 1, '…pero sí suma racha');
  eq(T.COSECHA_GRANDE, 5, 'el umbral de cosecha grande es 5 (v7)');
}
{
  // v4: la varroa va a por la celda más alta, no por una al azar.
  const s = tablero('contrarreloj', 1, { 7: 4, 18: 2 });
  T.fallback(s);
  eq(s.last.desastre.tipo, 'varroa', '1.er fallo: varroa');
  eq(s.height[7], 1, 'la varroa se lleva la celda MÁS ALTA');
  eq(s.height[18], 2, '…y deja en paz a las demás');
  const llano = tablero('contrarreloj', 1);
  T.fallback(llano);
  eq(llano.last.desastre, null, 'con todo a cera la varroa no tiene a quién morder');
}
{
  // v7: la polilla sin sitio donde dejar el capullo cae como varroa (antes el
  // fallo se quedaba sin consecuencia). Todo agua salvo una celda de huevo que
  // ya tiene capullo: la polilla no tiene dónde ir.
  const s = tablero('contrarreloj', 0, { 7: 2 });
  s.desastres.push({ tipo: 'capullo', tile: 7 });
  s.failStreak = 1;
  eq(T.siguienteDesastre(s, s.turn), 'varroa', 'polilla sin candidata: se anuncia varroa');
  T.fallback(s);
  eq(s.last.desastre && s.last.desastre.tipo, 'varroa', '…y cae varroa');
  eq(s.height[7], T.CERA, '…sobre la celda más alta');
}
{
  // v7 (C.4): la velutina no elige nunca de centro una celda rota.
  for (let seed = 1; seed <= 50; seed++) {
    const s = tablero('contrarreloj', 1, { 0: 4 });
    romper(s, 0); s.height[0] = 4;   // rota, con altura guardada: una trampa
    s.height[23] = 3;
    s.failStreak = 3; s.rng = seed;
    T.fallback(s);
    ok(s.last.desastre && s.last.desastre.tiles[0] === 23 && !s.last.desastre.tiles.includes(0),
       `semilla ${seed}: la velutina va a la única celda viva por encima de cera, no a la rota`);
  }
}
{
  // D.1 (CR-07): el último turno de calma ya NO protege en la interfaz. El fallo
  // de la interfaz ocurre tras turn++, así que con calmaHasta = turn + 1 ya cae.
  const s = tablero('contrarreloj', 3);
  s.failStreak = 5;
  s.calmaHasta = s.turn + 2;
  eq(T.siguienteDesastre(s), null, 'con 2 turnos de calma, fallar ahora no trae nada');
  s.calmaHasta = s.turn + 1;
  eq(T.siguienteDesastre(s), 'velutina', 'en el último turno de calma, fallar ya trae la velutina (CR-07)');
  // D.2 (CR-08): con dos amenazas activas el peldaño 2 es varroa, no polilla.
  const t = tablero('contrarreloj', 3);
  t.failStreak = 1;
  eq(T.siguienteDesastre(t), 'polilla', 'contador en 1: si fallas, polilla');
  t.desastres.push({ tipo: 'capullo', tile: 3 }, { tipo: 'seda', tiles: [20], hasta: t.turn + 5 });
  eq(T.siguienteDesastre(t), 'varroa', 'con dos amenazas activas, si fallas cae varroa (CR-08)');
  t.desastres[1].hasta = t.turn + 1;
  eq(T.siguienteDesastre(t), 'polilla', '…salvo que la seda caduque antes del fallo');
  eq(T.siguienteDesastre(tablero('invierno', 3)), null, 'sin desastres en el modo, no se anuncia nada');
}
{
  // Test de propiedad (D.3): lo que anuncia siguienteDesastre es lo que cae.
  // Partidas de contrarreloj con un jugador torpe al azar, para que falle a
  // menudo y pase por calma, capullos, dos amenazas y el contador alto. En
  // cada turno: se pide la predicción, se juega en una copia y, si hay fallo,
  // se compara. La cosecha grande se excluye porque cambia la escalera antes
  // del fallo (para eso está la pista de la interfaz).
  // Las dos amenazas a la vez no salen en partida: la única pareja posible es
  // seda + capullo, y para eso habría que bajar de la escalera con la seda
  // viva, cosa que no da tiempo (ver C.2 del encargo v7). Ese caso lo cubre el
  // bloque de arriba a mano.
  // La varroa y la velutina pueden no encontrar víctima (nada por encima de
  // cera): entonces no pasa nada, y eso también es acertar.
  const sinVictima = s => ![...s.height].some((h, i) => !s.roto[i] && h > T.CERA);
  const coincide = (s, pred, d) => d ? d.tipo === pred
    : pred === null || ((pred === 'varroa' || pred === 'velutina') && sinVictima(s));
  const cobertura = { calma: 0, ultimoCalma: 0, capullo: 0, contadorAlto: 0, bot: 0 };
  let comparados = 0, distintos = 0;
  let fallosJugados = 0, pasoMalo = 0;   // el evento fallback trae paso y meseta (v8)
  for (let seed = 1; seed <= 300; seed++) {
    const s = T.createState('contrarreloj', seed % 2 ? 'normal' : 'dificil', seed);
    let r = seed;
    const azar = n => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return ((r >>> 0) % n); };
    for (let turno = 0; turno < 150 && !s.gameOver; turno++) {
      const jugada = jugadaAlAzar(s, azar);
      const pred = T.siguienteDesastre(s);
      if (s.turn + 1 < s.calmaHasta) cobertura.calma++;
      if (s.turn + 1 === s.calmaHasta) cobertura.ultimoCalma++;
      if (s.desastres.some(d => d.tipo === 'capullo')) cobertura.capullo++;
      if (s.failStreak >= 3) cobertura.contadorAlto++;
      if (!jugada || azar(12) === 0) {
        // Como el bot: falla sin jugar, sin turn++. También de vez en cuando
        // a propósito, porque commitTurn casi nunca deja al jugador sin jugada.
        const predBot = T.siguienteDesastre(s, s.turn);
        T.fallback(s);
        cobertura.bot++; comparados++;
        if (!coincide(s, predBot, s.last.desastre)) distintos++;
        continue;
      }
      const grande = s.height[jugada.find(i => !(s.item && s.item.tipo === 'reina' && s.item.tile === i)) ?? jugada[0]] === T.MAX_LEVEL
        && jugada.length >= T.COSECHA_GRANDE;
      T.commitTurn(s, jugada);
      const ev = s.eventos.find(e => e.type === 'fallback');
      if (ev) { fallosJugados++; if (!(ev.paso > ev.meseta)) pasoMalo++; }
      if (!ev || grande) continue;
      comparados++;
      if (!coincide(s, pred, ev.desastre)) distintos++;
    }
  }
  ok(comparados > 1000, `el test de propiedad compara muchos fallos (${comparados})`);
  eq(distintos, 0, `lo que anuncia siguienteDesastre es lo que cae, en ${comparados} fallos`);
  ok(fallosJugados > 500, `el test de propiedad juega muchos fallos (${fallosJugados})`);
  eq(pasoMalo, 0, `todo fallback lleva paso > meseta, en ${fallosJugados} fallos`);
  for (const [k, n] of Object.entries(cobertura)) ok(n > 0, `el test de propiedad pasa por «${k}» (${n})`);
}

// --- la dificultad es consecuencia, no condición (v5) ---------------------------------
{
  eq(T.ROTAS_ARRANQUE.invierno.normal, 0, 'el panal de Invierno empieza entero');
  eq(T.ROTAS_ARRANQUE.invierno.dificil, 0, '…también en difícil');
  eq(T.ROTAS_ARRANQUE.contrarreloj.dificil, 0, '…y el de contrarreloj');
  eq(T.HELADA_MUERDE.normal, 1, 'Invierno normal: la helada rompe 1 celda por fallo');
  eq(T.HELADA_MUERDE.dificil, 2, 'Invierno difícil: rompe 2');
  const n = tablero('invierno', 3, {}, 'normal');
  const d = tablero('invierno', 3, {}, 'dificil');
  T.fallback(n); T.fallback(d);
  eq(rotas(n), 1, 'un fallo en normal se lleva una celda');
  eq(rotas(d), 2, 'el mismo fallo en difícil se lleva dos');
  ok(T.RELOJ_ACELERA.dificil > T.RELOJ_ACELERA.normal, 'el reloj de difícil acelera más');
  const p = tablero('contrarreloj', 1, {}, 'normal'), q = tablero('contrarreloj', 1, {}, 'dificil');
  p.turn = q.turn = 20;
  ok(T.velocidadReloj(q) > T.velocidadReloj(p), '…y se nota en la velocidad del reloj');
}

// --- la reina cuenta en el cálculo de meseta (v5) --------------------------------------
{
  // Dos celdas de nivel 2 separadas por una de nivel 3. Sin la reina no hay
  // jugada de 3; con ella sí, y el motor tiene que saberlo o declara un fallo
  // habiendo jugada (el espejo del cuelgue fantasma).
  const s = tablero('libre', 1);
  for (let i = 3; i < T.TILE_COUNT; i++) romper(s, i);
  s.height[0] = 2; s.height[1] = 3; s.height[2] = 2;
  s.step = 3;
  eq(T.biggestCoherentArea(s), 1, 'sin reina, la mayor meseta es 1');
  s.item = { tile: 1, tipo: 'reina', caduca: s.turn + T.ITEM_TURNOS };
  ok(T.isValidDrag(s, [0, 1, 2]), 'con la reina, el arrastre de 3 es válido');
  eq(T.biggestCoherentArea(s), 3, '…y el cálculo de meseta lo ve (v5)');
  s.item = { tile: 1, tipo: 'jalea', caduca: s.turn + T.ITEM_TURNOS };
  eq(T.biggestCoherentArea(s), 1, 'sólo la reina es comodín, no cualquier ítem');
}

// --- la gota se evapora (v5) -----------------------------------------------------------
{
  eq(T.ITEM_TURNOS, 2, 'la gota espera 2 turnos');
  const s = tablero('libre', 1);
  s.item = { tile: 5, tipo: 'jalea', caduca: s.turn + T.ITEM_TURNOS };
  s.turn += 1; T.caducarItem(s);
  ok(s.item, 'al turno siguiente sigue ahí');
  s.turn += 1; T.caducarItem(s);
  ok(!s.item, 'al segundo se ha evaporado');
  // y la calma impide que salga otro inmediatamente
  const u = tablero('libre', 1);
  u.itemCalma = u.turn + T.ITEM_CALMA;
  ok(!T.spawnItemIfEarned(u), 'durante la calma no sale ítem nuevo');
  u.turn += T.ITEM_CALMA;
  ok(T.spawnItemIfEarned(u), '…y después sí');
}

// --- el reloj espera al primer arrastre (v5, T-10) -------------------------------------
{
  const s = T.createState('contrarreloj', 'normal', 7);
  const r0 = s.reloj;
  T.tick(s, 5);
  eq(s.reloj, r0, 'el reloj no corre antes del primer arrastre');
  T.commitTurn(s, [findNivel(s)]);
  T.tick(s, 5);
  ok(s.reloj < r0, '…y sí después');
}

// --- el humo vuelve (v5, T-21) ---------------------------------------------------------
{
  const s = tablero('invierno', 1);
  ok(!T.itemsUtiles(s).includes('humo'), 'sin celdas rotas no sale humo');
  romper(s, 23); s.heladas.push(23);
  ok(T.itemsUtiles(s).includes('humo'), 'con una celda rota por la helada, sí');
  ok(!T.itemsUtiles(tablero('contrarreloj', 1)).includes('humo'), 'y nunca en contrarreloj');
  s.item = { tile: 0, tipo: 'humo', caduca: s.turn + T.ITEM_TURNOS };
  T.commitTurn(s, [0]);
  eq(s.roto[23], 0, 'el humo devuelve la celda al panal');
  eq(s.height[23], T.AGUA, '…como agua, no como cera');
}

// --- el propóleo necesita agua de verdad (v4, QA CR-01) --------------------------------
{
  const poca = tablero('invierno', 1, { 0: 0, 1: 0 });
  ok(!T.itemsUtiles(poca).includes('propoleo'), 'con 2 celdas de agua NO se ofrece propóleo');
  const bastante = tablero('invierno', 1, { 0: 0, 1: 0, 2: 0 });
  ok(T.itemsUtiles(bastante).includes('propoleo'), 'con 3 sí');
  const seca = tablero('invierno', 1);
  ok(!T.itemsUtiles(seca).includes('propoleo'), 'sin agua, nunca');
  eq(T.PROPOLEO_MIN_AGUA, 3, 'el mínimo de agua del propóleo es 3');
  ok(!T.itemsUtiles(tablero('invierno', 1)).includes('nectar'), 'el néctar no sale sin reloj');
  ok(T.itemsUtiles(tablero('contrarreloj', 1)).includes('nectar'), '…y sí con reloj');
}

// --- umbral de ítems proporcional al panal vivo (v4, T-26) -----------------------------
{
  const entero = tablero('invierno', 0);
  eq(T.umbralItem(entero, 1), 14, 'panal de 24: el umbral es el del original (14 de cera)');
  eq(T.umbralItem(entero, 5), 6, '…y 6 de abeja');
  const mordido = tablero('invierno', 0);
  romper(mordido, 0, 1, 2, 3, 4, 5);
  eq(T.tilesPlayable(mordido), 18, 'panal de 18 vivas');
  eq(T.umbralItem(mordido, 1), 11, 'con 18 vivas el umbral de cera baja a 11, no sigue en 14');
  const resto = tablero('invierno', 0);
  for (let i = 0; i < 20; i++) romper(resto, i);
  eq(T.umbralItem(resto, 1), 3, 'con 4 vivas el umbral se queda en el suelo de 3');
  ok(T.umbralItem(resto, 1) <= T.tilesPlayable(resto), '…y el suelo nunca pide más celdas de las que hay');
}

// --- ítems (§8) -----------------------------------------------------------------------
{
  const s = tablero('invierno', 0, { 0: 1, 1: 1 });
  eq(T.spawnItemIfEarned(s), null, 'sin celdas suficientes a un nivel no sale ítem');
  const t = tablero('invierno', 1);
  ok(T.spawnItemIfEarned(t) !== null, 'con 14 de cera sale un ítem');
  for (let seed = 1; seed <= 200; seed++) {
    const u = tablero('invierno', 1); u.rng = (seed * 2654435761) >>> 0 || 1;
    const it = T.spawnItemIfEarned(u);
    ok(it.tipo !== 'propoleo' && it.tipo !== 'nectar' && it.tipo !== 'humo',
       `semilla ${seed}: en Invierno sin agua no salen propóleo, néctar ni humo`);
  }
}
{
  const s = tablero('libre', 1, { 3: 0 });
  s.item = { tile: 0, tipo: 'jalea', caduca: s.turn + T.ITEM_TURNOS };
  T.commitTurn(s, [0]);
  eq(s.last.item, 'jalea', 'al pasar la cadena por el ítem se recoge');
  eq(s.height[1], 2, 'jalea: todo el panal sube un nivel');
  eq(s.height[3], 0, 'jalea: el agua no sube');
}
{
  const s = romper(tablero('invierno', 1, { 3: 0, 4: 0 }), 23);
  s.item = { tile: 0, tipo: 'propoleo', caduca: s.turn + T.ITEM_TURNOS };
  T.commitTurn(s, [0]);
  eq(contar(s, 0), 0, 'propóleo: toda el agua sube a cera');
  eq(s.roto[23], 1, 'propóleo: no resucita celdas rotas');
  // v4: hace falta PROPOLEO_MIN_AGUA celdas de agua, no una suelta (CR-01).
  const u = tablero('invierno', 1, { 3: 0, 4: 0, 5: 0 });
  let sale = false;
  for (let seed = 1; seed <= 200 && !sale; seed++) {
    u.item = null; u.itemCalma = 0; u.rng = (seed * 2654435761) >>> 0 || 1;
    const it = T.spawnItemIfEarned(u);
    if (it && it.tipo === 'propoleo') sale = true;
  }
  ok(sale, 'el propóleo ya sale en Invierno si hay agua');
}
{
  const s = tablero('libre', 1);
  s.item = { tile: 0, tipo: 'danza', caduca: s.turn + T.ITEM_TURNOS };
  T.commitTurn(s, [0]);
  ok(s.danza, 'danza: el próximo arrastre es libre');
  ok(T.isValidDrag(s, [5, 6, 11, 12, 10]), 'con danza vale cualquier longitud');
  T.commitTurn(s, [5, 6, 11, 12, 10]);
  eq(s.step, 2, 'la ronda de la danza no mueve el paso');
  ok(!s.danza, 'la danza se gasta');
}
{
  const s = tablero('contrarreloj', 1);
  s.reloj = 50;
  s.item = { tile: 0, tipo: 'nectar', caduca: s.turn + T.ITEM_TURNOS };
  T.commitTurn(s, [0]);
  eq(s.reloj, 65, 'néctar: +15 s');
}
{
  // El humo sale en Invierno en cuanto la helada ha roto algo (v5), y deshace
  // la última rotura. Hasta la v6 este bloque decía lo contrario («el humo no
  // sale») y pasaba por vacío: no reiniciaba itemCalma, así que tras el primer
  // ítem no salía ninguno más y la comprobación no miraba nada.
  const s = tablero('invierno', 1);
  T.fallback(s);
  const rota = T.SPIRAL[0];
  let sale = false;
  for (let seed = 1; seed <= 200 && !sale; seed++) {
    s.item = null; s.itemCalma = 0; s.rng = (seed * 2654435761) >>> 0 || 1;
    const it = T.spawnItemIfEarned(s);
    if (it && it.tipo === 'humo') sale = true;
  }
  ok(sale, 'con una celda rota, el humo sale de verdad en Invierno');
  s.item = { tile: 5, tipo: 'humo', caduca: s.turn + T.ITEM_TURNOS };
  T.commitTurn(s, [5]);
  eq(s.roto[rota], 0, 'humo: la celda rota vuelve al panal');
  eq(s.height[rota], T.AGUA, '…como agua, no como cera');
}
{
  const s = tablero('libre', 1, { 1: 4 });
  s.item = { tile: 1, tipo: 'reina', caduca: s.turn + T.ITEM_TURNOS };
  s.step = 3;
  ok(T.isValidDrag(s, [0, 1, 2]), 'reina: la cadena la atraviesa aunque esté a otro nivel');
  T.commitTurn(s, [0, 1, 2]);
  eq(s.height[1], 2, 'reina: la celda sigue a la cadena');
}

// --- reloj (§9) -------------------------------------------------------------------------
{
  eq(T.segundosCosecha(1), 2, 'cosechar 1 da 2 s');
  eq(T.segundosCosecha(6), 27, 'cosechar 6 da 27 s');
  const s = tablero('contrarreloj', 1);
  s.reloj = 90;
  T.sumarTiempo(s, 27);
  eq(s.reloj, 99, 'techo de 99 s');
  eq(s.score, 18 * T.PUNTOS_POR_SEGUNDO, 'el exceso se convierte en puntos');
  s.turn = 50;
  eq(T.velocidadReloj(s), 1.5, 'turno 50 en normal: el reloj va a ×1,5');
  s.reloj = 1;
  s.arrancado = true;   // v5: el reloj no corre hasta el primer arrastre
  T.tick(s, 1);
  ok(s.gameOver, 'el contrarreloj termina cuando se acaba el reloj');
  const i = tablero('invierno', 1);
  T.tick(i, 1000);
  ok(!i.gameOver, 'Invierno no tiene reloj');
}

// --- los textos leen los números de las constantes (v7) ----------------------------------
{
  ok(T.DESASTRE_INFO.seda.que.includes(`${T.SEDA_TURNOS} turnos`), 'el texto de la seda lleva SEDA_TURNOS');
  ok(T.DESASTRE_INFO.velutina.que.includes(`${T.CALMA_TRAS_VELUTINA} turnos`) &&
     T.DESASTRE_INFO.velutina.que.includes('cosecha grande'), 'el de la velutina, la calma y cómo se baja');
  ok(!/tierra/i.test(JSON.stringify(T.ITEM_INFO)), 'ningún ítem habla de «tierra» (v7)');
  const s = tablero('libre', 1, { 5: 5, 6: 5, 11: 5, 12: 5, 10: 5 });
  eq(T.mesetaDeNivel(s, 5), 5, 'mesetaDeNivel cuenta la meseta de abejas');
  eq(T.mesetaDeNivel(s, 1), 19, '…y la de cera, por separado');
}

// --- el bot tonto, en js/ desde la v9 (T-40) ----------------------------------------------
// Lo usa el panal vivo de la pantalla de inicio. Si el bundle no lo expusiera
// saldría undefined, y el bot de mediciones fallaría sin avisar.
{
  for (const f of ['rng', 'shuffled', 'buscarJugada', 'elegirJugada'])
    eq(typeof T[f], 'function', `el bundle expone ${f}`);
  // Estados al azar de los tres modos: lo que devuelve es una jugada válida, y
  // sólo devuelve null cuando de verdad no la hay.
  let probados = 0, invalidas = 0, nullsFalsos = 0;
  for (let seed = 1; probados < 200; seed++) {
    const modo = ['contrarreloj', 'invierno', 'libre'][seed % 3];
    const s = T.createState(modo, seed % 2 ? 'normal' : 'dificil', seed);
    let r = seed;
    const azar = n => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return ((r >>> 0) % n); };
    const vueltas = azar(40);
    for (let k = 0; k < vueltas && !s.gameOver; k++) {
      const j = jugadaAlAzar(s, azar);
      if (!j || !T.commitTurn(s, j)) T.fallback(s);
    }
    if (s.gameOver) continue;
    const c = T.elegirJugada(s, T.rng(seed));
    probados++;
    if (c && !T.isValidDrag(s, c)) invalidas++;
    if (!c && T.biggestCoherentArea(s) >= s.step) nullsFalsos++;
  }
  eq(invalidas, 0, 'elegirJugada sólo devuelve jugadas válidas (200 estados)');
  eq(nullsFalsos, 0, '…y null sólo cuando el paso no cabe');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'bot-tonto.js'), 'utf8');
  ok(!/document\.|window\.|Math\.random/.test(src.replace(/\/\/.*$/gm, '')),
     'bot-tonto.js no usa DOM ni Math.random');
}

// --- los bots juegan Puzzle (02-10) -------------------------------------------------------
// `npm run bot … puzzle` juega los niveles de js/puzles.js. Lo que no puede pasar:
// que el bot no encuentre jugada habiéndola (cuelgue fantasma), que se cuelgue, o
// que el que mira el objetivo no gane un nivel que se gana a la primera. C1-03 lo
// gana siempre el prudente (100 % el 02-10, 200 partidas).
{
  const { execFileSync } = require('child_process');
  const sale = execFileSync(process.execPath, [require('path').join(__dirname, 'bot.js'), '20', '1', 'puzzle', 'C1', 'todos'],
                            { encoding: 'utf8', timeout: 120000 });
  ok(/cuelgues fantasma: ninguno/.test(sale), 'el bot juega Puzzle sin cuelgues fantasma');
  // Columnas: nivel, tipo, mín, nota y una por bot (tonto, prudente, …).
  const fila = (sale.split('\n').find(l => l.startsWith('C1-03')) || '').trim().split(/\s{2,}/);
  eq(fila[5], '100 %', 'el prudente gana siempre C1-03');
  eq((sale.match(/^C1-\d\d /gm) || []).length, T.PUZLES.filter(p => p.capitulo === 1).length, 'una fila por nivel del capítulo 1');

  // Y los candidatos de un lote de la máquina (02-10, para el agente de puzles): un
  // lote de un solo candidato, que es C1-03 con la forma de los lotes.
  const os = require('os'), path = require('path'), fs = require('fs');
  const { id, capitulo, orden, minimo, solucion, origen, ...nivel } = T.PUZLES.find(p => p.id === 'C1-03');
  const lote = path.join(os.tmpdir(), `lote-prueba-${process.pid}.jsonl`);
  fs.writeFileSync(lote, JSON.stringify({ id: 'L-PRUEBA-01', nivel, minimo, solucion, eval: { nota: 'fácil' } }) + '\n');
  const deLote = execFileSync(process.execPath, [require('path').join(__dirname, 'bot.js'), '20', '1', 'puzzle', lote, 'prudente'],
                              { encoding: 'utf8', timeout: 120000 });
  fs.unlinkSync(lote);
  const filaLote = (deLote.split('\n').find(l => l.startsWith('L-PRUEBA-01')) || '').trim().split(/\s{2,}/);
  eq(filaLote[4], '100 %', 'el bot juega un lote: el prudente gana el candidato (C1-03) siempre');
}

// --- guardar y continuar una partida (v9.1, T-41) -----------------------------------------
// Lo que se guarda pasa por JSON (localStorage sólo guarda texto) y al volver
// tiene que ser LA MISMA partida: mismo tablero y mismo azar, así que jugando
// igual después sale exactamente lo mismo que sin haber salido.
{
  for (const f of ['serializarPartida', 'restaurarPartida'])
    eq(typeof T[f], 'function', `el bundle expone ${f}`);
  const foto = s => JSON.stringify(T.serializarPartida(s));
  const avanzar = (s, R, n) => {
    for (let k = 0; k < n && !s.gameOver; k++) {
      T.tick(s, 2.5);
      if (s.gameOver) break;
      const c = T.elegirJugada(s, R);
      if (!c || !T.commitTurn(s, c)) T.fallback(s);
    }
  };
  let partidas = 0, distintasAlVolver = 0, distintasDespues = 0, conItem = 0, conDesastres = 0, conRotas = 0;
  for (let seed = 1; seed <= 90; seed++) {
    const modo = ['contrarreloj', 'invierno', 'libre'][seed % 3];
    const s = T.createState(modo, seed % 2 ? 'normal' : 'dificil', seed);
    avanzar(s, T.rng(seed), 5 + (seed * 7) % 60);
    if (s.gameOver) continue;
    s.streakMax = 3; s.jugadaMax = 7;
    partidas++;
    if (s.item) conItem++;
    if (s.desastres.length) conDesastres++;
    if (s.roto.some(Boolean)) conRotas++;
    const texto = JSON.stringify(T.serializarPartida(s, { duracion: 12.5 }));
    const r = T.restaurarPartida(JSON.parse(texto));
    if (!r || foto(r) !== foto(s)) { distintasAlVolver++; continue; }
    if (r.streakMax !== 3 || r.jugadaMax !== 7) distintasAlVolver++;
    // Las dos siguen con las mismas jugadas: tienen que acabar igual.
    avanzar(s, T.rng(seed + 1000), 40);
    avanzar(r, T.rng(seed + 1000), 40);
    if (foto(r) !== foto(s)) distintasDespues++;
  }
  ok(partidas >= 60, `se prueban partidas a medias de verdad (${partidas})`);
  ok(conItem > 0 && conDesastres > 0 && conRotas > 0, 'entre ellas, con ítem en el panal, con plagas y con celdas rotas');
  eq(distintasAlVolver, 0, 'guardar y leer (pasando por JSON) devuelve la misma partida');
  eq(distintasDespues, 0, '…y seguir jugándola da lo mismo que sin haber salido (el azar también se guarda)');
  const r0 = T.restaurarPartida(JSON.parse(JSON.stringify(T.serializarPartida(T.createState('invierno', 'normal', 5)))));
  // instanceof no sirve: el motor vive en otro contexto de vm, con sus propios tipos.
  ok(r0.height.constructor.name === 'Uint8Array' && r0.sedaHasta.constructor.name === 'Int32Array', 'los arrays vuelven con su tipo');
  eq(r0.last, null, 'lo del último turno no se guarda');

  // Una partida guardada rota no se juega: se descarta entera.
  const buena = () => JSON.parse(JSON.stringify(T.serializarPartida(T.createState('contrarreloj', 'normal', 9))));
  const rotas = [
    ['nada', null], ['texto', 'hola'], ['vacío', {}],
    ['otra versión', { ...buena(), v: 99 }],
    ['modo que no existe', (g => (g.estado.modo = 'pecoreo', g))(buena())],
    ['dificultad que no existe', (g => (g.estado.dificultad = 'dura', g))(buena())],
    ['panal de 23 celdas', (g => (g.estado.height.pop(), g))(buena())],
    ['nivel 9', (g => (g.estado.height[3] = 9, g))(buena())],
    ['reloj que no es número', (g => (g.estado.reloj = null, g))(buena())],
    ['paso 0', (g => (g.estado.step = 0, g))(buena())],
    ['ítem fuera del panal', (g => (g.estado.item = { tile: 40, tipo: 'jalea' }, g))(buena())],
    ['ítem que no existe', (g => (g.estado.item = { tile: 3, tipo: 'miel' }, g))(buena())],
    ['plaga sin tipo', (g => (g.estado.desastres = [{ tile: 2 }], g))(buena())],
    ['helada fuera del panal', (g => (g.estado.heladas = [30], g))(buena())],
  ];
  for (const [nombre, g] of rotas) eq(T.restaurarPartida(g), null, `se descarta una partida guardada con ${nombre}`);
  ok(T.restaurarPartida(buena()) !== null, '…y la buena, no');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'guardado.js'), 'utf8');
  ok(!/document\.|window\.|localStorage|Math\.random/.test(src.replace(/\/\/.*$/gm, '')),
     'guardado.js no toca DOM, localStorage ni Math.random');
}

// --- tableros por partida (v10, T-43) -------------------------------------------------------
{
  const p24 = T.TABLEROS.panal24, h37 = T.TABLEROS.hex37;
  eq(p24.n, 24, 'panal24 tiene 24 celdas');
  ok(p24.adj === T.ADJ, 'panal24 usa la tabla ADJ de siempre');
  eq(h37.n, 37, 'hex37 tiene 37 celdas');
  let simetrica = true;
  h37.adj.forEach((vs, i) => vs.forEach(v => { if (!h37.adj[v].includes(i)) simetrica = false; }));
  ok(simetrica, 'la adyacencia de hex37 es simétrica');
  // Las 19 de dentro tienen la adyacencia del hexágono de 19 (3-4-5-4-3).
  const dentro = [...Array(37).keys()].filter(i => !T.CERRADAS_EXPANSION.includes(i));
  eq(dentro.length, 19, 'quedan 19 celdas dentro del anillo');
  const h19 = T.buildAdjacency([3, 4, 5, 4, 3]);
  ok(dentro.every((i, k) => JSON.stringify(h37.adj[i].filter(v => dentro.includes(v)).map(v => dentro.indexOf(v))) === JSON.stringify(h19[k])),
     'las 19 de dentro se tocan como el hexágono de 19');
  const esquinas = [0, 3, 15, 21, 33, 36];
  ok(esquinas.every(i => h37.adj[i].filter(v => dentro.includes(v)).length === 1),
     'las 6 esquinas del anillo tocan una sola celda de dentro');
  for (const m of ['contrarreloj', 'invierno', 'libre', 'contagio'])
    eq(T.createState(m, 'normal', 3).height.length, 24, `${m} juega en el panal de 24`);
  eq(T.createState('expansion', 'normal', 3).height.length, 37, 'expansion juega en el de 37');
  eq(T.vecinas(T.createState('expansion', 'normal', 3), 18).length, 6, 'vecinas() pregunta al tablero de la partida');
}

// --- Contagio: las huellas (v10, T-42) -------------------------------------------------------
{
  const marcadas = s => s.huellas.reduce((n, g) => n + g.tiles.length, 0);
  // La varroa deja huella en Contagio y en Contrarreloj no.
  for (const [m, espera] of [['contagio', 1], ['contrarreloj', 0]]) {
    const s = tablero(m, T.HUEVO, { 5: T.OPERCULADA });
    s.turn = 10; s.failStreak = 0; s.eventos = [];
    T.fallback(s);
    eq(marcadas(s), espera, `${m}: la varroa ${espera ? 'deja' : 'no deja'} huella`);
    if (espera) {
      eq(s.huellas[0].tiles[0], 5, 'la huella es la celda que ha bajado a cera');
      eq(s.huellas[0].proximo, 10 + T.CONTAGIO_CADA.normal, 'el grupo crece dentro de CONTAGIO_CADA turnos');
      ok(s.eventos.some(e => e.type === 'marca'), 'con el evento marca');
    }
  }
  // Varroa sin víctima: no hay huella.
  {
    const s = tablero('contagio', T.CERA);
    s.eventos = []; T.fallback(s);
    eq(s.huellas.length, 0, 'una varroa sin nada que bajar no deja huella');
  }
  // La velutina marca su zona; lo ya marcado no se vuelve a marcar.
  {
    const s = tablero('contagio', T.LARVA);
    s.huellas = [{ tipo: 'varroa', tiles: [...Array(24).keys()].filter(i => i !== 11), proximo: 99 }];
    s.failStreak = 3; s.eventos = []; T.fallback(s);
    const vel = s.huellas.find(g => g.tipo === 'velutina');
    ok(!vel || (vel.tiles.length === 1 && vel.tiles[0] === 11), 'la velutina sólo se queda las celdas que no estaban marcadas');
  }
  // El contagio: crece el grupo, sólo sobre cría, en su turno.
  {
    const s = tablero('contagio', T.CERA, { 11: T.CERA, 12: T.LARVA });
    s.huellas = [{ tipo: 'varroa', tiles: [11], proximo: 5 }];
    s.turn = 4; s.eventos = []; T.contagiar(s);
    eq(marcadas(s), 1, 'antes de su turno no crece');
    eq(T.contagioInminente(s).length, 1, '…pero avisa el turno antes');
    s.turn = 5; T.contagiar(s);
    ok(s.huellas[0].tiles.includes(12), 'en su turno crece hacia la única vecina con cría');
    eq(s.huellas[0].proximo, 5 + T.CONTAGIO_CADA.normal, 'y el periodo vuelve a empezar');
    ok(s.eventos.some(e => e.type === 'contagia' && e.tile === 12), 'con el evento contagia');
    eq(s.height[12], T.CERA, 'la celda contagiada baja a cera (v10.1)');
    ok(s.eventos.some(e => e.type === 'contagia' && e.desde === T.LARVA), 'y el evento dice de qué nivel bajó');
  }
  // v10.1: al bajar a cera, el contagio puede romper la meseta en ese mismo turno.
  {
    const s = tablero('contagio', T.CERA, { 0: T.LARVA, 1: T.LARVA, 2: T.LARVA, 3: T.LARVA, 23: T.AGUA });
    s.huellas = [{ tipo: 'varroa', tiles: [5], proximo: 1 }];
    s.height[5] = T.CERA;
    for (const i of [4, 6]) s.height[i] = T.AGUA;
    // Las cuatro larvas de la fila de arriba son la única meseta de 4; la huella
    // de 5 toca 0 y 1: al contagiar una, el paso 4 deja de caber y hay fallo.
    for (let i = 7; i < 24; i++) if (s.height[i] === T.CERA) s.height[i] = (i % 2 ? T.AGUA : T.MAX_LEVEL);
    s.step = 1; s.eventos = [];
    T.commitTurn(s, [23]);   // agua → cera; turno 1: le toca al grupo
    const c = s.eventos.find(e => e.type === 'contagia');
    ok(c && [0, 1].includes(c.tile) && s.height[c.tile] === T.CERA, 'el contagio baja a cera una larva de la meseta');
  }
  {
    const s = tablero('contagio', T.CERA, { 12: T.MAX_LEVEL, 13: T.AGUA });
    s.huellas = [{ tipo: 'varroa', tiles: [11], proximo: 5 }];
    s.turn = 5; s.eventos = []; T.contagiar(s);
    eq(marcadas(s), 1, 'no crece sobre cera, agua ni abeja (cortafuegos)');
    eq(s.huellas[0].proximo, 5 + T.CONTAGIO_CADA.normal, 'sin vecina válida, el periodo vuelve a empezar (no se queda cargado)');
  }
  {
    const s = tablero('contagio', T.HUEVO, {}, 'dificil');
    s.turn = 0; s.failStreak = 0; s.height[3] = T.LARVA; s.eventos = []; T.fallback(s);
    eq(s.huellas[0].proximo, T.CONTAGIO_CADA.dificil, 'en difícil crece antes');
  }
  // Limpiar: cosechar sí, subir no.
  {
    const s = tablero('contagio', T.HUEVO, { 0: T.MAX_LEVEL, 1: T.MAX_LEVEL });
    s.huellas = [{ tipo: 'velutina', tiles: [0, 1, 5], proximo: 99 }];
    s.step = 1; T.commitTurn(s, [5]);
    eq(marcadas(s), 3, 'subir de nivel una celda marcada no la limpia');
    s.step = 2; T.commitTurn(s, [0, 1]);
    eq(marcadas(s), 1, 'cosecharla sí');
    ok(s.eventos.some(e => e.type === 'limpiaHuella' && e.tiles.length === 2), 'con el evento limpiaHuella');
  }
  // El capullo: cualquier cosecha a su lado lo quita.
  {
    const s = tablero('contagio', T.HUEVO, { 0: T.MAX_LEVEL });
    s.desastres = [{ tipo: 'capullo', tile: 5 }];
    eq(T.celdasMarcadas(s), 1, 'el capullo cuenta como una celda marcada');
    s.step = 1; T.commitTurn(s, [0]);
    eq(s.desastres.length, 0, 'una cosecha de 1 junto al capullo lo quita');
  }
  // El final: por turnos, cada celda marcada resta, y no se baja de 0.
  for (const [antes, despues] of [[10000, 6000], [2000, 0]]) {
    const s = tablero('contagio', T.HUEVO, { 12: T.AGUA });   // subir agua no da puntos
    s.huellas = [{ tipo: 'velutina', tiles: [20, 21, 22], proximo: 999 }];
    s.desastres = [{ tipo: 'capullo', tile: 3 }];
    s.turn = T.TURNOS_CONTAGIO - 1; s.step = 1; s.score = antes;
    T.commitTurn(s, [12]);
    ok(s.gameOver, `la partida acaba en el turno ${T.TURNOS_CONTAGIO}`);
    eq(s.score, despues, `${antes} puntos con 4 celdas marcadas quedan en ${despues}`);
    ok(s.cierre && s.cierre.marcadas === 4 && s.cierre.bruto === antes, 'el recuento del final lo guarda el motor');
  }
  eq(T.turnosRestantes(T.createState('contagio', 'normal', 1)), T.TURNOS_CONTAGIO, 'turnos que quedan al empezar');
}

// --- Expansión: el panal que crece (v10, T-44) -------------------------------------------------
{
  const s0 = T.createState('expansion', 'normal', 11);
  eq([...s0.cerrada].filter(Boolean).length, 18, 'empieza con el anillo de 18 cerrado');
  eq(T.tilesPlayable(s0), 19, 'el panal vivo son las 19 de dentro');
  const dentro = [...Array(37).keys()].filter(i => !s0.cerrada[i]);
  const cuenta = h => dentro.filter(i => s0.height[i] === h).length;
  ok(cuenta(T.AGUA) === 10 && cuenta(T.CERA) === 6 && cuenta(T.HUEVO) === 3, 'cupos 10/6/3 en las de dentro');
  ok(T.CERRADAS_EXPANSION.every(i => !T.jugable(s0, i)), 'una celda cerrada no se juega');
  eq(T.celdasQueGana(4), T.ABRE_COSECHA_PEQUENA, 'una cosecha pequeña abre ABRE_COSECHA_PEQUENA');
  ok(T.celdasQueGana(5) === 1 && T.celdasQueGana(7) === 2 && T.celdasQueGana(8) === 3 && T.celdasQueGana(9) === 4 && T.celdasQueGana(12) === 4,
     'la escala: 5-6 → 1, 7 → 2, 8 → 3, 9 o más → 4');
  // v10.1: normal es la escala de peldanosQueBaja; difícil, la D3.
  ok([5, 6, 7, 8, 9, 10, 15].every(L => T.celdasQueGana(L, 'normal') === Math.min(T.peldanosQueBaja(L), T.ESCALERA_TOPE)),
     'en normal, la escala es la de peldanosQueBaja');
  eq([4, 5, 6, 7, 8, 9, 10, 15].map(L => T.celdasQueGana(L, 'dificil')).join(','), '0,0,0,1,2,3,4,4',
     'en difícil (D3): 5 y 6 no abren, 7 → 1, 8 → 2, 9 → 3, 10 o más → 4');
  ok(T.abreDesde('normal') === 5 && T.abreDesde('dificil') === 7, 'abre desde una cosecha de 5 en normal y de 7 en difícil');
  ok(T.TOPE_EXPANSION.normal === 150 && T.TOPE_EXPANSION.dificil === 200, 'topes 150 y 200');
  ok(T.tieneDificultad('expansion') && T.tieneDificultad('contagio') && !T.tieneDificultad('libre'), 'Expansión tiene dificultad; Panal libre no');

  const preparar = (celdas) => {
    const s = T.createState('expansion', 'normal', 11);
    for (const i of dentro) s.height[i] = T.HUEVO;
    for (const i of celdas) s.height[i] = T.MAX_LEVEL;
    s.step = celdas.length; s.item = null;
    return s;
  };
  // 6 toca las cerradas 1 y 2; el resto son del centro.
  const siete = [6, 11, 12, 17, 18, 19, 24];
  {
    const s = preparar(siete);
    const q = T.celdasQueAbriria(s, siete);
    ok(q.gana === 2 && q.tocadas.length === 2 && q.abre === 2, 'una cosecha de 7 que toca 2 cerradas abriría 2');
    T.commitTurn(s, siete);
    ok(!s.cerrada[1] && !s.cerrada[2], 'y las abre');
    ok(s.height[1] === T.AGUA && s.height[2] === T.AGUA, 'como agua');
    eq(T.abiertas(s), 2, 'abiertas() lo cuenta');
  }
  {
    const ocho = [...siete, 25];
    const s = preparar(ocho);
    T.commitTurn(s, ocho);
    const ev = s.eventos.find(e => e.type === 'abre');
    ok(ev && ev.gana === 3 && ev.tocadas === 2 && ev.tiles.length === 2, 'una de 8 que sólo toca 2 abre 2: la tercera se pierde');
  }
  {
    const cinco = [5, 6, 7, 11, 12];
    const s = preparar(cinco);
    T.commitTurn(s, cinco);
    eq(T.abiertas(s), 1, 'una de 5 que toca 6 cerradas abre 1, elegida al azar');
  }
  {
    const centro = [11, 12, 17, 18, 19];
    const s = preparar(centro);
    T.commitTurn(s, centro);
    eq(T.abiertas(s), 0, 'una cosecha que no toca el borde no abre nada');
  }
  {
    const s = preparar([]);
    s.height[0] = T.AGUA;
    for (let i = 0; i < 37; i++) if (s.cerrada[i]) { s.cerrada[i] = 0; s.height[i] = T.AGUA; }
    s.cerrada[1] = 1;
    s.height[6] = T.MAX_LEVEL; s.step = 1;
    T.commitTurn(s, [6]);
    ok(!s.gameOver && s.cerrada[1] === 1, 'con ABRE_COSECHA_PEQUENA a 0, cosechar 1 no abre la última');
  }
  {
    const cinco = [5, 6, 7, 11, 12];
    const s = preparar(cinco);
    for (let i = 0; i < 37; i++) if (s.cerrada[i] && i !== 2) { s.cerrada[i] = 0; s.height[i] = T.AGUA; }
    T.commitTurn(s, cinco);
    ok(s.gameOver && s.completado, 'abrir la última completa el panal y acaba la partida');
    ok(s.eventos.some(e => e.type === 'fin' && e.completado), 'con el evento fin');
  }
  for (const dif of ['normal', 'dificil']) {
    const s = preparar([]);
    s.dificultad = dif;
    s.turn = T.TOPE_EXPANSION[dif] - 2; s.step = 1;
    T.commitTurn(s, [18]);
    ok(!s.gameOver, `en ${dif}, un turno antes del tope sigue`);
    s.step = 1; T.commitTurn(s, [17]);
    ok(s.gameOver && !s.completado, `en ${dif}, en el turno ${T.TOPE_EXPANSION[dif]} acaba sin completar`);
  }
  {
    // En difícil una cosecha de 6 que toca el borde no abre nada; una de 7, 1.
    const seis = [6, 11, 12, 17, 18, 24];
    const s = preparar(seis);
    s.dificultad = 'dificil';
    ok(T.celdasQueAbriria(s, seis).gana === 0, 'en difícil una cosecha de 6 no gana celdas');
    T.commitTurn(s, seis);
    eq(T.abiertas(s), 0, '…y no abre nada aunque toque el borde');
    const s2 = preparar(siete);
    s2.dificultad = 'dificil';
    T.commitTurn(s2, siete);
    eq(T.abiertas(s2), 1, 'en difícil una de 7 que toca 2 abre 1');
  }
  {
    const s = preparar([]);
    for (const i of dentro) s.height[i] = T.AGUA;
    T.usarItem(s, T.ITEMS.PROPOLEO);
    ok(T.CERRADAS_EXPANSION.every(i => s.cerrada[i] && s.height[i] === T.AGUA), 'el propóleo no toca las cerradas');
  }
  ok(T.createState('expansion', 'normal', 11).modo === 'expansion' && !T.CONFIG_MODO.expansion.puntua, 'Expansión no puntúa');
}

// --- guardar Contagio y Expansión (v10) --------------------------------------------------------
{
  const ida = s => T.restaurarPartida(JSON.parse(JSON.stringify(T.serializarPartida(s))));
  const c = T.createState('contagio', 'normal', 21);
  c.huellas = [{ tipo: 'varroa', tiles: [3, 4], proximo: 7 }];
  const rc = ida(c);
  ok(rc && JSON.stringify(rc.huellas) === JSON.stringify(c.huellas), 'las huellas se guardan y vuelven');
  const e = T.createState('expansion', 'normal', 21);
  e.cerrada[0] = 0;
  const re = ida(e);
  ok(re && re.cerrada.length === 37 && re.cerrada[0] === 0 && re.cerrada[1] === 1, 'las celdas cerradas se guardan y vuelven');
  const mal = g => T.restaurarPartida(g) === null;
  const base = s => JSON.parse(JSON.stringify(T.serializarPartida(s)));
  ok(mal((g => (g.estado.tablero = 'hex37', g))(base(c))), 'se descarta una partida con un tablero que no es el de su modo');
  ok(mal((g => (g.estado.huellas = [{ tipo: 'varroa', tiles: [40], proximo: 3 }], g))(base(c))), 'se descarta una huella fuera del panal');
  ok(mal((g => (g.estado.cerrada[3] = 2, g))(base(e))), 'se descarta una celda cerrada que no es 0 ni 1');
  // Una partida de la v9.1, sin los campos nuevos, sigue valiendo.
  const vieja = base(T.createState('invierno', 'normal', 4));
  delete vieja.estado.tablero; delete vieja.estado.cerrada; delete vieja.estado.huellas; delete vieja.estado.cierre; delete vieja.estado.completado;
  ok(T.restaurarPartida(vieja) !== null, 'una partida guardada en la v9.1 se puede continuar');
}

// --- Puzzle (v11, T-45) ------------------------------------------------------------------------
// Los niveles se crean del nivel (no del modo), no tienen azar ni ítems y acaban de
// cuatro maneras: ganar, fallo, regla del objetivo rota y límite gastado.
{
  // Un trozo del panal de 24 con sólo las celdas dadas vivas.
  const trozo = (vivas, niveles, paso, objetivo, minimo) => {
    const height = Array(24).fill(0);
    vivas.forEach((c, k) => { height[c] = niveles[k]; });
    return { id: 'prueba', tablero: 'panal24', rotas: [...Array(24).keys()].filter(i => !vivas.includes(i)),
             height, paso, objetivo, minimo };
  };
  const jugar = (nivel, jugadas) => { const s = T.crearPuzle(nivel); for (const c of jugadas) T.commitTurn(s, c); return s; };

  const s0 = T.crearPuzle(trozo([5, 6], [0, 0], 2, { tipo: 'marcadas', celdas: [5] }, 3));
  eq(s0.modo, T.MODOS.PUZZLE, 'crearPuzle: modo Puzzle');
  eq(s0.step, 2, 'crearPuzle: el paso de arranque es el del nivel');
  eq(s0.puzle.limite, 3 + T.PUZZLE_MARGEN, 'el límite es mínimo + PUZZLE_MARGEN');
  ok(!T.tieneDificultad(T.MODOS.PUZZLE), 'Puzzle no tiene dificultad');
  const h37 = T.crearPuzle({ id: 'x', tablero: 'hex37', rotas: [], height: Array(37).fill(1), paso: 1,
                             objetivo: { tipo: 'escalera', n: 9 }, minimo: 9 });
  ok(h37.tablero === 'hex37' && h37.height.length === 37 && h37.roto.length === 37 && h37.cerrada.length === 37,
     'el tablero sale del nivel: un puzle de 37 celdas tiene arrays de 37');

  // Fallo sin cumplir: pierde, y dice qué paso no cupo y qué meseta había.
  let s = jugar(trozo([5, 6], [0, 0], 2, { tipo: 'marcadas', celdas: [5] }, 3), [[5, 6]]);
  ok(s.gameOver && s.puzle.resultado && !s.puzle.resultado.gana, 'el fallo sin cumplir el objetivo pierde');
  eq(s.puzle.resultado.motivo, 'fallo', '…por fallo');
  eq(s.puzle.resultado.paso, 3, '…con el paso que no cupo');
  eq(s.puzle.resultado.meseta, 2, '…y la meseta que había');
  ok(s.eventos.some(e => e.type === 'puzlePerdido' && e.motivo === 'fallo'), 'evento puzlePerdido');
  ok(!T.commitTurn(s, [5]), 'acabado el nivel no se juega más');

  // Cumplir con la jugada que provoca el fallo GANA (§5.52).
  s = jugar(trozo([5, 6], [5, 5], 2, { tipo: 'marcadas', celdas: [5] }, 1), [[5, 6]]);
  ok(s.puzle.resultado && s.puzle.resultado.gana, 'cumplir aunque el paso siguiente no quepa gana');
  eq(s.puzle.resultado.estrellas, 3, '…con ★★★ en el mínimo');
  ok(s.eventos.some(e => e.type === 'puzleGanado' && e.estrellas === 3), 'evento puzleGanado');

  // Romper una regla pierde aunque la jugada cumpla el objetivo.
  s = jugar(trozo([5, 6], [5, 5], 2, { tipo: 'rojas', celdas: [5], rojas: [6] }, 1), [[5, 6]]);
  eq(s.puzle.resultado && s.puzle.resultado.motivo, 'roja', 'cosechar una roja pierde (aunque cumpla)');
  s = jugar(trozo([5, 6], [5, 5], 2, { tipo: 'orden', celdas: [5, 6] }, 1), [[5, 6]]);
  eq(s.puzle.resultado && s.puzle.resultado.motivo, 'orden', 'cosechar la A y la B a la vez pierde');
  s = jugar(trozo([0, 1, 4, 5, 6, 10, 11], [0, 0, 0, 4, 4, 0, 0], 2, { tipo: 'rojas', celdas: [5], rojas: [6] }, 3), [[5, 6]]);
  ok(s.turn === 1 && !s.puzle.resultado, 'subir una roja no pierde: sólo cosecharla');

  // Gastar el límite pierde.
  s = jugar(trozo([0, 1, 4, 5, 6, 10, 11], [0, 0, 0, 0, 0, 0, 0], 1, { tipo: 'escalera', n: 9 }, 1),
            [[5], [0, 1], [4, 10, 11]]);
  eq(s.puzle.resultado && s.puzle.resultado.motivo, 'limite', 'gastar el límite (mínimo + 2) sin cumplir pierde');

  eq(T.estrellasPuzle(4, 4), 3, '★★★ en el mínimo');
  eq(T.estrellasPuzle(5, 4), 2, '★★ con uno de más');
  eq(T.estrellasPuzle(6, 4), 1, '★ con dos de más');

  // Sin ítems: un panal grande y llano, donde en los otros modos saldrían. Cada
  // turno, un grupo conexo de `paso` celdas al mismo nivel (búsqueda en anchura).
  const grupo = (st, k) => {
    for (let a = 0; a < st.height.length; a++) {
      if (!T.jugable(st, a)) continue;
      const g = [a], visto = new Set([a]);
      for (let q = 0; q < g.length && g.length < k; q++)
        for (const v of T.vecinas(st, g[q])) if (!visto.has(v) && T.jugable(st, v) && st.height[v] === st.height[a] && g.length < k) { visto.add(v); g.push(v); }
      if (g.length === k) return g;
    }
    return null;
  };
  s = T.crearPuzle({ id: 'x', tablero: 'hex37', rotas: [], height: Array(37).fill(1), paso: 1, objetivo: { tipo: 'escalera', n: 30 }, minimo: 30 });
  let jugadas = 0;
  for (let k = 1; k <= 6; k++) if (T.commitTurn(s, grupo(s, s.step))) jugadas++;
  eq(jugadas, 6, 'el puzle llano se juega seis turnos');
  ok(s.item === null && s.eventos.every(e => e.type !== 'item'), 'en Puzzle no sale ningún ítem');
  ok(T.CONFIG_MODO.puzzle.items === false && Object.keys(T.CONFIG_MODO).filter(m => m !== 'puzzle').every(m => T.CONFIG_MODO[m].items),
     'la bandera items: sólo Puzzle la apaga');

  // Lo que pregunta la interfaz.
  const o = T.objetivoPuzle(T.crearPuzle(trozo([5, 6], [5, 5], 2, { tipo: 'orden', celdas: [6, 5] }, 1)));
  eq(o.letras[6] + o.letras[5], 'AB', 'objetivoPuzle: la A y la B');
  eq(o.frase, T.OBJETIVO_INFO.orden.frase({}), 'objetivoPuzle: la frase de OBJETIVO_INFO');
  const pr = T.progresoPuzle(jugar(trozo([5, 6, 0], [5, 0, 5], 1, { tipo: 'marcadas', celdas: [5, 0] }, 2), [[5]]));
  eq(`${pr.valor}/${pr.de}`, '1/2', 'progresoPuzle: una de dos marcadas');
  ok(Object.keys(T.OBJETIVO_INFO).length === 9, 'OBJETIVO_INFO tiene los nueve tipos');
  // La línea «Nuevo · …» de los capítulos (v11.1): una frase por tipo, sin números.
  for (const [t, info] of Object.entries(T.OBJETIVO_INFO))
    ok(typeof info.explica === 'string' && info.explica.endsWith('.') && !/\d/.test(info.explica), `OBJETIVO_INFO.${t} tiene su explica`);

  // El desbloqueo (01-10, opción b).
  const caps = [{ n: 1 }, { n: 2 }];
  const pz = [];
  for (const c of [1, 2]) for (let k = 1; k <= 10; k++) pz.push({ id: `C${c}-${k}`, capitulo: c, orden: k });
  let ab = T.abiertosPuzzle(caps, pz, {});
  eq(['C1-1', 'C1-2', 'C1-3'].map(id => ab.niveles[id]).join(','), 'abierto,abierto,cerrado', `al empezar, ${T.PUZZLE_ABIERTOS} abiertos`);
  eq(ab.siguiente, 'C1-1', 'el siguiente es el primero sin resolver');
  ok(!ab.capitulos[2].abierto && ab.niveles['C2-1'] === 'cerrado', 'el capítulo 2, cerrado');
  const mejores = { 'C1-1': { estrellas: 3 }, 'C1-3': { estrellas: 1 } };
  ab = T.abiertosPuzzle(caps, pz, mejores);
  eq(['C1-2', 'C1-4', 'C1-5'].map(id => ab.niveles[id]).join(','), 'abierto,abierto,cerrado', 'saltarse uno deja dos abiertos sin resolver');
  eq(ab.capitulos[1].estrellas, 4, 'las estrellas del capítulo');
  for (let k = 1; k <= 8; k++) mejores[`C1-${k}`] = { estrellas: 2 };
  ab = T.abiertosPuzzle(caps, pz, mejores);
  ok(ab.capitulos[2].abierto && ab.niveles['C2-1'] === 'abierto', `resolver el ${T.PUZZLE_ABRE_CAPITULO * 100} % del capítulo abre el siguiente`);
}

// --- el progreso de Puzzle se guarda y se valida (v11) ----------------------------------------
{
  const p = T.progresoPuzzleVacio();
  ok(T.apuntarPuzzle(p, 'C1-01', { gana: true, estrellas: 2, turnos: 6 }), 'se apunta la primera marca');
  ok(!T.apuntarPuzzle(p, 'C1-01', { gana: true, estrellas: 1, turnos: 7 }), 'una peor no la sustituye');
  ok(T.apuntarPuzzle(p, 'C1-01', { gana: true, estrellas: 3, turnos: 5 }), 'una mejor, sí');
  ok(!T.apuntarPuzzle(p, 'C1-02', { gana: false, motivo: 'fallo' }), 'perder no apunta nada');
  const vuelta = T.leerProgresoPuzzle(JSON.parse(JSON.stringify(p)));
  eq(JSON.stringify(vuelta), JSON.stringify(p), 'el progreso vuelve igual de JSON');
  const raro = T.leerProgresoPuzzle({ v: 1, mejores: { a: { estrellas: 3, turnos: 4 }, b: { estrellas: 7, turnos: 2 }, c: null } });
  eq(Object.keys(raro.mejores).join(','), 'a', 'una marca rara se olvida, las demás se quedan');
  eq(Object.keys(T.leerProgresoPuzzle({ v: 9 }).mejores).length, 0, 'otra versión: progreso vacío');
  const sp = T.crearPuzle(T.PUZLES[0]);
  T.commitTurn(sp, T.PUZLES[0].solucion[0]);
  eq(T.restaurarPartida(T.serializarPartida(sp)), null, 'una partida de Puzzle no se restaura');
}

// --- los niveles de js/puzles.js siguen valiendo ------------------------------------------------
// Si un día cambia una regla del motor, esto dice qué niveles se rompen: cada uno se
// gana con su solución, con ★★★ en su mínimo, y el resolutor de la máquina no
// encuentra nada más corto (LC-Puzles; es lo mismo que `npm run puzles -- verificar`).
{
  eq(T.PUZLES_VERSION, 1, 'js/puzles.js: versión 1');
  const ids = new Set(T.PUZLES.map(p => p.id));
  eq(ids.size, T.PUZLES.length, 'js/puzles.js: ids sin repetir');
  ok(T.PUZLES.every(p => T.CAPITULOS.some(c => c.n === p.capitulo)), 'cada nivel es de un capítulo que existe');
  const { buscar } = require('../puzles/buscador.js');
  const { juegoDeNivel } = require('../puzles/colmena.js');
  let ganan = 0, minimos = 0;
  for (const p of T.PUZLES) {
    const s = T.crearPuzle(p);
    for (const c of p.solucion) T.commitTurn(s, c);
    const r = s.puzle.resultado;
    if (r && r.gana && r.turnos === p.minimo && r.estrellas === 3) ganan++;
    else console.log(`  ${p.id}: su solución no lo gana con ★★★`);
    const b = buscar(juegoDeNivel(p), { maxProf: p.minimo, maxEstados: 2e6, maxMs: 60000 });
    if (b.resuelto && b.minimo === p.minimo) minimos++;
    else console.log(`  ${p.id}: el mínimo ya no es ${p.minimo}`);
  }
  eq(ganan, T.PUZLES.length, 'cada nivel de js/puzles.js se gana con su solución, con ★★★');
  eq(minimos, T.PUZLES.length, 'y su mínimo no ha bajado');
}

// --- el tutorial (v11.2, T-49) ----------------------------------------------------------------
// Hecho a mano, pero comprobado como un nivel de verdad: cada uno se gana con su
// solución, el resolutor no encuentra nada más corto y el comprobador la rejuega. Y
// lo que cambia del contrato del motor: el límite opcional y grupoMeseta.
{
  eq(T.TUTORIAL_VERSION, 1, 'js/tutorial.js: versión 1');
  eq(T.TUTORIAL.length, 8, 'el tutorial tiene ocho niveles');
  eq(T.TUTORIAL.map(t => t.orden).join(), '1,2,3,4,5,6,7,8', 'en orden, del 1 al 8');
  ok(T.TUTORIAL.every(t => /^C0-0\d$/.test(t.id) && !T.PUZLES.some(p => p.id === t.id)), 'ids C0-0N, que no están en js/puzles.js');
  ok(T.TUTORIAL.every(t => t.limite === null), 'ninguno tiene límite');
  ok(T.TUTORIAL.every(t => ['siempre', 'pista'].includes(t.guia)), 'la guía, siempre o con pista');
  ok(T.TUTORIAL.slice(0, -1).every(t => typeof t.aprendido === 'string' && t.aprendido.length), 'cada uno, menos el último, dice lo aprendido');
  const marcas = T.TUTORIAL.flatMap(t => [t.consejo, t.aprendido, t.recuadro, t.falloExtra].flat()).filter(Boolean).join(' ');
  ok(!/\(\d\)/.test(marcas), 'los textos no escriben «(2)» a mano: usan la marca {2}');
  const { buscar } = require('../puzles/buscador.js');
  const { juegoDeNivel } = require('../puzles/colmena.js');
  const { comprobar } = require('../puzles/comprobador.js');
  let ganan = 0, minimos = 0, comprobados = 0;
  for (const t of T.TUTORIAL) {
    const s = T.crearPuzle(t);
    for (const c of t.solucion) T.commitTurn(s, c);
    if (s.puzle.resultado && s.puzle.resultado.gana && s.puzle.resultado.turnos === t.minimo) ganan++;
    else console.log(`  ${t.id}: su solución no lo gana`);
    const b = buscar(juegoDeNivel(t), { maxProf: t.minimo, maxEstados: 2e6, maxMs: 60000 });
    if (b.resuelto && b.minimo === t.minimo) minimos++; else console.log(`  ${t.id}: el mínimo ya no es ${t.minimo}`);
    if (comprobar({ nivel: t, solucion: t.solucion, minimo: t.minimo }) === 'ok') comprobados++;
    else console.log(`  ${t.id}: el comprobador no lo acepta`);
  }
  eq(ganan, 8, 'cada nivel del tutorial se gana con su solución, en su mínimo');
  eq(minimos, 8, 'el resolutor demuestra el mínimo de cada uno');
  eq(comprobados, 8, 'el comprobador rejuega cada solución');
  // Lo que se ve jugándolo, comprobado el 02-10 con el motor (LC-Tutorial §3).
  const t7 = T.TUTORIAL[6], s7 = T.crearPuzle(t7);
  T.commitTurn(s7, [17, 18, 19]);
  ok(s7.puzle.resultado && s7.puzle.resultado.motivo === 'fallo', 'nivel 7: la línea recta por el centro acaba en fallo');
  eq(T.grupoMeseta(s7).length, s7.puzle.resultado.meseta, '…y grupoMeseta mide la meseta del fallo');
  const g7 = T.crearPuzle(t7);
  for (const c of t7.solucion) T.commitTurn(g7, c);
  eq(`${g7.last.type} ${g7.last.paso} ${g7.last.meseta}`, 'fallback 6 5', 'nivel 7: ganar deja el paso 6 sin sitio (máx 5), y lo dice el evento');
  // Sin límite: jugar muchos turnos no pierde por límite.
  const t4 = T.TUTORIAL[3], s4 = T.crearPuzle(t4);
  eq(s4.puzle.limite, null, 'crearPuzle: `limite: null` es sin límite');
  for (let k = 0; k < 12 && !s4.gameOver; k++) T.commitTurn(s4, [11]);
  ok(!s4.puzle.resultado || s4.puzle.resultado.motivo !== 'limite', 'sin límite no se pierde por turnos');
  eq(T.crearPuzle(T.PUZLES[0]).puzle.limite, T.PUZLES[0].minimo + T.PUZZLE_MARGEN, 'los niveles de Puzzle siguen con su límite');
  // grupoMeseta mide siempre lo que biggestCoherentArea, en partidas de verdad.
  let iguales = 0, vistos = 0;
  for (let semilla = 1; semilla <= 40; semilla++) {
    const s = T.createState(T.MODOS.CONTRARRELOJ, 'normal', semilla), r = T.rng(semilla);
    for (let k = 0; k < 30 && !s.gameOver; k++) {
      vistos++;
      const g = T.grupoMeseta(s);
      if (g.length === T.biggestCoherentArea(s) && new Set(g.map(i => s.height[i])).size <= 2) iguales++;
      const c = T.elegirJugada(s, r); if (!c) break; T.commitTurn(s, c);
    }
  }
  eq(iguales, vistos, `grupoMeseta mide lo que biggestCoherentArea (${vistos} paneles)`);
  // El progreso guardado.
  eq(T.leerProgresoTutorial({ v: 1, resuelto: 3 }, 8), 3, 'el progreso del tutorial se lee');
  eq(T.leerProgresoTutorial({ v: 1, resuelto: 9 }, 8), 0, 'uno de más no vale: se empieza por el 1');
  eq(T.leerProgresoTutorial({ v: 2, resuelto: 3 }, 8), 0, 'otra versión: se empieza por el 1');
  eq(T.leerProgresoTutorial(null, 8), 0, 'sin nada guardado: el 1');
  eq(T.LINEA_NIVEL.length, T.NOMBRE_NIVEL.length, 'una línea de la escalera por nivel');
}

// --- el motor no toca el DOM ---------------------------------------------------------------
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'state.js'), 'utf8');
  ok(!/document\.|window\.|canvas|Math\.random/.test(src.replace(/\/\/.*$/gm, '')),
     'state.js no usa DOM, canvas ni Math.random');
}

// --- la interfaz y el HTML concuerdan --------------------------------------------------------
// Los tests no pueden jugar la interfaz (no hay DOM), pero sí pueden comprobar
// lo que de verdad se rompe al moverla: que app.js pida un id que el HTML ya no
// tiene. Pasó a punto de pasar al rehacer el HUD de la v6, donde desaparecieron
// nueve ids de golpe.
{
  const fs = require('fs'), path = require('path');
  const raiz = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const html = raiz('index.html');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const js = ['js/app.js', 'js/render.js', 'js/input.js'].map(raiz).join('\n');
  const pedidos = new Set([
    ...[...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]),
    ...[...js.matchAll(/set(?:Text|Html)\('([^']+)'/g)].map(m => m[1]),
  ]);
  for (const id of pedidos) ok(ids.has(id), `el HTML tiene el id «${id}» que pide el JS`);

  // Los números de la ayuda los rellena app.js desde las constantes (v7): cada
  // data-const del HTML tiene que ser uno que app.js sepa rellenar.
  const consts = [...html.matchAll(/data-const="([^"]+)"/g)].map(m => m[1]);
  ok(consts.includes('COSECHA_GRANDE'), 'la ayuda lee el umbral de COSECHA_GRANDE');
  const rellena = /const valores = \{([^}]+)\}/.exec(js)[1];
  for (const c of new Set(consts)) ok(rellena.includes(c), `app.js rellena el data-const «${c}»`);
  ok(!/4 celdas o más/.test(html), 'la ayuda ya no lleva el umbral escrito a mano');
  // v10.1: la tarjeta de Contagio lee el periodo del contagio de CONTAGIO_CADA, y
  // el tope de Expansión lo pone la dificultad (data-tope, no data-const).
  ok(consts.includes('CONTAGIO_CADA_NORMAL') && consts.includes('CONTAGIO_CADA_DIFICIL'), 'la tarjeta de Contagio lee CONTAGIO_CADA');
  ok(/CONTAGIO_CADA_NORMAL: CONTAGIO_CADA\.normal/.test(rellena) && /CONTAGIO_CADA_DIFICIL: CONTAGIO_CADA\.dificil/.test(rellena), '…de las dos dificultades');
  ok(!consts.includes('TOPE_EXPANSION') && (html.match(/data-tope/g) || []).length === 2, 'el tope de la tarjeta de Expansión va por dificultad');
  ok(/TOPE_EXPANSION\[dif\]/.test(js) && /\[data-tope\]/.test(js), 'y lo rellena pintarEscalaExpansion');
  ok(/baja a cera/.test(html.split('data-pestana="contagio"')[1].split('hoja-panel')[0]), 'la tarjeta de Contagio dice que el contagio baja a cera');

  // La versión que se ve en el pie tiene que ser la del paquete: si se
  // descuadran, el número que enseña el juego miente (T-28).
  const pkg = JSON.parse(raiz('package.json'));
  const enJs = /const VERSION = '([^']+)'/.exec(raiz('js/constants.js'))[1];
  // 0.7.0 se enseña como «v7» y 0.7.1 como «v7.1».
  const [, menor, parche] = pkg.version.split('.');
  eq(enJs, 'v' + menor + (parche !== '0' ? '.' + parche : ''), 'VERSION coincide con package.json');
}

// --- historial de partidas y código de partida (v11.4, T-50; LC-DESIGN §24) ----------
{
  // 1. El código, ida y vuelta: los cinco modos con código, sus dificultades y
  // semillas de los extremos y al azar.
  const azar = T.rng(77);
  for (const modo of ['contrarreloj', 'invierno', 'contagio', 'expansion', 'libre'])
    for (const dif of T.tieneDificultad(modo) ? ['normal', 'dificil'] : ['normal'])
      for (const semilla of [0, 1, 4294967295, Math.floor(azar() * 4294967296)]) {
        const c = T.codigoPartida(modo, dif, semilla);
        const l = T.leerCodigo(c);
        ok(l && l.modo === modo && l.dificultad === dif && l.semilla === semilla && !l.sinModo,
           `el código ${c} se lee de vuelta (${modo} ${dif} ${semilla})`);
      }
  eq(T.codigoPartida('contrarreloj', 'normal', 4069568398), 'CR-N-4069568398', 'el código de Contrarreloj normal');
  eq(T.codigoPartida('invierno', 'dificil', 2210457781), 'IN-D-2210457781', 'el de Invierno difícil');
  eq(T.codigoPartida('libre', 'normal', 7), 'PL-7', 'Panal libre, sin dificultad');
  eq(T.codigoPartida('puzzle', 'normal', 7), null, 'Puzzle no tiene código');
  ok(Object.values(T.PREFIJO_MODO).every(p => /^[A-Z]{2}$/.test(p)) &&
     new Set(Object.values(T.PREFIJO_MODO)).size === Object.keys(T.PREFIJO_MODO).length, 'los prefijos son dos letras y distintos');

  // 2. Lo que tolera y lo que no.
  const igual = (t, modo, dif, semilla) => {
    const l = T.leerCodigo(t);
    ok(l && l.modo === modo && l.dificultad === dif && l.semilla === semilla, `«${t}» se lee como ${modo} ${dif} ${semilla}`);
  };
  igual('cr-n-123', 'contrarreloj', 'normal', 123);
  igual('  CR-N-123  ', 'contrarreloj', 'normal', 123);
  igual('CR N 123', 'contrarreloj', 'normal', 123);
  igual('ex-d-0', 'expansion', 'dificil', 0);
  igual('pl 55', 'libre', 'normal', 55);
  const solo = T.leerCodigo(' 4069568398 ');
  ok(solo && solo.sinModo && solo.semilla === 4069568398 && !solo.modo, 'un número solo vale, sin modo');
  for (const malo of ['CR-X-1', 'XX-N-1', 'CR-N-4294967296', 'CR-N-', 'PL-N-1', 'CR-1', 'hola', '', 'CR_N_1',
                      'CR-N-01', 'CR-N-1 extra', '4294967296', '-1', 'CR--N-1', 'PZ-N-1'])
    eq(T.leerCodigo(malo), null, `«${malo}» no es un código`);
  eq(T.leerCodigo(undefined), null, 'nada no es un código');

  // Compartir (v11.9, T-30): el enlace ida y vuelta, y el texto.
  eq(T.codigoDeBusqueda('?c=CR-N-4069568398'), 'CR-N-4069568398', '?c= da el código');
  eq(T.codigoDeBusqueda('?x=1&c=ex-d-7&y=2'), 'ex-d-7', 'entre otros parámetros');
  eq(T.codigoDeBusqueda('?c=CR%20N%20123'), 'CR N 123', 'decodificado');
  eq(T.codigoDeBusqueda('?c=CR+N+123'), 'CR N 123', 'con + por espacio');
  eq(T.codigoDeBusqueda('?cc=CR-N-1'), null, 'otro parámetro no es c');
  eq(T.codigoDeBusqueda(''), null, 'sin búsqueda, nada');
  eq(T.codigoDeBusqueda('?c=%E0'), null, 'mal codificado, nada');
  eq(T.codigoDeBusqueda(undefined), null, 'sin nada, nada');
  const enl = T.enlacePartida('https://icaraballo.github.io/La-Colmena/', 'CR-N-4069568398');
  eq(enl, 'https://icaraballo.github.io/La-Colmena/?c=CR-N-4069568398', 'el enlace');
  for (const [modo, dif] of [['contrarreloj', 'normal'], ['invierno', 'dificil'], ['contagio', 'normal'], ['expansion', 'dificil']]) {
    const cod = T.codigoPartida(modo, dif, 4069568398);
    const vuelta = T.leerCodigo(T.codigoDeBusqueda(T.enlacePartida('https://x/', cod).slice('https://x/'.length)));
    ok(vuelta && vuelta.modo === modo && vuelta.dificultad === dif && vuelta.semilla === 4069568398, `el enlace de ${cod} vuelve a su partida`);
  }
  eq(T.textoCompartir({ modo: 'contrarreloj', dificultad: 'normal', puntos: 5230, turnos: 48 }),
     'La Colmena · Contrarreloj normal · 5230 puntos. ¿Lo superas?', 'el texto con puntos');
  eq(T.textoCompartir({ modo: 'invierno', dificultad: 'dificil', puntos: 120, turnos: 9 }),
     'La Colmena · Invierno difícil · 120 puntos. ¿Lo superas?', 'difícil, en minúscula');
  eq(T.textoCompartir({ modo: 'expansion', dificultad: 'normal', puntos: 0, turnos: 87, expansion: { completado: true, abiertas: 18, total: 18 } }),
     'La Colmena · Expansión normal · panal completo en 87 turnos. ¿Lo haces en menos?', 'Expansión completa');
  eq(T.textoCompartir({ modo: 'expansion', dificultad: 'normal', puntos: 0, turnos: 150, expansion: { completado: false, abiertas: 14, total: 18 } }),
     'La Colmena · Expansión normal · 14 de 18 abiertas. ¿Lo superas?', 'Expansión sin completar');

  // Entradas hechas a mano para las listas (sólo lo que miran).
  let n = 0;
  const entrada = (modo, dif, extra = {}) => ({
    id: 'e' + (n++), modo, dificultad: dif, semilla: n, version: 'v11.4',
    fecha: new Date(Date.UTC(2026, 9, 1) + n * 60000).toISOString(),
    puntos: 1000, turnos: 50, duracion: 100, rachaMax: 1, jugadaMax: 3, estrella: false,
    ...(modo === 'contagio' ? { contagio: { bruto: 1000, marcadas: 0, resta: 0 } } : {}),
    ...(modo === 'expansion' ? { expansion: { completado: true, abiertas: 18, total: 18 } } : {}),
    ...extra,
  });

  // 3. La poda: 25 por lista sin estrella; el récord no se borra; las de estrella, aparte.
  let h = T.historialVacio();
  const primera = entrada('contrarreloj', 'normal', { puntos: 99999 });   // la más antigua y el récord
  T.apuntarEnHistorial(h, primera);
  for (let k = 0; k < 29; k++) T.apuntarEnHistorial(h, entrada('contrarreloj', 'normal', { puntos: 100 + k }));
  eq(T.listaDe(h, 'contrarreloj', 'normal').length, T.HISTORIAL_POR_LISTA, '30 partidas en una lista: quedan 25');
  ok(h.partidas.includes(primera), 'el récord no se borra aunque sea la más antigua');
  eq(T.recordDe(h, 'contrarreloj', 'normal'), primera, '…y sigue siendo el récord');
  ok(!h.partidas.some(e => e.puntos >= 100 && e.puntos <= 104), 'se borran las más antiguas sin estrella');
  T.apuntarEnHistorial(h, entrada('contrarreloj', 'dificil'));
  eq(T.listaDe(h, 'contrarreloj', 'dificil').length, 1, 'cada dificultad es su lista');
  T.apuntarEnHistorial(h, h.partidas[1]);
  eq(T.listaDe(h, 'contrarreloj', 'normal').length, 25, 'apuntar dos veces la misma no la duplica');

  h = T.historialVacio();
  const tres = [];
  for (let k = 0; k < 30; k++) {
    const e = entrada('invierno', 'normal', { puntos: 100 + k });
    T.apuntarEnHistorial(h, e);
    if (k < 3) { tres.push(e); T.marcarEstrella(h, e.id, true); }
  }
  eq(T.listaDe(h, 'invierno', 'normal').length, 28, 'con 3 de estrella: quedan 28');
  ok(tres.every(e => h.partidas.includes(e)), 'las de estrella no se borran');
  const lista = T.listaDe(h, 'invierno', 'normal');
  ok(lista.slice(0, 3).every(e => e.estrella) && lista[0] === tres[2], 'las de estrella salen primero, la más reciente arriba');
  ok(lista.slice(3).every((e, k, l) => !k || Date.parse(l[k - 1].fecha) >= Date.parse(e.fecha)),
     'las demás, de la más reciente a la más antigua');
  T.marcarEstrella(h, tres[0].id, false);
  eq(T.listaDe(h, 'invierno', 'normal').length, 27, 'desmarcar una con 25 ya llenas poda una');
  ok(!h.partidas.includes(tres[0]), '…la más antigua sin estrella, que ahora es ella');
  eq(T.marcarEstrella(h, 'no-existe', true), false, 'marcar una que no está no hace nada');

  // 4. El récord.
  h = T.historialVacio();
  eq(T.recordDe(h, 'contagio', 'normal'), null, 'sin partidas no hay récord');
  const a = entrada('contagio', 'normal', { puntos: 500 }), b = entrada('contagio', 'normal', { puntos: 900 });
  const c = entrada('contagio', 'normal', { puntos: 900 }), d = entrada('contagio', 'normal', { puntos: 300 });
  [a, b, c, d].forEach(e => T.apuntarEnHistorial(h, e));
  eq(T.recordDe(h, 'contagio', 'normal'), b, 'el récord es la de más puntos y, con empate, la más antigua');
  eq(T.recordDe(h, 'contagio', 'dificil'), null, '…de su dificultad');
  const x1 = entrada('expansion', 'normal', { turnos: 80, expansion: { completado: false, abiertas: 14, total: 18 } });
  T.apuntarEnHistorial(h, x1);
  eq(T.recordDe(h, 'expansion', 'normal'), null, 'Expansión sin completadas no tiene récord');
  const x2 = entrada('expansion', 'normal', { turnos: 120 }), x3 = entrada('expansion', 'normal', { turnos: 95 });
  T.apuntarEnHistorial(h, x2); T.apuntarEnHistorial(h, x3);
  eq(T.recordDe(h, 'expansion', 'normal'), x3, 'en Expansión, menos turnos entre las completadas');
  eq(T.todas(h).length, 7, '«Todas» las junta');
  ok(T.todas(h).every((e, k, l) => !k || Date.parse(l[k - 1].fecha) >= Date.parse(e.fecha)), '…de la más reciente a la más antigua');

  // 5. Leer lo guardado: una entrada rota se descarta sola; unas jugadas rotas se quitan.
  const buena = entrada('contrarreloj', 'normal', { turnos: 2, jugadas: [[1], [2, 3]], tiempos: [0, 2.5], tiempoFinal: 9 });
  const g = JSON.parse(JSON.stringify({ v: 1, partidas: [
    buena, { ...buena, id: 'x1', modo: 'puzzle' }, { ...buena, id: 'x2', semilla: -1 }, { ...buena, id: 'x3', fecha: 'ayer' },
    { ...buena, id: 'x4', puntos: 'mucho' }, null, 7, { ...buena, id: buena.id },
    entrada('contagio', 'normal', { id: 'x5', contagio: null }),
    { ...buena, id: 'j1', jugadas: [[1], [99]] }, { ...buena, id: 'j2', tiempos: [3, 1] },
    { ...buena, id: 'j3', jugadas: [[1]] , tiempos: [0] }, { ...buena, id: 'j4', tiempoFinal: 1 },
  ] }));
  const leido = T.leerHistorial(g);
  eq(leido.partidas.length, 5, 'un historial con entradas rotas conserva las buenas');
  ok(leido.partidas[0].jugadas && leido.partidas[0].jugadas.length === 2, 'la buena conserva sus jugadas');
  ok(['j1', 'j2', 'j3', 'j4'].every(id => { const e = leido.partidas.find(x => x.id === id); return e && !e.jugadas && !e.tiempos; }),
     'unas jugadas rotas se quitan y la entrada se queda');
  eq(T.leerHistorial({ v: 2, partidas: [buena] }).partidas.length, 0, 'otra versión del historial no se lee');
  eq(T.leerHistorial(null).partidas.length, 0, 'sin historial, vacío');
  eq(T.leerHistorial(JSON.parse(JSON.stringify(leido))).partidas.length, 5, 'leído y vuelto a leer, igual');

  // 6. La repetición: partidas del bot tonto jugadas como en la interfaz (el reloj en
  // fotogramas de ≤ 0,25 s, la duración que se apunta en cada jugada) y rejugadas con
  // un tick por turno. Mismos puntos, turnos y final.
  const jugarComoLaInterfaz = (modo, dif, semilla) => {
    const s = T.createState(modo, dif, semilla);
    s.jugadas = []; s.tiempos = [];
    const R = T.rng(semilla ^ 0x5bd1e995), ruido = T.rng(semilla + 11);
    let duracion = 0, guarda = 0;
    while (!s.gameOver && guarda++ < 3000) {
      // Lo que tarda en pensar: 2,5 s con ruido, en fotogramas como frame().
      let piensa = 1 + ruido() * 3;
      while (piensa > 0 && !s.gameOver) {
        const dt = Math.min(0.25, piensa, 1 / 60 + ruido() * 0.25);
        piensa -= dt;
        if (s.arrancado && !s.gameOver) duracion += dt;
        T.tick(s, dt);
      }
      if (s.gameOver) break;
      // Con la danza vale cualquier longitud; el tonto sólo busca la del paso.
      let cells = T.elegirJugada(s, R);
      for (let L = s.step; !cells && s.danza && L >= 1; L--) cells = T.buscarJugada(s, L, undefined, R);
      if (!cells || !T.commitTurn(s, cells)) break;
      s.jugadas.push(cells.slice()); s.tiempos.push(duracion);
      s.streakMax = Math.max(s.streakMax || 0, s.streak); s.jugadaMax = Math.max(s.jugadaMax || 0, cells.length);
    }
    return { s, duracion };
  };
  for (const modo of T.MODOS_HISTORIAL) for (const dif of ['normal', 'dificil']) {
    let bien = 0, total = 0, conJugadas = 0;
    for (let semilla = 1; semilla <= 50; semilla++) {
      const { s, duracion } = jugarComoLaInterfaz(modo, dif, semilla);
      if (!s.gameOver) continue;
      total++;
      const e = T.entradaDePartida(s, { id: 'r' + semilla, fecha: new Date().toISOString(), duracion, version: T.VERSION });
      if (e.jugadas) conJugadas++;
      const r = T.rejugarPartida(JSON.parse(JSON.stringify(e)));
      if (r && r.gameOver && r.score === s.score && r.turn === s.turn) bien++;
      else console.error(`    ${modo} ${dif} semilla ${semilla}: ${s.score}/${s.turn} → ${r && r.score}/${r && r.turn} ${r && r.gameOver}`);
    }
    eq(total, 50, `${modo} ${dif}: las 50 partidas del bot terminan`);
    eq(conJugadas, total, `${modo} ${dif}: todas llevan sus jugadas`);
    eq(bien, total, `${modo} ${dif}: rejugar da los mismos puntos, turnos y final`);
  }
  eq(T.rejugarPartida({ modo: 'invierno', dificultad: 'normal', semilla: 1 }), null, 'sin jugadas no se rejuega');
  const { s: s1, duracion: d1 } = jugarComoLaInterfaz('invierno', 'normal', 3);
  const e1 = T.entradaDePartida(s1, { id: 'q', fecha: 'x', duracion: d1, version: 'v' });
  e1.jugadas[0] = [0, 1, 2, 3, 4, 5, 6, 7];
  eq(T.rejugarPartida(e1), null, 'una jugada que no vale no se rejuega');

  // Lo que se apunta de cada modo.
  eq(T.entradaDePartida(T.createState('invierno', 'normal', 1), { duracion: 0 }), null, 'una partida sin terminar no se apunta');
  const libre = T.createState('libre', 'normal', 1); libre.gameOver = true;
  eq(T.entradaDePartida(libre, { duracion: 0 }), null, 'Panal libre no entra');
  const cg = jugarComoLaInterfaz('contagio', 'normal', 4);
  const ecg = T.entradaDePartida(cg.s, { id: 'cg', fecha: 'x', duracion: cg.duracion, version: 'v' });
  ok(ecg.contagio && ecg.puntos === Math.max(0, ecg.contagio.bruto - ecg.contagio.resta), 'Contagio apunta los puntos ya con las huellas restadas');
  const ex = jugarComoLaInterfaz('expansion', 'normal', 4);
  const eex = T.entradaDePartida(ex.s, { id: 'ex', fecha: 'x', duracion: ex.duracion, version: 'v' });
  ok(eex.expansion && eex.expansion.total === T.CERRADAS_EXPANSION.length && typeof eex.expansion.completado === 'boolean', 'Expansión apunta si completó y las abiertas');

  // 7. Continuar: una partida guardada a medias conserva jugadas y tiempos, y la
  // completa sigue cuadrando.
  {
    const modo = 'contrarreloj', semilla = 21;
    const { s: entera } = jugarComoLaInterfaz(modo, 'normal', semilla);
    // La misma partida, cortada a la mitad, guardada y restaurada.
    const mitad = Math.floor(entera.jugadas.length / 2);
    const s = T.createState(modo, 'normal', semilla);
    s.jugadas = []; s.tiempos = [];
    let antes = 0;
    for (let k = 0; k < mitad; k++) {
      T.tick(s, entera.tiempos[k] - antes); antes = entera.tiempos[k];
      T.commitTurn(s, entera.jugadas[k]); s.jugadas.push(entera.jugadas[k]); s.tiempos.push(entera.tiempos[k]);
    }
    const r = T.restaurarPartida(JSON.parse(JSON.stringify(T.serializarPartida(s, { duracion: antes }))));
    ok(r && r.jugadas.length === mitad && r.tiempos.length === mitad && r.tiempos[mitad - 1] === antes,
       'una partida restaurada conserva sus jugadas y sus tiempos');
    for (let k = mitad; k < entera.jugadas.length; k++) {
      T.tick(r, entera.tiempos[k] - antes); antes = entera.tiempos[k];
      T.commitTurn(r, entera.jugadas[k]); r.jugadas.push(entera.jugadas[k]); r.tiempos.push(entera.tiempos[k]);
    }
    const final = T.rejugarPartida({ modo, dificultad: 'normal', semilla, jugadas: r.jugadas, tiempos: r.tiempos, tiempoFinal: 1e6 });
    ok(final && final.score === entera.score && final.turn === entera.turn, '…y la repetición de la partida completa cuadra');
    // Las jugadas que no valen se pierden solas; la partida sigue.
    const g2 = JSON.parse(JSON.stringify(T.serializarPartida(s, { duracion: antes })));
    g2.estado.jugadas = [[999]];
    const r2 = T.restaurarPartida(g2);
    ok(r2 && r2.jugadas === null && r2.tiempos === null && r2.turn === s.turn, 'unas jugadas guardadas rotas se pierden solas');
    const g3 = JSON.parse(JSON.stringify(T.serializarPartida(s, { duracion: antes })));
    delete g3.estado.jugadas; delete g3.estado.tiempos;
    const r3 = T.restaurarPartida(g3);
    ok(r3 && !r3.jugadas && !r3.tiempos && r3.turn === s.turn, 'una partida de antes de la v11.4 sigue, sin jugadas');
  }

  // historial.js no toca el DOM ni localStorage (como guardado.js).
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'historial.js'), 'utf8')
    .replace(/\/\/.*$/gm, '');
  ok(!/document|localStorage|window|Math\.random|Date\.now/.test(src), 'historial.js no toca DOM, localStorage, el azar ni el reloj');
}

// --- la ayuda de Puzzle: pista y solución guiada (v11.10, T-54; §5.98) --------------
{
  const nivel = id => T.PUZLES.find(p => p.id === id);
  const jugar = (n, jugadas, op) => { const s = T.crearPuzle(n, op); for (const c of jugadas) T.commitTurn(s, c); return s; };

  // 1. El tope de la solución guiada va en el motor.
  const n1 = nivel('C1-01');
  const libre = jugar(n1, n1.solucion), guiada = jugar(n1, n1.solucion, { guiada: true });
  ok(libre.puzle.resultado.gana && libre.puzle.resultado.estrellas === 3 && !libre.puzle.resultado.guiada, 'sin ayuda, en el mínimo: ★★★');
  ok(guiada.puzle.resultado.gana && guiada.puzle.resultado.guiada, 'con la solución guiada también se gana');
  eq(guiada.puzle.resultado.estrellas, T.PUZZLE_GUIADA_ESTRELLAS, 'con la solución guiada, como mucho ★');
  ok(T.PUZZLE_PISTA_TRAS === 5 && T.PUZZLE_SOLUCION_TRAS === 10 && T.PUZZLE_GUIADA_ESTRELLAS === 1, 'pista a las 5, solución a las 10, ★ como mucho');

  // 2. La mejor marca: con las mismas estrellas, sin ayuda gana a con ella.
  const p = T.progresoPuzzleVacio();
  ok(T.apuntarPuzzle(p, 'X', { gana: true, estrellas: 1, turnos: 6, guiada: true }), 'la primera marca, guiada, se apunta');
  eq(p.mejores.X.guiada, true, 'y se sabe que fue con la solución');
  ok(!T.apuntarPuzzle(p, 'X', { gana: true, estrellas: 1, turnos: 4, guiada: true }) || p.mejores.X.turnos === 4, 'guiada contra guiada: menos turnos');
  ok(T.apuntarPuzzle(p, 'X', { gana: true, estrellas: 1, turnos: 9, guiada: false }), 'una ★ sin ayuda mejora una ★ guiada, aunque tarde más');
  ok(!p.mejores.X.guiada, 'y ya no está marcada como guiada');
  ok(!T.apuntarPuzzle(p, 'X', { gana: true, estrellas: 1, turnos: 1, guiada: true }), 'una guiada no quita una sin ayuda');
  ok(T.apuntarPuzzle(p, 'X', { gana: true, estrellas: 3, turnos: 4 }) && !T.apuntarPuzzle(p, 'X', { gana: true, estrellas: 1, turnos: 1, guiada: true }),
     'resolver luego con la solución no baja las estrellas');

  // 3. Los intentos (v11.11, T-55), por nivel, y lo que se lee de lo guardado.
  const q = T.progresoPuzzleVacio();
  eq(T.apuntarIntento(q, 'C4-03', 'fallido'), 1, 'el primer fallido');
  eq(T.apuntarIntento(q, 'C4-03', 'fallido'), 2, 'el segundo');
  eq(T.apuntarIntento(q, 'C1-01', 'fallido'), 1, 'cada nivel lleva los suyos');
  eq(T.apuntarIntento(q, 'C4-03', 'ganado'), 1, 'un ganado');
  eq(JSON.stringify(T.intentosDe(q, 'C4-03')), JSON.stringify({ fallidos: 2, ganados: 1, total: 3 }), 'los intentos de un nivel');
  eq(JSON.stringify(T.intentosDe(q, 'NADA')), JSON.stringify({ fallidos: 0, ganados: 0, total: 0 }), 'un nivel sin jugar, cero');
  eq(T.fallidoAGanado(q, 'C1-01'), 1, 'perder, deshacer y ganar: el fallido pasa a ganado');
  ok(!('C1-01' in q.fallidos) && T.intentosDe(q, 'C1-01').total === 1, 'sin dejar un cero, y el total no cambia');
  const leido = T.leerProgresoPuzzle(JSON.parse(JSON.stringify({ ...q, mejores: { A: { estrellas: 1, turnos: 5, guiada: true }, B: { estrellas: 2, turnos: 3 } },
                                                                  fallidos: { ...q.fallidos, R: -1, S: 'x', U: 2.5 } })));
  ok(leido.fallidos['C4-03'] === 2 && leido.ganados['C4-03'] === 1 && leido.ganados['C1-01'] === 1, 'los intentos se guardan y se leen');
  ok(!('R' in leido.fallidos) && !('S' in leido.fallidos) && !('U' in leido.fallidos), 'una cuenta rota se olvida, sólo ésa');
  ok(leido.mejores.A.guiada === true && !('guiada' in leido.mejores.B), 'la marca guiada se lee; la otra, sin el campo');
  const v1110 = T.leerProgresoPuzzle({ v: 1, mejores: {}, derrotas: { 'C4-03': 7 } });
  ok(v1110.fallidos['C4-03'] === 7 && !('derrotas' in v1110), 'las derrotas de la v11.10 se leen como fallidos');
  const viejo = T.leerProgresoPuzzle({ v: 1, mejores: { A: { estrellas: 3, turnos: 4 } } });
  ok(viejo.mejores.A.estrellas === 3 && Object.keys(viejo.fallidos).length === 0 && Object.keys(viejo.ganados).length === 0,
     'un progreso de antes de la v11.10 se lee, sin intentos');

  // 4. La pista. El camino sale de jugar con el motor del juego (estadoBuscador), así
  // que también comprueba que el juego y la máquina hablan del mismo estado.
  const M = T.motorDelJuego();
  const NO_BUSQUES = () => { throw new Error('ha buscado'); };
  const caminoDe = (n, jugadas) => {
    const s = T.crearPuzle(n), camino = [T.estadoBuscador(s)];
    for (const c of jugadas) { if (!T.commitTurn(s, c)) return null; camino.push(T.estadoBuscador(s)); if (s.gameOver) break; }
    return { s, camino };
  };
  const limiteDe = n => n.minimo + T.PUZZLE_MARGEN;
  for (const id of ['C1-01', 'C1-02', 'C1-05', 'C2-01']) {
    const n = nivel(id), juego = T.crearJuego(M).juegoDeNivel(n);
    // a) Siguiendo la solución guardada, la siguiente es la suya, sin buscar.
    for (let k = 0; k < n.solucion.length; k++) {
      const { camino } = caminoDe(n, n.solucion.slice(0, k));
      const r = T.pistaPuzle({ nivel: n, juego, buscar: NO_BUSQUES, camino, limite: limiteDe(n) });
      ok(r.tipo === 'jugada' && r.jugada.join() === n.solucion[k].join(), `${id}: en la solución, turno ${k}, la pista es la suya sin buscar`);
    }
    // b) Fuera de la solución: o la jugada que da gana a tiempo, o el turno al que
    // deshacer es el último desde el que se gana. Lo comprueba el buscador aparte.
    const ganable = (e, quedan) => quedan > 0 && T.buscar({ ...juego, inicial: e }, { maxProf: quedan }).resuelto;
    const s = T.crearPuzle(n), jugadas = [];
    const azar = T.rng(n.id.length * 7919 + n.minimo);
    for (let t = 0; t < limiteDe(n) - 1 && !s.gameOver; t++) {
      const opciones = juego.jugadas(T.estadoBuscador(s)).filter(c => {
        const e2 = juego.aplicar(T.estadoBuscador(s), c); return e2 && !juego.objetivo(e2);
      });
      if (!opciones.length) break;
      const c = opciones[Math.floor(azar() * opciones.length)];
      if (!T.commitTurn(s, c) || s.gameOver) break;
      jugadas.push(c);
      const { camino } = caminoDe(n, jugadas);
      const r = T.pistaPuzle({ nivel: n, juego, buscar: T.buscarPrimera, camino, limite: limiteDe(n), maxMs: 60000 });
      const tt = camino.length - 1;
      if (r.tipo === 'jugada') {
        const e2 = juego.aplicar(camino[tt], r.jugada);
        ok(e2 && (juego.objetivo(e2) || ganable(e2, limiteDe(n) - tt - 1)), `${id}, turno ${tt}: la jugada de la pista gana a tiempo`);
      } else {
        ok(!r.aproximada && r.turno < tt, `${id}, turno ${tt}: la pista manda deshacer a un turno anterior`);
        ok(ganable(camino[r.turno], limiteDe(n) - r.turno) || r.turno === 0, `${id}: desde el turno ${r.turno} se gana`);
        let ninguno = true;
        for (let k = r.turno + 1; k <= tt; k++) if (ganable(camino[k], limiteDe(n) - k)) ninguno = false;
        ok(ninguno, `${id}: y desde ninguno posterior`);
      }
    }
  }
  // c) Sin tiempo para buscar: deshacer hasta donde dejaste la solución guardada.
  {
    const n = nivel('C1-01'), juego = T.crearJuego(M).juegoDeNivel(n);
    const otra = juego.jugadas(juego.inicial).find(c => c.join() !== n.solucion[0].slice().sort((a, b) => a - b).join() && juego.aplicar(juego.inicial, c));
    const { camino } = caminoDe(n, [otra]);
    const agotado = () => ({ resuelto: false, agotado: true, stats: {} });
    const r = T.pistaPuzle({ nivel: n, juego, buscar: agotado, camino, limite: limiteDe(n) });
    ok(r.tipo === 'deshaz' && r.turno === 0 && r.aproximada, 'sin tiempo: «te saliste de la solución en el turno 0»');
  }
  // d) pista.js no toca el DOM ni localStorage.
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'pista.js'), 'utf8').replace(/\/\/.*$/gm, '');
  ok(!/document|localStorage|window/.test(src), 'pista.js no toca DOM ni localStorage');
}

// --- opinar (v11.14, T-56, §5.107): el enlace al formulario -------------------------
{
  const F = 'https://docs.google.com/forms/d/e/X/viewform', C = { version: 'entry.1', modo: 'entry.2', codigo: 'entry.3' };
  eq(T.enlaceOpinion({ version: 'v1' }, '', C), null, 'opinar: sin dirección no hay enlace (el botón no sale)');
  eq(T.enlaceOpinion({ version: 'v1', modo: 'Contrarreloj normal' }, F, {}), F, 'opinar: sin entry, la dirección sola');
  eq(T.enlaceOpinion({}, F, C), F, 'opinar: sin datos, la dirección sola');
  eq(T.enlaceOpinion({ version: 'v11.14' }, F, C), `${F}?usp=pp_url&entry.1=v11.14`, 'opinar: desde el inicio, sólo la versión');
  const url = T.enlaceOpinion({ version: 'v11.14', modo: 'Contagio difícil', codigo: 'CG-D-123&x=1' }, F, C);
  ok(url.startsWith(`${F}?usp=pp_url&`), 'opinar: el enlace prerrellenado lleva usp=pp_url');
  const q = url.slice(url.indexOf('?') + 1).split('&').map(p => p.split('=').map(decodeURIComponent));
  eq(JSON.stringify(q), JSON.stringify([['usp', 'pp_url'], ['entry.1', 'v11.14'], ['entry.2', 'Contagio difícil'], ['entry.3', 'CG-D-123&x=1']]),
     'opinar: los tres campos, y el código bien escapado');
  ok(T.OPINION_FORM.startsWith('https://docs.google.com/forms/') && !T.OPINION_FORM.includes('?'), 'opinar: la dirección del formulario, sin búsqueda');
  eq(Object.keys(T.OPINION_CAMPOS).join(), 'version,modo,codigo', 'opinar: los tres campos del formulario');
}

// --- la versión en cada <script src> (v11.14, T-56): que un push no mezcle ficheros --
{
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
  ok(srcs.length >= 10, `index.html carga sus scripts (${srcs.length})`);
  const v = T.VERSION.replace(/^v/, '');
  const malos = srcs.filter(u => !u.endsWith(`?v=${v}`));
  ok(!malos.length, `todos los <script src> llevan ?v=${v}${malos.length ? ': falta en ' + malos.join(', ') : ''}`);
  const pkg = require('../package.json');
  eq(pkg.version, '0.' + v, 'package.json y VERSION dicen la misma versión');
}

console.log(`${total - fallos}/${total} comprobaciones correctas`);
if (fallos) process.exit(1);
