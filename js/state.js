// Estado del juego y reglas. NO hay una sola referencia a canvas, DOM ni sprites
// en este fichero, y no debe haberla nunca: el estado es un objeto plano y
// serializable, y las reglas son funciones que lo transforman.
//
// Eso es lo que permite que el bot simule miles de partidas y convierta "me
// parece difícil" en un número. Las decisiones de diseño están en DESIGN.md.
//
// El azar también vive en el estado (s.rng), no en Math.random: con la misma
// semilla sale exactamente la misma partida, y eso hace reproducible cualquier
// cosa rara que aparezca jugando.

function createState(modo = MODOS.INVIERNO, dificultad = 'normal', seed = 1) {
  const s = {
    // --- tablero ---
    height:    new Uint8Array(TILE_COUNT),
    sedaHasta: new Int32Array(TILE_COUNT),   // bloqueada mientras sedaHasta > turn
    item:      null,                          // { tile, tipo } — néctar sobre una celda

    // --- progresión del turno ---
    step:   1,   // longitud exigida: exactamente esta, ni más ni menos
    streak: 0,   // cosechas encadenadas sin fallo en medio
    score:  0,
    turn:   0,
    danza:  false,   // la ronda siguiente el arrastre es libre (ítem)

    // --- modo ---
    modo, dificultad,
    failStreak: 0,   // fallos seguidos; vuelve a 0 al cosechar

    // --- helada (Invierno) ---
    heladaCnt: 0,    // fallos acumulados desde el último avance
    heladas:   [],   // celdas que se ha comido la helada, en orden; la última se devuelve primero

    // --- desastres (Pecoreo) ---
    desastres:   [],  // { tipo: 'capullo', tile } | { tipo: 'seda', tiles, hasta }
    calmaHasta:  0,   // sin desastres mientras turn < calmaHasta

    // --- reloj (Pecoreo) ---
    reloj: CONFIG_MODO[modo].reloj ? RELOJ_INICIAL : 0,

    rng: (seed >>> 0) || 1,
    seed,
    gameOver: false,

    // Lo último que ha pasado, para que la interfaz pueda contarlo.
    last: null,
    eventos: [],
  };

  // Cupos fijos (12 huecos, 8 cera, 4 huevo), posiciones al azar.
  const reparto = [];
  for (const { nivel, casillas } of ARRANQUE)
    for (let k = 0; k < casillas; k++) reparto.push(nivel);
  barajar(s, reparto).forEach((h, i) => { s.height[i] = h; });

  return s;
}

// ---------------------------------------------------------------------------
// Azar reproducible: xorshift32 guardado en el propio estado.
// ---------------------------------------------------------------------------
function rand(s) {
  let x = s.rng;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  s.rng = x >>> 0 || 1;
  return s.rng / 4294967296;
}
function randInt(s, n) { return Math.floor(rand(s) * n); }
function elegir(s, arr) { return arr.length ? arr[randInt(s, arr.length)] : undefined; }
function barajar(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Qué celdas se pueden tocar
// ---------------------------------------------------------------------------
// Un hueco no es jugable, y una celda con seda tampoco mientras dure. Esto es
// una regla crítica: si los huecos se pudieran arrastrar, el panal se regenera
// más rápido de lo que la helada se lo come y la partida no acaba (DESIGN §2).
function jugable(s, i) {
  return s.height[i] !== HUECO && !(s.sedaHasta[i] > s.turn);
}

function tilesPlayable(s) {
  let n = 0;
  for (let i = 0; i < TILE_COUNT; i++) if (s.height[i] !== HUECO) n++;
  return n;
}

function esReina(s, i) { return !!s.item && s.item.tipo === ITEMS.REINA && s.item.tile === i; }

// ---------------------------------------------------------------------------
// (a) Validar un arrastre
// ---------------------------------------------------------------------------
// La cadena es un CONJUNTO CONEXO, no un camino simple: el dedo puede volver a
// pasar por una celda ya elegida para llegar a otra rama (tránsito). Por eso se
// comprueba la conexidad con un flood-fill y no la contigüidad par a par.
//
// Reglas: todas al mismo nivel, ninguna hueco ni con seda, conexas, y longitud
// exactamente `step` (o cualquiera si hay danza). La reina es comodín: cuenta
// como del nivel de la cadena.
//
// El nivel 5 SÍ es un arrastre válido: es la cosecha.
function isValidDrag(s, cells) {
  if (s.gameOver || !cells || cells.length === 0) return false;
  if (s.danza ? cells.length < 1 : cells.length !== s.step) return false;
  if (new Set(cells).size !== cells.length) return false;

  for (const i of cells) {
    if (!(i >= 0 && i < TILE_COUNT)) return false;
    if (!jugable(s, i)) return false;
  }
  if (nivelCadena(s, cells) === -1) return false;

  // Conexidad: flood-fill restringido a las celdas elegidas.
  const dentro = new Set(cells);
  const visto = new Set([cells[0]]);
  const pila = [cells[0]];
  while (pila.length) {
    const u = pila.pop();
    for (const v of ADJ[u]) if (dentro.has(v) && !visto.has(v)) { visto.add(v); pila.push(v); }
  }
  return visto.size === cells.length;
}

// Nivel de la cadena: el de sus celdas que no son la reina. -1 si mezcla niveles.
function nivelCadena(s, cells) {
  let h = -1;
  for (const i of cells) {
    if (esReina(s, i)) continue;
    if (h === -1) h = s.height[i];
    else if (s.height[i] !== h) return -1;
  }
  return h === -1 ? s.height[cells[0]] : h;   // sólo la reina: su propio nivel
}

// ---------------------------------------------------------------------------
// (b) Mayor meseta jugable
// ---------------------------------------------------------------------------
// Tamaño de la mayor componente conexa de celdas jugables al mismo nivel. Con
// tránsito es EXACTO: si mide >= step, existe jugada. (Sin tránsito era una
// aproximación y una de cada tres partidas se colgaba — DESIGN §3.)
function biggestCoherentArea(s) {
  const seen = new Uint8Array(TILE_COUNT);
  let best = 0;
  for (let start = 0; start < TILE_COUNT; start++) {
    if (seen[start] || !jugable(s, start)) continue;
    const h = s.height[start];
    const stack = [start]; seen[start] = 1; let size = 0;
    while (stack.length) {
      const u = stack.pop(); size++;
      for (const v of ADJ[u])
        if (!seen[v] && jugable(s, v) && s.height[v] === h) { seen[v] = 1; stack.push(v); }
    }
    if (size > best) best = size;
  }
  return best;
}

// ---------------------------------------------------------------------------
// (c) Cometer el turno
// ---------------------------------------------------------------------------
// Una jugada inválida no se comete y NO gasta turno: el jugador levanta el dedo
// y vuelve a intentarlo.
function commitTurn(s, cells) {
  if (!isValidDrag(s, cells)) return false;
  const cfg = CONFIG_MODO[s.modo];
  s.eventos = [];

  const L = cells.length;
  const h = nivelCadena(s, cells);
  const harvest = (h === MAX_LEVEL);
  const libre = s.danza;
  const cogido = (s.item && cells.includes(s.item.tile)) ? s.item.tipo : null;

  if (harvest) {
    // La abeja sale a pecorear y la celda vuelve a cera: cosechar no destruye
    // nada, devuelve una meseta llana de exactamente L celdas.
    for (const i of cells) s.height[i] = CERA;
    if (cfg.puntua) s.score += Math.round(10 * L * L * bonusMultiplier(L) * (1 + s.streak));
    if (cfg.reloj) sumarTiempo(s, segundosCosecha(L) + s.streak);   // la racha: +1 s acumulativo
    s.streak++;
    s.failStreak = 0;

    if (L >= COSECHA_GRANDE) {
      if (cfg.helada) devolverHelada(s);
      if (cfg.desastres) limpiarAmenaza(s);
    }
  } else {
    for (const i of cells) s.height[i] = h + 1;
    if (cfg.puntua) s.score += 10 * L * L * bonusMultiplier(L);
  }

  s.turn++;
  // La ronda de la danza no cuenta para el paso: se sigue pidiendo el mismo.
  if (libre) s.danza = false;
  else s.step = L + 1;

  s.last = { type: harvest ? 'harvest' : 'raise', path: cells.slice(), level: h, item: cogido };

  if (cogido) { s.item = null; usarItem(s, cogido); }
  caducarSeda(s);
  spawnItemIfEarned(s);

  // ¿Cabe el siguiente paso en algún sitio? Con danza, cualquier longitud vale.
  if (!s.danza && biggestCoherentArea(s) < s.step) fallback(s);
  return true;
}

// ---------------------------------------------------------------------------
// (d) El fallo
// ---------------------------------------------------------------------------
// El paso vuelve a 1 y la racha se pierde. Según el modo, avanza la helada
// (Invierno) o sube un peldaño la escalera de desastres (Pecoreo).
function fallback(s) {
  const cfg = CONFIG_MODO[s.modo];
  s.step = 1;
  s.streak = 0;
  s.danza = false;
  s.failStreak++;

  const ev = { type: 'fallback', eaten: undefined, desastre: null };
  if (cfg.helada) ev.eaten = avanzarHelada(s);
  if (cfg.desastres) ev.desastre = dispararDesastre(s);
  s.last = ev;
  s.eventos.push(ev);

  if (cfg.helada && tilesPlayable(s) === 0) s.gameOver = true;
}

// ---------------------------------------------------------------------------
// Helada (DESIGN §6)
// ---------------------------------------------------------------------------
// Avanza cada 2 fallos (cada 1 en dura), y siempre si quedan 3 jugables o menos.
// Se come la primera celda de la espiral que no sea ya hueco.
function avanzarHelada(s) {
  s.heladaCnt++;
  const toca = s.heladaCnt >= HELADA_CADA[s.dificultad] || tilesPlayable(s) <= HELADA_REMATE;
  if (!toca) return undefined;
  s.heladaCnt = 0;

  const tile = SPIRAL.find(i => s.height[i] !== HUECO);
  if (tile === undefined) return undefined;
  s.height[tile] = HUECO;
  s.sedaHasta[tile] = 0;
  s.heladas.push(tile);
  if (s.item && s.item.tile === tile) s.item = null;
  return tile;
}

// La última celda helada vuelve a cera. Cosecha grande o humo del apicultor.
function devolverHelada(s) {
  while (s.heladas.length) {
    const tile = s.heladas.pop();
    if (s.height[tile] !== HUECO) continue;   // ya no está helada: se salta
    s.height[tile] = CERA;
    s.eventos.push({ type: 'deshiela', tile });
    return tile;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Desastres (DESIGN §7): castigos escalonados por fallos seguidos, nunca al azar.
// Ninguno convierte celdas en hueco: eso es exclusivo de la helada.
// ---------------------------------------------------------------------------
function dispararDesastre(s) {
  if (s.turn < s.calmaHasta) return null;

  const activos = s.desastres.length;
  const capullo = s.desastres.find(d => d.tipo === 'capullo');
  const n = s.failStreak;

  if (n >= 4) return velutina(s);
  if (n === 3 && capullo) return eclosionar(s, capullo);
  if (n === 2 && activos < DESASTRES_MAX_ACTIVOS) return polilla(s);
  return varroa(s);   // 1.er fallo, o el peldaño que tocaba no ha podido darse
}

// Una celda baja a cera.
function varroa(s) {
  const cand = [];
  for (let i = 0; i < TILE_COUNT; i++) if (s.height[i] > CERA) cand.push(i);
  const tile = elegir(s, cand);
  if (tile === undefined) return null;
  s.height[tile] = CERA;
  return { tipo: 'varroa', tiles: [tile] };
}

// Un capullo en una celda. Sólo avisa: eclosiona en el siguiente fallo.
function polilla(s) {
  const cand = [];
  for (let i = 0; i < TILE_COUNT; i++)
    if (s.height[i] !== HUECO && !s.desastres.some(d => d.tile === i)) cand.push(i);
  const tile = elegir(s, cand);
  if (tile === undefined) return null;
  s.desastres.push({ tipo: 'capullo', tile });
  return { tipo: 'polilla', tiles: [tile] };
}

// El capullo suelta seda sobre sus vecinas: bloqueadas SEDA_TURNOS turnos.
function eclosionar(s, capullo) {
  s.desastres.splice(s.desastres.indexOf(capullo), 1);
  const tiles = ADJ[capullo.tile].filter(v => s.height[v] !== HUECO);
  const hasta = s.turn + SEDA_TURNOS;
  for (const v of tiles) s.sedaHasta[v] = hasta;
  s.desastres.push({ tipo: 'seda', tiles, hasta });
  return { tipo: 'seda', tiles, origen: capullo.tile };
}

// Barre 3-4 celdas de una zona a cera. Después, calma obligada.
function velutina(s) {
  const cand = [];
  for (let i = 0; i < TILE_COUNT; i++) if (s.height[i] > CERA) cand.push(i);
  const centro = elegir(s, cand);
  if (centro === undefined) return null;
  const zona = [centro, ...barajar(s, ADJ[centro].filter(v => s.height[v] !== HUECO))]
    .slice(0, 3 + randInt(s, 2));
  for (const i of zona) s.height[i] = CERA;
  s.calmaHasta = s.turn + CALMA_TRAS_VELUTINA;
  return { tipo: 'velutina', tiles: zona };
}

// Cosechar 4+ borra un capullo pendiente o, si no hay, retira una seda.
function limpiarAmenaza(s) {
  let k = s.desastres.findIndex(d => d.tipo === 'capullo');
  if (k === -1) k = s.desastres.findIndex(d => d.tipo === 'seda');
  if (k === -1) return;
  const [d] = s.desastres.splice(k, 1);
  if (d.tipo === 'seda') for (const v of d.tiles) s.sedaHasta[v] = 0;
  s.eventos.push({ type: 'limpia', desastre: d.tipo });
}

function caducarSeda(s) {
  s.desastres = s.desastres.filter(d => d.tipo !== 'seda' || d.hasta > s.turn);
}

// ---------------------------------------------------------------------------
// Ítems (DESIGN §8)
// ---------------------------------------------------------------------------
// Aparecen al soltar el dedo si hay suficientes celdas a un mismo nivel, y sólo
// los que servirían de algo en ese momento. Uno sobre el tablero como mucho.
function spawnItemIfEarned(s) {
  if (s.item || s.gameOver) return null;

  const cuenta = new Array(MAX_LEVEL + 1).fill(0);
  for (let i = 0; i < TILE_COUNT; i++) if (jugable(s, i)) cuenta[s.height[i]]++;
  let ganado = false;
  for (let h = CERA; h <= MAX_LEVEL; h++) if (cuenta[h] >= ITEM_THRESHOLDS[h - 1]) ganado = true;
  if (!ganado) return null;

  const tipo = elegir(s, itemsUtiles(s));
  const cand = [];
  for (let i = 0; i < TILE_COUNT; i++) if (jugable(s, i)) cand.push(i);
  const tile = elegir(s, cand);
  if (tipo === undefined || tile === undefined) return null;

  s.item = { tile, tipo };
  s.eventos.push({ type: 'item', tipo, tile });
  return s.item;
}

// Nunca se ofrece un ítem que no serviría (el original: isItemRaiseLandPossible…).
function itemsUtiles(s) {
  const cfg = CONFIG_MODO[s.modo];
  const out = [ITEMS.DANZA, ITEMS.REINA];
  let hayHueco = false, haySubible = false;
  for (let i = 0; i < TILE_COUNT; i++) {
    if (s.height[i] === HUECO) hayHueco = true;
    else if (s.height[i] < MAX_LEVEL) haySubible = true;
  }
  if (haySubible) out.push(ITEMS.JALEA);
  // El propóleo NO sale en Invierno: reconstruiría los 12 huecos del arranque,
  // el panal quedaría entero y la partida no terminaría (medido: un 5 % de las
  // partidas se iban a 3000 turnos con un solo propóleo al principio). Es el
  // espejo del humo, que sólo sale en Invierno.
  if (hayHueco && !cfg.helada) out.push(ITEMS.PROPOLEO);
  if (cfg.reloj) out.push(ITEMS.NECTAR);
  if (cfg.helada && s.heladas.some(t => s.height[t] === HUECO)) out.push(ITEMS.HUMO);
  return out;
}

// Se usan al recogerlos, sin inventario. La reina ya ha hecho su trabajo en la
// propia cadena que la ha recogido.
function usarItem(s, tipo) {
  switch (tipo) {
    case ITEMS.JALEA:
      for (let i = 0; i < TILE_COUNT; i++)
        if (s.height[i] !== HUECO && s.height[i] < MAX_LEVEL) s.height[i]++;
      break;
    case ITEMS.PROPOLEO:
      for (let i = 0; i < TILE_COUNT; i++) if (s.height[i] === HUECO) s.height[i] = CERA;
      break;
    case ITEMS.DANZA:
      s.danza = true;
      break;
    case ITEMS.NECTAR:
      sumarTiempo(s, NECTAR_SEGUNDOS);
      break;
    case ITEMS.HUMO:
      devolverHelada(s);
      break;
  }
  s.eventos.push({ type: 'usa', tipo });
}

// ---------------------------------------------------------------------------
// Reloj (DESIGN §9) — sólo Pecoreo
// ---------------------------------------------------------------------------
// Techo de 99 s; lo que no cabe se convierte en puntos.
function sumarTiempo(s, seg) {
  s.reloj += seg;
  if (s.reloj > RELOJ_TECHO) {
    s.score += Math.round((s.reloj - RELOJ_TECHO) * PUNTOS_POR_SEGUNDO);
    s.reloj = RELOJ_TECHO;
  }
}

// Cada 10 turnos el reloj corre un 10 % más rápido: el atardecer.
function velocidadReloj(s) {
  return 1 + RELOJ_ACELERA * Math.floor(s.turn / RELOJ_ACELERA_CADA);
}

// Hace correr el reloj `dt` segundos reales. La interfaz lo llama cada fotograma
// y el bot una vez por turno.
function tick(s, dt) {
  if (s.gameOver || !CONFIG_MODO[s.modo].reloj) return;
  s.reloj -= dt * velocidadReloj(s);
  if (s.reloj <= 0) { s.reloj = 0; s.gameOver = true; }
}
