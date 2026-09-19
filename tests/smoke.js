// Pruebas de las reglas. Se ejecutan con `npm test`. Cada bloque cita la sección
// de DESIGN.md que comprueba.
const T = require('./_bundle.js');

let fallos = 0, total = 0;
function ok(cond, msg) {
  total++;
  if (!cond) { fallos++; console.error('  FALLO · ' + msg); }
}
function eq(a, b, msg) { ok(a === b, `${msg} (esperado ${b}, obtenido ${a})`); }

// Tablero hecho a mano: todas las celdas a `nivel`, y luego las excepciones.
function tablero(modo, nivel, excepciones = {}, dificultad = 'normal') {
  const s = T.createState(modo, dificultad, 7);
  s.height.fill(nivel);
  for (const [i, h] of Object.entries(excepciones)) s.height[i] = h;
  return s;
}
// Celdas a un nivel, sin contar las rotas (una rota guarda height = 0 por limpieza).
const contar = (s, h) => [...s.height].filter((x, i) => x === h && !s.roto[i]).length;
const rotas = (s) => [...s.roto].filter(Boolean).length;
// Rompe celdas a mano, como haría la helada.
function romper(s, ...tiles) { for (const t of tiles) { s.roto[t] = 1; s.height[t] = T.AGUA; } return s; }

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
for (let seed = 1; seed <= 50; seed++) {
  const s = T.createState(T.MODOS.INVIERNO, 'normal', seed);
  ok(contar(s, 0) === 12 && contar(s, 1) === 8 && contar(s, 2) === 4,
     `semilla ${seed}: cupos 12/8/4 garantizados`);
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
  eq(s.height[0], 1, 'cosechar devuelve a cera, no a agua');
  eq(s.streak, 1, 'la cosecha suma racha');
  eq(s.score, 10 * 4 * 2, 'puntos de cosecha: 10·L²·bonus·(1+racha)');
  eq(s.last.type, 'harvest', 'se registra como cosecha');
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
  eq(rotas(s), 1, 'en dura la helada avanza en cada fallo');
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
  eq(s.failStreak, 0, 'cosechar reinicia los fallos seguidos');
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
  s.item = { tile: 0, tipo: 'jalea' };
  T.commitTurn(s, [0]);
  eq(s.last.item, 'jalea', 'al pasar la cadena por el ítem se recoge');
  eq(s.height[1], 2, 'jalea: toda la tierra sube');
  eq(s.height[3], 0, 'jalea: el agua no sube');
}
{
  const s = romper(tablero('invierno', 1, { 3: 0, 4: 0 }), 23);
  s.item = { tile: 0, tipo: 'propoleo' };
  T.commitTurn(s, [0]);
  eq(contar(s, 0), 0, 'propóleo: toda el agua sube a cera');
  eq(s.roto[23], 1, 'propóleo: no resucita celdas rotas');
  const u = tablero('invierno', 1, { 3: 0 });
  let sale = false;
  for (let seed = 1; seed <= 200 && !sale; seed++) {
    u.item = null; u.rng = (seed * 2654435761) >>> 0 || 1;
    if (T.spawnItemIfEarned(u).tipo === 'propoleo') sale = true;
  }
  ok(sale, 'el propóleo ya sale en Invierno si hay agua');
}
{
  const s = tablero('libre', 1);
  s.item = { tile: 0, tipo: 'danza' };
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
  s.item = { tile: 0, tipo: 'nectar' };
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
  s.item = { tile: 5, tipo: 'humo' };
  T.commitTurn(s, [5]);
  eq(s.roto[rota], 0, 'humo: la celda rota vuelve al panal');
  eq(s.height[rota], T.AGUA, '…como agua, no como cera');
}
{
  const s = tablero('libre', 1, { 1: 4 });
  s.item = { tile: 1, tipo: 'reina' };
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
  eq(T.velocidadReloj(s), 1.5, 'turno 50: el reloj va a ×1,5');
  s.reloj = 1;
  T.tick(s, 1);
  ok(s.gameOver, 'Pecoreo termina cuando se acaba el reloj');
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
