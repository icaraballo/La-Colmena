// Estado del juego y reglas. NO hay una sola referencia a canvas, DOM ni sprites
// en este fichero, y no debe haberla nunca: el estado es un objeto plano y
// serializable, y las reglas son funciones que lo transforman.
//
// Eso da tres cosas gratis: tests unitarios de las reglas, deshacer/rehacer, y
// poder simular miles de partidas con un bot para ajustar la dificultad con
// datos en vez de por intuición. Esa última es la que de verdad importa.

function createState() {
  return {
    // --- tablero ---
    height: new Uint8Array(TILE_COUNT).fill(BASE_LEVEL),
    alive:  new Uint8Array(TILE_COUNT).fill(1),

    // --- progresión del turno ---
    step:   1,   // longitud exigida este turno: exactamente esta, ni más ni menos
    streak: 0,   // cosechas encadenadas sin fallo en medio
    score:  0,
    turn:   0,

    // --- vórtice ---
    vortexIdx: 0,
    gameOver:  false,

    // Último suceso, sólo para que la interfaz pueda dar feedback.
    last: null,
  };
}

// ---------------------------------------------------------------------------
// (a) Validar un arrastre
// ---------------------------------------------------------------------------
// La cadena debe ser contigua en el grafo, homogénea en altura, viva, sin
// casillas repetidas y de longitud EXACTAMENTE step (igualdad, no "al menos":
// si el paso pide 5, exactamente 5).
//
// Nótese que el nivel 6 SÍ es un arrastre válido: es la cosecha. El original
// lo dice en su propio tutorial ("desliza sobre cohetes terminados para
// lanzarlos"), y es lo que devuelve terreno llano al tablero.
function isValidDrag(s, path) {
  if (s.gameOver) return false;
  if (path.length !== s.step) return false;
  if (new Set(path).size !== path.length) return false;

  const h = s.height[path[0]];
  if (h < BASE_LEVEL) return false;                       // casilla muerta

  for (const i of path) {
    if (i < 0 || i >= TILE_COUNT) return false;
    if (!s.alive[i]) return false;
    if (s.height[i] !== h) return false;                  // homogeneidad
  }
  for (let k = 1; k < path.length; k++)
    if (!ADJ[path[k - 1]].includes(path[k])) return false; // contigüidad

  return true;
}

// ---------------------------------------------------------------------------
// (b) Mayor región homogénea
// ---------------------------------------------------------------------------
// Decide si el jugador sigue vivo: si la mayor meseta contigua del tablero es
// menor que el paso exigido, no hay jugada posible.
//
// Devuelve el tamaño de la COMPONENTE CONEXA, no la longitud del camino simple
// más largo dentro de ella. No es lo mismo: una región de 6 casillas en estrella
// puede no admitir un camino de 6 sin repetir. El original hace justo esto, así
// que es ligeramente permisivo — te deja seguir en posiciones donde quizá no
// haya camino válido. Se mantiene a propósito: es más rápido, más indulgente y
// el jugador no nota la diferencia.
//
// Las mesetas de nivel máximo cuentan, porque cosecharlas es una jugada legal.
function biggestCoherentArea(s) {
  const seen = new Uint8Array(TILE_COUNT);
  let best = 0;
  for (let start = 0; start < TILE_COUNT; start++) {
    if (seen[start] || !s.alive[start] || s.height[start] < BASE_LEVEL) continue;
    const h = s.height[start];
    const stack = [start]; seen[start] = 1; let size = 0;
    while (stack.length) {
      const u = stack.pop(); size++;
      for (const v of ADJ[u])
        if (!seen[v] && s.alive[v] && s.height[v] === h) { seen[v] = 1; stack.push(v); }
    }
    if (size > best) best = size;
  }
  return best;
}

// ---------------------------------------------------------------------------
// (c) Cometer el turno
// ---------------------------------------------------------------------------
// Una jugada inválida no se comete y NO gasta turno: el jugador simplemente
// levanta el dedo y vuelve a intentarlo.
function commitTurn(s, path) {
  if (!isValidDrag(s, path)) return false;

  const L = path.length;
  const h = s.height[path[0]];
  const harvest = (h === MAX_LEVEL);

  if (harvest) {
    // La cosecha es la válvula de escape del juego: devuelve al tablero una
    // meseta llana de exactamente L casillas, que es justo el tamaño que
    // acabas de necesitar. Sin ella, el nivel máximo se acumula como agujeros
    // muertos que fragmentan el tablero para siempre.
    for (const i of path) s.height[i] = BASE_LEVEL;
    s.score += Math.round(10 * L * L * bonusMultiplier(L) * (1 + s.streak));
    s.streak++;
  } else {
    for (const i of path) s.height[i] = h + 1;
    s.score += 10 * L * L * bonusMultiplier(L);
  }

  s.turn++;
  s.step = L + 1;
  s.last = { type: harvest ? 'harvest' : 'raise', path: path.slice(), level: h };

  // ¿Cabe el siguiente paso en algún sitio del tablero?
  if (biggestCoherentArea(s) < s.step) fallback(s);

  return true;
}

// El paso vuelve a 1, la racha se pierde y el vórtice devora una casilla
// siguiendo la espiral de fuera hacia dentro. Sin casillas, se acabó.
function fallback(s) {
  s.step = 1;
  s.streak = 0;

  // El vórtice devora casillas VIVAS: si la siguiente de la espiral ya cayó por
  // otra vía, se salta. Hoy no puede pasar porque el vórtice es lo único que
  // mata casillas, pero en cuanto haya desastres sí, y sería un fallo mudo.
  while (s.vortexIdx < TILE_COUNT && !s.alive[SPIRAL[s.vortexIdx]]) s.vortexIdx++;

  let eaten;
  if (s.vortexIdx < TILE_COUNT) {
    eaten = SPIRAL[s.vortexIdx];
    s.alive[eaten] = 0;
    s.height[eaten] = DEAD_LEVEL;
    s.vortexIdx++;
  }
  s.last = { type: 'fallback', eaten };

  if (tilesAlive(s) === 0) s.gameOver = true;
}

// Cuántas casillas siguen en juego. Sólo para la interfaz.
function tilesAlive(s) {
  let n = 0;
  for (let i = 0; i < TILE_COUNT; i++) if (s.alive[i]) n++;
  return n;
}
