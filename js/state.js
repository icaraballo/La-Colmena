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
    height:    new Uint8Array(TILE_COUNT),   // 0 agua … 5 abeja
    roto:      new Uint8Array(TILE_COUNT),   // 1 = destruida por la helada: fuera del panal
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

    arrancado: false,   // el reloj no corre hasta el primer arrastre (v5, T-10)
    itemCalma:  0,      // turno a partir del cual puede salir el siguiente ítem

    rng: (seed >>> 0) || 1,
    seed,
    gameOver: false,

    // Lo último que ha pasado, para que la interfaz pueda contarlo.
    last: null,
    eventos: [],
  };

  // Cupos fijos (12 agua, 8 cera, 4 huevo), posiciones al azar. Las celdas rotas
  // del arranque (T-19) salen del cupo de agua: el reparto sigue sumando 24.
  let porRomper = (ROTAS_ARRANQUE[modo] || {})[dificultad] || 0;
  const reparto = [];
  for (const { nivel, casillas } of ARRANQUE)
    for (let k = 0; k < casillas; k++) {
      if (nivel === AGUA && porRomper > 0) { reparto.push(ROTA); porRomper--; }
      else reparto.push(nivel);
    }
  barajar(s, reparto).forEach((h, i) => {
    if (h === ROTA) { s.roto[i] = 1; s.height[i] = AGUA; } else { s.height[i] = h; }
  });

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
// Jugable = existe y no está bloqueada por seda. El AGUA SÍ es jugable: se
// arrastra como cualquier nivel y sube a cera. Lo que no se puede tocar nunca es
// una celda rota, y eso es lo que mantiene finita la partida (DESIGN §2).
function jugable(s, i) {
  return !s.roto[i] && !(s.sedaHasta[i] > s.turn);
}

function tilesPlayable(s) {
  let n = 0;
  for (let i = 0; i < TILE_COUNT; i++) if (!s.roto[i]) n++;
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
// La REINA cuenta como comodín también aquí (v5). Hasta la v4 el arrastre la
// aceptaba pero el cálculo la ignoraba, así que el motor podía declarar un fallo
// habiendo jugada: medido, pasaba en el 5,3 % de las partidas de Invierno. Es el
// espejo del cuelgue fantasma y viola lo mismo (DESIGN §3, §12): el motor nunca
// puede mentir sobre si hay jugada.
//
// Como la reina pertenece a TODOS los niveles a la vez, ya no vale una pasada
// con un `seen` global: hay que recorrer nivel por nivel. Son 6 pasadas sobre 24
// celdas, así que el coste da igual.
function biggestCoherentArea(s) {
  const reina = (s.item && s.item.tipo === ITEMS.REINA && jugable(s, s.item.tile)) ? s.item.tile : -1;
  let best = 0;
  for (let h = AGUA; h <= MAX_LEVEL; h++) {
    const de = i => jugable(s, i) && (s.height[i] === h || i === reina);
    const seen = new Uint8Array(TILE_COUNT);
    for (let start = 0; start < TILE_COUNT; start++) {
      if (seen[start] || !de(start)) continue;
      const stack = [start]; seen[start] = 1; let size = 0;
      while (stack.length) {
        const u = stack.pop(); size++;
        for (const v of ADJ[u]) if (!seen[v] && de(v)) { seen[v] = 1; stack.push(v); }
      }
      if (size > best) best = size;
    }
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
    // La abeja sale a pecorear y la celda se vacía: cosechar no destruye nada,
    // devuelve una meseta llana de exactamente L celdas. Desde la v4 vuelve a
    // AGUA, no a cera (COSECHA_DEVUELVE): la celda queda a cero, que es como se
    // lee jugando. Cuesta un turno más por ciclo y ese turno no puntúa.
    for (const i of cells) s.height[i] = COSECHA_DEVUELVE;
    if (cfg.puntua) s.score += Math.round(10 * L * L * bonusMultiplier(L) * (1 + s.streak));
    if (cfg.reloj) sumarTiempo(s, segundosCosecha(L) + s.streak);   // la racha: +1 s acumulativo
    s.streak++;
    // Sólo la COSECHA GRANDE baja el termómetro de los desastres. Con la cosecha
    // normal reiniciándolo (hasta la v3), la escalera de DESIGN §7 no se subía
    // nunca: el 91 % de los desastres eran varroa y la velutina salía 11 veces
    // en 2000 partidas. Ver Balance § v3, "Lo que destapó el playtest".
    if (L >= COSECHA_GRANDE) s.failStreak = 0;

    // En Invierno la cosecha grande ya NO devuelve celdas rotas: con el agua
    // jugable la partida no terminaba (palanca 1 del cambio agua/celda rota).
    if (L >= COSECHA_GRANDE && cfg.desastres) limpiarAmenaza(s);
  } else {
    for (const i of cells) s.height[i] = h + 1;
    // Subir agua es jugada de terreno, no de construcción: gasta turno y hace
    // crecer el paso, pero no da puntos.
    if (cfg.puntua && h !== AGUA) s.score += 10 * L * L * bonusMultiplier(L);
  }

  s.turn++;
  s.arrancado = true;   // el reloj empieza a correr con el primer arrastre (v5)
  // La ronda de la danza no cuenta para el paso: se sigue pidiendo el mismo.
  if (libre) s.danza = false;
  else s.step = L + 1;

  s.last = { type: harvest ? 'harvest' : 'raise', path: cells.slice(), level: h, item: cogido };

  if (cogido) { s.item = null; usarItem(s, cogido); }
  caducarSeda(s);
  caducarItem(s);
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
// Rompe la primera celda de la espiral que no esté ya rota, sea del nivel que sea.
function avanzarHelada(s) {
  s.heladaCnt++;
  const toca = s.heladaCnt >= HELADA_CADA[s.dificultad] || tilesPlayable(s) <= HELADA_REMATE;
  if (!toca) return undefined;
  s.heladaCnt = 0;

  // Muerde tantas celdas como diga la dificultad (v5): es la palanca que separa
  // normal de dura, ahora que el panal empieza siempre entero.
  let ultima;
  for (let k = 0; k < HELADA_MUERDE[s.dificultad]; k++) {
    const tile = SPIRAL.find(i => !s.roto[i]);
    if (tile === undefined) break;
    s.roto[tile] = 1;
    s.height[tile] = AGUA;    // irrelevante mientras esté rota, pero deja el array limpio
    s.sedaHasta[tile] = 0;
    s.heladas.push(tile);
    if (s.item && s.item.tile === tile) s.item = null;
    ultima = tile;
  }
  return ultima;
}

// La última celda rota por la helada vuelve al panal, como AGUA: recuperas el
// suelo, no el trabajo. Desde la v3 nada la llama (la cosecha grande dejó de
// hacerlo y el humo no sale); se conserva para cuando se rediseñe el humo.
function devolverHelada(s) {
  while (s.heladas.length) {
    const tile = s.heladas.pop();
    if (!s.roto[tile]) continue;              // ya se recuperó: se salta
    s.roto[tile] = 0;
    s.height[tile] = AGUA;
    s.eventos.push({ type: 'deshiela', tile });
    return tile;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Desastres (DESIGN §7): castigos escalonados por fallos seguidos, nunca al azar.
// Ninguno rompe celdas (eso es exclusivo de la helada) ni actúa sobre el agua.
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

// Una celda baja a cera. Desde la v4 va a por la MÁS ALTA, no por una al azar:
// el ácaro ataca a la cría. Pasa de costar ~2 niveles a ~4 y, sobre todo, se
// lee: ves caer tu mejor celda en vez de una cualquiera.
function varroa(s) {
  let alto = CERA;
  for (let i = 0; i < TILE_COUNT; i++) if (!s.roto[i] && s.height[i] > alto) alto = s.height[i];
  const cand = [];
  for (let i = 0; i < TILE_COUNT; i++) if (!s.roto[i] && s.height[i] === alto && alto > CERA) cand.push(i);
  const tile = elegir(s, cand);
  if (tile === undefined) return null;
  s.height[tile] = CERA;
  return { tipo: 'varroa', tiles: [tile] };
}

// Un capullo en una celda. Sólo avisa: eclosiona en el siguiente fallo.
function polilla(s) {
  const cand = [];
  for (let i = 0; i < TILE_COUNT; i++)
    if (!s.roto[i] && s.height[i] >= CERA && !s.desastres.some(d => d.tile === i)) cand.push(i);
  const tile = elegir(s, cand);
  if (tile === undefined) return null;
  s.desastres.push({ tipo: 'capullo', tile });
  return { tipo: 'polilla', tiles: [tile] };
}

// El capullo suelta seda sobre sus vecinas: bloqueadas SEDA_TURNOS turnos.
function eclosionar(s, capullo) {
  s.desastres.splice(s.desastres.indexOf(capullo), 1);
  const tiles = ADJ[capullo.tile].filter(v => !s.roto[v] && s.height[v] >= CERA);
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
  const zona = [centro, ...barajar(s, ADJ[centro].filter(v => !s.roto[v] && s.height[v] >= CERA))]
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

// La gota se evapora si no se recoge a tiempo (v5). Sin esto el ítem espera
// para siempre y recogerlo sale gratis: antes o después la cadena pasa por
// encima. Con caducidad hay que decidir si merece la pena romper la meseta para
// llegar, que es lo que DESIGN §8 pide que pase.
function caducarItem(s) {
  if (!s.item) return;
  if (s.turn < s.item.caduca) return;
  s.eventos.push({ type: 'caduca', tipo: s.item.tipo, tile: s.item.tile });
  s.item = null;
}

function caducarSeda(s) {
  s.desastres = s.desastres.filter(d => d.tipo !== 'seda' || d.hasta > s.turn);
}

// ---------------------------------------------------------------------------
// Ítems (DESIGN §8)
// ---------------------------------------------------------------------------
// Aparecen al soltar el dedo si hay suficientes celdas a un mismo nivel, y sólo
// los que servirían de algo en ese momento. Uno sobre el tablero como mucho.
// Celdas necesarias al nivel h para ganarse un ítem, escalado al panal VIVO.
// La tabla del original supone 24 celdas; con celdas rotas el umbral absoluto se
// vuelve inalcanzable y los ítems desaparecen (medido: 27 % de las partidas sin
// ninguno con 6 rotas, 69 % con 9). El ítem sigue siendo premio por aplanar lo
// que hay, que es lo que el umbral quiere decir.
function umbralItem(s, h) {
  let vivas = 0;
  for (let i = 0; i < TILE_COUNT; i++) if (!s.roto[i]) vivas++;
  return Math.max(ITEM_UMBRAL_MIN, Math.ceil(ITEM_THRESHOLDS[h - 1] * vivas / TILE_COUNT));
}

function spawnItemIfEarned(s) {
  if (s.item || s.gameOver) return null;
  if (s.turn < s.itemCalma) return null;

  const cuenta = new Array(MAX_LEVEL + 1).fill(0);
  for (let i = 0; i < TILE_COUNT; i++) if (jugable(s, i)) cuenta[s.height[i]]++;
  let ganado = false;
  for (let h = CERA; h <= MAX_LEVEL; h++) if (cuenta[h] >= umbralItem(s, h)) ganado = true;
  if (!ganado) return null;

  const tipo = elegir(s, itemsUtiles(s));
  const cand = [];
  for (let i = 0; i < TILE_COUNT; i++) if (jugable(s, i)) cand.push(i);
  const tile = elegir(s, cand);
  if (tipo === undefined || tile === undefined) return null;

  s.item = { tile, tipo, caduca: s.turn + ITEM_TURNOS };
  s.itemCalma = s.turn + ITEM_CALMA;
  s.eventos.push({ type: 'item', tipo, tile, caduca: s.item.caduca });
  return s.item;
}

// Nunca se ofrece un ítem que no serviría (el original: isItemRaiseLandPossible…).
function itemsUtiles(s) {
  const cfg = CONFIG_MODO[s.modo];
  const out = [ITEMS.DANZA, ITEMS.REINA];
  let agua = 0, haySubible = false;
  for (let i = 0; i < TILE_COUNT; i++) {
    if (s.roto[i]) continue;
    if (s.height[i] === AGUA) agua++;
    else if (s.height[i] < MAX_LEVEL) haySubible = true;
  }
  if (haySubible) out.push(ITEMS.JALEA);
  // El propóleo ya puede salir en Invierno: sube el agua a cera, que el jugador
  // puede hacer a mano de todas formas, y NO resucita celdas rotas. Deja de ser
  // el atajo que hacía infinita la partida (v2); ahora sólo ahorra turnos.
  // No basta con que haya agua: tiene que haber la suficiente para que subirla
  // sea un premio y no algo que el jugador haría a mano en un turno (CR-01).
  if (agua >= PROPOLEO_MIN_AGUA) out.push(ITEMS.PROPOLEO);
  if (cfg.reloj) out.push(ITEMS.NECTAR);
  // El humo vuelve en la v5 (T-21). Estuvo fuera desde la v3 porque deshacía la
  // helada y la celda rota había pasado a ser permanente. Vuelve porque Invierno
  // se había quedado sin NINGUNA respuesta del jugador contra la helada: era una
  // cuenta atrás y nada más. Devuelve la celda como AGUA — recuperas el suelo,
  // no el trabajo — y sólo una, la última que se rompió.
  // Medido con el bot ya recogiendo ítems (v5): Invierno normal 109 → 121 turnos
  // y dura 55 → 58, con TODAS las partidas terminando. No es el agujero que fue
  // el propóleo en la v2.
  if (cfg.helada && s.heladas.some(t => s.roto[t])) out.push(ITEMS.HUMO);
  return out;
}

// Se usan al recogerlos, sin inventario. La reina ya ha hecho su trabajo en la
// propia cadena que la ha recogido.
function usarItem(s, tipo) {
  switch (tipo) {
    case ITEMS.JALEA:
      for (let i = 0; i < TILE_COUNT; i++)
        // "Raise all land tiles": sube la tierra, no el agua.
        if (!s.roto[i] && s.height[i] >= CERA && s.height[i] < MAX_LEVEL) s.height[i]++;
      break;
    case ITEMS.PROPOLEO:
      // "Raise all water tiles": el agua sube a cera. Las rotas no vuelven.
      for (let i = 0; i < TILE_COUNT; i++) if (!s.roto[i] && s.height[i] === AGUA) s.height[i] = CERA;
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
  return 1 + RELOJ_ACELERA[s.dificultad] * Math.floor(s.turn / RELOJ_ACELERA_CADA);
}

// Hace correr el reloj `dt` segundos reales. La interfaz lo llama cada fotograma
// y el bot una vez por turno.
function tick(s, dt) {
  // `arrancado` lo pone el primer commitTurn (v5, T-10): antes el reloj se comía
  // los segundos que tardabas en mirar el tablero recién cargado.
  if (s.gameOver || !CONFIG_MODO[s.modo].reloj || !s.arrancado) return;
  s.reloj -= dt * velocidadReloj(s);
  if (s.reloj <= 0) { s.reloj = 0; s.gameOver = true; }
}
