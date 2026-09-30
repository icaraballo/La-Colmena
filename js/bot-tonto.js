// El bot tonto: el jugador que usa el panal vivo de la pantalla de inicio (v9, T-40).
//
// Vive en js/ y no en tests/ porque el navegador lo necesita: el panal del
// fondo es una partida de verdad y sus jugadas las elige este bot, no código de
// la interfaz (regla 8). tests/bot.js lo carga desde el bundle y monta encima
// los otros cuatro jugadores.
//
// ES LA LÍNEA DE REFERENCIA DE TODAS LAS MEDICIONES (Balance-y-Mediciones): no
// se toca sin medir. Al moverlo aquí, `npm run bot` tenía que dar exactamente lo
// mismo que antes, semilla a semilla, y lo dio.
//
// Por qué lleva su propio RNG: lo que varía entre partidas son las decisiones
// del JUGADOR, no las del motor. Lo aleatorio es el orden en que el bot considera
// las jugadas; cada semilla es un jugador distinto con el mismo criterio (la
// explicación larga está en tests/bot.js).

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
  const reina = (s.item && s.item.tipo === ITEMS.REINA && jugable(s, s.item.tile))
    ? s.item.tile : -1;
  // Una celda sirve al nivel h si está a ese nivel, o si es la reina.
  const de = (i, h) => jugable(s, i) && (s.height[i] === h || i === reina);

  // Niveles que hay que probar y desde dónde empezar el flood-fill.
  let inicios = [];
  if (forzar !== undefined) {
    if (!jugable(s, forzar)) return null;
    inicios = [forzar];
  } else {
    for (let i = 0; i < s.height.length; i++) if (jugable(s, i)) inicios.push(i);
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
      ? [...new Set([s.height[inicio], ...vecinas(s, inicio).filter(v => jugable(s, v)).map(v => s.height[v])])]
      : [s.height[inicio]];
    for (const h of shuffled(niveles, R)) {
      if (nivelPreferido !== undefined && h !== nivelPreferido) continue;
      const visto = new Uint8Array(s.height.length); visto[inicio] = 1;
      const conjunto = [inicio], cola = [inicio];
      while (cola.length && conjunto.length < L) {
        const u = cola.shift();
        for (const v of shuffled(vecinas(s, u), R)) {
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
  return (it !== undefined && buscarJugada(s, s.step, MAX_LEVEL, R, it))
      || buscarJugada(s, s.step, MAX_LEVEL, R)
      || (it !== undefined && buscarJugada(s, s.step, undefined, R, it))
      || buscarJugada(s, s.step, undefined, R)
      || null;
}
