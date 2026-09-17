// Bot de simulación. `npm run bot [partidas]`
//
// No es una IA: juega con una heurística tonta (cosechar si puede, si no la
// meseta más grande) y sirve para una sola cosa, que es la importante: ver la
// distribución de turnos supervivientes sin jugar mil partidas a mano. Si el
// 80% se muere antes del turno 15, el paso crece demasiado rápido. Eso son
// treinta segundos de dato real en vez de tres tardes de intuición.
const T = require('./_bundle.js');

// Camino simple de longitud L dentro de una meseta homogénea. DFS con
// backtracking: con 24 nodos es instantáneo y no hace falta nada más listo.
function findPath(s, L, preferLevel) {
  const order = [];
  for (let i = 0; i < T.TILE_COUNT; i++) {
    if (!s.alive[i] || s.height[i] < T.BASE_LEVEL) continue;
    if (preferLevel !== undefined && s.height[i] !== preferLevel) continue;
    order.push(i);
  }

  const path = [];
  const used = new Uint8Array(T.TILE_COUNT);
  function dfs(u, h) {
    path.push(u); used[u] = 1;
    if (path.length === L) return true;
    for (const v of T.ADJ[u])
      if (!used[v] && s.alive[v] && s.height[v] === h && dfs(v, h)) return true;
    path.pop(); used[u] = 0;
    return false;
  }

  for (const start of order) {
    if (dfs(start, s.height[start])) return path.slice();
    path.length = 0; used.fill(0);
  }
  return null;
}

function playOne() {
  const s = T.createState();
  let guard = 0;
  s.maxStep = 0; s.harvests = 0; s.fails = 0;
  while (!s.gameOver && guard++ < 5000) {
    if (s.step > s.maxStep) s.maxStep = s.step;
    // Cosechar tiene prioridad: es lo que devuelve terreno llano al tablero.
    let path = findPath(s, s.step, T.MAX_LEVEL) || findPath(s, s.step);
    if (!path) { s.fails++; T.fallback(s); continue; }
    const wasHarvest = s.height[path[0]] === T.MAX_LEVEL;
    const before = s.step;
    if (!T.commitTurn(s, path)) { s.fails++; T.fallback(s); continue; }
    if (wasHarvest) s.harvests++;
    if (s.step === 1 && before > 1) s.fails++;
  }
  return s;
}

const N = Number(process.argv[2]) || 1000;
const turnos = [], puntos = [], maxPaso = [], cosechas = [], fallos = [];
for (let n = 0; n < N; n++) {
  const s = playOne();
  turnos.push(s.turn); puntos.push(s.score);
  maxPaso.push(s.maxStep); cosechas.push(s.harvests); fallos.push(s.fails);
}

const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
const media = a => a.reduce((x, y) => x + y, 0) / a.length;

console.log(`${N} partidas · heurística: cosechar, si no la meseta mayor\n`);
console.log(`turnos   media ${media(turnos).toFixed(1)}   p10 ${pct(turnos, .10)}   mediana ${pct(turnos, .50)}   p90 ${pct(turnos, .90)}   máx ${Math.max(...turnos)}`);
console.log(`puntos   media ${Math.round(media(puntos)).toLocaleString('es-ES')}   mediana ${pct(puntos, .50).toLocaleString('es-ES')}   máx ${Math.max(...puntos).toLocaleString('es-ES')}`);
console.log(`paso máximo alcanzado   media ${media(maxPaso).toFixed(1)}   máx ${Math.max(...maxPaso)}`);
console.log(`cosechas por partida    media ${media(cosechas).toFixed(1)}`);
console.log(`fallos (vórtice come)   media ${media(fallos).toFixed(1)}`);

// Histograma de supervivencia por tramos de 10 turnos.
console.log('\nsupervivencia');
const max = Math.max(...turnos);
for (let lo = 0; lo <= max; lo += 10) {
  const n = turnos.filter(t => t >= lo && t < lo + 10).length;
  if (!n) continue;
  console.log(`  ${String(lo).padStart(3)}-${String(lo + 9).padEnd(3)} ${'#'.repeat(Math.round(n / N * 60)).padEnd(60)} ${(n / N * 100).toFixed(1)}%`);
}
