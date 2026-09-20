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
  ['invierno', 'normal', 0], ['invierno', 'dura', 0],
  ['pecoreo',  'normal', 0], ['pecoreo',  'dura', 0],
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
  const s = tablero('invierno', 2, {}, 'dura');
  T.fallback(s);
  eq(rotas(s), 2, 'en dura la helada avanza en cada fallo, y se lleva 2 celdas (v5)');
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
  const s = tablero('pecoreo', 3);
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
  ok(n >= 3 && n <= 4, 'la velutina barre 3-4 celdas');
  T.fallback(s);
  eq(s.last.desastre, null, 'tras la velutina hay calma');
  eq(rotas(s), 0, 'ningún desastre rompe celdas');
  const a = tablero('pecoreo', 0);
  for (let k = 0; k < 6; k++) T.fallback(a);
  eq(contar(a, 0), 24, 'los desastres no actúan sobre el agua');
}
{
  const s = tablero('pecoreo', 2);
  s.desastres.push({ tipo: 'seda', tiles: [0, 1], hasta: 2 });
  s.sedaHasta[0] = 2; s.sedaHasta[1] = 2;
  ok(!T.jugable(s, 0), 'la celda con seda no es jugable');
  s.turn = 2;
  ok(T.jugable(s, 0), 'la seda caduca');
}
{
  const s = tablero('pecoreo', 1, { 5: 5, 6: 5, 11: 5, 12: 5 });
  s.desastres.push({ tipo: 'capullo', tile: 20 });
  s.step = 4;
  T.commitTurn(s, [5, 6, 11, 12]);
  eq(s.desastres.length, 0, 'una cosecha de 4+ elimina el capullo');
  eq(s.failStreak, 0, 'la cosecha de 4+ reinicia los fallos seguidos');
}
{
  // v4 (T-23, variante B): la cosecha PEQUEÑA ya no reinicia el termómetro. Con
  // la regla vieja la escalera de DESIGN §7 no se subía nunca: se cosecha cada
  // ~4 turnos y el contador no llegaba a 2.
  const s = tablero('pecoreo', 1, { 5: 5, 6: 5 });
  s.failStreak = 3;
  s.step = 2;
  ok(T.commitTurn(s, [5, 6]), 'se cosechan 2 celdas');
  eq(s.failStreak, 3, 'una cosecha de menos de 4 NO baja el termómetro');
  eq(s.streak, 1, '…pero sí suma racha');
  eq(T.COSECHA_GRANDE, 4, 'el umbral de cosecha grande es 4');
}
{
  // v4: la varroa va a por la celda más alta, no por una al azar.
  const s = tablero('pecoreo', 1, { 7: 4, 18: 2 });
  T.fallback(s);
  eq(s.last.desastre.tipo, 'varroa', '1.er fallo: varroa');
  eq(s.height[7], 1, 'la varroa se lleva la celda MÁS ALTA');
  eq(s.height[18], 2, '…y deja en paz a las demás');
  const llano = tablero('pecoreo', 1);
  T.fallback(llano);
  eq(llano.last.desastre, null, 'con todo a cera la varroa no tiene a quién morder');
}

// --- la dificultad es consecuencia, no condición (v5) ---------------------------------
{
  eq(T.ROTAS_ARRANQUE.invierno.normal, 0, 'el panal de Invierno empieza entero');
  eq(T.ROTAS_ARRANQUE.invierno.dura, 0, '…también en dura');
  eq(T.ROTAS_ARRANQUE.pecoreo.dura, 0, '…y el de contrarreloj');
  eq(T.HELADA_MUERDE.normal, 1, 'Invierno normal: la helada rompe 1 celda por fallo');
  eq(T.HELADA_MUERDE.dura, 2, 'Invierno dura: rompe 2');
  const n = tablero('invierno', 3, {}, 'normal');
  const d = tablero('invierno', 3, {}, 'dura');
  T.fallback(n); T.fallback(d);
  eq(rotas(n), 1, 'un fallo en normal se lleva una celda');
  eq(rotas(d), 2, 'el mismo fallo en dura se lleva dos');
  ok(T.RELOJ_ACELERA.dura > T.RELOJ_ACELERA.normal, 'el reloj de dura acelera más');
  const p = tablero('pecoreo', 1, {}, 'normal'), q = tablero('pecoreo', 1, {}, 'dura');
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
  const s = T.createState('pecoreo', 'normal', 7);
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
  ok(!T.itemsUtiles(tablero('pecoreo', 1)).includes('humo'), 'y nunca en contrarreloj');
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
  ok(T.itemsUtiles(tablero('pecoreo', 1)).includes('nectar'), '…y sí con reloj');
  ok(!T.itemsUtiles(tablero('invierno', 1)).includes('humo'), 'el humo no sale (v3, pendiente T-21)');
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
  eq(s.height[1], 2, 'jalea: toda la tierra sube');
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
  const s = tablero('pecoreo', 1);
  s.reloj = 50;
  s.item = { tile: 0, tipo: 'nectar', caduca: s.turn + T.ITEM_TURNOS };
  T.commitTurn(s, [0]);
  eq(s.reloj, 65, 'néctar: +15 s');
}
{
  // El humo no se ofrece desde la v3, pero si se usa sigue haciendo su efecto.
  const s = tablero('invierno', 1);
  T.fallback(s);
  const rota = T.SPIRAL[0];
  for (let seed = 1; seed <= 100; seed++) {
    s.item = null; s.rng = (seed * 2654435761) >>> 0 || 1;
    const it = T.spawnItemIfEarned(s);
    ok(!it || it.tipo !== 'humo', `semilla ${seed}: el humo no sale (v3)`);
  }
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
  const s = tablero('pecoreo', 1);
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

// --- el motor no toca el DOM ---------------------------------------------------------------
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'state.js'), 'utf8');
  ok(!/document\.|window\.|canvas|Math\.random/.test(src.replace(/\/\/.*$/gm, '')),
     'state.js no usa DOM, canvas ni Math.random');
}

console.log(`${total - fallos}/${total} comprobaciones correctas`);
if (fallos) process.exit(1);
